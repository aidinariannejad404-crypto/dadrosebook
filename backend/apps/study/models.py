"""Study and retention models (owned by ``apps.study``).

* Reading minutes: ``ReadingSession`` (one sitting, for reading speed), ``BookReadingDay``
  (seconds per user/book/Tehran day) and ``ReadingDay`` (seconds per user/day + the goal that
  applied that day: the streak is computed from these rows).
* ``StudyProfile``: the daily goal and notification preferences.
* ``StudyPlan`` / ``StudyPlanBook``: the account-linked, living study plan.
* ``EditionLink`` / ``EditionUpgradeNotice``: «ارتقای ویرایش» (owner discount + one SMS).
* ``ReviewPrompt``: «این کتاب برای آزمون شما چقدر کمک کرد؟».
"""

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel

DEFAULT_DAILY_GOAL_MINUTES = 20


class StudyProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="study_profile"
    )
    daily_goal_minutes = models.PositiveSmallIntegerField(
        "هدف روزانه (دقیقه)",
        default=DEFAULT_DAILY_GOAL_MINUTES,
        validators=[MinValueValidator(5), MaxValueValidator(600)],
    )
    review_sms = models.BooleanField(
        "پیامک درخواست نظر", default=True, help_text="یک پیامک کوتاه برای نظر دادن درباره کتاب."
    )
    last_beat_at = models.DateTimeField("آخرین ضربان مطالعه", null=True, blank=True)
    updated_at = models.DateTimeField("به‌روزرسانی", auto_now=True)

    class Meta:
        verbose_name = "تنظیمات مطالعه"
        verbose_name_plural = "تنظیمات مطالعه"

    def __str__(self) -> str:
        return f"{self.user} — {self.daily_goal_minutes} دقیقه"


class ReadingSession(models.Model):
    """One sitting with a book: heartbeats less than ``SESSION_GAP`` apart join the same session."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reading_sessions"
    )
    book = models.ForeignKey("catalog.Book", on_delete=models.CASCADE, related_name="+")
    started_at = models.DateTimeField("شروع")
    last_beat_at = models.DateTimeField("آخرین ضربان")
    seconds = models.PositiveIntegerField("ثانیه‌های مطالعه فعال", default=0)
    start_page = models.PositiveIntegerField("صفحه شروع", default=0)
    last_page = models.PositiveIntegerField("آخرین صفحه", default=0)
    pages_read = models.PositiveIntegerField("صفحات پیش‌رفته", default=0)

    class Meta:
        verbose_name = "جلسه مطالعه"
        verbose_name_plural = "جلسه‌های مطالعه"
        ordering = ["-last_beat_at"]
        indexes = [models.Index(fields=["user", "book", "-last_beat_at"])]

    def __str__(self) -> str:
        return f"{self.user} — {self.book} ({self.seconds // 60} دقیقه)"


class BookReadingDay(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    book = models.ForeignKey("catalog.Book", on_delete=models.CASCADE, related_name="+")
    date = models.DateField("روز (تهران)")
    seconds = models.PositiveIntegerField("ثانیه‌ها", default=0)

    class Meta:
        verbose_name = "مطالعه روزانه کتاب"
        verbose_name_plural = "مطالعه روزانه کتاب‌ها"
        constraints = [
            models.UniqueConstraint(fields=["user", "book", "date"], name="study_book_day_unique")
        ]
        indexes = [models.Index(fields=["user", "date"])]

    def __str__(self) -> str:
        return f"{self.user} — {self.book} — {self.date}"


class ReadingDay(models.Model):
    """All reading of one user on one Tehran calendar day."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reading_days"
    )
    date = models.DateField("روز (تهران)")
    seconds = models.PositiveIntegerField("ثانیه‌ها", default=0)
    goal_minutes = models.PositiveSmallIntegerField("هدف همان روز (دقیقه)")
    goal_met_at = models.DateTimeField("زمان رسیدن به هدف", null=True, blank=True)

    class Meta:
        verbose_name = "روز مطالعه"
        verbose_name_plural = "روزهای مطالعه"
        ordering = ["-date"]
        constraints = [models.UniqueConstraint(fields=["user", "date"], name="study_day_unique")]

    def __str__(self) -> str:
        return f"{self.user} — {self.date}: {self.seconds // 60} دقیقه"

    @property
    def minutes(self) -> int:
        return self.seconds // 60

    @property
    def goal_met(self) -> bool:
        return self.goal_met_at is not None


class StudyPlan(TimeStampedModel):
    """A user's living plan: page ranges per day up to the exam (one active plan per user)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="study_plans"
    )
    lead = models.ForeignKey(
        "leads.Lead",
        verbose_name="سرنخ مبدأ",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    exam_name = models.CharField("آزمون", max_length=200, blank=True)
    exam_date = models.DateField("تاریخ آزمون", null=True, blank=True)
    hours_per_day = models.PositiveSmallIntegerField("ساعت در روز", default=4)
    days = models.JSONField("روزهای مطالعه", default=list)
    review = models.JSONField("روزهای جمع‌بندی", default=list)
    is_active = models.BooleanField("فعال", default=True)
    compressed_count = models.PositiveSmallIntegerField("دفعات فشرده‌سازی", default=0)
    last_compressed_at = models.DateTimeField("آخرین فشرده‌سازی", null=True, blank=True)

    class Meta:
        verbose_name = "برنامه مطالعه کاربر"
        verbose_name_plural = "برنامه‌های مطالعه کاربران"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.user} — {self.exam_name or 'برنامه مطالعه'}"


class StudyPlanBook(models.Model):
    """One book of a plan and how far the user got (check-offs and the ebook reader)."""

    plan = models.ForeignKey(StudyPlan, on_delete=models.CASCADE, related_name="books")
    book = models.ForeignKey(
        "catalog.Book", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    slug = models.CharField("نامک", max_length=300)
    title = models.CharField("عنوان", max_length=300)
    subject = models.JSONField("درس", null=True, blank=True)
    total_pages = models.PositiveIntegerField("صفحات")
    pages_done = models.PositiveIntegerField("تا صفحه (خوانده‌شده)", default=0)
    order = models.PositiveSmallIntegerField("ترتیب", default=0)

    class Meta:
        verbose_name = "کتاب برنامه"
        verbose_name_plural = "کتاب‌های برنامه"
        ordering = ["plan_id", "order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["plan", "slug"], name="study_plan_book_unique")
        ]

    def __str__(self) -> str:
        return f"{self.title}: {self.pages_done}/{self.total_pages}"


class EditionLink(TimeStampedModel):
    """``new_book`` is a newer edition of ``old_book``; owners of the old one get a discount."""

    new_book = models.ForeignKey(
        "catalog.Book",
        verbose_name="ویرایش جدید",
        on_delete=models.CASCADE,
        related_name="older_edition_links",
    )
    old_book = models.ForeignKey(
        "catalog.Book",
        verbose_name="ویرایش قبلی",
        on_delete=models.CASCADE,
        related_name="newer_edition_links",
    )
    upgrade_discount_percent = models.PositiveSmallIntegerField(
        "تخفیف ارتقا (درصد)",
        default=40,
        validators=[MinValueValidator(1), MaxValueValidator(90)],
        help_text="دارندگان ویرایش قبلی (خرید پرداخت‌شده یا دسترسی الکترونیک) این تخفیف را "
        "روی ویرایش جدید می‌گیرند.",
    )
    is_active = models.BooleanField("فعال", default=True)
    notified_at = models.DateTimeField("آخرین ارسال پیامک به دارندگان", null=True, blank=True)

    class Meta:
        verbose_name = "ارتقای ویرایش"
        verbose_name_plural = "ارتقای ویرایش‌ها"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["new_book", "old_book"], name="study_edition_unique"),
            models.CheckConstraint(
                condition=~models.Q(new_book=models.F("old_book")),
                name="study_edition_not_self",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.old_book} → {self.new_book}"


class EditionUpgradeNotice(models.Model):
    """One upgrade SMS per owner and link (the notify task is idempotent through this row)."""

    link = models.ForeignKey(EditionLink, on_delete=models.CASCADE, related_name="notices")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    sent_at = models.DateTimeField("ارسال", auto_now_add=True)

    class Meta:
        verbose_name = "پیامک ارتقای ویرایش"
        verbose_name_plural = "پیامک‌های ارتقای ویرایش"
        constraints = [
            models.UniqueConstraint(fields=["link", "user"], name="study_edition_notice_unique")
        ]

    def __str__(self) -> str:
        return f"{self.user} — {self.link}"


class ReviewPrompt(TimeStampedModel):
    class Reason(models.TextChoices):
        DELIVERED = "DELIVERED", "۱۰ روز پس از تحویل"
        READ = "READ", "۹۰٪ خوانده‌شده"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="review_prompts"
    )
    book = models.ForeignKey("catalog.Book", on_delete=models.CASCADE, related_name="+")
    reason = models.CharField("دلیل", max_length=10, choices=Reason.choices)
    sms_sent_at = models.DateTimeField("پیامک", null=True, blank=True)
    dismissed_at = models.DateTimeField("بسته‌شده", null=True, blank=True)
    answered_at = models.DateTimeField("پاسخ داده‌شده", null=True, blank=True)

    class Meta:
        verbose_name = "درخواست نظر"
        verbose_name_plural = "درخواست‌های نظر"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "book"], name="study_review_prompt_unique")
        ]

    def __str__(self) -> str:
        return f"{self.user} — {self.book}"
