/* eslint-disable react/jsx-key -- row cells are built as arrays and keyed by their <td> when rendered */
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getBook } from "@/lib/api";
import { cheapestIndex, compareHref, parseCompareParam } from "@/lib/compare";
import { routes } from "@/lib/config";
import { selectedExamSlug } from "@/lib/exam-server";
import { formatNumber, formatToman, toPersianDigits } from "@/lib/format";
import { formatAverage } from "@/lib/reviews";
import type { BookDetail, VariantType } from "@/lib/types";
import { PRICE_SOON, SHORT_LABEL, isPurchasable } from "@/lib/variants";
import { BookCover } from "@/components/book/BookCover";
import { CompareOpened } from "@/components/compare/CompareOpened";
import { Stars } from "@/components/reviews/Stars";
import { CheckIcon } from "@/components/ui/Icons";

export const metadata: Metadata = {
  title: "مقایسه کتاب‌ها",
  robots: { index: false, follow: true },
  alternates: { canonical: "/compare" },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FORMATS: VariantType[] = ["PRINT", "EBOOK", "BUNDLE"];

function priceOf(book: BookDetail, type: VariantType): number | null {
  const v = book.variants.find((x) => x.type === type);
  return v && !v.price_is_placeholder && isPurchasable(v) ? v.effective_price : null;
}

/** «ضروری / تکمیلی» for the visitor's exam (else the first kit placement). */
function kitText(book: BookDetail, exam: string | null): { essential: boolean; text: string } | null {
  const p = book.kit_placements.find((x) => x.exam_type.slug === exam) ?? (exam ? null : book.kit_placements[0]);
  if (!p) return null;
  return {
    essential: p.is_essential,
    text: `${p.is_essential ? "ضروری" : "تکمیلی"} · ${p.subject.name} (${p.exam_type.short_name || p.exam_type.name})`,
  };
}

/** د۶: 2-3 books side by side. Shareable URL, never indexed. */
export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const slugs = parseCompareParam((await searchParams).b);
  const exam = await selectedExamSlug();
  const books = (await Promise.all(slugs.map((s) => getBook(s, exam).catch(() => null)))).filter(
    (b): b is BookDetail => b != null,
  );

  if (books.length < 2) {
    return (
      <div className="mx-auto max-w-site px-4 py-8">
        <h1 className="text-xl font-black text-ink md:text-2xl">مقایسه کتاب‌ها</h1>
        <div className="mt-4 max-w-xl rounded-card bg-surface p-5 leading-8 text-ink shadow-card">
          <p>
            برای مقایسه، دست‌کم دو کتاب لازم است. روی کارت هر کتاب یا در صفحه کتاب دکمه «مقایسه» را بزنید؛ حداکثر سه کتاب
            کنار هم نمایش داده می‌شود.
          </p>
          <Link
            href={routes.search()}
            className="press mt-4 inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-bold text-white hover:bg-primary-hover"
          >
            دیدن کتاب‌ها
          </Link>
        </div>
      </div>
    );
  }

  const n = books.length;
  const prices = FORMATS.map((t) => books.map((b) => priceOf(b, t)));
  const cheapest = prices.map(cheapestIndex);
  const pagesBest = cheapestIndex(books.map((b) => (b.pages ? -b.pages : null)));

  const rows: { label: string; cells: ReactNode[] }[] = [
    {
      label: "ویرایش",
      cells: books.map((b) => (
        <>
          {b.edition || "—"}
          {b.publish_year ? <span className="block text-xs text-ink-muted">چاپ {toPersianDigits(b.publish_year)}</span> : null}
          {b.edition_badge && (
            <span className="mt-1 inline-block rounded-md bg-primary-soft px-1.5 text-xs font-bold text-primary">{b.edition_badge}</span>
          )}
        </>
      )),
    },
    { label: "به‌روز تا", cells: books.map((b) => b.law_updated_until || <span className="text-ink-muted">نامشخص</span>) },
    {
      label: "تعداد صفحه",
      cells: books.map((b, i) =>
        b.pages ? (
          <>
            {formatNumber(b.pages)}
            {b.volumes > 1 && <span className="text-ink-muted"> ({toPersianDigits(b.volumes)} جلد)</span>}
            {pagesBest === i && <span className="block text-xs text-ink-muted">جامع‌ترین</span>}
          </>
        ) : (
          "—"
        ),
      ),
    },
    {
      label: "زمان مطالعه",
      cells: books.map((b) => (b.study_days ? `حدود ${toPersianDigits(b.study_days)} روز` : "—")),
    },
    {
      label: "مناسب آزمون",
      cells: books.map((b) =>
        b.exam_types.length ? (
          <ul className="flex flex-wrap gap-1">
            {b.exam_types.map((e) => (
              <li
                key={e.id}
                className={`rounded-full px-2 text-xs font-bold leading-6 ${
                  e.slug === exam ? "bg-success-soft text-success" : "bg-neutral-soft text-ink"
                }`}
              >
                {e.short_name || e.name}
              </li>
            ))}
          </ul>
        ) : (
          "—"
        ),
      ),
    },
    {
      label: "جایگاه در کیت",
      cells: books.map((b) => {
        const k = kitText(b, exam);
        return k ? (
          <span className={k.essential ? "font-bold text-success" : "text-ink"}>{k.text}</span>
        ) : (
          <span className="text-ink-muted">در کیت {exam ? "آزمون شما " : ""}نیست</span>
        );
      }),
    },
    ...FORMATS.filter((_, f) => prices[f]!.some((p) => p != null)).map((t) => {
      const f = FORMATS.indexOf(t);
      return {
        label: `قیمت ${SHORT_LABEL[t]}`,
        cells: books.map((b, i) => {
          const p = prices[f]![i];
          const exists = b.variants.some((v) => v.type === t);
          if (p == null) return <span className="text-ink-muted">{exists ? PRICE_SOON : "ندارد"}</span>;
          return (
            <>
              <span className="font-extrabold">{formatToman(p)}</span>
              {cheapest[f] === i && <span className="block text-xs font-bold text-success">کمترین قیمت</span>}
            </>
          );
        }),
      };
    }),
    {
      label: "امتیاز خریداران",
      cells: books.map((b) =>
        b.rating_avg != null && (b.rating_count ?? 0) > 0 ? (
          <span className="inline-flex flex-wrap items-center gap-1">
            <Stars value={b.rating_avg} size={14} />
            <span className="font-bold">{formatAverage(b.rating_avg)}</span>
            <span className="text-xs text-ink-muted">({toPersianDigits(b.rating_count ?? 0)} نظر)</span>
          </span>
        ) : (
          <span className="text-ink-muted">هنوز کافی نیست</span>
        ),
      ),
    },
    {
      label: "نمونه",
      cells: books.map((b) =>
        b.sample_pdf ? (
          <a href={b.sample_pdf} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-4">
            نمونه PDF
            <span className="sr-only"> «{b.title}» (در زبانه جدید باز می‌شود)</span>
          </a>
        ) : b.sample_pages.length ? (
          <Link href={routes.product(b.slug)} className="inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-4">
            ورق بزنید
            <span className="sr-only"> «{b.title}»</span>
          </Link>
        ) : (
          <span className="text-ink-muted">ندارد</span>
        ),
      ),
    },
  ];

  const col = n === 3 ? "min-w-[8.5rem]" : "min-w-[10rem]";

  return (
    <div className="mx-auto max-w-site px-4 pb-12 pt-4 md:pt-6">
      <CompareOpened count={n} />
      <h1 className="text-xl font-black text-ink md:text-2xl">مقایسه کتاب‌ها</h1>
      <p className="mt-1 text-sm leading-7 text-ink-muted">
        {toPersianDigits(n)} کتاب کنار هم{exam ? "؛ جایگاه و تناسب برای آزمون انتخابی شما" : ""}. جدول را در گوشی به پهلو بکشید.
      </p>

      <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0" role="region" aria-label="جدول مقایسه" tabIndex={0}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">مقایسه {books.map((b) => `«${b.title}»`).join(" و ")}</caption>
          <thead>
            <tr>
              <td className="sticky start-0 z-10 w-24 bg-bg md:w-40" />
              {books.map((b) => {
                const others = books.filter((o) => o.slug !== b.slug).map((o) => o.slug);
                return (
                  <th key={b.id} scope="col" className={`${col} bg-surface p-3 align-top text-start first-of-type:rounded-ss-card last:rounded-se-card`}>
                    <Link href={routes.product(b.slug)} className="block">
                      <span className="mx-auto block w-20 md:w-24">
                        <BookCover title={b.title} cover={b.cover} subjects={b.subjects} authors={b.authors} volumes={b.volumes} sizes="96px" />
                      </span>
                      <span className="mt-2 line-clamp-3 block font-extrabold leading-6 text-ink hover:text-primary">{b.title}</span>
                    </Link>
                    {b.authors.length > 0 && (
                      <span className="mt-0.5 line-clamp-1 block text-xs font-normal text-ink-muted">{b.authors.map((a) => a.name).join("، ")}</span>
                    )}
                    {n > 2 && (
                      <Link
                        href={compareHref(others)}
                        className="mt-1 inline-flex min-h-11 items-center text-xs font-bold text-ink-muted underline underline-offset-4 hover:text-danger"
                      >
                        برداشتن از مقایسه
                        <span className="sr-only"> «{b.title}»</span>
                      </Link>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="sticky start-0 z-10 border-t border-line bg-bg p-3 text-start align-top text-xs font-extrabold text-ink-muted">
                  {r.label}
                </th>
                {r.cells.map((c, i) => (
                  <td key={books[i]!.id} className="border-t border-line bg-surface p-3 align-top leading-7 text-ink">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className="sticky start-0 z-10 bg-bg p-3" />
              {books.map((b) => (
                <td key={b.id} className="bg-surface p-3 last:rounded-ee-card [&:nth-child(2)]:rounded-es-card">
                  <Link
                    href={routes.product(b.slug)}
                    className="press inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-control bg-primary px-3 text-sm font-extrabold text-white hover:bg-primary-hover"
                  >
                    <CheckIcon size={16} className="shrink-0" />
                    انتخاب و خرید
                  </Link>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
