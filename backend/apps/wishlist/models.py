from django.conf import settings
from django.db import models


class WishlistItem(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="کاربر",
        related_name="wishlist_items",
        on_delete=models.CASCADE,
    )
    book = models.ForeignKey(
        "catalog.Book", verbose_name="کتاب", related_name="wishlisted_by", on_delete=models.CASCADE
    )
    created_at = models.DateTimeField("زمان", auto_now_add=True)

    class Meta:
        verbose_name = "علاقه‌مندی"
        verbose_name_plural = "علاقه‌مندی‌ها"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "book"], name="unique_wishlist_user_book"),
        ]

    def __str__(self) -> str:
        return f"{self.user} — {self.book}"
