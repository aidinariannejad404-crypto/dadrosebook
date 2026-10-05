from urllib.parse import quote

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from apps.accounts.models import User
from apps.seo.models import NotFoundHit, Redirect

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client(client):
    user = User.objects.create_superuser("09120000000", "admin-pass")
    client.force_login(user)
    return client


def test_changelists_and_sidebar(admin_client):
    Redirect.objects.create(old_path="/products", new_path="/search", hit_count=1234)
    NotFoundHit.objects.create(path="/x", path_key="/x", hits=3)
    html = admin_client.get(reverse("admin:seo_redirect_changelist")).content.decode()
    assert "/products" in html
    assert "۱٬۲۳۴" in html
    assert "درون‌ریزی CSV" in html
    assert "سئو" in html
    assert admin_client.get(reverse("admin:seo_redirect_add")).status_code == 200
    assert admin_client.get(reverse("admin:seo_notfoundhit_changelist")).status_code == 200


def test_not_found_list_links_to_prefilled_redirect_form(admin_client):
    NotFoundHit.objects.create(path="/product/گمشده", path_key="/product/گمشده", hits=9)
    NotFoundHit.objects.create(path="/a", path_key="/a", hits=50)
    html = admin_client.get(reverse("admin:seo_notfoundhit_changelist")).content.decode()
    assert html.index("/a") < html.index("/product/گمشده")  # ordered by -hits
    add_url = reverse("admin:seo_redirect_add")
    assert add_url in html

    form = admin_client.get(
        f"{add_url}?old_path={quote('/product/گمشده')}&source=NOT_FOUND"
    ).content.decode()
    assert 'value="/product/گمشده"' in form


def test_add_redirect_from_404_marks_it_resolved(admin_client):
    hit = NotFoundHit.objects.create(path="/product/گمشده", path_key="/product/گمشده", hits=9)
    response = admin_client.post(
        reverse("admin:seo_redirect_add"),
        {
            "old_path": "/product/گمشده",
            "new_path": "/search",
            "status_code": 301,
            "is_active": "on",
            "note": "",
            "source": "NOT_FOUND",
        },
    )
    assert response.status_code == 302
    assert Redirect.objects.get().source == "NOT_FOUND"
    hit.refresh_from_db()
    assert hit.resolved


def test_admin_form_rejects_self_redirect(admin_client):
    response = admin_client.post(
        reverse("admin:seo_redirect_add"),
        {"old_path": "/a", "new_path": "/a/", "status_code": 301, "is_active": "on"},
    )
    assert response.status_code == 200
    assert not Redirect.objects.exists()


def test_mark_resolved_action(admin_client):
    hit = NotFoundHit.objects.create(path="/x", path_key="/x", hits=1)
    admin_client.post(
        reverse("admin:seo_notfoundhit_changelist"),
        {"action": "mark_resolved", "_selected_action": [hit.pk]},
    )
    hit.refresh_from_db()
    assert hit.resolved


def test_deactivate_action_busts_map(admin_client):
    from apps.seo.services.redirects import redirect_map

    r = Redirect.objects.create(old_path="/products", new_path="/search")
    assert redirect_map()["redirects"]
    admin_client.post(
        reverse("admin:seo_redirect_changelist"),
        {"action": "deactivate", "_selected_action": [r.pk]},
    )
    assert redirect_map()["redirects"] == {}


def test_csv_import_view(admin_client):
    url = reverse("admin:seo_redirect_import_csv")
    assert admin_client.get(url).status_code == 200
    upload = SimpleUploadedFile(
        "redirects.csv", b"old_path,new_path\n/a,/b\n/c,/c\n", content_type="text/csv"
    )
    html = admin_client.post(url, {"file": upload}).content.decode()
    assert "گزارش درون‌ریزی" in html
    assert Redirect.objects.get().old_path == "/a"
    assert "نشانی جدید نباید با نشانی قدیمی یکی باشد." in html
