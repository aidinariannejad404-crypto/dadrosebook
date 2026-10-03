from urllib.parse import quote

import pytest

from apps.seo.services.keys import clean_path, decode_path, redirect_key

PRODUCT = "/product/آیین-دادرسی-مدنی"


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("/", "/"),
        ("", "/"),
        ("//", "/"),
        (PRODUCT, PRODUCT),
        # URL-encoded Persian, upper- and lowercase hex
        (quote(PRODUCT), PRODUCT),
        (quote(PRODUCT).lower(), PRODUCT),
        # double and triple encoding
        (quote(quote(PRODUCT)), PRODUCT),
        (quote(quote(quote(PRODUCT))), PRODUCT),
        # Arabic yeh / kaf / alef maksura
        ("/product/آيين-دادرسي-مدني", PRODUCT),
        ("/category/كتاب", "/category/کتاب"),
        ("/category/حقوق-مدنى", "/category/حقوق-مدنی"),
        # trailing slash, query string, fragment
        (PRODUCT + "/", PRODUCT),
        (PRODUCT + "?utm_source=x&page=2", PRODUCT),
        (PRODUCT + "/?a=1#top", PRODUCT),
        (quote(PRODUCT) + "%3Fa%3D1", PRODUCT + "?a=1"),  # an encoded "?" is part of the path
        # repeated slashes
        ("//product///" + PRODUCT[len("/product/") :], PRODUCT),
        # ASCII lowercased, spaces and ZWNJ → "-"
        ("/Page/About-Us", "/page/about-us"),
        ("/product/سریع خوان", "/product/سریع-خوان"),
        ("/product/سریع‌خوان", "/product/سریع-خوان"),
        ("/product/سریع%20خوان", "/product/سریع-خوان"),
        # digits and other letters are kept as they are
        ("/product/۱۱۰۰-تست", "/product/۱۱۰۰-تست"),
        ("/product/1100-تست", "/product/1100-تست"),
        ("/product/Essentials-of-Civil-Law", "/product/essentials-of-civil-law"),
    ],
)
def test_redirect_key(path, expected):
    assert redirect_key(path) == expected


def test_redirect_key_is_idempotent():
    for path in (PRODUCT, quote(PRODUCT) + "/", "/Page//About-Us/?x=1"):
        assert redirect_key(redirect_key(path)) == redirect_key(path)


def test_decode_stops_after_three_rounds():
    four_times = quote(quote(quote(quote("/ا"))))
    assert decode_path(four_times) == quote("/ا")


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("https://dadrosebook.com" + quote(PRODUCT) + "?x=1", PRODUCT),
        ("http://www.dadrosebook.com/products", "/products"),
        ("  /products  ", "/products"),
        ("products", "/products"),
        ("https://dadrosebook.com", "/"),
        ("/product/آيين", "/product/آيين"),  # stored as typed; only the key is normalised
    ],
)
def test_clean_path(value, expected):
    assert clean_path(value) == expected
