"""د۴ readiness dashboard."""

from apps.reader.models import ReadingProgress
from apps.studyhub.services import readiness


def test_no_exam_and_no_orders(user, kit):
    body = readiness.readiness(user)
    assert body["exam"] is None and body["subjects"] == [] and body["headline"] == ""


def test_per_subject_ownership_progress_and_headline(user, books, kit, pay):
    pay(user, [books["civil_ebook"]])
    ReadingProgress.objects.create(user=user, book=books["civil_book"], page=40, total_pages=100)
    body = readiness.readiness(user, exam_slug="kanoon")
    assert body["exam"]["slug"] == "kanoon" and body["exam"]["days_left"] == 40
    # weight order; the subject without essential books is left out
    assert [s["subject"]["slug"] for s in body["subjects"]] == [
        books["civil"].slug,
        books["commerce"].slug,
    ]
    civil, commerce = body["subjects"]
    assert civil["ready"] is True and civil["percent_read"] == 40.0
    assert civil["books"][0]["formats"] == ["EBOOK"] and civil["books"][0]["buy_variant"] is None
    assert commerce["ready"] is False and commerce["essential_owned"] == 0
    assert commerce["essential_total"] == 2 and commerce["percent_read"] is None
    missing = commerce["books"][0]
    assert missing["owned"] is False and missing["buy_variant"]["type"] == "PRINT"
    assert (body["ready_subjects"], body["total_subjects"]) == (1, 2)
    assert body["headline"] == "آمادگی منابع: ۱ از ۲ درس"


def test_print_owned_counts_but_has_no_percent(user, books, kit, pay, methods, address):
    pay(user, [books["civil_print"]], address=address, method=methods["post"])
    civil = readiness.readiness(user, exam_slug="kanoon")["subjects"][0]
    assert civil["ready"] is True and civil["percent_read"] is None
    assert civil["books"][0]["percent_read"] is None


def test_exam_falls_back_to_last_paid_order(user, books, kit, pay):
    pay(user, [books["commerce_ebook"]])
    body = readiness.readiness(user, exam_slug="unknown-slug")
    assert body["exam"]["slug"] == "kanoon"


def test_api_requires_login_and_reads_cookie(api, auth_api, user, kit):
    assert api.get("/api/v1/me/readiness/").status_code == 401
    auth_api.cookies["exam"] = "kanoon"
    res = auth_api.get("/api/v1/me/readiness/")
    assert res.status_code == 200 and res["Cache-Control"] == "private, no-store"
    assert res.json()["headline"] == "آمادگی منابع: ۰ از ۲ درس"
