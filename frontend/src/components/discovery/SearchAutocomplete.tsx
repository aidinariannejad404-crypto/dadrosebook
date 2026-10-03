"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { getSearchSuggestions } from "@/lib/api";
import { routes } from "@/lib/config";
import { formatToman, toPersianDigits } from "@/lib/format";
import { PRICE_SOON } from "@/lib/variants";
import type { SearchSuggestions } from "@/lib/types";
import { SearchIcon } from "@/components/ui/Icons";

interface SearchAutocompleteProps {
  /** USE_API_FIXTURES is server-only, so the server passes it down (local dev/tests only) */
  fixtures?: boolean;
  className?: string;
}

type Section = "books" | "subjects" | "categories" | "authors" | "all";

interface Option {
  id: string;
  section: Section;
  href: string;
  render: ReactNode;
}

const DEBOUNCE_MS = 200;
const MIN_CHARS = 2;

const SECTION_TITLES: Record<Exclude<Section, "all">, string> = {
  books: "کتاب‌ها",
  subjects: "درس‌ها",
  categories: "دسته‌بندی‌ها",
  authors: "نویسندگان",
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

  const term = value.trim();

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

  const groups = useMemo(() => buildGroups(data, uid), [data, uid]);
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

  const expanded = open && term.length >= MIN_CHARS && (options.length > 0 || loading);
  const activeOption = expanded && active >= 0 ? options[active] : undefined;
  const resultCount = options.length - 1;

  function go(href: string) {
    setOpen(false);
    setActive(-1);
    router.push(href);
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
        go(activeOption.href);
      }
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
    return (
      <div
        key={o.id}
        id={o.id}
        role="option"
        aria-selected={selected}
        onMouseDown={(e) => e.preventDefault()}
        onMouseMove={() => setActive(i)}
        onClick={() => go(o.href)}
        className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-3 py-1.5 text-sm text-ink ${
          selected ? "bg-primary-soft outline outline-2 -outline-offset-2 outline-primary" : ""
        }`}
      >
        {o.render}
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
                {SECTION_TITLES[g.section]}
              </div>
              {g.options.map(renderOption)}
            </div>
          ))}
          {loading && groups.length === 0 && (
            <div role="presentation" className="px-3 py-2 text-sm text-ink-muted">
              در حال جستجو…
            </div>
          )}
          {!loading && data && groups.length === 0 && (
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
          {expanded && !loading && data ? `${toPersianDigits(Math.max(resultCount, 0))} پیشنهاد` : ""}
        </p>
      </div>
    </form>
  );
}

function buildGroups(data: SearchSuggestions | null, uid: string): { section: Exclude<Section, "all">; options: Option[] }[] {
  if (!data) return [];
  const groups: { section: Exclude<Section, "all">; options: Option[] }[] = [];
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
