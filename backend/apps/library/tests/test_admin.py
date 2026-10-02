import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from apps.accounts.models import User
from apps.library.models import EbookEntitlement, EbookFile
from apps.library.services.entitlements import grant

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client(client):
    client.force_login(User.objects.create_superuser("09120000000", "admin-pass"))
    return client


def test_ebook_file_upload_private(admin_client, make_book, settings):
    book = make_book("کتاب")
    url = reverse("admin:library_ebookfile_add")
    assert admin_client.get(url).status_code == 200
    response = admin_client.post(
        url,
        {
            "book": book.pk,
            "format": "PDF",
            "version": 1,
            "is_active": "on",
            "file": SimpleUploadedFile("book.pdf", b"%PDF-1.4 " + b"x" * 2048),
        },
    )
    assert response.status_code == 302, response.content.decode()[:2000]
    ebook = EbookFile.objects.get()
    assert ebook.file.name.startswith(f"ebooks/{book.pk}/v1/")
    assert ebook.file.storage.exists(ebook.file.name)
    assert str(settings.PRIVATE_MEDIA_ROOT) in ebook.file.path

    for page in (
        reverse("admin:library_ebookfile_change", args=[ebook.pk]),
        reverse("admin:library_ebookfile_changelist"),
    ):
        html = admin_client.get(page).content.decode()
        assert "کیلوبایت" in html
        assert "/media/ebooks" not in html and "private_media" not in html

    # saving without a new upload keeps the file
    response = admin_client.post(
        reverse("admin:library_ebookfile_change", args=[ebook.pk]),
        {"book": book.pk, "format": "PDF", "version": 1},
    )
    assert response.status_code == 302
    ebook.refresh_from_db()
    assert ebook.file.name and not ebook.is_active


def test_ebook_file_requires_file(admin_client, make_book):
    book = make_book("کتاب")
    response = admin_client.post(
        reverse("admin:library_ebookfile_add"), {"book": book.pk, "format": "PDF", "version": 1}
    )
    assert response.status_code == 200
    assert "بارگذاری فایل الزامی است." in response.content.decode()


def test_entitlement_admin_grant_revoke_restore(admin_client, make_book):
    customer = User.objects.create_user("09121112233")
    book = make_book("کتاب")
    add = reverse("admin:library_ebookentitlement_add")
    assert admin_client.get(add).status_code == 200
    response = admin_client.post(add, {"user": customer.pk, "book": book.pk})
    assert response.status_code == 302
    ent = EbookEntitlement.objects.get()
    assert ent.source == EbookEntitlement.Source.ADMIN and ent.is_active

    changelist = reverse("admin:library_ebookentitlement_changelist")
    admin_client.post(changelist, {"action": "revoke_access", "_selected_action": [ent.pk]})
    ent.refresh_from_db()
    assert not ent.is_active

    # re-granting a revoked one through the add form re-activates it
    response = admin_client.post(add, {"user": customer.pk, "book": book.pk})
    assert response.status_code == 302
    ent.refresh_from_db()
    assert ent.is_active and EbookEntitlement.objects.count() == 1

    admin_client.post(changelist, {"action": "revoke_access", "_selected_action": [ent.pk]})
    admin_client.post(changelist, {"action": "restore_access", "_selected_action": [ent.pk]})
    ent.refresh_from_db()
    assert ent.is_active

    html = admin_client.get(changelist, {"q": "09121112233"}).content.decode()
    assert "کتاب" in html
    assert admin_client.get(changelist, {"q": "کتاب", "active": "1"}).status_code == 200
    change = reverse("admin:library_ebookentitlement_change", args=[ent.pk])
    assert admin_client.get(change).status_code == 200


def test_entitlement_change_is_read_only(admin_client, make_book):
    customer = User.objects.create_user("09121112233")
    ent = grant(customer, make_book("کتاب"))
    other = make_book("دیگری")
    change = reverse("admin:library_ebookentitlement_change", args=[ent.pk])
    admin_client.post(change, {"user": customer.pk, "book": other.pk})
    ent.refresh_from_db()
    assert ent.book.title == "کتاب"
