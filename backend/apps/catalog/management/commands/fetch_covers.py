"""Download book covers from ``Book.cover_source_url`` (idempotent; never fails on a bad URL).

python manage.py fetch_covers                  # books with a source URL and no cover yet
python manage.py fetch_covers --force          # re-download every cover
python manage.py fetch_covers --limit 5        # at most 5 books
python manage.py fetch_covers --with-samples   # also gallery images → sample pages
"""

from django.core.management.base import BaseCommand

from apps.catalog.services.covers import fetch_covers


class Command(BaseCommand):
    help = "Download book covers (and optionally gallery images as sample pages)."

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Re-download existing images.")
        parser.add_argument("--limit", type=int, default=None, help="At most N books.")
        parser.add_argument(
            "--with-samples",
            action="store_true",
            help="Also save gallery images (except the cover) as sample pages.",
        )

    def handle(self, *args, **options):
        report = fetch_covers(
            force=options["force"], limit=options["limit"], with_samples=options["with_samples"]
        )
        for slug, url, error in report.failures:
            self.stderr.write(f"  ✗ {slug}: {url} — {error}")
        if report.skipped_hosts:
            hosts = ", ".join(sorted(report.skipped_hosts))
            self.stderr.write(self.style.WARNING(f"Unreachable hosts skipped: {hosts}"))
        summary = (
            f"Covers: {report.covers_saved} saved, {report.covers_skipped} already present, "
            f"{report.failed} failed URL(s); sample pages saved: {report.samples_saved}."
        )
        style = self.style.WARNING if report.failed else self.style.SUCCESS
        self.stdout.write(style(summary))
