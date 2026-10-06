import pytest
from django.contrib.admin.sites import site
from django.contrib.messages.storage.fallback import FallbackStorage
from django.test import RequestFactory

from apps.accounts.models import User
from apps.reviews.models import Review
from apps.reviews.services import reviews as svc

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(phone="09129999999", password="x")


def _request(admin_user):
    request = RequestFactory().post("/")
    request.user = admin_user
    request.session = {}
    request._messages = FallbackStorage(request)
    return request


def test_bulk_actions_use_services(admin_user, book, user, other_user):
    r1, _ = svc.submit_review(user, book, 5, "")
    r2, _ = svc.submit_review(other_user, book, 3, "")
    model_admin = site._registry[Review]
    request = _request(admin_user)
    model_admin.approve_reviews(request, Review.objects.filter(id=r1.id))
    model_admin.reject_reviews(request, Review.objects.filter(id=r2.id))
    r1.refresh_from_db()
    r2.refresh_from_db()
    assert r1.status == Review.Status.APPROVED and r1.moderated_by == admin_user
    assert r2.status == Review.Status.REJECTED


def test_changelist_pending_first(client, admin_user, book, user, other_user):
    approved, _ = svc.submit_review(user, book, 5, "")
    svc.approve([approved], admin_user)
    pending, _ = svc.submit_review(other_user, book, 3, "")
    model_admin = site._registry[Review]
    request = _request(admin_user)
    qs = model_admin.get_queryset(request)
    assert qs.first() == pending

    client.force_login(admin_user)
    res = client.get("/admin/reviews/review/")
    assert res.status_code == 200
    assert client.get("/admin/reviews/review/?q=09121234567").status_code == 200
