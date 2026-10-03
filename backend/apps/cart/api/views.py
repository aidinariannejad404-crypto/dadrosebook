"""Cart API (``/api/v1/cart/``). Cart identity: ``X-Cart-Token`` header (+ user from Phase 3)."""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import BookVariant

from ..services import (
    CartError,
    add_item,
    bulk_add,
    cart_summary,
    clear_cart,
    get_cart_for_request,
    remove_item,
    set_quantity,
)
from ..services.rules import INVALID_QUANTITY, NOT_FOUND
from .serializers import AddItemSerializer, BulkAddSerializer, CartSerializer, QuantitySerializer

VARIANT_NOT_FOUND = "این نسخه پیدا نشد."


class CartAPIView(APIView):
    """Base: renders carts and ``CartError``s; every response is ``Cache-Control: no-store``."""

    def cart_data(self, cart):
        return CartSerializer(cart_summary(cart), context={"request": self.request}).data

    def cart_response(self, cart, status_code=status.HTTP_200_OK):
        return Response(self.cart_data(cart), status=status_code)

    def error_response(self, exc: CartError, cart, status_code=None):
        if status_code is None:
            not_found = exc.code == NOT_FOUND
            status_code = status.HTTP_404_NOT_FOUND if not_found else status.HTTP_400_BAD_REQUEST
        body = {
            "code": exc.code,
            "detail": exc.detail,
            "cart": self.cart_data(cart) if cart is not None else None,
        }
        return Response(body, status=status_code)

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "no-store"
        return response


class CartView(CartAPIView):
    def get(self, request):
        return self.cart_response(get_cart_for_request(request))

    def delete(self, request):
        cart = get_cart_for_request(request, create=True)
        clear_cart(cart)
        return self.cart_response(cart)


class CartItemsView(CartAPIView):
    def post(self, request):
        cart = get_cart_for_request(request, create=True)
        serializer = AddItemSerializer(data=request.data)
        # Every POST error is a 400 (contract table), including an unknown variant (not_found).
        bad_request = status.HTTP_400_BAD_REQUEST
        if not serializer.is_valid():
            exc = (
                CartError(NOT_FOUND, VARIANT_NOT_FOUND)
                if "variant_id" in serializer.errors
                else CartError(INVALID_QUANTITY)
            )
            return self.error_response(exc, cart, bad_request)
        data = serializer.validated_data
        variant = BookVariant.objects.filter(pk=data["variant_id"]).first()
        try:
            if variant is None:
                raise CartError(NOT_FOUND, VARIANT_NOT_FOUND)
            add_item(cart, variant, data["quantity"])
        except CartError as exc:
            return self.error_response(exc, cart, bad_request)
        return self.cart_response(cart, status.HTTP_201_CREATED)


class CartItemDetailView(CartAPIView):
    def patch(self, request, item_id: int):
        cart = get_cart_for_request(request, create=True)
        serializer = QuantitySerializer(data=request.data)
        if not serializer.is_valid():
            return self.error_response(CartError(INVALID_QUANTITY), cart)
        try:
            set_quantity(cart, item_id, serializer.validated_data["quantity"])
        except CartError as exc:
            return self.error_response(exc, cart)
        return self.cart_response(cart)

    def delete(self, request, item_id: int):
        cart = get_cart_for_request(request, create=True)
        try:
            remove_item(cart, item_id)
        except CartError as exc:
            return self.error_response(exc, cart)
        return self.cart_response(cart)


class CartBulkView(CartAPIView):
    def post(self, request):
        serializer = BulkAddSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cart = get_cart_for_request(request, create=True)
        added, skipped = bulk_add(cart, serializer.validated_data["items"])
        return Response({"cart": self.cart_data(cart), "added": added, "skipped": skipped})
