from django.conf import settings
from django.db import models


class StudyReminderConsent(models.Model):
    """A customer's opt-in to SMS study reminders (د۳). Sending them is a later step.

    One row per user; ``sms`` is the current choice and ``consented_at`` the last opt-in time, so
    the consent can be proven (and withdrawn) without touching ``accounts.User``.
    """

    class Source(models.TextChoices):
        PAYMENT_RESULT = "payment_result", "صفحه شروع مطالعه"
        ACCOUNT = "account", "حساب کاربری"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        verbose_name="کاربر",
        related_name="study_reminder_consent",
        on_delete=models.CASCADE,
    )
    sms = models.BooleanField("یادآور پیامکی مطالعه", default=False)
    source = models.CharField("محل ثبت", max_length=20, choices=Source.choices, blank=True)
    consented_at = models.DateTimeField("زمان موافقت", null=True, blank=True)
    withdrawn_at = models.DateTimeField("زمان انصراف", null=True, blank=True)
    updated_at = models.DateTimeField("به‌روزرسانی", auto_now=True)

    class Meta:
        verbose_name = "رضایت یادآور مطالعه"
        verbose_name_plural = "رضایت‌های یادآور مطالعه"
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"{self.user} — {'بله' if self.sms else 'خیر'}"
