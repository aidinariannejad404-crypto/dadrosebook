"""Detect a stock-tracked variant going from 0 to > 0 and queue the back-in-stock SMS task.

Only ``Model.save()`` (admin, import scripts that save) fires these; ``QuerySet.update()`` does not.
"""

from django.db import transaction
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from apps.catalog.models import BookVariant

from .services.back_in_stock import has_pending_requests


@receiver(pre_save, sender=BookVariant, dispatch_uid="engagement-variant-old-stock")
def _remember_old_stock(sender, instance, raw=False, **kwargs):
    if raw or instance.pk is None:
        instance._old_stock = None
        return
    instance._old_stock = (
        BookVariant.objects.filter(pk=instance.pk).values_list("stock", flat=True).first()
    )


@receiver(post_save, sender=BookVariant, dispatch_uid="engagement-variant-restocked")
def _variant_saved(sender, instance, created, raw=False, **kwargs):
    if raw or created or instance.type == BookVariant.Type.EBOOK:
        return
    old_stock = getattr(instance, "_old_stock", None)
    if old_stock != 0 or instance.stock <= 0 or not has_pending_requests(instance.pk):
        return
    from .tasks import notify_back_in_stock

    variant_id = instance.pk
    transaction.on_commit(lambda: notify_back_in_stock.delay(variant_id))
