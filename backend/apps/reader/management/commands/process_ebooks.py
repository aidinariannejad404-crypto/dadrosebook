from django.core.management.base import BaseCommand

from apps.library.models import EbookFile
from apps.reader.models import EpubPackage
from apps.reader.services.epub import InvalidEpub, process_epub


class Command(BaseCommand):
    help = "Unpack EPUB files for chapter streaming (only missing ones unless --force)."

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Rebuild every EPUB package.")

    def handle(self, *args, force=False, **options):
        qs = EbookFile.objects.filter(format=EbookFile.Format.EPUB).select_related("book")
        done = failed = 0
        for ebook in qs:
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
        self.stdout.write(self.style.SUCCESS(f"processed {done}, failed {failed}"))
