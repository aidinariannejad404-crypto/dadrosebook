import datetime as dt

import pytest
from django.utils import timezone

from apps.orders.models import DiscountCode, DiscountRedemption, Order
from apps.orders.services import discounts


def line(variant, qty=1):
    return {
        "book_id": variant.book_id,
        "variant_type": variant.type,
        "line_total": variant.effective_price * qty,
    }


def code(**kw):
    defaults = {"code": "madani15", "kind": DiscountCode.Kind.PERCENT, "value": 15}
    return DiscountCode.objects.create(**{**defaults, **kw})


def test_normalize_code():
    assert discounts.normalize_code(" mad ani۱۵ ") == "MADANI15"


@pytest.mark.django_db
def test_code_saved_normalized():
    assert code(code="ab c۱").code == "ABC1"


def test_percent(books):
    obj = code()
    found, amount = discounts.validate("Madani۱۵", [line(books["civil_print"])])
    assert found == obj
    assert amount == 300_000  # 15% of 2,000,000
    assert discounts.label_for(obj) == "۱۵٪ تخفیف"


def test_percent_floor_and_cap(books):
    code(value=33, max_discount=100_000)
    _, amount = discounts.validate("MADANI15", [line(books["civil_print"])])
    assert amount == 100_000
    code(code="X", value=33)
    _, amount = discounts.validate(
        "X", [{"book_id": 1, "variant_type": "EBOOK", "line_total": 1001}]
    )
    assert amount == 330


def test_fixed_never_exceeds_items(books):
    obj = code(kind=DiscountCode.Kind.FIXED, value=50_000)
    assert discounts.label_for(obj) == "۵۰٬۰۰۰ تومان تخفیف"
    _, amount = discounts.validate("MADANI15", [line(books["commerce_ebook"])])
    assert amount == 50_000
    obj.value = 5_000_000
    obj.save()
    _, amount = discounts.validate("MADANI15", [line(books["commerce_ebook"])])
    assert amount == 500_000


@pytest.mark.django_db
def test_unknown_and_inactive():
    with pytest.raises(discounts.DiscountError, match="کد تخفیف معتبر نیست"):
        discounts.validate("NOPE", [])
    code(is_active=False)
    with pytest.raises(discounts.DiscountError, match="کد تخفیف معتبر نیست"):
        discounts.validate("MADANI15", [])


def test_dates(books):
    now = timezone.now()
    obj = code(valid_from=now + dt.timedelta(days=1))
    with pytest.raises(discounts.DiscountError, match="هنوز"):
        discounts.validate("MADANI15", [line(books["civil_print"])])
    obj.valid_from = None
    obj.valid_until = now - dt.timedelta(seconds=1)
    obj.save()
    with pytest.raises(discounts.DiscountError, match="این کد منقضی شده است"):
        discounts.validate("MADANI15", [line(books["civil_print"])])


def _redeem(obj, user):
    order = Order.objects.create(user=user, total=1)
    DiscountRedemption.objects.create(code=obj, user=user, order=order, amount=1)


def test_max_uses(books, user, other_user):
    obj = code(max_uses=1, per_user_limit=None)
    discounts.validate("MADANI15", [line(books["civil_print"])])
    _redeem(obj, other_user)
    with pytest.raises(discounts.DiscountError, match="ظرفیت"):
        discounts.validate("MADANI15", [line(books["civil_print"])])


def test_per_user_limit_counts_redemptions_only(books, user, other_user):
    obj = code(per_user_limit=1)
    # An unpaid order with the code does not count.
    Order.objects.create(user=user, total=1, discount_code=obj)
    discounts.validate("MADANI15", [line(books["civil_print"])], user=user)
    _redeem(obj, user)
    with pytest.raises(discounts.DiscountError, match="پیش‌تر"):
        discounts.validate("MADANI15", [line(books["civil_print"])], user=user)
    # Anonymous quotes and other users are not limited.
    discounts.validate("MADANI15", [line(books["civil_print"])])
    discounts.validate("MADANI15", [line(books["civil_print"])], user=other_user)


def test_min_order_on_eligible_lines(books):
    code(min_order_total=1_000_000, formats=["EBOOK"])
    lines = [line(books["civil_print"]), line(books["commerce_ebook"])]
    with pytest.raises(discounts.DiscountError) as exc:
        discounts.validate("MADANI15", lines)
    assert exc.value.message == "این کد برای سفارش‌های بالای ۱٬۰۰۰٬۰۰۰ تومان است."


def test_scope_by_format(books):
    code(formats=["EBOOK"])
    with pytest.raises(discounts.DiscountError, match="قابل استفاده نیست"):
        discounts.validate("MADANI15", [line(books["civil_print"])])
    _, amount = discounts.validate(
        "MADANI15", [line(books["civil_print"]), line(books["civil_ebook"])]
    )
    assert amount == 990_000 * 15 // 100


def test_scope_by_subject(books):
    from apps.catalog.models import Subject

    obj = code()
    other = Subject.objects.create(name="فقه")
    obj.subjects.set([other])
    with pytest.raises(discounts.DiscountError, match="قابل استفاده نیست"):
        discounts.validate("MADANI15", [line(books["civil_print"])])
    obj.subjects.set([books["civil"]])
    _, amount = discounts.validate(
        "MADANI15", [line(books["civil_print"]), line(books["commerce_print"])]
    )
    assert amount == 300_000  # only the civil book is eligible
