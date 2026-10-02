from django.db import models

from apps.core.models import TimeStampedModel


class Banner(TimeStampedModel):
    class Placement(models.TextChoices):
        HERO = "HERO", "بنر اصلی (هیرو)"
        COURSE = "COURSE", "بنر کتاب + دوره"

    placement = models.CharField(
        "جایگاه", max_length=10, choices=Placement.choices, default=Placement.HERO
    )
    title = models.CharField("عنوان", max_length=200)
    subtitle = models.CharField("زیرعنوان", max_length=300, blank=True)
    image = models.ImageField("تصویر", upload_to="banners/", blank=True)
    link_url = models.CharField(
        "لینک", max_length=500, blank=True, help_text="مسیر داخلی (مثل /kit) یا آدرس کامل."
    )
    link_label = models.CharField("متن دکمه", max_length=100, blank=True)
    order = models.PositiveSmallIntegerField("ترتیب", default=0)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "بنر"
        verbose_name_plural = "بنرها"
        ordering = ["placement", "order", "id"]

    def __str__(self) -> str:
        return self.title


class GuideVideo(TimeStampedModel):
    title = models.CharField("عنوان", max_length=200)
    video_url = models.URLField("لینک ویدیو")
    thumbnail = models.ImageField("تصویر بندانگشتی", upload_to="guide-videos/", blank=True)
    subject = models.ForeignKey(
        "catalog.Subject",
        verbose_name="درس",
        null=True,
        blank=True,
        related_name="guide_videos",
        on_delete=models.SET_NULL,
    )
    exam_type = models.ForeignKey(
        "catalog.ExamType",
        verbose_name="آزمون",
        null=True,
        blank=True,
        related_name="guide_videos",
        on_delete=models.SET_NULL,
    )
    order = models.PositiveSmallIntegerField("ترتیب", default=0)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "ویدیوی راهنما"
        verbose_name_plural = "ویدیوهای راهنما (کدام کتاب را بخوانم؟)"
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return self.title
