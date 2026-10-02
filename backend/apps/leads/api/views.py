from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from ..services.leads import create_study_plan_lead, lead_plan, lead_queryset
from .serializers import StudyPlanRequestSerializer, StudyPlanSerializer

PLAN_NOT_FOUND = "برنامه مطالعه پیدا نشد."


class StudyPlanCreateView(APIView):
    """``POST /leads/study-plan/`` — throttled per IP (``study_plan`` scope, 10/hour)."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "study_plan"

    def post(self, request):
        serializer = StudyPlanRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        ip = ScopedRateThrottle().get_ident(request)
        lead = create_study_plan_lead(
            phone=data["phone"],
            exam_type=data["exam_type"],
            subjects=data["subjects"],
            books=data["books"],
            hours_per_day=data["hours_per_day"],
            consent=data["consent"],
            ip=ip,
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )
        return Response(
            {"token": str(lead.token), "plan_url": f"/plan/{lead.token}"},
            status=status.HTTP_201_CREATED,
        )


class StudyPlanDetailView(APIView):
    def get(self, request, token):
        lead = lead_queryset().filter(token=token).first()
        if lead is None:
            raise NotFound(PLAN_NOT_FOUND)
        data = lead_plan(lead)
        return Response(StudyPlanSerializer(data, context={"request": request}).data)
