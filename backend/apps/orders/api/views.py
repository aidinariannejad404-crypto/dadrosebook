from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import Subject
from apps.core.normalize import normalize_persian

from ..models import Address, Order
from ..services import checkout as checkout_service
from ..services import delivery, ownership, shipping
from ..services import quote as quote_service
from .serializers import (
    CheckoutRequestSerializer,
    OrderDetailSerializer,
    OrderSummarySerializer,
    QuoteRequestSerializer,
)

NOT_PAYABLE = "این سفارش قابل پرداخت نیست."


def _orders_qs(user):
    return (
        Order.objects.filter(user=user)
        .select_related("user", "shipping_method")
        .prefetch_related(
            "items__book",
            Prefetch("items__book__subjects", queryset=Subject.objects.order_by("order", "id")),
            "status_logs",
            "payments",
        )
        .order_by("-created_at", "-id")
    )


def _gateway_response(exc):
    from apps.payments.services.gateway import GATEWAY_UNAVAILABLE_MESSAGE

    message = getattr(exc, "message", "") or GATEWAY_UNAVAILABLE_MESSAGE
    return Response({"detail": message}, status=status.HTTP_502_BAD_GATEWAY)


class ShippingMethodListView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes: list = []

    def get(self, request):
        province = (request.query_params.get("province") or "").strip() or None
        raw = normalize_persian(request.query_params.get("subtotal") or "").replace(",", "")
        subtotal = int(raw) if raw.isdigit() else 0
        exam_slug = delivery.exam_slug_from_request(request)
        return Response(shipping.options_for(province, subtotal, exam_slug=exam_slug))


# --- د۱ / د۲ (impl/trust) -------------------------------------------------------------------


class DeliveryEstimateView(APIView):
    """``GET /delivery-estimate/?province=&exam=`` — public; the exam also comes from the cookie."""

    permission_classes = [permissions.AllowAny]
    authentication_classes: list = []

    def get(self, request):
        province = (request.query_params.get("province") or "").strip() or None
        body = delivery.delivery_summary(
            province=province, exam_slug=delivery.exam_slug_from_request(request)
        )
        response = Response(body)
        response["Cache-Control"] = "private, max-age=300"
        return response


class OwnedBooksView(APIView):
    """``GET /me/owned/`` — the books this customer already owns (ids, slugs, formats)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        rows = ownership.owned_books(request.user)
        field = serializers.DateTimeField()
        for row in rows:
            row["purchased_at"] = (
                field.to_representation(row["purchased_at"]) if row["purchased_at"] else None
            )
        response = Response({"books": rows})
        response["Cache-Control"] = "private, no-store"
        return response


class QuoteView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        ser = QuoteRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        user = request.user if request.user.is_authenticated else None
        address = None
        if user is not None and data.get("address_id"):
            address = Address.objects.filter(pk=data["address_id"], user=user).first()
        quote = quote_service.build_quote(
            data["items"],
            user=user,
            address=address,
            province=(data.get("province") or "").strip() or None,
            shipping_method_id=data.get("shipping_method_id"),
            discount_code=data.get("discount_code"),
            build_url=request.build_absolute_uri,
        )
        return Response(quote)


class CheckoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from apps.payments.services.gateway import GatewayError
        from apps.payments.services.payments import PaymentNotAllowed

        ser = CheckoutRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        try:
            order = checkout_service.create_order(
                request.user, data, data["checkout_key"], build_url=request.build_absolute_uri
            )
        except checkout_service.CheckoutError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        try:
            payment_url = checkout_service.begin_payment(order)
        except GatewayError as exc:
            return _gateway_response(exc)
        except PaymentNotAllowed:
            payment_url = None
        order = _orders_qs(request.user).get(pk=order.pk)
        body = {
            "order": OrderDetailSerializer(order, context={"request": request}).data,
            "payment_url": payment_url,
        }
        return Response(body, status=status.HTTP_201_CREATED)


class OrderListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = OrderSummarySerializer

    def get_queryset(self):
        return _orders_qs(self.request.user)


class OrderDetailView(generics.RetrieveAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = OrderDetailSerializer
    lookup_field = "number"

    def get_queryset(self):
        return _orders_qs(self.request.user)


class OrderPayView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, number):
        from apps.payments.services.gateway import GatewayError
        from apps.payments.services.payments import PaymentNotAllowed, start_payment

        from ..services.state import can_pay

        order = get_object_or_404(Order, number=number, user=request.user)
        if not can_pay(order):
            return Response({"detail": NOT_PAYABLE}, status=status.HTTP_400_BAD_REQUEST)
        problems = checkout_service.stock_problems(order)
        if problems:
            return Response({"problems": problems}, status=status.HTTP_400_BAD_REQUEST)
        try:
            payment_url = start_payment(order)
        except GatewayError as exc:
            return _gateway_response(exc)
        except PaymentNotAllowed as exc:
            return Response({"detail": exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"payment_url": payment_url})
