import contextlib

from django.conf import settings
from django.contrib.auth.signals import user_logged_in
from django.http import Http404
from rest_framework import exceptions, generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.orders.models import PROVINCES

from ..authentication import _origin_trusted
from ..models import User
from ..services import addresses as address_service
from ..services import otp, tokens
from . import serializers as s

MSG_SESSION_EXPIRED = "نشست شما منقضی شده است؛ دوباره وارد شوید."
MSG_TOO_MANY = "تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید."
MSG_ADDRESS_NOT_FOUND = "نشانی پیدا نشد."


class TooManyRequests(exceptions.Throttled):
    """429 with ``{"detail", "retry_after"}`` and a ``Retry-After`` header."""

    def __init__(self, message: str, retry_after: int | None):
        retry_after = int(retry_after or 1)
        super().__init__(wait=retry_after)
        self.detail = {
            "detail": exceptions.ErrorDetail(message, code="throttled"),
            "retry_after": retry_after,
        }


class AuthEndpoint(APIView):
    """Cookie-less auth endpoints: no access-token authentication, open to everyone.

    They still reject unsafe requests from an untrusted ``Origin`` (login CSRF / logout CSRF).
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def initial(self, request, *args, **kwargs):
        origin = request.headers.get("Origin")
        if origin and not _origin_trusted(origin):
            raise exceptions.PermissionDenied("مبدأ درخواست مجاز نیست.")
        super().initial(request, *args, **kwargs)

    def throttled(self, request, wait):
        raise TooManyRequests(MSG_TOO_MANY, int(wait or 1))


def _client_ip(request) -> str | None:
    # Honour REST_FRAMEWORK["NUM_PROXIES"] like the throttles do.
    ident = ScopedRateThrottle().get_ident(request)
    return ident or None


class OtpRequestView(AuthEndpoint):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_request"

    def post(self, request):
        ser = s.OtpRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            data = otp.request_code(ser.validated_data["phone"], ip=_client_ip(request))
        except otp.OtpThrottled as exc:
            raise TooManyRequests(exc.message, exc.retry_after) from exc
        return Response(data)


class OtpVoiceView(AuthEndpoint):
    """PF-1: ``POST /auth/otp/voice/`` — a fresh code read out in a phone call (when enabled)."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_request"

    def post(self, request):
        ser = s.OtpRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            data = otp.request_code(
                ser.validated_data["phone"], ip=_client_ip(request), channel="voice"
            )
        except otp.VoiceUnavailable as exc:
            return Response({"detail": exc.message}, status=status.HTTP_404_NOT_FOUND)
        except otp.OtpThrottled as exc:
            raise TooManyRequests(exc.message, exc.retry_after) from exc
        return Response(data)


class OtpVerifyView(AuthEndpoint):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_verify"

    def post(self, request):
        ser = s.OtpVerifySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            user, is_new = otp.verify_code(ser.validated_data["phone"], ser.validated_data["code"])
        except otp.OtpError as exc:
            body = {"detail": exc.message} if exc.field == "detail" else {exc.field: [exc.message]}
            return Response(body, status=status.HTTP_400_BAD_REQUEST)
        # Phase 2's cart merge and Django's last_login update hook onto this signal.
        user_logged_in.send(sender=User, request=request._request, user=user)
        access, refresh = tokens.issue_pair(user)
        response = Response({"user": s.MeSerializer(user).data, "is_new": is_new})
        tokens.set_auth_cookies(response, access, refresh)
        return response


class RefreshView(AuthEndpoint):
    def post(self, request):
        raw = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)
        try:
            if not raw:
                raise tokens.TokenError("missing")
            user, access, refresh = tokens.rotate(raw)
        except tokens.TokenError:
            response = Response({"detail": MSG_SESSION_EXPIRED}, status=401)
            response["WWW-Authenticate"] = 'Cookie realm="api"'
            tokens.clear_auth_cookies(response)
            return response
        response = Response({"user": s.MeSerializer(user).data})
        tokens.set_auth_cookies(response, access, refresh)
        return response


class LogoutView(AuthEndpoint):
    def post(self, request):
        raw = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)
        if raw:
            with contextlib.suppress(tokens.TokenError):
                tokens.revoke(tokens.decode(raw, "refresh"))
        response = Response(status=status.HTTP_204_NO_CONTENT)
        tokens.clear_auth_cookies(response)
        return response


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = s.MeSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self):
        return self.request.user


class AddressListCreateView(generics.ListCreateAPIView):
    serializer_class = s.AddressSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return address_service.user_addresses(self.request.user)

    def perform_create(self, serializer):
        try:
            serializer.instance = address_service.create_address(
                self.request.user, serializer.validated_data
            )
        except address_service.AddressLimitReached as exc:
            raise exceptions.ValidationError({"detail": exc.message}) from exc


class AddressDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = s.AddressSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return address_service.user_addresses(self.request.user)

    def get_object(self):
        try:
            return super().get_object()
        except Http404 as exc:
            raise exceptions.NotFound(MSG_ADDRESS_NOT_FOUND) from exc

    def perform_update(self, serializer):
        serializer.instance = address_service.update_address(
            serializer.instance, serializer.validated_data
        )

    def perform_destroy(self, instance):
        address_service.delete_address(instance)


class ProvinceListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(PROVINCES)
