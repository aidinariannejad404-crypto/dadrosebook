"""Ebook files and entitlements.

Phase 3 creates entitlements when an order is paid; Phase 4 builds the reader on top. Check access
only through ``apps.library.services.entitlements.has_entitlement``.
"""

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel
from apps.core.storages import private_storage


def ebook_upload_to(instance, filename: str) -> str:
    return f"ebooks/{instance.book_id}/v{instance.version}/{filename}"


class EbookFile(TimeStampedModel):
    class Format(models.TextChoices):
        PDF = "PDF", "PDF"
        EPUB = "EPUB", "EPUB"

    book = models.ForeignKey(
        "catalog.Book", verbose_name="کتاب", related_name="ebook_files", on_delete=models.CASCADE
    )
    format = models.CharField("قالب", max_length=10, choices=Format.choices, default=Format.PDF)
    file = models.FileField(
        "فایل", upload_to=ebook_upload_to, storage=private_storage, max_length=300
    )
    version = models.PositiveIntegerField("نسخه فایل", default=1)
    is_active = models.BooleanField("فعال", default=True)

    class Protection(models.TextChoices):
        STANDARD = "standard", "استاندارد"
        HIGH = "high", "بالا (نمایش فقط چند خط در هر لحظه)"

    protection = models.CharField(
        "سطح حفاظت در برابر اسکرین‌شات",
        max_length=10,
        choices=Protection.choices,
        default=Protection.STANDARD,
        help_text="در سطح «بالا» فقط نواری چندخطی از صفحه واضح دیده می‌شود.",
    )

    class Meta:
        verbose_name = "فایل کتاب الکترونیک"
        verbose_name_plural = "فایل‌های کتاب الکترونیک"
        ordering = ["book_id", "-version"]

    def __str__(self) -> str:
        return f"{self.book} — {self.format} v{self.version}"


class EbookEntitlement(models.Model):
    class Source(models.TextChoices):
        PURCHASE = "PURCHASE", "خرید"
        ADMIN = "ADMIN", "اعطای دستی"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="کاربر",
        related_name="ebook_entitlements",
        on_delete=models.CASCADE,
    )
    book = models.ForeignKey(
        "catalog.Book",
        verbose_name="کتاب",
        related_name="entitlements",
        on_delete=models.PROTECT,
    )
    source = models.CharField(
        "منبع", max_length=10, choices=Source.choices, default=Source.PURCHASE
    )
    source_order = models.ForeignKey(
        "orders.Order",
        verbose_name="سفارش",
        null=True,
        blank=True,
        related_name="entitlements",
        on_delete=models.SET_NULL,
    )
    revoked_at = models.DateTimeField(
        "لغو دسترسی", null=True, blank=True, help_text="مثلاً پس از بازگشت وجه."
    )
    created_at = models.DateTimeField("زمان اعطا", auto_now_add=True)

    class Meta:
        verbose_name = "دسترسی کتاب الکترونیک"
        verbose_name_plural = "دسترسی‌های کتاب الکترونیک"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "book"], name="unique_user_book_entitlement"),
        ]

    def __str__(self) -> str:
        return f"{self.user} — {self.book}"

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None
