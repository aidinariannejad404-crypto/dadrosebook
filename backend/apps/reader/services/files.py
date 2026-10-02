from apps.library.models import EbookFile

PDF_MAGIC = b"%PDF-"
ZIP_MAGIC = b"PK\x03\x04"


class InvalidEbookFile(ValueError):
    pass


def check_magic(fmt: str, head: bytes) -> None:
    expected = PDF_MAGIC if fmt == EbookFile.Format.PDF else ZIP_MAGIC
    if not head.startswith(expected):
        raise InvalidEbookFile(f"محتوای فایل با قالب {fmt} سازگار نیست.")


def validate_upload(fmt: str, django_file) -> None:
    """Reject files whose content does not match the chosen format (called from the admin form)."""
    django_file.seek(0)
    head = django_file.read(8)
    django_file.seek(0)
    check_magic(fmt, head)


def activate(ebook: EbookFile) -> None:
    """Make ``ebook`` the book's only active file."""
    EbookFile.objects.filter(book=ebook.book, is_active=True).exclude(pk=ebook.pk).update(
        is_active=False
    )
    if not ebook.is_active:
        ebook.is_active = True
        ebook.save(update_fields=["is_active", "updated_at"])
