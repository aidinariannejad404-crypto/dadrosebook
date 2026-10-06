import datetime as dt

import pytest
from django.urls import reverse

from apps.catalog.models import ExamEvent
from apps.leads.services.leads import create_study_plan_lead
from apps.reviews.models import Review
from apps.reviews.services.reviews import approve, submit_review
from apps.study.models import EditionLink, ReadingDay
from apps.study.services.activity import tehran_today


def test_endpoints_need_login(api):
    for name in ("study:heartbeat", "study:goal", "study:report", "study:plan", "study:forecast"):
        assert api.get(reverse(name)).status_code in (401, 403, 405)


def test_heartbeat_requires_entitlement(auth_api, book):
    res = auth_api.post(
        reverse("study:heartbeat"), {"book": book.slug, "seconds": 30}, format="json"
    )
    assert res.status_code == 403


def test_heartbeat_and_goal(auth_api, user, entitled, book):
    res = auth_api.post(
        reverse("study:heartbeat"), {"book": book.slug, "seconds": 30, "page": 3}, format="json"
    )
    assert res.status_code == 200
    body = res.json()
    assert body["credited_seconds"] == 30
    assert body["goal_minutes"] == 20
    assert body["streak"]["rest_days_per_week"] == 2
    assert body["pace"]["measured"] is False

    res = auth_api.patch(reverse("study:goal"), {"daily_goal_minutes": 3}, format="json")
    assert res.status_code == 400
    res = auth_api.patch(
        reverse("study:goal"), {"daily_goal_minutes": 30, "review_sms": False}, format="json"
    )
    assert res.status_code == 200
    assert res.json()["daily_goal_minutes"] == 30
    assert res.json()["review_sms"] is False
    assert ReadingDay.objects.get(user=user, date=tehran_today()).goal_minutes == 30


def test_report_and_forecast(auth_api, entitled, book):
    from apps.reader.models import ReadingProgress

    ReadingProgress.objects.create(user=entitled, book=book, page=50, total_pages=200)
    report = auth_api.get(reverse("study:report")).json()
    assert len(report["days"]) == 7
    assert report["streak"]["current"] == 0
    forecast = auth_api.get(reverse("study:forecast")).json()
    assert forecast["exam"] is None
    assert forecast["books"][book.slug]["remaining_pages"] == 150


def test_plan_flow(auth_api, user, book, book2, civil, kanoon):
    ExamEvent.objects.create(
        name="کانون", exam_type=kanoon, date=tehran_today() + dt.timedelta(days=40)
    )
    assert auth_api.get(reverse("study:plan")).status_code == 404
    lead = create_study_plan_lead(
        phone=user.phone,
        exam_type=kanoon,
        subjects=[civil],
        books=[book, book2],
        hours_per_day=3,
        consent=True,
    )
    res = auth_api.post(reverse("study:plan"), {"lead_token": str(lead.token)}, format="json")
    assert res.status_code == 201
    plan = res.json()
    assert plan["lead_token"] == str(lead.token)
    item = plan["today"]["day"]["items"][0]
    res = auth_api.post(
        reverse("study:plan-check") + "?view=today",
        {
            "book_slug": item["book_slug"],
            "pages_from": item["pages_from"],
            "pages_to": item["pages_to"],
            "done": True,
        },
        format="json",
    )
    assert res.status_code == 200
    assert res.json()["today"]["day"]["items"][0]["done"] is True
    assert "days" not in res.json()
    res = auth_api.post(reverse("study:plan-compress"))
    assert res.status_code == 200
    assert res.json()["compressed_count"] == 1


def test_plan_from_owned_books_only(auth_api, user, book, book2):
    from apps.library.services import entitlements

    entitlements.grant(user, book)
    res = auth_api.post(
        reverse("study:plan"), {"book_slugs": [book.slug, book2.slug]}, format="json"
    )
    assert res.status_code == 201
    assert [b["slug"] for b in res.json()["books"]] == [book.slug]
    owned = auth_api.get(reverse("study:owned-books")).json()
    assert [b["slug"] for b in owned] == [book.slug]


def test_upgrade_offer_endpoint(api, auth_api, user, book, book2):
    from apps.library.services import entitlements

    EditionLink.objects.create(new_book=book2, old_book=book, upgrade_discount_percent=30)
    url = reverse("study:upgrade", args=[book2.slug])
    assert api.get(url).json() == {"offer": None}
    assert auth_api.get(url).json() == {"offer": None}
    entitlements.grant(user, book)
    offer = auth_api.get(url).json()["offer"]
    assert offer["percent"] == 30


def test_review_prompts_endpoint(auth_api, user, book):
    from apps.study.models import ReviewPrompt

    prompt = ReviewPrompt.objects.create(user=user, book=book, reason="READ")
    data = auth_api.get(reverse("study:review-prompts")).json()
    assert data[0]["book"]["slug"] == book.slug
    assert data[0]["exam_type"]["name"] == "کانون وکلا"
    res = auth_api.post(reverse("study:review-prompt-dismiss", args=[prompt.pk]))
    assert res.status_code == 204
    assert auth_api.get(reverse("study:review-prompts")).json() == []


@pytest.mark.django_db
def test_review_filters_and_exam_breakdown(api, user, other_user, book, kanoon):
    r1, _ = submit_review(user, book, 5, "عالی", exam_type=kanoon)
    r2, _ = submit_review(other_user, book, 2, "")
    approve(Review.objects.all(), None)
    url = reverse("reviews:book-reviews", args=[book.slug])
    data = api.get(url).json()
    assert data["summary"]["exam_types"] == [
        {"slug": kanoon.slug, "name": "کانون وکلا", "short_name": "کانون", "count": 1}
    ]
    assert [r["id"] for r in api.get(url, {"rating": 2}).json()["results"]] == [r2.pk]
    assert [r["id"] for r in api.get(url, {"exam_type": kanoon.slug}).json()["results"]] == [r1.pk]
    assert len(api.get(url, {"rating": "x"}).json()["results"]) == 2


def test_submitting_a_review_answers_the_prompt(auth_api, user, book):
    from apps.study.models import ReviewPrompt

    ReviewPrompt.objects.create(user=user, book=book, reason="READ")
    url = reverse("reviews:book-reviews", args=[book.slug])
    assert auth_api.post(url, {"rating": 5}, format="json").status_code == 201
    assert ReviewPrompt.objects.get().answered_at is not None
