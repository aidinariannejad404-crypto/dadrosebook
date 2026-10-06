from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..services.library import active_entitlements
from .serializers import LibraryItemSerializer


class LibraryView(APIView):
    """``GET /library/`` → the user's active ebook entitlements."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        items = active_entitlements(request.user)
        return Response(LibraryItemSerializer(items, many=True, context={"request": request}).data)


class ClaimFreeView(APIView):
    """``POST /library/<slug>/claim-free/`` → ه۶ «دریافت رایگان» (login required)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        from django.shortcuts import get_object_or_404
        from rest_framework import status
        from rest_framework.exceptions import ValidationError

        from apps.catalog.models import Book

        from ..services.free import NotFree, claim_free

        book = get_object_or_404(Book, slug=slug, is_active=True)
        try:
            entitlement, created = claim_free(request.user, book)
        except NotFree as exc:
            raise ValidationError({"detail": str(exc), "code": "not_free"}) from exc
        return Response(
            {"book": book.slug, "source": entitlement.source, "created": created},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
