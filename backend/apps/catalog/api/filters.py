import django_filters
from django.db.models import Exists, F, OuterRef

from ..models import Book, BookVariant
from ..services.books import category_descendant_ids
from ..services.search import search_books

TRUE_VALUES = {"true", "1", "yes"}
FORMAT_MAP = {"print": "PRINT", "ebook": "EBOOK", "bundle": "BUNDLE"}
ORDERING_MAP = {
    "-sales_count": [F("sales_count").desc(), "id"],
    "price": [F("min_price").asc(nulls_last=True), "id"],
    "-price": [F("min_price").desc(nulls_last=True), "id"],
    "-created_at": ["-created_at", "-id"],
    "title": ["title", "id"],
}
DEFAULT_ORDERING = "-sales_count"


def _multi(data, name: str) -> list[str]:
    raw = data.getlist(name) if hasattr(data, "getlist") else [data.get(name, "")]
    values: list[str] = []
    for item in raw:
        values.extend(v.strip() for v in str(item).split(",") if v.strip())
    return values


class BookFilter(django_filters.FilterSet):
    q = django_filters.CharFilter(method="filter_q")
    subject = django_filters.CharFilter(method="filter_subject")
    exam_type = django_filters.CharFilter(method="filter_exam_type")
    category = django_filters.CharFilter(method="filter_category")
    format = django_filters.CharFilter(method="filter_format")
    min_price = django_filters.NumberFilter(field_name="min_price", lookup_expr="gte")
    max_price = django_filters.NumberFilter(field_name="min_price", lookup_expr="lte")
    in_stock = django_filters.CharFilter(method="filter_in_stock")
    featured = django_filters.CharFilter(method="filter_featured")
    quick_review = django_filters.CharFilter(method="filter_quick_review")
    ordering = django_filters.CharFilter(method="filter_ordering")

    class Meta:
        model = Book
        fields: list[str] = []

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        if not self.form.cleaned_data.get("ordering"):
            queryset = queryset.order_by(*ORDERING_MAP[DEFAULT_ORDERING])
        return queryset

    def filter_q(self, queryset, name, value):
        return search_books(queryset, value)

    def _m2m_slug_filter(self, queryset, name, through_field):
        slugs = _multi(self.data, name)
        if not slugs:
            return queryset
        through = getattr(Book, through_field).through
        target = Book._meta.get_field(through_field).related_model._meta.model_name
        return queryset.filter(
            Exists(through.objects.filter(book_id=OuterRef("pk"), **{f"{target}__slug__in": slugs}))
        )

    def filter_subject(self, queryset, name, value):
        return self._m2m_slug_filter(queryset, name, "subjects")

    def filter_exam_type(self, queryset, name, value):
        return self._m2m_slug_filter(queryset, name, "exam_types")

    def filter_category(self, queryset, name, value):
        slugs = _multi(self.data, name)
        if not slugs:
            return queryset
        ids = category_descendant_ids(slugs)
        return queryset.filter(
            Exists(
                Book.categories.through.objects.filter(book_id=OuterRef("pk"), category_id__in=ids)
            )
        )

    def filter_format(self, queryset, name, value):
        types = [FORMAT_MAP[v.lower()] for v in _multi(self.data, name) if v.lower() in FORMAT_MAP]
        if not types:
            return queryset
        return queryset.filter(
            Exists(
                BookVariant.objects.filter(book_id=OuterRef("pk"), is_active=True, type__in=types)
            )
        )

    def filter_in_stock(self, queryset, name, value):
        return queryset.filter(has_stock=True) if value.lower() in TRUE_VALUES else queryset

    def filter_featured(self, queryset, name, value):
        return queryset.filter(is_featured=True) if value.lower() in TRUE_VALUES else queryset

    def filter_quick_review(self, queryset, name, value):
        return queryset.filter(is_quick_review=True) if value.lower() in TRUE_VALUES else queryset

    def filter_ordering(self, queryset, name, value):
        return queryset.order_by(*ORDERING_MAP.get(value, ORDERING_MAP[DEFAULT_ORDERING]))
