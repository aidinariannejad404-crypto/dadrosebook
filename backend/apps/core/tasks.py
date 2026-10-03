from celery import shared_task


@shared_task
def ping() -> str:
    """Trivial task used to check that the worker is alive."""
    return "pong"


@shared_task(ignore_result=True)
def send_analytics_event(payload: dict, client_ip: str = "") -> bool:
    """Deliver one Umami event (see ``apps.core.analytics``); never raises."""
    from .analytics import send_event

    return send_event(payload, client_ip=client_ip)
