"""Redirect lookup, hit counting, 404 tracking and the cached redirect map."""

import hashlib
import json

from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone

from ..models import NotFoundHit, Redirect
from .keys import clean_path, decode_path, redirect_key, strip_query

MAP_CACHE_KEY = "seo:redirect-map"
MAP_CACHE_SECONDS = 300
MAX_PATH_LENGTH = 500
# Never tracked as 404s: framework assets, the API, media and the admin.
NOT_FOUND_IGNORED_PREFIXES = ("/_next", "/api", "/static", "/media", "/admin")

ERR_SAME = "نشانی جدید نباید با نشانی قدیمی یکی باشد."
ERR_TARGET = "نشانی جدید باید با / شروع شود یا یک نشانی کامل https:// باشد."
ERR_OLD = "نشانی قدیمی باید یک مسیر باشد که با / شروع می‌شود."
ERR_CHAIN = "نشانی جدید خودش به «{other}» ریدایرکت می‌شود؛ مستقیم مقصد نهایی را وارد کنید."
ERR_CHAINED_FROM = (
    "ریدایرکت فعال «{other}» به همین نشانی قدیمی اشاره می‌کند؛ "
    "اول مقصد آن را به مقصد نهایی تغییر دهید."
)
ERR_DUPLICATE = "برای این نشانی قدیمی قبلاً ریدایرکت ثبت شده است: {other}"


def is_internal(target: str) -> bool:
    return target.startswith("/") and not target.startswith("//")


def validate_redirect(
    old_path: str, new_path: str, *, is_active: bool = True, exclude_pk: int | None = None
) -> None:
    """Raise ``ValidationError`` for invalid targets, self-redirects, duplicates and chains."""
    errors: dict[str, list[str]] = {}
    old_key = redirect_key(old_path)
    if not old_path.startswith("/"):
        errors.setdefault("old_path", []).append(ERR_OLD)
    if not (is_internal(new_path) or new_path.startswith("https://")):
        errors.setdefault("new_path", []).append(ERR_TARGET)
    elif is_internal(new_path) and redirect_key(new_path) == old_key:
        errors.setdefault("new_path", []).append(ERR_SAME)

    others = Redirect.objects.exclude(pk=exclude_pk) if exclude_pk else Redirect.objects.all()
    duplicate = others.filter(old_path_key=old_key).first()
    if duplicate:
        errors.setdefault("old_path", []).append(ERR_DUPLICATE.format(other=duplicate))

    if is_active and not errors.get("new_path") and is_internal(new_path):
        chained = others.filter(is_active=True, old_path_key=redirect_key(new_path)).first()
        if chained:
            errors.setdefault("new_path", []).append(ERR_CHAIN.format(other=chained.new_path))
    if is_active and not errors.get("old_path"):
        pointing_here = [
            r
            for r in others.filter(is_active=True, new_path__startswith="/").only(
                "old_path", "new_path"
            )
            if redirect_key(r.new_path) == old_key
        ]
        if pointing_here:
            errors.setdefault("old_path", []).append(
                ERR_CHAINED_FROM.format(other=pointing_here[0].old_path)
            )
    if errors:
        raise ValidationError(errors)


# --- redirect map ---------------------------------------------------------------------------


def build_redirect_map() -> dict:
    rows = Redirect.objects.filter(is_active=True).order_by("old_path_key")
    redirects = {
        key: [target, status]
        for key, target, status in rows.values_list("old_path_key", "new_path", "status_code")
    }
    payload = json.dumps(redirects, ensure_ascii=False, sort_keys=True).encode()
    version = hashlib.sha256(payload).hexdigest()[:16]
    return {"version": version, "redirects": redirects}


def redirect_map() -> dict:
    """``{"version", "redirects": {old_path_key: [new_path, status]}}``, cached 300 s."""
    data = cache.get(MAP_CACHE_KEY)
    if data is None:
        data = build_redirect_map()
        cache.set(MAP_CACHE_KEY, data, MAP_CACHE_SECONDS)
    return data


def invalidate_redirect_map() -> None:
    cache.delete(MAP_CACHE_KEY)


def resolve(path: str) -> tuple[str, int] | None:
    """``(new_path, status)`` for a request path, or ``None``."""
    hit = redirect_map()["redirects"].get(redirect_key(path))
    return (hit[0], hit[1]) if hit else None


# --- beacons --------------------------------------------------------------------------------


def record_hit(path: str) -> bool:
    """Count a redirect that the frontend just served. Unknown paths are a no-op."""
    updated = Redirect.objects.filter(old_path_key=redirect_key(path), is_active=True).update(
        hit_count=F("hit_count") + 1, last_hit_at=timezone.now()
    )
    return bool(updated)


def is_ignored_not_found(path: str) -> bool:
    key = redirect_key(path)
    return any(key == p or key.startswith(p + "/") for p in NOT_FOUND_IGNORED_PREFIXES)


def record_not_found(path: str, referer: str = "") -> NotFoundHit | None:
    """Upsert a 404 report (``hits += 1``). Asset/API/admin paths and long paths are ignored."""
    raw = (path or "").strip()
    if not raw.startswith("/") or len(raw) > MAX_PATH_LENGTH:
        return None
    decoded = decode_path(strip_query(raw))
    if len(decoded) > MAX_PATH_LENGTH or is_ignored_not_found(decoded):
        return None
    key = redirect_key(decoded)
    referer = (referer or "")[:MAX_PATH_LENGTH]
    now = timezone.now()
    fields = {"hits": F("hits") + 1, "last_seen": now}
    if referer:
        fields["last_referer"] = referer
    if not NotFoundHit.objects.filter(path_key=key).update(**fields):
        try:
            with transaction.atomic():
                NotFoundHit.objects.create(path=decoded, path_key=key, hits=1, last_referer=referer)
        except IntegrityError:  # created by a concurrent request
            NotFoundHit.objects.filter(path_key=key).update(**fields)
    return NotFoundHit.objects.filter(path_key=key).first()


def mark_not_found_resolved(old_path: str) -> int:
    """A redirect now covers this path: hide it from the open 404 list."""
    return NotFoundHit.objects.filter(path_key=redirect_key(clean_path(old_path))).update(
        resolved=True
    )
