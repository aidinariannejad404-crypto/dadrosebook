"""Account endpoints for د۳/د۴ (impl/trust); contract in ``docs/api-contract.md``."""

from rest_framework import permissions, serializers, status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.orders.services.delivery import exam_slug_from_request

from ..models import StudyReminderConsent
from ..services import notify, readiness, reminders, start

ORDER_NOT_FOUND = "سفارش پرداخت‌شده‌ای با این شماره پیدا نشد."
REQUEST_NOT_FOUND = "درخواست فعالی با این شناسه پیدا نشد."


def _private(response: Response) -> Response:
    response["Cache-Control"] = "private, no-store"
    return response


class ReadinessView(APIView):
    """``GET /me/readiness/?exam=``"""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        body = readiness.readiness(
            request.user,
            exam_slug=exam_slug_from_request(request),
            build_url=request.build_absolute_uri,
        )
        return _private(Response(body))


class NotifyListView(APIView):
    """``GET /me/back-in-stock/``"""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return _private(
            Response(notify.notify_list(request.user, build_url=request.build_absolute_uri))
        )


class NotifyCancelView(APIView):
    """``DELETE /me/back-in-stock/<id>/``"""

    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk: int):
        if not notify.cancel(request.user, pk):
            raise NotFound(REQUEST_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReminderConsentSerializer(serializers.Serializer):
    sms = serializers.BooleanField()
    source = serializers.ChoiceField(
        choices=StudyReminderConsent.Source.choices, required=False, allow_blank=True
    )


class StudyRemindersView(APIView):
    """``GET/PUT /me/study-reminders/``"""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return _private(Response(reminders.state(request.user)))

    def put(self, request):
        ser = ReminderConsentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        reminders.set_consent(
            request.user, ser.validated_data["sms"], source=ser.validated_data.get("source", "")
        )
        return _private(Response(reminders.state(request.user)))


class StartStudyingView(APIView):
    """``GET /me/orders/<number>/start/?exam=``"""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, number: str):
        order = start.paid_order(request.user, number)
        if order is None:
            raise NotFound(ORDER_NOT_FOUND)
        body = start.start_studying(
            request.user,
            order,
            exam_slug=exam_slug_from_request(request),
            build_url=request.build_absolute_uri,
        )
        return _private(Response(body))


class PlanFromOrderSerializer(serializers.Serializer):
    order = serializers.CharField(max_length=20)
    exam_type = serializers.CharField(required=False, allow_blank=True, max_length=80)
    hours_per_day = serializers.IntegerField(
        required=False,
        default=start.DEFAULT_HOURS,
        min_value=1,
        max_value=16,
        error_messages={
            "min_value": "ساعت مطالعه باید حداقل ۱ باشد.",
            "max_value": "ساعت مطالعه حداکثر ۱۶ در روز است.",
        },
    )


class PlanFromOrderView(APIView):
    """``POST /me/study-plan/`` — one-tap plan from a paid order (throttled like the lead form)."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "study_plan"

    def post(self, request):
        ser = PlanFromOrderSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        order = start.paid_order(request.user, data["order"])
        if order is None:
            raise NotFound(ORDER_NOT_FOUND)
        try:
            lead = start.create_plan_from_order(
                request.user,
                order,
                exam_slug=data.get("exam_type") or exam_slug_from_request(request),
                hours_per_day=data["hours_per_day"],
                ip=ScopedRateThrottle().get_ident(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
            )
        except start.StartError as exc:
            return Response({"detail": exc.detail}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {"token": str(lead.token), "plan_url": f"/plan/{lead.token}"},
            status=status.HTTP_201_CREATED,
        )
