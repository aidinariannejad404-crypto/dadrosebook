"""Phone + OTP login.

* Codes are ``settings.OTP_LENGTH`` random digits (``secrets``); only an HMAC-SHA256 of
  ``phone:code`` keyed with ``SECRET_KEY`` is stored, compared in constant time.
* A code lives ``OTP_TTL_SECONDS``, is single-use and is burned after ``OTP_MAX_ATTEMPTS`` wrong
  tries. Requesting a new code invalidates older ones.
* Rate limits live in the cache, keyed on the normalised phone: one request per
  ``OTP_RESEND_SECONDS`` and at most ``OTP_MAX_PER_PHONE_PER_HOUR`` per hour (the per-IP limit is
  the DRF ``otp_request`` throttle on the view).
"""

import hashlib
import hmac
import logging
import math
import re
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.core.normalize import normalize_persian

from ..models import OtpCode, User
from ..phone import normalize_phone, validate_phone

logger = logging.getLogger(__name__)

COOLDOWN_KEY = "otp:cooldown:{phone}"
HOUR_COUNT_KEY = "otp:hour:{phone}"
HOUR_RESET_KEY = "otp:hour-reset:{phone}"
HOUR = 3600

MSG_THROTTLED_RESEND = "برای درخواست کد جدید کمی صبر کنید."
MSG_THROTTLED_HOUR = "تعداد درخواست‌های کد برای این شماره بیش از حد مجاز است. بعداً دوباره تلاش کنید."
MSG_WRONG = "کد واردشده درست نیست."
MSG_EXPIRED = "کد منقضی شده است؛ لطفاً کد جدید درخواست کنید."
MSG_BURNED = "تعداد تلاش‌های ناموفق زیاد بود؛ لطفاً کد جدید درخواست کنید."
MSG_NO_CODE = "کد فعالی برای این شماره وجود ندارد؛ لطفاً کد جدید درخواست کنید."
MSG_INACTIVE = "حساب کاربری شما غیرفعال شده است. با پشتیبانی تماس بگیرید."


class OtpError(Exception):
    """A user-facing OTP failure. ``field`` is the serializer field the message belongs to."""

    def __init__(self, message: str, *, field: str = "code"):
        super().__init__(message)
        self.message = message
        self.field = field


class OtpThrottled(Exception):
    def __init__(self, message: str, retry_after: int):
        super().__init__(message)
        self.message = message
        self.retry_after = retry_after


def clean_phone(phone: str | None) -> str:
    """Normalise and validate; raises ``django.core.exceptions.ValidationError``."""
    phone = normalize_phone(phone)
    validate_phone(phone)
    return phone


def clean_code(code: str | None) -> str:
    return re.sub(r"\D", "", normalize_persian(code or ""))


def hash_code(phone: str, code: str) -> str:
    key = settings.SECRET_KEY.encode()
    return hmac.new(key, f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


def generate_code(length: int | None = None) -> str:
    length = length or settings.OTP_LENGTH
    return "".join(secrets.choice("0123456789") for _ in range(length))


def _now_ts() -> float:
    return timezone.now().timestamp()


def _check_rate_limits(phone: str) -> None:
    now = _now_ts()
    until = cache.get(COOLDOWN_KEY.format(phone=phone))
    if until and until > now:
        raise OtpThrottled(MSG_THROTTLED_RESEND, max(1, math.ceil(until - now)))
    count = cache.get(HOUR_COUNT_KEY.format(phone=phone)) or 0
    if count >= settings.OTP_MAX_PER_PHONE_PER_HOUR:
        reset_at = cache.get(HOUR_RESET_KEY.format(phone=phone)) or now + HOUR
        raise OtpThrottled(MSG_THROTTLED_HOUR, max(1, math.ceil(reset_at - now)))


def _record_request(phone: str) -> None:
    now = _now_ts()
    resend = settings.OTP_RESEND_SECONDS
    if resend > 0:
        cache.set(COOLDOWN_KEY.format(phone=phone), now + resend, timeout=resend)
    count_key = HOUR_COUNT_KEY.format(phone=phone)
    if cache.add(count_key, 1, timeout=HOUR):
        cache.set(HOUR_RESET_KEY.format(phone=phone), now + HOUR, timeout=HOUR)
    else:
        try:
            cache.incr(count_key)
        except ValueError:  # expired between add() and incr()
            cache.set(count_key, 1, timeout=HOUR)
            cache.set(HOUR_RESET_KEY.format(phone=phone), now + HOUR, timeout=HOUR)


def _send(phone: str, code: str) -> None:
    from ..tasks import send_otp_sms

    if settings.OTP_DEBUG_ECHO:
        logger.warning("OTP for %s: %s", phone, code)
    try:
        send_otp_sms.delay(phone, code)
    except Exception:
        logger.exception("Could not queue the OTP SMS; sending synchronously")
        send_otp_sms(phone, code)


def request_code(phone: str, ip: str | None = None) -> dict:
    """Create and send a new code. Raises ``ValidationError`` (bad phone) or ``OtpThrottled``."""
    phone = clean_phone(phone)
    _check_rate_limits(phone)
    now = timezone.now()
    code = generate_code()
    with transaction.atomic():
        # Older codes stop working as soon as a new one is issued.
        OtpCode.objects.filter(phone=phone, consumed_at__isnull=True, expires_at__gt=now).update(
            expires_at=now
        )
        OtpCode.objects.create(
            phone=phone,
            code_hash=hash_code(phone, code),
            expires_at=now + timedelta(seconds=settings.OTP_TTL_SECONDS),
            ip=ip or None,
        )
    _record_request(phone)
    _send(phone, code)
    return {
        "phone": phone,
        "expires_in": settings.OTP_TTL_SECONDS,
        "resend_in": settings.OTP_RESEND_SECONDS,
        "length": settings.OTP_LENGTH,
    }


def verify_code(phone: str, code: str) -> tuple[User, bool]:
    """Check ``code`` for ``phone``; returns ``(user, is_new)``. Raises ``OtpError``.

    A wrong try is recorded even though an error is raised (the counter is saved before raising).
    """
    try:
        phone = clean_phone(phone)
    except ValidationError as exc:
        raise OtpError(exc.messages[0], field="phone") from exc
    code = clean_code(code)
    now = timezone.now()
    error: str | None = None
    with transaction.atomic():
        otp = (
            OtpCode.objects.select_for_update()
            .filter(phone=phone, consumed_at__isnull=True)
            .order_by("-created_at", "-pk")
            .first()
        )
        if otp is None:
            error = MSG_NO_CODE
        elif otp.attempts >= settings.OTP_MAX_ATTEMPTS:
            error = MSG_BURNED
        elif otp.expires_at <= now:
            error = MSG_EXPIRED
        elif not (
            len(code) == settings.OTP_LENGTH
            and hmac.compare_digest(otp.code_hash, hash_code(phone, code))
        ):
            otp.attempts += 1
            otp.save(update_fields=["attempts"])
            error = MSG_BURNED if otp.attempts >= settings.OTP_MAX_ATTEMPTS else MSG_WRONG
        else:
            user = User.objects.filter(phone=phone).first()
            if user is not None and not user.is_active:
                error = MSG_INACTIVE
            else:
                otp.consumed_at = now
                otp.save(update_fields=["consumed_at"])
                is_new = user is None
                if is_new:
                    user = User.objects.create_user(phone)
    if error:
        raise OtpError(error, field="detail" if error == MSG_INACTIVE else "code")
    return user, is_new
