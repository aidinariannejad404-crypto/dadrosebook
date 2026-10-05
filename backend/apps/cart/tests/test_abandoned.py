import datetime as dt
from unittest import mock

import pytest
from django.test import Client
from django.utils import timezone

from apps.accounts.models import User
from apps.cart.models import Cart, CartItem
from apps.cart.services import abandoned
from apps.catalog.models import Subject
from apps.catalog.tests.conftest import make_book, print_variant
from apps.core.models import SmsTemplate
from apps.core.services.store_settings import get_store_settings
from apps.core.sms_catalog import ABANDONED_CART
from apps.orders.models import Order


@pytest.fixture
def variant(db):
    subject = Subject.objects.create(name="حقوق مدنی", color="#1F4E8C")
    book = make_book("قانون مدنی تحریری", subjects=[subject], variants=[print_variant(500_000, 5)])
    return book.variants.get()


@pytest.fixture
def enabled(db):
    s = get_store_settings()
    s.abandoned_cart_enabled = True
    s.abandoned_cart_hours = 6
    s.abandoned_cart_code = "SABAD10"
    s.save()
    return s


def make_cart(variant, *, phone="09121234567", hours_ago=10, user=True):
    owner = User.objects.create_user(phone=phone) if user else None
    cart = Cart.objects.create(user=owner)
    CartItem.objects.create(cart=cart, variant=variant, quantity=1)
    Cart.objects.filter(pk=cart.pk).update(
        updated_at=timezone.now() - dt.timedelta(hours=hours_ago)
    )
    cart.refresh_from_db()
    return cart


def test_which_carts_are_abandoned(variant, enabled):
    stale = make_cart(variant)
    make_cart(variant, phone="09121111111", hours_ago=1)  # too fresh
    make_cart(variant, phone="09122222222", hours_ago=24 * 10)  # too old
    make_cart(variant, phone="09123333333", user=False)  # guest: no phone
    buyer = make_cart(variant, phone="09124444444")
    Order.objects.create(user=buyer.user, paid_at=timezone.now(), status="PAID", total=1)
    assert list(abandoned.abandoned_carts()) == [stale]


@mock.patch("apps.accounts.tasks.send_sms.delay")
def test_send_once_with_template(send, variant, enabled, django_capture_on_commit_callbacks):
    cart = make_cart(variant)
    with django_capture_on_commit_callbacks(execute=True):
        assert abandoned.send_reminders() == 1
    phone, text = send.call_args.args
    assert phone == "09121234567"
    assert "قانون مدنی تحریری" in text and "/cart" in text
    cart.refresh_from_db()
    assert cart.reminded_at is not None
    with django_capture_on_commit_callbacks(execute=True):
        assert abandoned.send_reminders() == 0  # once per cart
    assert send.call_count == 1


@mock.patch("apps.accounts.tasks.send_sms.delay")
def test_disabled_or_template_off_sends_nothing(send, variant, db):
    make_cart(variant)
    assert abandoned.send_reminders() == 0  # store setting off by default
    SmsTemplate.objects.filter(key=ABANDONED_CART).update(is_active=False)
    assert abandoned.send_reminders(force=True) == 0
    send.assert_not_called()


@mock.patch("apps.accounts.tasks.send_sms.delay")
def test_out_of_stock_cart_skipped(send, variant, enabled):
    make_cart(variant)
    variant.stock = 0
    variant.save()
    assert abandoned.send_reminders() == 0


def test_recovery(variant, enabled):
    now = timezone.now()
    a = make_cart(variant)
    b = make_cart(variant, phone="09125555555")
    Cart.objects.filter(pk__in=[a.pk, b.pk]).update(reminded_at=now - dt.timedelta(days=1))
    Order.objects.create(user=a.user, paid_at=now, status="PAID", total=1)
    r = abandoned.recovery(now - dt.timedelta(days=7), now + dt.timedelta(minutes=1))
    assert r == {"reminded": 2, "recovered": 1}


@mock.patch("apps.accounts.tasks.send_sms.delay")
def test_admin_filter_and_action(send, variant, enabled):
    cart = make_cart(variant)
    admin = User.objects.create_superuser(phone="09120000000", password="x12345678")
    client = Client()
    client.force_login(admin)
    res = client.get("/admin/cart/cart/", {"abandoned": "1"})
    assert res.status_code == 200
    assert str(cart.user) in res.content.decode() or cart.user.phone in res.content.decode()
    client.post("/admin/cart/cart/", {"_selected_action": [cart.pk], "action": "send_reminder"})
    cart.refresh_from_db()
    assert cart.reminded_at is not None
    assert client.get("/admin/cart/cart/", {"abandoned": "reminded"}).status_code == 200


def test_task_respects_setting(variant, db):
    from apps.cart.tasks import send_abandoned_cart_reminders

    make_cart(variant)
    assert send_abandoned_cart_reminders() == 0
