from apps.catalog.models import Book

from ..models import Highlight

MAX_RECTS = 50
MAX_PER_BOOK = 2000


class HighlightLimit(ValueError):
    pass


def clean_rects(rects) -> list[dict]:
    """Keep only well-formed page-fraction rectangles, clamped to the page box."""
    if not isinstance(rects, list):
        raise ValueError("rects باید فهرست باشد.")
    if len(rects) > MAX_RECTS:
        raise ValueError(f"حداکثر {MAX_RECTS} مستطیل مجاز است.")
    out = []
    for r in rects:
        if not isinstance(r, dict):
            raise ValueError("هر مستطیل باید شیء {x,y,w,h} باشد.")
        try:
            x, y, w, h = (float(r[k]) for k in ("x", "y", "w", "h"))
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("هر مستطیل باید x، y، w و h عددی داشته باشد.") from exc
        x, y = min(max(x, 0.0), 1.0), min(max(y, 0.0), 1.0)
        w, h = min(max(w, 0.0), 1.0 - x), min(max(h, 0.0), 1.0 - y)
        if w > 0 and h > 0:
            out.append({k: round(v, 5) for k, v in zip("xywh", (x, y, w, h), strict=True)})
    return out


def user_highlights(user, book: Book, page: int | None = None):
    qs = Highlight.objects.filter(user=user, book=book)
    if page is not None:
        qs = qs.filter(page=page)
    return qs.order_by("page", "created_at", "id")


def create_highlight(user, book: Book, **data) -> Highlight:
    if Highlight.objects.filter(user=user, book=book).count() >= MAX_PER_BOOK:
        raise HighlightLimit("به سقف تعداد هایلایت این کتاب رسیده‌اید.")
    return Highlight.objects.create(user=user, book=book, **data)
