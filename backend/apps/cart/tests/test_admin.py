import pytest

from apps.accounts.models import User
from apps.cart.models import Cart
from apps.cart.services import add_item

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client(client):
    client.force_login(User.objects.create_superuser("09120000000", "admin-pass"))
    return client


def test_cart_admin_pages(admin_client, books):
    cart = Cart.objects.create()
    add_item(cart, books["print"], 2)
    assert admin_client.get("/admin/cart/cart/").status_code == 200
    assert admin_client.get(f"/admin/cart/cart/{cart.pk}/change/").status_code == 200
