from rest_framework import serializers

from apps.catalog.api.serializers import ExamTypeMiniSerializer
from apps.catalog.models import ExamType

from ..models import Review
from ..services.reviews import BODY_MAX_LENGTH, author_display


class ReviewSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    exam_type = ExamTypeMiniSerializer(read_only=True)

    class Meta:
        model = Review
        fields = [
            "id",
            "rating",
            "body",
            "author",
            "exam_type",
            "is_verified_purchase",
            "created_at",
        ]

    def get_author(self, obj: Review) -> str:
        return author_display(obj.user)


class BookMiniSerializer(serializers.Serializer):
    title = serializers.CharField()
    slug = serializers.CharField()


class MyReviewSerializer(ReviewSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    book = BookMiniSerializer(read_only=True)

    class Meta(ReviewSerializer.Meta):
        fields = [*ReviewSerializer.Meta.fields, "status", "status_label", "book"]


class ReviewSubmitSerializer(serializers.Serializer):
    rating = serializers.IntegerField(
        min_value=1,
        max_value=5,
        error_messages={
            "required": "امتیاز را انتخاب کنید.",
            "null": "امتیاز را انتخاب کنید.",
            "invalid": "امتیاز باید عددی بین ۱ تا ۵ باشد.",
            "min_value": "امتیاز باید بین ۱ تا ۵ باشد.",
            "max_value": "امتیاز باید بین ۱ تا ۵ باشد.",
        },
    )
    body = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        trim_whitespace=True,
        max_length=BODY_MAX_LENGTH,
        error_messages={"max_length": "متن نظر حداکثر ۲۰۰۰ نویسه است."},
    )
    exam_type = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate_exam_type(self, value):
        if not value:
            return None
        exam_type = ExamType.objects.filter(slug=value, is_active=True).first()
        if exam_type is None:
            raise serializers.ValidationError("آزمون انتخاب‌شده معتبر نیست.")
        return exam_type
