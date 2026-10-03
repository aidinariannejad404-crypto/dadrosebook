from celery import shared_task

from .sms import get_sms_provider


@shared_task
def send_sms(phone: str, message: str) -> None:
    """Send a plain text SMS through the configured provider."""
    get_sms_provider().send(phone, message)


@shared_task
def send_otp_sms(phone: str, code: str) -> None:
    """Send a login code (providers may use a dedicated OTP template/pattern)."""
    get_sms_provider().send_otp(phone, code)
