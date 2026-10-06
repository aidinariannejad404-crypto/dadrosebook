"""Growth loops (research report, package «و»): partner codes, exam-calendar campaigns, shareable
kit links and gifts by link. Torob/Emalls feeds need no model (``services/torob.py``).

Money is integer toman; business logic lives in ``apps.growth.services``.
"""

import secrets

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel

# Entitlement source used when a gift is claimed. ``EbookEntitlement.Source.GIFT`` has the same
# value (migration ``library/0002_entitlement_source_gift``).
GIFT_ENTITLEMENT_SOURCE = "GIFT"


def new_token(nbytes: int = 18) -> str:
    return secrets.token_urlsafe(nbytes)


# --- و۵ partner codes -------------------------------------------------------------------------


class Partner(TimeStampedModel):
    """A student association, institute or academy that distributes our discount codes."""

    class Kind(models.TextChoices):
        STUDENT_ASSOCIATION = "STUDENT_ASSOCIATION", "انجمن دانشجویی"
        INSTITUTE = "INSTITUTE", "مؤسسه"
        ACADEMY = "ACADEMY", "آکادمی / آموزشگاه"
        OTHER = "OTHER", "سایر"

    name = models.CharField("نام", max_length=150)
    kind = models.CharField("نوع", max_length=24, choices=Kind.choices)
    contact_name = models.CharField("نام رابط", max_length=150, blank=True)
    contact_phone = models.CharField("تلفن رابط", max_length=20, blank=True)
    note = models.TextField("یادداشت داخلی", blank=True)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "همکار"
        verbose_name_plural = "همکاران (کد همکاری)"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class PartnerCode(models.Model):
    """Links one ``orders.DiscountCode`` to a partner (a reporting label; the code is unchanged)."""

    partner = models.ForeignKey(
        Partner, verbose_name="همکار", related_name="codes", on_delete=models.CASCADE
    )
    discount_code = models.OneToOneField(
        "orders.DiscountCode",
        verbose_name="کد تخفیف",
        related_name="partner_link",
        on_delete=models.CASCADE,
    )
    created_at = models.DateTimeField("زمان", auto_now_add=True)

    class Meta:
        verbose_name = "کد همکار"
        verbose_name_plural = "کدهای همکار"
        ordering = ["partner_id", "id"]

    def __str__(self) -> str:
        return f"{self.partner} — {self.discount_code}"


# --- و۶ exam-calendar campaigns ----------------------------------------------------------------


class Campaign(TimeStampedModel):
    """A dated campaign with a landing (``/campaign/<slug>``) and one auto-applied discount."""

    title = models.CharField("عنوان", max_length=150)
    slug = models.SlugField("نامک", max_length=160, unique=True, allow_unicode=True)
    subtitle = models.CharField("زیرعنوان", max_length=250, blank=True)
    description = models.TextField("توضیح", blank=True)
    hero_image = models.ImageField("تصویر بالای صفحه", upload_to="campaigns/", blank=True)
    hero_color = models.CharField(
        "رنگ پس‌زمینه", max_length=7, blank=True, help_text="مثلاً #12264A؛ خالی یعنی رنگ برند."
    )
    starts_at = models.DateTimeField("شروع")
    ends_at = models.DateTimeField("پایان")
    exam_event = models.ForeignKey(
        "catalog.ExamEvent",
        verbose_name="تاریخ آزمون مرتبط",
        null=True,
        blank=True,
        related_name="campaigns",
        on_delete=models.SET_NULL,
    )
    books = models.ManyToManyField(
        "catalog.Book", verbose_name="کتاب‌های مشمول", blank=True, related_name="campaigns"
    )
    subjects = models.ManyToManyField(
        "catalog.Subject",
        verbose_name="درس‌های مشمول",
        blank=True,
        related_name="campaigns",
        help_text="همه کتاب‌های این درس‌ها هم مشمول‌اند. اگر کتاب و درس هر دو خالی باشند، همه "
        "کتاب‌ها مشمول‌اند.",
    )
    discount_code = models.ForeignKey(
        "orders.DiscountCode",
        verbose_name="قاعده تخفیف (خودکار)",
        null=True,
        blank=True,
        related_name="campaigns",
        on_delete=models.SET_NULL,
        help_text="یک کد تخفیف با متن غیرقابل‌حدس (مثلاً CAMP-…) بسازید؛ در بازه کمپین روی "
        "کتاب‌های مشمول سبد خودکار اعمال می‌شود. درصد، سقف، حداقل سفارش و محدودیت هر کاربر از "
        "همان کد خوانده می‌شود.",
    )
    show_on_home = models.BooleanField("بنر صفحه اصلی", default=True)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "کمپین"
        verbose_name_plural = "کمپین‌های تقویم آزمون"
        ordering = ["-starts_at"]

    def __str__(self) -> str:
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            from apps.core.slugs import persian_slugify

            self.slug = persian_slugify(self.title)[:160]
        super().save(*args, **kwargs)


# --- و۳ shareable kit links --------------------------------------------------------------------


class KitShare(models.Model):
    """A short link to a chosen kit: ``/kit?k=<token>`` reproduces exam + books + formats."""

    token = models.CharField("کد", max_length=16, unique=True, editable=False)
    fingerprint = models.CharField("اثر انگشت", max_length=64, unique=True, editable=False)
    exam_type = models.ForeignKey(
        "catalog.ExamType",
        verbose_name="آزمون",
        null=True,
        blank=True,
        related_name="+",
        on_delete=models.SET_NULL,
    )
    variant_ids = models.JSONField("نسخه‌ها", default=list)
    views = models.PositiveIntegerField("بازدید", default=0)
    created_at = models.DateTimeField("زمان", auto_now_add=True)

    class Meta:
        verbose_name = "لینک اشتراک کیت"
        verbose_name_plural = "لینک‌های اشتراک کیت"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.token


# --- و۴ gift by link ---------------------------------------------------------------------------


class Gift(TimeStampedModel):
    """A paid order bought as a gift: a one-time claim link replaces delivery to the buyer."""

    class Status(models.TextChoices):
        PENDING_PAYMENT = "PENDING_PAYMENT", "در انتظار پرداخت"
        ACTIVE = "ACTIVE", "آماده دریافت"
        CLAIMED = "CLAIMED", "دریافت‌شده"
        CANCELLED = "CANCELLED", "لغوشده"

    order = models.OneToOneField(
        "orders.Order", verbose_name="سفارش", related_name="gift", on_delete=models.CASCADE
    )
    token = models.CharField("کد لینک", max_length=40, unique=True, default=new_token)
    sender_name = models.CharField("نام فرستنده", max_length=80)
    recipient_name = models.CharField("نام گیرنده", max_length=80, blank=True)
    message = models.CharField("پیام", max_length=300, blank=True)
    status = models.CharField(
        "وضعیت",
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING_PAYMENT,
        db_index=True,
    )
    activated_at = models.DateTimeField("فعال‌شدن", null=True, blank=True)
    expires_at = models.DateTimeField("مهلت دریافت", null=True, blank=True)
    claimed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="دریافت‌کننده",
        null=True,
        blank=True,
        related_name="claimed_gifts",
        on_delete=models.SET_NULL,
    )
    claimed_at = models.DateTimeField("زمان دریافت", null=True, blank=True)
    shipping_address = models.JSONField("نشانی گیرنده (ثبت‌شده)", null=True, blank=True)

    class Meta:
        verbose_name = "هدیه"
        verbose_name_plural = "هدیه‌ها"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"هدیه {self.order}"
