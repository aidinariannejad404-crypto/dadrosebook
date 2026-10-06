"""Display clean-up of imported (Sazito) descriptions — samples taken from seed_catalogue.json."""

import json
import re
from pathlib import Path
from urllib.parse import quote

import pytest

from apps.catalog.services.description import clean_description

from .conftest import make_book, print_variant

SEED = Path(__file__).resolve().parents[1] / "seed_catalogue.json"

# «صفر تا صد متون فقه»: spec list first, relative /uploads images, «·» bullets, empty paragraphs.
SAZITO_LIST = (
    "<ul><li><p>ناشر : <span>پیام غدیر</span></p></li><li><p><span>سال انتشار : 1404</span></p>"
    "</li><li><p><span>نوع کتاب : آزمونی</span></p></li><li><p><span>قطع : وزیری</span></p></li>"
    "<li><p><span>تعداد صفحات : 574</span><br><br>صفر تا صد متون فقه</p></li></ul>"
    "<p>تالیف استاد محسن سینجلی</p><p></p>"
    "<h2>معرفی و ویژگی‌های کتاب</h2><p>کتاب با <b>زبانی روان</b> نوشته شده است.</p>"
    '<p style="text-align: center"><img src="/uploads/image/rootimage/764/c4ca.jpg" '
    'alt="کتاب صفر تا صد متون فقه استاد محسن سینجلی"></p>'
    "<p>·        ارائه متن‌ها با نثر روان فارسی</p><p>·        برجسته‌سازی نکات مهم</p><p></p>"
)

# «متون فقه ماندگار»: «مشخصات کتاب …» heading over the list, an embedded Aparat player.
SAZITO_HEADED = (
    "<h2>مشخصات کتاب متون فقه ماندگار</h2><ul><li><p>ناشر : نی‌آرا</p></li>"
    "<li><p>نوبت چاپ : اول</p></li><li><p>نوع جلد : شومیز</p></li><li><p>قطع : وزیری</p></li>"
    "<li><p>تعداد صفحات : 310</p></li><li><p>مولف : بهزاد رئیسی نافچی</p><p></p></li></ul>"
    '<p>تدریس رایگان استاد را <a target="_blank" rel="follow" href="https://www.aparat.com/v/x">'
    "مشاهده</a> کنید.</p>"
    '<div class="iframe-wrapper"><iframe src="https://www.aparat.com/video/embed/x"></iframe></div>'
    "<p><br></p><h2>مطالعه متون فقه ماندگار چه اهمیتی دارد؟</h2><p>متن اصلی.</p>"
)

# «نکته و تست کیفری ماندگار»: the specs as a two-column table.
SAZITO_TABLE = (
    '<table style="min-width: 50px"><colgroup><col><col></colgroup><tbody>'
    "<tr><th><p>مولف :</p></th><td><p>علیرضا عبدالملکی</p></td></tr>"
    "<tr><th><p>ناشر :</p></th><td><p>تی آرا</p></td></tr>"
    "<tr><th><p>سال انتشار :</p></th><td><p>1403</p></td></tr></tbody></table>"
    "<h2>نکته وتست کیفری ماندگار</h2><p>منبع تستی ویژه داوطلبین آزمون وکالت.</p>"
)


def test_drops_broken_images_and_keeps_formatting():
    html = clean_description(SAZITO_LIST)
    assert "<img" not in html
    assert "/uploads/" not in html
    assert "سینجلی</p>" in html  # the authored line stays
    assert "<h2>معرفی و ویژگی‌های کتاب</h2>" in html
    assert "<b>زبانی روان</b>" in html


def test_drops_the_duplicated_spec_list():
    html = clean_description(SAZITO_LIST)
    assert "ناشر" not in html
    assert "تعداد صفحات" not in html
    assert html.startswith("<p>تالیف استاد محسن سینجلی</p>")


def test_drops_spec_heading_and_players():
    html = clean_description(SAZITO_HEADED)
    assert "مشخصات" not in html
    assert "نوبت چاپ" not in html
    assert "<iframe" not in html
    assert "iframe-wrapper" not in html
    assert html.startswith("<p>تدریس رایگان")
    assert "<h2>مطالعه متون فقه ماندگار چه اهمیتی دارد؟</h2>" in html


def test_links_keep_href_only_with_safe_rel():
    html = clean_description(SAZITO_HEADED)
    assert 'href="https://www.aparat.com/v/x"' in html
    assert 'rel="noopener noreferrer"' in html
    assert "target=" not in html
    assert "follow" not in html


def test_drops_spec_table_but_keeps_content_tables():
    html = clean_description(SAZITO_TABLE)
    assert "<table" not in html
    assert "عبدالملکی" not in html
    assert html.startswith("<h2>نکته وتست کیفری ماندگار</h2>")

    toc = (
        "<table><tbody><tr><td><p><strong>بخش</strong></p></td><td><p>عنوان</p></td></tr>"
        "<tr><td><p>1</p></td><td><p>کلیات</p></td></tr></tbody></table>"
    )
    assert "<table>" in clean_description(toc)
    assert "کلیات" in clean_description(toc)


def test_bullet_paragraphs_become_a_list_and_empties_go():
    html = clean_description(SAZITO_LIST)
    assert "<ul><li>ارائه متن‌ها با نثر روان فارسی</li><li>برجسته‌سازی نکات مهم</li></ul>" in html
    assert "·" not in html
    assert "<p></p>" not in html
    assert not re.search(r"<p>\s*(<br>)*\s*</p>", html)


def test_loose_spec_lines_and_long_sentences():
    html = clean_description("<p>سال چاپ: 1401</p><p>ناشر: سمت</p><p>متن معرفی کتاب.</p>")
    assert html == "<p>متن معرفی کتاب.</p>"
    sentence = (
        "<p>ناشر: این کتاب را با دقت فراوان و پس از بررسی همه آرای وحدت رویه منتشر کرده است.</p>"
    )
    assert clean_description(sentence) == sentence


def test_scripts_are_removed_with_their_content():
    html = clean_description('<p>متن</p><script>alert("x")</script><style>p{}</style>')
    assert html == "<p>متن</p>"


def test_empty_input():
    assert clean_description("") == ""
    assert clean_description(None) == ""
    assert clean_description("<p></p><p><br></p>") == ""


def test_whole_seed_catalogue_is_clean():
    books = json.loads(SEED.read_text(encoding="utf-8"))
    raw = [b["description_html"] for b in books if b.get("description_html")]
    assert sum("<img" in d for d in raw) > 10  # the samples really are dirty
    for desc in raw:
        html = clean_description(desc)
        assert "<img" not in html
        assert "<iframe" not in html
        assert "<p></p>" not in html
        assert not re.search(r"<li>\s*ناشر\s*:", html)
        # idempotent
        assert clean_description(html) == html


@pytest.mark.django_db
def test_book_detail_api_returns_the_clean_description(api):
    book = make_book("صفر تا صد متون فقه", variants=[print_variant(100_000)])
    book.description = SAZITO_LIST
    book.save()
    res = api.get(f"/api/v1/catalog/books/{quote(book.slug)}/")
    assert res.status_code == 200
    desc = res.json()["description"]
    assert "<img" not in desc
    assert "ناشر" not in desc
    assert "<ul><li>ارائه متن‌ها" in desc
