import pytest

from apps.catalog.services.legacy_import import (
    infer_resource_type,
    jalali_label,
    legacy_path,
    old_slug,
    price_decision,
    rewrite_description,
    sales_ranks,
    stock_for,
)
from apps.catalog.services.text import sanitize_html


def test_old_slug_is_decoded_exactly():
    record = {
        "old_url": "/product/x",
        "old_url_encoded": "/product/%D8%A2%DB%8C%DB%8C%D9%86-"
        "%D8%AF%D8%A7%D8%AF%D8%B1%D8%B3%DB%8C-45370",
    }
    assert legacy_path(record) == "/product/آیین-دادرسی-45370"
    assert old_slug(record) == "آیین-دادرسی-45370"
    english = {"old_url": "/product/Essentials-of-Civil-Law", "old_url_encoded": None}
    assert old_slug(english) == "Essentials-of-Civil-Law"  # case kept
    with pytest.raises(ValueError):
        old_slug({"old_url": "/category/x", "old_url_encoded": None})


@pytest.mark.parametrize(
    ("title", "quick", "expected"),
    [
        ("1100 تست برگزیده متون فقه", False, "TESTS"),
        ("مجموعه پرسش های چهار گزینه ای حقوق جزای عمومی", False, "TESTS"),
        ("مجموعه سوالات طبقه بندی شده حقوق تجارت", False, "TESTS"),
        ("مجموعه قوانین و مقررات جامع آزمون وکالت", False, "LAWS"),
        ("قوانین خاص نموداری حقوقی و کیفری", False, "LAWS"),
        ("قانون مدنی تحریری", False, "LAWS"),
        ("قانون یار حقوق ثبت", False, "LAWS"),
        ("سریع خوان آیین دادرسی مدنی", False, "QUICK_REVIEW"),
        ("سریع‌خوان قوانین خاص جزایی", False, "QUICK_REVIEW"),
        ("هر عنوانی", True, "QUICK_REVIEW"),
        ("جزوه حقوق مدنی", False, "COURSE_NOTES"),
        ("شرح جامع حقوق مدنی", False, "TEXTBOOK"),
        ("نکته ها در قانون اساسی", False, "TEXTBOOK"),
    ],
)
def test_infer_resource_type(title, quick, expected):
    assert infer_resource_type({"title": title, "is_quick_review": quick}) == expected


def test_stock_for():
    assert stock_for({"in_stock": False, "stock": 5}) == 0
    assert stock_for({"in_stock": True, "stock": 3}) == 3
    assert stock_for({"in_stock": True, "stock": None}) == 10
    assert stock_for({"in_stock": True, "stock": 0}) == 10


def test_jalali_label():
    assert jalali_label("2026-10-02") == "۱۴۰۵/۰۷/۱۰"
    assert jalali_label(None) == ""


def _record(price, sale=None, market=None):
    return {
        "price": price,
        "sale_price": sale,
        "market_price": market,
        "market_price_source": "https://www.nashrechatredanesh.com/product/33/",
        "checked": "2026-10-02",
    }


def test_price_policy_raises_to_market_price():
    d = price_decision(_record(100_000, market=1_100_000))
    assert (d.price, d.sale_price, d.changed, d.old_price) == (1_100_000, None, True, 100_000)
    assert d.note.startswith("به‌روزشده از قیمت ناشر (nashrechatredanesh.com) ۱۴۰۵/۰۷/۱۰")
    assert "۱۰۰٬۰۰۰ تومان" in d.note


def test_price_policy_sale_price():
    # A sale price at or above the new price is dropped; a lower one is kept.
    assert price_decision(_record(250_000, sale=500_000, market=450_000)).sale_price is None
    assert price_decision(_record(250_000, sale=200_000, market=450_000)).sale_price == 200_000


@pytest.mark.parametrize("market", [None, 300_000, 500_000])
def test_price_policy_keeps_price_when_market_not_higher(market):
    d = price_decision(_record(500_000, sale=450_000, market=market))
    assert (d.price, d.sale_price, d.changed) == (500_000, 450_000, False)
    assert d.note == "قیمت سایت قبلی (dadrosebook.com) ۱۴۰۵/۰۷/۱۰"


def test_sales_ranks_in_stock_first_then_old_order():
    records = [
        {"old_url": "/product/a", "in_stock": False},
        {"old_url": "/product/b", "in_stock": True},
        {"old_url": "/product/c", "in_stock": False},
        {"old_url": "/product/d", "in_stock": True},
    ]
    assert sales_ranks(records) == {"b": 4, "d": 3, "a": 2, "c": 1}


def test_rewrite_description():
    html = (
        '<p><img src="/uploads/image/rootimage/764/a.jpg" alt="جلد"></p>'
        '<p><img src="/uploads/image/other/b.jpg"></p>'
        '<p><a target="_blank" href="https://www.hovalvakil.com/writer/1163/x">دکتر معیر</a></p>'
        '<p><a href="https://dadrosebook.com/product/%D9%81%D9%82%D9%87">فقه</a></p>'
        '<p><a href="https://www.aparat.com/v/abc">ویدیو</a></p>'
    )
    out = rewrite_description(
        html, ["https://oss.sazito.com/apiuploads/dadrose/uploads/image/rootimage/764/a.jpg"]
    )
    assert (
        'src="https://oss.sazito.com/apiuploads/dadrose/uploads/image/rootimage/764/a.jpg"' in out
    )
    assert 'src="https://dadrosebook.com/uploads/image/other/b.jpg"' in out
    assert "hovalvakil" not in out and "<p>دکتر معیر</p>" in out
    assert '<a href="/product/%D9%81%D9%82%D9%87">فقه</a>' in out
    assert 'href="https://www.aparat.com/v/abc"' in out

    clean = sanitize_html(out)
    assert '<img src="https://oss.sazito.com/' in clean and 'alt="جلد"' in clean
    assert 'href="/product/%D9%81%D9%82%D9%87"' in clean
    assert rewrite_description("") == ""


def test_sanitizer_keeps_tables_and_drops_unsafe_images():
    clean = sanitize_html(
        '<table><tr><th colspan="2" style="x">a</th><td onclick="x()">b</td></tr></table>'
        '<img src="javascript:alert(1)"><iframe src="https://x"></iframe>'
    )
    assert '<th colspan="2">a</th>' in clean and "<td>b</td>" in clean
    assert "javascript" not in clean and "iframe" not in clean
