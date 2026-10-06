from django.core.management.base import BaseCommand

from apps.orders.services.state import expire_unpaid


class Command(BaseCommand):
    help = "Cancel PENDING_PAYMENT orders older than ORDER_PAYMENT_TIMEOUT_MINUTES."

    def handle(self, *args, **options):
        count = expire_unpaid()
        self.stdout.write(f"{count} unpaid order(s) cancelled.")
