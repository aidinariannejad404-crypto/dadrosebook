/**
 * DOM helpers for the EPUB reader. Offsets are UTF-16 indices into `root.textContent` of the element
 * the chapter html was inserted into (docs/api-contract.md «Phase 6», «Text offsets»).
 * <mark> wrapping only splits/wraps text nodes, so textContent — and every offset — is unchanged.
 */

const DROP = "script,style,iframe,frame,object,embed,form,input,button,textarea,select,link,meta,base,svg,math";

/**
 * Chapter html (already sanitized by the server) → inert fragment, with a second defensive pass:
 * drop active elements, on* handlers and non-http(s)/non-internal links, then make images
 * non-draggable and external links open in a new tab. Parsed in a <template> so nothing loads or
 * runs before the pass.
 */
export function chapterFragment(html: string): DocumentFragment {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const frag = tpl.content;
  frag.querySelectorAll(DROP).forEach((el) => el.remove());
  frag.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "style" || name === "srcset" || name === "srcdoc") el.removeAttribute(attr.name);
    }
  });
  frag.querySelectorAll("a").forEach((a) => {
    const href = a.getAttribute("href") ?? "";
    if (href.startsWith("#epub:")) {
      a.removeAttribute("target");
      return;
    }
    if (/^https?:\/\//i.test(href)) {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer nofollow");
      return;
    }
    a.removeAttribute("href");
  });
  frag.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    // server-signed relative URLs, https, or (offline packages) inlined raster/SVG images
    const inline = /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);base64,/i.test(src);
    if (!inline && (!/^(\/|https:\/\/)/.test(src) || src.startsWith("//"))) img.removeAttribute("src");
    img.setAttribute("draggable", "false");
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
  });
  return frag;
}

function textNodes(root: Node): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

/** Text offset of a DOM boundary point (node, offset) inside root; -1 when outside. */
export function textOffsetOf(root: Node, node: Node, offset: number): number {
  if (!root.contains(node)) return -1;
  const r = document.createRange();
  r.setStart(root, 0);
  r.setEnd(node, offset);
  return r.toString().length;
}

/** Boundary point at a text offset (clamped to the text). */
export function pointAtOffset(root: Node, offset: number): { node: Node; offset: number } {
  const nodes = textNodes(root);
  let acc = 0;
  for (const t of nodes) {
    const len = t.data.length;
    if (offset <= acc + len) return { node: t, offset: Math.max(0, offset - acc) };
    acc += len;
  }
  const last = nodes[nodes.length - 1];
  return last ? { node: last, offset: last.data.length } : { node: root, offset: 0 };
}

export function rangeForOffsets(root: Node, start: number, end: number): Range {
  const a = pointAtOffset(root, start);
  const b = pointAtOffset(root, Math.max(start, end));
  const r = document.createRange();
  r.setStart(a.node, a.offset);
  r.setEnd(b.node, b.offset);
  return r;
}

const NO_TEXT_PARENTS = new Set(["TABLE", "THEAD", "TBODY", "TFOOT", "TR", "UL", "OL", "DL", "COLGROUP"]);

/** Wrap the text in [start, end) with elements made by `make` (one per text node piece). */
export function wrapOffsets(root: HTMLElement, start: number, end: number, make: () => HTMLElement): HTMLElement[] {
  if (end <= start) return [];
  const pieces: { node: Text; from: number; to: number }[] = [];
  let acc = 0;
  for (const t of textNodes(root)) {
    const len = t.data.length;
    const s = Math.max(start, acc);
    const e = Math.min(end, acc + len);
    if (e > s && !(t.parentElement && NO_TEXT_PARENTS.has(t.parentElement.tagName))) {
      pieces.push({ node: t, from: s - acc, to: e - acc });
    }
    acc += len;
    if (acc >= end) break;
  }
  const out: HTMLElement[] = [];
  for (const p of pieces) {
    let node = p.node;
    if (p.from > 0) node = node.splitText(p.from);
    if (p.to - p.from < node.data.length) node.splitText(p.to - p.from);
    const el = make();
    node.parentNode?.insertBefore(el, node);
    el.appendChild(node);
    out.push(el);
  }
  return out;
}

/** Remove every element matching `selector` that we added, keeping its text. */
export function unwrapAll(root: HTMLElement, selector: string): void {
  const els = root.querySelectorAll(selector);
  if (!els.length) return;
  els.forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });
  root.normalize();
}

function nodeRect(t: Text): DOMRect | null {
  const r = document.createRange();
  r.selectNodeContents(t);
  const rect = r.getBoundingClientRect();
  return rect.width === 0 && rect.height === 0 ? null : rect;
}

/**
 * Offset of the first text visible below `top` (a client y): binary search over text nodes (in
 * document order their boxes go down the page), then over characters inside the node.
 */
export function firstVisibleOffset(root: HTMLElement, top: number): number {
  const nodes = textNodes(root).filter((t) => t.data.trim() !== "");
  if (!nodes.length) return 0;
  let lo = 0;
  let hi = nodes.length - 1;
  let found = nodes.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const rect = nodeRect(nodes[mid]!);
    if (rect && rect.bottom > top) {
      found = mid;
      hi = mid - 1;
    } else lo = mid + 1;
  }
  const node = nodes[found]!;
  // first character of that node whose line is visible
  let a = 0;
  let b = node.data.length - 1;
  let at = 0;
  const r = document.createRange();
  while (a <= b) {
    const mid = (a + b) >> 1;
    r.setStart(node, mid);
    r.setEnd(node, mid + 1);
    const rect = r.getBoundingClientRect();
    if (rect.bottom > top) {
      at = mid;
      b = mid - 1;
    } else a = mid + 1;
  }
  return Math.max(0, textOffsetOf(root, node, at));
}

/** Scroll `scroller` so the text at `offset` sits at its top (with a small margin). */
export function scrollToOffset(scroller: HTMLElement, root: HTMLElement, offset: number, margin = 12): void {
  if (offset <= 0) {
    scroller.scrollTop = 0;
    return;
  }
  const p = pointAtOffset(root, offset);
  const r = document.createRange();
  r.setStart(p.node, p.offset);
  const len = p.node.nodeType === Node.TEXT_NODE ? (p.node as Text).data.length : 0;
  r.setEnd(p.node, Math.min(len, p.offset + 1));
  let rect = r.getBoundingClientRect();
  if (rect.height === 0 && p.node.parentElement) rect = p.node.parentElement.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  scroller.scrollTop += rect.top - box.top - margin;
}

/** Scroll an element (anchor target) to the top of the scroller. */
export function scrollToElement(scroller: HTMLElement, el: Element, margin = 12): void {
  const box = scroller.getBoundingClientRect();
  scroller.scrollTop += el.getBoundingClientRect().top - box.top - margin;
}

/** Tiled watermark as an SVG data URI (faint, rotated, repeated by CSS background). */
export function watermarkTile(text: string, fill: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">` +
    `<text x="160" y="100" text-anchor="middle" dominant-baseline="middle" direction="ltr" ` +
    `transform="rotate(-30 160 100)" font-family="Vazirmatn, Tahoma, sans-serif" font-size="15" font-weight="600" fill="${fill}">${esc}</text></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

/* ---------- paginated mode (CSS multi-column) ---------- */

export interface ColumnFrame {
  /** client box of the multicol element (one column wide) */
  left: number;
  right: number;
  /** column width + gap */
  stride: number;
  rtl: boolean;
}

/** Column of a client rect relative to the visible one (0 = on screen, 1 = next, −1 = previous). */
export function rectColumn(rect: { left: number; width: number }, f: ColumnFrame): number {
  if (!(f.stride > 0)) return 0;
  const cx = rect.left + rect.width / 2;
  return Math.floor((f.rtl ? f.right - cx : cx - f.left) / f.stride);
}

function charRect(node: Text, i: number, r: Range): DOMRect {
  r.setStart(node, i);
  r.setEnd(node, Math.min(node.data.length, i + 1));
  return r.getBoundingClientRect();
}

const isEmptyRect = (rect: DOMRect) => rect.width === 0 && rect.height === 0;

/**
 * Offset of the first text in the visible column (or a later one): binary search over text nodes
 * by their last visible character, then over the characters of that node. Document order runs
 * through the columns in order, so "column ≥ visible" is monotonic.
 */
export function firstOffsetInColumn(root: HTMLElement, f: ColumnFrame): number {
  const nodes = textNodes(root).filter((t) => t.data.trim() !== "");
  if (!nodes.length) return 0;
  const r = document.createRange();
  const reaches = (t: Text) => {
    const last = t.data.trimEnd().length - 1;
    const rect = charRect(t, Math.max(0, last), r);
    return !isEmptyRect(rect) && rectColumn(rect, f) >= 0;
  };
  let lo = 0;
  let hi = nodes.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (reaches(nodes[mid]!)) {
      found = mid;
      hi = mid - 1;
    } else lo = mid + 1;
  }
  if (found < 0) return Math.max(0, (root.textContent ?? "").length - 1);
  const node = nodes[found]!;
  let a = 0;
  let b = node.data.length - 1;
  let at = 0;
  while (a <= b) {
    const mid = (a + b) >> 1;
    const rect = charRect(node, mid, r);
    if (!isEmptyRect(rect) && rectColumn(rect, f) >= 0) {
      at = mid;
      b = mid - 1;
    } else a = mid + 1;
  }
  return Math.max(0, textOffsetOf(root, node, at));
}

/** Relative column holding the text at `offset` (0 when it cannot be measured). */
export function columnOfOffset(root: HTMLElement, offset: number, f: ColumnFrame): number {
  const p = pointAtOffset(root, offset);
  if (p.node.nodeType !== Node.TEXT_NODE) return 0;
  const t = p.node as Text;
  const r = document.createRange();
  // the character at the offset (or the one before it at the very end of a node)
  const i = p.offset < t.data.length ? p.offset : Math.max(0, p.offset - 1);
  let rect = charRect(t, i, r);
  if (isEmptyRect(rect) && t.parentElement) rect = t.parentElement.getClientRects()[0] ?? rect;
  return isEmptyRect(rect) ? 0 : rectColumn(rect, f);
}

/** Relative column of an element's first box (TOC / link anchors). */
export function columnOfElement(el: Element, f: ColumnFrame): number {
  const rect = el.getClientRects()[0] ?? el.getBoundingClientRect();
  return rectColumn(rect, f);
}
