"""The customer's saved shipping addresses (``apps.orders.models.Address``).

Rules: at most ``MAX_ADDRESSES`` per user; the first address is the default; marking one as
default unsets the others; deleting the default promotes the most recent remaining address.
A user always has exactly one default while they have any address.
"""

import re

from django.db import transaction

from apps.core.normalize import normalize_persian
from apps.orders.models import PROVINCES, Address

MAX_ADDRESSES = 10
POSTAL_CODE_RE = re.compile(r"^\d{10}$")

_PROVINCE_LOOKUP = {normalize_persian(p, zwnj="remove"): p for p in PROVINCES}


class AddressLimitReached(Exception):
    message = f"حداکثر {MAX_ADDRESSES} نشانی می‌توانید ذخیره کنید."


def normalize_postal_code(value: str | None) -> str:
    """Persian/Arabic digits → ASCII; spaces and dashes removed."""
    return re.sub(r"[\s\-‐‑–—_]", "", normalize_persian(value or ""))


def canonical_province(value: str | None) -> str | None:
    """The canonical spelling from ``PROVINCES`` (ي/ك and ZWNJ tolerant), or None."""
    return _PROVINCE_LOOKUP.get(normalize_persian(value or "", zwnj="remove"))


def user_addresses(user):
    return Address.objects.filter(user=user).order_by("-is_default", "-updated_at", "-pk")


def _make_default(address: Address) -> None:
    Address.objects.filter(user_id=address.user_id, is_default=True).exclude(pk=address.pk).update(
        is_default=False
    )
    if not address.is_default:
        address.is_default = True
        address.save(update_fields=["is_default", "updated_at"])


@transaction.atomic
def create_address(user, data: dict) -> Address:
    # Lock the user's rows so concurrent creates can't exceed the limit or make two defaults.
    existing = list(
        Address.objects.select_for_update().filter(user=user).values_list("pk", flat=True)
    )
    if len(existing) >= MAX_ADDRESSES:
        raise AddressLimitReached
    data = dict(data)
    wants_default = bool(data.pop("is_default", False)) or not existing
    address = Address.objects.create(user=user, is_default=False, **data)
    if wants_default:
        _make_default(address)
    return address


@transaction.atomic
def update_address(address: Address, data: dict) -> Address:
    data = dict(data)
    wants_default = data.pop("is_default", None)
    for field, value in data.items():
        setattr(address, field, value)
    if data:
        address.save()
    # Unsetting the only default is ignored: one address always stays the default.
    if wants_default:
        _make_default(address)
    return address


@transaction.atomic
def delete_address(address: Address) -> None:
    user_id, was_default = address.user_id, address.is_default
    address.delete()
    if was_default:
        nxt = Address.objects.filter(user_id=user_id).order_by("-created_at", "-pk").first()
        if nxt is not None:
            _make_default(nxt)
