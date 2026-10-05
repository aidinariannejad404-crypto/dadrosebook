"""Addresses, shipping methods, discount codes and orders (Phase 3).

Money is integer toman. Orders snapshot everything a customer saw (titles, prices, address,
shipping method name) so later catalog edits never change a placed order.
"""

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel

TEHRAN_PROVINCE = "تهران"

PROVINCES = [
    "آذربایجان شرقی",
    "آذربایجان غربی",
    "اردبیل",
    "اصفهان",
    "البرز",
    "ایلام",
    "بوشهر",
    "تهران",
    "چهارمحال و بختیاری",
    "خراسان جنوبی",
    "خراسان رضوی",
    "خراسان شمالی",
    "خوزستان",
    "زنجان",
    "سمنان",
    "سیستان و بلوچستان",
    "فارس",
    "قزوین",
    "قم",
    "کردستان",
    "کرمان",
    "کرمانشاه",
    "کهگیلویه و بویراحمد",
    "گلستان",
    "گیلان",
    "لرستان",
    "مازندران",
    "مرکزی",
    "هرمزگان",
    "همدان",
    "یزد",
]
PROVINCE_CHOICES = [(p, p) for p in PROVINCES]


class Address(TimeStampedModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="کاربر",
        related_name="addresses",
        on_delete=models.CASCADE,
    )
    title = models.CharField("عنوان", max_length=50, blank=True, help_text="مثلاً «خانه»")
    recipient_name = models.CharField("نام گیرنده", max_length=150)
    recipient_phone = models.CharField("موبایل گیرنده", max_length=11)
    province = models.CharField("استان", max_length=50, choices=PROVINCE_CHOICES)
    city = models.CharField("شهر", max_length=80)
    postal_code = models.CharField("کد پستی", max_length=10, help_text="۱۰ رقم")
    address_line = models.TextField("نشانی")
    is_default = models.BooleanField("پیش‌فرض", default=False)

    class Meta:
        verbose_name = "نشانی"
        verbose_name_plural = "نشانی‌ها"
        ordering = ["-is_default", "-updated_at"]

    def __str__(self) -> str:
        return f"{self.recipient_name} — {self.city}"

    @property
    def is_tehran(self) -> bool:
        return self.province == TEHRAN_PROVINCE

    def snapshot(self) -> dict:
        """Frozen copy stored on the order."""
        return {
            "title": self.title,
            "recipient_name": self.recipient_name,
            "recipient_phone": self.recipient_phone,
            "province": self.province,
            "city": self.city,
            "postal_code": self.postal_code,
            "address_line": self.address_line,
        }


class ShippingMethod(TimeStampedModel):
    """A way to send print books. Ebook-only orders never need one."""

    name = models.CharField("نام", max_length=100)
    code = models.SlugField("کد", max_length=50, unique=True, allow_unicode=True)
    description = models.CharField("توضیح", max_length=250, blank=True)
    eta_note = models.CharField("زمان تحویل", max_length=100, blank=True)
    base_price = models.PositiveIntegerField("هزینه (تومان)", default=0)
    free_over = models.PositiveIntegerField(
        "رایگان برای سفارش‌های بالای (تومان)",
        null=True,
        blank=True,
        help_text="خالی یعنی از «حد ارسال رایگان» تنظیمات فروشگاه استفاده شود؛ "
        "۰ یعنی همیشه رایگان.",
    )
    tehran_only = models.BooleanField(
        "فقط تهران",
        default=False,
        help_text="مثلاً پیک؛ برای نشانی‌های خارج از تهران نمایش داده نمی‌شود.",
    )
    is_active = models.BooleanField("فعال", default=True)
    order = models.PositiveSmallIntegerField("ترتیب", default=0)

    class Meta:
        verbose_name = "روش ارسال"
        verbose_name_plural = "روش‌های ارسال"
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return self.name


class DiscountCode(TimeStampedModel):
    class Kind(models.TextChoices):
        PERCENT = "PERCENT", "درصدی"
        FIXED = "FIXED", "مبلغ ثابت"

    code = models.CharField(
        "کد", max_length=40, unique=True, help_text="بدون فاصله؛ بزرگی و کوچکی حروف مهم نیست."
    )
    description = models.CharField("توضیح داخلی", max_length=200, blank=True)
    kind = models.CharField("نوع", max_length=10, choices=Kind.choices, default=Kind.PERCENT)
    value = models.PositiveIntegerField("مقدار", help_text="درصد (۱ تا ۱۰۰) یا مبلغ ثابت به تومان.")
    max_discount = models.PositiveIntegerField(
        "سقف تخفیف (تومان)", null=True, blank=True, help_text="فقط برای کد درصدی."
    )
    min_order_total = models.PositiveIntegerField(
        "حداقل مبلغ سفارش (تومان)", default=0, help_text="روی جمع اقلام مشمول حساب می‌شود."
    )
    max_uses = models.PositiveIntegerField(
        "حداکثر دفعات استفاده", null=True, blank=True, help_text="خالی یعنی نامحدود."
    )
    per_user_limit = models.PositiveIntegerField(
        "حداکثر استفاده هر کاربر", null=True, blank=True, default=1, help_text="خالی یعنی نامحدود."
    )
    valid_from = models.DateTimeField("شروع اعتبار", null=True, blank=True)
    valid_until = models.DateTimeField("پایان اعتبار", null=True, blank=True)
    subjects = models.ManyToManyField(
        "catalog.Subject",
        verbose_name="فقط برای درس‌ها",
        blank=True,
        help_text="خالی یعنی همه درس‌ها.",
    )
    formats = models.JSONField(
        "فقط برای نسخه‌ها",
        default=list,
        blank=True,
        help_text='فهرست نوع نسخه‌ها، مثلاً ["EBOOK"]؛ خالی یعنی همه.',
    )
    is_active = models.BooleanField("فعال", default=True)
    used_count = models.PositiveIntegerField(
        "دفعات استفاده", default=0, editable=False, help_text="سفارش‌های پرداخت‌شده."
    )

    class Meta:
        verbose_name = "کد تخفیف"
        verbose_name_plural = "کدهای تخفیف"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.code

    def save(self, *args, **kwargs):
        from apps.core.normalize import normalize_persian

        self.code = normalize_persian(self.code or "").replace(" ", "").upper()
        super().save(*args, **kwargs)


class Order(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING_PAYMENT = "PENDING_PAYMENT", "در انتظار پرداخت"
        PAID = "PAID", "پرداخت‌شده"
        PROCESSING = "PROCESSING", "در حال آماده‌سازی"
        SHIPPED = "SHIPPED", "ارسال‌شده"
        DELIVERED = "DELIVERED", "تحویل‌شده"
        CANCELLED = "CANCELLED", "لغوشده"
        FAILED = "FAILED", "پرداخت ناموفق"

    number = models.CharField("شماره سفارش", max_length=20, unique=True, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="مشتری",
        related_name="orders",
        on_delete=models.PROTECT,
    )
    status = models.CharField(
        "وضعیت",
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING_PAYMENT,
        db_index=True,
    )
    checkout_key = models.UUIDField(
        "کلید یکتای تسویه",
        null=True,
        blank=True,
        unique=True,
        help_text="از فرانت‌اند می‌آید تا کلیک دوباره سفارش تکراری نسازد.",
    )

    items_total = models.PositiveIntegerField("جمع اقلام (تومان)", default=0)
    discount_total = models.PositiveIntegerField("تخفیف (تومان)", default=0)
    shipping_total = models.PositiveIntegerField("هزینه ارسال (تومان)", default=0)
    total = models.PositiveIntegerField("مبلغ قابل پرداخت (تومان)", default=0)
    refunded_total = models.PositiveIntegerField(
        "مبلغ مسترد شده (تومان)",
        default=0,
        editable=False,
        help_text="جمع استردادهای انجام‌شده (مرجوعی‌ها)؛ درآمد خالص = مبلغ سفارش منهای این.",
    )

    discount_code = models.ForeignKey(
        DiscountCode,
        verbose_name="کد تخفیف",
        null=True,
        blank=True,
        related_name="orders",
        on_delete=models.SET_NULL,
    )
    discount_code_text = models.CharField("کد تخفیف واردشده", max_length=40, blank=True)

    needs_shipping = models.BooleanField("نیاز به ارسال", default=False)
    shipping_method = models.ForeignKey(
        ShippingMethod,
        verbose_name="روش ارسال",
        null=True,
        blank=True,
        related_name="orders",
        on_delete=models.SET_NULL,
    )
    shipping_method_name = models.CharField("روش ارسال (ثبت‌شده)", max_length=100, blank=True)
    shipping_address = models.JSONField("نشانی ارسال (ثبت‌شده)", null=True, blank=True)
    tracking_code = models.CharField("کد رهگیری مرسوله", max_length=60, blank=True)

    customer_note = models.TextField("یادداشت مشتری", blank=True)
    staff_note = models.TextField("یادداشت داخلی", blank=True)

    paid_at = models.DateTimeField("زمان پرداخت", null=True, blank=True)
    shipped_at = models.DateTimeField("زمان ارسال", null=True, blank=True)
    delivered_at = models.DateTimeField("زمان تحویل", null=True, blank=True)
    cancelled_at = models.DateTimeField("زمان لغو", null=True, blank=True)

    class Meta:
        verbose_name = "سفارش"
        verbose_name_plural = "سفارش‌ها"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.number

    def save(self, *args, **kwargs):
        if not self.number:
            from .services.numbers import new_order_number

            self.number = new_order_number()
        super().save(*args, **kwargs)

    @property
    def is_paid(self) -> bool:
        return self.paid_at is not None

    @property
    def net_total(self) -> int:
        return max(self.total - self.refunded_total, 0)


class OrderItem(models.Model):
    order = models.ForeignKey(
        Order, verbose_name="سفارش", related_name="items", on_delete=models.CASCADE
    )
    variant = models.ForeignKey(
        "catalog.BookVariant",
        verbose_name="نسخه",
        null=True,
        blank=True,
        related_name="order_items",
        on_delete=models.SET_NULL,
    )
    book = models.ForeignKey(
        "catalog.Book",
        verbose_name="کتاب",
        null=True,
        blank=True,
        related_name="order_items",
        on_delete=models.SET_NULL,
    )
    title = models.CharField("عنوان (ثبت‌شده)", max_length=300)
    variant_type = models.CharField("نوع نسخه", max_length=10)
    list_price = models.PositiveIntegerField("قیمت پشت جلد (تومان)")
    unit_price = models.PositiveIntegerField("قیمت واحد (تومان)")
    quantity = models.PositiveSmallIntegerField(
        "تعداد", default=1, validators=[MinValueValidator(1), MaxValueValidator(20)]
    )
    line_total = models.PositiveIntegerField("جمع (تومان)")

    class Meta:
        verbose_name = "قلم سفارش"
        verbose_name_plural = "اقلام سفارش"
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self.title} × {self.quantity}"

    @property
    def is_digital(self) -> bool:
        return self.variant_type == "EBOOK"

    @property
    def needs_shipping(self) -> bool:
        return self.variant_type in ("PRINT", "BUNDLE")

    @property
    def grants_ebook(self) -> bool:
        return self.variant_type in ("EBOOK", "BUNDLE")


class OrderStatusLog(models.Model):
    order = models.ForeignKey(
        Order, verbose_name="سفارش", related_name="status_logs", on_delete=models.CASCADE
    )
    from_status = models.CharField("از وضعیت", max_length=20, blank=True)
    to_status = models.CharField("به وضعیت", max_length=20)
    note = models.CharField("توضیح", max_length=300, blank=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="انجام‌دهنده",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField("زمان", auto_now_add=True)

    class Meta:
        verbose_name = "تغییر وضعیت سفارش"
        verbose_name_plural = "تاریخچه وضعیت سفارش"
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"{self.order} {self.from_status} → {self.to_status}"


class DiscountRedemption(models.Model):
    """One row per paid order that used a code (per-user and total limits count these)."""

    code = models.ForeignKey(
        DiscountCode, verbose_name="کد", related_name="redemptions", on_delete=models.CASCADE
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="کاربر", on_delete=models.CASCADE
    )
    order = models.OneToOneField(
        Order, verbose_name="سفارش", related_name="redemption", on_delete=models.CASCADE
    )
    amount = models.PositiveIntegerField("مبلغ تخفیف (تومان)")
    created_at = models.DateTimeField("زمان", auto_now_add=True)

    class Meta:
        verbose_name = "استفاده از کد تخفیف"
        verbose_name_plural = "استفاده‌های کد تخفیف"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.code} — {self.order}"


class ReturnRequest(TimeStampedModel):
    """One return case (مرجوعی) on a paid order; see ``apps.orders.services.returns``.

    ``REQUESTED → APPROVED → RECEIVED → REFUNDED``; ``REQUESTED | APPROVED → REJECTED | CANCELLED``.
    A return with no physical line may be refunded straight from APPROVED.
    """

    class Status(models.TextChoices):
        REQUESTED = "REQUESTED", "ثبت‌شده"
        APPROVED = "APPROVED", "تأییدشده"
        RECEIVED = "RECEIVED", "کالا دریافت شد"
        REFUNDED = "REFUNDED", "وجه مسترد شد"
        REJECTED = "REJECTED", "ردشده"
        CANCELLED = "CANCELLED", "لغوشده"

    class Reason(models.TextChoices):
        DAMAGED = "DAMAGED", "آسیب‌دیده یا معیوب"
        WRONG_ITEM = "WRONG_ITEM", "ارسال کالای اشتباه"
        CHANGED_MIND = "CHANGED_MIND", "انصراف از خرید"
        LATE_DELIVERY = "LATE_DELIVERY", "تأخیر در تحویل"
        OTHER = "OTHER", "سایر"

    class RefundMethod(models.TextChoices):
        GATEWAY = "GATEWAY", "بازگشت از طریق درگاه"
        SHABA = "SHABA", "واریز به شبا"
        CARD = "CARD", "واریز کارت‌به‌کارت"

    order = models.ForeignKey(
        Order, verbose_name="سفارش", related_name="returns", on_delete=models.PROTECT
    )
    status = models.CharField(
        "وضعیت", max_length=12, choices=Status.choices, default=Status.REQUESTED, db_index=True
    )
    reason = models.CharField("دلیل", max_length=20, choices=Reason.choices)
    description = models.TextField("توضیح دلیل", blank=True)
    restock = models.BooleanField(
        "بازگشت به موجودی",
        default=True,
        help_text="با «کالا دریافت شد» نسخه‌های چاپی و پکیج به موجودی انبار برمی‌گردند.",
    )
    revoke_ebook = models.BooleanField(
        "لغو دسترسی کتاب الکترونیک",
        default=False,
        help_text="با استرداد وجه، دسترسی مشتری به کتاب‌های الکترونیک این اقلام برداشته می‌شود.",
    )
    refund_amount = models.PositiveIntegerField(
        "مبلغ استرداد (تومان)",
        null=True,
        blank=True,
        help_text="خالی یعنی سهم اقلام مرجوعی از مبلغ سفارش؛ بیشتر از مبلغ قابل استرداد سفارش "
        "نمی‌شود.",
    )
    refund_method = models.CharField(
        "روش استرداد", max_length=10, choices=RefundMethod.choices, default=RefundMethod.SHABA
    )
    shaba = models.CharField(
        "شماره شبا", max_length=26, blank=True, help_text="با IR و ۲۴ رقم، مثلاً IR06…"
    )
    card_number = models.CharField("شماره کارت", max_length=16, blank=True)
    account_holder = models.CharField("نام صاحب حساب", max_length=150, blank=True)
    refund_reference = models.CharField(
        "شماره پیگیری واریز",
        max_length=64,
        blank=True,
        help_text="برای شبا و کارت پیش از «استرداد وجه» وارد شود.",
    )
    staff_note = models.TextField("یادداشت داخلی", blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="ثبت‌کننده",
        null=True,
        blank=True,
        related_name="+",
        on_delete=models.SET_NULL,
    )
    approved_at = models.DateTimeField("زمان تأیید", null=True, blank=True)
    received_at = models.DateTimeField("زمان دریافت کالا", null=True, blank=True)
    refunded_at = models.DateTimeField("زمان استرداد", null=True, blank=True)
    closed_at = models.DateTimeField("زمان رد/لغو", null=True, blank=True)

    class Meta:
        verbose_name = "مرجوعی"
        verbose_name_plural = "مرجوعی‌ها و استرداد وجه"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"مرجوعی {self.pk or ''} — {self.order}"

    @property
    def has_physical_lines(self) -> bool:
        return any(line.order_item.needs_shipping for line in self.lines.all())


class ReturnLine(models.Model):
    return_request = models.ForeignKey(
        ReturnRequest, verbose_name="مرجوعی", related_name="lines", on_delete=models.CASCADE
    )
    order_item = models.ForeignKey(
        OrderItem, verbose_name="قلم سفارش", related_name="return_lines", on_delete=models.PROTECT
    )
    quantity = models.PositiveSmallIntegerField(
        "تعداد", default=1, validators=[MinValueValidator(1)]
    )

    class Meta:
        verbose_name = "قلم مرجوعی"
        verbose_name_plural = "اقلام مرجوعی"
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["return_request", "order_item"], name="one_line_per_item_per_return"
            )
        ]

    def __str__(self) -> str:
        return f"{self.order_item.title} × {self.quantity}"

    @property
    def amount_share(self) -> int:
        """This line's share of the item's ``line_total`` (integer toman)."""
        item = self.order_item
        if not item.quantity:
            return 0
        return item.line_total * self.quantity // item.quantity


class ReturnRequestLog(models.Model):
    """Every change to a return: status moves, edits and refund attempts."""

    return_request = models.ForeignKey(
        ReturnRequest, verbose_name="مرجوعی", related_name="logs", on_delete=models.CASCADE
    )
    from_status = models.CharField("از وضعیت", max_length=12, blank=True)
    to_status = models.CharField("به وضعیت", max_length=12, blank=True)
    note = models.CharField("توضیح", max_length=500, blank=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="انجام‌دهنده",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField("زمان", auto_now_add=True)

    class Meta:
        verbose_name = "رویداد مرجوعی"
        verbose_name_plural = "تاریخچه مرجوعی"
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"{self.return_request_id} {self.from_status} → {self.to_status}"
