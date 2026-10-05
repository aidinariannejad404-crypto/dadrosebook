from django.db import models


class SalesReport(models.Model):
    """No table: exists only to carry the «view sales report» permission for staff roles."""

    class Meta:
        managed = False
        default_permissions = ("view",)
        verbose_name = "گزارش فروش"
        verbose_name_plural = "گزارش فروش"

    def __str__(self) -> str:
        return "گزارش فروش"
