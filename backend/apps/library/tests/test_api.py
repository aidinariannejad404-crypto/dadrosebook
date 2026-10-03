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
