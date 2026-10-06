"""ه۶: free statute ebooks («دریافت رایگان»)."""

import pytest
from django.core.files.base import ContentFile

from apps.library.models import EbookEntitlement, EbookFile
from apps.library.services import entitlements
from apps.library.services.free import NotFree, claim_free, is_claimable

pytestmark = pytest.mark.django_db

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


@pytest.fixture
def statute(make_book):
    book = make_book("قانون مدنی", is_free_ebook=True)
    ebook = EbookFile(book=book, format=EbookFile.Format.PDF, version=1)
    ebook.file.save("law.pdf", ContentFile(PDF), save=True)
    yield book
    ebook.file.delete(save=False)


def claim_url(book):
    return f"/api/v1/library/{book.slug}/claim-free/"


def test_claim_grants_free_entitlement(user, statute):
    ent, created = claim_free(user, statute)
    assert created and ent.source == EbookEntitlement.Source.FREE
    assert entitlements.has_entitlement(user, statute)
    again, created = claim_free(user, statute)
    assert not created and again.pk == ent.pk


def test_purchase_is_not_downgraded(user, statute):
    entitlements.grant(user, statute, source=EbookEntitlement.Source.PURCHASE)
    ent, created = claim_free(user, statute)
    assert not created and ent.source == EbookEntitlement.Source.PURCHASE


def test_revoked_entitlement_is_restored_as_free(user, statute):
    entitlements.grant(user, statute)
    entitlements.revoke_book(user, statute)
    ent, _ = claim_free(user, statute)
    assert ent.is_active and ent.source == EbookEntitlement.Source.FREE


def test_paid_or_unready_books_cannot_be_claimed(user, make_book):
    paid = make_book("آیین دادرسی")
    with pytest.raises(NotFree):
        claim_free(user, paid)
    no_file = make_book("قانون تجارت", is_free_ebook=True)
    assert not is_claimable(no_file)
    with pytest.raises(NotFree):
        claim_free(user, no_file)


def test_claim_api(api, user, statute):
    assert api.post(claim_url(statute)).status_code == 401  # login required
    api.force_authenticate(user)
    res = api.post(claim_url(statute))
    assert res.status_code == 201 and res.json() == {
        "book": statute.slug,
        "source": "FREE",
        "created": True,
    }
    assert api.post(claim_url(statute)).status_code == 200
    library = api.get("/api/v1/library/").json()
    assert library[0]["source"] == "FREE" and library[0]["can_read"] is True
    # and the reader opens it
    read = api.get(f"/api/v1/library/{statute.slug}/read/", HTTP_X_READER_DEVICE="device-0001")
    assert read.status_code == 200


def test_claim_api_rejects_paid_book(api, user, make_book):
    api.force_authenticate(user)
    res = api.post(claim_url(make_book("کتاب پولی")))
    assert res.status_code == 400
    assert "not_free" in str(res.json()["code"])


def test_free_badge_and_flags(api, statute, make_book):
    card = api.get(f"/api/v1/catalog/books/{statute.slug}/").json()
    assert card["is_free_ebook"] is True and card["free_ebook_ready"] is True
    assert card["reader_sample"] is False  # the whole book is free: no sample button
    assert card["badges"][0] == {"code": "free_ebook", "label": "رایگان", "tone": "success"}
    paid = api.get(f"/api/v1/catalog/books/{make_book('کتاب دیگر').slug}/").json()
    assert paid["is_free_ebook"] is False and paid["free_ebook_ready"] is False
