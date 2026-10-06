"""Inbox (PF-2), notification preferences (PF-3), study profile (PF-8), changelog (PF-17)."""

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class UserStudyProfile(TimeStampedModel):
    """What the customer studies for, saved on the account (the ``exam`` cookie lasts one browser).

    Filled by the 3-tap onboarding sheet after the first login and editable in the account.
    """

    MAX_WEAK_SUBJECTS = 3

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="study_profile"
    )
    exam_type = models.ForeignKey(
        "catalog.ExamType",
        verbose_name="آزمون",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    exam_year = models.PositiveSmallIntegerField(
        "سال آزمون (شمسی)", null=True, blank=True, help_text="مثلاً ۱۴۰۵"
    )
    exam_date = models.DateField("تاریخ آزمون", null=True, blank=True)
    weak_subjects = models.ManyToManyField(
        "catalog.Subject", verbose_name="درس‌هایی که نیاز به تقویت دارند", blank=True
    )
    completed_at = models.DateTimeField("تکمیل در", null=True, blank=True)
    skipped_at = models.DateTimeField("ردشده در", null=True, blank=True)

    class Meta:
        verbose_name = "پروفایل مطالعه"
        verbose_name_plural = "پروفایل‌های مطالعه"

    def __str__(self) -> str:
        return f"{self.user} — {self.exam_type or 'بدون آزمون'}"


class Notification(models.Model):
    """One message in «پیام‌های من». Every SMS sent through ``apps.accounts.sms.deliver_sms``
    to a registered phone also lands here (see ``apps.inbox.services.dispatch``)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    kind = models.CharField("نوع", max_length=40, db_index=True)
    title = models.CharField("عنوان", max_length=200)
    body = models.TextField("متن", max_length=2000)
    link = models.CharField(
        "لینک داخل سایت", max_length=500, blank=True, help_text="مسیر نسبی، مثلاً /account/orders"
    )
    discount_code = models.CharField("کد تخفیف", max_length=40, blank=True)
    read_at = models.DateTimeField("خوانده‌شده در", null=True, blank=True)
    created_at = models.DateTimeField("ایجاد", auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "پیام کاربر"
        verbose_name_plural = "پیام‌های کاربران"
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["user", "read_at"], name="inbox_user_unread")]

    def __str__(self) -> str:
        return f"{self.user} — {self.title}"


class NotificationSettings(models.Model):
    """Per-user opt-outs. Only marketing kinds can be muted; service messages always go out."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notification_settings"
    )
    muted_kinds = models.JSONField("انواع خاموش‌شده", default=list, blank=True)
    updated_at = models.DateTimeField("به‌روزرسانی", auto_now=True)

    class Meta:
        verbose_name = "تنظیمات اعلان"
        verbose_name_plural = "تنظیمات اعلان کاربران"

    def __str__(self) -> str:
        return str(self.user)


class ChangelogEntry(TimeStampedModel):
    """A «تازه‌ها» item on /changelog; the newest one flagged ``announce`` opens a one-time sheet."""

    class Area(models.TextChoices):
        READER = "reader", "کتابخوان"
        STORE = "store", "فروشگاه"
        ACCOUNT = "account", "حساب کاربری"
        FIX = "fix", "رفع اشکال"

    title = models.CharField("عنوان", max_length=150)
    body = models.TextField("توضیح", max_length=3000)
    area = models.CharField("بخش", max_length=20, choices=Area.choices, default=Area.STORE)
    link = models.CharField("لینک (اختیاری)", max_length=300, blank=True)
    published_at = models.DateField("تاریخ انتشار")
    is_published = models.BooleanField("منتشرشده", default=True)
    announce = models.BooleanField(
        "نمایش در پنجره «تازه‌ها»",
        default=True,
        help_text="یک بار برای کاربرانی که وارد شده‌اند نشان داده می‌شود.",
    )

    class Meta:
        verbose_name = "تازه‌های دادرُز"
        verbose_name_plural = "تازه‌های دادرُز (تغییرات)"
        ordering = ["-published_at", "-id"]

    def __str__(self) -> str:
        return self.title
