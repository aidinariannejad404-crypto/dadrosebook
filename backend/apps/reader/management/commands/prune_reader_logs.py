from django.core.management.base import BaseCommand

from apps.reader.services.audit import prune


class Command(BaseCommand):
    help = "Delete reader access-log rows older than --days (default 180)."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=180)

    def handle(self, *args, days=180, **options):
        self.stdout.write(f"deleted {prune(days)} rows")
