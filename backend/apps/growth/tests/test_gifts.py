import datetime as dt
import uuid

import pytest
from django.utils import timezone

from apps.growth.models import Gift
from apps.growth.services import gifts
from apps.library.models import EbookEntitlement
from apps.library.services.entitlements import has_entitlement, revoke_for_order
from apps.orders.models import Order
from apps.orders.services import checkout, state

GIFT = {"sender_name": "  مریم  ", "recipient_name": "علی", "message": "موفق باشی"}


def gift_order(user, books, methods=None, *, variants=("civil_ebook",), gift=GIFT):
    data = {"items": [{"variant_id": books[v].pk, "quantity": 1} for v in variants], "gift": gift}
    if methods is not None:
        data["shipping_method_id"] = methods["post"].pk
    return checkout.create_order(user, data, uuid.uuid4())


def test_gift_checkout_needs_no_address_and_keeps_buyer_out(user, books):
    order = gift_order(user, books)
    gift = order.gift
    assert gift.status == Gift.Status.PENDING_PAYMENT
    assert gift.sender_name == "مریم"
    assert state.mark_paid(order)
    gift.refresh_from_db()
    assert gift.status == Gift.Status.ACTIVE
    assert gift.expires_at - gift.activated_at == dt.timedelta(days=90)
    # the buyer does not get the ebook: the recipient does, on claim
    assert not has_entitlement(user, books["civil_book"])


def test_print_gift_requires_shipping_method_only(user, books, methods):
    with pytest.raises(checkout.CheckoutError) as exc:
        gift_order(user, books, variants=("civil_print",))
    assert "shipping_method_id" in exc.value.detail
    order = gift_order(user, books, methods, variants=("civil_print",))
    assert order.needs_shipping and order.shipping_address is None
    assert order.shipping_total > 0
    state.mark_paid(order)
    order.refresh_from_db()
    assert gifts.STAFF_NOTE_WAITING in order.staff_note


def test_claim_ebook_is_idempotent(user, other_user, books):
    order = gift_order(user, books, variants=("civil_ebook", "commerce_ebook"))
    state.mark_paid(order)
    token = order.gift.token
    first = gifts.claim(token, other_user)
    assert first.status == Gift.Status.CLAIMED and first.claimed_by == other_user
    ent = EbookEntitlement.objects.get(user=other_user, book=books["civil_book"])
    assert ent.source == EbookEntitlement.Source.GIFT == "GIFT"
    assert ent.source_order == order
    # replay by the same person: same result, nothing duplicated
    again = gifts.claim(token, other_user)
    assert again.pk == first.pk and again.claimed_at == first.claimed_at
    assert EbookEntitlement.objects.filter(user=other_user).count() == 2
    # anyone else: already claimed
    with pytest.raises(gifts.GiftError) as exc:
        gifts.claim(token, user)
    assert exc.value.code == "already_claimed" and exc.value.status == 409
    # refunds still revoke the recipient's access
    revoke_for_order(order)
    assert not has_entitlement(other_user, books["civil_book"])


def test_claim_expired(user, other_user, books):
    order = gift_order(user, books)
    state.mark_paid(order)
    gift = Gift.objects.get(order=order)
    later = gift.expires_at + dt.timedelta(seconds=1)
    assert gifts.state(gift, later) == gifts.EXPIRED
    with pytest.raises(gifts.GiftError) as exc:
        gifts.claim(gift.token, other_user, now=later)
    assert exc.value.code == "expired" and exc.value.status == 410
    assert not has_entitlement(other_user, books["civil_book"])
    # just before the deadline it still works
    assert gifts.claim(gift.token, other_user, now=gift.expires_at).status == Gift.Status.CLAIMED


def test_claim_unpaid_or_unknown(user, other_user, books):
    order = gift_order(user, books)
    with pytest.raises(gifts.GiftError) as exc:
        gifts.claim(order.gift.token, other_user)
    assert exc.value.code == "not_ready"
    with pytest.raises(gifts.GiftError) as exc:
        gifts.claim("nope", other_user)
    assert exc.value.code == "not_found"


def test_claim_print_needs_recipient_address(user, other_user, books, methods):
    from apps.orders.models import Address

    order = gift_order(user, books, methods, variants=("civil_bundle",))
    state.mark_paid(order)
    token = order.gift.token
    with pytest.raises(gifts.GiftError) as exc:
        gifts.claim(token, other_user)
    assert exc.value.code == "address_required"
    buyer_address = Address.objects.create(
        user=user,
        recipient_name="x",
        recipient_phone="09121234567",
        province="تهران",
        city="تهران",
        postal_code="1234567890",
        address_line="x",
    )
    with pytest.raises(gifts.GiftError) as exc:
        gifts.claim(token, other_user, address_id=buyer_address.pk)  # not theirs
    assert exc.value.code == "address_not_found"
    mine = Address.objects.create(
        user=other_user,
        recipient_name="علی",
        recipient_phone="09351234567",
        province="فارس",
        city="شیراز",
        postal_code="1111111111",
        address_line="خیابان زند",
    )
    gift = gifts.claim(token, other_user, address_id=mine.pk)
    order.refresh_from_db()
    assert order.shipping_address["city"] == "شیراز"
    assert gift.shipping_address["city"] == "شیراز"
    assert gifts.STAFF_NOTE_CLAIMED in order.staff_note
    assert gifts.STAFF_NOTE_WAITING not in order.staff_note
    assert has_entitlement(other_user, books["civil_book"])  # bundle → ebook too


def test_cancelled_order_cannot_be_claimed(user, other_user, books):
    order = gift_order(user, books)
    state.mark_paid(order)
    Order.objects.filter(pk=order.pk).update(status=Order.Status.CANCELLED)
    with pytest.raises(gifts.GiftError) as exc:
        gifts.claim(order.gift.token, other_user)
    assert exc.value.code == "cancelled"


def test_non_gift_order_still_grants_buyer(user, books):
    order = checkout.create_order(
        user, {"items": [{"variant_id": books["civil_ebook"].pk}]}, uuid.uuid4()
    )
    state.mark_paid(order)
    assert has_entitlement(user, books["civil_book"])
    assert not Gift.objects.exists()


# --- API --------------------------------------------------------------------------------------


def test_checkout_api_gift(auth_api, books, monkeypatch):
    res = auth_api.post(
        "/api/v1/checkout/",
        {
            "items": [{"variant_id": books["civil_ebook"].pk}],
            "checkout_key": str(uuid.uuid4()),
            "gift": {"sender_name": "مریم", "message": "x" * 301},
        },
        format="json",
    )
    assert res.status_code == 400 and "gift" in res.json()


def test_gift_api_flow(user, other_user, auth_api, api, books):
    order = gift_order(user, books)
    token = order.gift.token
    mine = auth_api.get(f"/api/v1/growth/gifts/orders/{order.number}/").json()
    assert mine["claim_url"] is None  # unpaid
    state.mark_paid(order)
    mine = auth_api.get(f"/api/v1/growth/gifts/orders/{order.number}/").json()
    assert mine["claim_url"] == f"https://dadrosebook.com/gift/{token}"

    public = api.get(f"/api/v1/growth/gifts/{token}/").json()
    assert public["state"] == "active" and public["sender_name"] == "مریم"
    assert public["has_ebook"] and not public["needs_address"]
    assert "claim_url" not in public and "order_number" not in public
    assert api.get("/api/v1/growth/gifts/zzz/").status_code == 404

    assert api.post(f"/api/v1/growth/gifts/{token}/claim/", {}, format="json").status_code == 401
    api.force_authenticate(other_user)
    res = api.post(f"/api/v1/growth/gifts/{token}/claim/", {}, format="json")
    assert res.status_code == 200 and res.json()["claimed_by_me"] is True
    assert api.post(f"/api/v1/growth/gifts/{token}/claim/", {}, format="json").status_code == 200
    res = auth_api.post(f"/api/v1/growth/gifts/{token}/claim/", {}, format="json")
    assert res.status_code == 409 and res.json()["code"] == "already_claimed"
    # someone else's order number
    api.force_authenticate(other_user)
    assert api.get(f"/api/v1/growth/gifts/orders/{order.number}/").status_code == 404


def test_expired_api_status(user, other_user, api, books):
    order = gift_order(user, books)
    state.mark_paid(order)
    Gift.objects.filter(order=order).update(expires_at=timezone.now() - dt.timedelta(days=1))
    api.force_authenticate(other_user)
    res = api.post(f"/api/v1/growth/gifts/{order.gift.token}/claim/", {}, format="json")
    assert res.status_code == 410
