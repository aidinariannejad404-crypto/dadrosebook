from urllib.parse import quote

import pytest
from django.urls import reverse

from apps.accounts.models import User
from apps.catalog.models import Book, ExamEvent

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client(client):
    user = User.objects.create_superuser("09120000000", "admin-pass")
    client.force_login(user)
    return client


@pytest.mark.parametrize(
    "name",
    [
        "catalog_book", "catalog_bookvariant", "catalog_subject", "catalog_examtype",
        "catalog_examevent", "catalog_category", "catalog_person", "catalog_publisher",
        "catalog_studykitrecommendation", "catalog_relatedcourse", "catalog_subjectcoursediscount",
        "content_banner",
        "content_guidevideo", "accounts_user",
    ],
)  # fmt: skip
def test_admin_changelists_and_add(admin_client, catalog, name):
    assert admin_client.get(reverse(f"admin:{name}_changelist")).status_code == 200
    assert admin_client.get(reverse(f"admin:{name}_add")).status_code == 200


def test_admin_is_rtl_with_vazirmatn(admin_client, client):
    html = admin_client.get(reverse("admin:index")).content.decode()
    assert 'dir="rtl"' in html
    assert "admin_theme/admin.css" in html
    assert "admin_theme/unfold-rtl.css" in html
    assert "پنل مدیریت دادرُز" in html
    for label in ("کاتالوگ", "محتوای صفحه اصلی", "کاربران"):
        assert label in html
    admin_client.logout()
    login = admin_client.get(reverse("admin:login")).content.decode()
    assert '<html lang="fa" dir="rtl"' in login
    assert "admin_theme/admin.css" in login


def test_book_change_page_and_search(admin_client, catalog):
    book = catalog["civil_book"]
    response = admin_client.get(reverse("admin:catalog_book_change", args=[book.pk]))
    assert response.status_code == 200
    response = admin_client.get(reverse("admin:catalog_book_changelist") + "?q=" + quote("شكري"))
    assert "حقوق مدنی دوجلدی" in response.content.decode()
    assert "۹۹۰٬۰۰۰ تومان" in response.content.decode()  # min price column


def test_exam_event_admin_accepts_jalali(admin_client, catalog):
    url = reverse("admin:catalog_examevent_add")
    response = admin_client.post(
        url,
        {
            "name": "آزمون مرکز وکلا ۱۴۰۵",
            "exam_type": catalog["markaz"].pk,
            "date": "۱۴۰۵/۰۹/۲۰",
            "is_active": "on",
        },
    )
    assert response.status_code == 302, response.content.decode()[:2000]
    event = ExamEvent.objects.get(name="آزمون مرکز وکلا ۱۴۰۵")
    assert str(event.date) == "2026-12-11"
    listing = admin_client.get(reverse("admin:catalog_examevent_changelist")).content.decode()
    assert "۱۴۰۵/۰۹/۲۰" in listing


def test_book_created_in_admin_gets_search_text(admin_client, catalog):
    url = reverse("admin:catalog_book_add")
    data = {
        "title": "کتاب تازه",
        "subtitle": "",
        "slug": "",
        "authors": [catalog["shokri"].pk],
        "subjects": [catalog["civil"].pk],
        "resource_type": "TEXTBOOK",
        "volumes": 1,
        "sales_count": 0,
        "season_sales_count": 0,
        "is_active": "on",
        "description": "<p>متن</p><script>x</script>",
        "variants-TOTAL_FORMS": 1,
        "variants-INITIAL_FORMS": 0,
        "variants-0-type": "PRINT",
        "variants-0-price": 100000,
        "variants-0-stock": 3,
        "variants-0-is_active": "on",
        "sample_pages-TOTAL_FORMS": 0,
        "sample_pages-INITIAL_FORMS": 0,
        "course_links-TOTAL_FORMS": 0,
        "course_links-INITIAL_FORMS": 0,
    }
    response = admin_client.post(url, data)
    assert response.status_code == 302, response.content.decode()[:3000]
    book = Book.objects.get(title="کتاب تازه")
    assert book.slug == "کتاب-تازه"
    assert "شکری" in book.search_text
    assert "<script" not in book.description
    assert book.variants.get().price == 100000


def test_book_changelist_completeness_and_edition(admin_client, catalog):
    url = reverse("admin:catalog_book_changelist")
    html = admin_client.get(url).content.decode()
    assert "کامل‌بودن" in html and "ویرایش جاری؟" in html and "نوع منبع" in html
    assert "۱۲٪" in html  # civil book: only a confirmed price (1/8, floored)
    incomplete = admin_client.get(url + "?complete=no").content.decode()
    assert "حقوق مدنی دوجلدی" in incomplete
    complete = admin_client.get(url + "?complete=yes").content.decode()
    assert "حقوق مدنی دوجلدی" not in complete
    filtered = admin_client.get(url + "?resource_type__exact=QUICK_REVIEW").content.decode()
    assert "سریع‌خوان متون فقه مرکز وکلا" in filtered and "حقوق مدنی دوجلدی" not in filtered


def test_study_kit_admin_shows_weight(admin_client, catalog):
    html = admin_client.get(reverse("admin:catalog_studykitrecommendation_changelist"))
    assert "ضریب درس" in html.content.decode()
    change = admin_client.get(
        reverse("admin:catalog_studykitrecommendation_change", args=[catalog["rec"].pk])
    ).content.decode()
    assert "دفترچه رسمی آزمون" in change
