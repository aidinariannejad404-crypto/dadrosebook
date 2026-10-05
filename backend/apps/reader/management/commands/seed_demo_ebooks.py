"""Dev only: attach a bundled sample PDF to books that sell an ebook (else bestsellers).

``python manage.py seed_demo_ebooks [--limit 5] [--if-empty] [--epub]``. Staff users can then open
``/read/<slug>`` (staff preview) before real files are uploaded in the admin.
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

    def handle(self, *args, limit, if_empty, epub=False, **options):
        if getattr(settings, "USE_S3", False) and not settings.DEBUG:
            raise CommandError("seed_demo_ebooks is for local development only.")
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
