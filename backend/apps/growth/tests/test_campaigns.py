import datetime as dt
import uuid

import pytest
from django.utils import timezone

from apps.growth.models import Campaign
from apps.growth.services import campaigns
from apps.orders.models import DiscountCode, DiscountRedemption
from apps.orders.services import checkout, quote, state


def make_campaign(code=None, *, start=-1, end=1, **kw):
    now = timezone.now()
    return Campaign.objects.create(
        title=kw.pop("title", "۴۵ روز آخر"),
        starts_at=now + dt.timedelta(days=start),
        ends_at=now + dt.timedelta(days=end),
        discount_code=code,
        **kw,
    )


@pytest.fixture
def code(db):
    return DiscountCode.objects.create(
        code="CAMP-X7Q", kind=DiscountCode.Kind.PERCENT, value=10, per_user_limit=None
    )


def lines_for(books, *names):
    return [{"variant_id": books[n].pk, "quantity": 1} for n in names]


def test_slug_and_state(code):
    c = make_campaign(code)
    assert c.slug == "45-روز-آخر"
    now = timezone.now()
    assert campaigns.campaign_state(c, now) == campaigns.ACTIVE
    assert campaigns.campaign_state(c, now - dt.timedelta(days=2)) == campaigns.UPCOMING
    assert campaigns.campaign_state(c, now + dt.timedelta(days=2)) == campaigns.ENDED


def test_auto_apply_only_inside_window(books, code):
    make_campaign(code, start=1, end=3)  # upcoming
    q = quote.build_quote(lines_for(books, "commerce_ebook"))
    assert q["discount"] is None
    Campaign.objects.update(starts_at=timezone.now() - dt.timedelta(hours=1))
    q = quote.build_quote(lines_for(books, "commerce_ebook"))
    assert q["discount"]["amount"] == 50_000  # 10% of 500,000
    assert q["discount"]["campaign"]["slug"] == "45-روز-آخر"
    assert q["total"] == 450_000
    Campaign.objects.update(ends_at=timezone.now() - dt.timedelta(minutes=1))
    assert quote.build_quote(lines_for(books, "commerce_ebook"))["discount"] is None


def test_scope_by_books_and_subjects(books, code):
    c = make_campaign(code)
    c.books.set([books["commerce_book"]])
    q = quote.build_quote(lines_for(books, "civil_ebook", "commerce_ebook"))
    assert q["discount"]["amount"] == 50_000  # only the commerce book counts
    c.books.clear()
    c.subjects.set([books["civil"]])
    q = quote.build_quote(lines_for(books, "commerce_ebook"))
    assert q["discount"] is None  # commerce book is not in «حقوق مدنی»
    q = quote.build_quote(lines_for(books, "civil_ebook"))
    assert q["discount"]["amount"] == 99_000


def test_inactive_campaign_or_code(books, code):
    c = make_campaign(code, is_active=False)
    assert quote.build_quote(lines_for(books, "civil_ebook"))["discount"] is None
    c.is_active = True
    c.save()
    code.is_active = False
    code.save()
    assert quote.build_quote(lines_for(books, "civil_ebook"))["discount"] is None


def test_best_of_entered_code_and_campaign(books, code):
    make_campaign(code)
    DiscountCode.objects.create(code="BIG", kind=DiscountCode.Kind.FIXED, value=200_000)
    DiscountCode.objects.create(code="SMALL", kind=DiscountCode.Kind.FIXED, value=1_000)
    q = quote.build_quote(lines_for(books, "civil_ebook"), discount_code="big")
    assert q["discount"]["code"] == "BIG" and "campaign" not in q["discount"]
    q = quote.build_quote(lines_for(books, "civil_ebook"), discount_code="small")
    assert q["discount"]["campaign"] is not None and q["discount"]["amount"] == 99_000
    assert q["discount_error"] is None


def test_campaign_code_cannot_be_typed(books, code):
    c = make_campaign(code)
    c.books.set([books["commerce_book"]])
    q = quote.build_quote(lines_for(books, "civil_ebook"), discount_code="camp-x7q")
    assert q["discount"] is None
    assert q["discount_error"] == "کد تخفیف معتبر نیست."


def test_order_records_campaign_code(user, books, code):
    make_campaign(code)
    order = checkout.create_order(user, {"items": lines_for(books, "civil_ebook")}, uuid.uuid4())
    assert order.discount_code == code and order.discount_total == 99_000
    state.mark_paid(order)
    assert DiscountRedemption.objects.get(order=order).amount == 99_000


def test_per_user_limit_respected(user, books, code):
    code.per_user_limit = 1
    code.save()
    make_campaign(code)
    order = checkout.create_order(user, {"items": lines_for(books, "civil_ebook")}, uuid.uuid4())
    state.mark_paid(order)
    q = quote.build_quote(lines_for(books, "commerce_ebook"), user=user)
    assert q["discount"] is None


def test_api_list_and_detail(api, books, code):
    c = make_campaign(code, subtitle="تا روز آزمون")
    c.books.set([books["civil_book"]])
    make_campaign(None, title="پنهان", show_on_home=False)
    make_campaign(None, title="آینده", start=2, end=4)
    home = api.get("/api/v1/growth/campaigns/?placement=home").json()
    assert [x["slug"] for x in home] == [c.slug]
    assert home[0]["discount_label"] == "۱۰٪ تخفیف" and home[0]["state"] == "active"
    assert len(api.get("/api/v1/growth/campaigns/").json()) == 2
    detail = api.get(f"/api/v1/growth/campaigns/{c.slug}/").json()
    assert [b["slug"] for b in detail["books"]] == [books["civil_book"].slug]
    assert detail["books"][0]["variants"]
    upcoming = api.get(
        f"/api/v1/growth/campaigns/{Campaign.objects.get(title='آینده').slug}/"
    ).json()
    assert upcoming["state"] == "upcoming"
    assert api.get("/api/v1/growth/campaigns/nope/").status_code == 404
