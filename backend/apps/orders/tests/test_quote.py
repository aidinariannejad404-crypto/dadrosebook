from apps.orders.models import DiscountCode
from apps.orders.services.quote import build_quote


def test_reprices_and_merges(books, methods):
    q = build_quote(
        [
            {"variant_id": books["civil_print"].pk, "quantity": 1, "price": 1},
            {"variant_id": books["civil_print"].pk, "quantity": 2},
            {"variant_id": books["civil_ebook"].pk, "quantity": 5},
        ]
    )
    assert len(q["lines"]) == 2
    p, e = q["lines"]
    assert p["quantity"] == 3 and p["unit_price"] == 2_000_000 and p["list_price"] == 2_200_000
    assert p["line_total"] == 6_000_000 and p["available_quantity"] == 12
    assert p["variant_type_label"] == "نسخه چاپی"
    assert p["subject_color"] == "#1F4E8C"  # first subject by order, not insertion
    assert e["quantity"] == 1 and e["available_quantity"] is None
    assert q["items_total"] == 6_990_000
    assert q["needs_shipping"] and q["ebook_now"]
    assert q["shipping"] is None and q["shipping_total"] == 0
    assert q["total"] == 6_990_000
    assert q["problems"] == []
    assert q["free_shipping_remaining"] is None


def test_title_with_subtitle(books):
    q = build_quote([{"variant_id": books["commerce_print"].pk, "quantity": 1}])
    assert q["lines"][0]["title"] == "درسنامه تجارت — ویرایش ۱۴۰۵"


def test_quantity_clamped(books):
    q = build_quote([{"variant_id": books["civil_print"].pk, "quantity": 15}] * 2)
    assert q["lines"][0]["quantity"] == 20


def test_ebook_only(books, methods):
    q = build_quote(
        [{"variant_id": books["civil_ebook"].pk, "quantity": 1}],
        shipping_method_id=methods["post"].pk,
        province="تهران",
    )
    assert not q["needs_shipping"] and q["ebook_now"]
    assert q["shipping"] is None and q["free_shipping_remaining"] is None


def test_shipping_and_discount(books, methods, address):
    DiscountCode.objects.create(code="OFF", kind=DiscountCode.Kind.FIXED, value=100_000)
    q = build_quote(
        [{"variant_id": books["commerce_print"].pk, "quantity": 1}],
        address=address,
        shipping_method_id=methods["courier"].pk,
        discount_code="off",
    )
    assert q["shipping"]["code"] == "courier" and q["shipping_total"] == 65000
    assert q["discount"] == {"code": "OFF", "amount": 100_000, "label": "۱۰۰٬۰۰۰ تومان تخفیف"}
    assert q["total"] == 1_000_000 - 100_000 + 65000
    assert q["ebook_now"] is False


def test_courier_rejected_outside_tehran(books, methods, shiraz_address):
    q = build_quote(
        [{"variant_id": books["commerce_print"].pk, "quantity": 1}],
        address=shiraz_address,
        shipping_method_id=methods["courier"].pk,
    )
    assert q["shipping"] is None


def test_discount_error_does_not_fail(books):
    q = build_quote([{"variant_id": books["civil_ebook"].pk}], discount_code="NOPE")
    assert q["discount"] is None
    assert q["discount_error"] == "کد تخفیف معتبر نیست."
    assert q["total"] == 990_000


def test_problems(books):
    from apps.catalog.models import BookVariant

    BookVariant.objects.filter(pk=books["commerce_ebook"].pk).update(is_active=False)
    BookVariant.objects.filter(pk=books["civil_ebook"].pk).update(price_is_placeholder=True)
    BookVariant.objects.filter(pk=books["civil_bundle"].pk).update(stock=0)
    q = build_quote(
        [
            {"variant_id": books["commerce_ebook"].pk},
            {"variant_id": books["civil_ebook"].pk},
            {"variant_id": books["civil_bundle"].pk},
            {"variant_id": books["commerce_print"].pk, "quantity": 5},
            {"variant_id": 999_999},
        ]
    )
    codes = {p["variant_id"]: p["code"] for p in q["problems"]}
    assert codes == {
        books["commerce_ebook"].pk: "inactive",
        books["civil_ebook"].pk: "placeholder_price",
        books["civil_bundle"].pk: "out_of_stock",
        books["commerce_print"].pk: "insufficient_stock",
        999_999: "inactive",
    }
    insufficient = next(p for p in q["problems"] if p["code"] == "insufficient_stock")
    assert insufficient["message"] == "فقط ۳ عدد از این کالا موجود است."


def test_inactive_book(books):
    books["commerce_book"].is_active = False
    books["commerce_book"].save()
    q = build_quote([{"variant_id": books["commerce_ebook"].pk}])
    assert q["problems"][0]["code"] == "inactive"


def test_quote_endpoint_anonymous(api, books, methods):
    res = api.post(
        "/api/v1/checkout/quote/",
        {
            "items": [{"variant_id": books["civil_print"].pk, "quantity": 1}],
            "province": "تهران",
            "shipping_method_id": methods["courier"].pk,
        },
        format="json",
    )
    assert res.status_code == 200, res.content
    body = res.json()
    assert body["shipping"]["code"] == "courier"
    assert set(body) == {
        "lines",
        "items_total",
        "discount",
        "discount_error",
        "needs_shipping",
        "shipping",
        "shipping_total",
        "total",
        "free_shipping_remaining",
        "ebook_now",
        "problems",
    }


def test_quote_endpoint_validation(api):
    res = api.post("/api/v1/checkout/quote/", {"items": []}, format="json")
    assert res.status_code == 400
    assert "items" in res.json()
    res = api.post(
        "/api/v1/checkout/quote/", {"items": [{"variant_id": 1, "quantity": 21}]}, format="json"
    )
    assert res.status_code == 400
