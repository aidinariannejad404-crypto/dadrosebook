from celery import shared_task


@shared_task
def expire_unpaid_orders() -> int:
    """Cancel unpaid orders older than ``ORDER_PAYMENT_TIMEOUT_MINUTES`` (run every 5 minutes)."""
    from .services.state import expire_unpaid

    return expire_unpaid()
