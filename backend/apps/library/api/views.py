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
