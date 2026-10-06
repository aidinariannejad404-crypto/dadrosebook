from rest_framework import serializers

from apps.core.jalali import to_jalali_str
from apps.library.api.serializers import LibraryItemSerializer

from ..models import ChangelogEntry, Notification, UserStudyProfile
from ..services.study_profile import should_show_onboarding, upcoming_exams, year_choices


class NotificationSerializer(serializers.ModelSerializer):
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "link", "discount_code", "is_read", "created_at"]
        read_only_fields = fields

    def get_is_read(self, obj) -> bool:
        return obj.read_at is not None


class MarkReadSerializer(serializers.Serializer):
    ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1), required=False, max_length=200
    )


class PersonalCodeSerializer(serializers.Serializer):
    code = serializers.CharField()
    title = serializers.CharField()
    received_at = serializers.DateTimeField()
    valid_until = serializers.DateTimeField(allow_null=True)
    is_valid = serializers.BooleanField()


class PreferenceSerializer(serializers.Serializer):
    kind = serializers.CharField()
    label = serializers.CharField()
    marketing = serializers.BooleanField()
    enabled = serializers.BooleanField()
    locked = serializers.BooleanField()


class PreferencesUpdateSerializer(serializers.Serializer):
    changes = serializers.DictField(child=serializers.BooleanField(), allow_empty=False)


class StudyProfileSerializer(serializers.ModelSerializer):
    exam_type = serializers.SlugRelatedField(slug_field="slug", read_only=True)
    exam_type_name = serializers.CharField(source="exam_type.name", read_only=True, default=None)
    weak_subjects = serializers.SlugRelatedField(slug_field="slug", many=True, read_only=True)
    completed = serializers.SerializerMethodField()

    class Meta:
        model = UserStudyProfile
        fields = [
            "exam_type",
            "exam_type_name",
            "exam_year",
            "exam_date",
            "weak_subjects",
            "completed",
        ]
        read_only_fields = fields

    def get_completed(self, obj) -> bool:
        return obj.completed_at is not None


def study_profile_payload(user, profile: UserStudyProfile | None) -> dict:
    data = (
        StudyProfileSerializer(profile).data
        if profile is not None
        else {
            "exam_type": None,
            "exam_type_name": None,
            "exam_year": None,
            "exam_date": None,
            "weak_subjects": [],
            "completed": False,
        }
    )
    return {
        "profile": data,
        "show_onboarding": should_show_onboarding(user),
        "year_choices": year_choices(),
        "upcoming_exams": upcoming_exams(),
        "max_weak_subjects": UserStudyProfile.MAX_WEAK_SUBJECTS,
    }


class StudyProfileWriteSerializer(serializers.Serializer):
    exam_type = serializers.CharField(max_length=80, allow_null=True, allow_blank=True)
    exam_year = serializers.IntegerField(required=False, allow_null=True)
    exam_date = serializers.DateField(required=False, allow_null=True)
    weak_subjects = serializers.ListField(
        child=serializers.CharField(max_length=80), required=False, default=list, max_length=10
    )


class ChangelogEntrySerializer(serializers.ModelSerializer):
    published_jalali = serializers.SerializerMethodField()
    area_label = serializers.CharField(source="get_area_display", read_only=True)

    class Meta:
        model = ChangelogEntry
        fields = [
            "id",
            "title",
            "body",
            "area",
            "area_label",
            "link",
            "published_at",
            "published_jalali",
        ]
        read_only_fields = fields

    def get_published_jalali(self, obj) -> str:
        return to_jalali_str(obj.published_at, persian_digits=True)


def summary_payload(summary: dict, request) -> dict:
    entry = summary["continue_entry"]
    return {
        "unread": summary["unread"],
        "has_library": summary["has_library"],
        "continue_reading": (
            LibraryItemSerializer(entry, context={"request": request}).data if entry else None
        ),
        "show_onboarding": summary["show_onboarding"],
        "exam_type": summary["exam_type"],
    }
