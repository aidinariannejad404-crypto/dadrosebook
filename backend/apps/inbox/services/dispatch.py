"""The SMS → inbox hook (``settings.SMS_DELIVERY_HOOKS``, run by ``accounts.sms.deliver_sms``)."""

from apps.accounts.models import User
from apps.accounts.phone import normalize_phone

from .notifications import is_muted, notify


def on_sms(phone: str, message: str, *, kind=None, link: str = "", code: str = ""):
    """Copy a store SMS into the recipient's inbox; ``False`` (skip the SMS) when muted.

    Messages without a kind (staff 2FA codes) and phones without an account are left alone.
    """
    if not kind:
        return None
    user = User.objects.filter(phone=normalize_phone(phone), is_active=True).first()
    if user is None:
        return None
    if is_muted(user, kind):
        return False
    notify(user, kind, message, link=link, code=code)
    return None
