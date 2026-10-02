"""Seed the Phase 1 catalogue (idempotent).

python manage.py seed_catalog                    # exam types, subjects, categories, books…
python manage.py seed_catalog --with-superuser   # also admin 09120000000 / "admin" (DEBUG only)
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.catalog import seed_data
from apps.catalog.services.seed import seed_catalog


class Command(BaseCommand):
    help = "Seed exam types, subjects, categories, books, kits, banners and guide videos."

    def add_arguments(self, parser):
        parser.add_argument(
            "--with-superuser",
            action="store_true",
            help=(
                f"Create superuser {seed_data.SUPERUSER_PHONE} with password "
                f'"{seed_data.SUPERUSER_PASSWORD}". Only allowed when DEBUG=True.'
            ),
        )

    def handle(self, *args, **options):
        counts = seed_catalog()
        summary = ", ".join(f"{k}={v}" for k, v in counts.items())
        self.stdout.write(self.style.SUCCESS(f"Catalogue seeded: {summary}"))

        if options["with_superuser"]:
            self._create_superuser()

    def _create_superuser(self):
        if not settings.DEBUG:
            self.stderr.write(
                self.style.WARNING("--with-superuser ignored: only allowed when DEBUG=True.")
            )
            return
        User = get_user_model()
        if User.objects.filter(phone=seed_data.SUPERUSER_PHONE).exists():
            self.stdout.write(f"Superuser {seed_data.SUPERUSER_PHONE} already exists.")
            return
        User.objects.create_superuser(seed_data.SUPERUSER_PHONE, seed_data.SUPERUSER_PASSWORD)
        self.stdout.write(
            self.style.SUCCESS(
                f"Superuser {seed_data.SUPERUSER_PHONE} / {seed_data.SUPERUSER_PASSWORD} created."
            )
        )
