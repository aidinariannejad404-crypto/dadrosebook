import Link from "next/link";
import type { ReactNode } from "react";
import type { BookFacets, BookQuery } from "@/lib/types";
import { formatNumber, formatToman, toPersianDigits } from "@/lib/format";
import { hiddenFields, hrefFor, isSelected, toggleFacet, toggleFlag, type ListFacet } from "@/lib/discovery";
import { CheckIcon } from "@/components/ui/Icons";

interface FilterPanelProps {
  basePath: string;
  query: BookQuery;
  facets: BookFacets;
  /** unique per rendered copy (sidebar vs. mobile sheet) so input ids don't clash */
  idPrefix: string;
}

interface Option {
  value: string;
  label: string;
  count: number;
  color?: string;
}

/**
 * Facet filters as plain links (no JS needed): each option toggles its value in the URL and resets the
 * page. Counts come from /catalog/books/facets/ (each facet ignores its own filter). Selected values the
 * facets no longer list stay visible so they can be unticked. Links are rel=nofollow so crawlers don't
 * walk the filter combinations.
 */
export function FilterPanel({ basePath, query, facets, idPrefix }: FilterPanelProps) {
  const subjects: Option[] = facets.subjects.map((s) => ({ value: s.slug, label: s.name, count: s.count, color: s.color }));
  const exams: Option[] = facets.exam_types.map((e) => ({ value: e.slug, label: e.name, count: e.count }));
  const formats: Option[] = facets.formats.map((f) => ({ value: f.value, label: f.label, count: f.count }));
  const types: Option[] = facets.resource_types.map((r) => ({ value: r.value, label: r.label, count: r.count }));

  return (
    <div className="flex flex-col divide-y divide-line">
      <FacetGroup title="درس" facet="subject" options={subjects} basePath={basePath} query={query} />
      <FacetGroup title="آزمون" facet="exam_type" options={exams} basePath={basePath} query={query} />
      <FacetGroup title="نوع نسخه" facet="format" options={formats} basePath={basePath} query={query} />
      <FacetGroup title="نوع منبع" facet="resource_type" options={types} basePath={basePath} query={query} />

      <Section title="موجودی">
        <FilterLink
          href={hrefFor(basePath, toggleFlag(query, "in_stock"))}
          selected={Boolean(query.in_stock)}
          label="فقط کتاب‌های موجود"
          count={facets.in_stock}
          toggle
        />
      </Section>

      <Section title="محدوده قیمت (تومان)">
        <PriceRange basePath={basePath} query={query} facets={facets} idPrefix={idPrefix} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="py-3 first:pt-0">
      <h3 className="mb-1 text-sm font-extrabold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function FacetGroup({
  title,
  facet,
  options,
  basePath,
  query,
}: {
  title: string;
  facet: ListFacet;
  options: Option[];
  basePath: string;
  query: BookQuery;
}) {
  const listed = new Set(options.map((o) => o.value.toLowerCase()));
  const missing: Option[] = (query[facet] ?? [])
    .filter((v) => !listed.has(v.toLowerCase()))
    .map((v) => ({ value: v, label: v.replace(/-/g, " "), count: 0 }));
  const all = [...options, ...missing];
  if (!all.length) return null;
  return (
    <Section title={title}>
      <ul className="flex flex-col">
        {all.map((o) => (
          <li key={o.value}>
            <FilterLink
              href={hrefFor(basePath, toggleFacet(query, facet, o.value))}
              selected={isSelected(query, facet, o.value)}
              label={o.label}
              count={o.count}
              color={o.color}
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function FilterLink({
  href,
  selected,
  label,
  count,
  color,
  toggle = false,
}: {
  href: string;
  selected: boolean;
  label: string;
  count: number;
  color?: string;
  toggle?: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      rel="nofollow"
      scroll={false}
      className="flex min-h-11 items-center gap-2.5 rounded-control px-1.5 text-sm text-ink hover:bg-primary-soft"
    >
      {toggle ? (
        <span
          aria-hidden="true"
          className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${selected ? "bg-primary" : "bg-line-strong"}`}
        >
          <span
            className={`absolute top-1 size-4 rounded-full bg-surface shadow transition-all ${selected ? "end-1" : "start-1"}`}
          />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={`grid size-5 shrink-0 place-items-center rounded-[5px] border-2 ${
            selected ? "border-primary bg-primary text-white" : "border-line-strong bg-surface"
          }`}
        >
          {selected && <CheckIcon size={14} strokeWidth={3} />}
        </span>
      )}
      {color && <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
      <span className={`min-w-0 flex-1 ${selected ? "font-bold" : ""}`}>
        {label}
        {selected && <span className="sr-only">، انتخاب‌شده (برای حذف کلیک کنید)</span>}
      </span>
      <span className="shrink-0 text-xs text-ink-muted">
        <span className="sr-only">تعداد: </span>
        {toPersianDigits(count)}
      </span>
    </Link>
  );
}

/** Plain GET form: min/max price plus the rest of the query as hidden fields. */
function PriceRange({ basePath, query, facets, idPrefix }: { basePath: string; query: BookQuery; facets: BookFacets; idPrefix: string }) {
  const { min, max } = facets.price;
  const hint = min !== null && max !== null ? `از ${formatToman(min)} تا ${formatToman(max)}` : null;
  const hintId = `${idPrefix}-price-hint`;
  return (
    <form action={basePath} method="get" className="flex flex-col gap-2">
      {hiddenFields(query, ["min_price", "max_price"]).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="grid grid-cols-2 gap-2">
        <PriceInput
          id={`${idPrefix}-min`}
          name="min_price"
          label="از"
          value={query.min_price}
          placeholder={min !== null ? formatNumber(min) : "۰"}
          describedBy={hint ? hintId : undefined}
        />
        <PriceInput
          id={`${idPrefix}-max`}
          name="max_price"
          label="تا"
          value={query.max_price}
          placeholder={max !== null ? formatNumber(max) : ""}
          describedBy={hint ? hintId : undefined}
        />
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
      <button
        type="submit"
        className="min-h-11 rounded-control border border-primary px-4 text-sm font-bold text-primary hover:bg-primary-soft"
      >
        اعمال قیمت
      </button>
    </form>
  );
}

function PriceInput({
  id,
  name,
  label,
  value,
  placeholder,
  describedBy,
}: {
  id: string;
  name: string;
  label: string;
  value: number | undefined;
  placeholder: string;
  describedBy?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-bold text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        name={name}
        inputMode="numeric"
        autoComplete="off"
        dir="ltr"
        defaultValue={value !== undefined ? toPersianDigits(value) : ""}
        placeholder={placeholder}
        aria-describedby={describedBy}
        className="h-11 w-full min-w-0 rounded-control border border-line bg-surface px-3 text-start text-sm text-ink placeholder:text-ink-muted focus:border-primary"
      />
    </div>
  );
}
