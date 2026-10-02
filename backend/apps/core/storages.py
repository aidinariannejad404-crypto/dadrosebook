"""Storage backends.

* ``default`` (public): covers, sample pages, sample PDFs. Local disk in dev, S3 public bucket in
  prod.
* ``private``: ebook files. Local ``private_media/`` (never served by any URL) in dev, S3 private
  bucket with signed (querystring-auth) URLs in prod. Use ``storages["private"]``.
"""

from django.conf import settings
from django.core.files.storage import FileSystemStorage, storages
from storages.backends.s3 import S3Storage


class PrivateFileSystemStorage(FileSystemStorage):
    """Local private storage. ``base_url`` is None: there is deliberately no public URL."""

    def __init__(self, **kwargs):
        kwargs.setdefault("location", str(settings.PRIVATE_MEDIA_ROOT))
        kwargs.setdefault("base_url", None)
        super().__init__(**kwargs)

    def url(self, name):
        raise NotImplementedError("Private files have no public URL; serve them via signed views.")


class PublicS3Storage(S3Storage):
    default_acl = "public-read"
    querystring_auth = False


class PrivateS3Storage(S3Storage):
    default_acl = "private"
    querystring_auth = True
    querystring_expire = 300


def private_storage():
    """Callable for ``FileField(storage=private_storage)``."""
    return storages["private"]
