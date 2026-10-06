from rest_framework import serializers

from ..services.activity import MAX_CREDIT_SECONDS

GOAL_MIN, GOAL_MAX = 5, 600


class HeartbeatSerializer(serializers.Serializer):
    book = serializers.CharField(max_length=300)
    seconds = serializers.IntegerField(min_value=0, max_value=MAX_CREDIT_SECONDS * 4)
    page = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    total_pages = serializers.IntegerField(min_value=0, required=False, allow_null=True)


class GoalSerializer(serializers.Serializer):
    daily_goal_minutes = serializers.IntegerField(
        min_value=GOAL_MIN,
        max_value=GOAL_MAX,
        required=False,
        error_messages={
            "min_value": "هدف روزانه دست‌کم ۵ دقیقه است.",
            "max_value": "هدف روزانه حداکثر ۶۰۰ دقیقه است.",
            "invalid": "هدف روزانه را به دقیقه وارد کنید.",
        },
    )
    review_sms = serializers.BooleanField(required=False)


class PlanCreateSerializer(serializers.Serializer):
    lead_token = serializers.UUIDField(required=False)
    book_slugs = serializers.ListField(
        child=serializers.CharField(max_length=300), required=False, max_length=30
    )
    exam_type = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    hours_per_day = serializers.IntegerField(min_value=1, max_value=12, required=False, default=4)

    def validate(self, attrs):
        if not attrs.get("lead_token") and not attrs.get("book_slugs"):
            raise serializers.ValidationError({"book_slugs": ["دست‌کم یک کتاب انتخاب کنید."]})
        return attrs


class PlanCheckSerializer(serializers.Serializer):
    book_slug = serializers.CharField(max_length=300)
    pages_from = serializers.IntegerField(min_value=1)
    pages_to = serializers.IntegerField(min_value=1)
    done = serializers.BooleanField()
