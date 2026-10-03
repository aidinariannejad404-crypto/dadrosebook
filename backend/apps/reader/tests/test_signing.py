import datetime as dt

import pytest
from django.core import signing as django_signing
from django.test import RequestFactory
from django.utils import timezone

from apps.reader.services import signing


@pytest.fixture
def rf_request():
    return RequestFactory().get("/")


@pytest.mark.django_db
class TestSignedUrl:
    def test_local_storage_mints_token_url(self, rf_request, ebook, reader, grant):
        grant(reader, ebook.book)
        before = timezone.now()
        signed = signing.signed_url(rf_request, ebook, reader)
        assert signed.url.startswith("/api/v1/library/files/")
        assert before + dt.timedelta(seconds=290) < signed.expires_at
        assert signed.expires_at <= timezone.now() + dt.timedelta(seconds=300)

    def test_token_round_trip(self, ebook, reader, grant):
        grant(reader, ebook.book)
        file, user = signing.redeem_token(signing.make_token(ebook, reader))
        assert file == ebook
        assert user == reader

    def test_tampered_token_is_rejected(self, ebook, reader, grant):
        grant(reader, ebook.book)
        token = signing.make_token(ebook, reader)
        with pytest.raises(signing.InvalidToken):
            signing.redeem_token(token[:-2] + "xx")

    def test_expired_token_is_rejected(self, ebook, reader, grant, settings, monkeypatch):
        grant(reader, ebook.book)
        token = signing.make_token(ebook, reader)
        settings.READER_URL_TTL_SECONDS = 60
        real_time = django_signing.time.time
        monkeypatch.setattr(django_signing.time, "time", lambda: real_time() + 120)
        with pytest.raises(signing.InvalidToken):
            signing.redeem_token(token)

    def test_new_version_invalidates_old_tokens(self, ebook, reader, grant):
        grant(reader, ebook.book)
        token = signing.make_token(ebook, reader)
        ebook.version = 2
        ebook.save()
        with pytest.raises(signing.InvalidToken):
            signing.redeem_token(token)

    def test_revoked_entitlement_invalidates_token(self, ebook, reader, grant):
        ent = grant(reader, ebook.book)
        token = signing.make_token(ebook, reader)
        ent.revoked_at = timezone.now()
        ent.save()
        with pytest.raises(signing.InvalidToken):
            signing.redeem_token(token)

    def test_s3_storage_uses_presigned_url(self, rf_request, ebook, reader):
        calls = {}

        class FakeS3:
            querystring_auth = True
            bucket_name = "private"

            def url(self, name, parameters=None, expire=None):
                calls.update(name=name, parameters=parameters, expire=expire)
                return "https://s3.example/private/x?X-Amz-Signature=abc"

        copy = type(ebook).objects.get(pk=ebook.pk)
        copy.file.storage = FakeS3()
        signed = signing.signed_url(rf_request, copy, reader)
        assert signed.url.startswith("https://s3.example/")
        assert calls["expire"] == 300
        assert calls["parameters"]["ResponseContentDisposition"] == "inline"
        assert calls["parameters"]["ResponseContentType"] == "application/pdf"
