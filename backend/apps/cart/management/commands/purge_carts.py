from django.conf import settings
from django.core.management.base import BaseCommand

from apps.cart.services import purge_stale_carts


class Command(BaseCommand):
    help = "Delete guest carts untouched for CART_TTL_DAYS days."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=None, help="Default: CART_TTL_DAYS")

    def handle(self, *args, days=None, **options):
        days = days if days is not None else settings.CART_TTL_DAYS
        count = purge_stale_carts(days)
        self.stdout.write(self.style.SUCCESS(f"Deleted {count} stale guest cart(s)."))
