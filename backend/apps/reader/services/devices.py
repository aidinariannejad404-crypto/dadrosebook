"""Reading-device limit.

The reader sends ``X-Reader-Device`` (a random id kept in the browser). A user may read on at most
``READER_MAX_DEVICES`` devices seen in the last ``READER_DEVICE_WINDOW_DAYS`` days; the user
removes an old device to add a new one. Only a hash of the id is stored.
"""

import datetime as dt
import hashlib
import re

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from ..models import ReaderDevice
from .access import ReaderError

DEVICE_ID_RE = re.compile(r"^[A-Za-z0-9-]{8,64}$")
TOUCH_EVERY = dt.timedelta(minutes=5)


class DeviceLimit(ReaderError):
    status = 409
    code = "device_limit"
    message = "به سقف دستگاه‌های مطالعه رسیده‌اید. یکی از دستگاه‌های قبلی را حذف کنید."

    def __init__(self, devices=()):
        super().__init__(self.message)
        self.devices = list(devices)


def max_devices() -> int:
    return int(getattr(settings, "READER_MAX_DEVICES", 3))


def window() -> dt.timedelta:
    return dt.timedelta(days=int(getattr(settings, "READER_DEVICE_WINDOW_DAYS", 90)))


def device_key(raw: str | None) -> str:
    raw = (raw or "").strip()
    if not DEVICE_ID_RE.match(raw):
        raw = "unknown"
    return hashlib.sha256(raw.encode()).hexdigest()


def device_label(user_agent: str) -> str:
    ua = user_agent or ""
    browser = next(
        (
            name
            for token, name in (
                ("SamsungBrowser", "Samsung Internet"),
                ("Edg/", "Edge"),
                ("OPR/", "Opera"),
                ("Firefox/", "Firefox"),
                ("CriOS", "Chrome"),
                ("Chrome/", "Chrome"),
                ("Safari/", "Safari"),
            )
            if token in ua
        ),
        "مرورگر",
    )
    system = next(
        (
            name
            for token, name in (
                ("Android", "Android"),
                ("iPhone", "iPhone"),
                ("iPad", "iPad"),
                ("Windows", "Windows"),
                ("Mac OS X", "macOS"),
                ("Linux", "Linux"),
            )
            if token in ua
        ),
        "",
    )
    return f"{browser} · {system}" if system else browser


def active_devices(user):
    since = timezone.now() - window()
    return ReaderDevice.objects.filter(user=user, revoked_at__isnull=True, last_seen__gte=since)


def register(user, raw_id: str | None, user_agent: str = "") -> ReaderDevice:
    """Return the device for this request, adding it if the user is under the limit."""
    key = device_key(raw_id)
    now = timezone.now()
    device = ReaderDevice.objects.filter(user=user, key=key).first()
    active = device is not None and device.revoked_at is None and device.last_seen >= now - window()
    if active:
        if now - device.last_seen >= TOUCH_EVERY:
            ReaderDevice.objects.filter(pk=device.pk).update(last_seen=now)
            device.last_seen = now
        return device
    if not user.is_staff:
        others = active_devices(user)
        if others.count() >= max_devices():
            raise DeviceLimit(others)
    label = device_label(user_agent)[:100]
    if device is not None:
        device.revoked_at = None
        device.last_seen = now
        device.label = label
        device.save(update_fields=["revoked_at", "last_seen", "label"])
        return device
    try:
        with transaction.atomic():
            return ReaderDevice.objects.create(user=user, key=key, label=label, last_seen=now)
    except IntegrityError:  # the same device raced us
        return ReaderDevice.objects.get(user=user, key=key)


def remove(user, device_id: int) -> bool:
    return bool(
        ReaderDevice.objects.filter(user=user, pk=device_id, revoked_at__isnull=True).update(
            revoked_at=timezone.now()
        )
    )
