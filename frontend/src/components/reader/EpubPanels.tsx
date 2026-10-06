"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { formatNumber, toPersianDigits } from "@/lib/format";
import { SEARCH_MAX, SEARCH_MIN, searchBook, type ReaderError, type ReaderResult } from "@/lib/reader";
import { FONT_SIZES, LINE_HEIGHTS, MARGINS, type EpubSettings, type ReadingMode } from "@/lib/reader-epub";
import type { CopyQuota, EpubTocItem, SearchResponse, SearchResult } from "@/lib/types";
import { Dialog } from "@/components/ui/Dialog";
import { MinusIcon, PlusIcon, SearchIcon } from "@/components/ui/Icons";
import { ReaderDrawer } from "./ReaderChrome";
import { ReaderThemeChoices } from "./ReaderThemeToggle";
import { CopyQuotaLine } from "./NotesExport";
import type { ReaderTheme } from "./theme";

/* ---------- table of contents ---------- */

export function EpubTocDrawer({
  open,
  onClose,
  toc,
  currentChapter,
  onOpen,
}: {
  open: boolean;
  onClose: () => void;
  toc: EpubTocItem[];
  currentChapter: number;
  onOpen: (item: EpubTocItem) => void;
}) {
  const firstCurrent = toc.findIndex((t) => t.chapter === currentChapter);
  return (
    <ReaderDrawer open={open} onClose={onClose} title="فهرست مطالب">
      <nav aria-label="فهرست مطالب" className="flex-1 overflow-y-auto px-3 py-3">
        {toc.length === 0 ? (
          <p className="px-2 text-sm leading-7 text-ink-muted">این کتاب فهرست مطالب ندارد.</p>
        ) : (
          <ol className="space-y-0.5">
            {toc.map((item, i) => {
              const current = i === firstCurrent;
              const inChapter = item.chapter === currentChapter;
              return (
                <li key={`${item.chapter}-${item.anchor}-${i}`}>
                  <button
                    type="button"
                    aria-current={current ? "location" : undefined}
                    onClick={() => {
                      onOpen(item);
                      onClose();
                    }}
                    style={{ paddingInlineStart: `${0.75 + Math.min(item.level, 4) * 1.25}rem` }}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-control py-2 pe-3 text-start text-sm leading-6 hover:bg-primary-soft ${
                      item.level === 0 ? "font-bold" : "text-ink-muted"
                    } ${inChapter ? "bg-primary-soft text-ink" : ""}`}
                  >
                    <span className="min-w-0 flex-1">{item.title}</span>
                    {current && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-[color:var(--color-on-accent)]">فصل فعلی</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </nav>
    </ReaderDrawer>
  );
}

/* ---------- in-book search ---------- */

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; q: string; results: SearchResult[]; truncated: boolean }
  | { status: "error"; error: ReaderError };

export function EpubSearchDrawer({
  open,
  onClose,
  slug,
  onOpen,
  search,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  onOpen: (r: SearchResult, q: string) => void;
  /** offline-aware search (Phase 6b); defaults to the server search */
  search?: (q: string) => Promise<ReaderResult<SearchResponse>>;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const inputId = useId();
  const reqId = useRef(0);
  const lastQ = useRef("");

  const run = async (q: string) => {
    const query = q.trim();
    if (query.length < SEARCH_MIN || query === lastQ.current) return;
    lastQ.current = query;
    const id = ++reqId.current;
    setState({ status: "loading" });
    const res = await (search ? search(query) : searchBook(slug, query));
    if (id !== reqId.current) return;
    if (!res.ok) {
      lastQ.current = "";
      return setState({ status: "error", error: res.error });
    }
    setState({ status: "done", q: query, results: res.data.results, truncated: res.data.truncated });
  };

  // search while typing, gently (the server allows 30 searches a minute)
  useEffect(() => {
    if (query.trim().length < SEARCH_MIN) return;
    const t = setTimeout(() => void run(query), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <ReaderDrawer open={open} onClose={onClose} title="جست‌وجو در کتاب">
      <form
        role="search"
        className="flex items-center gap-2 border-b border-line px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          lastQ.current = "";
          void run(query);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          عبارت جست‌وجو
        </label>
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={SEARCH_MAX}
          enterKeyHint="search"
          autoComplete="off"
          placeholder="مثلاً ماده ۱۹۰"
          className="h-11 min-w-0 flex-1 rounded-control border border-line bg-bg px-3 text-base text-ink placeholder:text-ink-muted focus:border-primary focus:bg-surface"
        />
        <button
          type="submit"
          aria-label="جست‌وجو"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control bg-primary text-surface hover:bg-primary-hover"
        >
          <SearchIcon size={20} />
        </button>
      </form>
      <div className="flex-1 overflow-y-auto px-4 py-3" aria-live="polite">
        {state.status === "idle" && (
          <p className="text-sm leading-7 text-ink-muted">دست‌کم {toPersianDigits(SEARCH_MIN)} نویسه بنویسید.</p>
        )}
        {state.status === "loading" && <p className="text-sm text-ink-muted">در حال جست‌وجو…</p>}
        {state.status === "error" && (
          <p className="text-sm leading-7 text-danger">
            {state.error.kind === "throttled" ? "کمی صبر کنید و دوباره تلاش کنید." : "جست‌وجو انجام نشد. دوباره تلاش کنید."}
          </p>
        )}
        {state.status === "done" &&
          (state.results.length === 0 ? (
            <p className="text-sm leading-7 text-ink-muted">نتیجه‌ای برای «{state.q}» پیدا نشد.</p>
          ) : (
            <>
              <p className="mb-2 text-xs font-bold text-ink-muted">
                {state.truncated ? `بیش از ${formatNumber(state.results.length)} نتیجه` : `${formatNumber(state.results.length)} نتیجه`}
              </p>
              <ul className="space-y-2">
                {state.results.map((r) => (
                  <li key={`${r.chapter}-${r.occurrence}`}>
                    <button
                      type="button"
                      onClick={() => {
                        onOpen(r, state.q);
                        onClose();
                      }}
                      className="block min-h-11 w-full rounded-control border border-line p-2.5 text-start hover:bg-primary-soft"
                    >
                      <span className="mb-1 block truncate text-xs font-bold text-primary">{r.title}</span>
                      <span className="line-clamp-3 text-sm leading-7">
                        {r.before}
                        <mark className="reader-mark reader-mark-yellow">{r.match}</mark>
                        {r.after}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ))}
      </div>
    </ReaderDrawer>
  );
}

/* ---------- typography settings («Aa») ---------- */

function Stepper({
  label,
  value,
  count,
  display,
  onChange,
}: {
  label: string;
  value: number;
  count: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-bold">{label}</span>
      <div className="flex items-center gap-1" role="group" aria-label={label}>
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          aria-label={`کاهش ${label}`}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border border-line text-primary hover:bg-primary-soft disabled:opacity-40"
        >
          <MinusIcon size={18} />
        </button>
        <span className="min-w-16 text-center text-sm tabular-nums" aria-live="polite">
          {display}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(count - 1, value + 1))}
          disabled={value === count - 1}
          aria-label={`افزایش ${label}`}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border border-line text-primary hover:bg-primary-soft disabled:opacity-40"
        >
          <PlusIcon size={18} />
        </button>
      </div>
    </div>
  );
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; aria: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-bold">{label}</p>
      <div role="group" aria-label={label} className="flex gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            aria-label={o.aria}
            onClick={() => onChange(o.value)}
            className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-control px-2 text-sm font-bold ${
              o.value === value ? "bg-primary-soft text-ink ring-2 ring-inset ring-accent" : "border border-line text-ink-muted hover:bg-primary-soft"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const LH_LABELS = ["فشرده", "معمولی", "باز", "خیلی باز"];
const MARGIN_LABELS = ["کم", "متوسط", "زیاد"];

export function EpubSettingsSheet({
  open,
  onClose,
  settings,
  mode,
  copyQuota,
  onChange,
  theme,
  onTheme,
  children,
}: {
  open: boolean;
  onClose: () => void;
  settings: EpubSettings;
  /** the mode in effect (the saved choice or this screen's default) */
  mode: ReadingMode;
  copyQuota?: CopyQuota | null;
  onChange: (s: EpubSettings) => void;
  theme: ReaderTheme;
  onTheme: (t: ReaderTheme) => void;
  /** extra sections at the end (Phase 6b: «مطالعه آفلاین») */
  children?: ReactNode;
}) {
  const set = (patch: Partial<EpubSettings>) => onChange({ ...settings, ...patch });
  return (
    <Dialog open={open} onClose={onClose} title="تنظیمات نمایش" placement="sheet">
      <div className="space-y-5">
        <Segmented<ReadingMode>
          label="نحوه نمایش"
          value={mode}
          options={[
            { value: "scroll", label: "پیمایشی", aria: "نمایش پیمایشی (پیمایش عمودی فصل)" },
            { value: "paged", label: "صفحه‌ای", aria: "نمایش صفحه‌ای (ورق زدن صفحه به صفحه)" },
          ]}
          onChange={(v) => set({ mode: v })}
        />
        <Stepper
          label="اندازه قلم"
          value={settings.fontSize}
          count={FONT_SIZES.length}
          display={`${toPersianDigits(FONT_SIZES[settings.fontSize] ?? 18)} پیکسل`}
          onChange={(v) => set({ fontSize: v })}
        />
        <Segmented
          label="فاصله سطرها"
          value={settings.lineHeight}
          options={LINE_HEIGHTS.map((lh, i) => ({
            value: i,
            label: LH_LABELS[i] ?? toPersianDigits(lh),
            aria: `فاصله سطر ${LH_LABELS[i] ?? ""} (${toPersianDigits(lh)})`,
          }))}
          onChange={(v) => set({ lineHeight: v })}
        />
        <Segmented
          label="حاشیه و پهنای متن"
          value={settings.margin}
          options={MARGINS.map((_, i) => ({ value: i, label: MARGIN_LABELS[i], aria: `حاشیه ${MARGIN_LABELS[i] ?? ""}` }))}
          onChange={(v) => set({ margin: v })}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-bold" id="epub-justify-label">
            تراز دوطرفه متن
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={settings.justify}
            aria-labelledby="epub-justify-label"
            onClick={() => set({ justify: !settings.justify })}
            className="inline-flex min-h-11 min-w-11 items-center justify-center"
          >
            <span
              aria-hidden="true"
              className={`relative inline-block h-7 w-12 rounded-full border-2 transition-colors ${
                settings.justify ? "border-primary bg-primary" : "border-line-strong bg-bg"
              }`}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full shadow-card transition-[inset-inline-start] ${
                  settings.justify ? "start-[1.4rem] bg-surface" : "start-0.5 bg-ink-muted"
                }`}
              />
            </span>
          </button>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-bold">رنگ پس‌زمینه</p>
          <ReaderThemeChoices value={theme} onChange={onTheme} />
        </div>
        <CopyQuotaLine quota={copyQuota} className="border-t border-line pt-3" />
        {children}
      </div>
    </Dialog>
  );
}
