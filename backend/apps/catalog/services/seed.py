"""Idempotent seeding of the Phase 1 catalogue. Rerunning updates rows instead of duplicating."""

import jdatetime
from django.db import transaction

from apps.content.models import Banner, GuideVideo
from apps.core.slugs import persian_slugify

from .. import seed_data as data
from ..models import (
    Book,
    BookVariant,
    Category,
    ExamEvent,
    ExamType,
    Person,
    RelatedCourse,
    StudyKitItem,
    StudyKitRecommendation,
    Subject,
)
from .pricing import round_to

EBOOK_RATIO = 0.45
BUNDLE_RATIO = 1.25


def book_slug(spec: dict) -> str:
    return persian_slugify(" ".join([spec["title"], *spec.get("authors", [])]))


def placeholder_prices(print_price: int) -> tuple[int, int]:
    """(ebook, bundle) placeholder prices derived from the print price."""
    return round_to(print_price * EBOOK_RATIO), round_to(print_price * BUNDLE_RATIO)


@transaction.atomic
def seed_catalog() -> dict[str, int]:
    exam_types = {}
    for i, (name, short) in enumerate(data.EXAM_TYPES):
        exam_types[name], _ = ExamType.objects.update_or_create(
            slug=persian_slugify(name),
            defaults={"name": name, "short_name": short, "order": i, "is_active": True},
        )

    subjects = {}
    for i, (name, color) in enumerate(data.SUBJECTS):
        subjects[name], _ = Subject.objects.update_or_create(
            slug=persian_slugify(name),
            defaults={"name": name, "color": color, "order": i, "is_active": True},
        )

    categories: dict[str, Category] = {}
    bar_children: dict[str, Category] = {}
    for i, (name, children) in enumerate(data.CATEGORIES):
        parent, _ = Category.objects.update_or_create(
            slug=persian_slugify(name),
            defaults={"name": name, "parent": None, "order": i, "is_active": True},
        )
        categories[name] = parent
        for j, child_name in enumerate(children):
            child, _ = Category.objects.update_or_create(
                slug=persian_slugify(child_name),
                defaults={"name": child_name, "parent": parent, "order": j, "is_active": True},
            )
            if name == data.BAR_EXAM_CATEGORY:
                bar_children[child_name] = child

    course, _ = RelatedCourse.objects.update_or_create(
        title=data.RELATED_COURSE["title"],
        defaults={
            "url": data.RELATED_COURSE["url"],
            "price": data.RELATED_COURSE["price"],
            "is_active": True,
            "order": 0,
        },
    )

    books: list[Book] = []
    for i, spec in enumerate(data.BOOKS):
        book = _seed_book(spec, i, exam_types, subjects, categories, bar_children)
        if data.RELATED_COURSE["subject"] in spec["subjects"]:
            book.related_courses.set([course])
        else:
            book.related_courses.clear()
        books.append(book)

    for name, exam_type_name, (jy, jm, jd), _expected in data.EXAM_EVENTS:
        ExamEvent.objects.update_or_create(
            name=name,
            defaults={
                "exam_type": exam_types[exam_type_name],
                "date": jdatetime.date(jy, jm, jd).togregorian(),
                "is_active": True,
            },
        )

    kits = _seed_study_kits(books, exam_types, subjects)

    for spec in data.BANNERS:
        Banner.objects.update_or_create(
            placement=spec["placement"],
            title=spec["title"],
            defaults={k: v for k, v in spec.items() if k not in {"placement", "title"}}
            | {"is_active": True},
        )

    for i, spec in enumerate(data.GUIDE_VIDEOS):
        GuideVideo.objects.update_or_create(
            title=spec["title"],
            defaults={
                "video_url": data.GUIDE_VIDEO_URL,
                "subject": subjects.get(spec["subject"]),
                "exam_type": exam_types.get(spec["exam_type"]) if spec["exam_type"] else None,
                "order": i,
                "is_active": True,
            },
        )

    return {
        "exam_types": len(exam_types),
        "subjects": len(subjects),
        "categories": Category.objects.count(),
        "books": len(books),
        "variants": BookVariant.objects.filter(book__in=books).count(),
        "study_kits": kits,
    }


def _seed_book(spec, index, exam_types, subjects, categories, bar_children) -> Book:
    quick = spec.get("quick_review", False)
    sales = max(0, data.SALES_COUNT_START - index * data.SALES_COUNT_STEP)
    book, _ = Book.objects.update_or_create(
        slug=book_slug(spec),
        defaults={
            "title": spec["title"],
            "volumes": spec.get("volumes", 1),
            "pages": spec.get("pages"),
            "publish_year": spec.get("publish_year", 1404),
            "description": spec["description"],
            "table_of_contents": spec["table_of_contents"],
            "study_plan_note": spec["study_plan_note"],
            "is_featured": spec.get("is_featured", False),
            "is_quick_review": quick,
            "sales_count": sales,
            "is_active": True,
            "publisher": None,
        },
    )
    authors = [
        Person.objects.update_or_create(slug=persian_slugify(name), defaults={"name": name})[0]
        for name in spec.get("authors", [])
    ]
    book.authors.set(authors)
    book.subjects.set([subjects[name] for name in spec["subjects"]])
    book.exam_types.set(
        [exam_types[name] for name in spec.get("exam_types", data.DEFAULT_EXAM_TYPES)]
    )
    cats = [bar_children[name] for name in spec["subjects"] if name in bar_children]
    if quick:
        cats.append(categories[data.QUICK_REVIEW_CATEGORY])
    book.categories.set(cats)

    price = spec["price"]
    stock = spec["stock"]
    BookVariant.objects.update_or_create(
        book=book,
        type=BookVariant.Type.PRINT,
        defaults={
            "price": price,
            "sale_price": spec.get("sale_price"),
            "stock": stock,
            "is_active": True,
            "price_is_placeholder": quick,
        },
    )
    if quick:
        BookVariant.objects.filter(book=book).exclude(type=BookVariant.Type.PRINT).delete()
    else:
        ebook_price, bundle_price = placeholder_prices(price)
        BookVariant.objects.update_or_create(
            book=book,
            type=BookVariant.Type.EBOOK,
            defaults={
                "price": ebook_price,
                "sale_price": None,
                "stock": 0,
                "is_active": True,
                "price_is_placeholder": True,
            },
        )
        BookVariant.objects.update_or_create(
            book=book,
            type=BookVariant.Type.BUNDLE,
            defaults={
                "price": bundle_price,
                "sale_price": None,
                "stock": stock,  # bundle stock = print stock
                "is_active": True,
                "price_is_placeholder": True,
            },
        )
    book.refresh_from_db()
    return book


def _seed_study_kits(books, exam_types, subjects) -> int:
    count = 0
    for exam_type_name in data.KIT_EXAM_TYPES:
        exam_type = exam_types[exam_type_name]
        for subject in subjects.values():
            candidates = [
                b for b in books if subject in b.subjects.all() and exam_type in b.exam_types.all()
            ]
            if not candidates:
                continue
            # Main books first (by sales), quick reviews last.
            candidates.sort(key=lambda b: (b.is_quick_review, -b.sales_count, b.id))
            rec, _ = StudyKitRecommendation.objects.update_or_create(
                exam_type=exam_type,
                subject=subject,
                defaults={
                    "is_active": True,
                    "note": f"کتاب‌های پیشنهادی {subject.name} برای {exam_type.name}",
                },
            )
            rec.items.exclude(book__in=candidates).delete()
            for order, book in enumerate(candidates, start=1):
                StudyKitItem.objects.update_or_create(
                    recommendation=rec,
                    book=book,
                    defaults={"order": order, "is_essential": order == 1},
                )
            count += 1
    return count
