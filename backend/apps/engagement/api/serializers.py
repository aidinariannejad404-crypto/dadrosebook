from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.accounts.phone import normalize_phone, validate_phone

from ..models import BackInStockRequest


class BackInStockRequestSerializer(serializers.Serializer):
    variant_id = serializers.IntegerField(min_value=1)
    phone = serializers.CharField(max_length=32)
    source = serializers.ChoiceField(
        choices=BackInStockRequest.Source.values, required=False, allow_blank=True
    )

    def validate_phone(self, value: str) -> str:
        phone = normalize_phone(value)
        try:
            validate_phone(phone)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc
        return phone
