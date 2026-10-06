"""Cart serializers. Shapes are fixed by ``docs/api-contract-phase-2.md`` (Cart, CartItem)."""

from rest_framework import serializers

from apps.catalog.api.serializers import (
    PersonMiniSerializer,
    SubjectMiniSerializer,
    VariantSerializer,
)
from apps.catalog.models import Book

MAX_BULK_ITEMS = 50
SOURCES = ("kit", "product", "card", "other")


class CartBookSerializer(serializers.ModelSerializer):
    cover = serializers.ImageField(read_only=True)
    subjects = SubjectMiniSerializer(many=True, read_only=True)
    authors = PersonMiniSerializer(many=True, read_only=True)

    class Meta:
        model = Book
        fields = ["id", "title", "slug", "cover", "subjects", "authors"]


class CartItemSerializer(serializers.Serializer):
    """Renders a line dict from ``apps.cart.services.summary.line_summary``."""

    id = serializers.IntegerField()
    variant = VariantSerializer()
    book = CartBookSerializer()
    quantity = serializers.IntegerField()
    max_quantity = serializers.IntegerField()
    unit_price = serializers.IntegerField()
    line_total = serializers.IntegerField()
    line_saving = serializers.IntegerField()
    is_available = serializers.BooleanField()
    issue = serializers.CharField(allow_null=True)


class CartSerializer(serializers.Serializer):
    """Renders ``apps.cart.services.cart_summary(cart)``."""

    token = serializers.CharField(allow_null=True)
    items = CartItemSerializer(many=True)
    item_count = serializers.IntegerField()
    subtotal = serializers.IntegerField()
    original_subtotal = serializers.IntegerField()
    savings = serializers.IntegerField()
    has_physical = serializers.BooleanField()
    has_issues = serializers.BooleanField()
    free_shipping_threshold = serializers.IntegerField(allow_null=True)
    free_shipping_remaining = serializers.IntegerField(allow_null=True)
    updated_at = serializers.DateTimeField(allow_null=True)


class AddItemSerializer(serializers.Serializer):
    variant_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(required=False, default=1)


class QuantitySerializer(serializers.Serializer):
    quantity = serializers.IntegerField()


class BulkAddSerializer(serializers.Serializer):
    items = serializers.ListField(
        child=serializers.DictField(), max_length=MAX_BULK_ITEMS, allow_empty=True
    )
    source = serializers.ChoiceField(choices=SOURCES, required=False, allow_blank=True)

    def validate_items(self, value: list[dict]) -> list[dict]:
        """Keep entries loose: a malformed entry is reported per item, not as a 400."""
        cleaned = []
        for entry in value:
            variant_id = entry.get("variant_id")
            quantity = entry.get("quantity", 1)
            cleaned.append({"variant_id": _as_int(variant_id), "quantity": _as_int(quantity)})
        return cleaned


def _as_int(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return value
