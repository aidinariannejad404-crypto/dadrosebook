import datetime as dt

import pytest
from django.utils import timezone

from apps.backoffice.services import metrics
from apps.engagement.models import BackInStockRequest
from apps.orders.models import Order


@pytest.fixture
def week():
    return metrics.window_for_days(7)


def test_window_helpers():
    today = timezone.localdate()
    w = metrics.window_for_days(7, today=today)
    assert w.days == 7
    assert w.previous().end == w.start
    assert metrics.window_for_dates(today, today).days == 1


def test_percent_and_change():
    assert metrics.percent(1, 4) == 25
    assert metrics.percent(1, 0) is None
    assert metrics.change_percent(150, 100) == 50
    assert metrics.change_percent(5, 0) is None


def test_sales_summary_counts_paid_not_cancelled(db, user, books, buy, week):
    o1 = buy(user, books["civil_print"])
    buy(user, books["civil_bundle"], books["commerce_ebook"])
    Order.objects.create(user=user, total=999)  # unpaid: ignored
    s = metrics.sales_summary(week)
    assert s["orders"] == 2
    assert s["units"] == 3
    assert s["aov"] == s["revenue"] // 2
    assert s["customers"] == 1
    Order.objects.filter(pk=o1.pk).update(status=Order.Status.CANCELLED)
    assert metrics.sales_summary(week)["orders"] == 1


def test_sales_outside_window_ignored(db, user, books, buy, week):
    o = buy(user, books["civil_print"])
    Order.objects.filter(pk=o.pk).update(paid_at=timezone.now() - dt.timedelta(days=30))
    assert metrics.sales_summary(week)["orders"] == 0
    assert metrics.sales_summary(week.previous())["orders"] == 0
    assert metrics.sales_summary(metrics.window_for_days(31))["orders"] == 1


def test_formats_bundle_adoption_and_top_books(db, user, books, buy, week):
    buy(user, books["civil_print"])
    buy(user, books["civil_bundle"])
    buy(user, books["civil_bundle"], books["commerce_ebook"])
    by_type = {f["type"]: f for f in metrics.sales_by_format(week)}
    assert by_type["BUNDLE"]["units"] == 2
    assert by_type["EBOOK"]["units"] == 1
    assert sum(f["share"] for f in by_type.values()) in (99, 100, 101)
    adoption = metrics.bundle_adoption(week)
    assert adoption == {"bundle": 2, "print": 1, "rate": 67}
    top = metrics.top_books(week)
    assert top[0]["book_id"] == books["civil_book"].pk


def test_repeat_purchase_and_first_time(db, user, other_user, books, buy, week):
    buy(user, books["civil_print"])
    buy(user, books["commerce_ebook"], ship=False)
    buy(other_user, books["commerce_ebook"], ship=False)
    assert metrics.repeat_purchase(week) == {"customers": 2, "repeat": 1, "rate": 50}
    assert metrics.first_time_customers(week) == 2


def test_daily_revenue_zero_filled(db, user, books, buy, week):
    o = buy(user, books["civil_print"])
    rows = metrics.daily_revenue(week)
    assert len(rows) == 7
    assert rows[-1]["revenue"] == o.total
    assert all(r["revenue"] == 0 for r in rows[:-1])


def test_notify_me_recovery(db, books, week):
    now = timezone.now()
    v = books["civil_print"]
    BackInStockRequest.objects.create(
        variant=v, phone="09121111111", status="NOTIFIED", notified_at=now, converted_at=now
    )
    BackInStockRequest.objects.create(
        variant=v, phone="09122222222", status="NOTIFIED", notified_at=now
    )
    BackInStockRequest.objects.create(variant=v, phone="09123333333")
    r = metrics.notify_me_recovery(week)
    assert r == {"notified": 2, "converted": 1, "rate": 50, "waiting": 1}


def test_discount_codes_and_low_stock(db, books):
    v = books["commerce_print"]  # stock 3
    low = list(metrics.low_stock_variants(3))
    assert v in low
    assert books["civil_print"] not in low  # stock 12
    assert all(x.type != "EBOOK" for x in low)
