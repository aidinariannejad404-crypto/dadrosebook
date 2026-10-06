from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.cache import cache_page
from django.views.decorators.http import require_GET
from rest_framework import permissions, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.parsers import FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from ..models import Gift
from ..services import campaigns as campaign_service
from ..services import gifts as gift_service
from ..services import kit_shares, torob
from . import serializers as s

FEED_CACHE_SECONDS = 15 * 60


# --- و۱ Torob / Emalls ------------------------------------------------------------------------


def _list_param(data, key: str) -> list:
    """``page_urls`` may arrive as a JSON list, ``page_urls[]`` form fields or one string."""
    for name in (key, f"{key}[]"):
        if hasattr(data, "getlist"):
            values = data.getlist(name)
            if len(values) == 1 and isinstance(values[0], list):
                values = values[0]
        else:
            values = data.get(name)
        if values:
            return values if isinstance(values, list) else [values]
    return []


class TorobProductsView(APIView):
    """``POST /torob_api/v3/products`` (storefront rewrite) — Torob's product web service v3."""

    authentication_classes: list = []
    permission_classes = [permissions.AllowAny]
    parser_classes = [JSONParser, FormParser]

    def _authorize(self, request):
        mode = torob.auth_mode()
        if mode == "open":
            return
        if mode == "closed":
            raise PermissionDenied("Torob public key is not configured.")
        try:
            torob.verify_token(request.headers.get("X-Torob-Token"))
        except torob.TorobAuthError as exc:
            raise PermissionDenied(f"Invalid X-Torob-Token: {exc}") from exc

    def post(self, request):
        self._authorize(request)
        data = request.data if request.data else request.query_params
        page_urls = _list_param(data, "page_urls")
        page_uniques = _list_param(data, "page_uniques")
        build_url = request.build_absolute_uri
        if page_urls or page_uniques:
            body = torob.products_for(page_urls, page_uniques, build_url=build_url)
        else:
            try:
                page = int(data.get("page") or 1)
            except (TypeError, ValueError):
                page = 1
            body = torob.products_page(page, build_url=build_url)
        return Response(body)


@require_GET
@cache_page(FEED_CACHE_SECONDS)
def emalls_json(request):
    items = torob.emalls_items(build_url=request.build_absolute_uri)
    return JsonResponse(
        {"count": len(items), "products": items}, json_dumps_params={"ensure_ascii": False}
    )


@require_GET
@cache_page(FEED_CACHE_SECONDS)
def emalls_xml(request):
    body = torob.emalls_xml(torob.emalls_items(build_url=request.build_absolute_uri))
    return HttpResponse(body, content_type="application/xml; charset=utf-8")


# --- و۳ kit share links -----------------------------------------------------------------------


class KitShareCreateView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "kit_share"

    def post(self, request):
        ser = s.KitShareCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            share = kit_shares.create_share(
                ser.validated_data.get("exam"), ser.validated_data["variant_ids"]
            )
        except kit_shares.KitShareError as exc:
            return Response({"detail": exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {"token": share.token, "path": f"/kit?k={share.token}"}, status=status.HTTP_201_CREATED
        )


class KitShareResolveView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        params = request.query_params
        token = (params.get("k") or "").strip()[:16]
        slugs = [x for x in (params.get("b") or "").split(",") if x.strip()]
        kit = kit_shares.resolve(token=token or None, slugs=slugs, exam_slug=params.get("exam"))
        if kit is None or not kit.books:
            raise NotFound("این کیت پیدا نشد.")
        return Response(s.serialize_shared_kit(kit, {"request": request}))


# --- و۶ campaigns -----------------------------------------------------------------------------


class CampaignListView(APIView):
    """Running campaigns; ``?placement=home`` only those flagged for the home banner."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        now = timezone.now()
        if request.query_params.get("placement") == "home":
            qs = campaign_service.home_campaigns(now)
        else:
            qs = campaign_service.active_campaigns(now)
        qs = qs.select_related("discount_code")
        ctx = {"request": request, "now": now}
        return Response(s.CampaignSummarySerializer(qs, many=True, context=ctx).data)


class CampaignDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, slug: str):
        campaign = campaign_service.find_campaign(slug)
        if campaign is None:
            raise NotFound("کمپین پیدا نشد.")
        ctx = {"request": request, "now": timezone.now()}
        return Response(s.CampaignDetailSerializer(campaign, context=ctx).data)


# --- و۴ gifts ---------------------------------------------------------------------------------


def _gift_or_404(token: str) -> Gift:
    gift = gift_service.find(token)
    if gift is None:
        raise NotFound(gift_service.MESSAGES["not_found"])
    return gift


class GiftDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, token: str):
        gift = _gift_or_404(token)
        return Response(s.GiftPublicSerializer(gift, context={"request": request}).data)


class GiftClaimView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "gift_claim"

    def post(self, request, token: str):
        ser = s.GiftClaimSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            gift = gift_service.claim(
                token, request.user, address_id=ser.validated_data.get("address_id")
            )
        except gift_service.GiftError as exc:
            return Response({"detail": exc.message, "code": exc.code}, status=exc.status)
        return Response(s.GiftPublicSerializer(gift, context={"request": request}).data)


class OrderGiftView(APIView):
    """The buyer's gift for one of their orders (claim link to share, printable card)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, number: str):
        gift = (
            Gift.objects.select_related("order")
            .filter(order__number=number, order__user=request.user)
            .first()
        )
        if gift is None:
            raise NotFound("این سفارش هدیه نیست.")
        return Response(s.GiftOwnerSerializer(gift, context={"request": request}).data)
