"""Dev only: attach a bundled sample PDF to books that sell an ebook but have no file yet.

``python manage.py seed_demo_ebooks [--limit 5] [--if-empty]``. Staff users can then open
``/read/<slug>`` (staff preview) before real files are uploaded in the admin.
"""

from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand, CommandError

from apps.catalog.models import Book, BookVariant
from apps.library.models import EbookFile

SAMPLE = Path(__file__).resolve().parents[2] / "fixtures" / "sample-ebook.pdf"


class Command(BaseCommand):
    help = "فایل PDF نمونه را به چند کتاب دارای نسخه الکترونیک وصل می‌کند (فقط محیط توسعه)."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=5)
        parser.add_argument("--if-empty", action="store_true", help="اگر فایلی هست، کاری نکن.")

    def handle(self, *args, limit, if_empty, **options):
        if getattr(settings, "USE_S3", False) and not settings.DEBUG:
            raise CommandError("seed_demo_ebooks is for local development only.")
        if if_empty and EbookFile.objects.exists():
            self.stdout.write("ebook files exist; skipping")
            return
        books = (
            Book.objects.filter(
                is_active=True,
                variants__type=BookVariant.Type.EBOOK,
                variants__is_active=True,
            )
            .exclude(ebook_files__is_active=True)
            .distinct()
            .order_by("-sales_count", "id")[:limit]
        )
        created = 0
        for book in books:
            ebook = EbookFile(book=book, format=EbookFile.Format.PDF, version=1)
            with SAMPLE.open("rb") as fh:
                ebook.file.save("demo-sample.pdf", File(fh), save=True)
            created += 1
            self.stdout.write(f"  /read/{book.slug}")
        self.stdout.write(self.style.SUCCESS(f"{created} demo ebook file(s) attached"))
