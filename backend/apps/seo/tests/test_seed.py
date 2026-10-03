import pytest
from django.core.management import call_command

from apps.catalog import seed_data
from apps.catalog.models import Book, Category
from apps.catalog.services.legacy_import import legacy_path, old_slug
from apps.seo.models import Redirect
from apps.seo.services.seed import SAZITO_STANDARD_PATHS, seed_redirects

pytestmark = pytest.mark.django_db

RECORD = seed_data.load_catalogue()[0]
OLD_CATEGORY_SLUGS = [c["slug"] for c in seed_data.load_old_categories() if c.get("slug")]


def test_standard_paths_without_catalogue():
    counts = seed_redirects()
    assert counts == {"created": len(SAZITO_STANDARD_PATHS), "existing": 0, "invalid": 0}
    assert dict(Redirect.objects.values_list("old_path", "new_path")) == {
        "/products": "/search",
        "/blog": "https://dadrose.com/blog/",
        "/page/about-us": "/",
        "/page/contact-us": "/",
        "/register": "/login",
        "/profile": "/account",
    }
    assert set(Redirect.objects.values_list("source", flat=True)) == {"SEED"}
    assert all(r.note for r in Redirect.objects.all())


def test_product_and_category_redirects():
    path = legacy_path(RECORD)
    Book.objects.create(title=RECORD["title"], slug="نامک-تازه", legacy_path=path)
    Book.objects.create(title="هم‌نام", slug="x-1", legacy_path="")  # not from the old store
    active = [s for s in OLD_CATEGORY_SLUGS if s != "دوره-های-آموزشی"]
    for slug in active[:-1]:
        Category.objects.create(name=slug, slug=slug)
    Category.objects.create(name=active[-1], slug=active[-1], is_active=False)

    seed_redirects()
    targets = dict(Redirect.objects.values_list("old_path", "new_path"))
    assert targets[path] == "/product/نامک-تازه"
    assert path == f"/product/{old_slug(RECORD)}"
    assert targets["/category/دوره-های-آموزشی"] == "https://dadrose.com/"
    assert targets[f"/category/{active[-1]}"] == "/"
    for slug in active[:-1]:
        assert f"/category/{slug}" not in targets


def test_idempotent_and_keeps_admin_edits():
    seed_redirects()
    total = Redirect.objects.count()
    edited = Redirect.objects.get(old_path="/page/about-us")
    edited.new_path = "/about"
    edited.is_active = False
    edited.save()

    counts = seed_redirects()
    assert counts["created"] == 0
    assert counts["existing"] == total
    assert Redirect.objects.count() == total
    edited.refresh_from_db()
    assert (edited.new_path, edited.is_active) == ("/about", False)


def test_existing_admin_row_with_same_key_is_not_replaced():
    Redirect.objects.create(old_path="/Products/", new_path="/category/x")
    seed_redirects()
    assert Redirect.objects.filter(old_path_key="/products").get().new_path == "/category/x"


def test_management_command(capsys):
    call_command("seed_redirects")
    assert "created=" in capsys.readouterr().out
    assert Redirect.objects.exists()


def test_seed_catalog_also_seeds_redirects():
    call_command("seed_catalog")
    targets = dict(Redirect.objects.values_list("old_path", "new_path"))
    # Only the skipped course category is redirected; every other old category is active.
    category_paths = {p for p in targets if p.startswith("/category/")}
    assert category_paths == {"/category/دوره-های-آموزشی"}
    # The catalogue keeps the old product slugs, so no product redirects today.
    assert not any(p.startswith("/product/") for p in targets)
    assert targets["/products"] == "/search"
    call_command("seed_catalog", "--if-empty")
    assert Redirect.objects.count() == len(targets)
