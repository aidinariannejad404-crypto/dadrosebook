from urllib.parse import quote

import pytest
from django.core.cache import cache
from django.core.exceptions import ValidationError

from apps.seo.models import NotFoundHit, Redirect
from apps.seo.services.redirects import (
    MAP_CACHE_KEY,
    record_hit,
    record_not_found,
    redirect_map,
    resolve,
    validate_redirect,
)

pytestmark = pytest.mark.django_db

OLD = "/product/حقوق-مدنی-قدیمی"
NEW = "/product/حقوق-مدنی-نموداری"


def make(old=OLD, new=NEW, **kw):
    return Redirect.objects.create(old_path=old, new_path=new, **kw)


# --- model ------------------------------------------------------------------------------------


def test_save_stores_decoded_path_and_key():
    r = make(old="https://dadrosebook.com" + quote("/product/آيين-دادرسي/") + "?x=1")
    assert r.old_path == "/product/آيين-دادرسي/"
    assert r.old_path_key == "/product/آیین-دادرسی"
    assert r.status_code == 301
    assert r.source == Redirect.Source.ADMIN


def test_key_updates_when_old_path_changes():
    r = make()
    r.old_path = "/Products/"
    r.save(update_fields=["old_path"])
    r.refresh_from_db()
    assert r.old_path_key == "/products"


# --- validation -------------------------------------------------------------------------------


@pytest.mark.parametrize("target", ["/search", "https://dadrose.com/blog/", "/product/x?y=1"])
def test_valid_targets(target):
    validate_redirect("/old", target)


@pytest.mark.parametrize(
    "target", ["search", "http://dadrose.com/", "ftp://x", "//evil.example/", "javascript:x"]
)
def test_invalid_targets(target):
    with pytest.raises(ValidationError) as exc:
        validate_redirect("/old", target)
    assert "new_path" in exc.value.message_dict


@pytest.mark.parametrize("target", [OLD, OLD + "/", quote(OLD), OLD.replace("ی", "ي") + "?a=1"])
def test_self_redirect_rejected(target):
    with pytest.raises(ValidationError) as exc:
        validate_redirect(OLD, target)
    assert "new_path" in exc.value.message_dict


def test_chain_rejected():
    make(old="/b", new="/c")
    with pytest.raises(ValidationError) as exc:
        validate_redirect("/a", "/b/")
    assert "new_path" in exc.value.message_dict


def test_loop_rejected():
    make(old="/a", new="/b")
    with pytest.raises(ValidationError):
        validate_redirect("/b", "/a")


def test_redirect_into_existing_source_rejected():
    make(old="/a", new="/b")
    with pytest.raises(ValidationError) as exc:
        validate_redirect("/b", "/c")
    assert "old_path" in exc.value.message_dict


def test_inactive_redirects_do_not_count_as_chains():
    make(old="/b", new="/c", is_active=False)
    validate_redirect("/a", "/b")


def test_duplicate_key_rejected_but_own_row_allowed():
    r = make()
    with pytest.raises(ValidationError) as exc:
        validate_redirect(quote(OLD) + "/", "/x")
    assert "old_path" in exc.value.message_dict
    validate_redirect(OLD, "/x", exclude_pk=r.pk)


def test_model_full_clean_runs_validation():
    r = Redirect(old_path=OLD, new_path=OLD + "/")
    with pytest.raises(ValidationError):
        r.full_clean()


# --- map, resolve, cache ----------------------------------------------------------------------


def test_redirect_map_contains_active_only():
    make()
    make(old="/products", new="/search", status_code=302)
    make(old="/gone", new="/", is_active=False)
    data = redirect_map()
    assert data["redirects"] == {OLD: [NEW, 301], "/products": ["/search", 302]}
    assert len(data["version"]) == 16


def test_resolve():
    make()
    assert resolve(quote(OLD) + "/?utm=1") == (NEW, 301)
    assert resolve("/unknown") is None


def test_map_is_cached_and_invalidated_on_save_and_delete():
    r = make()
    first = redirect_map()
    assert cache.get(MAP_CACHE_KEY) == first
    # Bypassing signals keeps the stale cache…
    Redirect.objects.filter(pk=r.pk).update(new_path="/x")
    assert redirect_map() == first
    # …a save busts it and changes the version.
    r.new_path = "/y"
    r.save()
    assert cache.get(MAP_CACHE_KEY) is None
    second = redirect_map()
    assert second["redirects"][OLD] == ["/y", 301]
    assert second["version"] != first["version"]
    r.delete()
    assert cache.get(MAP_CACHE_KEY) is None
    assert redirect_map()["redirects"] == {}


def test_version_is_stable_for_same_content():
    make()
    first = redirect_map()["version"]
    cache.clear()
    assert redirect_map()["version"] == first


def test_hits_do_not_bust_the_cache():
    make()
    redirect_map()
    record_hit(OLD)
    assert cache.get(MAP_CACHE_KEY) is not None


# --- beacons ----------------------------------------------------------------------------------


def test_record_hit_by_key():
    r = make()
    assert record_hit(quote(OLD) + "/?utm=x")
    assert record_hit(OLD)
    r.refresh_from_db()
    assert r.hit_count == 2
    assert r.last_hit_at is not None


def test_record_hit_unknown_or_inactive_is_noop():
    r = make(is_active=False)
    assert not record_hit(OLD)
    assert not record_hit("/nothing")
    r.refresh_from_db()
    assert r.hit_count == 0


def test_record_not_found_upserts():
    first = record_not_found(quote("/product/گمشده") + "?x=1", "https://google.com/")
    assert first.path == "/product/گمشده"
    assert first.hits == 1
    again = record_not_found("/product/گمشده/", "")
    assert again.pk == first.pk
    assert again.hits == 2
    assert again.last_referer == "https://google.com/"  # an empty referer keeps the last one
    assert NotFoundHit.objects.count() == 1


@pytest.mark.parametrize(
    "path",
    [
        "/_next/static/chunks/x.js",
        "/api/v1/catalog/books/",
        "/api",
        "/static/admin.css",
        "/media/covers/x.jpg",
        "/admin/login/",
        "/Admin",
        "/" + "a" * 500,
        "no-leading-slash",
        "",
    ],
)
def test_record_not_found_ignores(path):
    assert record_not_found(path) is None
    assert not NotFoundHit.objects.exists()


def test_not_found_prefix_is_matched_by_segment():
    assert record_not_found("/apiary") is not None


def test_referer_is_truncated():
    hit = record_not_found("/x", "https://e.com/" + "a" * 1000)
    assert len(hit.last_referer) == 500


def test_creating_a_redirect_resolves_the_404():
    record_not_found("/product/گمشده")
    make(old="/product/گمشده/", new="/")
    assert NotFoundHit.objects.get().resolved is True
