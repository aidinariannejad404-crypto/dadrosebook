"""Second login step for staff: a code sent by SMS to the staff member's own phone.

Separate from the customer OTP flow (no ``OtpCode`` rows, never logs anyone in, never creates
users); it only reuses that module's code generation, hashing and digit cleaning.

* The code is ``STAFF_2FA_CODE_LENGTH`` digits; only an HMAC of it lives in the cache, for
  ``STAFF_2FA_TTL_SECONDS``.
* ``STAFF_2FA_MAX_ATTEMPTS`` wrong tries burn the code; a new one must be sent.
* A new code can be sent at most once per ``STAFF_2FA_RESEND_SECONDS``.
* Codes never reach the logs; attempts are logged with user id and IP only.
"""

import hmac
import logging
import math

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from .otp import clean_code, generate_code, hash_code

logger = logging.getLogger("apps.accounts.staff_2fa")

SESSION_FLAG = "staff_2fa_ok"
CODE_KEY = "staff2fa:code:{user_id}"
COOLDOWN_KEY = "staff2fa:cooldown:{user_id}"

MSG_SMS = "کد تأیید ورود به پنل مدیریت دادرُز: {code}"
MSG_THROTTLED = "برای ارسال دوبارهٔ کد {seconds} ثانیه صبر کنید."
MSG_WRONG = "کد واردشده درست نیست."
MSG_BURNED = "تعداد تلاش‌های ناموفق زیاد بود؛ لطفاً کد جدید بگیرید."
MSG_NO_CODE = "کد فعالی وجود ندارد یا منقضی شده است؛ لطفاً کد جدید بگیرید."


class Staff2faError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class Staff2faThrottled(Exception):
    def __init__(self, retry_after: int):
        self.retry_after = retry_after
        self.message = MSG_THROTTLED.format(seconds=retry_after)
        super().__init__(self.message)


def _subject(user) -> str:
    # Namespaced so a staff hash can never match a customer OTP hash for the same phone.
    return f"staff2fa:{user.pk}"


def is_verified(session, user) -> bool:
    return session.get(SESSION_FLAG) == str(user.pk)


def mark_verified(session, user) -> None:
    session[SESSION_FLAG] = str(user.pk)


def has_active_code(user) -> bool:
    return cache.get(CODE_KEY.format(user_id=user.pk)) is not None


def resend_wait(user) -> int:
    """Seconds until another code may be sent (0 = now)."""
    until = cache.get(COOLDOWN_KEY.format(user_id=user.pk))
    now = timezone.now().timestamp()
    return max(0, math.ceil(until - now)) if until else 0


def send_code(user, ip: str | None = None) -> None:
    """Issue a new code (replacing any older one) and text it. Raises ``Staff2faThrottled``."""
    wait = resend_wait(user)
    if wait:
        raise Staff2faThrottled(wait)
    code = generate_code(settings.STAFF_2FA_CODE_LENGTH)
    ttl = settings.STAFF_2FA_TTL_SECONDS
    cache.set(
        CODE_KEY.format(user_id=user.pk),
        {
            "hash": hash_code(_subject(user), code),
            "attempts": 0,
            "expires_at": timezone.now().timestamp() + ttl,
        },
        timeout=ttl,
    )
    resend = settings.STAFF_2FA_RESEND_SECONDS
    if resend > 0:
        cache.set(
            COOLDOWN_KEY.format(user_id=user.pk),
            timezone.now().timestamp() + resend,
            timeout=resend,
        )
    _send_sms(user.phone, MSG_SMS.format(code=code))
    logger.info("Staff 2FA code sent: user_id=%s ip=%s", user.pk, ip)


def _send_sms(phone: str, message: str) -> None:
    from ..tasks import send_sms

    try:
        send_sms.delay(phone, message)
    except Exception:
        logger.exception("Could not queue the staff 2FA SMS; sending synchronously")
        send_sms(phone, message)


def verify_code(user, code: str | None, ip: str | None = None) -> None:
    """Check ``code``; returns on success (the code is consumed). Raises ``Staff2faError``."""
    key = CODE_KEY.format(user_id=user.pk)
    entry = cache.get(key)
    now = timezone.now().timestamp()
    if entry is None or entry["expires_at"] <= now:
        logger.warning("Staff 2FA failed (no active code): user_id=%s ip=%s", user.pk, ip)
        raise Staff2faError(MSG_NO_CODE)
    if entry["attempts"] >= settings.STAFF_2FA_MAX_ATTEMPTS:
        logger.warning("Staff 2FA failed (code burned): user_id=%s ip=%s", user.pk, ip)
        raise Staff2faError(MSG_BURNED)
    code = clean_code(code)
    if len(code) == settings.STAFF_2FA_CODE_LENGTH and hmac.compare_digest(
        entry["hash"], hash_code(_subject(user), code)
    ):
        cache.delete(key)
        logger.info("Staff 2FA succeeded: user_id=%s ip=%s", user.pk, ip)
        return
    entry["attempts"] += 1
    # Keep the original expiry: wrong tries never extend a code's life.
    cache.set(key, entry, timeout=max(1, math.ceil(entry["expires_at"] - now)))
    logger.warning(
        "Staff 2FA failed (wrong code, attempt %s/%s): user_id=%s ip=%s",
        entry["attempts"],
        settings.STAFF_2FA_MAX_ATTEMPTS,
        user.pk,
        ip,
    )
    if entry["attempts"] >= settings.STAFF_2FA_MAX_ATTEMPTS:
        raise Staff2faError(MSG_BURNED)
    raise Staff2faError(MSG_WRONG)
