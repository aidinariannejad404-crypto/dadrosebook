from rest_framework import serializers

from apps.catalog.api.serializers import BookCardSerializer
from apps.reader.models import ReadingProgress

from ..models import EbookEntitlement


class LibraryProgressSerializer(serializers.ModelSerializer):
    """Where the reader left off: percent (0–100), current page, page count, last read."""

    percent = serializers.FloatField(read_only=True)

    class Meta:
        model = ReadingProgress
        fields = ["percent", "page", "total_pages", "updated_at"]
        read_only_fields = fields


class LibraryItemSerializer(serializers.ModelSerializer):
    book = BookCardSerializer(read_only=True)
    granted_at = serializers.DateTimeField(source="created_at", read_only=True)
    source_order = serializers.SerializerMethodField()
    can_read = serializers.BooleanField(source="is_active", read_only=True)
    progress = serializers.SerializerMethodField()

    class Meta:
        model = EbookEntitlement
        fields = ["book", "granted_at", "source_order", "can_read", "progress"]

    def get_source_order(self, obj: EbookEntitlement) -> str | None:
        return obj.source_order.number if obj.source_order_id else None

    def get_progress(self, obj: EbookEntitlement) -> dict | None:
        progress = getattr(obj, "progress", None)
        return LibraryProgressSerializer(progress).data if progress is not None else None
