from django.conf import settings
from django.db import models

from apps.accounts.phone import validate_phone
from apps.core.models import TimeStampedModel


class BackInStockRequest(TimeStampedModel):
    """«موجود شد خبرم کن»: an SMS request for when an out-of-stock variant is restocked."""

    class Source(models.TextChoices):
        PRODUCT = "product", "صفحه محصول"
        CARD = "card", "کارت کتاب"
        CART = "cart", "سبد خرید"
        KIT = "kit", "بسته مطالعاتی"

    class Status(models.TextChoices):
        PENDING = "PENDING", "در انتظار"
        NOTIFIED = "NOTIFIED", "اطلاع داده شد"
        CANCELLED = "CANCELLED", "لغو شده"

    variant = models.ForeignKey(
        "catalog.BookVariant",
        verbose_name="نسخه",
        related_name="back_in_stock_requests",
        on_delete=models.CASCADE,
    )
    phone = models.CharField("موبایل", max_length=11, validators=[validate_phone])
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="کاربر",
        null=True,
        blank=True,
        related_name="back_in_stock_requests",
        on_delete=models.SET_NULL,
    )
    source = models.CharField("منبع", max_length=20, choices=Source.choices, blank=True)
    status = models.CharField(
        "وضعیت", max_length=20, choices=Status.choices, default=Status.PENDING
    )
    notified_at = models.DateTimeField("زمان اطلاع‌رسانی", null=True, blank=True)
    converted_at = models.DateTimeField("زمان خرید", null=True, blank=True)

    class Meta:
        verbose_name = "درخواست اطلاع از موجودی"
        verbose_name_plural = "درخواست‌های اطلاع از موجودی"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["variant", "status"], name="bis_variant_status_idx")]
        constraints = [
            models.UniqueConstraint(
                fields=["variant", "phone"],
                condition=models.Q(status="PENDING"),
                name="unique_pending_back_in_stock",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.phone} — {self.variant}"
