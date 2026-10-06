import pytest

from apps.catalog.models import ExamType
from apps.growth.models import KitShare
from apps.growth.services import kit_shares


@pytest.fixture
def exam(db):
    return ExamType.objects.create(name="کانون وکلا", slug="vekalat")


def test_create_is_deduplicated(books, exam):
    ids = [books["civil_ebook"].pk, books["commerce_print"].pk]
    a = kit_shares.create_share("vekalat", [*ids, ids[0], 999999])
    b = kit_shares.create_share("vekalat", ids)
    assert a.pk == b.pk and len(a.token) == 8
    assert a.variant_ids == ids
    assert kit_shares.create_share(None, ids).pk != a.pk
    with pytest.raises(kit_shares.KitShareError):
        kit_shares.create_share("vekalat", [999999])


def test_api_round_trip(api, books, exam):
    ids = [books["commerce_print"].pk, books["civil_bundle"].pk]
    res = api.post(
        "/api/v1/growth/kit-shares/", {"exam": "vekalat", "variant_ids": ids}, format="json"
    )
    assert res.status_code == 201
    token = res.json()["token"]
    assert res.json()["path"] == f"/kit?k={token}"
    kit = api.get(f"/api/v1/growth/kit-shares/resolve/?k={token}").json()
    assert kit["exam"]["slug"] == "vekalat"
    assert [i["book"]["slug"] for i in kit["items"]] == [
        books["commerce_book"].slug,
        books["civil_book"].slug,
    ]
    assert [i["variant_id"] for i in kit["items"]] == ids
    assert KitShare.objects.get(token=token).views == 1


def test_resolve_by_slugs(api, books, exam):
    slugs = f"{books['civil_book'].slug},nope,{books['commerce_book'].slug}"
    kit = api.get("/api/v1/growth/kit-shares/resolve/", {"b": slugs, "exam": "vekalat"}).json()
    assert [i["book"]["id"] for i in kit["items"]] == [
        books["civil_book"].pk,
        books["commerce_book"].pk,
    ]
    assert kit["items"][0]["variant_id"] is None and kit["token"] is None
    assert api.get("/api/v1/growth/kit-shares/resolve/?b=nope").status_code == 404
    assert api.get("/api/v1/growth/kit-shares/resolve/?k=nope").status_code == 404
    assert (
        api.post("/api/v1/growth/kit-shares/", {"variant_ids": []}, format="json").status_code
        == 400
    )
