"""Serializers for the Phase 1 catalog API. Shapes are fixed by ``docs/api-contract.md``."""

from rest_framework import serializers

from apps.content.models import Banner, GuideVideo
from apps.core.serializers import StoreSettingsSerializer

from ..models import (
    Book,
    BookCourse,
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
from ..services.cards import card_extras
from ..services.course_offer import build_course_offer
from ..services.courses import (
    course_links_queryset,
    hours_int,
    price_per_hour,
    rating_shown,
    students_shown,
)
from ..services.editions import current_exam_year
from ..services.pricing import book_card_variant, book_min_price, bundle_saving


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
    bundle_saving = serializers.SerializerMethodField()

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
            "bundle_saving",
        ]

    def get_stock(self, obj: BookVariant) -> int | None:
        return None if obj.type == BookVariant.Type.EBOOK else obj.stock

    def get_bundle_saving(self, obj: BookVariant) -> int | None:
        """Set by ``serialize_variants`` (needs the sibling variants); BUNDLE only."""
        if obj.type != BookVariant.Type.BUNDLE:
            return None
        return getattr(obj, "bundle_saving", None)


def serialize_variants(variants: list[BookVariant], context: dict) -> list[dict]:
    saving = bundle_saving(variants)
    for variant in variants:
        variant.bundle_saving = saving if variant.type == BookVariant.Type.BUNDLE else None
    return VariantSerializer(variants, many=True, context=context).data


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
    card_price = serializers.SerializerMethodField()
    card_format = serializers.SerializerMethodField()
    formats = serializers.SerializerMethodField()
    in_stock = serializers.SerializerMethodField()
    print_in_stock = serializers.SerializerMethodField()
    resource_type_label = serializers.CharField(source="get_resource_type_display", read_only=True)
    has_sample = serializers.SerializerMethodField()
    kit_role = serializers.SerializerMethodField()
    edition_badge = serializers.SerializerMethodField()
    course_badge = serializers.SerializerMethodField()
    social_proof = serializers.SerializerMethodField()
    badges = serializers.SerializerMethodField()

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
            "card_price",
            "card_format",
            "formats",
            "in_stock",
            "print_in_stock",
            "is_quick_review",
            "volumes",
            # Added after research (docs/research/competitor-analysis.md, P1-*).
            "resource_type",
            "resource_type_label",
            "has_sample",
            "kit_role",
            "edition_badge",
            "law_updated_until",
            "course_badge",
            "social_proof",
            "badges",
        ]

    def _exam_year(self) -> int:
        """Computed once per response and shared through the root serializer's context."""
        context = self.context
        if "current_exam_year" not in context:
            context["current_exam_year"] = current_exam_year()
        return context["current_exam_year"]

    def _extras(self, obj: Book) -> dict:
        extras = getattr(obj, "_card_extras", None)
        if extras is None:
            extras = card_extras(obj, _active_variants(obj), exam_year=self._exam_year())
            obj._card_extras = extras
        return extras

    def get_has_sample(self, obj: Book) -> bool:
        return self._extras(obj)["has_sample"]

    def get_kit_role(self, obj: Book) -> str | None:
        return self._extras(obj)["kit_role"]

    def get_edition_badge(self, obj: Book) -> str | None:
        return self._extras(obj)["edition_badge"]

    def get_course_badge(self, obj: Book) -> str | None:
        return self._extras(obj)["course_badge"]

    def get_social_proof(self, obj: Book) -> dict:
        return self._extras(obj)["social_proof"]

    def get_badges(self, obj: Book) -> list[dict]:
        return self._extras(obj)["badges"]

    def get_min_price(self, obj: Book) -> int | None:
        return book_min_price(_active_variants(obj))

    def get_card_price(self, obj: Book) -> int | None:
        variant = book_card_variant(_active_variants(obj))
        return variant.effective_price if variant else None

    def get_card_format(self, obj: Book) -> str | None:
        variant = book_card_variant(_active_variants(obj))
        return variant.type if variant else None

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
        return serialize_variants(_active_variants(obj), self.context)


class CourseSerializer(serializers.ModelSerializer):
    """``Course`` (full shape). Social proof is honest: small numbers become ``null``."""

    course_type_label = serializers.CharField(source="get_course_type_display", read_only=True)
    subject = SubjectMiniSerializer(read_only=True, allow_null=True)
    exam_types = ExamTypeMiniSerializer(many=True, read_only=True)
    price = serializers.SerializerMethodField()
    effective_price = serializers.IntegerField(read_only=True)
    hours = serializers.SerializerMethodField()
    price_per_hour = serializers.SerializerMethodField()
    students_count = serializers.SerializerMethodField()
    rating = serializers.SerializerMethodField()
    image = serializers.ImageField(read_only=True)

    class Meta:
        model = RelatedCourse
        fields = [
            "id",
            "title",
            "url",
            "course_type",
            "course_type_label",
            "subject",
            "exam_types",
            "teachers",
            "price",
            "sale_price",
            "effective_price",
            "is_free",
            "hours",
            "sessions",
            "price_per_hour",
            "students_count",
            "rating",
            "reviews_count",
            "image",
            "intro_video_url",
            "short_description",
            "selling_points",
        ]

    def get_price(self, obj: RelatedCourse) -> int:
        return 0 if obj.is_free else (obj.price or 0)

    def get_hours(self, obj: RelatedCourse) -> int | None:
        return hours_int(obj)

    def get_price_per_hour(self, obj: RelatedCourse) -> int | None:
        return price_per_hour(obj)

    def get_students_count(self, obj: RelatedCourse) -> int | None:
        return students_shown(obj)

    def get_rating(self, obj: RelatedCourse) -> float | None:
        return rating_shown(obj)


def serialize_offer_course(candidate, context: dict, *, with_tier: bool = False) -> dict:
    data = dict(CourseSerializer(candidate.course, context=context).data)
    data["relevance"] = candidate.relevance
    data["relevance_label"] = BookCourse.Relevance(candidate.relevance).label
    if with_tier:
        data["tier"] = candidate.tier
        data["is_recommended"] = candidate.is_recommended
    return data


def serialize_course_offer(offer, context: dict) -> dict | None:
    if offer is None:
        return None
    return {
        "subject": SubjectMiniSerializer(offer.subject).data if offer.subject else None,
        "recommended_type": offer.recommended_type,
        "recommended_reason": offer.recommended_reason,
        "highlight": (
            serialize_offer_course(offer.highlight, context) if offer.highlight else None
        ),
        "tiers": [serialize_offer_course(c, context, with_tier=True) for c in offer.tiers],
        "more": [serialize_offer_course(c, context) for c in offer.more],
        "free_sample": (
            {
                "course": serialize_offer_course(offer.free_sample, context),
                "video_url": offer.free_sample.course.intro_video_url,
            }
            if offer.free_sample
            else None
        ),
        "discount": (
            {
                **offer.discount,
                "expires_on": _iso(offer.discount["expires_on"]),
            }
            if offer.discount
            else None
        ),
        "exam_countdown": (
            {**offer.exam_countdown, "date": _iso(offer.exam_countdown["date"])}
            if offer.exam_countdown
            else None
        ),
    }


def _iso(value) -> str | None:
    return value.isoformat() if value is not None else None


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
    course_offer = serializers.SerializerMethodField()
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
            "study_days",
            "sample_pdf",
            "sample_pages",
            "intro_video_url",
            "variants",
            "related_courses",
            "course_offer",
            "kit_placements",
            "is_featured",
            "updated_at",
        ]

    def get_categories(self, obj: Book) -> list[dict]:
        cats = [c for c in obj.categories.all() if c.is_active]
        return CategoryMiniSerializer(cats, many=True).data

    def get_variants(self, obj: Book) -> list[dict]:
        return serialize_variants(_active_variants(obj), self.context)

    def _course_links(self, obj: Book) -> list:
        links = getattr(obj, "exposed_course_links", None)
        if links is None:
            links = list(course_links_queryset().filter(book=obj))
            obj.exposed_course_links = links
        return links

    def get_related_courses(self, obj: Book) -> list[dict]:
        """Exposed courses linked to the book, in link order (compatibility field)."""
        courses = [link.course for link in self._course_links(obj)]
        return CourseSerializer(courses, many=True, context=self.context).data

    def get_course_offer(self, obj: Book) -> dict | None:
        self._course_links(obj)
        offer = build_course_offer(obj, exam_type=self.context.get("exam_type"))
        return serialize_course_offer(offer, self.context)

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


class HomeSubjectSerializer(SubjectWithCountSerializer):
    weight = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta(SubjectWithCountSerializer.Meta):
        fields = [*SubjectWithCountSerializer.Meta.fields, "weight"]


class HomeSerializer(serializers.Serializer):
    next_exam = ExamEventSerializer(allow_null=True)
    exam_types = ExamTypeMiniSerializer(many=True)
    subjects = HomeSubjectSerializer(many=True)
    categories = CategoryNodeSerializer(many=True)
    hero_banners = BannerSerializer(many=True)
    course_banners = BannerSerializer(many=True)
    bestsellers = BookCardSerializer(many=True)
    quick_review = BookCardSerializer(many=True)
    featured_course = CourseSerializer(allow_null=True)
    guide_videos = GuideVideoSerializer(many=True)
    selected_exam_type = ExamTypeMiniSerializer(allow_null=True)
    store = StoreSettingsSerializer()


class StudyKitItemSerializer(serializers.Serializer):
    order = serializers.IntegerField()
    is_essential = serializers.BooleanField()
    book = BookCardWithVariantsSerializer()


class StudyKitSerializer(serializers.Serializer):
    exam_type = ExamTypeMiniSerializer()
    subject = SubjectMiniSerializer()
    note = serializers.CharField()
    weight = serializers.IntegerField(allow_null=True)
    items = StudyKitItemSerializer(many=True, source="kit_items")
