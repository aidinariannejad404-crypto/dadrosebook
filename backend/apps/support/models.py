"""PF-11: support tickets with a tracking code (guests check status by phone + code)."""

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class SupportTicket(TimeStampedModel):
    class Topic(models.TextChoices):
        ORDER = "order", "پیگیری سفارش و ارسال"
        EBOOK = "ebook", "کتاب الکترونیک و کتابخوان"
        PAYMENT = "payment", "پرداخت"
        RETURN = "return", "بازگشت کالا و استرداد"
        ACCOUNT = "account", "ورود و حساب کاربری"
        BOOK = "book", "پرسش درباره کتاب و انتخاب منبع"
        OTHER = "other", "سایر موارد"

    class Status(models.TextChoices):
        OPEN = "open", "در انتظار پاسخ"
        ANSWERED = "answered", "پاسخ داده شد"
        CLOSED = "closed", "بسته شد"

    tracking_code = models.CharField("کد پیگیری", max_length=12, unique=True, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="کاربر",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="support_tickets",
    )
    phone = models.CharField("شماره موبایل", max_length=11, db_index=True)
    name = models.CharField("نام", max_length=100, blank=True)
    topic = models.CharField("موضوع", max_length=20, choices=Topic.choices)
    subject = models.CharField("عنوان", max_length=150)
    order = models.ForeignKey(
        "orders.Order",
        verbose_name="سفارش",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    book = models.ForeignKey(
        "catalog.Book",
        verbose_name="کتاب",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    status = models.CharField(
        "وضعیت", max_length=10, choices=Status.choices, default=Status.OPEN, db_index=True
    )
    source = models.CharField("صفحه ثبت", max_length=40, blank=True)
    last_customer_at = models.DateTimeField("آخرین پیام مشتری", null=True, blank=True)
    last_staff_at = models.DateTimeField("آخرین پاسخ پشتیبانی", null=True, blank=True)
    closed_at = models.DateTimeField("بسته‌شده در", null=True, blank=True)

    class Meta:
        verbose_name = "درخواست پشتیبانی"
        verbose_name_plural = "درخواست‌های پشتیبانی"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.tracking_code} — {self.subject}"


class TicketMessage(models.Model):
    class Author(models.TextChoices):
        CUSTOMER = "customer", "مشتری"
        STAFF = "staff", "پشتیبانی دادرُز"

    ticket = models.ForeignKey(SupportTicket, on_delete=models.CASCADE, related_name="messages")
    author = models.CharField("نویسنده", max_length=10, choices=Author.choices)
    staff_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="کارمند",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    body = models.TextField("متن", max_length=4000)
    created_at = models.DateTimeField("زمان", auto_now_add=True)

    class Meta:
        verbose_name = "پیام درخواست"
        verbose_name_plural = "پیام‌های درخواست"
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"{self.ticket.tracking_code} — {self.get_author_display()}"
