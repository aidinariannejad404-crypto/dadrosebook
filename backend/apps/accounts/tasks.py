from celery import shared_task

from .sms import deliver_sms, get_sms_provider


@shared_task
def send_sms(phone: str, message: str, kind: str = "", link: str = "", code: str = "") -> None:
    """Send a store SMS through ``deliver_sms`` (inbox copy + the customer's preferences).

    ``kind`` is an ``apps.core.sms_catalog`` key; plain staff messages leave it empty.
    """
    deliver_sms(phone, message, kind=kind or None, link=link, code=code)


@shared_task
def send_otp_sms(phone: str, code: str) -> None:
    """Send a login code (providers use a dedicated OTP template on a service line, PF-1)."""
    get_sms_provider().send_otp(phone, code)


@shared_task
def send_voice_otp(phone: str, code: str) -> None:
    """PF-1 fallback: read the login code out in a phone call (only when enabled)."""
    get_sms_provider().send_voice_otp(phone, code)
