/**
 * PF-6: reader font family and «ارقام فارسی» toggle, saved next to the reader theme
 * (localStorage, per device). Fonts: self-hosted Vazirmatn (OFL, already in the bundle) and a
 * system Naskh stack — no new font files are shipped (see docs for licensed additions).
 */

export type ReaderFont = "vazirmatn" | "naskh" | "system";

export interface ReaderTypography {
  font: ReaderFont;
  persianDigits: boolean;
}

export const READER_FONTS: { value: ReaderFont; label: string; family: string; sample: string }[] = [
  {
    value: "vazirmatn",
    label: "وزیرمتن",
    family: "var(--font-vazirmatn), Vazirmatn, Tahoma, sans-serif",
    sample: "قلم پیش‌فرض، خوانا در اندازه‌های کوچک",
  },
  {
    value: "naskh",
    label: "نسخ",
    family:
      '"Noto Naskh Arabic", "Noto Naskh Arabic UI", "Geeza Pro", "Traditional Arabic", "Times New Roman", serif',
    sample: "حال‌وهوای کتاب چاپی (قلم نسخ دستگاه شما)",
  },
  {
    value: "system",
    label: "قلم دستگاه",
    family: 'Tahoma, "Segoe UI", system-ui, sans-serif',
    sample: "قلم پیش‌فرض گوشی یا رایانه",
  },
];

export const READER_TYPOGRAPHY_KEY = "dadrose.reader.typography";
export const DEFAULT_READER_TYPOGRAPHY: ReaderTypography = { font: "vazirmatn", persianDigits: false };

export function sanitizeTypography(raw: unknown): ReaderTypography {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const font = READER_FONTS.some((f) => f.value === o.font) ? (o.font as ReaderFont) : DEFAULT_READER_TYPOGRAPHY.font;
  return { font, persianDigits: o.persianDigits === true };
}

export function loadReaderTypography(): ReaderTypography {
  try {
    const raw = window.localStorage.getItem(READER_TYPOGRAPHY_KEY);
    return raw ? sanitizeTypography(JSON.parse(raw)) : DEFAULT_READER_TYPOGRAPHY;
  } catch {
    return DEFAULT_READER_TYPOGRAPHY;
  }
}

export function saveReaderTypography(t: ReaderTypography): void {
  try {
    window.localStorage.setItem(READER_TYPOGRAPHY_KEY, JSON.stringify(t));
  } catch {
    /* storage unavailable: lasts for this visit */
  }
}

export function fontFamilyFor(font: ReaderFont): string {
  return (READER_FONTS.find((f) => f.value === font) ?? READER_FONTS[0])?.family ?? "inherit";
}

const ASCII_TO_FA = "۰۱۲۳۴۵۶۷۸۹";

/** ASCII digits → Persian digits; one UTF-16 unit each, so text offsets stay valid. */
export function persianDigitsText(text: string): string {
  return text.replace(/[0-9]/g, (d) => ASCII_TO_FA[Number(d)] ?? d);
}

/** Minimal DOM shape so the walker is testable without a browser. */
export interface TextLike {
  nodeType: number;
  nodeValue: string | null;
  childNodes?: ArrayLike<TextLike>;
  nodeName?: string;
}

/** Text node → its text before `persianizeDigits` (to switch the toggle back off). */
export type DigitOriginals = Map<TextLike, string>;

const SKIP = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "KBD", "SAMP"]);

/**
 * Replace ASCII digits in every text node under `root` (skipping code blocks).
 * Returns the number of text nodes changed. Display only: the book file is untouched and
 * offsets do not move, so highlights and the copy quota keep working.
 */
export function persianizeDigits(root: TextLike | null | undefined, originals?: Map<TextLike, string>): number {
  if (!root) return 0;
  let changed = 0;
  const walk = (node: TextLike) => {
    if (node.nodeType === 3) {
      const v = node.nodeValue ?? "";
      if (/[0-9]/.test(v)) {
        originals?.set(node, v);
        node.nodeValue = persianDigitsText(v);
        changed++;
      }
      return;
    }
    if (node.nodeType !== 1 || (node.nodeName && SKIP.has(node.nodeName.toUpperCase()))) return;
    const kids = node.childNodes;
    if (!kids) return;
    for (let i = 0; i < kids.length; i++) walk(kids[i] as TextLike);
  };
  walk(root);
  return changed;
}

/** Undo `persianizeDigits` for the nodes it recorded (skips nodes whose length changed). */
export function restoreDigits(originals: Map<TextLike, string>): number {
  let restored = 0;
  for (const [node, original] of originals) {
    if ((node.nodeValue ?? "").length === original.length) {
      node.nodeValue = original;
      restored++;
    }
  }
  originals.clear();
  return restored;
}
