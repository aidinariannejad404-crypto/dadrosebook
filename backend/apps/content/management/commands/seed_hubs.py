"""Placeholder hub intros, a draft demo guide and a demo curated list (package ب).

python manage.py seed_hubs        # idempotent: never overwrites text edited in the admin
"""

from django.core.management.base import BaseCommand

from apps.content.services.seed import seed_hubs


class Command(BaseCommand):
    help = "Seed placeholder exam intros, a draft demo guide and a demo curated list."

    def handle(self, *args, **options):
        counts = seed_hubs()
        self.stdout.write(
            "Hubs seeded: " + ", ".join(f"{key}={value}" for key, value in counts.items())
        )
