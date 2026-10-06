from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from ..models import SupportTicket
from ..services import tickets
from . import serializers as s

MSG_NOT_FOUND = "درخواستی با این شماره موبایل و کد پیگیری پیدا نشد."


def _error(exc: tickets.TicketError) -> Response:
    body = {"detail": exc.message} if exc.field == "detail" else {exc.field: [exc.message]}
    return Response(body, status=status.HTTP_400_BAD_REQUEST)


def _user(request):
    user = getattr(request, "user", None)
    return user if user is not None and user.is_authenticated else None


class TopicListView(APIView):
    """``GET /support/topics/``."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request):
        return Response([{"value": v, "label": label} for v, label in SupportTicket.Topic.choices])


class TicketListCreateView(APIView):
    """``GET /support/tickets/`` (mine) and ``POST`` (anyone; throttled per IP)."""

    throttle_scope = "support_ticket"

    def get_throttles(self):
        return [ScopedRateThrottle()] if self.request.method == "POST" else []

    def get(self, request):
        user = _user(request)
        if user is None:
            return Response({"detail": "ابتدا وارد شوید."}, status=status.HTTP_401_UNAUTHORIZED)
        rows = tickets.user_tickets(user).select_related("order", "book")
        return Response(s.TicketSummarySerializer(rows, many=True).data)

    def post(self, request):
        ser = s.TicketCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        try:
            ticket = tickets.create_ticket(
                user=_user(request),
                phone=d.get("phone"),
                name=d.get("name", ""),
                topic=d["topic"],
                subject=d.get("subject", ""),
                body=d["body"],
                order_number=d.get("order_number", ""),
                book_slug=d.get("book", ""),
                source=d.get("source", ""),
            )
        except tickets.TicketError as exc:
            return _error(exc)
        return Response(s.TicketDetailSerializer(ticket).data, status=status.HTTP_201_CREATED)


class TicketDetailView(APIView):
    """``GET /support/tickets/<code>/`` for the logged-in owner."""

    permission_classes = [IsAuthenticated]

    def get(self, request, code):
        ticket = tickets.user_ticket(request.user, code)
        if ticket is None:
            return Response({"detail": MSG_NOT_FOUND}, status=status.HTTP_404_NOT_FOUND)
        return Response(s.TicketDetailSerializer(ticket).data)


class TicketReplyView(APIView):
    """``POST /support/tickets/<code>/messages/`` — owner, or a guest sending the phone."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "support_ticket"

    def post(self, request, code):
        ser = s.ReplySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = _user(request)
        ticket = tickets.user_ticket(user, code) if user else None
        if ticket is None:
            ticket = tickets.find_for_guest(ser.validated_data.get("phone"), code)
        if ticket is None:
            return Response({"detail": MSG_NOT_FOUND}, status=status.HTTP_404_NOT_FOUND)
        try:
            tickets.customer_reply(ticket, ser.validated_data["body"])
        except tickets.TicketError as exc:
            return _error(exc)
        ticket.refresh_from_db()
        return Response(s.TicketDetailSerializer(ticket).data, status=status.HTTP_201_CREATED)


class GuestLookupView(APIView):
    """``POST /support/lookup/`` ``{phone, tracking_code}`` — status check without login."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "support_lookup"

    def post(self, request):
        ser = s.GuestLookupSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ticket = tickets.find_for_guest(
            ser.validated_data["phone"], ser.validated_data["tracking_code"]
        )
        if ticket is None:
            return Response({"detail": MSG_NOT_FOUND}, status=status.HTTP_404_NOT_FOUND)
        return Response(s.TicketDetailSerializer(ticket).data)
