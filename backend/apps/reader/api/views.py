from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.cache import add_never_cache_headers, patch_cache_control
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import (
    APIException,
    NotAuthenticated,
    NotFound,
    Throttled,
    ValidationError,
)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.views import APIView

from apps.catalog.models import Book

from ..models import Bookmark, Highlight
from ..services import audit, devices, export, offline, problems, quota, sample
from ..services.access import ReaderError, require_access
from ..services.bookmarks import BookmarkLimit, add_bookmark, user_bookmarks
from ..services.highlights import HighlightLimit, create_highlight, user_highlights
from ..services.progress import get_progress, save_progress
from ..services.search import BadQuery, search
from ..services.session import chapter_payload, epub_package_for, reader_session
from ..services.signing import CONTENT_TYPES, redeem_asset_token, redeem_token
from .serializers import (
    BookmarkSerializer,
    CopySerializer,
    DeviceSerializer,
    HighlightSerializer,
    HighlightUpdateSerializer,
    OfflineLicenseSerializer,
    ProblemReportSerializer,
    ProgressSerializer,
    ReaderSessionSerializer,
    SampleSessionSerializer,
)
from .throttles import (
    ChapterDayThrottle,
    ChapterMinuteThrottle,
    CopyThrottle,
    DeviceRemoveThrottle,
    ExportThrottle,
    OfflineThrottle,
    ProblemReportThrottle,
    SampleFileThrottle,
    SampleThrottle,
    SearchThrottle,
)

BOOK_NOT_FOUND = "کتاب پیدا نشد."


DEVICE_HEADER = "HTTP_X_READER_DEVICE"


class ReaderAPIException(APIException):
    def __init__(self, error: ReaderError):
        self.status_code = error.status
        body = {"detail": error.message, "code": error.code}
        if isinstance(error, devices.DeviceLimit):
            body["devices"] = DeviceSerializer(error.devices, many=True).data
        if isinstance(error, offline.OfflineLimit):
            body["licenses"] = OfflineLicenseSerializer(error.licenses, many=True).data
        super().__init__(body)
        self.detail = body  # keep ids and booleans typed (APIException stringifies nested data)


def to_api_error(exc):
    if isinstance(exc, ReaderError):
        return ReaderAPIException(exc)
    if isinstance(exc, Throttled):
        return Throttled(exc.wait, detail="درخواست‌ها زیاد بود؛ کمی صبر کنید و دوباره تلاش کنید.")
    return exc


def private(response):
    add_never_cache_headers(response)
    patch_cache_control(response, private=True)
    return response


class ReaderBaseView(APIView):
    """Base: authenticated user, Persian errors, never cached."""

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

    def handle_exception(self, exc):
        return super().handle_exception(to_api_error(exc))

    def finalize_response(self, request, response, *args, **kwargs):
        return private(super().finalize_response(request, response, *args, **kwargs))

    def device(self):
        """Register this request's reading device (raises ``DeviceLimit``)."""
        request = self.request
        return devices.register(
            request.user, request.META.get(DEVICE_HEADER), request.META.get("HTTP_USER_AGENT", "")
        )


class ReaderView(ReaderBaseView):
    """Book-scoped reader endpoint (inactive books stay readable for owners)."""

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.book = get_object_or_404(Book, slug=kwargs["slug"])

    def check_access(self):
        require_access(self.request.user, self.book)


class ReadView(ReaderView):
    def get(self, request, slug):
        try:
            self.check_access()
        except ReaderError:
            audit.log(request, audit.Kind.DENIED, user=request.user, book=self.book)
            raise
        device = self.device()
        data = reader_session(request, request.user, self.book, device)
        audit.log(request, audit.Kind.OPEN, user=request.user, book=self.book, device=device)
        return Response(ReaderSessionSerializer(data, context={"request": request}).data)


class ChapterView(ReaderView):
    throttle_classes = [ChapterMinuteThrottle, ChapterDayThrottle]

    def get(self, request, slug, index):
        package = epub_package_for(request.user, self.book)
        device = self.device()
        data = chapter_payload(request.user, package, index)
        audit.log(
            request,
            audit.Kind.CHAPTER,
            user=request.user,
            book=self.book,
            device=device,
            detail=str(index),
        )
        return Response(data)


class SearchView(ReaderView):
    throttle_classes = [SearchThrottle]

    def get(self, request, slug):
        package = epub_package_for(request.user, self.book)
        device = self.device()
        try:
            data = search(package, request.query_params.get("q"))
        except BadQuery as exc:
            raise ValidationError({"q": str(exc)}) from exc
        audit.log(
            request,
            audit.Kind.SEARCH,
            user=request.user,
            book=self.book,
            device=device,
            detail=request.query_params.get("q", ""),
        )
        return Response(data)


class BookmarkListView(ReaderView):
    def get(self, request, slug):
        self.check_access()
        return Response(BookmarkSerializer(user_bookmarks(request.user, self.book), many=True).data)

    def post(self, request, slug):
        self.check_access()
        serializer = BookmarkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            bookmark, created = add_bookmark(request.user, self.book, **serializer.validated_data)
        except BookmarkLimit as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(
            BookmarkSerializer(bookmark).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class BookmarkDetailView(ReaderView):
    def delete(self, request, slug, pk):
        self.check_access()
        get_object_or_404(Bookmark, pk=pk, user=request.user, book=self.book).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DeviceListView(ReaderBaseView):
    def get(self, request):
        current = devices.ReaderDevice.objects.filter(
            user=request.user, key=devices.device_key(request.META.get(DEVICE_HEADER))
        ).first()
        context = {"current_id": current.pk if current else None}
        qs = devices.active_devices(request.user)
        return Response(DeviceSerializer(qs, many=True, context=context).data)


class DeviceDetailView(ReaderBaseView):
    throttle_classes = [DeviceRemoveThrottle]

    def delete(self, request, pk):
        if not devices.remove(request.user, pk):
            raise NotFound({"detail": "دستگاه پیدا نشد.", "code": "no_device"})
        return Response(status=status.HTTP_204_NO_CONTENT)


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
            ebook_version=data.get("ebook_version"),
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
        return private(super().handle_exception(to_api_error(exc)))

    def get(self, request, token):
        ebook, user = redeem_token(token)
        audit.log(request, audit.Kind.FILE, user=user, book=ebook.book, detail=f"v{ebook.version}")
        response = FileResponse(
            ebook.file.open("rb"),
            content_type=CONTENT_TYPES[ebook.format],
            as_attachment=False,
        )
        response["Content-Disposition"] = "inline"
        response["X-Content-Type-Options"] = "nosniff"
        response["Referrer-Policy"] = "no-referrer"
        return private(response)


class EpubAssetView(FileView):
    """Streams one EPUB image for a valid signed token (local storage only)."""

    def get(self, request, token):
        asset, _user = redeem_asset_token(token)
        response = FileResponse(asset.file.open("rb"), content_type=asset.media_type)
        response["Content-Disposition"] = "inline"
        response["X-Content-Type-Options"] = "nosniff"
        response["Referrer-Policy"] = "no-referrer"
        response["Content-Security-Policy"] = "default-src 'none'; sandbox"
        return private(response)


class CopyView(ReaderView):
    throttle_classes = [CopyThrottle]

    def post(self, request, slug):
        self.check_access()
        serializer = CopySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(
            quota.record_copy(request.user, self.book, serializer.validated_data["chars"])
        )


class NotesExportView(ReaderView):
    throttle_classes = [ExportThrottle]

    def get(self, request, slug):
        self.check_access()
        fmt = request.query_params.get("format", "md")
        if fmt not in ("md", "html"):
            raise ValidationError({"format": "قالب باید md یا html باشد."})
        if fmt == "md":
            body = export.render_markdown(request.user, self.book)
            response = HttpResponse(body, content_type="text/markdown; charset=utf-8")
        else:
            body = export.render_html(request.user, self.book)
            response = HttpResponse(body, content_type="text/html; charset=utf-8")
            response["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'"
        response["Content-Disposition"] = export.content_disposition(self.book, fmt)
        response["X-Content-Type-Options"] = "nosniff"
        audit.log(request, audit.Kind.EXPORT, user=request.user, book=self.book, detail=fmt)
        return response


class OfflineView(ReaderView):
    throttle_classes = [OfflineThrottle]

    def post(self, request, slug):
        device = self.device()
        license_, package, created = offline.issue(request.user, self.book, device)
        audit.log(
            request,
            audit.Kind.OFFLINE,
            user=request.user,
            book=self.book,
            device=device,
            detail="new" if created else "renew",
        )
        return Response(
            {"license": OfflineLicenseSerializer(license_).data, "package": package},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class OfflineListView(ReaderBaseView):
    def get(self, request):
        licenses = offline.live_licenses(request.user)
        return Response(OfflineLicenseSerializer(licenses, many=True).data)


class OfflineDetailView(ReaderBaseView):
    def delete(self, request, pk):
        if not offline.revoke(request.user, pk):
            raise NotFound({"detail": "مجوز آفلاین پیدا نشد.", "code": "no_license"})
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------- د۵: free sample in the real reader (no login) ----------


class SampleBaseView(APIView):
    """Open to everyone, throttled by IP, never cached, Persian errors."""

    permission_classes = [AllowAny]
    authentication_classes = [*api_settings.DEFAULT_AUTHENTICATION_CLASSES, SessionAuthentication]
    throttle_classes = [SampleThrottle]

    def handle_exception(self, exc):
        return private(super().handle_exception(to_api_error(exc)))

    def finalize_response(self, request, response, *args, **kwargs):
        return private(super().finalize_response(request, response, *args, **kwargs))

    def book(self, slug) -> Book:
        return get_object_or_404(Book, slug=slug, is_active=True)


class SampleSessionView(SampleBaseView):
    def get(self, request, slug):
        data = sample.sample_session(request, self.book(slug))
        return Response(SampleSessionSerializer(data, context={"request": request}).data)


class SampleChapterView(SampleBaseView):
    def get(self, request, slug, index):
        return Response(sample.sample_chapter(self.book(slug), index))


class SampleFileView(SampleBaseView):
    throttle_classes = [SampleFileThrottle]

    def get(self, request, slug):
        ebook = sample.require_sample(self.book(slug))
        if ebook.format != ebook.Format.PDF:
            raise sample.NoSample
        pdf = sample.pdf_sample(ebook)
        response = FileResponse(pdf.file.open("rb"), content_type=CONTENT_TYPES[ebook.format])
        response["Content-Disposition"] = "inline"
        response["X-Content-Type-Options"] = "nosniff"
        response["Referrer-Policy"] = "no-referrer"
        return private(response)


class SampleAssetView(SampleBaseView):
    def get(self, request, token):
        asset = sample.redeem_sample_asset(token)
        response = FileResponse(asset.file.open("rb"), content_type=asset.media_type)
        response["Content-Disposition"] = "inline"
        response["X-Content-Type-Options"] = "nosniff"
        response["Referrer-Policy"] = "no-referrer"
        response["Content-Security-Policy"] = "default-src 'none'; sandbox"
        return private(response)


# ---------- ه۸: «گزارش مشکل» ----------


class ProblemReportView(ReaderView):
    throttle_classes = [ProblemReportThrottle]

    def post(self, request, slug):
        serializer = ProblemReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        report = problems.create_report(
            request.user,
            self.book,
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            **serializer.validated_data,
        )
        return Response(ProblemReportSerializer(report).data, status=status.HTTP_201_CREATED)
