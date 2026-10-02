from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.api.serializers import BookCardSerializer
from apps.catalog.models import Book
from apps.catalog.services.books import book_card_queryset

from ..services import wishlist as svc

BOOK_INVALID = "کتاب انتخاب‌شده معتبر نیست."


class WishlistAddSerializer(serializers.Serializer):
    book_id = serializers.IntegerField(
        error_messages={
            "required": "کتاب را مشخص کنید.",
            "null": "کتاب را مشخص کنید.",
            "invalid": BOOK_INVALID,
        }
    )

    def validate_book_id(self, value):
        book = Book.objects.filter(id=value, is_active=True).first()
        if book is None:
            raise serializers.ValidationError(BOOK_INVALID)
        return book


class WishlistView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        items = svc.items(request.user)
        books = {
            b.id: b
            for b in book_card_queryset(Book.objects.filter(id__in=[i.book_id for i in items]))
        }
        rows = [(books[i.book_id], i.created_at) for i in items if i.book_id in books]
        cards = BookCardSerializer(
            [book for book, _ in rows], many=True, context={"request": request}
        ).data
        return Response(
            [
                {"book": card, "added_at": serializers.DateTimeField().to_representation(added)}
                for card, (_, added) in zip(cards, rows, strict=True)
            ]
        )

    def post(self, request):
        serializer = WishlistAddSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item, created = svc.add(request.user, serializer.validated_data["book_id"])
        return Response(
            {
                "book_id": item.book_id,
                "added_at": serializers.DateTimeField().to_representation(item.created_at),
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class WishlistItemView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, book_id: int):
        svc.remove(request.user, book_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class WishlistIdsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(svc.ids(request.user))
