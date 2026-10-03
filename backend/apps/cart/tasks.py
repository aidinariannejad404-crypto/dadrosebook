from celery import shared_task

from .services import purge_stale_carts as purge


@shared_task(name="apps.cart.tasks.purge_stale_carts")
def purge_stale_carts(days: int | None = None) -> int:
    """Delete guest carts untouched for ``CART_TTL_DAYS``."""
    return purge(days)
