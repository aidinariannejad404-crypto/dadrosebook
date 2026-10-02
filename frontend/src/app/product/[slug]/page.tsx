import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { decodeSlug, getBook, getRelatedBooks } from "@/lib/api";
import { formatNumber, toPersianDigits } from "@/lib/format";
import { routes, siteUrl } from "@/lib/config";
import { bookJsonLd, breadcrumbJsonLd, serializeJsonLd, stripHtml } from "@/lib/jsonld";
import type { BookDetail } from "@/lib/types";
import { BookCover } from "@/components/book/BookCover";
import { SubjectTag } from "@/components/book/SubjectTag";
import { BookRail } from "@/components/book/BookRail";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Breadcrumb } from "@/components/product/Breadcrumb";
import { SamplePagesViewer } from "@/components/product/SamplePagesViewer";
import { IntroVideo } from "@/components/product/IntroVideo";
import { PurchasePanel, PurchaseProvider, StickyBuyBar } from "@/components/product/PurchasePanel";
import { ProductTabs, type TabDef } from "@/components/product/ProductTabs";
import { ViewItemTracker } from "@/components/product/ViewItemTracker";

type Params = Promise<{ slug: string }>;

// One fetch per request for metadata + page (fetch is also deduplicated in real mode).
const loadBook = cache(async (rawSlug: string) => getBook(decodeSlug(rawSlug)));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const book = await loadBook(slug);
  if (!book) return { title: "کتاب پیدا نشد" };
  const description = metaDescription(book);
  const path = `/product/${book.slug}`;
  return {
    title: book.title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "book",
      locale: "fa_IR",
      title: book.title,
      description,
      url: path,
      authors: book.authors.map((a) => a.name),
      isbn: book.isbn || undefined,
      images: book.cover ? [{ url: book.cover, alt: `جلد کتاب ${book.title}` }] : undefined,
    },
  };
}

function metaDescription(book: BookDetail): string {
  const authors = book.authors.map((a) => a.name).join("، ");
  const lead = `${book.title}${book.subtitle ? ` — ${book.subtitle}` : ""}${authors ? `، اثر ${authors}` : ""}.`;
  return `${lead} ${stripHtml(book.description)}`.slice(0, 160).trim();
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const book = await loadBook(slug);
  if (!book) notFound();
  const related = await getRelatedBooks(book.slug).catch(() => []);

  const url = `${siteUrl()}${routes.product(book.slug)}`;
  const category = book.categories[0];
  const crumbs = [
    { name: "خانه", href: "/" },
    ...(category ? [{ name: category.name, href: routes.category(category.slug) }] : []),
    { name: book.title },
  ];
  const jsonLd = [
    bookJsonLd(book, url),
    breadcrumbJsonLd(crumbs.map((c) => ({ name: c.name, url: c.href ? `${siteUrl()}${c.href}` : url }))),
  ];

  const join = (xs: { name: string }[]) => xs.map((x) => x.name).join("، ");
  const facts: [string, string][] = [];
  if (book.publisher) facts.push(["ناشر", book.publisher.name]);
  if (book.edition) facts.push(["ویرایش", book.edition]);
  if (book.volumes > 1) facts.push(["تعداد جلد", `${toPersianDigits(book.volumes)} جلد`]);
  if (book.pages) facts.push(["تعداد صفحات", `${formatNumber(book.pages)} صفحه`]);
  if (book.publish_year) facts.push(["سال انتشار", toPersianDigits(book.publish_year)]);
  if (book.isbn) facts.push(["شابک", `\u2066${toPersianDigits(book.isbn)}\u2069`]);

  const tocLines = book.table_of_contents
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const tabs: TabDef[] = [
    {
      key: "description",
      label: "توضیحات",
      content: book.description ? (
        // HTML is sanitised by the backend (bleach allow-list) before it reaches the API.
        <div className="rich-text max-w-3xl" dangerouslySetInnerHTML={{ __html: book.description }} />
      ) : (
        <p className="text-ink-muted">توضیحاتی برای این کتاب ثبت نشده است.</p>
      ),
    },
    {
      key: "toc",
      label: "فهرست مطالب",
      content:
        tocLines.length > 0 ? (
          <ol className="max-w-3xl divide-y divide-line rounded-card border border-line bg-surface">
            {tocLines.map((line, i) => (
              <li key={i} className="flex gap-3 px-4 py-3 leading-7">
                <span className="w-6 shrink-0 font-bold text-primary">{toPersianDigits(i + 1)}</span>
                <span>{toPersianDigits(line)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-ink-muted">فهرست مطالب به‌زودی اضافه می‌شود.</p>
        ),
    },
    {
      key: "plan",
      label: "جایگاه در برنامه مطالعه",
      content: (
        <div className="max-w-3xl space-y-4">
          {book.study_plan_note && <p className="leading-8">{book.study_plan_note}</p>}
          {book.kit_placements.length > 0 && (
            <ul className="space-y-2">
              {book.kit_placements.map((k) => (
                <li
                  key={`${k.exam_type.id}-${k.subject.id}`}
                  className="flex flex-wrap items-center gap-2 rounded-control border border-line bg-surface px-4 py-3 text-sm"
                >
                  <span>
                    در بسته مطالعاتی <strong>{k.exam_type.name}</strong> › <strong>{k.subject.name}</strong>، اولویت{" "}
                    {toPersianDigits(k.order)}
                  </span>
                  {k.is_essential && (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-ink">منبع ضروری</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!book.study_plan_note && book.kit_placements.length === 0 && (
            <p className="text-ink-muted">این کتاب هنوز در بسته‌های مطالعاتی قرار نگرفته است.</p>
          )}
        </div>
      ),
    },
  ];

  return (
    <PurchaseProvider bookId={book.id} bookTitle={book.title} variants={book.variants} course={book.related_courses[0]}>
      <div className="mx-auto max-w-site px-4 pt-2 md:pt-4">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
        <ViewItemTracker id={book.id} name={book.title} price={book.min_price} />
        <Breadcrumb items={crumbs} />

        <div className="mt-2 grid gap-6 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] md:gap-8 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)_minmax(0,22rem)]">
          {/* media */}
          <div className="flex flex-col gap-3">
            <div className="mx-auto w-full max-w-[12.5rem] md:max-w-none">
              <BookCover
                title={book.title}
                cover={book.cover}
                subjects={book.subjects}
                authors={book.authors}
                volumes={book.volumes}
                priority
                sizes="(min-width: 1024px) 304px, (min-width: 768px) 272px, 240px"
              />
            </div>
            {book.sample_pages.length > 0 ? (
              <SamplePagesViewer pages={book.sample_pages} title={book.title} />
            ) : (
              book.sample_pdf && (
                <a
                  href={book.sample_pdf}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex min-h-11 items-center justify-center rounded-control border-2 border-primary px-4 font-bold text-primary hover:bg-primary-soft"
                >
                  ورق بزنید (نمونه PDF)
                </a>
              )
            )}
            {book.intro_video_url && (
              <div className="hidden md:block">
                <IntroVideo url={book.intro_video_url} title={book.title} />
              </div>
            )}
          </div>

          {/* info */}
          <div className="min-w-0">
            <h1 className="text-xl font-black leading-9 text-ink md:text-2xl md:leading-[2.75rem]">{book.title}</h1>
            {book.subtitle && <p className="mt-1 text-ink-muted">{book.subtitle}</p>}
            <dl className="mt-3 space-y-1 text-sm">
              {book.authors.length > 0 && (
                <div className="flex gap-1">
                  <dt className="text-ink-muted">نویسنده:</dt>
                  <dd className="font-bold text-ink">{join(book.authors)}</dd>
                </div>
              )}
              {book.translators.length > 0 && (
                <div className="flex gap-1">
                  <dt className="text-ink-muted">مترجم:</dt>
                  <dd className="font-bold text-ink">{join(book.translators)}</dd>
                </div>
              )}
            </dl>

            <div className="mt-4 flex flex-wrap gap-2">
              {book.subjects.map((s) => (
                <SubjectTag key={s.id} subject={s} link size="md" />
              ))}
            </div>
            {book.exam_types.length > 0 && (
              <p className="mt-3 rounded-control bg-primary-soft px-3 py-2 text-sm leading-7 text-ink">
                <span className="font-bold text-primary">مناسب آزمون: </span>
                {book.exam_types.map((e) => e.name).join("، ")}
              </p>
            )}

            {book.kit_placements[0] && (
              <p className="mt-3 flex items-start gap-2 rounded-control border border-accent bg-accent-soft px-3 py-2 text-sm leading-7 text-ink">
                <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-accent-strong" />
                <span>
                  اولویت {toPersianDigits(book.kit_placements[0].order)} در بسته مطالعاتی{" "}
                  <strong>{book.kit_placements[0].exam_type.name}</strong> › {book.kit_placements[0].subject.name}
                  {book.kit_placements[0].is_essential && " (منبع ضروری)"}
                </span>
              </p>
            )}

            {facts.length > 0 && (
              <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line text-sm sm:grid-cols-3">
                {facts.map(([k, v]) => (
                  <div key={k} className="bg-surface px-3 py-2.5">
                    <dt className="text-xs text-ink-muted">{k}</dt>
                    <dd className="mt-0.5 font-bold text-ink">
                      <bdi>{v}</bdi>
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {/* buy box sits in the info column on tablet, in its own column on desktop */}
            <div className="mt-6 lg:hidden">
              <PurchasePanel />
            </div>
            {book.intro_video_url && (
              <div className="mt-6 md:hidden">
                <IntroVideo url={book.intro_video_url} title={book.title} />
              </div>
            )}
          </div>

          <aside className="hidden lg:block" aria-label="خرید">
            <div className="sticky top-4">
              <PurchasePanel />
            </div>
          </aside>
        </div>

        <section className="mt-10" aria-label="جزئیات کتاب">
          <ProductTabs tabs={tabs} />
        </section>

        {related.length > 0 && (
          <section aria-labelledby="related-title" className="mt-10">
            <SectionHeader id="related-title" title="دانشجویان این کتاب‌ها را هم خریدند" />
            <BookRail books={related} labelledBy="related-title" />
          </section>
        )}

        <StickyBuyBar />
      </div>
    </PurchaseProvider>
  );
}
