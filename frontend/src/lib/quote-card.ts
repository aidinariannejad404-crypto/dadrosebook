/**
 * و۲ — «اشتراک به‌صورت تصویر»: a 1080×1350 quote card drawn in the browser (canvas), for Instagram
 * stories and Telegram study groups. Text is at most QUOTE_MAX characters and the characters are
 * spent from the book's copy quota (POST /library/<slug>/copies/) before the card is drawn.
 *
 * Layout helpers are pure (tested with a fake `measure`); drawing reads brand colours from the CSS
 * tokens (tokens.css) and the self-hosted Vazirmatn family from `--font-vazirmatn`.
 */

export const QUOTE_MAX = 300;
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;
/** Font sizes tried from largest to smallest until the quote fits. */
export const QUOTE_SIZES = [64, 58, 52, 46, 42, 38] as const;
export const QUOTE_LINE_HEIGHT = 1.75;

/** Whitespace squashed; cut to `max` characters at a word boundary with «…». */
export function clampQuote(text: string, max = QUOTE_MAX): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export type Measure = (text: string, fontSize: number) => number;

/** Greedy word wrap (ZWNJ stays inside words); a word wider than the line is split by characters. */
export function wrapText(text: string, maxWidth: number, fontSize: number, measure: Measure): string[] {
  const words = text.split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const push = (word: string) => {
    // split an over-long word
    let rest = word;
    while (measure(rest, fontSize) > maxWidth && rest.length > 1) {
      let n = rest.length - 1;
      while (n > 1 && measure(rest.slice(0, n), fontSize) > maxWidth) n--;
      lines.push(rest.slice(0, n));
      rest = rest.slice(n);
    }
    return rest;
  };
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate, fontSize) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = push(word);
  }
  if (line) lines.push(line);
  return lines;
}

export interface QuoteLayout {
  fontSize: number;
  lines: string[];
  /** the text had to be cut to fit (the last line ends with «…») */
  truncated: boolean;
}

/**
 * The largest size from `sizes` at which the quote fits in `maxLines` lines of `maxWidth`; when even
 * the smallest does not fit, its first `maxLines` lines with «…» on the last one.
 */
export function layoutQuote(
  text: string,
  { maxWidth, maxHeight, measure, sizes = QUOTE_SIZES }: { maxWidth: number; maxHeight: number; measure: Measure; sizes?: readonly number[] },
): QuoteLayout {
  const quote = clampQuote(text);
  for (const size of sizes) {
    const lines = wrapText(quote, maxWidth, size, measure);
    if (lines.length * size * QUOTE_LINE_HEIGHT <= maxHeight) return { fontSize: size, lines, truncated: false };
  }
  const size = sizes[sizes.length - 1] ?? 38;
  const maxLines = Math.max(1, Math.floor(maxHeight / (size * QUOTE_LINE_HEIGHT)));
  const lines = wrapText(quote, maxWidth, size, measure).slice(0, maxLines);
  let last = lines[lines.length - 1] ?? "";
  while (last && measure(`${last}…`, size) > maxWidth) last = last.slice(0, -1);
  lines[lines.length - 1] = `${last.trimEnd()}…`;
  return { fontSize: size, lines, truncated: true };
}

/** «نام کتاب — نویسنده» on one line, cut to fit. */
export function fitLine(text: string, maxWidth: number, fontSize: number, measure: Measure): string {
  if (measure(text, fontSize) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && measure(`${cut}…`, fontSize) > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** Host shown on the card («dadrosebook.com»), from the site URL. */
export function shortHost(siteUrl: string): string {
  try {
    return new URL(siteUrl).host.replace(/^www\./, "");
  } catch {
    return siteUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

export function cardFileName(slug: string): string {
  return `نقل-قول-${slug}.png`.replace(/[\\/\u0000-\u001f]/g, "");
}

/* ---------- drawing (browser only) ---------- */

export interface QuoteCardInput {
  quote: string;
  title: string;
  authors: string[];
  /** cover image URL (same-origin or CORS-enabled); null → a drawn subject-colour cover */
  cover: string | null;
  /** subject colour for the drawn cover (Subject.color) */
  coverColor?: string | null;
  siteUrl: string;
  /** «کتاب دادرُز» */
  brand: string;
}

function token(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw the card; resolves to a PNG blob. `withCover: false` redraws without a (tainting) image. */
export async function renderQuoteCard(input: QuoteCardInput, { withCover = true } = {}): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  const family = token("--font-vazirmatn", "") || "Vazirmatn";
  const font = (weight: number, size: number) => `${weight} ${size}px ${family}, Tahoma, sans-serif`;
  try {
    await Promise.all([document.fonts?.load(font(700, 48)), document.fonts?.load(font(400, 48))]);
  } catch {
    /* system font fallback */
  }
  const primary = token("--color-primary", "navy");
  const accent = token("--color-accent", "goldenrod");
  const paper = token("--color-surface", "white");
  const ink = token("--color-text", "black");
  const bg = token("--color-bg", "white");

  // background
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, CARD_WIDTH, 14);

  ctx.direction = "rtl";
  ctx.textBaseline = "alphabetic";
  const pad = 84;

  // brand (top, inline-start = right in RTL)
  ctx.font = font(800, 40);
  ctx.fillStyle = accent;
  ctx.textAlign = "right";
  ctx.fillText(input.brand, CARD_WIDTH - pad, 120);

  // quote panel
  const panel = { x: pad - 20, y: 180, w: CARD_WIDTH - (pad - 20) * 2, h: 820 };
  ctx.fillStyle = paper;
  roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 36);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.font = font(900, 180);
  ctx.textAlign = "right";
  ctx.fillText("«", panel.x + panel.w - 40, panel.y + 170);

  const measure: Measure = (text, size) => {
    ctx.font = font(500, size);
    return ctx.measureText(text).width;
  };
  const textBox = { x: panel.x + 64, w: panel.w - 128, top: panel.y + 200, h: panel.h - 260 };
  const layout = layoutQuote(input.quote, { maxWidth: textBox.w, maxHeight: textBox.h, measure });
  ctx.font = font(500, layout.fontSize);
  ctx.fillStyle = ink;
  ctx.textAlign = "right";
  const lineH = layout.fontSize * QUOTE_LINE_HEIGHT;
  const blockH = layout.lines.length * lineH;
  let y = textBox.top + Math.max(0, (textBox.h - blockH) / 2) + layout.fontSize;
  for (const line of layout.lines) {
    ctx.fillText(line, textBox.x + textBox.w, y);
    y += lineH;
  }

  // book: cover thumbnail + title/authors
  const cover = { w: 150, h: 212, x: CARD_WIDTH - pad - 150, y: 1060 };
  let drewImage = false;
  if (withCover && input.cover) {
    const img = await loadImage(input.cover);
    if (img) {
      ctx.save();
      roundRect(ctx, cover.x, cover.y, cover.w, cover.h, 12);
      ctx.clip();
      ctx.drawImage(img, cover.x, cover.y, cover.w, cover.h);
      ctx.restore();
      drewImage = true;
    }
  }
  if (!drewImage) {
    ctx.fillStyle = input.coverColor || bg;
    roundRect(ctx, cover.x, cover.y, cover.w, cover.h, 12);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillRect(cover.x + cover.w - 16, cover.y, 16, cover.h);
    ctx.fillStyle = input.coverColor ? paper : ink;
    ctx.font = font(700, 22);
    const lines = wrapText(input.title, cover.w - 40, 22, (t, s) => {
      ctx.font = font(700, s);
      return ctx.measureText(t).width;
    }).slice(0, 5);
    ctx.font = font(700, 22);
    lines.forEach((l, i) => ctx.fillText(l, cover.x + cover.w - 26, cover.y + 48 + i * 34));
  }
  const infoRight = cover.x - 36;
  const infoWidth = infoRight - pad;
  ctx.textAlign = "right";
  ctx.fillStyle = paper;
  const titleSize = 40;
  ctx.font = font(800, titleSize);
  const titleLine = fitLine(input.title, infoWidth, titleSize, (t, s) => {
    ctx.font = font(800, s);
    return ctx.measureText(t).width;
  });
  ctx.font = font(800, titleSize);
  ctx.fillText(titleLine, infoRight, cover.y + 70);
  if (input.authors.length) {
    ctx.font = font(400, 30);
    const authors = fitLine(input.authors.join("، "), infoWidth, 30, (t, s) => {
      ctx.font = font(400, s);
      return ctx.measureText(t).width;
    });
    ctx.font = font(400, 30);
    ctx.fillText(authors, infoRight, cover.y + 124);
  }
  ctx.fillStyle = accent;
  ctx.font = font(700, 30);
  ctx.direction = "ltr";
  ctx.textAlign = "right";
  ctx.fillText(shortHost(input.siteUrl), infoRight, cover.y + cover.h - 8);

  try {
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"),
    );
  } catch (err) {
    // a cover without CORS headers taints the canvas: draw again with the subject-colour cover
    if (withCover && drewImage) return renderQuoteCard(input, { withCover: false });
    throw err;
  }
}

/** navigator.share with the PNG when the device can share files; otherwise a download. */
export async function shareOrDownload(
  blob: Blob,
  { filename, title, text, url }: { filename: string; title: string; text: string; url: string },
): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = typeof File !== "undefined" ? new File([blob], filename, { type: "image/png" }) : null;
  const nav = typeof navigator !== "undefined" ? navigator : null;
  if (file && nav?.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title, text: `${text}\n${url}` });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    }
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
  return "downloaded";
}
