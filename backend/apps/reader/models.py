import uuid
from pathlib import PurePosixPath

from django.conf import settings
from django.core.validators import FileExtensionValidator, MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel
from apps.core.storages import private_storage


def ebook_upload_to(instance: "EbookFile", filename: str) -> str:
    """Random, unguessable name under the book's folder; the original name is never kept."""
    ext = PurePosixPath(filename).suffix.lower() or ".bin"
    return f"ebooks/{instance.book_id}/{uuid.uuid4().hex}{ext}"


class EbookFile(TimeStampedModel):
    """An ebook file on the private storage. Never served by a public URL (see services.signing)."""

    class Format(models.TextChoices):
        PDF = "PDF", "PDF"
        EPUB = "EPUB", "EPUB"

    book = models.ForeignKey(
        "catalog.Book", on_delete=models.CASCADE, related_name="ebook_files", verbose_name="کتاب"
    )
    format = models.CharField("قالب", max_length=4, choices=Format.choices, default=Format.PDF)
    file = models.FileField(
        "فایل",
        storage=private_storage,
        upload_to=ebook_upload_to,
        max_length=255,
        validators=[FileExtensionValidator(["pdf", "epub"])],
        help_text="در فضای خصوصی ذخیره می‌شود و فقط با لینک امضاشده‌ی کوتاه‌مدت قابل خواندن است.",
    )
    version = models.PositiveIntegerField("نسخه", default=1)
    pages = models.PositiveIntegerField("تعداد صفحات", null=True, blank=True)
    size = models.PositiveBigIntegerField("حجم (بایت)", default=0, editable=False)
    sha256 = models.CharField("SHA-256", max_length=64, blank=True, editable=False)
    is_active = models.BooleanField(
        "فعال", default=True, help_text="هر کتاب فقط یک فایل فعال دارد؛ همان در کتابخوان باز می‌شود."
    )

    class Meta:
        verbose_name = "فایل کتاب الکترونیک"
        verbose_name_plural = "فایل‌های کتاب الکترونیک"
        ordering = ["book", "-version"]
        constraints = [
            models.UniqueConstraint(
                fields=["book"],
                condition=models.Q(is_active=True),
                name="reader_one_active_ebook_file_per_book",
                violation_error_message="این کتاب از قبل یک فایل فعال دارد.",
            )
        ]

    def __str__(self) -> str:
        return f"{self.book} — {self.format} v{self.version}"


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
