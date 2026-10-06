"""PF-8: the customer's study context on the account (exam, exam year/date, weak subjects)."""

import datetime as dt

from django.db import transaction
from django.utils import timezone

from apps.catalog.models import ExamEvent, ExamType, Subject
from apps.core.jalali import jalali_year

from ..models import UserStudyProfile

MSG_EXAM = "آزمون انتخاب‌شده پیدا نشد."
MSG_SUBJECT = "یکی از درس‌های انتخاب‌شده پیدا نشد."
MSG_TOO_MANY = f"حداکثر {UserStudyProfile.MAX_WEAK_SUBJECTS} درس را انتخاب کنید."
MSG_YEAR = "سال آزمون معتبر نیست."
MSG_DATE = "تاریخ آزمون نباید گذشته باشد."
YEARS_AHEAD = 3


class StudyProfileError(ValueError):
    def __init__(self, message: str, field: str):
        super().__init__(message)
        self.message = message
        self.field = field


def year_choices(today: dt.date | None = None) -> list[int]:
    """This Jalali year and the next ``YEARS_AHEAD``."""
    current = jalali_year(today or timezone.localdate())
    return list(range(current, current + YEARS_AHEAD + 1))


def get_profile(user) -> UserStudyProfile | None:
    return (
        UserStudyProfile.objects.filter(user=user)
        .select_related("exam_type")
        .prefetch_related("weak_subjects")
        .first()
    )


def should_show_onboarding(user) -> bool:
    """Shown once: until the user saved the sheet or skipped it."""
    profile = UserStudyProfile.objects.filter(user=user).only("completed_at", "skipped_at").first()
    return profile is None or (profile.completed_at is None and profile.skipped_at is None)


def upcoming_exams(today: dt.date | None = None) -> list[dict]:
    """Announced exam dates (for the «تاریخ اعلام‌شده» shortcut in the sheet)."""
    today = today or timezone.localdate()
    events = (
        ExamEvent.objects.filter(is_active=True, date__gte=today)
        .select_related("exam_type")
        .order_by("date")
    )
    return [
        {"exam_type": e.exam_type.slug, "name": e.name, "date": e.date.isoformat()}
        for e in events
        if e.exam_type_id
    ]


def save_profile(
    user,
    *,
    exam_type: str | None,
    exam_year: int | None = None,
    exam_date: dt.date | None = None,
    weak_subjects: list[str] | None = None,
    today: dt.date | None = None,
) -> UserStudyProfile:
    """Create or replace the profile and mark onboarding complete. Raises ``StudyProfileError``."""
    today = today or timezone.localdate()
    exam = None
    if exam_type:
        exam = ExamType.objects.filter(slug=exam_type, is_active=True).first()
        if exam is None:
            raise StudyProfileError(MSG_EXAM, "exam_type")
    if exam_year is not None and exam_year not in year_choices(today):
        raise StudyProfileError(MSG_YEAR, "exam_year")
    if exam_date is not None:
        if exam_date < today:
            raise StudyProfileError(MSG_DATE, "exam_date")
        exam_year = exam_year or jalali_year(exam_date)
    slugs = list(dict.fromkeys(weak_subjects or []))
    if len(slugs) > UserStudyProfile.MAX_WEAK_SUBJECTS:
        raise StudyProfileError(MSG_TOO_MANY, "weak_subjects")
    subjects = list(Subject.objects.filter(slug__in=slugs, is_active=True))
    if len(subjects) != len(slugs):
        raise StudyProfileError(MSG_SUBJECT, "weak_subjects")
    with transaction.atomic():
        profile, _ = UserStudyProfile.objects.select_for_update().get_or_create(user=user)
        profile.exam_type = exam
        profile.exam_year = exam_year
        profile.exam_date = exam_date
        profile.completed_at = timezone.now()
        profile.save()
        profile.weak_subjects.set(subjects)
    return get_profile(user)


def skip_onboarding(user) -> UserStudyProfile:
    """«بعداً»: never show the sheet again (the profile stays editable in the account)."""
    profile, _ = UserStudyProfile.objects.get_or_create(user=user)
    if profile.completed_at is None and profile.skipped_at is None:
        profile.skipped_at = timezone.now()
        profile.save(update_fields=["skipped_at", "updated_at"])
    return profile
