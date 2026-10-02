"""Serializers for the Phase 1 catalog API. Shapes are fixed by ``docs/api-contract.md``."""

from rest_framework import serializers

from apps.content.models import Banner, GuideVideo

from ..models import (
    Book,
    BookSamplePage,
    BookVariant,
    Category,
    ExamEvent,
    ExamType,
    Person,
    Publisher,
    RelatedCourse,
    Subject,
)
from ..services.books import sorted_variants
from ..services.pricing import book_min_price


class SubjectMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ["id", "name", "slug", "color"]


class SubjectWithCountSerializer(SubjectMiniSerializer):
    book_count = serializers.IntegerField(read_only=True)

    class Meta(SubjectMiniSerializer.Meta):
        fields = [*SubjectMiniSerializer.Meta.fields, "book_count"]


class ExamTypeMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamType
        fields = ["id", "name", "slug", "short_name"]


class PersonMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Person
        fields = ["id", "name", "slug"]


class PublisherMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Publisher
        fields = ["id", "name", "slug"]


class CategoryMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug"]


class VariantSerializer(serializers.ModelSerializer):
    type_label = serializers.CharField(source="get_type_display")
    effective_price = serializers.IntegerField()
    discount_percent = serializers.IntegerField()
    in_stock = serializers.BooleanField()
    stock = serializers.SerializerMethodField()

    class Meta:
        model = BookVariant
        fields = [
            "id",
            "type",
            "type_label",
            "price",
            "sale_price",
            "effective_price",
            "discount_percent",
            "in_stock",
            "stock",
            "price_is_placeholder",
        ]

    def get_stock(self, obj: BookVariant) -> int | None:
        return None if obj.type == BookVariant.Type.EBOOK else obj.stock


def _active_variants(book: Book) -> list[BookVariant]:
    variants = getattr(book, "active_variants", None)
    if variants is None:
        variants = [v for v in book.variants.all() if v.is_active]
    return sorted_variants(variants)


class BookCardSerializer(serializers.ModelSerializer):
    cover = serializers.ImageField(read_only=True)
    authors = PersonMiniSerializer(many=True, read_only=True)
    subjects = SubjectMiniSerializer(many=True, read_only=True)
    exam_types = ExamTypeMiniSerializer(many=True, read_only=True)
    min_price = serializers.SerializerMethodField()
    formats = serializers.SerializerMethodField()
    in_stock = serializers.SerializerMethodField()
    print_in_stock = serializers.SerializerMethodField()

    class Meta:
        model = Book
        fields = [
            "id",
            "title",
            "subtitle",
            "slug",
            "cover",
            "authors",
            "subjects",
            "exam_types",
            "min_price",
            "formats",
            "in_stock",
            "print_in_stock",
            "is_quick_review",
            "volumes",
        ]

    def get_min_price(self, obj: Book) -> int | None:
        return book_min_price(_active_variants(obj))

    def get_formats(self, obj: Book) -> list[str]:
        return [v.type for v in _active_variants(obj)]

    def get_in_stock(self, obj: Book) -> bool:
        return any(v.in_stock for v in _active_variants(obj))

    def get_print_in_stock(self, obj: Book) -> bool:
        return any(v.type == BookVariant.Type.PRINT and v.stock > 0 for v in _active_variants(obj))


class BookCardWithVariantsSerializer(BookCardSerializer):
    variants = serializers.SerializerMethodField()

    class Meta(BookCardSerializer.Meta):
        fields = [*BookCardSerializer.Meta.fields, "variants"]

    def get_variants(self, obj: Book) -> list[dict]:
        return VariantSerializer(_active_variants(obj), many=True, context=self.context).data


class CourseSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(read_only=True)

    class Meta:
        model = RelatedCourse
        fields = ["id", "title", "url", "price", "image"]


class SamplePageSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(read_only=True)

    class Meta:
        model = BookSamplePage
        fields = ["id", "image", "order"]


class KitPlacementSerializer(serializers.Serializer):
    exam_type = ExamTypeMiniSerializer(source="recommendation.exam_type")
    subject = SubjectMiniSerializer(source="recommendation.subject")
    order = serializers.IntegerField()
    is_essential = serializers.BooleanField()


class BookDetailSerializer(BookCardSerializer):
    publisher = PublisherMiniSerializer(read_only=True, allow_null=True)
    translators = PersonMiniSerializer(many=True, read_only=True)
    categories = serializers.SerializerMethodField()
    sample_pdf = serializers.FileField(read_only=True)
    sample_pages = SamplePageSerializer(many=True, read_only=True)
    variants = serializers.SerializerMethodField()
    related_courses = serializers.SerializerMethodField()
    kit_placements = serializers.SerializerMethodField()

    class Meta(BookCardSerializer.Meta):
        fields = [
            *BookCardSerializer.Meta.fields,
            "publisher",
            "translators",
            "categories",
            "edition",
            "publish_year",
            "pages",
            "isbn",
            "description",
            "table_of_contents",
            "study_plan_note",
            "sample_pdf",
            "sample_pages",
            "intro_video_url",
            "variants",
            "related_courses",
            "kit_placements",
            "is_featured",
            "updated_at",
        ]

    def get_categories(self, obj: Book) -> list[dict]:
        cats = [c for c in obj.categories.all() if c.is_active]
        return CategoryMiniSerializer(cats, many=True).data

    def get_variants(self, obj: Book) -> list[dict]:
        return VariantSerializer(_active_variants(obj), many=True, context=self.context).data

    def get_related_courses(self, obj: Book) -> list[dict]:
        courses = [c for c in obj.related_courses.all() if c.is_active]
        return CourseSerializer(courses, many=True, context=self.context).data

    def get_kit_placements(self, obj: Book) -> list[dict]:
        placements = self.context.get("kit_placements", [])
        return KitPlacementSerializer(placements, many=True).data


class CategoryNodeSerializer(serializers.Serializer):
    """Serialises a node from ``services.books.category_tree``."""

    def to_representation(self, node: dict) -> dict:
        cat = node["category"]
        return {
            "id": cat.id,
            "name": cat.name,
            "slug": cat.slug,
            "children": [self.to_representation(child) for child in node["children"]],
        }


class CategoryDetailSerializer(serializers.Serializer):
    def to_representation(self, node: dict) -> dict:
        cat = node["category"]
        data = CategoryNodeSerializer().to_representation(node)
        data["description"] = cat.description
        data["parent"] = CategoryMiniSerializer(cat.parent).data if cat.parent_id else None
        return data


class ExamEventSerializer(serializers.ModelSerializer):
    exam_type = ExamTypeMiniSerializer(read_only=True)

    class Meta:
        model = ExamEvent
        fields = ["id", "name", "date", "exam_type"]


class BannerSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(read_only=True)

    class Meta:
        model = Banner
        fields = ["id", "title", "subtitle", "image", "link_url", "link_label"]


class GuideVideoSerializer(serializers.ModelSerializer):
    thumbnail = serializers.ImageField(read_only=True)
    subject = SubjectMiniSerializer(read_only=True, allow_null=True)
    exam_type = ExamTypeMiniSerializer(read_only=True, allow_null=True)

    class Meta:
        model = GuideVideo
        fields = ["id", "title", "video_url", "thumbnail", "subject", "exam_type"]


class HomeSerializer(serializers.Serializer):
    next_exam = ExamEventSerializer(allow_null=True)
    exam_types = ExamTypeMiniSerializer(many=True)
    subjects = SubjectWithCountSerializer(many=True)
    categories = CategoryNodeSerializer(many=True)
    hero_banners = BannerSerializer(many=True)
    course_banners = BannerSerializer(many=True)
    bestsellers = BookCardSerializer(many=True)
    quick_review = BookCardSerializer(many=True)
    featured_course = CourseSerializer(allow_null=True)
    guide_videos = GuideVideoSerializer(many=True)


class StudyKitItemSerializer(serializers.Serializer):
    order = serializers.IntegerField()
    is_essential = serializers.BooleanField()
    book = BookCardWithVariantsSerializer()


class StudyKitSerializer(serializers.Serializer):
    exam_type = ExamTypeMiniSerializer()
    subject = SubjectMiniSerializer()
    note = serializers.CharField()
    items = StudyKitItemSerializer(many=True, source="kit_items")
