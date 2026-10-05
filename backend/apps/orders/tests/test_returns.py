import datetime as dt
import uuid
from unittest import mock

import pytest
from django.core.exceptions import ValidationError
from django.test import Client
from django.utils import timezone

from apps.accounts.models import User
from apps.core.money import to_rial
from apps.library.models import EbookEntitlement
from apps.library.services.entitlements import has_entitlement
from apps.orders.models import Order, ReturnRequest
from apps.orders.services import checkout, returns, state
from apps.payments.models import Payment, PaymentLog
from apps.payments.services.gateway import REFUND_NOT_SUPPORTED_MESSAGE

R = ReturnRequest.Status
M = ReturnRequest.RefundMethod
REASON = ReturnRequest.Reason.CHANGED_MIND


def make_iban(bban: str) -> str:
    numeric = "".join(str(int(ch, 36)) for ch in bban + "IR00")
    return f"IR{98 - int(numeric) % 97:02d}{bban}"


VALID_IBAN = make_iban("0170000000100324200001")
VALID_CARD = "6037990000000006"  # Luhn-valid


def _paid(user, items, address=None, method=None, gateway="fake"):
    data = {"items": items}
    if address is not None:
        data.update(address_id=address.pk, shipping_method_id=method.pk)
    order = checkout.create_order(user, data, uuid.uuid4())
    with mock.patch("apps.accounts.tasks.send_sms.delay"):
        state.mark_paid(order)
    order.refresh_from_db()
    Payment.objects.create(
        order=order,
        gateway=gateway,
        amount_rial=to_rial(order.total),
        status=Payment.Status.PAID,
        authority=f"A-{uuid.uuid4().hex}",
    )
    return order


@pytest.fixture
def mixed_order(user, books, methods, address):
    """2 × civil print (2,000,000 each) + commerce ebook (500,000) + post shipping."""
    return _paid(
        user,
        [
            {"variant_id": books["civil_print"].pk, "quantity": 2},
            {"variant_id": books["commerce_ebook"].pk},
        ],
        address,
        methods["post"],
    )


@pytest.fixture
def ebook_order(user, books):
    return _paid(user, [{"variant_id": books["civil_ebook"].pk}])


def item_of(order, variant_type):
    return order.items.get(variant_type=variant_type)


# --- validators ----------------------------------------------------------------------------------


def test_iban_validation():
    assert returns.validate_shaba(VALID_IBAN) == VALID_IBAN
    assert returns.validate_shaba("IR820540102680020817909002") == "IR820540102680020817909002"
    spaced = " ".join(VALID_IBAN[i : i + 4] for i in range(0, 26, 4)).lower()
    assert returns.validate_shaba(spaced) == VALID_IBAN
    persian = VALID_IBAN[:2] + VALID_IBAN[2:].translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))
    assert returns.validate_shaba(persian) == VALID_IBAN
    assert returns.validate_shaba(VALID_IBAN[2:]) == VALID_IBAN  # bare 24 digits
    bad_check = VALID_IBAN[:-1] + str((int(VALID_IBAN[-1]) + 1) % 10)
    for bad in (bad_check, "IR12345", "DE89370400440532013000", "IR" + "x" * 24):
        with pytest.raises(ValidationError):
            returns.validate_shaba(bad)


def test_card_validation():
    assert returns.validate_card_number("6037-9900-0000-0006") == VALID_CARD
    with pytest.raises(ValidationError):
        returns.validate_card_number("6037990000000007")
    with pytest.raises(ValidationError):
        returns.validate_card_number("123")


# --- 7-day window --------------------------------------------------------------------------------


def test_window_shipping_order(mixed_order):
    assert returns.within_window(mixed_order) is None  # not delivered yet
    now = timezone.now()
    mixed_order.delivered_at = now - dt.timedelta(days=3)
    assert returns.within_window(mixed_order) is True
    assert returns.within_window(mixed_order, at=now + dt.timedelta(days=5)) is False
    mixed_order.delivered_at = now - dt.timedelta(days=8)
    assert returns.within_window(mixed_order) is False


def test_window_ebook_order_uses_paid_at(ebook_order):
    assert returns.within_window(ebook_order) is True
    ebook_order.paid_at = timezone.now() - dt.timedelta(days=10)
    assert returns.within_window(ebook_order) is False


# --- create --------------------------------------------------------------------------------------


def test_partial_return_default_amount(mixed_order):
    printed = item_of(mixed_order, "PRINT")
    rr = returns.create_return(mixed_order, [(printed, 1)], reason=REASON)
    assert rr.status == R.REQUESTED
    assert rr.refund_amount == printed.line_total // 2 == 2_000_000
    assert rr.restock is True
    assert rr.logs.count() == 1
    # The other unit can still be returned; a third cannot.
    rr2 = returns.create_return(mixed_order, [(printed.pk, 1)], reason=REASON)
    assert rr2.refund_amount == 2_000_000
    with pytest.raises(returns.ReturnError):
        returns.create_return(mixed_order, [(printed, 1)], reason=REASON)


def test_over_return_rejected(mixed_order):
    printed = item_of(mixed_order, "PRINT")
    with pytest.raises(returns.ReturnError):
        returns.create_return(mixed_order, [(printed, 3)], reason=REASON)
    with pytest.raises(returns.ReturnError):
        returns.create_return(mixed_order, [(printed, 2), (printed, 1)], reason=REASON)
    with pytest.raises(returns.ReturnError):
        returns.create_return(mixed_order, [], reason=REASON)


def test_rejected_return_frees_quantity(mixed_order):
    printed = item_of(mixed_order, "PRINT")
    rr = returns.create_return(mixed_order, [(printed, 2)], reason=REASON)
    returns.reject(rr, note="خارج از شرایط")
    assert rr.status == R.REJECTED and rr.closed_at
    returns.create_return(mixed_order, [(printed, 2)], reason=REASON)


def test_item_of_other_order_rejected(mixed_order, ebook_order):
    with pytest.raises(returns.ReturnError):
        returns.create_return(mixed_order, [(ebook_order.items.get(), 1)], reason=REASON)


def test_unpaid_order_rejected(user, books):
    order = checkout.create_order(
        user, {"items": [{"variant_id": books["civil_ebook"].pk}]}, uuid.uuid4()
    )
    with pytest.raises(returns.ReturnError):
        returns.create_return(order, [(order.items.get(), 1)], reason=REASON)


def test_amount_over_refundable_rejected(mixed_order):
    printed = item_of(mixed_order, "PRINT")
    with pytest.raises(returns.ReturnError):
        returns.create_return(
            mixed_order, [(printed, 1)], reason=REASON, refund_amount=mixed_order.total + 1
        )


def test_ebook_only_return_cannot_restock(ebook_order):
    rr = returns.create_return(ebook_order, [(ebook_order.items.get(), 1)], reason=REASON)
    assert rr.restock is False


def test_invalid_shaba_on_create(mixed_order):
    with pytest.raises(returns.ReturnError):
        returns.create_return(
            mixed_order, [(item_of(mixed_order, "PRINT"), 1)], reason=REASON, shaba="IR00"
        )


# --- flow ----------------------------------------------------------------------------------------


def test_restock_on_received(mixed_order, books):
    variant = books["civil_print"]
    variant.refresh_from_db()
    before = variant.stock
    rr = returns.create_return(mixed_order, [(item_of(mixed_order, "PRINT"), 2)], reason=REASON)
    with pytest.raises(returns.ReturnError):
        returns.mark_received(rr)  # must be approved first
    returns.approve(rr)
    returns.mark_received(rr)
    variant.refresh_from_db()
    assert variant.stock == before + 2
    assert rr.status == R.RECEIVED and rr.received_at
    assert list(rr.logs.values_list("to_status", flat=True)) == [
        R.REQUESTED,
        R.APPROVED,
        R.RECEIVED,
    ]


def test_no_restock_flag(mixed_order, books):
    variant = books["civil_print"]
    variant.refresh_from_db()
    before = variant.stock
    rr = returns.create_return(
        mixed_order, [(item_of(mixed_order, "PRINT"), 1)], reason=REASON, restock=False
    )
    returns.approve(rr)
    returns.mark_received(rr)
    variant.refresh_from_db()
    assert variant.stock == before


def test_physical_return_needs_receipt_before_refund(mixed_order):
    rr = returns.create_return(
        mixed_order,
        [(item_of(mixed_order, "PRINT"), 1)],
        reason=REASON,
        refund_method=M.GATEWAY,
    )
    returns.approve(rr)
    with pytest.raises(returns.ReturnError):
        returns.refund(rr)


def test_manual_refund_needs_reference(mixed_order):
    rr = returns.create_return(
        mixed_order, [(item_of(mixed_order, "PRINT"), 1)], reason=REASON, shaba=VALID_IBAN
    )
    returns.approve(rr)
    returns.mark_received(rr)
    with pytest.raises(returns.ReturnError):
        returns.refund(rr)
    rr.refund_reference = "12345"
    rr.save()
    returns.refund(rr)
    mixed_order.refresh_from_db()
    assert rr.status == R.REFUNDED and rr.refunded_at
    assert mixed_order.refunded_total == 2_000_000
    assert mixed_order.status == Order.Status.PAID  # order state machine untouched
    assert mixed_order.net_total == mixed_order.total - 2_000_000


def test_manual_shaba_refund_needs_valid_shaba(mixed_order):
    rr = returns.create_return(mixed_order, [(item_of(mixed_order, "PRINT"), 1)], reason=REASON)
    returns.approve(rr)
    returns.mark_received(rr)
    rr.refund_reference = "R1"
    rr.save()
    with pytest.raises(returns.ReturnError):
        returns.refund(rr)  # no shaba
    rr.refund_method = M.CARD
    rr.card_number = VALID_CARD
    rr.save()
    returns.refund(rr)
    assert rr.status == R.REFUNDED


def test_gateway_refund_success_and_double_refund_blocked(ebook_order):
    rr = returns.create_return(
        ebook_order, [(ebook_order.items.get(), 1)], reason=REASON, refund_method=M.GATEWAY
    )
    returns.approve(rr)
    returns.refund(rr)  # ebook-only: straight from APPROVED
    ebook_order.refresh_from_db()
    assert rr.status == R.REFUNDED
    assert rr.refund_reference.startswith("FAKE-REFUND-")
    assert ebook_order.refunded_total == ebook_order.total
    payment = ebook_order.payments.get()
    events = list(payment.logs.values_list("event", flat=True))
    assert events == ["refund_requested", "refunded"]
    assert payment.logs.get(event="refunded").data["amount_rial"] == to_rial(ebook_order.total)

    stale = ReturnRequest.objects.get(pk=rr.pk)
    stale.status = R.APPROVED  # a second click with an old copy
    with pytest.raises(returns.ReturnError):
        returns.refund(stale)
    ebook_order.refresh_from_db()
    assert ebook_order.refunded_total == ebook_order.total
    assert PaymentLog.objects.filter(payment=payment, event="refunded").count() == 1


def test_gateway_refund_unsupported(user, books):
    order = _paid(user, [{"variant_id": books["civil_ebook"].pk}], gateway="zarinpal")
    rr = returns.create_return(
        order, [(order.items.get(), 1)], reason=REASON, refund_method=M.GATEWAY
    )
    returns.approve(rr)
    with pytest.raises(returns.ReturnError) as exc:
        returns.refund(rr)
    assert exc.value.message == REFUND_NOT_SUPPORTED_MESSAGE
    rr.refresh_from_db()
    order.refresh_from_db()
    assert rr.status == R.APPROVED
    assert order.refunded_total == 0
    payment = order.payments.get()
    assert list(payment.logs.values_list("event", flat=True)) == [
        "refund_requested",
        "refund_failed",
    ]
    assert "ناموفق" in rr.logs.last().note


def test_ebook_revoke_only_when_flagged(mixed_order, books):
    ebook_item = item_of(mixed_order, "EBOOK")
    commerce = books["commerce_book"]
    civil = books["civil_book"]
    assert has_entitlement(mixed_order.user, commerce)

    rr = returns.create_return(
        mixed_order, [(ebook_item, 1)], reason=REASON, refund_method=M.GATEWAY
    )
    returns.approve(rr)
    returns.refund(rr)
    assert has_entitlement(mixed_order.user, commerce)  # revoke_ebook not set

    other = _paid(mixed_order.user, [{"variant_id": books["civil_ebook"].pk}])
    rr2 = returns.create_return(
        other,
        [(other.items.get(), 1)],
        reason=REASON,
        refund_method=M.GATEWAY,
        revoke_ebook=True,
    )
    returns.approve(rr2)
    returns.refund(rr2)
    assert not has_entitlement(other.user, civil)
    assert has_entitlement(other.user, commerce)  # other books untouched
    assert EbookEntitlement.objects.filter(revoked_at__isnull=False).count() == 1


def test_refund_never_exceeds_refundable(mixed_order):
    printed = item_of(mixed_order, "PRINT")
    rr = returns.create_return(mixed_order, [(printed, 1)], reason=REASON, refund_method=M.GATEWAY)
    Order.objects.filter(pk=mixed_order.pk).update(refunded_total=mixed_order.total - 100)
    returns.approve(rr)
    returns.mark_received(rr)
    with pytest.raises(returns.ReturnError):
        returns.refund(rr)


def test_cancel_and_invalid_transitions(mixed_order):
    rr = returns.create_return(mixed_order, [(item_of(mixed_order, "PRINT"), 1)], reason=REASON)
    returns.cancel(rr)
    assert rr.status == R.CANCELLED
    for service in (returns.approve, returns.mark_received, returns.refund, returns.reject):
        with pytest.raises(returns.ReturnError):
            service(rr)


# --- admin ---------------------------------------------------------------------------------------


@pytest.fixture
def admin_client(db):
    admin = User.objects.create_superuser(phone="09120000000", password="pass12345")
    client = Client()
    client.force_login(admin)
    return client


def test_admin_pages(admin_client, mixed_order):
    rr = returns.create_return(mixed_order, [(item_of(mixed_order, "PRINT"), 1)], reason=REASON)
    for url in (
        "/admin/orders/returnrequest/",
        "/admin/orders/returnrequest/?status__exact=REQUESTED",
        f"/admin/orders/returnrequest/?order__id__exact={mixed_order.pk}",
        f"/admin/orders/returnrequest/{rr.pk}/change/",
        f"/admin/orders/returnrequest/add/?order={mixed_order.pk}",
    ):
        res = admin_client.get(url)
        assert res.status_code == 200, url
    page = admin_client.get(f"/admin/orders/order/{mixed_order.pk}/change/").content.decode()
    assert f"/admin/orders/returnrequest/add/?order={mixed_order.pk}" in page
    assert "ثبت مرجوعی" in page
    assert "مبلغ مسترد شده" in page
    # Without an order the add page sends staff to the orders list.
    assert admin_client.get("/admin/orders/returnrequest/add/").status_code == 302


def _add_post(order, item, qty, **extra):
    return {
        "reason": REASON,
        "description": "",
        "restock": "on",
        "refund_method": M.SHABA,
        "refund_amount": "",
        "shaba": VALID_IBAN,
        "card_number": "",
        "account_holder": "",
        "refund_reference": "",
        "staff_note": "",
        "lines-TOTAL_FORMS": "1",
        "lines-INITIAL_FORMS": "0",
        "lines-MIN_NUM_FORMS": "1",
        "lines-MAX_NUM_FORMS": "1000",
        "lines-0-order_item": str(item.pk),
        "lines-0-quantity": str(qty),
        "logs-TOTAL_FORMS": "0",
        "logs-INITIAL_FORMS": "0",
        "logs-MIN_NUM_FORMS": "0",
        "logs-MAX_NUM_FORMS": "1000",
        **extra,
    }


def test_admin_add_and_actions(admin_client, mixed_order, books):
    printed = item_of(mixed_order, "PRINT")
    url = f"/admin/orders/returnrequest/add/?order={mixed_order.pk}"
    res = admin_client.post(url, _add_post(mixed_order, printed, 3))
    assert res.status_code == 200  # over-return is a form error
    assert ReturnRequest.objects.count() == 0
    res = admin_client.post(url, _add_post(mixed_order, printed, 1, shaba="IR00"))
    assert res.status_code == 200 and ReturnRequest.objects.count() == 0

    res = admin_client.post(url, _add_post(mixed_order, printed, 1))
    assert res.status_code == 302, res.content.decode()[:3000]
    rr = ReturnRequest.objects.get()
    assert rr.order == mixed_order and rr.refund_amount == 2_000_000
    assert rr.created_by is not None and rr.logs.get().actor is not None

    post = {"_selected_action": [rr.pk]}
    admin_client.post("/admin/orders/returnrequest/", {**post, "action": "approve_selected"})
    admin_client.post(f"/admin/orders/returnrequest/{rr.pk}/receive/")
    rr.refresh_from_db()
    assert rr.status == R.RECEIVED
    admin_client.post("/admin/orders/returnrequest/", {**post, "action": "refund_selected"})
    rr.refresh_from_db()
    assert rr.status == R.RECEIVED  # no reference yet
    ReturnRequest.objects.filter(pk=rr.pk).update(refund_reference="TRX-1")
    admin_client.post(f"/admin/orders/returnrequest/{rr.pk}/refund/")
    rr.refresh_from_db()
    mixed_order.refresh_from_db()
    assert rr.status == R.REFUNDED
    assert mixed_order.refunded_total == 2_000_000
    assert admin_client.get(f"/admin/orders/returnrequest/{rr.pk}/change/").status_code == 200
