import uuid

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class Cart(TimeStampedModel):
    """A shopping cart: a guest cart (identified by ``token``) or a signed-in user's cart."""

    token = models.UUIDField("توکن", default=uuid.uuid4, unique=True, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        verbose_name="کاربر",
        null=True,
        blank=True,
        related_name="cart",
        on_delete=models.CASCADE,
    )

    class Meta:
        verbose_name = "سبد خرید"
        verbose_name_plural = "سبدهای خرید"
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"سبد {self.user or str(self.token)[:8]}"


class CartItem(TimeStampedModel):
    cart = models.ForeignKey(
        Cart, verbose_name="سبد", related_name="items", on_delete=models.CASCADE
    )
    variant = models.ForeignKey(
        "catalog.BookVariant",
        verbose_name="نسخه",
        related_name="cart_items",
        on_delete=models.CASCADE,
    )
    quantity = models.PositiveSmallIntegerField("تعداد", default=1)

    class Meta:
        verbose_name = "قلم سبد"
        verbose_name_plural = "اقلام سبد"
        ordering = ["created_at", "id"]
        constraints = [
            models.UniqueConstraint(fields=["cart", "variant"], name="unique_cart_variant"),
        ]

    def __str__(self) -> str:
        return f"{self.variant} × {self.quantity}"
