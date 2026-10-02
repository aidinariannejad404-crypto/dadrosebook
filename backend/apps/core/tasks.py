from celery import shared_task


@shared_task
def ping() -> str:
    """Trivial task used to check that the worker is alive."""
    return "pong"
