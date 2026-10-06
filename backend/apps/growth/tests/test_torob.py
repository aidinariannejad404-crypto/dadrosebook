import base64
import json
import time

import pytest
from django.urls import reverse

from apps.catalog.models import BookVariant
from apps.catalog.tests.conftest import ebook_variant, make_book, print_variant
from apps.growth.services import ed25519, torob

SECRET = bytes(range(32))
PUBLIC = ed25519.public_key(SECRET)
URL = "/api/v1/growth/torob/v3/products/"


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def make_token(claims: dict, *, secret=SECRET, alg="EdDSA") -> str:
    header = b64url(json.dumps({"alg": alg, "typ": "JWT"}).encode())
    payload = b64url(json.dumps(claims).encode())
    signing_input = f"{header}.{payload}".encode()
    return f"{header}.{payload}.{b64url(ed25519.sign(secret, signing_input))}"


def pem(raw: bytes) -> str:
    der = bytes.fromhex("302a300506032b6570032100") + raw
    return (
        "-----BEGIN PUBLIC KEY-----\n"
        + base64.b64encode(der).decode()
        + "\n-----END PUBLIC KEY-----"
    )


@pytest.fixture
def keyed(settings):
    settings.TOROB_PUBLIC_KEY = pem(PUBLIC)
    settings.TOROB_JWT_AUDIENCE = "dadrosebook.com"
    return settings


def good_token(**extra):
    return make_token({"aud": "dadrosebook.com", "exp": int(time.time()) + 300, **extra})


# --- JWT --------------------------------------------------------------------------------------


@pytest.mark.parametrize("fmt", ["pem", "hex", "b64"])
def test_public_key_formats(fmt):
    value = {"pem": pem(PUBLIC), "hex": PUBLIC.hex(), "b64": base64.b64encode(PUBLIC).decode()}[fmt]
    assert torob.parse_public_key(value) == PUBLIC


def test_verify_token_ok(keyed):
    claims = torob.verify_token(good_token(sub="torob"))
    assert claims["sub"] == "torob"


@pytest.mark.parametrize(
    "token",
    [
        None,
        "not-a-jwt",
        "a.b.c",
        "expired",
        "wrong_aud",
        "wrong_key",
        "wrong_alg",
        "not_yet",
    ],
)
def test_verify_token_rejects(keyed, token):
    now = int(time.time())
    tokens = {
        "expired": make_token({"aud": "dadrosebook.com", "exp": now - 3600}),
        "wrong_aud": make_token({"aud": "evil.example", "exp": now + 300}),
        "wrong_key": make_token({"aud": "dadrosebook.com", "exp": now + 300}, secret=bytes(32)),
        "wrong_alg": make_token({"aud": "dadrosebook.com", "exp": now + 300}, alg="HS256"),
        "not_yet": make_token({"aud": "dadrosebook.com", "exp": now + 9000, "nbf": now + 3600}),
    }
    with pytest.raises(torob.TorobAuthError):
        torob.verify_token(tokens.get(token, token))


def test_tampered_payload_rejected(keyed):
    header, _, sig = good_token().split(".")
    forged = b64url(json.dumps({"aud": "dadrosebook.com", "exp": 9999999999}).encode())
    with pytest.raises(torob.TorobAuthError):
        torob.verify_token(f"{header}.{forged}.{sig}")


@pytest.mark.django_db
def test_endpoint_requires_token(api, keyed):
    assert api.post(URL, {}, format="json").status_code == 403
    res = api.post(URL, {}, format="json", HTTP_X_TOROB_TOKEN=good_token())
    assert res.status_code == 200
    assert res.json()["api_version"] == "torob_api_v3"


@pytest.mark.django_db
def test_no_key_is_closed_in_production_and_open_in_debug(api, settings):
    settings.TOROB_PUBLIC_KEY = ""
    settings.DEBUG = False
    assert api.post(URL, {}, format="json").status_code == 403
    settings.DEBUG = True
    assert api.post(URL, {}, format="json").status_code == 200


def test_url_resolves_under_growth():
    assert reverse("torob-products") == URL


# --- rows, availability, pagination -------------------------------------------------------------


@pytest.fixture
def open_api(api, settings):
    settings.TOROB_PUBLIC_KEY = ""
    settings.DEBUG = True
    return api


def test_availability_mapping(db):
    book = make_book(
        "آیین دادرسی",
        variants=[print_variant(500_000, 0), ebook_variant(200_000)],
    )
    printed = book.variants.get(type="PRINT")
    ebook = book.variants.get(type="EBOOK")
    assert torob.availability(printed) == torob.OUTOFSTOCK  # no stock
    assert torob.availability(ebook) == torob.INSTOCK  # ebooks are always in stock
    printed.stock = 3
    assert torob.availability(printed) == torob.INSTOCK
    printed.is_active = False
    assert torob.availability(printed) == torob.OUTOFSTOCK
    ebook.price_is_placeholder = True
    assert torob.availability(ebook) == torob.OUTOFSTOCK
    book.is_active = False
    ebook.price_is_placeholder = False
    assert torob.availability(ebook) == torob.OUTOFSTOCK


def test_row_fields_and_price_units(db, settings):
    book = make_book(
        "حقوق مدنی",
        subtitle="جلد اول",
        isbn="9786000000000",
        variants=[print_variant(1_000_000, 5, sale_price=900_000)],
    )
    variant = book.variants.get()
    row = torob.product_row(variant)
    assert row["page_unique"] == str(variant.pk)
    assert row["page_url"].startswith("https://dadrosebook.com/product/")
    assert row["title"] == "حقوق مدنی (نسخه چاپی)"
    assert row["subtitle"] == "جلد اول"
    assert (row["current_price"], row["old_price"]) == (900_000, 1_000_000)
    assert row["availability"] == "instock"
    assert row["spec"]["شابک"] == "9786000000000"
    settings.TOROB_PRICE_UNIT = "rial"
    row = torob.product_row(variant)
    assert (row["current_price"], row["old_price"]) == (9_000_000, 10_000_000)


def test_no_old_price_without_discount(db):
    book = make_book("الف", variants=[print_variant(100_000, 1)])
    assert torob.product_row(book.variants.get())["old_price"] is None


def test_pagination(db, open_api, monkeypatch):
    monkeypatch.setattr(torob, "PAGE_SIZE", 3)
    for i in range(4):
        make_book(f"کتاب {i}", variants=[print_variant(100_000 + i, 2), ebook_variant(50_000)])
    make_book("قیمت موقت", variants=[ebook_variant(1, price_is_placeholder=True)])
    make_book("غیرفعال", is_active=False, variants=[ebook_variant(1)])
    first = open_api.post(URL, {"page": 1}, format="json").json()
    assert first["max_pages"] == 3  # 8 listed variants / 3
    assert first["current_page"] == 1
    assert len(first["products"]) == 3
    last = open_api.post(URL, {"page": 3}, format="json").json()
    assert len(last["products"]) == 2
    beyond = open_api.post(URL, {"page": 9}, format="json").json()
    assert beyond["products"] == []
    seen = [
        p["page_unique"]
        for page in (1, 2, 3)
        for p in open_api.post(URL, {"page": page}, format="json").json()["products"]
    ]
    assert len(seen) == len(set(seen)) == 8


def test_lookup_by_urls_and_uniques(db, open_api):
    book = make_book("قانون تجارت", variants=[print_variant(100_000, 2), ebook_variant(50_000)])
    other = make_book("دیگر", variants=[print_variant(10_000, 0)])
    hidden = other.variants.get()
    hidden.is_active = False
    hidden.save()
    url = torob.product_url(book)
    res = open_api.post(
        URL,
        {
            "page_urls": [url + "/?utm_source=torob"],
            "page_uniques": [str(hidden.pk), "999999", "x"],
        },
        format="json",
    ).json()
    uniques = {p["page_unique"]: p for p in res["products"]}
    assert set(uniques) == {str(v.pk) for v in book.variants.all()} | {str(hidden.pk)}
    assert uniques[str(hidden.pk)]["availability"] == "outofstock"
    assert (res["current_page"], res["max_pages"]) == (1, 1)


def test_slug_from_url():
    assert torob.slug_from_url("https://x.ir/product/%D8%A7%D9%84%D9%81/") == "الف"
    assert torob.slug_from_url("/product/abc?x=1") == "abc"
    assert torob.slug_from_url("https://x.ir/category/abc") is None


def test_emalls_feeds(db, api):
    make_book("کتاب", variants=[print_variant(100_000, 2)])
    data = api.get("/api/v1/growth/feeds/emalls.json").json()
    assert data["count"] == 1
    assert data["products"][0]["is_available"] is True
    xml = api.get("/api/v1/growth/feeds/emalls.xml")
    assert xml["Content-Type"].startswith("application/xml")
    assert "<is_available>true</is_available>" in xml.content.decode()
    assert BookVariant.objects.count() == 1
