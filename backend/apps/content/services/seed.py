"""``manage.py seed_hubs``: idempotent, never overwrites text edited in the admin."""

from django.db import transaction

from apps.catalog.models import Book, ExamType, Subject

from .. import seed_hubs as data
from ..models import CuratedList, CuratedListItem, Guide

DEMO_LIST_SIZE = 6


@transaction.atomic
def seed_hubs() -> dict:
    intros = 0
    for exam in ExamType.objects.filter(name__in=data.EXAM_INTROS, intro=""):
        exam.intro = data.EXAM_INTROS[exam.name]
        exam.intro_byline = data.PLACEHOLDER_BYLINE
        exam.intro_is_placeholder = True
        exam.save()
        intros += 1

    guide, guide_created = Guide.objects.get_or_create(
        title=data.DEMO_GUIDE["title"],
        defaults={
            "summary": data.DEMO_GUIDE["summary"],
            "intro": data.DEMO_GUIDE["intro"],
            "body": data.DEMO_GUIDE["body"],
            "status": Guide.Status.DRAFT,
        },
    )
    if guide_created:
        guide.exam_types.set(ExamType.objects.filter(name__in=["کانون وکلا", "مرکز وکلا"]))
        guide.subjects.set(Subject.objects.filter(name__in=["حقوق مدنی", "آیین دادرسی مدنی"]))
        guide.books.set(
            Book.objects.filter(is_active=True, exam_types__name="کانون وکلا").order_by(
                "-sales_count", "id"
            )[:4]
        )

    curated, list_created = CuratedList.objects.get_or_create(
        title=data.DEMO_LIST["title"], defaults={"intro": data.DEMO_LIST["intro"]}
    )
    if list_created:
        books = Book.objects.filter(is_active=True, is_quick_review=True).order_by(
            "-sales_count", "id"
        )[:DEMO_LIST_SIZE]
        CuratedListItem.objects.bulk_create(
            CuratedListItem(curated_list=curated, book=book, order=i)
            for i, book in enumerate(books, start=1)
        )
    return {
        "exam_intros": intros,
        "demo_guide": int(guide_created),
        "demo_list": int(list_created),
    }
