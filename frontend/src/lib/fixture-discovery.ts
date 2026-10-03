import type {
  BookCard,
  BookDetail,
  BookFacets,
  BookQuery,
  CategoryMini,
  CategoryNode,
  Paginated,
  ResourceType,
  SearchSuggestions,
  StudyKit,
  VariantType,
} from "./types";

/**
 * Fixture stand-ins for the Phase 2 discovery endpoints (USE_API_FIXTURES=1 only). They mimic the
 * backend closely enough for local UI work and tests; the backend is the source of truth.
 */

const FORMAT_LABELS: Record<VariantType, string> = {
  PRINT: "نسخه چاپی",
  EBOOK: "نسخه الکترونیک",
  BUNDLE: "چاپی + الکترونیک",
};

/** Same idea as apps.core.normalize: Arabic letters → Persian, ZWNJ/space-insensitive, lower case. */
export function fixtureNormalize(text: string): string {
  return text
    .replace(/ي|ى/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ۀ|ة/g, "ه")
    .replace(/[ً-ٟـ]/g, "")
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/‌/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function haystack(b: BookDetail): string {
  const parts = [b.title, b.subtitle, b.isbn, b.publisher?.name ?? "", ...b.authors.map((a) => a.name), ...b.subjects.map((s) => s.name)];
  const text = fixtureNormalize(parts.join(" | "));
  return `${text} | ${text.replace(/ /g, "")}`;
}

function matchesQ(b: BookDetail, q: string | undefined): boolean {
  const tokens = fixtureNormalize(q ?? "").split(" ").filter(Boolean);
  if (!tokens.length) return true;
  const h = haystack(b);
  return tokens.every((t) => h.includes(t));
}

type Facet = "subject" | "exam_type" | "format" | "resource_type" | "in_stock" | "price";

function applyFilters(books: BookDetail[], query: BookQuery, skip: Facet | null = null): BookDetail[] {
  return books.filter((b) => {
    if (!matchesQ(b, query.q)) return false;
    if (skip !== "subject" && query.subject?.length && !b.subjects.some((s) => query.subject!.includes(s.slug))) return false;
    if (skip !== "exam_type" && query.exam_type?.length && !b.exam_types.some((e) => query.exam_type!.includes(e.slug)))
      return false;
    if (query.category && !b.categories.some((c) => c.slug === query.category)) return false;
    if (skip !== "format" && query.format?.length && !b.formats.some((f) => query.format!.includes(f.toLowerCase())))
      return false;
    if (skip !== "resource_type" && query.resource_type?.length && !query.resource_type.map((r) => r.toUpperCase()).includes(b.resource_type))
      return false;
    if (skip !== "in_stock" && query.in_stock && !b.in_stock) return false;
    if (query.has_sample && !b.has_sample) return false;
    if (query.quick_review && !b.is_quick_review) return false;
    if (skip !== "price") {
      if (query.min_price !== undefined && (b.min_price === null || b.min_price < query.min_price)) return false;
      if (query.max_price !== undefined && (b.min_price === null || b.min_price > query.max_price)) return false;
    }
    return true;
  });
}

function sortBooks(books: BookDetail[], ordering: BookQuery["ordering"]): BookDetail[] {
  const price = (b: BookDetail) => b.min_price ?? Number.MAX_SAFE_INTEGER;
  const out = [...books];
  switch (ordering) {
    case "price":
      return out.sort((a, b) => price(a) - price(b) || a.id - b.id);
    case "-price":
      return out.sort((a, b) => (b.min_price ?? -1) - (a.min_price ?? -1) || a.id - b.id);
    case "-created_at":
      return out.sort((a, b) => b.id - a.id);
    case "title":
      return out.sort((a, b) => a.title.localeCompare(b.title, "fa"));
    default:
      return out; // fixtures are already in sales order
  }
}

function toCard(b: BookDetail): BookCard {
  const card: Record<string, unknown> = { ...b };
  for (const k of [
    "publisher", "translators", "categories", "edition", "publish_year", "pages", "isbn", "description",
    "table_of_contents", "study_plan_note", "study_days", "sample_pdf", "sample_pages", "intro_video_url",
    "variants", "related_courses", "kit_placements", "is_featured", "updated_at", "course_offer",
  ])
    delete card[k];
  return card as unknown as BookCard;
}

export function fixtureBookList(books: BookDetail[], query: BookQuery): Paginated<BookCard> {
  const all = sortBooks(applyFilters(books, query), query.ordering);
  const size = Math.min(query.page_size ?? 24, 48);
  const page = Math.max(query.page ?? 1, 1);
  const results = all.slice((page - 1) * size, page * size).map(toCard);
  return {
    count: all.length,
    next: page * size < all.length ? `?page=${page + 1}` : null,
    previous: page > 1 ? `?page=${page - 1}` : null,
    results,
  };
}

export function fixtureFacets(books: BookDetail[], query: BookQuery): BookFacets {
  const count = applyFilters(books, query).length;

  const subjects = new Map<string, { slug: string; name: string; color: string; count: number }>();
  for (const b of applyFilters(books, query, "subject"))
    for (const s of b.subjects) {
      const e = subjects.get(s.slug) ?? { slug: s.slug, name: s.name, color: s.color, count: 0 };
      e.count += 1;
      subjects.set(s.slug, e);
    }

  const exams = new Map<string, { slug: string; name: string; count: number }>();
  for (const b of applyFilters(books, query, "exam_type"))
    for (const e of b.exam_types) {
      const x = exams.get(e.slug) ?? { slug: e.slug, name: e.name, count: 0 };
      x.count += 1;
      exams.set(e.slug, x);
    }

  const fmtBooks = applyFilters(books, query, "format");
  const formats = (["PRINT", "EBOOK", "BUNDLE"] as VariantType[])
    .map((value) => ({ value, label: FORMAT_LABELS[value], count: fmtBooks.filter((b) => b.formats.includes(value)).length }))
    .filter((f) => f.count > 0);

  const rtBooks = applyFilters(books, query, "resource_type");
  const rts = new Map<ResourceType, { value: ResourceType; label: string; count: number }>();
  for (const b of rtBooks) {
    const e = rts.get(b.resource_type) ?? { value: b.resource_type, label: b.resource_type_label, count: 0 };
    e.count += 1;
    rts.set(b.resource_type, e);
  }

  const inStock = applyFilters(books, { ...query, in_stock: true }).length;
  const prices = applyFilters(books, query, "price")
    .map((b) => b.min_price)
    .filter((p): p is number => p !== null);

  return {
    count,
    subjects: [...subjects.values()],
    exam_types: [...exams.values()],
    formats,
    resource_types: [...rts.values()],
    in_stock: inStock,
    price: { min: prices.length ? Math.min(...prices) : null, max: prices.length ? Math.max(...prices) : null },
  };
}

function flattenCategories(nodes: CategoryNode[]): CategoryMini[] {
  return nodes.flatMap((n) => [{ id: n.id, name: n.name, slug: n.slug }, ...flattenCategories(n.children)]);
}

export function fixtureSuggest(books: BookDetail[], categories: CategoryNode[], q: string): SearchSuggestions {
  const nq = fixtureNormalize(q);
  const hits = books.filter((b) => matchesQ(b, q));
  const subjects = new Map<string, BookDetail["subjects"][number]>();
  const authors = new Map<string, BookDetail["authors"][number]>();
  for (const b of books) {
    for (const s of b.subjects) if (fixtureNormalize(s.name).includes(nq)) subjects.set(s.slug, s);
    for (const a of b.authors) if (fixtureNormalize(a.name).includes(nq)) authors.set(a.slug, a);
  }
  return {
    q,
    books: hits.slice(0, 6).map((b) => ({
      id: b.id,
      title: b.title,
      slug: b.slug,
      cover: b.cover,
      subjects: b.subjects,
      authors: b.authors,
      card_price: b.card_price,
    })),
    subjects: [...subjects.values()].slice(0, 4),
    categories: flattenCategories(categories)
      .filter((c) => fixtureNormalize(c.name).includes(nq))
      .slice(0, 4),
    authors: [...authors.values()].slice(0, 4),
  };
}

export function fixtureStudyKits(
  books: BookDetail[],
  weights: Record<string, Record<string, number>>,
  examType: string | null,
): StudyKit[] {
  const kits = new Map<string, StudyKit>();
  for (const b of books) {
    for (const p of b.kit_placements) {
      if (examType && p.exam_type.slug !== examType) continue;
      const key = `${p.exam_type.slug}|${p.subject.slug}`;
      const kit =
        kits.get(key) ??
        ({ exam_type: p.exam_type, subject: p.subject, note: "", weight: weights[p.exam_type.slug]?.[p.subject.slug] ?? null, items: [] } as StudyKit);
      const role = examType ? (p.is_essential ? "essential" : "optional") : null;
      kit.items.push({ order: p.order, is_essential: p.is_essential, book: { ...toCard(b), kit_role: role, variants: b.variants } });
      kits.set(key, kit);
    }
  }
  const out = [...kits.values()];
  for (const k of out) k.items.sort((a, b) => a.order - b.order);
  return out.sort((a, b) => (b.weight ?? -1) - (a.weight ?? -1));
}
