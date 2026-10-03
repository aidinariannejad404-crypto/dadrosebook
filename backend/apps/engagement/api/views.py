from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.catalog.models import BookVariant

from ..services import BackInStockError, request_back_in_stock
from ..services.back_in_stock import CREATED_MESSAGE, EXISTING_MESSAGE
from .serializers import BackInStockRequestSerializer

VARIANT_NOT_FOUND = "این نسخه پیدا نشد."


class BackInStockView(APIView):
    """``POST /back-in-stock/`` — throttled per IP (``back_in_stock`` scope, 10/hour)."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "back_in_stock"

    def post(self, request):
        serializer = BackInStockRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        variant = BookVariant.objects.select_related("book").filter(pk=data["variant_id"]).first()
        if variant is None:
            raise NotFound(VARIANT_NOT_FOUND)
        try:
            obj, created = request_back_in_stock(
                variant,
                data["phone"],
                user=getattr(request, "user", None),
                source=data.get("source") or "",
            )
        except DjangoValidationError as exc:
            return Response({"phone": exc.messages}, status=status.HTTP_400_BAD_REQUEST)
        except BackInStockError as exc:
            return Response(
                {"code": exc.code, "detail": exc.detail}, status=status.HTTP_400_BAD_REQUEST
            )
        return Response(
            {
                "id": obj.pk,
                "status": obj.status,
                "created": created,
                "message": CREATED_MESSAGE if created else EXISTING_MESSAGE,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
