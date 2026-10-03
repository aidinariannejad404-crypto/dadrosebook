from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.orders.models import Address

from ..models import User
from ..phone import normalize_phone, validate_phone
from ..services.addresses import (
    POSTAL_CODE_RE,
    canonical_province,
    normalize_postal_code,
)


def _clean_phone(value: str) -> str:
    phone = normalize_phone(value)
    try:
        validate_phone(phone)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(exc.messages[0]) from exc
    return phone


class MeSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "phone",
            "first_name",
            "last_name",
            "full_name",
            "is_staff",
            "date_joined",
        )
        read_only_fields = ("id", "phone", "is_staff", "date_joined")
        extra_kwargs = {
            "first_name": {"max_length": 150, "allow_blank": True, "trim_whitespace": True},
            "last_name": {"max_length": 150, "allow_blank": True, "trim_whitespace": True},
        }


class OtpRequestSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=32)

    def validate_phone(self, value):
        return _clean_phone(value)


class OtpVerifySerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=32)
    code = serializers.CharField(max_length=16)

    def validate_phone(self, value):
        return _clean_phone(value)


class AddressSerializer(serializers.ModelSerializer):
    province = serializers.CharField(max_length=50)
    is_default = serializers.BooleanField(required=False)
    is_tehran = serializers.BooleanField(read_only=True)

    class Meta:
        model = Address
        fields = (
            "id",
            "title",
            "recipient_name",
            "recipient_phone",
            "province",
            "city",
            "postal_code",
            "address_line",
            "is_default",
            "is_tehran",
        )
        read_only_fields = ("id",)
        extra_kwargs = {
            "postal_code": {"max_length": 32},
            "recipient_phone": {"max_length": 32},
        }

    def validate_recipient_phone(self, value):
        return _clean_phone(value)

    def validate_postal_code(self, value):
        code = normalize_postal_code(value)
        if not POSTAL_CODE_RE.match(code):
            raise serializers.ValidationError("کد پستی باید ۱۰ رقم باشد.")
        return code

    def validate_province(self, value):
        province = canonical_province(value)
        if province is None:
            raise serializers.ValidationError("استان را از فهرست انتخاب کنید.")
        return province

    def _required_text(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("این فیلد الزامی است.")
        return value

    validate_recipient_name = _required_text
    validate_city = _required_text
    validate_address_line = _required_text
