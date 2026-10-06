from django.core.management.base import BaseCommand

from apps.library.models import EbookFile
from apps.reader.models import EpubPackage, PdfTextIndex
from apps.reader.services.epub import InvalidEpub, process_epub
from apps.reader.services.pdftext import build_text_index


class Command(BaseCommand):
    help = (
        "Unpack EPUB files for chapter streaming and index PDF page text (only missing ones "
        "unless --force). --reanchor then moves every book's highlights, bookmarks and reading "
        "positions onto its active file version."
    )

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Rebuild every package/index.")
        parser.add_argument(
            "--reanchor",
            action="store_true",
            help="Re-anchor annotations not yet on their book's active file version (ه۱).",
        )

    def handle(self, *args, force=False, reanchor=False, **options):
        qs = EbookFile.objects.exclude(file="").select_related("book")
        done = failed = 0
        for ebook in qs:
            if ebook.format == EbookFile.Format.EPUB:
                if not force and EpubPackage.objects.filter(ebook=ebook).exists():
                    continue
                try:
                    package = process_epub(ebook)
                except (InvalidEpub, OSError) as exc:
                    failed += 1
                    self.stderr.write(f"{ebook}: {exc}")
                    continue
                done += 1
                self.stdout.write(f"{ebook}: {package.chapters.count()} chapters")
            else:
                if not force and PdfTextIndex.objects.filter(ebook=ebook).exists():
                    continue
                index = build_text_index(ebook)
                if index.ok:
                    done += 1
                    self.stdout.write(f"{ebook}: {index.page_count} pages of text")
                else:
                    failed += 1
                    self.stderr.write(f"{ebook}: no text ({index.error})")
        self.stdout.write(self.style.SUCCESS(f"processed {done}, failed {failed}"))
        if reanchor:
            from apps.reader.services.reanchor import needs_reanchor, reanchor_book

            for ebook in EbookFile.objects.filter(is_active=True).select_related("book"):
                if needs_reanchor(ebook.book, ebook.version):
                    result = reanchor_book(ebook.book, ebook)
                    self.stdout.write(f"{ebook}: {result}")
