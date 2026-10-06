from django.db import models

from apps.core.models import TimeStampedModel

from .services.keys import clean_path, redirect_key


class Redirect(TimeStampedModel):
    """An old (Sazito) URL that permanently moves to a new path or an external URL."""

    class Source(models.TextChoices):
        SEED = "SEED", "پیش‌فرض سازیتو"
        ADMIN = "ADMIN", "دستی"
        IMPORT = "IMPORT", "درون‌ریزی CSV"
        NOT_FOUND = "NOT_FOUND", "از گزارش ۴۰۴"

    class Status(models.IntegerChoices):
        PERMANENT = 301, "۳۰۱ — دائمی"
        TEMPORARY = 302, "۳۰۲ — موقت"

    old_path = models.CharField(
        "نشانی قدیمی",
        max_length=500,
        unique=True,
        help_text="مسیر در سایت قبلی، مثلاً /product/حقوق-مدنی یا نشانی کامل؛ "
        "حروف فارسی و کدشده (%D8…) هر دو قبول است.",
    )
    old_path_key = models.CharField(
        "کلید جستجو", max_length=500, unique=True, db_index=True, editable=False
    )
    new_path = models.CharField(
        "نشانی جدید",
        max_length=500,
        help_text="مسیر داخلی که با / شروع می‌شود (مثلاً /product/…) یا نشانی کامل https://…",
    )
    status_code = models.PositiveSmallIntegerField(
        "نوع ریدایرکت", choices=Status.choices, default=Status.PERMANENT
    )
    is_active = models.BooleanField(
        "فعال",
        default=True,
        help_text="ریدایرکت‌های پیش‌فرض را به‌جای حذف غیرفعال کنید؛ "
        "حذف‌شده‌ها با اجرای دوباره seed ساخته می‌شوند.",
    )
    hit_count = models.PositiveIntegerField("تعداد بازدید", default=0, editable=False)
    last_hit_at = models.DateTimeField("آخرین بازدید", null=True, blank=True, editable=False)
    note = models.TextField("یادداشت", blank=True)
    source = models.CharField("منبع", max_length=10, choices=Source.choices, default=Source.ADMIN)

    class Meta:
        verbose_name = "ریدایرکت"
        verbose_name_plural = "ریدایرکت‌ها"
        ordering = ["old_path"]

    def __str__(self) -> str:
        return f"{self.old_path} → {self.new_path}"

    def clean(self):
        from .services.redirects import validate_redirect

        self.old_path = clean_path(self.old_path)
        self.new_path = (self.new_path or "").strip()
        validate_redirect(
            self.old_path, self.new_path, is_active=self.is_active, exclude_pk=self.pk
        )

    def save(self, *args, **kwargs):
        self.old_path = clean_path(self.old_path)
        self.new_path = (self.new_path or "").strip()
        self.old_path_key = redirect_key(self.old_path)
        update_fields = kwargs.get("update_fields")
        if update_fields is not None and "old_path" in update_fields:
            kwargs["update_fields"] = {*update_fields, "old_path_key"}
        super().save(*args, **kwargs)


class NotFoundHit(models.Model):
    """A path visitors reached that has no page and no redirect (reported by the frontend)."""

    path = models.CharField("مسیر", max_length=500, unique=True)
    path_key = models.CharField("کلید جستجو", max_length=500, unique=True, editable=False)
    hits = models.PositiveIntegerField("تعداد", default=0)
    first_seen = models.DateTimeField("اولین بار", auto_now_add=True)
    last_seen = models.DateTimeField("آخرین بار", auto_now=True)
    last_referer = models.CharField("آخرین ارجاع‌دهنده", max_length=500, blank=True)
    resolved = models.BooleanField("رسیدگی شد", default=False)

    class Meta:
        verbose_name = "صفحه پیدانشده (۴۰۴)"
        verbose_name_plural = "صفحه‌های پیدانشده (۴۰۴)"
        ordering = ["-hits", "-last_seen"]

    def __str__(self) -> str:
        return self.path
