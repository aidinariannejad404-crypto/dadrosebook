"""Study API (``/api/v1/study/``): thin views over ``apps.study.services``."""

from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from apps.catalog.models import Book, ExamType
from apps.leads.models import Lead
from apps.reader.services.access import can_read

from ..services import activity, editions, pace, plans, report, review_prompts
from ..services.activity import tehran_today
from .serializers import (
    GoalSerializer,
    HeartbeatSerializer,
    PlanCheckSerializer,
    PlanCreateSerializer,
)

BOOK_NOT_FOUND = "کتاب پیدا نشد."
NO_PLAN = "هنوز برنامه مطالعه‌ای به حساب شما وصل نشده است."


class HeartbeatThrottle(UserRateThrottle):
    scope = "study_heartbeat"

    def get_rate(self):
        return getattr(settings, "STUDY_HEARTBEAT_RATE", "6/min")


def _book(slug: str, *, active_only: bool = True) -> Book:
    qs = Book.objects.filter(slug=slug)
    if active_only:
        qs = qs.filter(is_active=True)
    book = qs.first()
    if book is None:
        raise NotFound(BOOK_NOT_FOUND)
    return book


class HeartbeatView(APIView):
    """``POST {book, seconds, page?}``: active reading → minutes, goal and streak."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [HeartbeatThrottle]

    def post(self, request):
        serializer = HeartbeatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        book = _book(data["book"], active_only=False)
        if not can_read(request.user, book):
            raise PermissionDenied("دسترسی به این کتاب ندارید.")
        result = activity.record_heartbeat(
            request.user, book, seconds=data["seconds"], page=data.get("page")
        )
        day = result.day
        return Response(
            {
                "credited_seconds": result.credited,
                "minutes": day.seconds // 60,
                "seconds": day.seconds,
                "goal_minutes": day.goal_minutes,
                "goal_met": day.goal_met_at is not None,
                "just_met": result.just_met,
                "streak": result.streak.as_dict(),
                "pace": pace.reading_pace(request.user, book).as_dict(),
            }
        )


class GoalView(APIView):
    """``GET`` today's minutes, goal and streak; ``PATCH {daily_goal_minutes?, review_sms?}``."""

    permission_classes = [IsAuthenticated]

    def _payload(self, user):
        profile = activity.get_profile(user)
        return {
            **activity.today_summary(user),
            "daily_goal_minutes": profile.daily_goal_minutes,
            "review_sms": profile.review_sms,
            "goal_choices": list(activity.GOAL_CHOICES),
        }

    def get(self, request):
        return Response(self._payload(request.user))

    def patch(self, request):
        serializer = GoalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if "daily_goal_minutes" in data:
            activity.set_goal(request.user, data["daily_goal_minutes"])
        if "review_sms" in data:
            profile = activity.get_profile(request.user)
            profile.review_sms = data["review_sms"]
            profile.save(update_fields=["review_sms", "updated_at"])
        return Response(self._payload(request.user))


class ReportView(APIView):
    """``GET`` «کارنامه مطالعه» of this Persian week."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(report.weekly_report(request.user))


class PaceView(APIView):
    """``GET /study/books/<slug>/pace/``: the reader's speed (pages a minute)."""

    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        book = _book(slug, active_only=False)
        return Response(pace.reading_pace(request.user, book).as_dict())


def _exam_date_for(user, exam_slug: str | None):
    """The active plan's exam, else the next event of ``exam_slug``."""
    from apps.catalog.services.courses import upcoming_events

    plan = plans.active_plan(user)
    if plan is not None and plan.exam_date:
        return {"name": plan.exam_name, "date": plan.exam_date}
    if exam_slug:
        event = upcoming_events(tehran_today()).filter(exam_type__slug=exam_slug).first()
        if event is not None:
            return {"name": event.name, "date": event.date}
    return None


class ForecastView(APIView):
    """``GET /study/forecast/?exam_type=``: finish forecast per library book (by slug)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.reader.models import ReadingProgress

        exam = _exam_date_for(request.user, request.query_params.get("exam_type"))
        exam_date = exam["date"] if exam else None
        today = tehran_today()
        books = {}
        rows = ReadingProgress.objects.filter(user=request.user, total_pages__gt=0).select_related(
            "book"
        )
        for p in rows:
            forecast = pace.finish_forecast(
                request.user,
                p.book,
                page=p.page,
                total_pages=p.total_pages,
                exam_date=exam_date,
                today=today,
            )
            if forecast is not None:
                books[p.book.slug] = forecast
        return Response(
            {
                "exam": {"name": exam["name"], "date": exam["date"].isoformat()} if exam else None,
                "books": books,
            }
        )


class PlanView(APIView):
    """``GET`` the active plan (404 when none); ``POST`` link a lead plan or build one."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        plan = plans.active_plan(request.user)
        if plan is None:
            raise NotFound(NO_PLAN)
        full = request.query_params.get("view") != "today"
        return Response(plans.plan_payload(plan, full=full))

    def post(self, request):
        serializer = PlanCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            if data.get("lead_token"):
                lead = Lead.objects.filter(token=data["lead_token"]).first()
                if lead is None:
                    raise NotFound("برنامه پیدا نشد.")
                plan = plans.create_from_lead(request.user, lead)
            else:
                owned = editions.owned_book_ids(request.user)
                books = list(
                    Book.objects.filter(slug__in=data["book_slugs"], pk__in=owned).prefetch_related(
                        "subjects"
                    )
                )
                exam_type = None
                if data.get("exam_type"):
                    exam_type = ExamType.objects.filter(
                        slug=data["exam_type"], is_active=True
                    ).first()
                plan = plans.create_from_books(
                    request.user,
                    books,
                    exam_type=exam_type,
                    hours_per_day=data["hours_per_day"],
                )
        except plans.PlanError as exc:
            code = status.HTTP_403_FORBIDDEN if exc.code == "phone_mismatch" else 400
            return Response({"detail": exc.message, "code": exc.code}, status=code)
        plan = plans.active_plan(request.user)
        return Response(plans.plan_payload(plan), status=status.HTTP_201_CREATED)


class PlanCheckView(APIView):
    """``POST {book_slug, pages_from, pages_to, done}``: tick (or untick) one item."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        plan = plans.active_plan(request.user)
        if plan is None:
            raise NotFound(NO_PLAN)
        serializer = PlanCheckSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        try:
            plans.set_item_done(plan, d["book_slug"], d["pages_from"], d["pages_to"], d["done"])
        except plans.PlanError as exc:
            return Response({"detail": exc.message}, status=status.HTTP_404_NOT_FOUND)
        plan = plans.active_plan(request.user)
        return Response(plans.plan_payload(plan, full=request.query_params.get("view") != "today"))


class PlanCompressView(APIView):
    """``POST``: re-spread the unread pages from today to the exam."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        plan = plans.active_plan(request.user)
        if plan is None:
            raise NotFound(NO_PLAN)
        try:
            plans.compress(plan)
        except plans.PlanError as exc:
            return Response({"detail": exc.message, "code": exc.code}, status=400)
        return Response(plans.plan_payload(plans.active_plan(request.user)))


class OwnedBooksView(APIView):
    """``GET``: the user's books with a page count (to build a plan from)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        ids = editions.owned_book_ids(request.user)
        books = Book.objects.filter(pk__in=ids, pages__isnull=False).order_by("title")
        return Response([{"slug": b.slug, "title": b.title, "pages": b.pages} for b in books])


class UpgradeOfferView(APIView):
    """``GET /study/books/<slug>/upgrade/``: «شما ویرایش ۱۴۰۴ را دارید…» (null when none)."""

    def get(self, request, slug):
        book = _book(slug)
        if not request.user.is_authenticated:
            return Response({"offer": None})
        return Response({"offer": editions.upgrade_offer(request.user, book)})


class ReviewPromptsView(APIView):
    """``GET`` open «این کتاب برای آزمون شما چقدر کمک کرد؟» prompts."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        items = review_prompts.pending_prompts(request.user)
        out = []
        for p in items:
            exams = sorted(p.book.exam_types.all(), key=lambda e: (e.order, e.pk))
            out.append(
                {
                    "id": p.pk,
                    "reason": p.reason,
                    "book": {"slug": p.book.slug, "title": p.book.title},
                    "exam_type": (
                        {"slug": exams[0].slug, "name": exams[0].name} if exams else None
                    ),
                }
            )
        return Response(out)


class ReviewPromptDismissView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk: int):
        if not review_prompts.dismiss(request.user, pk):
            raise NotFound("درخواست پیدا نشد.")
        return Response(status=status.HTTP_204_NO_CONTENT)
