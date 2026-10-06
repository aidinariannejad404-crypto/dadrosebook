import type { BookCard, Cart, StudyKit, Variant } from "@/lib/types";
import { defaultVariant, isPurchasable } from "@/lib/variants";

/** What to offer after an add: the bundle (or ebook) upgrade for print-only, else a related book. */
export type Suggestion =
  | { kind: "upgrade"; to: Variant; extra: number }
  | { kind: "ebook"; to: Variant }
  | { kind: "related"; book: BookCard }
  | null;

export function pickSuggestion(added: Variant, variants: Variant[], cart: Cart, related: BookCard | null | undefined): Suggestion {
  const inCart = new Set(cart.items.map((i) => i.variant.id));
  if (added.type === "PRINT") {
    const bundle = variants.find((v) => v.type === "BUNDLE" && isPurchasable(v));
    if (bundle && !inCart.has(bundle.id)) return { kind: "upgrade", to: bundle, extra: Math.max(0, bundle.effective_price - added.effective_price) };
    const ebook = variants.find((v) => v.type === "EBOOK" && isPurchasable(v));
    if (ebook && !inCart.has(ebook.id)) return { kind: "ebook", to: ebook };
  }
  return related ? { kind: "related", book: related } : null;
}

export interface KitRow {
  book: Pick<BookCard, "id" | "title" | "slug" | "cover" | "subjects" | "authors" | "volumes">;
  variant: Variant;
  essential: boolean;
  current: boolean;
}

/** Up to `max` other purchasable books of the kit, in kit order (essential first within order). */
export function kitRows(kit: StudyKit, currentId: number, max = 3): KitRow[] {
  return kit.items
    .filter((i) => i.book.id !== currentId)
    .map((i) => ({ item: i, variant: defaultVariant(i.book.variants) }))
    .filter((x): x is { item: StudyKit["items"][number]; variant: Variant } => x.variant != null && isPurchasable(x.variant))
    .sort((a, b) => Number(b.item.is_essential) - Number(a.item.is_essential) || a.item.order - b.item.order)
    .slice(0, max)
    .map(({ item, variant }) => ({ book: item.book, variant, essential: item.is_essential, current: false }));
}
