"""ux stream ج۶: guest hearts kept in the browser are merged into the account on login."""

import pytest

from apps.catalog.models import Book
from apps.wishlist.models import WishlistItem
from apps.wishlist.services import wishlist as svc

from .conftest import login

pytestmark = pytest.mark.django_db


def test_clean_ids():
    assert svc.clean_ids([3, "2", 3, -1, "x", None, 0]) == [3, 2]
    assert svc.clean_ids("1,2") == []
    assert svc.clean_ids(list(range(1, 500)), limit=3) == [1, 2, 3]


def test_merge_adds_new_active_books_only(user, book):
    other = Book.objects.create(title="کتاب دوم")
    hidden = Book.objects.create(title="غیرفعال", is_active=False)
    svc.add(user, book)
    result = svc.merge(user, [other.id, book.id, hidden.id, 99999])
    assert set(result) == {book.id, other.id}
    assert WishlistItem.objects.filter(user=user).count() == 2
    assert svc.merge(user, [other.id]) == result  # idempotent


def test_merge_endpoint_requires_login(api, user, book):
    assert api.post(
        "/api/v1/wishlist/merge/", {"book_ids": [book.id]}, format="json"
    ).status_code in (
        401,
        403,
    )
    res = login(api, user).post("/api/v1/wishlist/merge/", {"book_ids": [book.id]}, format="json")
    assert res.status_code == 200
    assert res.json() == {"ids": [book.id]}


def test_guest_cards_are_public_and_ordered(api, book):
    other = Book.objects.create(title="کتاب دوم")
    res = api.get("/api/v1/wishlist/cards/", {"ids": f"{other.id},{book.id},abc,999"})
    assert res.status_code == 200
    assert [c["id"] for c in res.json()] == [other.id, book.id]
