"""«پیام‌های من» (PF-2) and «تنظیمات اعلان‌ها» (PF-3).

Kinds are the SMS kinds of ``apps.core.sms_catalog`` plus a few inbox-only kinds that staff send
from the admin. Only marketing kinds can be muted; service messages (orders, refunds, back in
stock, support replies) always go out.
"""

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.core.sms_catalog import KINDS

from ..models import Notification, NotificationSettings

ANNOUNCEMENT = "announcement"
DISCOUNT_CODE = "discount_code"
#: Inbox-only kinds (no SMS template): key → (label, marketing)
INBOX_KINDS: dict[str, tuple[str, bool]] = {
    ANNOUNCEMENT: ("اطلاعیه دادرُز", False),
    DISCOUNT_CODE: ("کد تخفیف ویژه شما", True),
}

MSG_NOT_MUTABLE = "پیام‌های خدماتی (سفارش، استرداد، پشتیبانی) همیشه فرستاده می‌شوند."
MSG_UNKNOWN_KIND = "نوع اعلان ناشناخته است."


class PreferenceError(ValueError):
    pass


def kind_label(kind: str) -> str:
    if kind in KINDS:
        return KINDS[kind].label
    if kind in INBOX_KINDS:
        return INBOX_KINDS[kind][0]
    return "پیام دادرُز"


def is_marketing(kind: str | None) -> bool:
    if not kind:
        return False
    if kind in KINDS:
        return KINDS[kind].marketing
    return INBOX_KINDS.get(kind, ("", False))[1]


def all_kinds() -> list[str]:
    return [*KINDS, *INBOX_KINDS]


def muted_kinds(user) -> set[str]:
    row = NotificationSettings.objects.filter(user=user).only("muted_kinds").first()
    return set(row.muted_kinds) if row else set()


def is_muted(user, kind: str | None) -> bool:
    """A kind is muted only when it is marketing *and* the user switched it off."""
    return is_marketing(kind) and kind in muted_kinds(user)


def preferences(user) -> list[dict]:
    """Every kind with its toggle; service kinds are ``locked`` (always on)."""
    muted = muted_kinds(user)
    rows = []
    for kind in all_kinds():
        marketing = is_marketing(kind)
        rows.append(
            {
                "kind": kind,
                "label": kind_label(kind),
                "marketing": marketing,
                "enabled": not (marketing and kind in muted),
                "locked": not marketing,
            }
        )
    # marketing (switchable) first, then the always-on service messages
    return sorted(rows, key=lambda r: not r["marketing"])


def set_preferences(user, changes: dict[str, bool]) -> list[dict]:
    """Apply ``{kind: enabled}``. Raises ``PreferenceError`` for unknown or service kinds."""
    known = set(all_kinds())
    for kind, enabled in changes.items():
        if kind not in known:
            raise PreferenceError(MSG_UNKNOWN_KIND)
        if not is_marketing(kind) and not enabled:
            raise PreferenceError(MSG_NOT_MUTABLE)
    with transaction.atomic():
        row, _ = NotificationSettings.objects.select_for_update().get_or_create(user=user)
        muted = set(row.muted_kinds)
        for kind, enabled in changes.items():
            if not is_marketing(kind):
                continue
            if enabled:
                muted.discard(kind)
            else:
                muted.add(kind)
        row.muted_kinds = sorted(muted)
        row.save(update_fields=["muted_kinds", "updated_at"])
    return preferences(user)


def clean_link(link: str | None) -> str:
    """A same-site path for the inbox deep link. Absolute storefront URLs lose their origin."""
    link = (link or "").strip()
    base = getattr(settings, "SITE_URL", "").rstrip("/")
    if base and link.startswith(base):
        link = link[len(base) :] or "/"
    if not link.startswith("/") or link.startswith("//") or "\\" in link:
        return ""
    return link[:500]


def notify(
    user, kind: str, body: str, *, title: str = "", link: str = "", code: str = ""
) -> Notification | None:
    """Store a message in the user's inbox; ``None`` when the user muted this marketing kind."""
    if user is None or is_muted(user, kind):
        return None
    return Notification.objects.create(
        user=user,
        kind=kind,
        title=(title or kind_label(kind))[:200],
        body=(body or "").strip()[:2000],
        link=clean_link(link),
        discount_code=(code or "").strip()[:40],
    )


def user_notifications(user):
    return Notification.objects.filter(user=user).order_by("-created_at", "-id")


def unread_count(user) -> int:
    if user is None or not getattr(user, "is_authenticated", False):
        return 0
    return Notification.objects.filter(user=user, read_at__isnull=True).count()


def mark_read(user, ids: list[int] | None = None) -> int:
    """Mark the given (or all) unread messages as read; returns how many changed."""
    qs = Notification.objects.filter(user=user, read_at__isnull=True)
    if ids is not None:
        qs = qs.filter(pk__in=ids)
    return qs.update(read_at=timezone.now())


def personal_codes(user, *, now=None) -> list[dict]:
    """«کدهای تخفیف من»: codes sent to this user (newest first, one row per code).

    Validity comes from ``orders.DiscountCode`` when the code exists there; a code that no
    longer exists, is switched off or has expired is listed as not valid.
    """
    from apps.orders.models import DiscountCode

    now = now or timezone.now()
    rows: dict[str, dict] = {}
    for n in user_notifications(user).exclude(discount_code=""):
        key = n.discount_code.upper()
        if key not in rows:
            rows[key] = {"code": n.discount_code, "title": n.title, "received_at": n.created_at}
    if not rows:
        return []
    q = Q()
    for key in rows:
        q |= Q(code__iexact=key)
    codes = {c.code.upper(): c for c in DiscountCode.objects.filter(q)}
    out = []
    for key, row in rows.items():
        dc = codes.get(key)
        valid = bool(
            dc
            and dc.is_active
            and (dc.valid_from is None or dc.valid_from <= now)
            and (dc.valid_until is None or dc.valid_until > now)
            and (dc.max_uses is None or dc.used_count < dc.max_uses)
        )
        out.append({**row, "valid_until": dc.valid_until if dc else None, "is_valid": valid})
    return out
