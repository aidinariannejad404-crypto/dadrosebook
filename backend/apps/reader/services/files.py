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
    if fmt == EbookFile.Format.EPUB:
        from .epub import inspect_upload

        inspect_upload(django_file)


def prepare(ebook: EbookFile) -> None:
    """After an upload: unpack an EPUB for streaming; index a PDF's page text (ه۱).

    A cached free sample of the previous upload is dropped either way (د۵).
    """
    from .sample import drop_pdf_sample

    drop_pdf_sample(ebook)
    if ebook.format == EbookFile.Format.EPUB and ebook.file:
        from .epub import process_epub

        process_epub(ebook)
    elif ebook.format == EbookFile.Format.PDF and ebook.file:
        from .pdftext import build_text_index

        build_text_index(ebook)


def activate(ebook: EbookFile, *, reanchor: bool = True, force: bool = False) -> None:
    """Make ``ebook`` the book's only active file.

    Then (after commit) a Celery task moves the book's highlights, bookmarks and reading
    positions onto this version (ه۱, ``services.reanchor``). ``force`` re-checks annotations
    already on this version too (the file was replaced without a new version number).
    """
    EbookFile.objects.filter(book=ebook.book, is_active=True).exclude(pk=ebook.pk).update(
        is_active=False
    )
    if not ebook.is_active:
        ebook.is_active = True
        ebook.save(update_fields=["is_active", "updated_at"])
    if reanchor:
        from ..tasks import queue_reanchor

        queue_reanchor(ebook, force=force)
