"""Study-plan leads: create a lead with its generated plan, and render it back."""

import datetime as dt
import hashlib

from django.conf import settings
from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone

from apps.catalog.models import (
    Book,
    ExamEvent,
    ExamType,
    RelatedCourse,
    StudyKitItem,
    StudyKitRecommendation,
    Subject,
)
from apps.catalog.services.courses import (
    course_exam_ids,
    exposed_courses,
    recommended_type,
    type_matches,
    upcoming_events,
)

from ..models import Lead
from .study_plan import PlanBook, PlanExam, generate_study_plan

MAX_RECOMMENDED_COURSES = 3
USER_AGENT_MAX = 200


def mask_phone(phone: str) -> str:
    """``09121234567`` → ``0912***4567``."""
    if len(phone) < 8:
        return phone
    return f"{phone[:4]}***{phone[-4:]}"


def hash_ip(ip: str | None) -> str:
    if not ip:
        return ""
    return hashlib.sha256(f"{settings.SECRET_KEY}:{ip}".encode()).hexdigest()


def subject_mini(subject: Subject) -> dict:
    return {"id": subject.id, "name": subject.name, "slug": subject.slug, "color": subject.color}


def next_event_for(exam_type: ExamType | None, today: dt.date) -> ExamEvent | None:
    if exam_type is None:
        return None
    return upcoming_events(today).filter(exam_type=exam_type).first()


def subject_weights(exam_type: ExamType | None) -> dict[int, int]:
    if exam_type is None:
        return {}
    return dict(
        StudyKitRecommendation.objects.filter(
            exam_type=exam_type, is_active=True, weight__isnull=False
        ).values_list("subject_id", "weight")
    )


def kit_books(exam_type: ExamType | None, subjects: list[Subject]) -> list[Book]:
    """Essential books of the active study kits for these subjects (of ``exam_type`` if given)."""
    items = StudyKitItem.objects.filter(
        is_essential=True,
        book__is_active=True,
        recommendation__is_active=True,
        recommendation__subject__in=subjects,
    )
    if exam_type is not None:
        items = items.filter(recommendation__exam_type=exam_type)
    books: list[Book] = []
    seen: set[int] = set()
    for item in items.select_related("book").order_by(
        "recommendation__subject__order", "recommendation__exam_type__order", "order", "id"
    ):
        if item.book_id not in seen:
            seen.add(item.book_id)
            books.append(item.book)
    return books


def plan_books(books: list[Book], subjects: list[Subject]) -> list[PlanBook]:
    """Each book is studied under its first subject that was chosen, else its first subject."""
    chosen = {s.id for s in subjects}
    result = []
    for book in books:
        book_subjects = sorted(book.subjects.all(), key=lambda s: (s.order, s.id))
        subject = next((s for s in book_subjects if s.id in chosen), None) or next(
            iter(book_subjects), None
        )
        result.append(
            PlanBook(
                title=book.title,
                slug=book.slug,
                pages=book.pages,
                subject=subject_mini(subject) if subject else None,
            )
        )
    return result


@transaction.atomic
def create_study_plan_lead(
    *,
    phone: str,
    exam_type: ExamType | None,
    subjects: list[Subject],
    books: list[Book],
    hours_per_day: int,
    consent: bool,
    ip: str | None = None,
    user_agent: str = "",
    today: dt.date | None = None,
) -> Lead:
    """Store the lead and a snapshot of its plan. With no books, the kit's essentials are used."""
    today = today or timezone.localdate()
    if not books:
        books = kit_books(exam_type, subjects)
    position = {b.pk: i for i, b in enumerate(books)}
    books = sorted(
        Book.objects.filter(pk__in=position).prefetch_related("subjects"),
        key=lambda b: position[b.pk],
    )
    event = next_event_for(exam_type, today)
    plan = generate_study_plan(
        books=plan_books(books, subjects),
        exam=PlanExam(name=event.name, date=event.date) if event else None,
        hours_per_day=hours_per_day,
        today=today,
        weights=subject_weights(exam_type),
    )
    for subject in subjects:  # chosen subjects without a book still get course suggestions
        if subject.id not in plan["subject_ids"]:
            plan["subject_ids"].append(subject.id)
    lead = Lead.objects.create(
        phone=phone,
        source=Lead.Source.STUDY_PLAN,
        exam_type=exam_type,
        hours_per_day=hours_per_day,
        consent=consent,
        plan=plan,
        ip_hash=hash_ip(ip),
        user_agent=(user_agent or "")[:USER_AGENT_MAX],
    )
    lead.subjects.set(subjects)
    lead.books.set(books)
    return lead


def recommended_courses(
    subject_ids: list[int], exam_type: ExamType | None, days_left: int | None
) -> list[RelatedCourse]:
    """Up to 3 exposed courses of the plan's subjects that fit the time left (timing rule).

    One course per subject first (subjects in plan order: heaviest first), then the rest; within
    a subject, more students first, then the lower price.
    """
    if not subject_ids:
        return []
    rec_type = recommended_type(days_left)
    exam_ids = [exam_type.id] if exam_type else []
    courses = [
        c
        for c in exposed_courses().filter(subject_id__in=subject_ids)
        if type_matches(c, rec_type)
        and (not exam_ids or not course_exam_ids(c) or set(exam_ids) & set(course_exam_ids(c)))
    ]
    courses.sort(key=lambda c: (-(c.students_count or 0), c.effective_price, c.id))
    rank = {sid: i for i, sid in enumerate(subject_ids)}
    picked: list[RelatedCourse] = []
    for sid in sorted(rank, key=rank.get):
        first = next((c for c in courses if c.subject_id == sid), None)
        if first is not None:
            picked.append(first)
    for course in courses:
        if len(picked) >= MAX_RECOMMENDED_COURSES:
            break
        if course not in picked:
            picked.append(course)
    return picked[:MAX_RECOMMENDED_COURSES]


def lead_plan(lead: Lead, today: dt.date | None = None) -> dict:
    """The stored plan with a live ``exam.days_left`` and live ``recommended_courses``."""
    today = today or timezone.localdate()
    plan = lead.plan or {}
    exam = plan.get("exam")
    days_left = None
    if exam:
        days_left = max(0, (dt.date.fromisoformat(exam["date"]) - today).days)
        exam = {**exam, "days_left": days_left}
    return {
        "token": str(lead.token),
        "created_at": lead.created_at,
        "phone_masked": mask_phone(lead.phone),
        "exam": exam,
        "hours_per_day": lead.hours_per_day,
        "summary": plan.get("summary", {}),
        "days": plan.get("days", []),
        "review": plan.get("review", []),
        "recommended_courses": recommended_courses(
            plan.get("subject_ids", []), lead.exam_type, days_left
        ),
    }


def lead_queryset():
    return Lead.objects.select_related("exam_type").prefetch_related(
        Prefetch("subjects", queryset=Subject.objects.order_by("order", "id"))
    )
