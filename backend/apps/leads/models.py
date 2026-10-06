import uuid

from django.db import models

from apps.catalog.models import Book, ExamType, Subject


class Lead(models.Model):
    """A visitor who left a mobile number (with consent), e.g. to unlock a study plan."""

    class Source(models.TextChoices):
        STUDY_PLAN = "study_plan", "برنامه مطالعه"

    phone = models.CharField("موبایل", max_length=11, db_index=True)
    source = models.CharField(
        "منبع", max_length=30, choices=Source.choices, default=Source.STUDY_PLAN
    )
    exam_type = models.ForeignKey(
        ExamType,
        verbose_name="آزمون",
        null=True,
        blank=True,
        related_name="leads",
        on_delete=models.SET_NULL,
    )
    subjects = models.ManyToManyField(
        Subject, verbose_name="درس‌ها", related_name="leads", blank=True
    )
    books = models.ManyToManyField(Book, verbose_name="کتاب‌ها", related_name="leads", blank=True)
    hours_per_day = models.PositiveSmallIntegerField("ساعت مطالعه در روز", default=4)
    consent = models.BooleanField("رضایت تماس و پیامک", default=False)
    token = models.UUIDField("توکن", default=uuid.uuid4, unique=True, editable=False)
    plan = models.JSONField("برنامه ساخته‌شده", default=dict, blank=True, editable=False)
    ip_hash = models.CharField("هش IP", max_length=64, blank=True, editable=False)
    user_agent = models.CharField("مرورگر", max_length=200, blank=True, editable=False)
    created_at = models.DateTimeField("ایجاد", auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "سرنخ"
        verbose_name_plural = "سرنخ‌ها"
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"{self.phone} — {self.get_source_display()}"
