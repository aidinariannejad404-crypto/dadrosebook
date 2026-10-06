"""د۳ post-purchase «شروع مطالعه»: read first, one-tap plan, reminder consent."""

from apps.leads.models import Lead
from apps.studyhub.models import StudyReminderConsent
from apps.studyhub.services import reminders, start


def test_read_first_prefers_the_essential_kit_book(user, books, kit, pay):
    order = pay(user, [books["commerce_ebook"], books["civil_ebook"]])
    body = start.start_studying(user, order, exam_slug="kanoon")
    # civil has the higher weight in the kanoon kit
    assert body["read_first"]["slug"] == books["civil_book"].slug
    assert body["read_first"]["reader_url"] == f"/read/{books['civil_book'].slug}"
    assert body["plan"]["exam_type"] == "kanoon"
    assert [b["slug"] for b in body["plan"]["books"]] == [
        books["commerce_book"].slug,
        books["civil_book"].slug,
    ]
    assert books["civil"].slug in body["plan"]["subjects"]


def test_read_first_falls_back_to_first_ebook_and_none_for_print(
    user, books, pay, methods, address
):
    order = pay(user, [books["commerce_ebook"]])
    assert start.start_studying(user, order)["read_first"]["slug"] == books["commerce_book"].slug
    print_order = pay(user, [books["civil_print"]], address=address, method=methods["post"])
    assert start.start_studying(user, print_order)["read_first"] is None


def test_api_start_only_for_own_paid_orders(auth_api, user, other_user, books, kit, pay):
    mine = pay(user, [books["civil_ebook"]])
    theirs = pay(other_user, [books["civil_ebook"]])
    res = auth_api.get(f"/api/v1/me/orders/{mine.number}/start/?exam=kanoon")
    assert res.status_code == 200
    assert res.json()["reminders"] == {"sms": False, "consented_at": None}
    assert auth_api.get(f"/api/v1/me/orders/{theirs.number}/start/").status_code == 404


def test_one_tap_plan_from_order(auth_api, user, books, kit, pay):
    order = pay(user, [books["civil_ebook"], books["commerce_ebook"]])
    res = auth_api.post(
        "/api/v1/me/study-plan/", {"order": order.number, "exam_type": "kanoon"}, format="json"
    )
    assert res.status_code == 201
    lead = Lead.objects.get(token=res.json()["token"])
    assert res.json()["plan_url"] == f"/plan/{lead.token}"
    assert lead.phone == user.phone and lead.exam_type.slug == "kanoon"
    assert set(lead.books.values_list("pk", flat=True)) == {
        books["civil_book"].pk,
        books["commerce_book"].pk,
    }
    assert lead.consent is False  # never assumed
    assert lead.plan["days"]


def test_one_tap_plan_rejects_unpaid_or_foreign(auth_api, books):
    res = auth_api.post("/api/v1/me/study-plan/", {"order": "NOPE"}, format="json")
    assert res.status_code == 404


def test_reminder_consent_opt_in_and_out(auth_api, user):
    res = auth_api.put(
        "/api/v1/me/study-reminders/", {"sms": True, "source": "payment_result"}, format="json"
    )
    assert res.status_code == 200 and res.json()["sms"] is True
    obj = StudyReminderConsent.objects.get(user=user)
    assert obj.consented_at and obj.source == "payment_result" and obj.withdrawn_at is None
    first = obj.consented_at
    reminders.set_consent(user, True)
    assert StudyReminderConsent.objects.get(user=user).consented_at == first
    res = auth_api.put("/api/v1/me/study-reminders/", {"sms": False}, format="json")
    assert res.json() == {"sms": False, "consented_at": None}
    assert StudyReminderConsent.objects.get(user=user).withdrawn_at is not None
    assert auth_api.put("/api/v1/me/study-reminders/", {}, format="json").status_code == 400
