"""Study plan lead API (``docs/api-contract.md`` → "Study plan lead magnet")."""

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.accounts.phone import normalize_phone, validate_phone
from apps.catalog.api.serializers import CourseSerializer
from apps.catalog.models import Book, ExamType, Subject

MAX_HOURS_PER_DAY = 16
DEFAULT_HOURS_PER_DAY = 4
MAX_ITEMS = 30


class StudyPlanRequestSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=32)
    exam_type = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    subjects = serializers.ListField(
        child=serializers.CharField(max_length=200), required=False, max_length=MAX_ITEMS
    )
    books = serializers.ListField(
        child=serializers.CharField(max_length=200), required=False, max_length=MAX_ITEMS
    )
    hours_per_day = serializers.IntegerField(
        required=False,
        default=DEFAULT_HOURS_PER_DAY,
        min_value=1,
        max_value=MAX_HOURS_PER_DAY,
        error_messages={
            "min_value": "ساعت مطالعه باید حداقل ۱ باشد.",
            "max_value": "ساعت مطالعه حداکثر ۱۶ در روز است.",
            "invalid": "ساعت مطالعه باید عدد باشد.",
        },
    )
    consent = serializers.BooleanField(
        required=True,
        error_messages={"required": "برای دریافت برنامه، موافقت با تماس و پیامک لازم است."},
    )

    def validate_phone(self, value: str) -> str:
        phone = normalize_phone(value)
        try:
            validate_phone(phone)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc
        return phone

    def validate_consent(self, value: bool) -> bool:
        if value is not True:
            raise serializers.ValidationError(
                "برای دریافت برنامه، موافقت با تماس و پیامک لازم است."
            )
        return value

    def validate_exam_type(self, value: str | None) -> ExamType | None:
        if not value:
            return None
        exam_type = ExamType.objects.filter(slug=value, is_active=True).first()
        if exam_type is None:
            raise serializers.ValidationError("آزمون انتخاب‌شده پیدا نشد.")
        return exam_type

    def validate_subjects(self, value: list[str]) -> list[Subject]:
        slugs = list(dict.fromkeys(v.strip() for v in value if v.strip()))
        found = {s.slug: s for s in Subject.objects.filter(slug__in=slugs, is_active=True)}
        missing = [s for s in slugs if s not in found]
        if missing:
            raise serializers.ValidationError(f"درس پیدا نشد: {'، '.join(missing)}")
        return [found[s] for s in slugs]

    def validate_books(self, value: list[str]) -> list[Book]:
        slugs = list(dict.fromkeys(v.strip() for v in value if v.strip()))
        found = {b.slug: b for b in Book.objects.filter(slug__in=slugs, is_active=True)}
        missing = [s for s in slugs if s not in found]
        if missing:
            raise serializers.ValidationError(f"کتاب پیدا نشد: {'، '.join(missing)}")
        return [found[s] for s in slugs]

    def validate(self, attrs):
        attrs.setdefault("subjects", [])
        attrs.setdefault("books", [])
        attrs.setdefault("exam_type", None)
        if not attrs["books"] and not attrs["subjects"]:
            raise serializers.ValidationError(
                {"books": ["حداقل یک کتاب یا یک درس را انتخاب کنید."]}
            )
        return attrs


class StudyPlanSerializer(serializers.Serializer):
    token = serializers.CharField()
    created_at = serializers.DateTimeField()
    phone_masked = serializers.CharField()
    exam = serializers.DictField(allow_null=True)
    hours_per_day = serializers.IntegerField()
    summary = serializers.DictField()
    days = serializers.ListField()
    review = serializers.ListField()
    recommended_courses = CourseSerializer(many=True)
