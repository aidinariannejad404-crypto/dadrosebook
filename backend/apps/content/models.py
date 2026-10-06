import uuid

from django.db import models
from django.utils import timezone

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


# --- hubs & guides (package ب, impl/hubs) ---------------------------------------------------------


class GuideQuerySet(models.QuerySet):
    def published(self):
        return self.filter(status=Guide.Status.PUBLISHED)


class Guide(TimeStampedModel):
    """An editorial guide (``/guide/<slug>``), e.g. «بهترین منابع آزمون وکالت ۱۴۰۵».

    Written by an author and checked by a reviewer (both ``catalog.Person`` pages), with an
    editable «به‌روزرسانی» date. Only published guides are public; a draft can be previewed with
    its ``preview_key``.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "پیش‌نویس"
        PUBLISHED = "PUBLISHED", "منتشرشده"

    title = models.CharField("عنوان", max_length=200)
    slug = models.SlugField(
        "نامک",
        max_length=200,
        unique=True,
        allow_unicode=True,
        blank=True,
        help_text="خالی بگذارید تا خودکار از عنوان ساخته شود.",
    )
    summary = models.CharField(
        "خلاصه",
        max_length=300,
        blank=True,
        help_text="یک تا دو جمله؛ در نتایج گوگل و کارت راهنما نمایش داده می‌شود.",
    )
    intro = models.TextField("مقدمه", blank=True, help_text="بالای مقاله، پیش از متن اصلی.")
    body = models.TextField("متن اصلی")
    author = models.ForeignKey(
        "catalog.Person",
        verbose_name="نویسنده",
        null=True,
        blank=True,
        related_name="guides_written",
        on_delete=models.SET_NULL,
    )
    reviewer = models.ForeignKey(
        "catalog.Person",
        verbose_name="بازبین حقوقی",
        null=True,
        blank=True,
        related_name="guides_reviewed",
        on_delete=models.SET_NULL,
    )
    status = models.CharField("وضعیت", max_length=10, choices=Status.choices, default=Status.DRAFT)
    published_at = models.DateTimeField("زمان انتشار", null=True, blank=True, editable=False)
    updated_on = models.DateField(
        "تاریخ به‌روزرسانی محتوا",
        null=True,
        blank=True,
        help_text="آخرین بازبینی محتوایی (نه هر ویرایش جزئی)؛ به‌صورت «به‌روزشده در …» نمایش "
        "داده می‌شود.",
    )
    exam_types = models.ManyToManyField(
        "catalog.ExamType", verbose_name="آزمون‌ها", related_name="guides", blank=True
    )
    subjects = models.ManyToManyField(
        "catalog.Subject", verbose_name="درس‌ها", related_name="guides", blank=True
    )
    books = models.ManyToManyField(
        "catalog.Book", verbose_name="کتاب‌های معرفی‌شده", related_name="guides", blank=True
    )
    preview_key = models.UUIDField("کلید پیش‌نمایش", default=uuid.uuid4, editable=False, unique=True)

    objects = GuideQuerySet.as_manager()

    class Meta:
        verbose_name = "راهنما (مقاله)"
        verbose_name_plural = "راهنماها (مقاله)"
        ordering = ["-updated_on", "-id"]

    def __str__(self) -> str:
        return self.title

    @property
    def is_published(self) -> bool:
        return self.status == self.Status.PUBLISHED

    def save(self, *args, **kwargs):
        from apps.catalog.services.text import sanitize_html
        from apps.core.slugs import unique_slug

        if not self.slug:
            self.slug = unique_slug(self, self.title)
        self.intro = sanitize_html(self.intro)
        self.body = sanitize_html(self.body)
        if self.is_published and self.published_at is None:
            self.published_at = timezone.now()
        super().save(*args, **kwargs)


class CuratedListQuerySet(models.QuerySet):
    def visible(self):
        """Active lists (an expired list stays reachable but is flagged and noindexed)."""
        return self.filter(is_active=True)


class CuratedList(TimeStampedModel):
    """An editorial book list (``/list/<slug>``), e.g. «سریع‌خوان‌های ماه آخر»; shareable."""

    title = models.CharField("عنوان", max_length=200)
    slug = models.SlugField(
        "نامک",
        max_length=200,
        unique=True,
        allow_unicode=True,
        blank=True,
        help_text="خالی بگذارید تا خودکار از عنوان ساخته شود.",
    )
    intro = models.TextField(
        "مقدمه",
        blank=True,
        help_text="چرا این فهرست؟ برای ایندکس در گوگل حداقل حدود ۱۵۰ کلمه لازم است.",
    )
    ends_on = models.DateField(
        "تاریخ پایان",
        null=True,
        blank=True,
        help_text="برای فهرست‌های فصلی/کمپینی؛ پس از آن فهرست «پایان‌یافته» نمایش داده می‌شود.",
    )
    is_active = models.BooleanField("فعال", default=True)
    order = models.PositiveSmallIntegerField("ترتیب", default=0)

    objects = CuratedListQuerySet.as_manager()

    class Meta:
        verbose_name = "فهرست پیشنهادی"
        verbose_name_plural = "فهرست‌های پیشنهادی"
        ordering = ["order", "-id"]

    def __str__(self) -> str:
        return self.title

    def save(self, *args, **kwargs):
        from apps.catalog.services.text import sanitize_html
        from apps.core.slugs import unique_slug

        if not self.slug:
            self.slug = unique_slug(self, self.title)
        self.intro = sanitize_html(self.intro)
        super().save(*args, **kwargs)


class CuratedListItem(models.Model):
    curated_list = models.ForeignKey(
        CuratedList, verbose_name="فهرست", related_name="items", on_delete=models.CASCADE
    )
    book = models.ForeignKey(
        "catalog.Book", verbose_name="کتاب", related_name="list_items", on_delete=models.CASCADE
    )
    order = models.PositiveSmallIntegerField("ترتیب", default=0)
    note = models.CharField(
        "یادداشت کوتاه", max_length=250, blank=True, help_text="چرا این کتاب در فهرست است؟"
    )

    class Meta:
        verbose_name = "کتاب فهرست"
        verbose_name_plural = "کتاب‌های فهرست"
        ordering = ["order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["curated_list", "book"], name="unique_list_book"),
        ]

    def __str__(self) -> str:
        return f"{self.curated_list} — {self.book}"
