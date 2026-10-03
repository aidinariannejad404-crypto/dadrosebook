import type { Metadata } from "next";
import Link from "next/link";
import { getBookFacets, getBooks, getSubjects } from "@/lib/api";
import { PAGE_SIZE, clearFilters, hrefFor, isFiltered, parseBookQuery } from "@/lib/discovery";
import type { BookCard, BookFacets, BookQuery, SubjectWithCount } from "@/lib/types";
import { Breadcrumb } from "@/components/product/Breadcrumb";
import { DiscoveryResults } from "@/components/discovery/DiscoveryResults";
import { SubjectTag } from "@/components/book/SubjectTag";
import { BookRail } from "@/components/book/BookRail";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SearchIcon } from "@/components/ui/Icons";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const BASE_PATH = "/search";

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const query = parseBookQuery(await searchParams);
  return {
    title: query.q ? `جستجوی «${query.q}»` : "جستجوی کتاب",
    robots: { index: false, follow: true },
    alternates: { canonical: BASE_PATH },
  };
}

async function optional<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

async function bestsellers(): Promise<BookCard[]> {
  return (await optional(getBooks({ ordering: "-sales_count", page_size: 8 }), null))?.results ?? [];
}

async function popularSubjects(): Promise<SubjectWithCount[]> {
  const all = await optional(getSubjects(), [] as SubjectWithCount[]);
  return [...all]
    .filter((s) => s.book_count > 0)
    .sort((a, b) => b.book_count - a.book_count)
    .slice(0, 10);
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const query = parseBookQuery(await searchParams);
  const browsing = !isFiltered(query);

  if (browsing) {
    const [subjects, popular] = await Promise.all([popularSubjects(), bestsellers()]);
    return (
      <div className="mx-auto max-w-site px-4 pb-12 pt-2 md:pt-4">
        <Breadcrumb items={[{ name: "خانه", href: "/" }, { name: "جستجو" }]} />
        <h1 className="mt-1 text-xl font-black text-ink md:text-2xl">جستجوی کتاب</h1>
        <PageSearchForm q="" />
        <Suggestions subjects={subjects} books={popular} subjectsTitle="درس‌های پرطرفدار" />
      </div>
    );
  }

  const apiQuery: BookQuery = { ...query, page_size: PAGE_SIZE };
  const [results, facets] = await Promise.all([getBooks(apiQuery), optional<BookFacets | null>(getBookFacets(apiQuery), null)]);
  const zero = results.count === 0;
  const [subjects, popular] = zero ? await Promise.all([popularSubjects(), bestsellers()]) : [[], []];

  const subjectNames = (query.subject ?? []).map((s) => facets?.subjects.find((f) => f.slug === s)?.name ?? s.replace(/-/g, " "));
  const heading = query.q
    ? `نتایج جستجو برای «${query.q}»`
    : subjectNames.length
      ? `کتاب‌های ${subjectNames.join("، ")}`
      : "همه کتاب‌ها";
  const filtersOnTop = query.q && isFiltered({ ...query, q: undefined });

  return (
    <div className="mx-auto max-w-site px-4 pb-12 pt-2 md:pt-4">
      <Breadcrumb items={[{ name: "خانه", href: "/" }, { name: "جستجو" }]} />
      <h1 className="mt-1 break-words text-xl font-black text-ink md:text-2xl">{heading}</h1>

      <DiscoveryResults
        basePath={BASE_PATH}
        query={query}
        results={results}
        facets={facets}
        empty={
          <div className="flex flex-col gap-8">
            <section aria-labelledby="no-results" className="rounded-card bg-surface p-5 shadow-card md:p-6">
              <h2 id="no-results" className="text-lg font-extrabold text-ink">
                {query.q ? `کتابی با «${query.q}» پیدا نشد` : "کتابی با این فیلترها پیدا نشد"}
              </h2>
              <ul className="mt-3 list-disc space-y-1.5 ps-5 text-sm leading-7 text-ink-muted">
                <li>املای کلمه‌ها را بررسی کنید (مثلاً «ي» و «ك» عربی را با «ی» و «ک» فارسی عوض کنید).</li>
                <li>کلمه‌های کمتر یا عمومی‌تری بنویسید؛ مثلاً فقط نام درس یا نویسنده.</li>
                <li>به‌جای عنوان کامل کتاب، بخشی از آن را جستجو کنید.</li>
              </ul>
              {filtersOnTop && (
                <Link
                  href={hrefFor(BASE_PATH, clearFilters(query))}
                  className="mt-4 inline-flex min-h-11 items-center rounded-control bg-primary px-5 text-sm font-bold text-white hover:bg-primary-hover"
                >
                  جستجوی «{query.q}» بدون فیلتر
                </Link>
              )}
              <PageSearchForm q={query.q ?? ""} />
            </section>
            <Suggestions subjects={subjects} books={popular} subjectsTitle="شاید دنبال این درس‌ها باشید" />
          </div>
        }
      />
    </div>
  );
}

function PageSearchForm({ q }: { q: string }) {
  return (
    <form action={BASE_PATH} method="get" role="search" className="mt-4 flex max-w-xl gap-2">
      <label htmlFor="page-search" className="sr-only">
        جستجو در کتاب‌ها
      </label>
      <input
        id="page-search"
        name="q"
        type="search"
        defaultValue={q}
        enterKeyHint="search"
        placeholder="نام کتاب، نویسنده یا درس…"
        className="h-12 min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-4 text-base text-ink placeholder:text-ink-muted focus:border-primary"
      />
      <button
        type="submit"
        className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-control bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover"
      >
        <SearchIcon size={20} />
        جستجو
      </button>
    </form>
  );
}

function Suggestions({ subjects, books, subjectsTitle }: { subjects: SubjectWithCount[]; books: BookCard[]; subjectsTitle: string }) {
  return (
    <>
      {subjects.length > 0 && (
        <section aria-labelledby="popular-subjects" className="mt-8">
          <SectionHeader id="popular-subjects" title={subjectsTitle} />
          <ul className="flex flex-wrap gap-2">
            {subjects.map((s) => (
              <li key={s.id}>
                <SubjectTag subject={s} link size="md" />
              </li>
            ))}
          </ul>
        </section>
      )}
      {books.length > 0 && (
        <section aria-labelledby="search-bestsellers" className="mt-10">
          <SectionHeader id="search-bestsellers" title="پرفروش‌ترین‌ها" href={hrefFor(BASE_PATH, { ordering: "-sales_count", in_stock: true })} />
          <BookRail books={books} labelledBy="search-bestsellers" showNotify />
        </section>
      )}
    </>
  );
}
