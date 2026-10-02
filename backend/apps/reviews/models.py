from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel


class Review(TimeStampedModel):
    """A customer review. Only APPROVED reviews are public (moderated in the admin)."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "در انتظار بررسی"
        APPROVED = "APPROVED", "تأییدشده"
        REJECTED = "REJECTED", "ردشده"

    book = models.ForeignKey(
        "catalog.Book", verbose_name="کتاب", related_name="reviews", on_delete=models.CASCADE
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="کاربر",
        related_name="reviews",
        on_delete=models.CASCADE,
    )
    rating = models.PositiveSmallIntegerField(
        "امتیاز", validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    body = models.TextField("متن", max_length=2000, blank=True)
    exam_type = models.ForeignKey(
        "catalog.ExamType",
        verbose_name="برای آزمون",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    status = models.CharField(
        "وضعیت", max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    is_verified_purchase = models.BooleanField("خریدار تأییدشده", default=False)
    reject_reason = models.CharField("دلیل رد", max_length=200, blank=True)
    moderated_at = models.DateTimeField("زمان بررسی", null=True, blank=True)
    moderated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="بررسی‌کننده",
        null=True,
        blank=True,
        related_name="+",
        on_delete=models.SET_NULL,
    )

    class Meta:
        verbose_name = "نظر"
        verbose_name_plural = "نظرات"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["book", "user"], name="one_review_per_user_book"),
        ]

    def __str__(self) -> str:
        return f"{self.book} — {self.rating}★"
