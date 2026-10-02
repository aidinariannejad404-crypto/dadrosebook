from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.catalog.models import Book

from ..models import Review
from ..services import reviews as svc
from .serializers import MyReviewSerializer, ReviewSerializer, ReviewSubmitSerializer

BOOK_NOT_FOUND = "کتاب پیدا نشد."
SUBMITTED_MESSAGE = "نظر شما ثبت شد و پس از بررسی نمایش داده می‌شود."


class BookReviewsView(APIView):
    """``GET`` public approved reviews + summary; ``POST`` (login) submit or update one's review."""

    throttle_scope = "reviews"

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated()]
        return []

    def get_throttles(self):
        if self.request.method == "POST":
            return [ScopedRateThrottle()]
        return []

    def _book(self, slug: str) -> Book:
        book = Book.objects.filter(slug=slug, is_active=True).first()
        if book is None:
            raise NotFound(BOOK_NOT_FOUND)
        return book

    def get(self, request, slug):
        book = self._book(slug)
        return Response(
            {
                "summary": svc.summary(book),
                "results": ReviewSerializer(svc.public_reviews(book), many=True).data,
            }
        )

    def post(self, request, slug):
        book = self._book(slug)
        serializer = ReviewSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        review, _ = svc.submit_review(
            request.user,
            book,
            rating=data["rating"],
            body=data.get("body") or "",
            exam_type=data.get("exam_type"),
        )
        return Response(
            {"status": review.status, "message": SUBMITTED_MESSAGE},
            status=status.HTTP_201_CREATED,
        )


class MyReviewsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        reviews = (
            Review.objects.filter(user=request.user)
            .select_related("user", "book", "exam_type")
            .order_by("-created_at", "-id")
        )
        return Response(MyReviewSerializer(reviews, many=True).data)
