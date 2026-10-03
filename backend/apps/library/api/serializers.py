from rest_framework import serializers

from apps.catalog.api.serializers import BookCardSerializer

from ..models import EbookEntitlement


class LibraryItemSerializer(serializers.ModelSerializer):
    book = BookCardSerializer(read_only=True)
    granted_at = serializers.DateTimeField(source="created_at", read_only=True)
    source_order = serializers.SerializerMethodField()
    can_read = serializers.BooleanField(source="is_active", read_only=True)

    class Meta:
        model = EbookEntitlement
        fields = ["book", "granted_at", "source_order", "can_read"]

    def get_source_order(self, obj: EbookEntitlement) -> str | None:
        return obj.source_order.number if obj.source_order_id else None
