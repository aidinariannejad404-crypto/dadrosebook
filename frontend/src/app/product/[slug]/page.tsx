import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  decodeSlug,
  fixturesEnabled,
  getBook,
  getExamEvents,
  getExamTypes,
  getRelatedBooks,
  getStoreSettings,
  getStudyKits,
  getSubjects,
} from "@/lib/api";
import { formatNumber, toPersianDigits } from "@/lib/format";
import { routes, siteUrl } from "@/lib/config";
import { bookJsonLd, breadcrumbJsonLd, serializeJsonLd } from "@/lib/jsonld";
import { productDescription, productTitle } from "@/lib/product-meta";
import { selectedExamSlug } from "@/lib/exam-server";
import { daysLeft, isLowTime, needsQuickReviewHint, pickExamEvent } from "@/lib/exam-time";
import type { ExamTypeMini, StudyKit, SubjectWithCount } from "@/lib/types";
import { isEmptyOffer } from "@/lib/courses";
import { BookCover } from "@/components/book/BookCover";
import { BookTilt } from "@/components/book/BookTilt";
import { SubjectTag } from "@/components/book/SubjectTag";
import { BookRail } from "@/components/book/BookRail";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Breadcrumb } from "@/components/product/Breadcrumb";
import { SamplePagesViewer } from "@/components/product/SamplePagesViewer";
import { IntroVideo } from "@/components/product/IntroVideo";
import { PurchasePanel, PurchaseProvider, StickyBuyBar } from "@/components/product/PurchasePanel";
import { ProductTabs, type TabDef } from "@/components/product/ProductTabs";
import { ViewItemTracker } from "@/components/product/ViewItemTracker";
import { CoverGallery } from "@/components/product/CoverGallery";
import { CollapsibleText } from "@/components/product/CollapsibleText";
import { ShareButton } from "@/components/product/ShareButton";
import { KitCompleteBox } from "@/components/product/KitCompleteBox";
import { RememberViewed } from "@/components/book/RememberViewed";
import { ExamFit } from "@/components/product/ExamFit";
import { ConsultCta } from "@/components/ui/ConsultCta";
import { CourseCrossSell } from "@/components/course/CourseCrossSell";
import { StudyPlanCta } from "@/components/plan/StudyPlanCta";
import { BookOpenIcon, CheckIcon, ClockIcon, DownloadIcon, PlayIcon } from "@/components/ui/Icons";
import { ReviewsSection } from "@/components/reviews/ReviewsSection";
import { WishlistButton } from "@/components/wishlist/WishlistButton";
import { CompareToggle } from "@/components/compare/CompareToggle";
import { getBookReviews } from "@/lib/reviews-api";
import { aggregateRating } from "@/lib/reviews";

type Params = Promise<{ slug: string }>;

// One fetch per request for metadata + page (fetch is also deduplicated in real mode).
// The «آزمون من» cookie (P1-3) fills kit_role, so the page renders per request; API responses stay
// cached per URL (60s).
const loadBook = cache(async (rawSlug: string, exam: string | null) => getBook(decodeSlug(rawSlug), exam));

/** Optional data: a failing call hides its feature instead of failing the page. */
async function optional<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

/** schema.org aggregateRating (only with ≥ 3 approved reviews and a real average). */
function withRating(rating: Record<string, unknown> | null): Record<string, unknown> {
  return rating ? { aggregateRating: rating } : {};
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const book = await loadBook(slug, await selectedExamSlug());
  if (!book) return { title: "کتاب پیدا نشد" };
  const title = productTitle(book);
  const description = productDescription(book);
  const path = `/product/${book.slug}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "book",
      locale: "fa_IR",
      title,
      description,
      url: path,
      authors: book.authors.map((a) => a.name),
      isbn: book.isbn || undefined,
      images: book.cover ? [{ url: book.cover, alt: `جلد کتاب ${book.title}` }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const exam = await selectedExamSlug();
  const book = await loadBook(slug, exam);
  if (!book) notFound();

  const printOut = book.formats.includes("PRINT") && !book.print_in_stock;
  const hasOffer = !isEmptyOffer(book.course_offer);
  // P1-5: role in the selected exam's kit (else the first placement when no exam is selected).
  const placement = exam
    ? book.kit_placements.find((k) => k.exam_type.slug === exam)
    : book.kit_placements[0];
  const [related, alternatives, events, examTypes, store, subjects, reviews, kits] = await Promise.all([
    optional(getRelatedBooks(book.slug, { examType: exam }), []),
    printOut ? optional(getRelatedBooks(book.slug, { inStock: true, examType: exam }), []) : Promise.resolve([]),
    optional(getExamEvents(), []),
    optional(getExamTypes(), [] as ExamTypeMini[]),
    optional(getStoreSettings(), null),
    hasOffer ? optional(getSubjects(), [] as SubjectWithCount[]) : Promise.resolve([] as SubjectWithCount[]),
    getBookReviews(book.slug), // never throws; null when unavailable (same cached fetch as ReviewsSection)
    // «کامل‌کردن بسته این درس»: the kit of this book's subject in that exam (cached per exam)
    placement ? optional(getStudyKits(placement.exam_type.slug), [] as StudyKit[]) : Promise.resolve([] as StudyKit[]),
  ]);
  const kit = placement
    ? kits.find((k) => k.exam_type.slug === placement.exam_type.slug && k.subject.slug === placement.subject.slug)
    : undefined;
  const altIds = new Set(alternatives.map((b) => b.id));
  const relatedRest = related.filter((b) => !altIds.has(b.id));

  // P1-6 / P1-16: countdown to the visitor's exam (else the book's earliest exam).
  const now = Date.now();
  const event = pickExamEvent(
    events,
    exam,
    book.exam_types.map((e) => e.slug),
    now,
  );
  const days = event ? daysLeft(event.date, now) : null;
  const examLine = event && days != null && days > 0 ? `${toPersianDigits(days)} روز تا ${event.name}` : null;
  const quickHint = needsQuickReviewHint(book.study_days, days, book.is_quick_review) && book.subjects[0];

  const essential = book.kit_role ? book.kit_role === "essential" : placement?.is_essential;
  const selectedExamName =
    examTypes.find((e) => e.slug === exam)?.name ?? book.exam_types.find((e) => e.slug === exam)?.name ?? null;

  // P1-14
  const proof = [
    book.social_proof.subject_rank && book.subjects[0]
      ? `پرفروش‌ترین #${toPersianDigits(book.social_proof.subject_rank)} ${book.subjects[0].name}`
      : null,
    book.social_proof.season_buyers
      ? `${formatNumber(book.social_proof.season_buyers)} داوطلب این فصل خریده‌اند`
      : null,
  ].filter(Boolean);

  const url = `${siteUrl()}${routes.product(book.slug)}`;
  const category = book.categories[0];
  const crumbs = [
    { name: "خانه", href: "/" },
    ...(category ? [{ name: category.name, href: routes.category(category.slug) }] : []),
    { name: book.title },
  ];
  const jsonLd = [
    { ...bookJsonLd(book, url), ...withRating(aggregateRating(reviews?.summary)) },
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
        // HTML is sanitised and cleaned by the backend (services/description.py) before it reaches the API;
        // the full text stays in the server HTML, the island only clips it.
        <CollapsibleText className="max-w-3xl">
          <div className="rich-text" dangerouslySetInnerHTML={{ __html: book.description }} />
        </CollapsibleText>
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

  const highlightLabel = book.course_offer?.highlight?.relevance_label || null;
  const offer = book.course_offer;
  const teaserNote =
    [
      offer?.free_sample ? "جلسه اول رایگان" : null,
      offer?.discount?.percent ? `${toPersianDigits(offer.discount.percent)}٪ تخفیف دوره‌ها` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;
  const offerSubjects = new Set(book.subjects.map((s) => s.slug));
  const studyPlan = hasOffer ? (
    <StudyPlanCta
      examTypes={examTypes}
      subjects={subjects}
      defaultExam={exam ?? event?.exam_type.slug ?? null}
      defaultSubjects={[...offerSubjects]}
      book={{ slug: book.slug, title: book.title }}
      fixtures={fixturesEnabled()}
      examLine={examLine}
    />
  ) : null;

  const consult = <ConsultCta store={store} exam={selectedExamName} book={book.title} />;
  const samplePages = book.sample_pages.length;
  const studyParts = [
    book.study_days ? `حدود ${toPersianDigits(book.study_days)} روز مطالعه` : null,
    book.pages ? `${formatNumber(book.pages)} صفحه` : null,
  ].filter(Boolean);
  const kitLine = placement
    ? `${essential ? "ضروری" : "تکمیلی"} در بسته مطالعاتی ${placement.exam_type.name} · ${placement.subject.name}`
    : null;

  return (
    <PurchaseProvider
      bookId={book.id}
      bookTitle={book.title}
      variants={book.variants}
      course={book.related_courses[0]}
      bookSlug={book.slug}
      courseTeaser={hasOffer}
      courseTeaserNote={teaserNote}
      store={store}
      examLine={examLine}
      lowTime={isLowTime(days)}
      sheetBook={{
        id: book.id,
        title: book.title,
        cover: book.cover,
        subjects: book.subjects,
        authors: book.authors,
        volumes: book.volumes,
        variants: book.variants,
      }}
      related={relatedRest.find((b) => b.in_stock) ?? null}
      ebookFormats={book.ebook_formats ?? []}
      pages={book.pages}
    >
      <div className="mx-auto max-w-site px-4 pt-2 md:pt-4">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
        <ViewItemTracker id={book.id} name={book.title} price={book.min_price} subject={book.subjects[0]?.slug} />
        <RememberViewed book={{ id: book.id, slug: book.slug, title: book.title, cover: book.cover, subjects: book.subjects.slice(0, 1), authors: book.authors.slice(0, 2), volumes: book.volumes }} />
        <Breadcrumb items={crumbs} />

        <div className="mt-2 grid gap-6 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] md:gap-8 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)_minmax(0,22rem)]">
          {/* media + sample CTA (above the fold on mobile, P1-4) */}
          <div className="flex flex-col gap-3">
            <BookTilt className="mx-auto w-full max-w-[12rem] md:max-w-none">
              <CoverGallery cover={book.cover} pages={book.sample_pages} title={book.title}>
                <BookCover
                  title={book.title}
                  cover={book.cover}
                  subjects={book.subjects}
                  authors={book.authors}
                  volumes={book.volumes}
                  variant="product"
                  priority
                  sizes="(min-width: 1024px) 240px, (min-width: 768px) 212px, 150px"
                />
              </CoverGallery>
            </BookTilt>
            {(samplePages > 0 || book.sample_pdf) && (
              <div className="flex flex-col gap-2">
                {samplePages > 0 && <SamplePagesViewer pages={book.sample_pages} title={book.title} />}
                {book.sample_pdf && (
                  <a
                    href={book.sample_pdf}
                    target="_blank"
                    rel="noopener"
                    className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-bold text-primary hover:bg-primary-soft ${
                      samplePages > 0 ? "" : "border-2 border-primary bg-surface"
                    }`}
                  >
                    {samplePages > 0 ? <DownloadIcon size={18} /> : <BookOpenIcon size={20} />}
                    {samplePages > 0 ? "دانلود نمونه PDF" : "ورق بزنید (نمونه PDF)"}
                    <span className="sr-only">(در زبانه جدید باز می‌شود)</span>
                  </a>
                )}
              </div>
            )}
            {book.intro_video_url && (
              <div className="hidden md:block">
                <IntroVideo url={book.intro_video_url} title={book.title} />
              </div>
            )}
          </div>

          {/* info — phones: title, then the buy box, then fit/specs (research #10); tablet: buy box last */}
          <div className="flex min-w-0 flex-col">
            <div>
            {(book.edition_badge || book.law_updated_until || highlightLabel) && (
              <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                {highlightLabel && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 font-bold text-accent-ink">
                    <PlayIcon size={12} className="shrink-0" />
                    {highlightLabel}
                  </span>
                )}
                {book.edition_badge && (
                  <span className="rounded-md bg-primary-soft px-2 py-0.5 font-bold text-primary">{book.edition_badge}</span>
                )}
                {book.law_updated_until && (
                  <span className="text-ink-muted">به‌روز تا: {book.law_updated_until}</span>
                )}
              </p>
            )}
            <div className="flex items-start gap-2">
              <h1 className="min-w-0 flex-1 text-xl font-black leading-9 text-ink md:text-2xl md:leading-[2.75rem]">{book.title}</h1>
              <ShareButton url={url} title={book.title} text={`کتاب «${book.title}» در فروشگاه دادرُز`} className="shrink-0" />
              <WishlistButton bookId={book.id} bookTitle={book.title} className="shrink-0" />
            </div>
            <CompareToggle book={{ id: book.id, slug: book.slug, title: book.title }} variant="button" className="mt-2 inline-flex" />
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
            {proof.length > 0 && (
              <p className="mt-2 text-sm font-bold text-accent-ink">{proof.join(" · ")}</p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {book.subjects.map((s) => (
                <SubjectTag key={s.id} subject={s} link size="md" />
              ))}
            </div>
            </div>

            {/* buy box sits in the info column on phones/tablet, in its own column on desktop */}
            <div className="mt-6 md:order-last lg:hidden">
              <PurchasePanel footer={consult} />
            </div>

            <div>

            <ExamFit all={examTypes} fits={book.exam_types} className="mt-4" />

            {(kitLine || book.course_badge || studyParts.length > 0) && (
              <ul className="mt-4 space-y-2 text-sm leading-7 text-ink">
                {kitLine && (
                  <li className="flex items-start gap-2">
                    <CheckIcon
                      size={18}
                      strokeWidth={2.4}
                      className={`mt-1 shrink-0 ${essential ? "text-success" : "text-ink-muted"}`}
                    />
                    <span className={essential ? "font-bold" : ""}>{kitLine}</span>
                  </li>
                )}
                {book.course_badge && (
                  <li className="flex items-start gap-2">
                    <PlayIcon size={18} className="mt-1 shrink-0 text-primary" />
                    {hasOffer ? (
                      <a href="#courses" className="underline decoration-line-strong underline-offset-4 hover:decoration-primary">
                        تدریس‌شده در دوره «{book.course_badge}»
                      </a>
                    ) : (
                      <span>تدریس‌شده در دوره «{book.course_badge}»</span>
                    )}
                  </li>
                )}
                {studyParts.length > 0 && (
                  <li className="flex items-start gap-2">
                    <ClockIcon size={18} className="mt-1 shrink-0 text-primary" />
                    <span>{studyParts.join(" · ")}</span>
                  </li>
                )}
              </ul>
            )}
            {quickHint && days != null && (
              <p className="mt-3 rounded-control bg-warning-soft px-3 py-2 text-sm leading-7 text-warning">
                با {toPersianDigits(days)} روز مانده،{" "}
                <Link
                  prefetch={false}
                  href={routes.search({ subject: quickHint.slug, resource_type: "QUICK_REVIEW" })}
                  className="font-bold underline underline-offset-4"
                >
                  نسخه سریع‌خوان این درس
                </Link>{" "}
                را هم ببینید.
              </p>
            )}

            {facts.length > 0 && (
              <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line text-sm sm:grid-cols-3">
                {facts.map(([k, v]) => (
                  <div key={k} className="bg-surface px-3 py-2.5 last:odd:col-span-2 sm:last:odd:col-span-1">
                    <dt className="text-xs text-ink-muted">{k}</dt>
                    <dd className="mt-0.5 font-bold text-ink">
                      <bdi>{v}</bdi>
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            </div>
            {book.intro_video_url && (
              <div className="order-last mt-6 md:hidden">
                <IntroVideo url={book.intro_video_url} title={book.title} />
              </div>
            )}
          </div>

          <aside className="hidden lg:block" aria-label="خرید">
            <div className="sticky top-4">
              <PurchasePanel footer={consult} />
            </div>
          </aside>
        </div>

        {kit && (
          <div className="mt-8 md:mt-10 lg:max-w-4xl">
            <KitCompleteBox
              kit={kit}
              book={{
                id: book.id,
                title: book.title,
                slug: book.slug,
                cover: book.cover,
                subjects: book.subjects,
                authors: book.authors,
                volumes: book.volumes,
              }}
            />
          </div>
        )}

        {hasOffer && (
          <div className="mt-8 md:mt-10">
            <CourseCrossSell offer={book.course_offer} book={book} now={now} studyPlan={studyPlan} />
          </div>
        )}

        {alternatives.length > 0 && (
          <section aria-labelledby="alternatives-title" className="mt-10">
            <SectionHeader
              id="alternatives-title"
              title="جایگزین‌های موجود همین درس"
              subtitle="تا موجود شدن نسخه چاپی، این منابع همین حالا آماده ارسال یا مطالعه‌اند"
            />
            <BookRail books={alternatives} labelledBy="alternatives-title" />
          </section>
        )}

        <section className="mt-10" aria-label="جزئیات کتاب">
          <ProductTabs tabs={tabs} />
        </section>

        {relatedRest.length > 0 && (
          <section aria-labelledby="related-title" className="mt-10">
            <SectionHeader id="related-title" title="دانشجویان این کتاب‌ها را هم خریدند" />
            <BookRail books={relatedRest} labelledBy="related-title" />
          </section>
        )}

        <ReviewsSection slug={book.slug} examTypes={book.exam_types} />

        <StickyBuyBar />
      </div>
    </PurchaseProvider>
  );
}
