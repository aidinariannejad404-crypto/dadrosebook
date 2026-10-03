"""Signals other apps hook onto (Phase 2 cart clearing, Phase 5 analytics)."""

from django.dispatch import Signal

# Sent on commit after an order becomes PAID. kwargs: order.
order_paid = Signal()
