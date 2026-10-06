"""Dev only: attach a bundled sample PDF to books that sell an ebook (else bestsellers).

``python manage.py seed_demo_ebooks [--limit 5] [--if-empty] [--epub] [--statute]``. Staff users can
then open ``/read/<slug>`` (staff preview) before real files are uploaded in the admin.

``--statute`` (ه۶) adds one free demo statute book «قانون مدنی (نسخه نمایشی)» with placeholder text
(clearly marked as not the official law) and a few «شرح این ماده» links to paid books.
"""

from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError

from apps.catalog.models import Book, BookVariant
from apps.library.models import EbookFile
from apps.reader.sample_epub import build_epub
from apps.reader.services.epub import process_epub

SAMPLE = Path(__file__).resolve().parents[2] / "fixtures" / "sample-ebook.pdf"


class Command(BaseCommand):
    help = "فایل PDF نمونه را به چند کتاب دارای نسخه الکترونیک وصل می‌کند (فقط محیط توسعه)."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=5)
        parser.add_argument(
            "--if-empty", action="store_true", help="اگر فایلی از این قالب هست، کاری نکن."
        )
        parser.add_argument(
            "--epub", action="store_true", help="به‌جای PDF، EPUB نمونه (فصل‌به‌فصل) وصل کن."
        )
        parser.add_argument(
            "--statute",
            action="store_true",
            help="یک کتاب قانون رایگانِ نمایشی با پیوند «شرح این ماده» بساز.",
        )

    def handle(self, *args, limit, if_empty, epub=False, statute=False, **options):
        if getattr(settings, "USE_S3", False) and not settings.DEBUG:
            raise CommandError("seed_demo_ebooks is for local development only.")
        if statute:
            book = seed_demo_statute()
            self.stdout.write(self.style.SUCCESS(f"demo statute: /read/{book.slug}"))
            return
        fmt = EbookFile.Format.EPUB if epub else EbookFile.Format.PDF
        if if_empty and EbookFile.objects.filter(format=fmt).exists():
            self.stdout.write("ebook files exist; skipping")
            return
        candidates = Book.objects.filter(is_active=True).exclude(ebook_files__is_active=True)
        with_ebook = candidates.filter(
            variants__type=BookVariant.Type.EBOOK, variants__is_active=True
        )
        # The imported catalogue sells print only so far; fall back to bestsellers for the demo.
        source = with_ebook if with_ebook.exists() else candidates
        books = source.distinct().order_by("-sales_count", "id")[:limit]
        created = 0
        for book in books:
            if epub:
                ebook = EbookFile(book=book, format=EbookFile.Format.EPUB, version=1)
                ebook.file.save("demo-sample.epub", ContentFile(build_epub()), save=True)
                process_epub(ebook)
            else:
                ebook = EbookFile(book=book, format=EbookFile.Format.PDF, version=1)
                with SAMPLE.open("rb") as fh:
                    ebook.file.save("demo-sample.pdf", File(fh), save=True)
            created += 1
            self.stdout.write(f"  /read/{book.slug}")
        self.stdout.write(self.style.SUCCESS(f"{created} demo ebook file(s) attached"))


DEMO_STATUTE_TITLE = "قانون مدنی (نسخه نمایشی)"


def seed_demo_statute() -> Book:
    """The free demo statute book, its EPUB and a few article → commentary links (idempotent)."""
    from apps.catalog.models import Subject
    from apps.reader.models import StatuteLink
    from apps.reader.sample_epub import build_statute_epub, statute_articles
    from apps.reader.services.files import activate

    book = Book.objects.filter(title=DEMO_STATUTE_TITLE).first()
    if book is None:
        book = Book.objects.create(
            title=DEMO_STATUTE_TITLE,
            subtitle="متن نمایشی برای آزمایش کتاب‌خوان؛ متن رسمی قانون نیست",
            resource_type=Book.ResourceType.LAWS,
            is_free_ebook=True,
        )
    subject = Subject.objects.filter(name__contains="مدنی").first()
    if subject is not None:
        book.subjects.add(subject)
    if not book.ebook_files.filter(is_active=True).exists():
        ebook = EbookFile(book=book, format=EbookFile.Format.EPUB, version=1, sample_enabled=False)
        ebook.file.save("demo-statute.epub", ContentFile(build_statute_epub()), save=True)
        process_epub(ebook)
        activate(ebook, reanchor=False)
    paid = Book.objects.filter(is_active=True, is_free_ebook=False)
    if subject is not None and paid.filter(subjects=subject).exists():
        paid = paid.filter(subjects=subject)
    targets = list(paid.order_by("-sales_count", "id")[:3])
    if targets and not StatuteLink.objects.filter(book=book).exists():
        for i, (chapter, number, _text) in enumerate(statute_articles()):
            if number in (1, 5, 8):
                from apps.core.money import to_persian_digits

                StatuteLink.objects.create(
                    book=book,
                    chapter_index=chapter,
                    anchor=f"m{number}",
                    label=f"ماده {to_persian_digits(number)}",
                    target_book=targets[i % len(targets)],
                )
    return book
