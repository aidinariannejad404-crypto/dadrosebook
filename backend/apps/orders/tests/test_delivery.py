"""د۲ delivery date promise: cutoff, Friday, holidays, exam clash, API."""

import datetime as dt
import uuid
from unittest import mock
from zoneinfo import ZoneInfo

import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.catalog.models import ExamEvent, ExamType
from apps.orders.models import ShippingHoliday, ShippingMethod
from apps.orders.services import checkout, delivery, state

TEHRAN = ZoneInfo("Asia/Tehran")
D = dt.date


def at(day: int, hour: int, minute: int = 0, month: int = 10) -> dt.datetime:
    """A Tehran wall-clock time in October 2026 (5 Oct = Monday, 9 Oct = Friday)."""
    return dt.datetime(2026, month, day, hour, minute, tzinfo=TEHRAN)


def method(low=3, high=5, cutoff=14, **kw) -> ShippingMethod:
    return ShippingMethod(
        name="پست",
        code="x",
        min_business_days=low,
        max_business_days=high,
        cutoff_hour=cutoff,
        **kw,
    )


# --- calendar -------------------------------------------------------------------------------


def test_friday_is_not_a_business_day():
    assert delivery.is_business_day(D(2026, 10, 8))  # Thursday
    assert not delivery.is_business_day(D(2026, 10, 9))  # Friday
    assert delivery.is_business_day(D(2026, 10, 10))  # Saturday
    assert not delivery.is_business_day(D(2026, 10, 10), {D(2026, 10, 10)})


def test_add_business_days_skips_friday_and_holidays():
    assert delivery.add_business_days(D(2026, 10, 8), 0) == D(2026, 10, 8)
    assert delivery.add_business_days(D(2026, 10, 8), 1) == D(2026, 10, 10)
    assert delivery.add_business_days(D(2026, 10, 8), 1, {D(2026, 10, 10)}) == D(2026, 10, 11)


def test_labels_are_jalali_with_weekday():
    assert delivery.day_label(D(2026, 10, 10)) == "شنبه ۱۸ مهر"
    assert delivery.range_label(D(2026, 10, 10), D(2026, 10, 12)) == "شنبه ۱۸ مهر تا دوشنبه ۲۰ مهر"
    assert delivery.range_label(D(2026, 10, 12), D(2026, 10, 12)) == "دوشنبه ۲۰ مهر"


# --- cutoff ---------------------------------------------------------------------------------


def test_before_cutoff_ships_today():
    est = delivery.estimate_for(method(), now=at(5, 10), holidays=frozenset())
    assert est.dispatch_date == D(2026, 10, 5)
    assert est.min_date == D(2026, 10, 8)  # Tue, Wed, Thu
    assert est.max_date == D(2026, 10, 11)  # Thu → Sat (Friday skipped) → Sun
    assert est.label == "پنجشنبه ۱۶ مهر تا یکشنبه ۱۹ مهر"


def test_at_or_after_cutoff_ships_next_business_day():
    for now in (at(5, 14), at(5, 23, 59)):
        est = delivery.estimate_for(method(), now=now, holidays=frozenset())
        assert est.dispatch_date == D(2026, 10, 6)
        assert est.min_date == D(2026, 10, 10)  # Wed, Thu, (Fri) Sat
        assert est.max_date == D(2026, 10, 12)


def test_cutoff_uses_tehran_wall_clock_for_utc_times():
    utc = dt.UTC
    before = dt.datetime(2026, 10, 5, 10, 0, tzinfo=utc)  # 13:30 Tehran
    after = dt.datetime(2026, 10, 5, 10, 31, tzinfo=utc)  # 14:01 Tehran
    assert delivery.estimate_for(method(), now=before, holidays=frozenset()).dispatch_date == D(
        2026, 10, 5
    )
    assert delivery.estimate_for(method(), now=after, holidays=frozenset()).dispatch_date == D(
        2026, 10, 6
    )


# --- Friday ---------------------------------------------------------------------------------


def test_thursday_after_cutoff_ships_saturday():
    est = delivery.estimate_for(method(1, 2), now=at(8, 16), holidays=frozenset())
    assert est.dispatch_date == D(2026, 10, 10)
    assert (est.min_date, est.max_date) == (D(2026, 10, 11), D(2026, 10, 12))


def test_order_on_friday_morning_waits_for_saturday():
    est = delivery.estimate_for(method(0, 0), now=at(9, 9), holidays=frozenset())
    assert est.dispatch_date == est.min_date == est.max_date == D(2026, 10, 10)


# --- holidays -------------------------------------------------------------------------------


def test_holiday_on_dispatch_day_and_inside_the_window():
    holidays = frozenset({D(2026, 10, 10), D(2026, 10, 12)})
    est = delivery.estimate_for(method(1, 2), now=at(8, 16), holidays=holidays)
    assert est.dispatch_date == D(2026, 10, 11)  # Fri off, Sat holiday
    assert est.min_date == D(2026, 10, 13)  # Mon holiday skipped
    assert est.max_date == D(2026, 10, 14)


def test_holidays_are_read_from_the_admin_table(db):
    ShippingHoliday.objects.create(date=D(2026, 10, 6), title="تعطیل رسمی")
    est = delivery.estimate_for(method(0, 1), now=at(5, 15))
    assert est.dispatch_date == D(2026, 10, 7)


def test_holiday_today_before_cutoff_still_waits():
    est = delivery.estimate_for(method(0, 0), now=at(5, 9), holidays=frozenset({D(2026, 10, 5)}))
    assert est.dispatch_date == D(2026, 10, 6)


# --- method shapes --------------------------------------------------------------------------


def test_same_day_courier_and_single_day_window():
    courier = method(0, 1, cutoff=12)
    est = delivery.estimate_for(courier, now=at(5, 11), holidays=frozenset())
    assert (est.min_date, est.max_date) == (D(2026, 10, 5), D(2026, 10, 6))
    single = delivery.estimate_for(method(2, None), now=at(5, 11), holidays=frozenset())
    assert single.min_date == single.max_date == D(2026, 10, 7)
    assert single.label == "چهارشنبه ۱۵ مهر"


def test_no_range_means_no_estimate():
    assert delivery.estimate_for(method(None, None), now=at(5, 10), holidays=frozenset()) is None


def test_model_validation_of_the_range():
    with pytest.raises(ValidationError):
        method(5, 3).clean()
    with pytest.raises(ValidationError):
        method(None, 3).clean()
    method(3, 3).clean()


# --- exam clash -----------------------------------------------------------------------------


def test_exam_clash_boundary():
    est = delivery.estimate_for(method(), now=at(5, 10), holidays=frozenset())  # max 11 Oct
    assert delivery.clashes_with_exam(est, D(2026, 10, 18)) is False  # safe until 11 Oct
    assert delivery.clashes_with_exam(est, D(2026, 10, 17)) is True  # safe until 10 Oct
    assert delivery.clashes_with_exam(est, None) is False
    assert delivery.clashes_with_exam(None, D(2026, 10, 17)) is False


@pytest.fixture
def exam(db):
    kanoon = ExamType.objects.create(name="کانون وکلا", slug="kanoon", short_name="کانون")
    ExamEvent.objects.create(name="آزمون کانون ۱۴۰۵", exam_type=kanoon, date=D(2026, 10, 15))
    return kanoon


@pytest.fixture
def frozen(monkeypatch):
    now = at(5, 10)
    monkeypatch.setattr(timezone, "now", lambda: now)
    return now


def test_summary_without_province_ignores_tehran_only_methods(db, exam, frozen):
    body = delivery.delivery_summary(exam_slug="kanoon")
    codes = [m["code"] for m in body["methods"]]
    assert codes == ["post"]
    assert body["estimate"]["label"] == "پنجشنبه ۱۶ مهر تا یکشنبه ۱۹ مهر"
    assert body["exam"]["days_left"] == 10
    assert body["exam"]["safe_until"] == "2026-10-08"
    clash = body["exam_clash"]
    assert clash["exam_name"] == "آزمون کانون ۱۴۰۵"
    assert "نسخه الکترونیک" in clash["message"]


def test_summary_tehran_spans_courier_and_post(db, frozen):
    body = delivery.delivery_summary(province="تهران")
    assert [m["code"] for m in body["methods"]] == ["post", "courier"]
    assert body["estimate"]["min_date"] == "2026-10-05"  # courier, before its 12:00 cutoff
    assert body["estimate"]["max_date"] == "2026-10-11"  # post
    assert body["exam"] is None and body["exam_clash"] is None


def test_api_delivery_estimate_reads_exam_param_and_cookie(api, exam, frozen):
    res = api.get("/api/v1/delivery-estimate/?exam=kanoon")
    assert res.status_code == 200
    assert res.json()["exam_clash"] is not None
    assert "private" in res["Cache-Control"]
    api.cookies["exam"] = "kanoon"
    assert api.get("/api/v1/delivery-estimate/").json()["exam"]["slug"] == "kanoon"
    api.cookies["exam"] = "nope"
    assert api.get("/api/v1/delivery-estimate/").json()["exam"] is None


def test_api_shipping_methods_carry_estimate_and_clash(api, exam, frozen):
    rows = api.get("/api/v1/shipping-methods/?province=تهران&exam=kanoon").json()
    by_code = {r["code"]: r for r in rows}
    assert by_code["courier"]["delivery_estimate"]["label"] == "دوشنبه ۱۳ مهر تا سه‌شنبه ۱۴ مهر"
    assert by_code["courier"]["exam_clash"] is None
    assert by_code["post"]["exam_clash"]["safe_until"] == "2026-10-08"


def test_order_detail_has_delivery_estimate(auth_api, user, books, methods, address, frozen):
    order = checkout.create_order(
        user,
        {
            "items": [{"variant_id": books["civil_print"].pk}],
            "address_id": address.pk,
            "shipping_method_id": methods["post"].pk,
        },
        uuid.uuid4(),
    )
    data = auth_api.get(f"/api/v1/orders/{order.number}/").json()
    assert data["delivery_estimate"] is None  # unpaid: no promise yet
    with mock.patch("apps.accounts.tasks.send_sms.delay"):
        state.mark_paid(order)
    data = auth_api.get(f"/api/v1/orders/{order.number}/").json()
    assert data["delivery_estimate"]["min_date"] == "2026-10-08"


def test_order_estimate_none_for_ebook_only_and_delivered(user, books, frozen):
    order = checkout.create_order(
        user, {"items": [{"variant_id": books["civil_ebook"].pk}]}, uuid.uuid4()
    )
    assert delivery.order_estimate(order) is None
