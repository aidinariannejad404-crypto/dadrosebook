/** Reader colour themes: the chrome takes theme tokens (tokens.css), the page canvas a CSS filter (globals.css). */
export type ReaderTheme = "light" | "sepia" | "dark";

export const READER_THEMES: { value: ReaderTheme; label: string }[] = [
  { value: "light", label: "روشن" },
  { value: "sepia", label: "کرم" },
  { value: "dark", label: "تیره" },
];

export const READER_THEME_KEY = "dadrose.reader.theme";

export function isReaderTheme(v: unknown): v is ReaderTheme {
  return v === "light" || v === "sepia" || v === "dark";
}

/** Saved theme, or null (private mode, blocked storage, nothing saved yet). */
export function loadReaderTheme(): ReaderTheme | null {
  try {
    const v = window.localStorage.getItem(READER_THEME_KEY);
    return isReaderTheme(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveReaderTheme(theme: ReaderTheme): void {
  try {
    window.localStorage.setItem(READER_THEME_KEY, theme);
  } catch {
    /* storage unavailable: the choice lasts for this visit only */
  }
}

/** First visit: follow the system dark preference, else light. */
export function initialReaderTheme(): ReaderTheme {
  const saved = loadReaderTheme();
  if (saved) return saved;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}
