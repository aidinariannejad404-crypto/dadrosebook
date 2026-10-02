import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from apps.accounts.models import User
from apps.library.models import EbookFile
from apps.reader.tests.conftest import PDF_BYTES


@pytest.fixture
def admin_client(client, db):
    admin = User.objects.create_superuser(phone="09120000000", password="pass")
    client.force_login(admin)
    return client


@pytest.mark.django_db
class TestEbookFileAdmin:
    def upload(self, client, book, content, name="book.pdf", version=1):
        return client.post(
            reverse("admin:library_ebookfile_add"),
            {
                "book": book.pk,
                "format": "PDF",
                "file": SimpleUploadedFile(name, content, content_type="application/pdf"),
                "version": version,
                "is_active": "on",
            },
        )

    def test_changelist_renders(self, admin_client):
        assert admin_client.get(reverse("admin:library_ebookfile_changelist")).status_code == 200

    def test_upload_goes_to_private_storage(self, admin_client, book):
        res = self.upload(admin_client, book, PDF_BYTES)
        assert res.status_code == 302
        ebook = EbookFile.objects.get()
        assert ebook.file.read() == PDF_BYTES
        ebook.file.delete(save=False)

    def test_rejects_non_pdf_content(self, admin_client, book):
        res = self.upload(admin_client, book, b"<html>not a pdf</html>")
        assert res.status_code == 200
        assert not EbookFile.objects.exists()

    def test_new_active_upload_replaces_previous(self, admin_client, book):
        self.upload(admin_client, book, PDF_BYTES)
        self.upload(admin_client, book, PDF_BYTES, version=2)
        assert list(EbookFile.objects.filter(is_active=True).values_list("version", flat=True)) == [
            2
        ]
        for ebook in EbookFile.objects.all():
            ebook.file.delete(save=False)
