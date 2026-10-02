"""Idempotent seeding of the real catalogue. Rerunning updates rows in place, never duplicates.

Books and categories come from the old store (``seed_catalogue.json``,
``seed_old_categories.json``) with their old slugs; the rest is defined in ``seed_data``.
Leftovers of the earlier demo seed are deactivated (``is_active=False``), not deleted.
"""

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
    Publisher,
    RelatedCourse,
    StudyKitItem,
    StudyKitRecommendation,
    Subject,
)
from .legacy_import import (
    infer_resource_type,
    legacy_path,
    old_slug,
    price_decision,
    rewrite_description,
    sales_ranks,
    stock_for,
)


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

    categories = seed_categories()

    course, _ = RelatedCourse.objects.update_or_create(
        title=data.RELATED_COURSE["title"],
        defaults={
            "url": data.RELATED_COURSE["url"],
            "price": data.RELATED_COURSE["price"],
            "is_active": True,
            "order": 0,
        },
    )

    records = data.load_catalogue()
    ranks = sales_ranks(records)
    books: list[Book] = []
    for record in records:
        book = _seed_book(record, ranks, exam_types, subjects, categories)
        if data.RELATED_COURSE["subject"] in record["subjects"]:
            book.related_courses.set([course])
        else:
            book.related_courses.clear()
        books.append(book)

    real_slugs = {b.slug for b in books}
    demo_deactivated = (
        Book.objects.filter(slug__in=data.DEMO_BOOK_SLUGS)
        .exclude(slug__in=real_slugs)
        .update(is_active=False)
    )

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
        "categories": len(categories),
        "books": len(books),
        "in_stock": sum(1 for r in records if stock_for(r) > 0),
        "variants": BookVariant.objects.filter(book__in=books).count(),
        "study_kits": kits,
        "demo_books_deactivated": demo_deactivated,
    }


def seed_categories() -> dict[str, Category]:
    """Rebuild the category tree from the old store, keeping old slugs and menu order.

    Parents come from ``seed_data.CATEGORY_PARENTS``; a root's order is the smallest old menu
    position among itself and its children. Demo-only categories are deactivated.
    """
    rows = [
        r
        for r in data.load_old_categories()
        if r.get("slug") and r["slug"] not in data.SKIPPED_CATEGORIES
    ]
    position = {r["slug"]: i for i, r in enumerate(rows)}
    names = {r["slug"]: r["title"] for r in rows}
    for slug, name in data.EXTRA_ROOT_CATEGORIES.items():
        if slug not in names:
            names[slug] = name
            position[slug] = len(position)

    order = dict(position)
    for child, parent in data.CATEGORY_PARENTS.items():
        if child in position:
            order[parent] = min(order[parent], position[child])

    categories: dict[str, Category] = {}
    roots = [s for s in names if s not in data.CATEGORY_PARENTS]
    children = [s for s in names if s in data.CATEGORY_PARENTS]
    for slug in roots + children:
        parent = categories[data.CATEGORY_PARENTS[slug]] if slug in children else None
        categories[slug], _ = Category.objects.update_or_create(
            slug=slug,
            defaults={
                "name": names[slug],
                "parent": parent,
                "order": order[slug],
                "is_active": True,
            },
        )

    Category.objects.filter(slug__in=data.DEMO_CATEGORY_SLUGS).exclude(slug__in=categories).update(
        is_active=False
    )
    return categories


def _person(name: str) -> Person:
    return Person.objects.get_or_create(slug=persian_slugify(name), defaults={"name": name})[0]


def _publisher(name: str | None) -> Publisher | None:
    if not name:
        return None
    return Publisher.objects.get_or_create(slug=persian_slugify(name), defaults={"name": name})[0]


def _seed_book(record, ranks, exam_types, subjects, categories) -> Book:
    slug = old_slug(record)
    path = legacy_path(record)
    # Match by old path first (survives a slug edit in the admin), then by slug (demo rows).
    book = (
        Book.objects.filter(legacy_path=path).first()
        or Book.objects.filter(slug=slug).first()
        or Book()
    )
    resource_type = infer_resource_type(record)
    fields = {
        "slug": slug,
        "legacy_path": path,
        "title": record["title"],
        "subtitle": record.get("subtitle") or "",
        "publisher": _publisher(record.get("publisher")),
        "edition": record.get("edition") or "",
        "publish_year": record.get("publish_year"),
        "pages": record.get("pages"),
        "volumes": record.get("volumes") or 1,
        "isbn": record.get("isbn") or "",
        "description": rewrite_description(
            record.get("description_html") or "", record.get("description_image_urls")
        ),
        "table_of_contents": record.get("table_of_contents") or "",
        "study_plan_note": "",
        "resource_type": resource_type,
        "is_quick_review": resource_type == "QUICK_REVIEW",
        "cover_source_url": record.get("cover_url") or "",
        "is_featured": False,
        "sales_count": ranks[slug],
        "season_sales_count": 0,
        "is_active": True,
    }
    for name, value in fields.items():
        setattr(book, name, value)
    book.save()

    book.authors.set([_person(n) for n in record.get("authors") or []])
    book.translators.set([_person(n) for n in record.get("translators") or []])
    book.subjects.set([subjects[n] for n in record.get("subjects") or []])
    book.exam_types.set([exam_types[n] for n in record.get("exam_types") or []])
    book.categories.set([categories[s] for s in record.get("categories") or [] if s in categories])

    price = price_decision(record)
    BookVariant.objects.update_or_create(
        book=book,
        type=BookVariant.Type.PRINT,
        defaults={
            "price": price.price,
            "sale_price": price.sale_price,
            "stock": stock_for(record),
            "is_active": True,
            "price_is_placeholder": False,
            "price_note": price.note,
        },
    )
    # Print only: no ebook rights are confirmed yet (removes the demo EBOOK/BUNDLE rows).
    BookVariant.objects.filter(book=book).exclude(type=BookVariant.Type.PRINT).delete()
    book.refresh_from_db()
    return book


def _kit_sort_key(book: Book):
    in_stock = any(v.stock > 0 for v in book.variants.all() if v.is_active)
    essential = in_stock and book.resource_type == Book.ResourceType.TEXTBOOK
    type_rank = {
        Book.ResourceType.TEXTBOOK: 0,
        Book.ResourceType.TESTS: 1,
        Book.ResourceType.LAWS: 2,
        Book.ResourceType.QUICK_REVIEW: 3,
    }.get(book.resource_type, 4)
    return (not essential, not in_stock, type_rank, -book.sales_count, book.id), essential


def _seed_study_kits(books, exam_types, subjects) -> int:
    """One kit per (bar exam, subject) with up to ``KIT_MAX_ITEMS`` real books.

    Essential = in-stock textbooks; then the other books (tests etc.) as optional, in-stock first,
    then by ``sales_count``. Kits without any book are deactivated.
    """
    count = 0
    kept: list[int] = []
    for exam_type_name in data.KIT_EXAM_TYPES:
        exam_type = exam_types[exam_type_name]
        weights = data.SUBJECT_WEIGHTS.get(exam_type_name, {})
        for subject in subjects.values():
            candidates = [
                b
                for b in books
                if b.is_active and subject in b.subjects.all() and exam_type in b.exam_types.all()
            ]
            if not candidates:
                continue
            ranked = sorted(((*_kit_sort_key(b), b) for b in candidates), key=lambda t: t[0])
            ranked = ranked[: data.KIT_MAX_ITEMS]
            rec, _ = StudyKitRecommendation.objects.update_or_create(
                exam_type=exam_type,
                subject=subject,
                defaults={
                    "is_active": True,
                    "note": f"کتاب‌های پیشنهادی {subject.name} برای {exam_type.name}",
                    "weight": weights.get(subject.name),
                },
            )
            kept.append(rec.pk)
            rec.items.exclude(book__in=[b for _key, _ess, b in ranked]).delete()
            for order, (_key, essential, book) in enumerate(ranked, start=1):
                StudyKitItem.objects.update_or_create(
                    recommendation=rec,
                    book=book,
                    defaults={"order": order, "is_essential": essential},
                )
            count += 1
    StudyKitRecommendation.objects.exclude(pk__in=kept).filter(
        exam_type__slug__in=[persian_slugify(n) for n in data.KIT_EXAM_TYPES]
    ).update(is_active=False)
    return count
