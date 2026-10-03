from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel


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
