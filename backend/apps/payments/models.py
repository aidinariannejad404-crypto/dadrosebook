"""Payments (Phase 3). One order may have several attempts; at most one ends PAID.

Every status change writes a ``PaymentLog`` row (``apps.payments.services.transitions``).
Amounts here are **Rial** (the gateway's unit); the order total stays in toman.
"""

from django.db import models


class Payment(models.Model):
    class Status(models.TextChoices):
        INITIATED = "INITIATED", "ایجادشده"
        REDIRECTED = "REDIRECTED", "ارسال به درگاه"
        PAID = "PAID", "موفق"
        FAILED = "FAILED", "ناموفق"
        CANCELLED = "CANCELLED", "انصراف کاربر"

    order = models.ForeignKey(
        "orders.Order", verbose_name="سفارش", related_name="payments", on_delete=models.PROTECT
    )
    gateway = models.CharField("درگاه", max_length=30)
    amount_rial = models.PositiveBigIntegerField("مبلغ (ریال)")
    status = models.CharField(
        "وضعیت", max_length=12, choices=Status.choices, default=Status.INITIATED, db_index=True
    )
    authority = models.CharField(
        "شناسه درگاه (Authority)", max_length=64, unique=True, null=True, blank=True
    )
    ref_id = models.CharField("کد پیگیری بانک", max_length=64, blank=True)
    card_pan = models.CharField("کارت (ماسک‌شده)", max_length=32, blank=True)
    raw_request = models.JSONField("پاسخ درخواست", default=dict, blank=True)
    raw_verify = models.JSONField("پاسخ تأیید", default=dict, blank=True)
    error = models.CharField("خطا", max_length=300, blank=True)
    verified_at = models.DateTimeField("زمان تأیید", null=True, blank=True)
    created_at = models.DateTimeField("ایجاد", auto_now_add=True)
    updated_at = models.DateTimeField("به‌روزرسانی", auto_now=True)

    class Meta:
        verbose_name = "پرداخت"
        verbose_name_plural = "پرداخت‌ها"
        ordering = ["-created_at"]
        constraints = [
            # A paid order is paid exactly once.
            models.UniqueConstraint(
                fields=["order"],
                condition=models.Q(status="PAID"),
                name="one_paid_payment_per_order",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.order} — {self.get_status_display()}"


class PaymentLog(models.Model):
    payment = models.ForeignKey(
        Payment, verbose_name="پرداخت", related_name="logs", on_delete=models.CASCADE
    )
    event = models.CharField("رویداد", max_length=40)
    from_status = models.CharField("از وضعیت", max_length=12, blank=True)
    to_status = models.CharField("به وضعیت", max_length=12, blank=True)
    data = models.JSONField("داده", default=dict, blank=True)
    created_at = models.DateTimeField("زمان", auto_now_add=True)

    class Meta:
        verbose_name = "رویداد پرداخت"
        verbose_name_plural = "رویدادهای پرداخت"
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"{self.payment_id} {self.event}"
