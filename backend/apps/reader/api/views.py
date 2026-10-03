from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils.cache import add_never_cache_headers, patch_cache_control
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import APIException, NotAuthenticated, NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.views import APIView

from apps.catalog.models import Book

from ..models import Highlight
from ..services.access import ReaderError, require_access
from ..services.highlights import HighlightLimit, create_highlight, user_highlights
from ..services.progress import get_progress, save_progress
from ..services.session import reader_session
from ..services.signing import CONTENT_TYPES, redeem_token
from .serializers import (
    HighlightSerializer,
    HighlightUpdateSerializer,
    ProgressSerializer,
    ReaderSessionSerializer,
)

BOOK_NOT_FOUND = "کتاب پیدا نشد."


class ReaderAPIException(APIException):
    def __init__(self, error: ReaderError):
        self.status_code = error.status
        super().__init__({"detail": error.message, "code": error.code})


def private(response):
    add_never_cache_headers(response)
    patch_cache_control(response, private=True)
    return response


class ReaderView(APIView):
    """Base: authenticated user + the book (inactive books stay readable for owners)."""

    permission_classes = [IsAuthenticated]
    # Phase 3's JWT cookie auth comes from the DRF defaults; the admin session also works so the
    # store team can preview uploaded files.
    authentication_classes = [*api_settings.DEFAULT_AUTHENTICATION_CLASSES, SessionAuthentication]

    def permission_denied(self, request, message=None, code=None):
        if not (request.user and request.user.is_authenticated):
            raise NotAuthenticated("برای مطالعه وارد حساب خود شوید.")
        super().permission_denied(request, message, code)

    def get_authenticate_header(self, request):
        return super().get_authenticate_header(request) or 'Bearer realm="api"'

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.book = get_object_or_404(Book, slug=kwargs["slug"])

    def handle_exception(self, exc):
        if isinstance(exc, ReaderError):
            exc = ReaderAPIException(exc)
        return super().handle_exception(exc)

    def finalize_response(self, request, response, *args, **kwargs):
        return private(super().finalize_response(request, response, *args, **kwargs))

    def check_access(self):
        require_access(self.request.user, self.book)


class ReadView(ReaderView):
    def get(self, request, slug):
        data = reader_session(request, request.user, self.book)
        return Response(ReaderSessionSerializer(data, context={"request": request}).data)


class ProgressView(ReaderView):
    def get(self, request, slug):
        self.check_access()
        progress = get_progress(request.user, self.book)
        if progress is None:
            raise NotFound({"detail": "هنوز پیشرفتی ثبت نشده است.", "code": "no_progress"})
        return Response(ProgressSerializer(progress).data)

    def put(self, request, slug):
        self.check_access()
        serializer = ProgressSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        progress = save_progress(
            request.user,
            self.book,
            page=data.get("page", 1),
            total_pages=data.get("total_pages", 0),
            location=data.get("location", ""),
        )
        return Response(ProgressSerializer(progress).data)


class HighlightListView(ReaderView):
    def get(self, request, slug):
        self.check_access()
        page = request.query_params.get("page")
        if page is not None and not page.isdigit():
            raise ValidationError({"page": "شماره صفحه نامعتبر است."})
        qs = user_highlights(request.user, self.book, int(page) if page else None)
        return Response(HighlightSerializer(qs, many=True).data)

    def post(self, request, slug):
        self.check_access()
        serializer = HighlightSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            highlight = create_highlight(request.user, self.book, **serializer.validated_data)
        except HighlightLimit as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(HighlightSerializer(highlight).data, status=status.HTTP_201_CREATED)


class HighlightDetailView(ReaderView):
    def get_highlight(self, pk) -> Highlight:
        self.check_access()
        return get_object_or_404(Highlight, pk=pk, user=self.request.user, book=self.book)

    def patch(self, request, slug, pk):
        highlight = self.get_highlight(pk)
        serializer = HighlightUpdateSerializer(highlight, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(HighlightSerializer(highlight).data)

    def delete(self, request, slug, pk):
        self.get_highlight(pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FileView(APIView):
    """Streams an ebook from private storage for a valid signed token (local storage only)."""

    permission_classes = []
    authentication_classes = []

    def handle_exception(self, exc):
        if isinstance(exc, ReaderError):
            exc = ReaderAPIException(exc)
        return private(super().handle_exception(exc))

    def get(self, request, token):
        ebook, _user = redeem_token(token)
        response = FileResponse(
            ebook.file.open("rb"),
            content_type=CONTENT_TYPES[ebook.format],
            as_attachment=False,
        )
        response["Content-Disposition"] = "inline"
        response["X-Content-Type-Options"] = "nosniff"
        response["Referrer-Policy"] = "no-referrer"
        return private(response)
