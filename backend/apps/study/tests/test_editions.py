import pytest
from django.utils import timezone

from apps.catalog.tests.conftest import ebook_variant, make_book, print_variant
from apps.library.services import entitlements
from apps.orders.models import Order, OrderItem
from apps.orders.services import quote as quote_service
from apps.study.models import EditionLink, EditionUpgradeNotice
from apps.study.services import editions


@pytest.fixture
def old_book(civil):
    return make_book(
        "آیین دادرسی مدنی",
        subjects=[civil],
        publish_year=1404,
        variants=[print_variant(1_000_000)],
    )


@pytest.fixture
def new_book(civil):
    return make_book(
        "آیین دادرسی مدنی (ویرایش جدید)",
        subjects=[civil],
        publish_year=1405,
        variants=[print_variant(1_200_000, sale_price=1_100_000), ebook_variant(600_000)],
    )


@pytest.fixture
def link(old_book, new_book):
    return EditionLink.objects.create(
        new_book=new_book, old_book=old_book, upgrade_discount_percent=40
    )


def paid_order(user, book, *, status=Order.Status.DELIVERED, variant_type="PRINT"):
    order = Order.objects.create(user=user, status=status, paid_at=timezone.now(), total=1)
    OrderItem.objects.create(
        order=order,
        book=book,
        title=book.title,
        variant_type=variant_type,
        list_price=1,
        unit_price=1,
        quantity=1,
        line_total=1,
    )
    return order


def variant(book, kind):
    return book.variants.get(type=kind)


def test_ownership_from_paid_orders_and_entitlements(user, old_book, new_book, book):
    assert editions.owned_book_ids(user) == set()
    paid_order(user, old_book)
    entitlements.grant(user, book)
    unpaid = paid_order(user, new_book, status=Order.Status.CANCELLED)
    assert unpaid  # cancelled orders do not count
    assert editions.owned_book_ids(user) == {old_book.pk, book.pk}


def test_offer_only_for_owners_of_the_old_edition(user, other_user, link, old_book, new_book):
    assert editions.upgrade_offer(user, new_book) is None
    paid_order(user, old_book)
    offer = editions.upgrade_offer(user, new_book)
    assert offer["percent"] == 40
    assert offer["message"] == "شما ویرایش ۱۴۰۴ را دارید؛ ارتقا با ۴۰٪ تخفیف"
    assert editions.upgrade_offer(other_user, new_book) is None
    # an inactive link offers nothing
    EditionLink.objects.filter(pk=link.pk).update(is_active=False)
    assert editions.upgrade_offer(user, new_book) is None


def test_no_offer_once_the_new_edition_is_owned(user, link, old_book, new_book):
    paid_order(user, old_book)
    entitlements.grant(user, new_book)
    assert editions.upgrade_offer(user, new_book) is None


def test_quote_applies_upgrade_discount_to_one_unit(user, link, old_book, new_book, book):
    paid_order(user, old_book)
    items = [
        {"variant_id": variant(new_book, "PRINT").pk, "quantity": 2},
        {"variant_id": variant(new_book, "EBOOK").pk, "quantity": 1},
        {"variant_id": variant(book, "PRINT").pk, "quantity": 1},
    ]
    q = quote_service.build_quote(items, user=user)
    lines = {(line["book_id"], line["variant_type"]): line for line in q["lines"]}
    print_line = lines[(new_book.pk, "PRINT")]
    # 40% of the effective (sale) price, once: 1,100,000 × 40% = 440,000
    assert print_line["upgrade_discount"] == 440_000
    assert print_line["unit_price"] == 1_100_000  # two units: the unit price stays
    assert print_line["line_total"] == 2 * 1_100_000 - 440_000
    ebook_line = lines[(new_book.pk, "EBOOK")]
    assert ebook_line["upgrade_discount"] == 240_000
    assert ebook_line["unit_price"] == 360_000
    assert ebook_line["line_total"] == 360_000
    assert "upgrade_discount" not in lines[(book.pk, "PRINT")]
    assert q["upgrade_discount_total"] == 680_000
    assert q["items_total"] == sum(line["line_total"] for line in q["lines"])
    assert q["total"] == q["items_total"]


def test_quote_without_ownership_or_user_is_unchanged(user, link, new_book):
    items = [{"variant_id": variant(new_book, "EBOOK").pk, "quantity": 1}]
    for who in (None, user):
        q = quote_service.build_quote(items, user=who)
        assert q["upgrade_discount_total"] == 0
        assert q["lines"][0]["line_total"] == 600_000


def test_checkout_snapshots_the_upgrade_price(user, link, old_book, new_book):
    from apps.orders.services.checkout import create_order

    paid_order(user, old_book)
    order = create_order(
        user, {"items": [{"variant_id": variant(new_book, "EBOOK").pk, "quantity": 1}]}, None
    )
    item = order.items.get()
    assert (item.unit_price, item.line_total, order.total) == (360_000, 360_000, 360_000)


def test_notify_owners_is_idempotent(user, other_user, link, old_book, new_book, sms_outbox):
    paid_order(user, old_book)
    entitlements.grant(other_user, old_book)
    entitlements.grant(other_user, new_book)  # already upgraded: not told
    assert editions.notify_owners(link) == 1
    assert editions.notify_owners(link) == 0
    assert EditionUpgradeNotice.objects.filter(link=link).count() == 1
    link.refresh_from_db()
    assert link.notified_at is not None


def test_notify_owners_sends_the_template(
    user, link, old_book, new_book, django_capture_on_commit_callbacks, sms_outbox
):
    paid_order(user, old_book)
    with django_capture_on_commit_callbacks(execute=True):
        editions.notify_owners(link)
    ((phone, text),) = sms_outbox
    assert phone == user.phone
    assert "ویرایش ۱۴۰۵" in text and "ویرایش ۱۴۰۴" in text and "۴۰٪" in text
