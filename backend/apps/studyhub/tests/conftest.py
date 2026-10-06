import datetime as dt
import uuid
from unittest import mock

import pytest
from django.utils import timezone

from apps.catalog.models import (
    ExamEvent,
    ExamType,
    StudyKitItem,
    StudyKitRecommendation,
    Subject,
)
from apps.catalog.tests.conftest import ebook_variant, make_book, print_variant
from apps.orders.services import checkout, state
from apps.orders.tests.conftest import (  # noqa: F401  (fixtures)
    address,
    api,
    auth_api,
    books,
    methods,
    no_free_shipping,
    other_user,
    user,
)


@pytest.fixture
def kit(books):  # noqa: F811
    """Kanoon exam: civil (weight 4) → civil book; commerce (weight 2) → commerce book +
    a third essential book; an optional item and a subject with no essentials are ignored."""
    kanoon = ExamType.objects.create(name="کانون وکلا", slug="kanoon", short_name="کانون")
    markaz = ExamType.objects.create(name="مرکز وکلا", slug="markaz", short_name="مرکز", order=1)
    ExamEvent.objects.create(
        name="آزمون کانون ۱۴۰۵", exam_type=kanoon, date=timezone.localdate() + dt.timedelta(days=40)
    )
    third = make_book(
        "قانون تجارت محشی",
        subjects=[books["commerce"]],
        exam_types=[kanoon],
        variants=[print_variant(400_000, 5), ebook_variant(200_000)],
    )
    for b in (books["civil_book"], books["commerce_book"]):
        b.exam_types.set([kanoon])
    fiqh = Subject.objects.create(name="متون فقه", color="#6B5A3A", order=6)
    civil_rec = StudyKitRecommendation.objects.create(
        exam_type=kanoon, subject=books["civil"], weight=4
    )
    commerce_rec = StudyKitRecommendation.objects.create(
        exam_type=kanoon, subject=books["commerce"], weight=2
    )
    fiqh_rec = StudyKitRecommendation.objects.create(exam_type=kanoon, subject=fiqh, weight=3)
    StudyKitItem.objects.create(recommendation=civil_rec, book=books["civil_book"], order=0)
    StudyKitItem.objects.create(recommendation=commerce_rec, book=books["commerce_book"], order=0)
    StudyKitItem.objects.create(recommendation=commerce_rec, book=third, order=1)
    StudyKitItem.objects.create(
        recommendation=fiqh_rec, book=books["commerce_book"], order=0, is_essential=False
    )
    return {"kanoon": kanoon, "markaz": markaz, "third": third}


@pytest.fixture
def pay():
    def _pay(user, variants, *, address=None, method=None):  # noqa: F811
        data = {"items": [{"variant_id": v.pk} for v in variants]}
        if address is not None:
            data.update(address_id=address.pk, shipping_method_id=method.pk)
        order = checkout.create_order(user, data, uuid.uuid4())
        with mock.patch("apps.accounts.tasks.send_sms.delay"):
            state.mark_paid(order)
        order.refresh_from_db()
        return order

    return _pay
