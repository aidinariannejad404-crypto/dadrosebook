"""``/api/v1/seo/…`` endpoints (``docs/phase-5-contract.md`` §1)."""

import json
from urllib.parse import quote

import pytest
from django.conf import settings

from apps.seo.api.views import NotFoundView, RedirectHitView
from apps.seo.models import NotFoundHit, Redirect

pytestmark = pytest.mark.django_db

OLD = "/product/حقوق-مدنی-قدیمی"


def test_redirect_map(api):
    Redirect.objects.create(old_path=OLD, new_path="/product/جدید")
    Redirect.objects.create(old_path="/blog", new_path="https://dadrose.com/blog/", status_code=302)
    Redirect.objects.create(old_path="/off", new_path="/", is_active=False)
    response = api.get("/api/v1/seo/redirects/")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"version", "redirects"}
    assert body["redirects"] == {
        OLD: ["/product/جدید", 301],
        "/blog": ["https://dadrose.com/blog/", 302],
    }
    assert "public" in response["Cache-Control"]


def test_hit_beacon(api):
    r = Redirect.objects.create(old_path=OLD, new_path="/")
    response = api.post("/api/v1/seo/redirects/hit/", {"path": quote(OLD)}, format="json")
    assert response.status_code == 204
    r.refresh_from_db()
    assert r.hit_count == 1


def test_hit_beacon_unknown_path_is_noop(api):
    response = api.post("/api/v1/seo/redirects/hit/", {"path": "/nope"}, format="json")
    assert response.status_code == 204


def test_hit_beacon_requires_path(api):
    response = api.post("/api/v1/seo/redirects/hit/", {}, format="json")
    assert response.status_code == 400


def test_not_found_beacon(api):
    payload = {"path": "/product/گمشده", "referer": "https://www.google.com/"}
    for _ in range(2):
        response = api.post("/api/v1/seo/not-found/", payload, format="json")
        assert response.status_code == 204
    hit = NotFoundHit.objects.get()
    assert (hit.path, hit.hits, hit.last_referer) == (
        "/product/گمشده",
        2,
        "https://www.google.com/",
    )


def test_not_found_beacon_accepts_send_beacon_text_plain(api):
    body = json.dumps({"path": "/x", "referer": None})
    response = api.post("/api/v1/seo/not-found/", body, content_type="text/plain;charset=UTF-8")
    assert response.status_code == 204
    assert NotFoundHit.objects.get().path == "/x"


@pytest.mark.parametrize("path", ["/_next/data/x.json", "/api/v1/x", "/" + "a" * 600])
def test_not_found_beacon_ignored_paths(api, path):
    response = api.post("/api/v1/seo/not-found/", {"path": path}, format="json")
    assert response.status_code == 204
    assert not NotFoundHit.objects.exists()


def test_beacons_use_seo_beacon_throttle_scope():
    assert RedirectHitView.throttle_scope == NotFoundView.throttle_scope == "seo_beacon"
    rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
    assert rates["seo_beacon"] == "120/min"


def test_beacon_is_throttled(api, monkeypatch):
    from rest_framework.throttling import ScopedRateThrottle

    monkeypatch.setattr(
        ScopedRateThrottle, "THROTTLE_RATES", {"seo_beacon": "2/min", "study_plan": "10/hour"}
    )
    codes = [
        api.post("/api/v1/seo/not-found/", {"path": "/x"}, format="json").status_code
        for _ in range(3)
    ]
    assert codes == [204, 204, 429]
    # GET endpoints are not throttled
    assert api.get("/api/v1/seo/redirects/").status_code == 200
