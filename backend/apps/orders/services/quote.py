"""Checkout quote: re-price the client's items from the DB and total them.

``build_quote(...)`` returns the contract's ``Quote`` dict. ``compute(...)`` returns the same quote
plus the model objects checkout needs (variants, discount code, shipping method).
"""

from dataclasses import dataclass, field

from django.db.models import Prefetch

from apps.core.money import to_persian_digits

from ..models import ShippingMethod
from . import discounts, shipping

MAX_LINES = 30
MAX_QUANTITY = 20
SHIPPED_TYPES = ("PRINT", "BUNDLE")
DIGITAL_TYPES = ("EBOOK", "BUNDLE")

PROBLEM_MESSAGES = {
    "inactive": "این کالا دیگر فروخته نمی‌شود.",
    "placeholder_price": "قیمت این کالا هنوز نهایی نشده و فعلاً قابل خرید نیست.",
    "out_of_stock": "این کالا ناموجود است.",
}


def insufficient_message(available: int) -> str:
    return f"فقط {to_persian_digits(available)} عدد از این کالا موجود است."


@dataclass
class Pricing:
    quote: dict
    variants: dict = field(default_factory=dict)  # variant_id → BookVariant
    discount_code: object = None
    shipping_method: ShippingMethod | None = None


def merge_items(items) -> list[tuple[int, int]]:
    """Merge duplicate variant lines (keeping first-seen order); quantity clamped to 1..20."""
    merged: dict[int, int] = {}
    for item in items:
        variant_id = int(item["variant_id"])
        merged[variant_id] = merged.get(variant_id, 0) + int(item.get("quantity") or 1)
    return [(vid, max(1, min(MAX_QUANTITY, qty))) for vid, qty in merged.items()]


def cover_url(book, build_url=None) -> str | None:
    if not book.cover:
        return None
    url = book.cover.url
    return build_url(url) if build_url else url


def subject_color(book) -> str | None:
    subjects = list(book.subjects.all())
    if not subjects:
        return None
    return min(subjects, key=lambda s: (s.order, s.pk)).color


def book_title(book) -> str:
    return f"{book.title} — {book.subtitle}" if book.subtitle else book.title


def load_variants(variant_ids):
    from apps.catalog.models import BookVariant, Subject

    qs = BookVariant.objects.filter(pk__in=variant_ids).select_related("book")
    qs = qs.prefetch_related(
        Prefetch("book__subjects", queryset=Subject.objects.order_by("order", "id"))
    )
    return {v.pk: v for v in qs}


def stock_problem(variant, quantity: int) -> dict | None:
    """Stock check for PRINT/BUNDLE (a bundle uses its own ``stock``)."""
    if variant.type not in SHIPPED_TYPES:
        return None
    if variant.stock <= 0:
        return {
            "variant_id": variant.pk,
            "code": "out_of_stock",
            "message": PROBLEM_MESSAGES["out_of_stock"],
        }
    if quantity > variant.stock:
        return {
            "variant_id": variant.pk,
            "code": "insufficient_stock",
            "message": insufficient_message(variant.stock),
        }
    return None


def variant_problem(variant, quantity: int) -> dict | None:
    if not variant.is_active or not variant.book.is_active:
        return {
            "variant_id": variant.pk,
            "code": "inactive",
            "message": PROBLEM_MESSAGES["inactive"],
        }
    if variant.price_is_placeholder:
        return {
            "variant_id": variant.pk,
            "code": "placeholder_price",
            "message": PROBLEM_MESSAGES["placeholder_price"],
        }
    return stock_problem(variant, quantity)


def compute(
    items,
    *,
    user=None,
    address=None,
    province=None,
    shipping_method_id=None,
    discount_code=None,
    build_url=None,
) -> Pricing:
    merged = merge_items(items)
    variants = load_variants([vid for vid, _ in merged])
    lines, problems = [], []
    for variant_id, quantity in merged:
        variant = variants.get(variant_id)
        if variant is None:
            problems.append(
                {
                    "variant_id": variant_id,
                    "code": "inactive",
                    "message": PROBLEM_MESSAGES["inactive"],
                }
            )
            continue
        if variant.type == "EBOOK":
            quantity = 1
        problem = variant_problem(variant, quantity)
        if problem:
            problems.append(problem)
        book = variant.book
        unit_price = variant.effective_price
        is_shipped = variant.type in SHIPPED_TYPES
        lines.append(
            {
                "variant_id": variant.pk,
                "book_id": book.pk,
                "book_slug": book.slug,
                "title": book_title(book),
                "cover": cover_url(book, build_url),
                "subject_color": subject_color(book),
                "variant_type": variant.type,
                "variant_type_label": variant.get_type_display(),
                "quantity": quantity,
                "list_price": variant.price,
                "unit_price": unit_price,
                "line_total": unit_price * quantity,
                "in_stock": variant.in_stock,
                "available_quantity": variant.stock if is_shipped else None,
            }
        )

    # --- retention stream (ه۲): owners of an older edition get the upgrade discount ---
    from apps.study.services.editions import apply_upgrade_discounts

    upgrade_total = apply_upgrade_discounts(lines, user)
    # --- end retention stream ---

    items_total = sum(line["line_total"] for line in lines)
    needs_shipping = any(line["variant_type"] in SHIPPED_TYPES for line in lines)
    ebook_now = any(line["variant_type"] in DIGITAL_TYPES for line in lines)

    discount, discount_error, discount_obj, discount_amount = None, None, None, 0
    if discount_code and str(discount_code).strip():
        try:
            discount_obj, discount_amount = discounts.validate(discount_code, lines, user=user)
        except discounts.DiscountError as exc:
            discount_error = exc.message
        else:
            discount = {
                "code": discount_obj.code,
                "amount": discount_amount,
                "label": discounts.label_for(discount_obj),
            }

    # --- growth (و۶): a running campaign's discount applies automatically (best of code/campaign)
    from apps.growth.services.campaigns import apply_auto_discount

    discount, discount_error, discount_obj, discount_amount = apply_auto_discount(
        lines, user, discount, discount_error, discount_obj, discount_amount
    )
    # --- end growth ---

    if address is not None:
        province = address.province

    shipping_option, shipping_total, method, remaining = None, 0, None, None
    if needs_shipping:
        if shipping_method_id:
            method = ShippingMethod.objects.filter(pk=shipping_method_id, is_active=True).first()
            if method is not None and not shipping.is_allowed(method, province):
                method = None
        if method is not None:
            shipping_option = shipping.option_for(method, items_total)
            shipping_total = shipping_option["price"]
        remaining = shipping.free_shipping_remaining(items_total, method, province=province)

    quote = {
        "lines": lines,
        "items_total": items_total,
        "discount": discount,
        "discount_error": discount_error,
        "needs_shipping": needs_shipping,
        "shipping": shipping_option,
        "shipping_total": shipping_total,
        "total": items_total - discount_amount + shipping_total,
        "free_shipping_remaining": remaining,
        "ebook_now": ebook_now,
        "problems": problems,
        "upgrade_discount_total": upgrade_total,  # retention stream: already in items_total
    }
    return Pricing(
        quote=quote, variants=variants, discount_code=discount_obj, shipping_method=method
    )


def build_quote(
    items,
    *,
    user=None,
    address=None,
    province=None,
    shipping_method_id=None,
    discount_code=None,
    build_url=None,
) -> dict:
    return compute(
        items,
        user=user,
        address=address,
        province=province,
        shipping_method_id=shipping_method_id,
        discount_code=discount_code,
        build_url=build_url,
    ).quote
