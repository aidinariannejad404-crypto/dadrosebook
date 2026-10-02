from django.conf import settings
from django.db.models import Prefetch
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from rest_framework import generics
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Book, BookSamplePage, Category, ExamType, RelatedCourse
from ..services.books import active_category_tree, book_card_queryset
from ..services.home import get_home_data, subjects_with_book_count, upcoming_exam_events
from ..services.related import related_books
from ..services.study_kits import kit_placements, study_kits
from . import serializers as s
from .filters import BookFilter, _multi


def get_or_404(queryset, message: str, **lookup):
    obj = queryset.filter(**lookup).first()
    if obj is None:
        raise NotFound(message)
    return obj


BOOK_NOT_FOUND = "کتاب پیدا نشد."
CATEGORY_NOT_FOUND = "دسته‌بندی پیدا نشد."


@method_decorator(cache_page(settings.HOME_CACHE_SECONDS), name="get")
class HomeView(APIView):
    def get(self, request):
        return Response(s.HomeSerializer(get_home_data(), context={"request": request}).data)


class BookListView(generics.ListAPIView):
    serializer_class = s.BookCardSerializer
    filterset_class = BookFilter

    def get_queryset(self):
        return book_card_queryset()


class BookDetailView(generics.RetrieveAPIView):
    serializer_class = s.BookDetailSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return book_card_queryset(Book.objects.select_related("publisher")).prefetch_related(
            "translators",
            "categories",
            Prefetch("sample_pages", queryset=BookSamplePage.objects.order_by("order", "id")),
            Prefetch("related_courses", queryset=RelatedCourse.objects.order_by("order", "id")),
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if getattr(self, "_book", None) is not None:
            context["kit_placements"] = kit_placements(self._book)
        return context

    def get_object(self):
        return get_or_404(self.get_queryset(), BOOK_NOT_FOUND, slug=self.kwargs["slug"])

    def retrieve(self, request, *args, **kwargs):
        self._book = self.get_object()
        return Response(self.get_serializer(self._book).data)


class RelatedBooksView(APIView):
    def get(self, request, slug):
        book = get_or_404(Book.objects.all(), BOOK_NOT_FOUND, slug=slug, is_active=True)
        books = related_books(book)
        return Response(s.BookCardSerializer(books, many=True, context={"request": request}).data)


class SubjectListView(generics.ListAPIView):
    serializer_class = s.SubjectWithCountSerializer
    pagination_class = None

    def get_queryset(self):
        return subjects_with_book_count()


class ExamTypeListView(generics.ListAPIView):
    serializer_class = s.ExamTypeMiniSerializer
    pagination_class = None

    def get_queryset(self):
        return ExamType.objects.filter(is_active=True).order_by("order", "id")


class CategoryTreeView(APIView):
    def get(self, request):
        return Response(s.CategoryNodeSerializer(active_category_tree(), many=True).data)


class CategoryDetailView(APIView):
    def get(self, request, slug):
        category = get_or_404(
            Category.objects.select_related("parent"), CATEGORY_NOT_FOUND, slug=slug, is_active=True
        )
        all_active = list(Category.objects.filter(is_active=True).order_by("order", "id"))
        node = _subtree(category, all_active)
        return Response(s.CategoryDetailSerializer().to_representation(node))


def _subtree(root: Category, categories: list[Category]) -> dict:
    by_parent: dict[int, list[Category]] = {}
    for c in categories:
        if c.parent_id:
            by_parent.setdefault(c.parent_id, []).append(c)

    def build(cat: Category) -> dict:
        return {"category": cat, "children": [build(ch) for ch in by_parent.get(cat.id, [])]}

    return build(root)


class ExamEventListView(generics.ListAPIView):
    serializer_class = s.ExamEventSerializer
    pagination_class = None

    def get_queryset(self):
        return upcoming_exam_events()


class StudyKitListView(APIView):
    def get(self, request):
        kits = study_kits(
            exam_type=request.query_params.get("exam_type") or None,
            subjects=_multi(request.query_params, "subject"),
        )
        return Response(s.StudyKitSerializer(kits, many=True, context={"request": request}).data)
