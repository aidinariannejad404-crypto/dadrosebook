"""Hub, guide and list payloads (package ب). Book cards reuse the catalog card serializer."""

from rest_framework import serializers

from apps.catalog.api.serializers import (
    BookCardSerializer,
    CourseSerializer,
    ExamTypeMiniSerializer,
    SubjectMiniSerializer,
)
from apps.catalog.models import ExamEvent, Person, Publisher

from ..models import CuratedList, Guide


class PersonProfileSerializer(serializers.ModelSerializer):
    """Author/translator/reviewer with credentials (bylines and Person JSON-LD)."""

    photo = serializers.ImageField(read_only=True)

    class Meta:
        model = Person
        fields = ["id", "name", "slug", "job_title", "affiliation", "photo"]


class GuideCardSerializer(serializers.ModelSerializer):
    author = PersonProfileSerializer(read_only=True, allow_null=True)
    reviewer = PersonProfileSerializer(read_only=True, allow_null=True)

    class Meta:
        model = Guide
        fields = ["id", "title", "slug", "summary", "updated_on", "author", "reviewer"]


class HubIntroMixin(serializers.Serializer):
    book_count = serializers.IntegerField()
    intro_words = serializers.IntegerField()
    indexable = serializers.BooleanField()
    updated_at = serializers.DateTimeField()


class SubjectHubEntitySerializer(SubjectMiniSerializer):
    class Meta(SubjectMiniSerializer.Meta):
        fields = [
            *SubjectMiniSerializer.Meta.fields,
            "description",
            "intro",
            "intro_byline",
            "intro_is_placeholder",
        ]


class ExamHubEntitySerializer(ExamTypeMiniSerializer):
    class Meta(ExamTypeMiniSerializer.Meta):
        fields = [
            *ExamTypeMiniSerializer.Meta.fields,
            "intro",
            "intro_byline",
            "intro_is_placeholder",
        ]


class NextEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamEvent
        fields = ["id", "name", "date"]


class ExamGroupSerializer(serializers.Serializer):
    subject = SubjectMiniSerializer(allow_null=True)
    weight = serializers.IntegerField(allow_null=True)
    book_count = serializers.IntegerField()
    books = BookCardSerializer(many=True)


class KitSummarySerializer(serializers.Serializer):
    essential_count = serializers.IntegerField()
    book_count = serializers.IntegerField()
    subject_count = serializers.IntegerField()


class ExamHubSerializer(HubIntroMixin):
    exam = ExamHubEntitySerializer()
    next_event = NextEventSerializer(allow_null=True)
    kit = KitSummarySerializer()
    groups = ExamGroupSerializer(many=True)
    courses = CourseSerializer(many=True)
    guides = GuideCardSerializer(many=True)


class ExamCountSerializer(serializers.Serializer):
    exam = ExamTypeMiniSerializer()
    book_count = serializers.IntegerField()


class AuthorCountSerializer(serializers.Serializer):
    person = PersonProfileSerializer()
    book_count = serializers.IntegerField()


class SubjectHubSerializer(HubIntroMixin):
    subject = SubjectHubEntitySerializer()
    books = BookCardSerializer(many=True)
    exams = ExamCountSerializer(many=True)
    authors = AuthorCountSerializer(many=True)
    courses = CourseSerializer(many=True)
    guides = GuideCardSerializer(many=True)


class PersonHubEntitySerializer(PersonProfileSerializer):
    class Meta(PersonProfileSerializer.Meta):
        fields = [*PersonProfileSerializer.Meta.fields, "bio"]


class AuthorHubSerializer(serializers.Serializer):
    person = PersonHubEntitySerializer()
    same_as = serializers.ListField(child=serializers.URLField())
    book_count = serializers.IntegerField()
    bio_words = serializers.IntegerField()
    indexable = serializers.BooleanField()
    updated_at = serializers.DateTimeField()
    authored = BookCardSerializer(many=True)
    translated = BookCardSerializer(many=True)
    subjects = SubjectMiniSerializer(many=True)
    guides_written = GuideCardSerializer(many=True)
    guides_reviewed = GuideCardSerializer(many=True)


class PublisherHubEntitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Publisher
        fields = ["id", "name", "slug", "website", "intro"]


class PublisherHubSerializer(HubIntroMixin):
    publisher = PublisherHubEntitySerializer()
    books = BookCardSerializer(many=True)
    subjects = SubjectMiniSerializer(many=True)
    authors = AuthorCountSerializer(many=True)


class GuideDetailSerializer(GuideCardSerializer):
    exam_types = ExamTypeMiniSerializer(many=True, read_only=True)
    subjects = SubjectMiniSerializer(many=True, read_only=True)
    is_published = serializers.BooleanField(read_only=True)

    class Meta(GuideCardSerializer.Meta):
        fields = [
            *GuideCardSerializer.Meta.fields,
            "intro",
            "body",
            "published_at",
            "updated_at",
            "is_published",
            "exam_types",
            "subjects",
        ]


class CuratedListCardSerializer(serializers.ModelSerializer):
    class Meta:
        model = CuratedList
        fields = ["id", "title", "slug", "ends_on"]


class ListEntrySerializer(serializers.Serializer):
    book = BookCardSerializer()
    note = serializers.CharField()


class CuratedListDetailSerializer(CuratedListCardSerializer):
    class Meta(CuratedListCardSerializer.Meta):
        fields = [*CuratedListCardSerializer.Meta.fields, "intro", "updated_at"]
