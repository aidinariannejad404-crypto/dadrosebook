from rest_framework import serializers

from apps.catalog.api.serializers import SubjectMiniSerializer
from apps.catalog.models import Book

from ..models import Bookmark, Highlight, OfflineLicense, ReaderDevice, ReadingProgress
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
        fields = ["page", "total_pages", "percent", "location", "ebook_version", "updated_at"]
        read_only_fields = ["updated_at"]
        extra_kwargs = {"ebook_version": {"required": False, "allow_null": True}}

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


class CopyQuotaSerializer(serializers.Serializer):
    limit = serializers.IntegerField()
    used = serializers.IntegerField()


class OfflineLicenseSerializer(serializers.ModelSerializer):
    book = serializers.CharField(source="book.slug")
    title = serializers.CharField(source="book.title")
    device_label = serializers.CharField(source="device.label")

    class Meta:
        model = OfflineLicense
        fields = ["id", "book", "title", "device_label", "expires_at", "created_at"]


class OfflineInfoSerializer(serializers.Serializer):
    max_books = serializers.IntegerField()
    days = serializers.IntegerField()
    license = OfflineLicenseSerializer(allow_null=True)


class ProtectionSerializer(serializers.Serializer):
    level = serializers.CharField()
    trace_code = serializers.CharField()


class CaptureEventSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=["print_screen", "shortcut", "multi_touch", "devtools"])


class ReaderSessionSerializer(serializers.Serializer):
    book = ReaderBookSerializer()
    file = FileSerializer()
    progress = ProgressSerializer(allow_null=True)
    watermark = serializers.CharField()
    copy_limit = serializers.IntegerField()
    copy_quota = CopyQuotaSerializer()
    epub = EpubInfoSerializer(allow_null=True)
    offline = OfflineInfoSerializer(allow_null=True)
    protection = ProtectionSerializer()


class CopySerializer(serializers.Serializer):
    chars = serializers.IntegerField(min_value=0, max_value=100_000)


class BookmarkSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bookmark
        fields = ["id", "page", "location", "label", "created_at",
                  # ه۱: file version + whether it was found again after a new version
                  "ebook_version", "anchor_status", "previous_page", "context_after"]  # fmt: skip
        read_only_fields = ["id", "created_at", "anchor_status", "previous_page", "context_after"]
        extra_kwargs = {"ebook_version": {"required": False, "allow_null": True}}


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
                  "updated_at",
                  # ه۱: version + context (PDF readers may send the text-layer context they see)
                  "ebook_version", "context_before", "context_after", "anchor_status",
                  "previous_page"]  # fmt: skip
        read_only_fields = ["id", "created_at", "updated_at", "anchor_status", "previous_page"]
        extra_kwargs = {
            "text": {"max_length": 2000},
            "note": {"max_length": 2000},
            "ebook_version": {"required": False, "allow_null": True},
            "context_before": {"required": False},
            "context_after": {"required": False},
        }

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


# ---------- د۵ free sample ----------


class SampleOfferSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    type = serializers.CharField()
    label = serializers.CharField()
    price = serializers.IntegerField()
    in_stock = serializers.BooleanField()


class SampleSessionSerializer(serializers.Serializer):
    book = ReaderBookSerializer()
    format = serializers.CharField()
    version = serializers.IntegerField()
    watermark = serializers.CharField()
    sample_pages = serializers.IntegerField()
    total_pages = serializers.IntegerField()
    file_url = serializers.CharField(allow_blank=True)
    epub = EpubInfoSerializer(allow_null=True)
    offers = SampleOfferSerializer(many=True)
    owned = serializers.BooleanField()


# ---------- ه۸ problem reports ----------


class ProblemReportSerializer(serializers.ModelSerializer):
    class Meta:
        from ..models import ProblemReport

        model = ProblemReport
        fields = ["id", "kind", "description", "page", "location", "chapter_title",
                  "ebook_version", "device_label", "status", "created_at"]  # fmt: skip
        read_only_fields = ["id", "status", "created_at"]
        extra_kwargs = {
            "description": {"max_length": 2000, "required": False},
            "page": {"required": False, "allow_null": True},
            "location": {"required": False, "max_length": 100},
            "chapter_title": {"required": False, "max_length": 300},
            "ebook_version": {"required": False, "allow_null": True},
            "device_label": {"required": False, "max_length": 100},
        }

    def validate(self, attrs):
        from ..models import ProblemReport

        if (
            attrs.get("kind") == ProblemReport.Kind.OTHER
            and not attrs.get("description", "").strip()
        ):
            raise serializers.ValidationError({"description": "مشکل را کوتاه توضیح دهید."})
        return attrs
