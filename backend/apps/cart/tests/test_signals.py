from types import SimpleNamespace

import pytest
from django.contrib.auth.signals import user_logged_in
from django.test import RequestFactory

from apps.accounts.models import User
from apps.cart.models import Cart, CartItem
from apps.cart.services import add_item, get_or_create_cart
from apps.cart.signals import clear_paid_lines

pytestmark = pytest.mark.django_db


def test_login_merges_guest_cart_from_header(books):
    guest = get_or_create_cart(None)
    add_item(guest, books["print"], 1)
    user = User.objects.create_user(phone="09121234567")
    request = RequestFactory().post("/", HTTP_X_CART_TOKEN=str(guest.token))
    user_logged_in.send(sender=User, request=request, user=user)
    cart = Cart.objects.get(user=user)
    assert cart.items.get().variant_id == books["print"].id


def test_login_merges_guest_cart_from_cookie(books):
    guest = get_or_create_cart(None)
    add_item(guest, books["print"], 1)
    user = User.objects.create_user(phone="09121234568")
    request = RequestFactory().post("/")
    request.COOKIES["dadrose_cart_token"] = str(guest.token)
    user_logged_in.send(sender=User, request=request, user=user)
    assert Cart.objects.get(user=user).items.count() == 1


def test_order_paid_clears_bought_lines(books):
    user = User.objects.create_user(phone="09121234569")
    cart = get_or_create_cart(None, user=user)
    add_item(cart, books["print"], 1)
    items = SimpleNamespace(all=lambda: [SimpleNamespace(variant_id=books["print"].id)])
    clear_paid_lines(sender=None, order=SimpleNamespace(user=user, items=items))
    assert not CartItem.objects.filter(cart=cart).exists()
