"""د۱ «این کتاب را دارید»: GET /me/owned/ from paid orders and ebook entitlements."""

import uuid
from unittest import mock

import pytest

from apps.library.services import entitlements
from apps.orders.models import ReturnLine, ReturnRequest
from apps.orders.services import checkout, ownership, state


def _order(user, variants, *, address=None, method=None, pay=True):
    data = {"items": [{"variant_id": v.pk} for v in variants]}
    if address is not None:
        data.update(address_id=address.pk, shipping_method_id=method.pk)
    order = checkout.create_order(user, data, uuid.uuid4())
    if pay:
        with mock.patch("apps.accounts.tasks.send_sms.delay"):
            state.mark_paid(order)
        order.refresh_from_db()
    return order


def test_anonymous_gets_401_and_empty_service(api):
    assert api.get("/api/v1/me/owned/").status_code == 401
    assert ownership.owned_books(None) == []


def test_print_and_ebook_formats(auth_api, user, books, methods, address):
    print_order = _order(user, [books["civil_print"]], address=address, method=methods["post"])
    _order(user, [books["commerce_ebook"]])
    res = auth_api.get("/api/v1/me/owned/")
    assert res.status_code == 200
    assert res["Cache-Control"] == "private, no-store"
    rows = {r["slug"]: r for r in res.json()["books"]}
    civil = rows[books["civil_book"].slug]
    assert civil["formats"] == ["PRINT"] and civil["can_read"] is False
    assert civil["order_number"] == print_order.number and civil["purchased_at"]
    commerce = rows[books["commerce_book"].slug]
    assert commerce["formats"] == ["EBOOK"] and commerce["can_read"] is True


def test_bundle_owns_both_formats(user, books, methods, address):
    _order(user, [books["civil_bundle"]], address=address, method=methods["post"])
    (row,) = ownership.owned_books(user)
    assert row["formats"] == ["PRINT", "EBOOK"]
    assert ownership.owned_formats(user) == {books["civil_book"].pk: {"PRINT", "EBOOK"}}


def test_unpaid_orders_and_revoked_entitlements_do_not_count(user, books, methods, address):
    _order(user, [books["civil_print"]], address=address, method=methods["post"], pay=False)
    order = _order(user, [books["commerce_ebook"]])
    entitlements.revoke_for_order(order)
    assert ownership.owned_books(user) == []


def test_admin_grant_counts_as_ebook(user, books):
    entitlements.grant(user, books["civil_book"])
    (row,) = ownership.owned_books(user)
    assert row["formats"] == ["EBOOK"] and row["order_number"] is None


def test_fully_refunded_print_line_is_not_owned(user, books, methods, address):
    order = _order(user, [books["civil_print"]], address=address, method=methods["post"])
    ret = ReturnRequest.objects.create(
        order=order, reason=ReturnRequest.Reason.CHANGED_MIND, status=ReturnRequest.Status.REFUNDED
    )
    ReturnLine.objects.create(return_request=ret, order_item=order.items.get(), quantity=1)
    assert ownership.owned_books(user) == []


def test_other_users_orders_are_invisible(auth_api, other_user, books):
    _order(other_user, [books["civil_ebook"]])
    assert auth_api.get("/api/v1/me/owned/").json() == {"books": []}


@pytest.mark.parametrize("variant_key", ["civil_print", "civil_ebook"])
def test_latest_purchase_wins(user, books, methods, address, variant_key):
    kw = {"address": address, "method": methods["post"]} if variant_key == "civil_print" else {}
    _order(user, [books[variant_key]], **kw)
    second = _order(user, [books["civil_print"]], address=address, method=methods["post"])
    (row,) = ownership.owned_books(user)
    assert row["order_number"] == second.number
