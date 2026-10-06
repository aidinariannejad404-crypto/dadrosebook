import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.orders.models import Order, OrderItem
from apps.reviews.models import Review
from apps.reviews.services import reviews as svc

pytestmark = pytest.mark.django_db


def make_order(user, book, *, paid: bool):
    order = Order.objects.create(user=user, paid_at=timezone.now() if paid else None)
    OrderItem.objects.create(
        order=order,
        book=book,
        title=book.title,
        variant_type="PRINT",
        list_price=100,
        unit_price=100,
        line_total=100,
    )
    return order


def reviewer(i: int) -> User:
    return User.objects.create_user(phone=f"0912000000{i}")


def test_clean_body_strips_html_and_collapses_whitespace():
    assert svc.clean_body("<script>alert(1)</script>سلام   <b>دنیا</b>\n\nخوب") == "سلام دنیا خوب"
    assert svc.clean_body("") == ""
    assert svc.clean_body(None) == ""
    assert svc.clean_body("و & ب") == "و & ب"
    assert len(svc.clean_body("الف" * 3000)) == 2000


def test_submit_creates_pending_review(user, book, exam_type):
    review, created = svc.submit_review(user, book, 5, "<p>عالی</p>", exam_type)
    assert created
    assert review.status == Review.Status.PENDING
    assert review.body == "عالی"
    assert review.exam_type == exam_type
    assert review.is_verified_purchase is False


def test_resubmit_updates_and_returns_to_pending(user, book, other_user):
    review, _ = svc.submit_review(user, book, 2, "بد")
    svc.reject([review], other_user, "نامناسب")
    review.refresh_from_db()
    assert review.status == Review.Status.REJECTED
    assert review.moderated_by == other_user

    again, created = svc.submit_review(user, book, 4, "بهتر شد")
    assert not created
    assert again.id == review.id
    again.refresh_from_db()
    assert again.status == Review.Status.PENDING
    assert again.rating == 4
    assert again.reject_reason == ""
    assert again.moderated_at is None
    assert again.moderated_by is None
    assert Review.objects.count() == 1


def test_invalid_rating_raises(user, book):
    with pytest.raises(ValueError):
        svc.submit_review(user, book, 6, "")


def test_verified_purchase_requires_paid_order(user, book):
    make_order(user, book, paid=False)
    assert svc.submit_review(user, book, 5, "")[0].is_verified_purchase is False
    make_order(user, book, paid=True)
    assert svc.submit_review(user, book, 5, "")[0].is_verified_purchase is True


def test_verified_purchase_is_per_user(user, other_user, book):
    make_order(other_user, book, paid=True)
    assert svc.is_verified_purchase(user, book) is False
    assert svc.is_verified_purchase(other_user, book) is True


def test_approve_and_reject(user, other_user, book):
    review, _ = svc.submit_review(user, book, 5, "")
    assert svc.approve(Review.objects.filter(id=review.id), other_user) == 1
    review.refresh_from_db()
    assert review.status == Review.Status.APPROVED
    assert review.moderated_at is not None
    assert svc.reject([review], other_user, "تبلیغ") == 1
    review.refresh_from_db()
    assert review.status == Review.Status.REJECTED
    assert review.reject_reason == "تبلیغ"


def test_summary_counts_approved_only_and_hides_average_under_three(book, other_user):
    r1, _ = svc.submit_review(reviewer(1), book, 5, "")
    r2, _ = svc.submit_review(reviewer(2), book, 4, "")
    svc.submit_review(reviewer(3), book, 1, "")  # pending
    svc.approve([r1, r2], other_user)
    s = svc.summary(book)
    assert s == {
        "average": None,
        "count": 2,
        "distribution": {"5": 1, "4": 1, "3": 0, "2": 0, "1": 0},
        "exam_types": [],
    }

    r4, _ = svc.submit_review(reviewer(4), book, 4, "")
    svc.approve([r4], other_user)
    s = svc.summary(book)
    assert s["count"] == 3
    assert s["average"] == 4.3


def test_public_reviews_newest_first_approved_only(book, other_user):
    first, _ = svc.submit_review(reviewer(1), book, 5, "اول")
    second, _ = svc.submit_review(reviewer(2), book, 4, "دوم")
    rejected, _ = svc.submit_review(reviewer(3), book, 1, "رد")
    svc.approve([first, second], other_user)
    svc.reject([rejected], other_user)
    assert [r.id for r in svc.public_reviews(book)] == [second.id, first.id]


def test_author_display_masks_name_and_never_shows_phone(user):
    assert svc.author_display(user) == "علی ر."
    nameless = User.objects.create_user(phone="09120000099")
    assert svc.author_display(nameless) == "کاربر دادرُز"
    first_only = User.objects.create_user(phone="09120000098", first_name="مریم")
    assert svc.author_display(first_only) == "مریم"
