"""The living study plan (ه۵): the static lead-magnet plan, linked to the account.

* A plan stores its days (page ranges per book, as the lead generator makes them) and, per book,
  how far the user got (``StudyPlanBook.pages_done``).
* Progress moves forward by check-offs (print books) and automatically from the ebook reader's
  ``ReadingProgress`` (scaled when the ebook's page count differs from the print one).
* An item is done when its book's ``pages_done`` reaches the item's last page.
* Behind schedule = past study days with unfinished items. ``compress()`` re-spreads every page
  not read yet over the days from today to the exam (keeping a review window); past days stay
  as history.
* Old ``/plan/<token>`` pages keep working: the lead and its snapshot are never changed.
"""

import datetime as dt
from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone

from apps.leads.services.study_plan import PlanBook, PlanExam, generate_study_plan

from ..models import StudyPlan, StudyPlanBook
from .activity import tehran_today

NO_EXAM_DAYS = 30
MIN_DAYS_TO_COMPRESS = 2


class PlanError(Exception):
    def __init__(self, message: str, code: str = "invalid"):
        super().__init__(message)
        self.message = message
        self.code = code


PHONE_MISMATCH = "این برنامه با شماره دیگری ساخته شده است؛ با همان شماره وارد شوید."
TOO_LATE = "تا روز آزمون فرصتی برای فشرده‌کردن برنامه نمانده است؛ روی مرور تمرکز کنید."
NOTHING_LEFT = "همه صفحه‌های برنامه را خوانده‌اید؛ برنامه‌ای برای فشرده‌کردن نمانده است."
NO_BOOKS = "برای ساخت برنامه دست‌کم یک کتاب با تعداد صفحه انتخاب کنید."


def active_plan(user) -> StudyPlan | None:
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    return (
        StudyPlan.objects.filter(user=user, is_active=True)
        .prefetch_related("books")
        .order_by("-created_at", "-id")
        .first()
    )


def _books_from_days(days: list[dict]) -> list[dict]:
    """``slug → {title, subject, total_pages}`` in first-seen order from the plan items."""
    seen: dict[str, dict] = {}
    for day in days:
        for item in day.get("items", []):
            slug = item["book_slug"]
            entry = seen.setdefault(
                slug,
                {
                    "slug": slug,
                    "title": item["book_title"],
                    "subject": item.get("subject"),
                    "total_pages": 0,
                },
            )
            entry["total_pages"] = max(entry["total_pages"], int(item["pages_to"]))
    return list(seen.values())


@transaction.atomic
def _store(user, plan: dict, *, hours_per_day: int, lead=None) -> StudyPlan:
    from apps.catalog.models import Book

    StudyPlan.objects.filter(user=user, is_active=True).update(is_active=False)
    exam = plan.get("exam") or {}
    obj = StudyPlan.objects.create(
        user=user,
        lead=lead,
        exam_name=exam.get("name", ""),
        exam_date=dt.date.fromisoformat(exam["date"]) if exam.get("date") else None,
        hours_per_day=hours_per_day,
        days=plan.get("days", []),
        review=plan.get("review", []),
    )
    books = _books_from_days(obj.days)
    by_slug = Book.objects.in_bulk([b["slug"] for b in books], field_name="slug")
    StudyPlanBook.objects.bulk_create(
        [
            StudyPlanBook(
                plan=obj,
                book=by_slug.get(b["slug"]),
                slug=b["slug"],
                title=b["title"][:300],
                subject=b["subject"],
                total_pages=b["total_pages"],
                order=i,
            )
            for i, b in enumerate(books)
        ]
    )
    return obj


def create_from_lead(user, lead) -> StudyPlan:
    """Link a lead-magnet plan (``/plan/<token>``) to the account of the same phone."""
    if lead.phone != getattr(user, "phone", None):
        raise PlanError(PHONE_MISMATCH, "phone_mismatch")
    existing = StudyPlan.objects.filter(user=user, lead=lead, is_active=True).first()
    if existing is not None:
        return existing
    return _store(user, lead.plan or {}, hours_per_day=lead.hours_per_day, lead=lead)


def create_from_books(
    user, books, *, exam_type=None, hours_per_day: int = 4, today: dt.date | None = None
) -> StudyPlan:
    """A fresh plan from chosen books (e.g. the user's library) up to the exam type's next date."""
    from apps.leads.services.leads import next_event_for, plan_books, subject_weights

    today = today or tehran_today()
    books = [b for b in books if b.pages]
    if not books:
        raise PlanError(NO_BOOKS, "no_books")
    event = next_event_for(exam_type, today)
    plan = generate_study_plan(
        books=plan_books(books, []),
        exam=PlanExam(name=event.name, date=event.date) if event else None,
        hours_per_day=hours_per_day,
        today=today,
        weights=subject_weights(exam_type),
    )
    return _store(user, plan, hours_per_day=hours_per_day)


# --- progress ---------------------------------------------------------------------------------


def sync_reader_progress(plan: StudyPlan) -> None:
    """Move ``pages_done`` forward from the ebook reader (never backwards)."""
    from apps.reader.models import ReadingProgress

    books = [b for b in plan.books.all() if b.book_id]
    if not books:
        return
    progress = {
        p.book_id: p
        for p in ReadingProgress.objects.filter(
            user_id=plan.user_id, book_id__in=[b.book_id for b in books]
        )
    }
    for entry in books:
        p = progress.get(entry.book_id)
        if p is None or p.total_pages <= 0:
            continue
        done = entry.total_pages * min(p.page, p.total_pages) // p.total_pages
        if p.page >= p.total_pages:
            done = entry.total_pages
        if done > entry.pages_done:
            entry.pages_done = done
            entry.save(update_fields=["pages_done"])


def set_item_done(plan: StudyPlan, slug: str, pages_from: int, pages_to: int, done: bool) -> int:
    """Check (or uncheck) one day item; returns the book's new ``pages_done``."""
    entry = plan.books.filter(slug=slug).first()
    if entry is None:
        raise PlanError("این کتاب در برنامه شما نیست.", "not_found")
    pages_to = max(1, min(int(pages_to), entry.total_pages))
    pages_from = max(1, min(int(pages_from), pages_to))
    if done:
        entry.pages_done = max(entry.pages_done, pages_to)
    elif entry.pages_done >= pages_from:
        entry.pages_done = pages_from - 1
    entry.save(update_fields=["pages_done"])
    return entry.pages_done


@dataclass
class ItemState:
    done: bool
    started: bool


def item_state(item: dict, done_pages: dict[str, int]) -> ItemState:
    done_to = done_pages.get(item["book_slug"], 0)
    return ItemState(done=done_to >= item["pages_to"], started=done_to >= item["pages_from"])


def compressed_on(plan: StudyPlan) -> dt.date | None:
    """Tehran day of the last compression: unfinished items before it were re-spread."""
    return tehran_today(plan.last_compressed_at) if plan.last_compressed_at else None


def _decorate(day: dict, done_pages: dict[str, int], rebased: dt.date | None = None) -> dict:
    moved = rebased is not None and day["date"] < rebased.isoformat()
    items = []
    for item in day.get("items", []):
        state = item_state(item, done_pages)
        items.append({**item, "done": state.done, "rescheduled": moved and not state.done})
    return {
        "date": day["date"],
        "items": items,
        "done": bool(items) and all(i["done"] for i in items),
    }


def schedule_status(plan: StudyPlan, today: dt.date) -> dict:
    done_pages = {b.slug: b.pages_done for b in plan.books.all()}
    rebased = compressed_on(plan)
    behind_days = 0
    pages_behind = 0
    for day in plan.days:
        date = dt.date.fromisoformat(day["date"])
        if date >= today or (rebased is not None and date < rebased):
            continue
        late = False
        for item in day.get("items", []):
            done_to = done_pages.get(item["book_slug"], 0)
            if done_to < item["pages_to"]:
                late = True
                pages_behind += item["pages_to"] - max(done_to, item["pages_from"] - 1)
        behind_days += late
    total = sum(b.total_pages for b in plan.books.all())
    done = sum(min(b.pages_done, b.total_pages) for b in plan.books.all())
    return {
        "behind_days": behind_days,
        "pages_behind": pages_behind,
        "total_pages": total,
        "pages_done": done,
        "percent": round(done * 100 / total, 1) if total else 0.0,
        "can_compress": behind_days > 0 and _days_left(plan, today) >= MIN_DAYS_TO_COMPRESS,
    }


def plan_end(plan: StudyPlan) -> dt.date | None:
    """The exam date, else the day after the plan's last day."""
    if plan.exam_date:
        return plan.exam_date
    dates = [d["date"] for d in plan.days] + [r["date"] for r in plan.review]
    return dt.date.fromisoformat(max(dates)) + dt.timedelta(days=1) if dates else None


def _days_left(plan: StudyPlan, today: dt.date) -> int:
    end = plan_end(plan)
    return (end - today).days if end else 0


def today_card(plan: StudyPlan, today: dt.date) -> dict:
    """The «امروز» card: today's items (or the review task), with their check state."""
    done_pages = {b.slug: b.pages_done for b in plan.books.all()}
    iso = today.isoformat()
    day = next((d for d in plan.days if d["date"] == iso), None)
    review = next((r for r in plan.review if r["date"] == iso), None)
    upcoming = next(
        (d for d in plan.days if d["date"] > iso and not _decorate(d, done_pages)["done"]), None
    )
    return {
        "date": iso,
        "day": _decorate(day, done_pages) if day else None,
        "review": review,
        "next_day": _decorate(upcoming, done_pages) if (upcoming and not day) else None,
    }


def plan_payload(plan: StudyPlan, today: dt.date | None = None, *, full: bool = True) -> dict:
    today = today or tehran_today()
    sync_reader_progress(plan)
    done_pages = {b.slug: b.pages_done for b in plan.books.all()}
    payload = {
        "id": plan.pk,
        "exam": (
            {
                "name": plan.exam_name,
                "date": plan.exam_date.isoformat(),
                "days_left": max(0, (plan.exam_date - today).days),
            }
            if plan.exam_date
            else None
        ),
        "hours_per_day": plan.hours_per_day,
        "lead_token": str(plan.lead.token) if plan.lead_id and plan.lead else None,
        "compressed_count": plan.compressed_count,
        "books": [
            {
                "slug": b.slug,
                "title": b.title,
                "subject": b.subject,
                "total_pages": b.total_pages,
                "pages_done": min(b.pages_done, b.total_pages),
                "has_ebook_progress": bool(b.book_id),
            }
            for b in plan.books.all()
        ],
        "status": schedule_status(plan, today),
        "today": today_card(plan, today),
    }
    if full:
        rebased = compressed_on(plan)
        payload["days"] = [_decorate(d, done_pages, rebased) for d in plan.days]
        payload["review"] = plan.review
    return payload


# --- compression ------------------------------------------------------------------------------


def remaining_books(plan: StudyPlan) -> list[tuple[StudyPlanBook, int]]:
    return [
        (b, b.total_pages - b.pages_done)
        for b in plan.books.all()
        if b.total_pages - b.pages_done > 0
    ]


@transaction.atomic
def compress(plan: StudyPlan, now: dt.datetime | None = None) -> StudyPlan:
    """Re-spread the unread pages from today to the exam; past days are kept as history."""
    today = tehran_today(now)
    plan = StudyPlan.objects.select_for_update().get(pk=plan.pk)
    sync_reader_progress(plan)
    left = remaining_books(plan)
    if not left:
        raise PlanError(NOTHING_LEFT, "nothing_left")
    end = plan_end(plan)
    if end is None or (end - today).days < MIN_DAYS_TO_COMPRESS:
        raise PlanError(TOO_LATE, "too_late")
    offset = {b.slug: b.pages_done for b, _ in left}
    generated = generate_study_plan(
        books=[
            PlanBook(title=b.title, slug=b.slug, pages=pages, subject=b.subject)
            for b, pages in left
        ],
        exam=PlanExam(name=plan.exam_name or "پایان برنامه", date=end),
        hours_per_day=plan.hours_per_day,
        today=today,
    )
    for day in generated["days"]:
        for item in day["items"]:
            item["pages_from"] += offset[item["book_slug"]]
            item["pages_to"] += offset[item["book_slug"]]
    iso = today.isoformat()
    plan.days = [d for d in plan.days if d["date"] < iso] + generated["days"]
    plan.review = generated["review"]
    plan.compressed_count += 1
    plan.last_compressed_at = now or timezone.now()
    plan.save(
        update_fields=["days", "review", "compressed_count", "last_compressed_at", "updated_at"]
    )
    return plan
