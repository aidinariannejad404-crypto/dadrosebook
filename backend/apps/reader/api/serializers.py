from rest_framework import serializers

from apps.catalog.api.serializers import SubjectMiniSerializer
from apps.catalog.models import Book

from ..models import Bookmark, Highlight, ReaderDevice, ReadingProgress
from ..services.highlights import clean_rects


class ReaderBookSerializer(serializers.ModelSerializer):
    cover = serializers.ImageField(read_only=True)
    authors = serializers.SerializerMethodField()
    subjects = SubjectMiniSerializer(many=True, read_only=True)

    class Meta:
        model = Book
        fields = ["slug", "title", "subtitle", "cover", "authors", "subjects"]

    def get_authors(self, book) -> list[str]:
        return [p.name for p in book.authors.all()]


class ProgressSerializer(serializers.ModelSerializer):
    percent = serializers.FloatField(read_only=True)

    class Meta:
        model = ReadingProgress
        fields = ["page", "total_pages", "percent", "location", "updated_at"]
        read_only_fields = ["updated_at"]

    def validate(self, attrs):
        total = attrs.get("total_pages") or 0
        if total and attrs.get("page", 1) > total:
            raise serializers.ValidationError({"page": "شماره صفحه از تعداد صفحات بیشتر است."})
        return attrs


class FileSerializer(serializers.Serializer):
    format = serializers.CharField()
    version = serializers.IntegerField()
    url = serializers.CharField()
    expires_at = serializers.DateTimeField()


class EpubChapterMetaSerializer(serializers.Serializer):
    index = serializers.IntegerField()
    title = serializers.CharField()
    start_page = serializers.IntegerField()
    pages = serializers.IntegerField()
    chars = serializers.IntegerField()


class EpubInfoSerializer(serializers.Serializer):
    language = serializers.CharField()
    direction = serializers.CharField()
    total_pages = serializers.IntegerField()
    chapters = EpubChapterMetaSerializer(many=True)
    toc = serializers.JSONField()


class ReaderSessionSerializer(serializers.Serializer):
    book = ReaderBookSerializer()
    file = FileSerializer()
    progress = ProgressSerializer(allow_null=True)
    watermark = serializers.CharField()
    copy_limit = serializers.IntegerField()
    epub = EpubInfoSerializer(allow_null=True)


class BookmarkSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bookmark
        fields = ["id", "page", "location", "label", "created_at"]
        read_only_fields = ["id", "created_at"]


class DeviceSerializer(serializers.ModelSerializer):
    current = serializers.SerializerMethodField()

    class Meta:
        model = ReaderDevice
        fields = ["id", "label", "last_seen", "current"]

    def get_current(self, device) -> bool:
        return device.pk == self.context.get("current_id")


class HighlightSerializer(serializers.ModelSerializer):
    class Meta:
        model = Highlight
        fields = ["id", "page", "text", "note", "color", "rects", "location", "created_at",
                  "updated_at"]  # fmt: skip
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {"text": {"max_length": 2000}, "note": {"max_length": 2000}}

    def validate_rects(self, value):
        try:
            return clean_rects(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc


class HighlightUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Highlight
        fields = ["note", "color"]
        extra_kwargs = {"note": {"max_length": 2000}}
