from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel
from apps.core.storages import private_storage


class ReadingProgress(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reading_progress"
    )
    book = models.ForeignKey("catalog.Book", on_delete=models.CASCADE, related_name="+")
    page = models.PositiveIntegerField("صفحه", default=1, validators=[MinValueValidator(1)])
    total_pages = models.PositiveIntegerField("کل صفحات", default=0)
    location = models.CharField("موقعیت (EPUB)", max_length=500, blank=True)
    updated_at = models.DateTimeField("به‌روزرسانی", auto_now=True)

    class Meta:
        verbose_name = "پیشرفت مطالعه"
        verbose_name_plural = "پیشرفت مطالعه"
        constraints = [
            models.UniqueConstraint(fields=["user", "book"], name="reader_progress_user_book")
        ]

    def __str__(self) -> str:
        return f"{self.user} — {self.book}: {self.page}/{self.total_pages}"

    @property
    def percent(self) -> float:
        if not self.total_pages:
            return 0.0
        return round(min(self.page, self.total_pages) * 100 / self.total_pages, 2)


class Highlight(TimeStampedModel):
    class Color(models.TextChoices):
        YELLOW = "yellow", "زرد"
        GREEN = "green", "سبز"
        BLUE = "blue", "آبی"
        PINK = "pink", "صورتی"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="highlights"
    )
    book = models.ForeignKey("catalog.Book", on_delete=models.CASCADE, related_name="+")
    page = models.PositiveIntegerField("صفحه", validators=[MinValueValidator(1)])
    text = models.TextField("متن", max_length=2000)
    note = models.TextField("یادداشت", max_length=2000, blank=True)
    color = models.CharField("رنگ", max_length=10, choices=Color.choices, default=Color.YELLOW)
    rects = models.JSONField("مستطیل‌ها", default=list, blank=True)
    location = models.CharField("موقعیت (EPUB)", max_length=500, blank=True)

    class Meta:
        verbose_name = "هایلایت"
        verbose_name_plural = "هایلایت‌ها"
        ordering = ["page", "created_at"]
        indexes = [models.Index(fields=["user", "book", "page"])]

    def __str__(self) -> str:
        return f"{self.user} — {self.book} ص{self.page}"


def epub_asset_upload_to(instance, filename: str) -> str:
    ebook = instance.package.ebook
    return f"ebooks/{ebook.book_id}/v{ebook.version}/assets/{filename}"


class EpubPackage(models.Model):
    """An EPUB file unpacked for chapter-by-chapter streaming (the file itself is never served)."""

    ebook = models.OneToOneField(
        "library.EbookFile", on_delete=models.CASCADE, related_name="epub_package"
    )
    title = models.CharField("عنوان در فایل", max_length=300, blank=True)
    language = models.CharField("زبان", max_length=20, default="fa")
    direction = models.CharField("جهت", max_length=3, default="rtl")
    total_pages = models.PositiveIntegerField("صفحات مجازی", default=0)
    total_chars = models.PositiveIntegerField("تعداد نویسه‌ها", default=0)
    toc = models.JSONField("فهرست", default=list, blank=True)
    processed_at = models.DateTimeField("زمان پردازش", auto_now=True)

    class Meta:
        verbose_name = "بسته EPUB"
        verbose_name_plural = "بسته‌های EPUB"

    def __str__(self) -> str:
        return f"EPUB {self.ebook}"


class EpubChapter(models.Model):
    package = models.ForeignKey(EpubPackage, on_delete=models.CASCADE, related_name="chapters")
    index = models.PositiveIntegerField("ترتیب")
    href = models.CharField("مسیر در فایل", max_length=500)
    title = models.CharField("عنوان", max_length=300, blank=True)
    html = models.TextField("HTML پاک‌سازی‌شده")
    text = models.TextField("متن ساده")
    chars = models.PositiveIntegerField("نویسه‌ها", default=0)
    start_page = models.PositiveIntegerField("صفحه شروع", default=1)
    pages = models.PositiveIntegerField("صفحات", default=1)

    class Meta:
        verbose_name = "فصل EPUB"
        verbose_name_plural = "فصل‌های EPUB"
        ordering = ["package_id", "index"]
        constraints = [
            models.UniqueConstraint(fields=["package", "index"], name="reader_epub_chapter_index")
        ]

    def __str__(self) -> str:
        return f"{self.index}: {self.title}"


class EpubAsset(models.Model):
    """An image from the EPUB, copied to private storage and served only through signed URLs."""

    package = models.ForeignKey(EpubPackage, on_delete=models.CASCADE, related_name="assets")
    path = models.CharField("مسیر در فایل", max_length=500)
    media_type = models.CharField("نوع", max_length=100)
    file = models.FileField(
        "فایل", upload_to=epub_asset_upload_to, storage=private_storage, max_length=300
    )

    class Meta:
        verbose_name = "تصویر EPUB"
        verbose_name_plural = "تصاویر EPUB"
        constraints = [
            models.UniqueConstraint(fields=["package", "path"], name="reader_epub_asset_path")
        ]

    def __str__(self) -> str:
        return self.path


class Bookmark(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bookmarks"
    )
    book = models.ForeignKey("catalog.Book", on_delete=models.CASCADE, related_name="+")
    page = models.PositiveIntegerField("صفحه", validators=[MinValueValidator(1)])
    location = models.CharField("موقعیت (EPUB)", max_length=100, blank=True)
    label = models.CharField("برچسب", max_length=120, blank=True)
    created_at = models.DateTimeField("زمان", auto_now_add=True)

    class Meta:
        verbose_name = "نشانک"
        verbose_name_plural = "نشانک‌ها"
        ordering = ["page", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "book", "page", "location"], name="reader_bookmark_unique"
            )
        ]

    def __str__(self) -> str:
        return f"{self.user} — {self.book} ص{self.page}"


class ReaderDevice(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reader_devices"
    )
    key = models.CharField("شناسه (هش)", max_length=64)
    label = models.CharField("دستگاه", max_length=100, blank=True)
    first_seen = models.DateTimeField("اولین استفاده", auto_now_add=True)
    last_seen = models.DateTimeField("آخرین استفاده")
    revoked_at = models.DateTimeField("حذف‌شده در", null=True, blank=True)

    class Meta:
        verbose_name = "دستگاه مطالعه"
        verbose_name_plural = "دستگاه‌های مطالعه"
        ordering = ["-last_seen"]
        constraints = [
            models.UniqueConstraint(fields=["user", "key"], name="reader_device_user_key")
        ]

    def __str__(self) -> str:
        return f"{self.user} — {self.label or self.key[:8]}"


class ReaderAccessLog(models.Model):
    class Kind(models.TextChoices):
        OPEN = "open", "باز کردن کتاب"
        CHAPTER = "chapter", "دریافت فصل"
        FILE = "file", "دریافت فایل"
        ASSET = "asset", "دریافت تصویر"
        SEARCH = "search", "جستجو"
        EXPORT = "export", "خروجی یادداشت‌ها"
        OFFLINE = "offline", "بسته آفلاین"
        CAPTURE = "capture", "تلاش برای اسکرین‌شات"
        DENIED = "denied", "رد دسترسی"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reader_access_logs",
        null=True,
        blank=True,
    )
    book = models.ForeignKey(
        "catalog.Book", on_delete=models.CASCADE, related_name="+", null=True, blank=True
    )
    device = models.ForeignKey(
        ReaderDevice, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    kind = models.CharField("رویداد", max_length=10, choices=Kind.choices)
    detail = models.CharField("جزئیات", max_length=200, blank=True)
    ip = models.GenericIPAddressField("IP", null=True, blank=True)
    user_agent = models.CharField("مرورگر", max_length=255, blank=True)
    created_at = models.DateTimeField("زمان", auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "گزارش دسترسی کتابخوان"
        verbose_name_plural = "گزارش دسترسی کتابخوان"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "created_at"])]

    def __str__(self) -> str:
        return f"{self.get_kind_display()} — {self.user}"


class CopyLedger(models.Model):
    """Characters a user has copied from one book (all devices, all time)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="copy_ledgers"
    )
    book = models.ForeignKey("catalog.Book", on_delete=models.CASCADE, related_name="+")
    used = models.PositiveIntegerField("نویسه‌های کپی‌شده", default=0)
    updated_at = models.DateTimeField("به‌روزرسانی", auto_now=True)

    class Meta:
        verbose_name = "سهمیه کپی"
        verbose_name_plural = "سهمیه‌های کپی"
        constraints = [
            models.UniqueConstraint(fields=["user", "book"], name="reader_copy_user_book")
        ]

    def __str__(self) -> str:
        return f"{self.user} — {self.book}: {self.used}"


class OfflineLicense(models.Model):
    """Permission to keep one EPUB on one device for offline reading until ``expires_at``."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="offline_licenses"
    )
    book = models.ForeignKey("catalog.Book", on_delete=models.CASCADE, related_name="+")
    device = models.ForeignKey(ReaderDevice, on_delete=models.CASCADE, related_name="+")
    expires_at = models.DateTimeField("انقضا")
    revoked_at = models.DateTimeField("لغو", null=True, blank=True)
    created_at = models.DateTimeField("زمان", auto_now_add=True)

    class Meta:
        verbose_name = "مجوز مطالعه آفلاین"
        verbose_name_plural = "مجوزهای مطالعه آفلاین"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "book", "device"], name="reader_offline_user_book_device"
            )
        ]

    def __str__(self) -> str:
        return f"{self.user} — {self.book}"


class ReaderTraceCode(models.Model):
    """A short code drawn faintly on every page a user reads of a book.

    It traces a leaked screenshot back to the account.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reader_trace_codes"
    )
    book = models.ForeignKey("catalog.Book", on_delete=models.CASCADE, related_name="+")
    code = models.CharField("کد ردیابی", max_length=9, unique=True)
    created_at = models.DateTimeField("زمان", auto_now_add=True)

    class Meta:
        verbose_name = "کد ردیابی اسکرین‌شات"
        verbose_name_plural = "کدهای ردیابی اسکرین‌شات"
        constraints = [
            models.UniqueConstraint(fields=["user", "book"], name="reader_trace_user_book")
        ]

    def __str__(self) -> str:
        return f"{self.code} — {self.user} — {self.book}"
