"""Study plan generator for the lead magnet («برنامه مطالعه تا روز آزمون»).

``generate_study_plan`` is pure (no database): it spreads the pages of the chosen books over the
days left to the exam, keeps a final review window, weights subjects by their ضریب and
interleaves subjects (round-robin, at most two subjects a day).

Rules
- Days run from ``today`` (Asia/Tehran) to the day before the exam. No exam, or an exam that is
  today or past → a 30-day plan and ``exam: null``.
- Review window = max(3, min(10, 15% of the days)), never all of them (≥ 1 study day).
- Each subject gets a share of the study "slots" (two per day) proportional to
  ``pages × weight``, so heavier subjects are read more slowly (more days per page).
- Every page of every book is planned exactly once: the items add up to ``total_pages``.
- Books without a page count count as ``DEFAULT_PAGES``.
- When the average pages per study day exceed ``hours_per_day × PAGES_PER_HOUR`` (capped at
  ``MAX_PAGES_PER_DAY``) the items say «مطالعه سریع» instead of «مطالعه»: the plan still
  covers every page but says honestly that it is a skim, not a full read.
"""

import datetime as dt
import math
from dataclasses import dataclass, field

DEFAULT_PAGES = 300
PAGES_PER_HOUR = 12
MAX_PAGES_PER_DAY = 200
NO_EXAM_DAYS = 30
MIN_REVIEW_DAYS = 3
MAX_REVIEW_DAYS = 10
REVIEW_SHARE = 0.15
MAX_SUBJECTS_PER_DAY = 2

TASK_STUDY = "مطالعه"
TASK_FAST_STUDY = "مطالعه سریع"


@dataclass
class PlanBook:
    title: str
    slug: str
    pages: int | None
    subject: dict | None  # SubjectMini dict or None


@dataclass
class PlanExam:
    name: str
    date: dt.date


@dataclass
class _Group:
    subject: dict | None
    weight: int
    books: list[PlanBook] = field(default_factory=list)

    @property
    def pages(self) -> int:
        return sum(book_pages(b) for b in self.books)


def book_pages(book: PlanBook) -> int:
    return book.pages if book.pages and book.pages > 0 else DEFAULT_PAGES


def review_days_for(total_days: int) -> int:
    """max(3, min(10, 15% of the days)), leaving at least one study day."""
    target = max(MIN_REVIEW_DAYS, min(MAX_REVIEW_DAYS, math.floor(total_days * REVIEW_SHARE + 0.5)))
    return max(0, min(target, total_days - 1))


def daily_capacity(hours_per_day: int) -> int:
    return min(max(1, hours_per_day) * PAGES_PER_HOUR, MAX_PAGES_PER_DAY)


def apportion(total: int, efforts: list[int], caps: list[int]) -> list[int]:
    """Split ``total`` slots by ``efforts`` (largest remainder), each ≥ 1 and ≤ its cap."""
    n = len(efforts)
    if n == 0:
        return []
    shares = [1] * n
    rest = max(0, total - n)
    effort_sum = sum(efforts) or n
    quotas = [rest * (e or 0) / effort_sum for e in efforts]
    floors = [math.floor(q) for q in quotas]
    shares = [s + f for s, f in zip(shares, floors, strict=True)]
    leftover = rest - sum(floors)
    order = sorted(range(n), key=lambda i: (-(quotas[i] - floors[i]), i))
    for i in order[:leftover]:
        shares[i] += 1
    return [min(s, cap) for s, cap in zip(shares, caps, strict=True)]


def interleave(slot_counts: list[int]) -> list[int]:
    """Spread each group's slots evenly over the sequence (stride scheduling)."""
    positions = [
        ((k + 0.5) / count, g) for g, count in enumerate(slot_counts) for k in range(count)
    ]
    positions.sort()
    return [g for _pos, g in positions]


def split_even(total: int, parts: int) -> list[int]:
    base, rem = divmod(total, parts)
    return [base + (1 if i < rem else 0) for i in range(parts)]


def _subject_slots(group: _Group, slots: int) -> list[list[dict]]:
    """The group's pages cut into ``slots`` consecutive chunks of items (book page ranges)."""
    chunks = split_even(group.pages, slots)
    cursor = [(book, 1, book_pages(book)) for book in group.books]  # book, next page, last page
    book_index = 0
    result: list[list[dict]] = []
    for size in chunks:
        items: list[dict] = []
        while size > 0 and book_index < len(cursor):
            book, start, last = cursor[book_index]
            end = min(last, start + size - 1)
            items.append(
                {
                    "subject": group.subject,
                    "book_title": book.title,
                    "book_slug": book.slug,
                    "pages_from": start,
                    "pages_to": end,
                }
            )
            size -= end - start + 1
            if end == last:
                book_index += 1
            else:
                cursor[book_index] = (book, end + 1, last)
        result.append(items)
    return result


def _merge(items: list[dict]) -> list[dict]:
    """Join consecutive ranges of the same book (two slots of one subject on one day)."""
    merged: list[dict] = []
    for item in items:
        prev = merged[-1] if merged else None
        if (
            prev
            and prev["book_slug"] == item["book_slug"]
            and prev["pages_to"] + 1 == item["pages_from"]
        ):
            prev["pages_to"] = item["pages_to"]
        else:
            merged.append(dict(item))
    return merged


def _groups(books: list[PlanBook], weights: dict[int, int]) -> list[_Group]:
    groups: dict[int | None, _Group] = {}
    for book in books:
        key = book.subject["id"] if book.subject else None
        if key not in groups:
            weight = weights.get(key, 1) if key is not None else 1
            groups[key] = _Group(subject=book.subject, weight=max(1, weight or 1))
        groups[key].books.append(book)
    # Heaviest subjects first (stable: first appearance breaks ties).
    return sorted(groups.values(), key=lambda g: -g.weight)


def generate_study_plan(
    *,
    books: list[PlanBook],
    exam: PlanExam | None,
    hours_per_day: int,
    today: dt.date,
    weights: dict[int, int] | None = None,
) -> dict:
    """Plan dict: ``exam``, ``summary``, ``days``, ``review``, ``subject_ids`` (for courses)."""
    weights = weights or {}
    days_left = (exam.date - today).days if exam else None
    if exam is None or days_left is None or days_left < 1:
        exam_out = None
        total_days = NO_EXAM_DAYS
    else:
        exam_out = {"name": exam.name, "date": exam.date.isoformat(), "days_left": days_left}
        total_days = days_left

    review_count = review_days_for(total_days)
    study_count = total_days - review_count
    groups = _groups(books, weights)
    total_pages = sum(g.pages for g in groups)

    per_day = min(MAX_SUBJECTS_PER_DAY, len(groups)) or 1
    if len(groups) > study_count * per_day:  # more subjects than slots: allow more per day
        per_day = math.ceil(len(groups) / study_count)
    slots = apportion(
        study_count * per_day, [g.pages * g.weight for g in groups], [g.pages for g in groups]
    )
    chunks = [_subject_slots(g, n) for g, n in zip(groups, slots, strict=True)]
    sequence = interleave(slots)
    next_chunk = [0] * len(groups)

    pages_per_day = math.ceil(total_pages / study_count) if study_count else 0
    task = TASK_FAST_STUDY if pages_per_day > daily_capacity(hours_per_day) else TASK_STUDY
    days = []
    for d in range(study_count):
        day_slots = sequence[d * per_day : (d + 1) * per_day]
        items: list[dict] = []
        for g in day_slots:
            items.extend(chunks[g][next_chunk[g]])
            next_chunk[g] += 1
        items = _merge(items)
        for item in items:
            item["task"] = task
        days.append({"date": (today + dt.timedelta(days=d)).isoformat(), "items": items})

    review = []
    names = [g.subject["name"] for g in groups if g.subject] or []
    for r in range(review_count):
        date = today + dt.timedelta(days=study_count + r)
        if r == review_count - 1 and review_count > 1:
            task = "مرور نهایی همه دروس" if names else "مرور نهایی"
        elif names:
            task = f"جمع‌بندی و تست {names[r % len(names)]}"
        else:
            task = "جمع‌بندی و تست"
        review.append({"date": date.isoformat(), "task": task})

    return {
        "exam": exam_out,
        "summary": {
            "total_pages": total_pages,
            "study_days": study_count,
            "review_days": review_count,
            "pages_per_day": pages_per_day,
        },
        "days": days,
        "review": review,
        "subject_ids": [g.subject["id"] for g in groups if g.subject],
    }
