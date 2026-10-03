import pytest

from apps.catalog.models import Book
from apps.wishlist.models import WishlistItem
from apps.wishlist.services import wishlist as svc

pytestmark = pytest.mark.django_db


def test_add_is_idempotent(user, book):
    item, created = svc.add(user, book)
    assert created
    again, created_again = svc.add(user, book)
    assert not created_again
    assert again.id == item.id
    assert WishlistItem.objects.count() == 1


def test_remove(user, other_user, book):
    svc.add(user, book)
    svc.add(other_user, book)
    assert svc.remove(user, book.id) is True
    assert svc.remove(user, book.id) is False
    assert svc.ids(user) == []
    assert svc.ids(other_user) == [book.id]


def test_ids_newest_first_and_active_only(user, book):
    second = Book.objects.create(title="آیین دادرسی مدنی")
    hidden = Book.objects.create(title="کتاب غیرفعال", is_active=False)
    svc.add(user, book)
    svc.add(user, second)
    svc.add(user, hidden)
    assert svc.ids(user) == [second.id, book.id]
