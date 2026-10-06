import pytest

from apps.catalog.models import Book
from apps.wishlist.models import WishlistItem
from apps.wishlist.services import wishlist as svc

from .conftest import login

pytestmark = pytest.mark.django_db

URL = "/api/v1/wishlist/"


@pytest.mark.parametrize(
    "method,path",
    [("get", URL), ("post", URL), ("get", URL + "ids/"), ("delete", URL + "1/")],
)
def test_anonymous_gets_401(api, method, path):
    assert getattr(api, method)(path).status_code == 401


def test_add_list_ids_delete(api, user, book):
    login(api, user)
    res = api.post(URL, {"book_id": book.id}, format="json")
    assert res.status_code == 201
    res = api.post(URL, {"book_id": book.id}, format="json")
    assert res.status_code == 200
    assert WishlistItem.objects.filter(user=user).count() == 1

    data = api.get(URL).json()
    assert len(data) == 1
    card = data[0]["book"]
    assert card["id"] == book.id
    assert card["slug"] == book.slug
    assert card["min_price"] == 2_200_000
    assert "in_stock" in card and "badges" in card
    assert data[0]["added_at"]

    assert api.get(URL + "ids/").json() == [book.id]

    assert api.delete(f"{URL}{book.id}/").status_code == 204
    assert api.delete(f"{URL}{book.id}/").status_code == 204
    assert api.get(URL + "ids/").json() == []


@pytest.mark.parametrize("payload", [{}, {"book_id": 999999}, {"book_id": "x"}])
def test_add_invalid_book_400(api, user, payload):
    login(api, user)
    res = api.post(URL, payload, format="json")
    assert res.status_code == 400
    assert "book_id" in res.json()


def test_add_inactive_book_400(api, user):
    hidden = Book.objects.create(title="غیرفعال", is_active=False)
    login(api, user)
    assert api.post(URL, {"book_id": hidden.id}, format="json").status_code == 400


def test_ownership(api, user, other_user, book):
    svc.add(other_user, book)
    login(api, user)
    assert api.get(URL).json() == []
    assert api.get(URL + "ids/").json() == []
    # Deleting only touches one's own list.
    assert api.delete(f"{URL}{book.id}/").status_code == 204
    assert svc.ids(other_user) == [book.id]


def test_force_authenticate_works_too(api, user, book):
    api.force_authenticate(user)
    assert api.post(URL, {"book_id": book.id}, format="json").status_code == 201
