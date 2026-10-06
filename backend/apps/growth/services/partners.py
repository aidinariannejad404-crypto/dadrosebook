"""Partner codes report (research item و۵).

``partner_report(start=None, end=None)`` → one row per partner: paid orders that used any of the
partner's codes, gross revenue (``Order.total``), net revenue (minus refunds), discount given and
distinct customers. Only paid orders count (``paid_at`` set, not cancelled); the window filters on
``paid_at``.
"""

from django.db.models import Count, Q, Sum

from ..models import Partner


def paid_orders_filter(prefix: str = "", start=None, end=None) -> Q:
    from apps.orders.models import Order

    q = Q(**{f"{prefix}paid_at__isnull": False}) & ~Q(
        **{f"{prefix}status__in": [Order.Status.CANCELLED, Order.Status.FAILED]}
    )
    if start is not None:
        q &= Q(**{f"{prefix}paid_at__gte": start})
    if end is not None:
        q &= Q(**{f"{prefix}paid_at__lt": end})
    return q


def partner_orders(partner, start=None, end=None):
    from apps.orders.models import Order

    return Order.objects.filter(
        paid_orders_filter(start=start, end=end), discount_code__partner_link__partner=partner
    )


def partner_report(start=None, end=None) -> list[dict]:
    rows = []
    for partner in Partner.objects.order_by("name", "id"):
        agg = partner_orders(partner, start, end).aggregate(
            orders=Count("id"),
            revenue=Sum("total"),
            refunded=Sum("refunded_total"),
            discount=Sum("discount_total"),
            customers=Count("user", distinct=True),
        )
        revenue = agg["revenue"] or 0
        refunded = agg["refunded"] or 0
        rows.append(
            {
                "partner": partner,
                "codes": list(partner.codes.values_list("discount_code__code", flat=True)),
                "orders": agg["orders"],
                "customers": agg["customers"],
                "revenue": revenue,
                "net_revenue": max(revenue - refunded, 0),
                "discount": agg["discount"] or 0,
            }
        )
    rows.sort(key=lambda r: (-r["net_revenue"], r["partner"].name))
    return rows
