import datetime as dt
import uuid

from django.utils import timezone

from apps.growth.models import Partner, PartnerCode
from apps.growth.services.partners import partner_report
from apps.orders.models import DiscountCode, Order
from apps.orders.services import checkout, state


def paid_order(user, books, code: str):
    order = checkout.create_order(
        user,
        {"items": [{"variant_id": books["civil_ebook"].pk}], "discount_code": code},
        uuid.uuid4(),
    )
    state.mark_paid(order)
    return order


def test_partner_report(user, other_user, books, client):
    assoc = Partner.objects.create(name="انجمن حقوق دانشگاه تهران", kind="STUDENT_ASSOCIATION")
    inst = Partner.objects.create(name="مؤسسه ب", kind="INSTITUTE")
    Partner.objects.create(name="بی‌کد", kind="ACADEMY")
    a1 = DiscountCode.objects.create(code="UT10", kind="PERCENT", value=10, per_user_limit=None)
    a2 = DiscountCode.objects.create(code="UT20", kind="PERCENT", value=20, per_user_limit=None)
    b1 = DiscountCode.objects.create(code="INST", kind="FIXED", value=90_000, per_user_limit=None)
    DiscountCode.objects.create(code="NOPARTNER", kind="FIXED", value=1_000)
    PartnerCode.objects.create(partner=assoc, discount_code=a1)
    PartnerCode.objects.create(partner=assoc, discount_code=a2)
    PartnerCode.objects.create(partner=inst, discount_code=b1)

    o1 = paid_order(user, books, "UT10")  # 990,000 - 99,000 = 891,000
    paid_order(other_user, books, "UT20")  # 990,000 - 198,000 = 792,000
    paid_order(user, books, "INST")  # 900,000
    paid_order(user, books, "NOPARTNER")
    unpaid = checkout.create_order(
        user,
        {"items": [{"variant_id": books["civil_ebook"].pk}], "discount_code": "UT10"},
        uuid.uuid4(),
    )
    assert unpaid.status == Order.Status.PENDING_PAYMENT
    Order.objects.filter(pk=o1.pk).update(refunded_total=91_000)

    rows = {r["partner"].name: r for r in partner_report()}
    a = rows["انجمن حقوق دانشگاه تهران"]
    assert (a["orders"], a["customers"]) == (2, 2)
    assert a["revenue"] == 891_000 + 792_000
    assert a["net_revenue"] == 891_000 + 792_000 - 91_000
    assert a["discount"] == 99_000 + 198_000
    assert sorted(a["codes"]) == ["UT10", "UT20"]
    assert rows["مؤسسه ب"]["revenue"] == 900_000
    assert rows["بی‌کد"]["orders"] == 0

    # window on paid_at
    Order.objects.filter(pk=o1.pk).update(paid_at=timezone.now() - dt.timedelta(days=60))
    recent = {
        r["partner"].name: r for r in partner_report(start=timezone.now() - dt.timedelta(days=30))
    }
    assert recent["انجمن حقوق دانشگاه تهران"]["orders"] == 1

    from apps.accounts.models import User

    client.force_login(User.objects.create_superuser("09120000000", "pass"))
    res = client.get("/admin/growth/partner/?period=30")
    assert res.status_code == 200
    assert "UT10" in res.content.decode()
