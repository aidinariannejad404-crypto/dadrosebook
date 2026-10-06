"""Dev only: a demo reader with minutes, a streak, a living plan, an edition upgrade and a
review prompt, so the retention pages can be seen without weeks of reading.

``python manage.py seed_study_demo [--phone 09120000001]`` (idempotent; prints the user's pk).
"""

import datetime as dt

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.catalog.models import Book, ExamType
from apps.library.services import entitlements
from apps.reader.models import ReadingProgress
from apps.study.models import (
    BookReadingDay,
    EditionLink,
    ReadingDay,
    ReadingSession,
    ReviewPrompt,
)
from apps.study.services import plans
from apps.study.services.activity import get_profile, tehran_today


class Command(BaseCommand):
    help = "داده نمایشی کارنامه، برنامه زنده، ارتقای ویرایش و درخواست نظر (فقط توسعه)."

    def add_arguments(self, parser):
        parser.add_argument("--phone", default="09120000001")

    @transaction.atomic
    def handle(self, *args, phone, **options):
        if getattr(settings, "USE_S3", False) and not settings.DEBUG:
            raise CommandError("seed_study_demo is for local development only.")
        user, _ = User.objects.get_or_create(phone=phone, defaults={"first_name": "سارا"})
        books = list(
            Book.objects.filter(is_active=True, pages__isnull=False)
            .prefetch_related("subjects")
            .order_by("-sales_count", "id")[:4]
        )
        if len(books) < 3:
            raise CommandError("Run seed_catalog first (need books with page counts).")
        for book in books[:3]:
            entitlements.grant(user, book)
        today = tehran_today()
        profile = get_profile(user)
        profile.daily_goal_minutes = 20
        profile.save()

        # 9 days back: goal met except two rest days this/last week → a 7-day streak today
        ReadingDay.objects.filter(user=user).delete()
        BookReadingDay.objects.filter(user=user).delete()
        minutes = [12, 31, 0, 22, 45, 0, 24, 28, 35, 21]
        for i, m in enumerate(reversed(minutes)):
            date = today - dt.timedelta(days=i)
            if not m:
                continue
            seconds = m * 60
            ReadingDay.objects.create(
                user=user,
                date=date,
                seconds=seconds,
                goal_minutes=20,
                goal_met_at=timezone.now() if m >= 20 else None,
            )
            split = [seconds * 2 // 3, seconds - seconds * 2 // 3]
            for book, s in zip(books[:2], split, strict=True):
                BookReadingDay.objects.create(user=user, book=book, date=date, seconds=s)
        ReadingSession.objects.filter(user=user).delete()
        now = timezone.now()
        ReadingSession.objects.create(
            user=user,
            book=books[0],
            started_at=now - dt.timedelta(days=1, minutes=40),
            last_beat_at=now - dt.timedelta(days=1),
            seconds=40 * 60,
            start_page=40,
            last_page=62,
            pages_read=22,
        )
        for book, page in ((books[0], 62), (books[1], 120), (books[2], 1)):
            total = book.pages or 300
            ReadingProgress.objects.update_or_create(
                user=user, book=book, defaults={"page": min(page, total), "total_pages": total}
            )

        exam_type = ExamType.objects.filter(is_active=True).order_by("order").first()
        plan = plans.create_from_books(
            user,
            books[:3],
            exam_type=exam_type,
            hours_per_day=4,
            today=today - dt.timedelta(days=4),
        )
        first = plan.books.order_by("order").first()
        first.pages_done = max(first.pages_done, 30)
        first.save()

        old, new = books[2], books[3]  # the user owns books[2]; books[3] plays the new edition
        EditionLink.objects.get_or_create(
            new_book=new, old_book=old, defaults={"upgrade_discount_percent": 40}
        )
        ReviewPrompt.objects.get_or_create(
            user=user, book=books[1], defaults={"reason": ReviewPrompt.Reason.READ}
        )
        from apps.leads.services.leads import create_study_plan_lead
        from apps.reviews.models import Review
        from apps.reviews.services.reviews import approve, submit_review

        exams = list(ExamType.objects.filter(is_active=True).order_by("order")[:2])
        samples = [
            ("مریم", 5, "برای تست‌های کانون کافی بود.", 0),
            ("رضا", 4, "جامع است ولی حجیم.", 0),
            ("نیلوفر", 2, "برای ماه آخر سنگین است.", 1),
            ("حامد", 5, "", 1),
        ]
        for i, (name, rating, body, exam_i) in enumerate(samples):
            reviewer, _ = User.objects.get_or_create(
                phone=f"0912000010{i}", defaults={"first_name": name, "last_name": "ا"}
            )
            submit_review(reviewer, new, rating, body, exam_type=exams[exam_i % len(exams)])
        approve(Review.objects.filter(book=new), None)

        lead = create_study_plan_lead(
            phone=phone,
            exam_type=exam_type,
            subjects=[],
            books=books[:2],
            hours_per_day=4,
            consent=True,
        )
        self.stdout.write(f"lead plan: /plan/{lead.token}")
        self.stdout.write(f"demo user {user.pk} ({phone}); upgrade offer on /product/{new.slug}")
