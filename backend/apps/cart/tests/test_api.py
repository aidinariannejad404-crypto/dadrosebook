import uuid

import pytest

from apps.cart.models import Cart

pytestmark = pytest.mark.django_db

CART = "/api/v1/cart/"
ITEMS = "/api/v1/cart/items/"
BULK = "/api/v1/cart/items/bulk/"

CART_KEYS = {
    "token",
    "items",
    "item_count",
    "subtotal",
    "original_subtotal",
    "savings",
    "has_physical",
    "has_issues",
    "free_shipping_threshold",
    "free_shipping_remaining",
    "updated_at",
}
ITEM_KEYS = {
    "id",
    "variant",
    "book",
    "quantity",
    "max_quantity",
    "unit_price",
    "line_total",
    "line_saving",
    "is_available",
    "issue",
}


def headers(token):
    return {"HTTP_X_CART_TOKEN": token} if token else {}


def test_get_without_token_returns_empty_cart_and_creates_nothing(api):
    response = api.get(CART)
    assert response.status_code == 200
    assert response["Cache-Control"] == "no-store"
    assert set(response.json()) == CART_KEYS
    assert response.json()["token"] is None
    assert response.json()["items"] == []
    assert api.get(CART, **headers(str(uuid.uuid4()))).json()["token"] is None
    assert Cart.objects.count() == 0


def test_add_creates_cart_and_returns_token(api, books):
    response = api.post(ITEMS, {"variant_id": books["print"].pk, "quantity": 2}, format="json")
    assert response.status_code == 201
    assert response["Cache-Control"] == "no-store"
    data = response.json()
    token = data["token"]
    assert Cart.objects.get().token == uuid.UUID(token)
    item = data["items"][0]
    assert set(item) == ITEM_KEYS
    assert item["quantity"] == 2
    assert item["variant"]["id"] == books["print"].pk
    assert item["variant"]["type"] == "PRINT"
    assert set(item["book"]) == {"id", "title", "slug", "cover", "subjects", "authors"}

    # Same token → same cart; default quantity 1.
    again = api.post(ITEMS, {"variant_id": books["print"].pk}, format="json", **headers(token))
    assert again.json()["token"] == token
    assert again.json()["items"][0]["quantity"] == 3
    assert api.get(CART, **headers(token)).json()["item_count"] == 3


def test_unknown_token_on_mutation_creates_new_cart(api, books):
    response = api.post(
        ITEMS, {"variant_id": books["print"].pk}, format="json", **headers("garbage")
    )
    assert response.status_code == 201
    assert response.json()["token"] != "garbage"


def test_add_errors_have_cart_error_shape(api, books):
    response = api.post(ITEMS, {"variant_id": books["sold_out"].pk}, format="json")
    assert response.status_code == 400
    body = response.json()
    assert set(body) == {"code", "detail", "cart"}
    assert body["code"] == "out_of_stock"
    assert body["cart"]["token"]

    token = body["cart"]["token"]
    bad_qty = api.post(
        ITEMS, {"variant_id": books["print"].pk, "quantity": "x"}, format="json", **headers(token)
    )
    assert bad_qty.status_code == 400 and bad_qty.json()["code"] == "invalid_quantity"
    unknown = api.post(ITEMS, {"variant_id": 999_999}, format="json", **headers(token))
    assert unknown.status_code == 400 and unknown.json()["code"] == "not_found"


def test_bundle_api_flow(api, books):
    token = api.post(ITEMS, {"variant_id": books["ebook"].pk}, format="json").json()["token"]
    data = api.post(
        ITEMS, {"variant_id": books["bundle"].pk}, format="json", **headers(token)
    ).json()
    assert [i["variant"]["type"] for i in data["items"]] == ["BUNDLE"]
    assert "bundle_saving" in data["items"][0]["variant"]
    response = api.post(ITEMS, {"variant_id": books["ebook"].pk}, format="json", **headers(token))
    assert response.status_code == 400
    assert response.json()["code"] == "already_in_bundle"


def test_patch_and_delete_item(api, books):
    data = api.post(ITEMS, {"variant_id": books["print"].pk}, format="json").json()
    token, item_id = data["token"], data["items"][0]["id"]
    url = f"{ITEMS}{item_id}/"
    response = api.patch(url, {"quantity": 4}, format="json", **headers(token))
    assert response.status_code == 200
    assert response["Cache-Control"] == "no-store"
    assert response.json()["items"][0]["quantity"] == 4
    too_many = api.patch(url, {"quantity": 50}, format="json", **headers(token))
    assert too_many.status_code == 400 and too_many.json()["code"] == "invalid_quantity"
    assert too_many.json()["cart"]["items"][0]["quantity"] == 4
    assert api.patch(url, {"quantity": 0}, format="json", **headers(token)).json()["items"] == []
    missing = api.delete(url, **headers(token))
    assert missing.status_code == 404 and missing.json()["code"] == "not_found"

    data = api.post(ITEMS, {"variant_id": books["low"].pk}, format="json", **headers(token)).json()
    url = f"{ITEMS}{data['items'][0]['id']}/"
    response = api.delete(url, **headers(token))
    assert response.status_code == 200 and response.json()["items"] == []


def test_bulk_endpoint(api, books):
    response = api.post(
        BULK,
        {
            "items": [
                {"variant_id": books["print"].pk, "quantity": 1},
                {"variant_id": books["sold_out"].pk, "quantity": 1},
                {"variant_id": "x"},
            ],
            "source": "kit",
        },
        format="json",
    )
    assert response.status_code == 200
    assert response["Cache-Control"] == "no-store"
    body = response.json()
    assert set(body) == {"cart", "added", "skipped"}
    assert body["added"] == [books["print"].pk]
    assert [s["code"] for s in body["skipped"]] == ["out_of_stock", "not_found"]
    assert body["cart"]["token"]


def test_bulk_rejects_more_than_fifty(api, books):
    items = [{"variant_id": books["print"].pk}] * 51
    assert api.post(BULK, {"items": items}, format="json").status_code == 400


def test_delete_cart_keeps_token(api, books):
    token = api.post(ITEMS, {"variant_id": books["print"].pk}, format="json").json()["token"]
    response = api.delete(CART, **headers(token))
    assert response.status_code == 200
    assert response.json()["token"] == token and response.json()["items"] == []


def test_cors_allows_cart_token_header(api):
    response = api.options(
        CART,
        HTTP_ORIGIN="http://localhost:3000",
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS="x-cart-token",
    )
    assert "x-cart-token" in response["Access-Control-Allow-Headers"]
