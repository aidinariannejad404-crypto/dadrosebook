"""Create the default Sazito redirects (idempotent; never changes existing rows).

python manage.py seed_redirects
"""

from django.core.management.base import BaseCommand

from apps.seo.services.seed import seed_redirects


class Command(BaseCommand):
    help = "Create missing default redirects from old Sazito URLs (existing rows are kept)."

    def handle(self, *args, **options):
        counts = seed_redirects()
        summary = ", ".join(f"{k}={v}" for k, v in counts.items())
        self.stdout.write(self.style.SUCCESS(f"Redirects seeded: {summary}"))
