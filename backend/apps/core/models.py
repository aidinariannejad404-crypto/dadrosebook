from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField("ایجاد", auto_now_add=True)
    updated_at = models.DateTimeField("به‌روزرسانی", auto_now=True)

    class Meta:
        abstract = True


DEFAULT_PRINT_DISPATCH_NOTE = "ارسال حداکثر ۱ روز کاری پس از سفارش"
DEFAULT_DELIVERY_TEHRAN_NOTE = "تحویل تهران ۱ تا ۲ روز کاری"
DEFAULT_DELIVERY_PROVINCE_NOTE = "سایر شهرها ۳ تا ۵ روز کاری"


class StoreSettings(models.Model):
    """Singleton (pk=1) of store-wide texts and numbers edited in the admin.

    Read it with ``apps.core.services.store_settings.get_store_settings()``.
    """

    SINGLETON_PK = 1

    free_shipping_threshold = models.PositiveIntegerField(
        "حد ارسال رایگان (تومان)",
        default=0,
        help_text="سفارش‌های بالاتر از این مبلغ ارسال رایگان دارند. ۰ یعنی ارسال رایگان نداریم.",
    )
    print_dispatch_note = models.CharField(
        "متن زمان ارسال نسخه چاپی", max_length=200, default=DEFAULT_PRINT_DISPATCH_NOTE
    )
    delivery_tehran_note = models.CharField(
        "متن زمان تحویل تهران", max_length=200, default=DEFAULT_DELIVERY_TEHRAN_NOTE
    )
    delivery_province_note = models.CharField(
        "متن زمان تحویل سایر شهرها", max_length=200, default=DEFAULT_DELIVERY_PROVINCE_NOTE
    )
    consult_whatsapp = models.CharField(
        "واتساپ مشاوره",
        max_length=20,
        blank=True,
        help_text="شماره بین‌المللی بدون + و صفر، مثلاً 989121234567. "
        "خالی یعنی دکمه نمایش داده نشود.",
    )
    consult_telegram = models.CharField(
        "تلگرام مشاوره",
        max_length=64,
        blank=True,
        help_text="نام کاربری بدون @، مثلاً dadrose_support. خالی یعنی دکمه نمایش داده نشود.",
    )
    support_hours = models.CharField(
        "ساعات پاسخ‌گویی", max_length=100, blank=True, help_text="مثلاً «همه روزه ۹ تا ۲۱»."
    )
    enamad_html = models.TextField(
        "کد نماد اعتماد (اینماد)",
        blank=True,
        help_text="کد <a><img> که اینماد می‌دهد. فقط تگ‌های a و img نگه داشته می‌شوند.",
    )
    students_count_claim = models.CharField(
        "ادعای تعداد دانشجو",
        max_length=100,
        blank=True,
        help_text="مثلاً «+۱۵٬۰۰۰ دانشجوی آکادمی دادرُز». فقط با تأیید مالک پر شود؛ "
        "خالی یعنی نمایش داده نشود.",
    )
    low_stock_threshold = models.PositiveSmallIntegerField(
        "حد هشدار موجودی کم",
        default=3,
        help_text="نسخه‌های چاپی با موجودی برابر یا کمتر از این عدد در پیشخوان هشدار می‌گیرند.",
    )
    shipping_overdue_days = models.PositiveSmallIntegerField(
        "مهلت تحویل مرسوله (روز)",
        default=10,
        help_text="سفارش ارسال‌شده‌ای که بیش از این تعداد روز «تحویل‌شده» نشود در پیشخوان "
        "پیگیری می‌شود.",
    )
    abandoned_cart_enabled = models.BooleanField(
        "یادآوری سبد رهاشده",
        default=False,
        help_text="به مشتریانی که وارد حساب شده‌اند و سبدشان را رها کرده‌اند یک پیامک یادآوری "
        "فرستاده می‌شود (هر سبد حداکثر یک بار). متن در «قالب پیامک‌ها».",
    )
    abandoned_cart_hours = models.PositiveSmallIntegerField(
        "فاصله یادآوری (ساعت)",
        default=6,
        help_text="سبدی که این مدت دست نخورده و به خرید نرسیده رهاشده حساب می‌شود.",
    )
    abandoned_cart_code = models.CharField(
        "کد تخفیف یادآوری",
        max_length=40,
        blank=True,
        help_text="اختیاری: کدی که در پیامک با متغیر {code} می‌آید. خود کد را در «کدهای تخفیف» "
        "بسازید.",
    )
    updated_at = models.DateTimeField("به‌روزرسانی", auto_now=True)

    class Meta:
        verbose_name = "تنظیمات فروشگاه"
        verbose_name_plural = "تنظیمات فروشگاه"

    def __str__(self) -> str:
        return "تنظیمات فروشگاه"

    def save(self, *args, **kwargs):
        from .services.store_settings import sanitize_enamad_html

        self.pk = self.SINGLETON_PK
        self.enamad_html = sanitize_enamad_html(self.enamad_html)
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """The singleton is never deleted."""
        return 0, {}


class SmsTemplate(models.Model):
    """Editable text of one SMS the store sends (see ``apps.core.sms_catalog``)."""

    key = models.CharField("پیامک", max_length=40, unique=True, editable=False)
    body = models.TextField(
        "متن پیامک",
        help_text="متغیرها را با آکولاد بنویسید، مثلاً {order}. "
        "فهرست متغیرهای مجاز زیر فرم آمده است.",
    )
    is_active = models.BooleanField(
        "ارسال شود", default=True, help_text="اگر خاموش باشد این پیامک اصلاً فرستاده نمی‌شود."
    )
    updated_at = models.DateTimeField("به‌روزرسانی", auto_now=True)

    class Meta:
        verbose_name = "قالب پیامک"
        verbose_name_plural = "قالب پیامک‌ها"
        ordering = ["id"]

    def __str__(self) -> str:
        from .sms_catalog import KINDS

        kind = KINDS.get(self.key)
        return kind.label if kind else self.key
