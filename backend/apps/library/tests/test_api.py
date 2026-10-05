import pytest
from django.utils import timezone

from apps.library.services.entitlements import grant
from apps.orders.models import Order

pytestmark = pytest.mark.django_db

URL = "/api/v1/library/"


def test_requires_login(api):
    assert api.get(URL).status_code == 401


def test_lists_own_active_entitlements(api, user, other_user, make_book):
    mine = make_book("حقوق مدنی الکترونیک")
    hidden = make_book("کتاب غیرفعال‌شده", is_active=False)
    revoked = make_book("لغوشده")
    others = make_book("مال دیگری")
    order = Order.objects.create(user=user, total=100, status=Order.Status.PAID)
    grant(user, mine, source="PURCHASE", order=order)
    grant(user, hidden)
    r = grant(user, revoked)
    r.revoked_at = timezone.now()
    r.save()
    grant(other_user, others)

    api.force_authenticate(user)
    response = api.get(URL)
    assert response.status_code == 200
    data = response.json()
    titles = [item["book"]["title"] for item in data]
    assert sorted(titles) == sorted([mine.title, hidden.title])
    item = next(i for i in data if i["book"]["id"] == mine.pk)
    assert item["source_order"] == order.number
    assert item["can_read"] is True
    assert item["granted_at"]
    assert item["book"]["slug"] == mine.slug
    assert item["book"]["formats"] == ["EBOOK"]
    other = next(i for i in data if i["book"]["id"] == hidden.pk)
    assert other["source_order"] is None


def test_empty_library(api, user):
    api.force_authenticate(user)
    assert api.get(URL).json() == []


def test_progress_per_book(api, user, other_user, make_book):
    from apps.reader.services.progress import save_progress

    read = make_book("در حال مطالعه")
    fresh = make_book("هنوز باز نشده")
    grant(user, read)
    grant(user, fresh)
    save_progress(user, read, page=30, total_pages=120)
    save_progress(other_user, fresh, page=5, total_pages=10)  # someone else's progress

    api.force_authenticate(user)
    data = api.get(URL).json()
    by_id = {i["book"]["id"]: i for i in data}
    p = by_id[read.pk]["progress"]
    assert p["page"] == 30
    assert p["total_pages"] == 120
    assert p["percent"] == 25.0
    assert p["updated_at"]
    assert by_id[fresh.pk]["progress"] is None


def test_progress_query_count_does_not_grow(api, user, make_book):
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    from apps.reader.services.progress import save_progress

    api.force_authenticate(user)

    def count():
        with CaptureQueriesContext(connection) as ctx:
            assert api.get(URL).status_code == 200
        return len(ctx.captured_queries)

    b = make_book("یک")
    grant(user, b)
    save_progress(user, b, page=1, total_pages=2)
    one = count()
    for i in range(3):
        extra = make_book(f"کتاب {i}")
        grant(user, extra)
        save_progress(user, extra, page=1, total_pages=4)
    assert count() == one
