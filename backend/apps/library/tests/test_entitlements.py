import pytest
from django.contrib.auth.models import AnonymousUser

from apps.library.models import EbookEntitlement
from apps.library.services import entitlements as svc
from apps.orders.models import Order, OrderItem

pytestmark = pytest.mark.django_db


def test_has_entitlement_anonymous(make_book):
    book = make_book("کتاب")
    assert svc.has_entitlement(AnonymousUser(), book) is False
    assert svc.has_entitlement(None, book) is False


def test_grant_idempotent_and_revoke(user, make_book):
    book = make_book("کتاب")
    first = svc.grant(user, book)
    second = svc.grant(user, book.pk)
    assert first.pk == second.pk
    assert EbookEntitlement.objects.count() == 1
    assert first.source == EbookEntitlement.Source.ADMIN
    assert svc.has_entitlement(user, book)
    assert list(svc.library_books(user)) == [book]

    EbookEntitlement.objects.filter(pk=first.pk).update(revoked_at="2026-01-01T00:00:00Z")
    assert not svc.has_entitlement(user, book)
    assert list(svc.library_books(user)) == []
    again = svc.grant(user, book)
    assert again.pk == first.pk and again.revoked_at is None
    assert svc.has_entitlement(user, book)


def test_grant_for_order_and_revoke(user, make_book):
    ebook, bundle, printed = make_book("الف"), make_book("ب"), make_book("ج")
    order = Order.objects.create(user=user, total=100, status=Order.Status.PAID)
    for book, kind in ((ebook, "EBOOK"), (bundle, "BUNDLE"), (printed, "PRINT")):
        OrderItem.objects.create(
            order=order, book=book, title=book.title, variant_type=kind,
            list_price=10, unit_price=10, line_total=10,
        )  # fmt: skip
    granted = svc.grant_for_order(order)
    assert {e.book_id for e in granted} == {ebook.pk, bundle.pk}
    assert all(e.source == EbookEntitlement.Source.PURCHASE for e in granted)
    assert len(svc.grant_for_order(order)) == 2
    assert EbookEntitlement.objects.count() == 2
    assert svc.revoke_for_order(order) == 2
    assert not svc.has_entitlement(user, ebook)
    assert svc.library_books(AnonymousUser()).count() == 0
