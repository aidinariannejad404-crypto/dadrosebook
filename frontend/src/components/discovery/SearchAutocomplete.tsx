"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { getSearchSuggestions, getSearchZeroState } from "@/lib/api";
import { trackSearchZeroStateClick } from "@/lib/analytics";
import { examSlugFromCookieHeader } from "@/lib/exam-cookie";
import { readRecent, rememberSearch, removeRecent, writeRecent } from "@/lib/recent-searches";
import { routes } from "@/lib/config";
import { formatToman, toPersianDigits } from "@/lib/format";
import { PRICE_SOON } from "@/lib/variants";
import type { SearchSuggestions, SearchZeroState } from "@/lib/types";
import { ClockIcon, SearchIcon } from "@/components/ui/Icons";

interface SearchAutocompleteProps {
  /** USE_API_FIXTURES is server-only, so the server passes it down (local dev/tests only) */
  fixtures?: boolean;
  className?: string;
}

type Section = "books" | "subjects" | "categories" | "authors" | "all" | ZeroSection;
/** ج۳ zero state (empty box, focused): recent terms, popular for my exam, subject shortcuts */
type ZeroSection = "recent" | "popular" | "shortcuts";

interface Option {
  id: string;
  section: Section;
  href: string;
  render: ReactNode;
  /** recent-search term (deletable with the ✕ button or the Delete key) */
  recent?: string;
}

const DEBOUNCE_MS = 200;
const MIN_CHARS = 2;

const SECTION_TITLES: Record<"books" | "subjects" | "categories" | "authors", string> = {
  books: "کتاب‌ها",
  subjects: "درس‌ها",
  categories: "دسته‌بندی‌ها",
  authors: "نویسندگان",
};

const ZERO_TITLES: Record<ZeroSection, string> = {
  recent: "جستجوهای اخیر",
  popular: "پرطرفدار",
  shortcuts: "میان‌بر درس‌ها",
};

/**
 * Header search with suggestions (ARIA 1.2 combobox + listbox, aria-activedescendant).
 * Without JS it is a plain GET form to /search. Arrow keys move through the options, Enter opens the
 * active option (or searches), Escape closes the list (a second Escape clears the text).
 */
export function SearchAutocomplete({ fixtures = false, className = "" }: SearchAutocompleteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const uid = useId();
  const inputId = `${uid}-input`;
  const listId = `${uid}-list`;
  const [value, setValue] = useState("");
  const [data, setData] = useState<SearchSuggestions | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [zero, setZero] = useState<SearchZeroState | null>(null);
  const [exam, setExam] = useState<string | null>(null);
  const zeroRequested = useRef(false);

  const term = value.trim();
  const zeroMode = term.length < MIN_CHARS;

  // Zero state data: recent terms (this browser) every time the box opens; popular + subjects once.
  useEffect(() => {
    if (!open || !zeroMode) return;
    setRecent(readRecent());
    if (zeroRequested.current) return;
    zeroRequested.current = true;
    const slug = examSlugFromCookieHeader(document.cookie);
    setExam(slug);
    void getSearchZeroState(slug, { fixtures }).then((z) => setZero(z));
  }, [open, zeroMode, fixtures]);

  // debounced fetch; stale responses are ignored
  useEffect(() => {
    if (term.length < MIN_CHARS) {
      setData(null);
      setLoading(false);
      return;
    }
    const req = ++requestRef.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      const res = await getSearchSuggestions(term, { fixtures });
      if (req !== requestRef.current) return;
      setData(res);
      setLoading(false);
      setActive(-1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, fixtures]);

  // close after navigating
  useEffect(() => {
    setOpen(false);
    setActive(-1);
  }, [pathname]);

  const groups = useMemo(
    () => (zeroMode ? buildZeroGroups(recent, zero, uid) : buildGroups(data, uid)),
    [zeroMode, recent, zero, data, uid],
  );
  const options = useMemo<Option[]>(() => {
    const all = groups.flatMap((g) => g.options);
    if (term.length >= MIN_CHARS) {
      all.push({
        id: `${uid}-all`,
        section: "all",
        href: routes.search({ q: term }),
        render: (
          <span className="flex items-center gap-2 font-bold text-primary">
            <SearchIcon size={18} />
            <span className="min-w-0 truncate">همه نتایج برای «{term}»</span>
          </span>
        ),
      });
    }
    return all;
  }, [groups, term, uid]);

  const expanded = open && (zeroMode ? options.length > 0 : options.length > 0 || loading);
  const activeOption = expanded && active >= 0 ? options[active] : undefined;
  const resultCount = options.length - 1;

  function go(href: string, option?: Option) {
    if (term.length >= MIN_CHARS) setRecent(rememberSearch(term));
    else if (option?.recent) setRecent(rememberSearch(option.recent));
    if (option && zeroMode && option.section !== "all") {
      const kind = option.section === "recent" ? "recent" : option.section === "popular" ? "popular" : "subject";
      trackSearchZeroStateClick(kind, exam);
    }
    setOpen(false);
    setActive(-1);
    router.push(href);
  }

  function forget(termToRemove: string) {
    const next = removeRecent(recent, termToRemove);
    writeRecent(next);
    setRecent(next);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!expanded) {
        setOpen(true);
        return;
      }
      setActive((i) => (i + 1 >= options.length ? 0 : i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!expanded) return;
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (activeOption) {
        e.preventDefault();
        go(activeOption.href, activeOption);
      }
    } else if (e.key === "Delete" && activeOption?.recent) {
      e.preventDefault();
      forget(activeOption.recent);
    } else if (e.key === "Escape") {
      if (expanded) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      } else if (value) {
        e.preventDefault();
        setValue("");
      }
    } else if (e.key === "Home" || e.key === "End") {
      setActive(-1);
    }
  }

  // keep the active option in view
  useEffect(() => {
    if (!activeOption) return;
    document.getElementById(activeOption.id)?.scrollIntoView({ block: "nearest" });
  }, [activeOption]);

  let index = -1;
  const renderOption = (o: Option) => {
    index += 1;
    const i = index;
    const selected = i === active;
    const option = (
      <div
        key={o.id}
        id={o.id}
        role="option"
        aria-selected={selected}
        onMouseDown={(e) => e.preventDefault()}
        onMouseMove={() => setActive(i)}
        onClick={() => go(o.href, o)}
        className={`flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-control px-3 py-1.5 text-sm text-ink ${
          selected ? "bg-primary-soft outline outline-2 -outline-offset-2 outline-primary" : ""
        }`}
      >
        {o.render}
      </div>
    );
    if (!o.recent) return option;
    const t = o.recent;
    // Pointer users get a ✕; keyboard users press Delete on the active option (hint below).
    return (
      <div key={o.id} role="presentation" className="flex items-center gap-1">
        {option}
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => forget(t)}
          aria-label={`حذف «${t}» از جستجوهای اخیر`}
          className="press grid size-11 shrink-0 place-items-center rounded-control text-lg text-ink-muted hover:bg-danger-soft hover:text-danger"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    );
  };

  return (
    <form
      action="/search"
      method="get"
      role="search"
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        go(term ? routes.search({ q: term }) : routes.search());
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        جستجو در کتاب‌ها
      </label>
      <div
        ref={wrapRef}
        className="relative"
        onBlur={(e) => {
          if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) {
            setOpen(false);
            setActive(-1);
          }
        }}
      >
        <input
          id={inputId}
          name="q"
          type="search"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOption?.id}
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          maxLength={100}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="جستجوی کتاب، نویسنده یا درس…"
          className="h-12 w-full rounded-control border border-line bg-bg pe-12 ps-4 text-base text-ink placeholder:text-ink-muted focus:border-primary focus:bg-surface [&::-webkit-search-cancel-button]:hidden"
        />
        <button
          type="submit"
          aria-label="جستجو"
          className="absolute inset-y-0 end-0 inline-flex min-w-12 items-center justify-center rounded-e-control text-primary hover:bg-primary-soft"
        >
          <SearchIcon size={22} />
        </button>

        <div
          id={listId}
          role="listbox"
          aria-label="پیشنهادهای جستجو"
          hidden={!expanded}
          className="absolute inset-x-0 top-full z-40 mt-1 max-h-[min(70vh,32rem)] overflow-y-auto overscroll-contain rounded-card border border-line bg-surface p-2 shadow-raised"
        >
          {groups.map((g) => (
            <div key={g.section} role="group" aria-labelledby={`${uid}-${g.section}`} className="mb-1">
              <div id={`${uid}-${g.section}`} role="presentation" className="px-3 pb-1 pt-2 text-xs font-extrabold text-ink-muted">
                {g.title ?? SECTION_TITLES[g.section as keyof typeof SECTION_TITLES]}
              </div>
              {g.options.map(renderOption)}
            </div>
          ))}
          {!zeroMode && loading && groups.length === 0 && (
            <div role="presentation" className="px-3 py-2 text-sm text-ink-muted">
              در حال جستجو…
            </div>
          )}
          {!zeroMode && !loading && data && groups.length === 0 && (
            <div role="presentation" className="px-3 py-2 text-sm text-ink-muted">
              پیشنهادی پیدا نشد؛ Enter را بزنید تا همه نتایج را ببینید.
            </div>
          )}
          {options
            .filter((o) => o.section === "all")
            .map((o) => (
              <div key={o.id} className="mt-1 border-t border-line pt-1">
                {renderOption(o)}
              </div>
            ))}
        </div>
        <p className="sr-only" aria-live="polite">
          {expanded && zeroMode
            ? `${toPersianDigits(options.length)} پیشنهاد${recent.length ? "؛ برای حذف یک جستجوی اخیر کلید Delete را بزنید" : ""}`
            : expanded && !loading && data
              ? `${toPersianDigits(Math.max(resultCount, 0))} پیشنهاد`
              : ""}
        </p>
      </div>
    </form>
  );
}

interface Group {
  section: Exclude<Section, "all">;
  title?: string;
  options: Option[];
}

/** ج۳: empty box → recent terms, popular books for the visitor's exam, subject shortcuts. */
function buildZeroGroups(recent: string[], zero: SearchZeroState | null, uid: string): Group[] {
  const groups: Group[] = [];
  if (recent.length)
    groups.push({
      section: "recent",
      title: ZERO_TITLES.recent,
      options: recent.map((t, i) => ({
        id: `${uid}-r-${i}`,
        section: "recent",
        href: routes.search({ q: t }),
        recent: t,
        render: (
          <>
            <ClockIcon size={16} className="shrink-0 text-ink-muted" />
            <span className="min-w-0 truncate">{t}</span>
          </>
        ),
      })),
    });
  if (zero?.popular.length)
    groups.push({
      section: "popular",
      title: zero.exam ? `پرطرفدار برای ${zero.exam.short_name || zero.exam.name}` : ZERO_TITLES.popular,
      options: zero.popular.map((b) => ({
        id: `${uid}-p-${b.id}`,
        section: "popular",
        href: routes.product(b.slug),
        render: (
          <>
            <TrendIcon />
            <span className="min-w-0 truncate">{b.title}</span>
          </>
        ),
      })),
    });
  if (zero?.subjects.length)
    groups.push({
      section: "shortcuts",
      title: ZERO_TITLES.shortcuts,
      options: zero.subjects.map((s) => ({
        id: `${uid}-z-${s.id}`,
        section: "shortcuts",
        href: routes.search({ subject: s.slug }),
        render: (
          <>
            <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="min-w-0 truncate">{s.name}</span>
          </>
        ),
      })),
    });
  return groups;
}

function TrendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-accent-ink">
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  );
}

function buildGroups(data: SearchSuggestions | null, uid: string): Group[] {
  if (!data) return [];
  const groups: Group[] = [];
  if (data.books.length)
    groups.push({
      section: "books",
      options: data.books.map((b) => ({
        id: `${uid}-b-${b.id}`,
        section: "books",
        href: routes.product(b.slug),
        render: (
          <>
            <span
              aria-hidden="true"
              className="relative h-12 w-8 shrink-0 overflow-hidden rounded-[3px] shadow-card"
              style={{ backgroundColor: b.subjects[0]?.color ?? "var(--color-primary)" }}
            >
              {b.cover && <Image src={b.cover} alt="" fill sizes="32px" className="object-cover" />}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="line-clamp-1 font-bold">{b.title}</span>
              {b.authors.length > 0 && (
                <span className="line-clamp-1 text-xs text-ink-muted">{b.authors.map((a) => a.name).join("، ")}</span>
              )}
            </span>
            <span className="shrink-0 text-xs font-bold text-ink">
              {b.card_price != null ? formatToman(b.card_price) : <span className="text-ink-muted">{PRICE_SOON}</span>}
            </span>
          </>
        ),
      })),
    });
  if (data.subjects.length)
    groups.push({
      section: "subjects",
      options: data.subjects.map((s) => ({
        id: `${uid}-s-${s.id}`,
        section: "subjects",
        href: routes.search({ subject: s.slug }),
        render: (
          <>
            <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="min-w-0 truncate">{s.name}</span>
          </>
        ),
      })),
    });
  if (data.categories.length)
    groups.push({
      section: "categories",
      options: data.categories.map((c) => ({
        id: `${uid}-c-${c.id}`,
        section: "categories",
        href: routes.category(c.slug),
        render: <span className="min-w-0 truncate">{c.name}</span>,
      })),
    });
  if (data.authors.length)
    groups.push({
      section: "authors",
      options: data.authors.map((a) => ({
        id: `${uid}-a-${a.id}`,
        section: "authors",
        href: routes.search({ q: a.name }),
        render: <span className="min-w-0 truncate">{a.name}</span>,
      })),
    });
  return groups;
}
