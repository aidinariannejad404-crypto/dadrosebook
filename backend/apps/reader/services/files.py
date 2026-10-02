import hashlib

from ..models import EbookFile

CHUNK = 1024 * 1024
PDF_MAGIC = b"%PDF-"
ZIP_MAGIC = b"PK\x03\x04"


class InvalidEbookFile(ValueError):
    pass


def check_magic(fmt: str, head: bytes) -> None:
    expected = PDF_MAGIC if fmt == EbookFile.Format.PDF else ZIP_MAGIC
    if not head.startswith(expected):
        raise InvalidEbookFile(f"محتوای فایل با قالب {fmt} سازگار نیست.")


def fingerprint(django_file) -> tuple[int, str]:
    """``(size, sha256)`` of an uploaded or stored file, read in chunks."""
    digest = hashlib.sha256()
    size = 0
    django_file.seek(0)
    for chunk in iter(lambda: django_file.read(CHUNK), b""):
        digest.update(chunk)
        size += len(chunk)
    django_file.seek(0)
    return size, digest.hexdigest()


def prepare_upload(ebook: EbookFile, django_file) -> None:
    """Check the magic bytes and record size and hash (called from the admin form)."""
    django_file.seek(0)
    check_magic(ebook.format, django_file.read(8))
    ebook.size, ebook.sha256 = fingerprint(django_file)


def activate(ebook: EbookFile) -> None:
    """Make ``ebook`` the book's only active file."""
    EbookFile.objects.filter(book=ebook.book, is_active=True).exclude(pk=ebook.pk).update(
        is_active=False
    )
    if not ebook.is_active:
        ebook.is_active = True
        ebook.save(update_fields=["is_active", "updated_at"])
