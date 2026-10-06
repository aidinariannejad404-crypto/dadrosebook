from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..services import changelog, notifications, study_profile, summary
from . import serializers as s


class NavSummaryView(APIView):
    """``GET /inbox/summary/``: unread count, library tab, «ادامه مطالعه», onboarding flag."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = s.summary_payload(summary.nav_summary(request.user), request)
        return Response(data, headers={"Cache-Control": "private, no-store"})


class NotificationListView(generics.ListAPIView):
    """``GET /inbox/`` — «پیام‌های من», newest first (paginated)."""

    serializer_class = s.NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return notifications.user_notifications(self.request.user)


class MarkReadView(APIView):
    """``POST /inbox/read/`` ``{ids?}`` — mark those (or all) messages read."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = s.MarkReadSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        changed = notifications.mark_read(request.user, ser.validated_data.get("ids"))
        return Response(
            {"marked": changed, "unread": notifications.unread_count(request.user)},
        )


class PersonalCodesView(APIView):
    """``GET /inbox/codes/`` — «کدهای تخفیف من»."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = notifications.personal_codes(request.user)
        return Response(s.PersonalCodeSerializer(rows, many=True).data)


class NotificationSettingsView(APIView):
    """``GET/PATCH /me/notification-settings/`` ``{changes: {kind: enabled}}``."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        prefs = notifications.preferences(request.user)
        return Response(s.PreferenceSerializer(prefs, many=True).data)

    def patch(self, request):
        ser = s.PreferencesUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            prefs = notifications.set_preferences(request.user, ser.validated_data["changes"])
        except notifications.PreferenceError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(s.PreferenceSerializer(prefs, many=True).data)


class StudyProfileView(APIView):
    """``GET/PUT /me/study-profile/`` (PF-8)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = study_profile.get_profile(request.user)
        return Response(s.study_profile_payload(request.user, profile))

    def put(self, request):
        ser = s.StudyProfileWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        try:
            profile = study_profile.save_profile(
                request.user,
                exam_type=data.get("exam_type") or None,
                exam_year=data.get("exam_year"),
                exam_date=data.get("exam_date"),
                weak_subjects=data.get("weak_subjects") or [],
            )
        except study_profile.StudyProfileError as exc:
            return Response({exc.field: [exc.message]}, status=status.HTTP_400_BAD_REQUEST)
        return Response(s.study_profile_payload(request.user, profile))


class StudyProfileSkipView(APIView):
    """``POST /me/study-profile/skip/`` — «بعداً»; the sheet is not shown again."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        study_profile.skip_onboarding(request.user)
        profile = study_profile.get_profile(request.user)
        return Response(s.study_profile_payload(request.user, profile))


class ChangelogListView(generics.ListAPIView):
    """``GET /changelog/`` — public «تازه‌های دادرُز»."""

    serializer_class = s.ChangelogEntrySerializer
    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get_queryset(self):
        return changelog.published_entries()


class ChangelogLatestView(APIView):
    """``GET /changelog/latest/`` — the entry for the one-time «تازه‌ها» sheet (or null)."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request):
        entry = changelog.latest_announcement()
        return Response({"entry": s.ChangelogEntrySerializer(entry).data if entry else None})
