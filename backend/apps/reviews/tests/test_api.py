import pytest
from django.urls import resolve

from apps.reviews.api.views import BookReviewsView
from apps.reviews.models import Review
from apps.reviews.services import reviews as svc

from .conftest import login

pytestmark = pytest.mark.django_db


def url(book) -> str:
    return f"/api/v1/catalog/books/{book.slug}/reviews/"


def test_review_path_resolves_to_reviews_view(book):
    # Catalog's ``books/<str:slug>/`` must not swallow ``…/reviews/``.
    assert resolve(url(book)).func.view_class is BookReviewsView
    assert resolve("/api/v1/catalog/books/حقوق-مدنی/reviews/").func.view_class is BookReviewsView


def test_get_public_shows_approved_only(api, book, user, other_user):
    review, _ = svc.submit_review(user, book, 5, "عالی")
    res = api.get(url(book))
    assert res.status_code == 200
    assert res.json()["results"] == []
    assert res.json()["summary"]["count"] == 0

    svc.approve([review], other_user)
    data = api.get(url(book)).json()
    assert data["summary"] == {
        "average": None,
        "count": 1,
        "distribution": {"5": 1, "4": 0, "3": 0, "2": 0, "1": 0},
        "exam_types": [],
    }
    (item,) = data["results"]
    assert item["author"] == "علی ر."
    assert item["body"] == "عالی"
    assert item["rating"] == 5
    assert item["exam_type"] is None
    assert set(item) == {
        "id",
        "rating",
        "body",
        "author",
        "exam_type",
        "is_verified_purchase",
        "created_at",
    }
    assert user.phone not in res.content.decode() + str(data)


def test_get_unknown_or_inactive_book_404(api, book):
    assert api.get("/api/v1/catalog/books/nope/reviews/").status_code == 404
    book.is_active = False
    book.save()
    res = api.get(url(book))
    assert res.status_code == 404
    assert res.json()["detail"] == "کتاب پیدا نشد."


def test_post_requires_login(api, book):
    res = api.post(url(book), {"rating": 5}, format="json")
    assert res.status_code == 401


def test_post_creates_pending_and_updates(api, book, user, exam_type):
    login(api, user)
    res = api.post(
        url(book),
        {"rating": 4, "body": "<b>خوب</b>", "exam_type": exam_type.slug},
        format="json",
    )
    assert res.status_code == 201
    assert res.json() == {
        "status": "PENDING",
        "message": "نظر شما ثبت شد و پس از بررسی نمایش داده می‌شود.",
    }
    review = Review.objects.get()
    assert review.body == "خوب"
    assert review.exam_type == exam_type

    svc.approve([review], user)
    res = api.post(url(book), {"rating": 2, "exam_type": None}, format="json")
    assert res.status_code == 201
    review.refresh_from_db()
    assert review.status == Review.Status.PENDING
    assert review.rating == 2
    assert review.exam_type is None
    assert Review.objects.count() == 1


@pytest.mark.parametrize("payload", [{}, {"rating": 0}, {"rating": 6}, {"rating": "x"}])
def test_post_validates_rating(api, book, user, payload):
    login(api, user)
    res = api.post(url(book), payload, format="json")
    assert res.status_code == 400
    assert "rating" in res.json()


def test_post_rejects_unknown_exam_type_and_long_body(api, book, user):
    login(api, user)
    res = api.post(url(book), {"rating": 5, "exam_type": "nope"}, format="json")
    assert res.status_code == 400
    assert "exam_type" in res.json()
    res = api.post(url(book), {"rating": 5, "body": "a" * 2001}, format="json")
    assert res.status_code == 400
    assert "body" in res.json()


def test_post_is_throttled(api, book, user, settings):
    login(api, user)
    for _ in range(10):
        assert api.post(url(book), {"rating": 5}, format="json").status_code == 201
    assert api.post(url(book), {"rating": 5}, format="json").status_code == 429
    assert api.get(url(book)).status_code == 200  # reads are not throttled


def test_my_reviews_lists_own_with_status(api, book, user, other_user):
    svc.submit_review(user, book, 5, "مال من")
    svc.submit_review(other_user, book, 1, "مال دیگری")
    assert api.get("/api/v1/me/reviews/").status_code == 401

    login(api, user)
    data = api.get("/api/v1/me/reviews/").json()
    assert len(data) == 1
    assert data[0]["body"] == "مال من"
    assert data[0]["status"] == "PENDING"
    assert data[0]["status_label"] == "در انتظار بررسی"
    assert data[0]["book"] == {"title": book.title, "slug": book.slug}


def test_public_limit_is_20(api, book, other_user):
    from apps.accounts.models import User

    for i in range(22):
        u = User.objects.create_user(phone=f"091200001{i:02d}")
        r, _ = svc.submit_review(u, book, 5, "")
        svc.approve([r], other_user)
    data = api.get(url(book)).json()
    assert len(data["results"]) == 20
    assert data["summary"]["count"] == 22
    assert data["summary"]["average"] == 5.0
