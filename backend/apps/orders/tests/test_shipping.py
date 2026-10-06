from apps.orders.models import ShippingMethod
from apps.orders.services import shipping


def test_seeded_methods(methods):
    assert methods["post"].base_price == 45000
    assert methods["post"].eta_note == "۳ تا ۵ روز کاری"
    assert methods["courier"].tehran_only


def test_tehran_only_filtered(methods):
    assert [o["code"] for o in shipping.options_for("تهران", 0)] == ["post", "courier"]
    assert [o["code"] for o in shipping.options_for("فارس", 0)] == ["post"]
    assert [o["code"] for o in shipping.options_for(None, 0)] == ["post"]


def test_inactive_hidden(methods):
    methods["courier"].is_active = False
    methods["courier"].save()
    assert [o["code"] for o in shipping.options_for("تهران", 0)] == ["post"]


def test_no_threshold_never_free(methods):
    option = shipping.options_for("فارس", 10_000_000)[0]
    assert option["price"] == 45000
    assert option["is_free"] is False
    assert option["free_over"] is None
    assert shipping.free_shipping_remaining(100) is None


def test_store_threshold(methods, no_free_shipping):
    no_free_shipping.free_shipping_threshold = 1_500_000
    no_free_shipping.save()
    below = shipping.options_for("فارس", 1_499_999)[0]
    assert below["price"] == 45000 and below["free_over"] == 1_500_000
    at = shipping.options_for("فارس", 1_500_000)[0]
    assert at["price"] == 0 and at["is_free"] is True and at["base_price"] == 45000
    assert shipping.free_shipping_remaining(1_000_000, province="فارس") == 500_000
    assert shipping.free_shipping_remaining(2_000_000, province="فارس") == 0


def test_method_free_over_wins(methods, no_free_shipping):
    no_free_shipping.free_shipping_threshold = 1_500_000
    no_free_shipping.save()
    post = methods["post"]
    post.free_over = 3_000_000
    post.save()
    assert shipping.price_for(post, 2_000_000) == 45000
    assert shipping.price_for(post, 3_000_000) == 0
    post.free_over = 0
    post.save()
    assert shipping.price_for(post, 0) == 0
    assert shipping.free_shipping_remaining(0, post) == 0


def test_is_allowed(methods):
    assert shipping.is_allowed(methods["courier"], "تهران")
    assert not shipping.is_allowed(methods["courier"], "فارس")
    assert shipping.is_allowed(methods["post"], None)
    assert not shipping.is_allowed(ShippingMethod(is_active=False), "تهران")


def test_shipping_methods_endpoint(api, methods):
    res = api.get("/api/v1/shipping-methods/", {"province": "تهران", "subtotal": "۱۰۰۰"})
    assert res.status_code == 200
    body = res.json()
    assert [o["code"] for o in body] == ["post", "courier"]
    assert set(body[0]) == {
        "id",
        "code",
        "name",
        "description",
        "eta_note",
        "price",
        "base_price",
        "is_free",
        "free_over",
        "tehran_only",
        "delivery_estimate",  # د۲
        "exam_clash",  # د۲
    }
