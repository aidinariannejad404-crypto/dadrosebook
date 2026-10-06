"""Shipping methods and their prices. All amounts are integer toman.

* ``free_over`` on the method wins; ``None`` falls back to ``StoreSettings.free_shipping_threshold``
  (only when it is > 0); ``0`` means the method is always free.
* ``tehran_only`` methods (e.g. the courier) are offered only for the province «تهران».
"""

from apps.core.services.store_settings import get_store_settings

from ..models import TEHRAN_PROVINCE, ShippingMethod

_UNSET = object()


def store_threshold() -> int | None:
    threshold = get_store_settings().free_shipping_threshold
    return threshold if threshold > 0 else None


def free_over_for(method: ShippingMethod, *, default_threshold=_UNSET) -> int | None:
    """The subtotal from which ``method`` is free (``None`` = never free)."""
    if method.free_over is not None:
        return method.free_over
    if default_threshold is _UNSET:
        default_threshold = store_threshold()
    return default_threshold


def price_for(method: ShippingMethod, subtotal: int, *, default_threshold=_UNSET) -> int:
    free_over = free_over_for(method, default_threshold=default_threshold)
    if free_over is not None and subtotal >= free_over:
        return 0
    return method.base_price


def is_allowed(method: ShippingMethod, province: str | None) -> bool:
    return method.is_active and (not method.tehran_only or province == TEHRAN_PROVINCE)


def methods_for(province: str | None):
    qs = ShippingMethod.objects.filter(is_active=True)
    if province != TEHRAN_PROVINCE:
        qs = qs.filter(tehran_only=False)
    return qs.order_by("order", "id")


def option_for(
    method: ShippingMethod,
    subtotal: int,
    *,
    default_threshold=_UNSET,
    holidays=None,
    exam_event=None,
    now=None,
) -> dict:
    """The ``ShippingOption`` shape of the API contract.

    د۲: ``delivery_estimate`` (``None`` when the method has no business-day range) and
    ``exam_clash`` (``None`` unless ``exam_event`` is given and the parcel may arrive too late).
    """
    from . import delivery

    if default_threshold is _UNSET:
        default_threshold = store_threshold()
    free_over = free_over_for(method, default_threshold=default_threshold)
    price = price_for(method, subtotal, default_threshold=default_threshold)
    estimate = delivery.estimate_for(method, now=now, holidays=holidays)
    return {
        "id": method.pk,
        "code": method.code,
        "name": method.name,
        "description": method.description,
        "eta_note": method.eta_note,
        "price": price,
        "base_price": method.base_price,
        "is_free": price == 0,
        "free_over": free_over,
        "tehran_only": method.tehran_only,
        "delivery_estimate": estimate.as_dict() if estimate else None,
        "exam_clash": delivery.clash_info(estimate, exam_event),
    }


def options_for(province: str | None, subtotal: int, *, exam_slug: str | None = None) -> list[dict]:
    from . import delivery

    threshold = store_threshold()
    now = delivery.local_now()
    holidays = delivery.holidays_from(now.date())
    event = delivery.exam_event_for(exam_slug, today=now.date())
    return [
        option_for(
            m,
            subtotal,
            default_threshold=threshold,
            holidays=holidays,
            exam_event=event,
            now=now,
        )
        for m in methods_for(province)
    ]


def free_shipping_remaining(
    subtotal: int, method: ShippingMethod | None = None, *, province: str | None = None
) -> int | None:
    """Toman left until shipping is free; ``None`` when there is no free-shipping rule.

    With a chosen ``method`` its own rule applies; otherwise the lowest threshold among the
    methods offered for ``province``.
    """
    threshold = store_threshold()
    if method is not None:
        candidates = [free_over_for(method, default_threshold=threshold)]
    else:
        candidates = [free_over_for(m, default_threshold=threshold) for m in methods_for(province)]
        if not candidates:
            candidates = [threshold]
    known = [c for c in candidates if c is not None]
    if not known:
        return None
    return max(0, min(known) - subtotal)
