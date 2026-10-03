from celery import shared_task

from .services import notify_variant_restocked


@shared_task(name="apps.engagement.tasks.notify_back_in_stock")
def notify_back_in_stock(variant_id: int) -> int:
    """SMS every pending «موجود شد خبرم کن» request of a restocked variant."""
    return notify_variant_restocked(variant_id)
