"""Short-lived signed URLs for ebook files.

* S3 private bucket (prod): a pre-signed GET URL from the storage itself.
* Any other storage (dev/test, local ``private_media/``): a URL to ``library/files/<token>/`` where
  the token is a ``TimestampSigner`` payload naming the file, its version and the user. The view
  re-checks expiry, version, the file's active flag and the user's entitlement before streaming.
"""

import datetime as dt
from dataclasses import dataclass

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from django.urls import reverse
from django.utils import timezone

from apps.library.models import EbookFile

from .access import NoEbook, NoEntitlement, can_read

SALT = "apps.reader.file-url"
CONTENT_TYPES = {
    EbookFile.Format.PDF: "application/pdf",
    EbookFile.Format.EPUB: "application/epub+zip",
}


class InvalidToken(NoEntitlement):
    code = "invalid_token"
    message = "لینک فایل نامعتبر یا منقضی شده است؛ کتاب را دوباره باز کنید."


@dataclass(frozen=True)
class SignedUrl:
    url: str
    expires_at: dt.datetime


def ttl_seconds() -> int:
    return int(getattr(settings, "READER_URL_TTL_SECONDS", 300))


def _is_presigning_storage(storage) -> bool:
    return bool(getattr(storage, "querystring_auth", False)) and hasattr(storage, "bucket_name")


def make_token(ebook: EbookFile, user) -> str:
    return signing.dumps(
        {"f": ebook.pk, "v": ebook.version, "u": user.pk}, salt=SALT, compress=True
    )


def signed_url(request, ebook: EbookFile, user) -> SignedUrl:
    ttl = ttl_seconds()
    expires_at = timezone.now() + dt.timedelta(seconds=ttl)
    storage = ebook.file.storage
    if _is_presigning_storage(storage):
        url = storage.url(
            ebook.file.name,
            parameters={
                "ResponseContentDisposition": "inline",
                "ResponseCacheControl": "private, no-store",
                "ResponseContentType": CONTENT_TYPES[ebook.format],
            },
            expire=ttl,
        )
    else:
        path = reverse("reader:file", kwargs={"token": make_token(ebook, user)})
        url = request.build_absolute_uri(path)
    return SignedUrl(url=url, expires_at=expires_at)


def redeem_token(token: str) -> tuple[EbookFile, object]:
    """Return ``(file, user)`` for a valid token, or raise ``InvalidToken`` / ``NoEbook``."""
    try:
        data = signing.loads(token, salt=SALT, max_age=ttl_seconds())
    except signing.BadSignature as exc:  # includes SignatureExpired
        raise InvalidToken from exc
    ebook = EbookFile.objects.select_related("book").filter(pk=data.get("f")).first()
    if ebook is None or not ebook.is_active or not ebook.file:
        raise NoEbook
    if ebook.version != data.get("v"):
        raise InvalidToken
    user = get_user_model().objects.filter(pk=data.get("u")).first()
    if not can_read(user, ebook.book):
        raise InvalidToken
    return ebook, user
