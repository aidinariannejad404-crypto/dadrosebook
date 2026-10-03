from datetime import timedelta
from types import SimpleNamespace

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.cart.models import Cart, CartItem
from apps.cart.services import (
    CartError,
    add_item,
    bulk_add,
    cart_summary,
    clear_cart,
    get_cart_by_token,
    get_cart_for_request,
    get_or_create_cart,
    merge_guest_cart,
    purge_stale_carts,
    remove_item,
    set_quantity,
)
from apps.cart.tasks import purge_stale_carts as purge_task
from apps.core.models import StoreSettings

pytestmark = pytest.mark.django_db


def make_request(token=None, user=None):
    meta = {"HTTP_X_CART_TOKEN": str(token)} if token else {}
    return SimpleNamespace(META=meta, user=user)


def line(cart, variant):
    return cart.items.get(variant=variant)


# --- identity ---------------------------------------------------------------------------------


def test_get_cart_by_token_handles_unknown_and_garbage():
    cart = Cart.objects.create()
    assert get_cart_by_token(cart.token) == cart
    assert get_cart_by_token(str(cart.token)) == cart
    assert get_cart_by_token("not-a-uuid") is None
    assert get_cart_by_token(None) is None
    assert get_cart_by_token("6f0c1a8e-0000-4000-8000-000000000000") is None


def test_get_or_create_cart_reuses_guest_cart_or_creates():
    cart = Cart.objects.create()
    assert get_or_create_cart(str(cart.token)) == cart
    new = get_or_create_cart("garbage")
    assert new.pk != cart.pk and new.user is None


def test_get_or_create_cart_for_user(user):
    cart = get_or_create_cart(None, user)
    assert cart.user == user
    assert get_or_create_cart(None, user) == cart


def test_get_cart_for_request_without_token_does_not_create():
    assert get_cart_for_request(make_request()) is None
    assert get_cart_for_request(make_request(token="nope")) is None
    assert Cart.objects.count() == 0
    created = get_cart_for_request(make_request(), create=True)
    assert Cart.objects.count() == 1 and created.user is None


def test_guest_request_never_gets_a_user_cart(user):
    user_cart = Cart.objects.create(user=user)
    assert get_cart_for_request(make_request(token=user_cart.token)) is None


def test_get_cart_for_request_handles_missing_user_attribute():
    cart = Cart.objects.create()
    request = SimpleNamespace(META={"HTTP_X_CART_TOKEN": str(cart.token)})
    assert get_cart_for_request(request) == cart


def test_authenticated_request_merges_guest_cart(user, books):
    guest = Cart.objects.create()
    add_item(guest, books["print"], 2)
    cart = get_cart_for_request(make_request(token=guest.token, user=user))
    # The user had no cart: the guest cart is assigned to them.
    assert cart.pk == guest.pk and cart.user == user
    assert get_cart_for_request(make_request(user=user)) == cart


# --- add ----------------------------------------------------------------------------------------


def test_add_item_increments_and_clamps(books):
    cart = Cart.objects.create()
    add_item(cart, books["print"], 3)
    add_item(cart, books["print"], 4)
    assert line(cart, books["print"]).quantity == 7
    add_item(cart, books["print"], 9)  # stock 12, cap 10
    assert line(cart, books["print"]).quantity == 10
    add_item(cart, books["low"], 5)  # stock 3
    assert line(cart, books["low"]).quantity == 3


def test_add_ebook_is_always_quantity_one(books):
    cart = Cart.objects.create()
    add_item(cart, books["ebook"], 3)
    add_item(cart, books["ebook"])
    assert line(cart, books["ebook"]).quantity == 1


def test_add_item_rejects_invalid_quantity(books):
    cart = Cart.objects.create()
    for bad in (0, -1, "2", True):
        with pytest.raises(CartError) as exc:
            add_item(cart, books["print"], bad)
        assert exc.value.code == "invalid_quantity"


@pytest.mark.parametrize(
    ("key", "code"),
    [
        ("sold_out", "out_of_stock"),
        ("placeholder", "price_unavailable"),
        ("inactive_variant", "unavailable"),
        ("inactive_book", "unavailable"),
    ],
)
def test_add_item_rejects_unsellable(books, key, code):
    cart = Cart.objects.create()
    with pytest.raises(CartError) as exc:
        add_item(cart, books[key])
    assert exc.value.code == code
    assert exc.value.detail
    assert not cart.items.exists()


def test_bundle_replaces_ebook_and_blocks_it(books):
    cart = Cart.objects.create()
    add_item(cart, books["ebook"])
    add_item(cart, books["bundle"])
    assert list(cart.items.values_list("variant", flat=True)) == [books["bundle"].pk]
    with pytest.raises(CartError) as exc:
        add_item(cart, books["ebook"])
    assert exc.value.code == "already_in_bundle"


def test_mutations_touch_updated_at(books):
    cart = Cart.objects.create()
    Cart.objects.filter(pk=cart.pk).update(updated_at=timezone.now() - timedelta(days=5))
    add_item(cart, books["print"])
    cart.refresh_from_db()
    assert cart.updated_at > timezone.now() - timedelta(minutes=1)


# --- set / remove / clear -----------------------------------------------------------------------


def test_set_quantity_rules(books):
    cart = Cart.objects.create()
    item = add_item(cart, books["print"], 1)
    set_quantity(cart, item.pk, 4)
    assert line(cart, books["print"]).quantity == 4
    with pytest.raises(CartError) as exc:
        set_quantity(cart, item.pk, 11)
    assert exc.value.code == "invalid_quantity"
    low = add_item(cart, books["low"], 1)
    with pytest.raises(CartError) as exc:
        set_quantity(cart, low.pk, 4)
    assert exc.value.code == "insufficient_stock"
    ebook = add_item(cart, books["ebook"])
    with pytest.raises(CartError) as exc:
        set_quantity(cart, ebook.pk, 2)
    assert exc.value.code == "invalid_quantity"
    with pytest.raises(CartError) as exc:
        set_quantity(cart, item.pk, -1)
    assert exc.value.code == "invalid_quantity"
    assert set_quantity(cart, item.pk, 0) is None
    assert not cart.items.filter(pk=item.pk).exists()


def test_set_quantity_and_remove_unknown_item(books):
    cart = Cart.objects.create()
    other = Cart.objects.create()
    foreign = add_item(other, books["print"])
    for call in (lambda: set_quantity(cart, foreign.pk, 2), lambda: remove_item(cart, foreign.pk)):
        with pytest.raises(CartError) as exc:
            call()
        assert exc.value.code == "not_found"


def test_remove_and_clear(books):
    cart = Cart.objects.create()
    item = add_item(cart, books["print"])
    add_item(cart, books["low"])
    remove_item(cart, item.pk)
    assert cart.items.count() == 1
    token = cart.token
    clear_cart(cart)
    assert cart.items.count() == 0
    assert Cart.objects.get(pk=cart.pk).token == token


# --- bulk ---------------------------------------------------------------------------------------


def test_bulk_add_reports_skipped(books):
    cart = Cart.objects.create()
    added, skipped = bulk_add(
        cart,
        [
            {"variant_id": books["print"].pk, "quantity": 2},
            {"variant_id": books["sold_out"].pk, "quantity": 1},
            {"variant_id": 999_999, "quantity": 1},
            {"variant_id": books["low"].pk},
            {"variant_id": books["placeholder"].pk, "quantity": 1},
        ],
    )
    assert added == [books["print"].pk, books["low"].pk]
    assert [(s["variant_id"], s["code"]) for s in skipped] == [
        (books["sold_out"].pk, "out_of_stock"),
        (999_999, "not_found"),
        (books["placeholder"].pk, "price_unavailable"),
    ]
    assert all(s["detail"] for s in skipped)
    assert line(cart, books["print"]).quantity == 2


# --- summary ------------------------------------------------------------------------------------


def test_cart_summary_empty():
    data = cart_summary(None)
    assert data["token"] is None
    assert data["items"] == [] and data["item_count"] == 0 and data["subtotal"] == 0
    assert data["updated_at"] is None


def test_cart_summary_totals(books):
    StoreSettings.objects.update_or_create(pk=1, defaults={"free_shipping_threshold": 5_000_000})
    cart = Cart.objects.create()
    add_item(cart, books["print"], 2)  # 2_200_000 → 2_000_000
    add_item(cart, books["ebook"])
    data = cart_summary(cart)
    assert data["token"] == str(cart.token)
    first = data["items"][0]
    assert first["unit_price"] == 2_000_000
    assert first["line_total"] == 4_000_000
    assert first["line_saving"] == 400_000
    assert first["max_quantity"] == 10
    assert first["is_available"] and first["issue"] is None
    assert data["items"][1]["max_quantity"] == 1
    assert data["item_count"] == 3
    assert data["subtotal"] == 4_990_000
    assert data["original_subtotal"] == 5_390_000
    assert data["savings"] == 400_000
    assert data["has_physical"] is True
    assert data["has_issues"] is False
    assert data["free_shipping_threshold"] == 5_000_000
    assert data["free_shipping_remaining"] == 10_000


def test_free_shipping_remaining_null_cases(books):
    cart = Cart.objects.create()
    add_item(cart, books["ebook"])
    assert cart_summary(cart)["free_shipping_threshold"] is None  # threshold 0 → null
    StoreSettings.objects.update_or_create(pk=1, defaults={"free_shipping_threshold": 1_000_000})
    data = cart_summary(cart)
    assert data["has_physical"] is False and data["free_shipping_remaining"] is None
    add_item(cart, books["print"])
    assert cart_summary(cart)["free_shipping_remaining"] is None  # subtotal above threshold


def test_reads_flag_stock_drops_without_mutation(books):
    cart = Cart.objects.create()
    add_item(cart, books["low"], 3)
    add_item(cart, books["print"], 2)
    books["low"].stock = 1
    books["low"].save()
    books["print"].stock = 0
    books["print"].save()
    data = cart_summary(cart)
    low_line, print_line = data["items"]
    assert low_line["issue"] == "insufficient_stock" and low_line["max_quantity"] == 1
    assert print_line["issue"] == "out_of_stock" and print_line["max_quantity"] == 0
    assert data["has_issues"] is True
    assert data["subtotal"] == 0 and data["has_physical"] is False
    assert data["item_count"] == 5
    assert line(cart, books["low"]).quantity == 3  # untouched


def test_summary_flags_price_and_unavailable(books):
    cart = Cart.objects.create()
    add_item(cart, books["low"])
    books["low"].price_is_placeholder = True
    books["low"].save()
    assert cart_summary(cart)["items"][0]["issue"] == "price_unavailable"
    books["low"].is_active = False
    books["low"].save()
    assert cart_summary(cart)["items"][0]["issue"] == "unavailable"


# --- merge --------------------------------------------------------------------------------------


def test_merge_sums_clamps_and_deletes_guest(user, books):
    user_cart = Cart.objects.create(user=user)
    add_item(user_cart, books["print"], 6)
    add_item(user_cart, books["low"], 2)
    guest = Cart.objects.create()
    add_item(guest, books["print"], 7)
    add_item(guest, books["low"], 2)
    add_item(guest, books["ebook"])
    merged = merge_guest_cart(guest, user)
    assert merged.pk == user_cart.pk
    assert line(merged, books["print"]).quantity == 10
    assert line(merged, books["low"]).quantity == 3
    assert line(merged, books["ebook"]).quantity == 1
    assert not Cart.objects.filter(pk=guest.pk).exists()


def test_merge_keeps_bundle_rule(user, books):
    user_cart = Cart.objects.create(user=user)
    add_item(user_cart, books["bundle"])
    guest = Cart.objects.create()
    add_item(guest, books["ebook"])
    merge_guest_cart(guest, user)
    assert list(user_cart.items.values_list("variant", flat=True)) == [books["bundle"].pk]

    user_cart.items.all().delete()
    add_item(user_cart, books["ebook"])
    guest = Cart.objects.create()
    add_item(guest, books["bundle"])
    merge_guest_cart(guest, user)
    assert list(user_cart.items.values_list("variant", flat=True)) == [books["bundle"].pk]


def test_merge_assigns_guest_cart_when_user_has_none(user, books):
    guest = Cart.objects.create()
    add_item(guest, books["print"])
    merged = merge_guest_cart(guest, user)
    assert merged.pk == guest.pk
    assert Cart.objects.get(pk=guest.pk).user == user


def test_merge_none_and_foreign_carts(user, books):
    assert merge_guest_cart(None, user).user == user
    other = Cart.objects.create(user=type(user).objects.create_user(phone="09350000000"))
    add_item(other, books["print"])
    mine = merge_guest_cart(other, user)
    assert mine.user == user and not mine.items.exists()
    assert other.items.count() == 1


# --- purge --------------------------------------------------------------------------------------


def test_purge_stale_guest_carts(user):
    old = timezone.now() - timedelta(days=61)
    stale = Cart.objects.create()
    fresh = Cart.objects.create()
    owned = Cart.objects.create(user=user)
    Cart.objects.filter(pk__in=[stale.pk, owned.pk]).update(updated_at=old)
    assert purge_stale_carts() == 1
    assert set(Cart.objects.values_list("pk", flat=True)) == {fresh.pk, owned.pk}


def test_purge_command_and_task():
    old = timezone.now() - timedelta(days=61)
    Cart.objects.create()
    Cart.objects.update(updated_at=old)
    call_command("purge_carts")
    assert Cart.objects.count() == 0
    Cart.objects.create()
    Cart.objects.update(updated_at=timezone.now() - timedelta(days=3))
    assert purge_task.delay(2).get() == 1
    assert CartItem.objects.count() == 0
