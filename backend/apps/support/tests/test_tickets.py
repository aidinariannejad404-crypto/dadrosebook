from unittest import mock

import pytest
from django.contrib.auth.models import Group
from django.test import Client

from apps.accounts.models import User
from apps.backoffice.services.work_queue import work_items
from apps.inbox.models import Notification
from apps.orders.models import Order
from apps.support.models import SupportTicket, TicketMessage
from apps.support.services import tickets as t

BODY = "کتاب الکترونیک در کتابخانه‌ام نیامده است."


def test_create_for_user_uses_account_phone(user):
    ticket = t.create_ticket(
        user=user, phone="09350000000", topic="ebook", body=BODY, source="account"
    )
    assert ticket.phone == user.phone
    assert len(ticket.tracking_code) == 8 and ticket.tracking_code.isdigit()
    assert ticket.subject == "کتاب الکترونیک و کتابخوان"
    assert ticket.status == SupportTicket.Status.OPEN
    assert ticket.messages.get().author == TicketMessage.Author.CUSTOMER


def test_create_for_guest_validates(db):
    with pytest.raises(t.TicketError) as err:
        t.create_ticket(phone="123", topic="order", body=BODY)
    assert err.value.field == "phone"
    with pytest.raises(t.TicketError) as err:
        t.create_ticket(phone="09121112222", topic="bad", body=BODY)
    assert err.value.field == "topic"
    with pytest.raises(t.TicketError) as err:
        t.create_ticket(phone="09121112222", topic="order", body="کوتاه")
    assert err.value.field == "body"
    ticket = t.create_ticket(phone="۰۹۱۲۱۱۱۲۲۲۲", topic="order", body=BODY, name="مهمان")
    assert ticket.phone == "09121112222" and ticket.user is None


def test_order_must_belong_to_the_phone(user):
    order = Order.objects.create(user=user, total=1000)
    ticket = t.create_ticket(user=user, topic="order", body=BODY, order_number=order.number.lower())
    assert ticket.order == order
    with pytest.raises(t.TicketError) as err:
        t.create_ticket(phone="09129990000", topic="order", body=BODY, order_number=order.number)
    assert err.value.field == "order_number"


def test_guest_lookup_needs_both(db):
    ticket = t.create_ticket(phone="09121112222", topic="other", body=BODY)
    persian = ticket.tracking_code.translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))
    assert t.find_for_guest("09121112222", persian) == ticket
    assert t.find_for_guest("09121113333", ticket.tracking_code) is None
    assert t.find_for_guest("09121112222", "12") is None


def test_staff_reply_sms_and_inbox(user, sent, django_capture_on_commit_callbacks, settings):
    settings.SITE_URL = "https://dadrosebook.com"
    staff = User.objects.create_user("09120000001", is_staff=True)
    ticket = t.create_ticket(user=user, topic="ebook", body=BODY)
    with django_capture_on_commit_callbacks(execute=True):
        t.staff_reply(ticket, "کتاب به کتابخانه شما اضافه شد.", staff_user=staff)
    ticket.refresh_from_db()
    assert ticket.status == SupportTicket.Status.ANSWERED and ticket.last_staff_at
    phone, text = sent[0]
    assert phone == user.phone
    assert ticket.tracking_code in text
    assert f"https://dadrosebook.com/account/support/{ticket.tracking_code}" in text
    item = Notification.objects.get(user=user)
    assert item.link == f"/account/support/{ticket.tracking_code}"
    # the customer answers: back to «در انتظار پاسخ»
    t.customer_reply(ticket, "ممنون، الان دیدم. یک سؤال دیگر هم دارم.")
    ticket.refresh_from_db()
    assert ticket.status == SupportTicket.Status.OPEN


def test_closed_ticket_rejects_replies(db, django_capture_on_commit_callbacks):
    ticket = t.create_ticket(phone="09121112222", topic="other", body=BODY)
    with (
        mock.patch("apps.accounts.tasks.send_sms.delay") as send,
        django_capture_on_commit_callbacks(execute=True),
    ):
        t.staff_reply(ticket, "حل شد.", close=True)
    assert send.call_args.kwargs["link"] == f"/support/track?code={ticket.tracking_code}"
    ticket.refresh_from_db()
    assert ticket.status == SupportTicket.Status.CLOSED and ticket.closed_at
    with pytest.raises(t.TicketError):
        t.customer_reply(ticket, "هنوز مشکل دارم و حل نشده است.")


def test_open_count_badge_and_work_queue(db):
    t.create_ticket(phone="09121112222", topic="other", body=BODY)
    assert t.open_count() == 1
    assert t.open_badge(None) == "۱"
    item = next(i for i in work_items() if i["key"] == "tickets")
    assert item["count"] == 1 and "status__exact=open" in item["url"]


# --- API ---


def test_guest_create_lookup_and_reply(api, db):
    res = api.post(
        "/api/v1/support/tickets/",
        {"topic": "payment", "body": BODY, "phone": "09121112222", "source": "faq"},
        format="json",
    )
    assert res.status_code == 201, res.json()
    code = res.json()["tracking_code"]
    assert res.json()["status_label"] == "در انتظار پاسخ"
    res = api.post(
        "/api/v1/support/lookup/", {"phone": "09121112222", "tracking_code": code}, format="json"
    )
    assert res.status_code == 200 and res.json()["messages"][0]["body"] == BODY
    res = api.post(
        "/api/v1/support/lookup/", {"phone": "09121113333", "tracking_code": code}, format="json"
    )
    assert res.status_code == 404
    res = api.post(
        f"/api/v1/support/tickets/{code}/messages/",
        {"body": "پیگیری دوباره درخواست قبلی.", "phone": "09121112222"},
        format="json",
    )
    assert res.status_code == 201 and len(res.json()["messages"]) == 2


def test_user_list_and_detail(user, auth_api, api):
    res = auth_api.post("/api/v1/support/tickets/", {"topic": "ebook", "body": BODY}, format="json")
    code = res.json()["tracking_code"]
    rows = auth_api.get("/api/v1/support/tickets/").json()
    assert [r["tracking_code"] for r in rows] == [code]
    assert auth_api.get(f"/api/v1/support/tickets/{code}/").status_code == 200
    assert api.get("/api/v1/support/tickets/").status_code == 401
    other = t.create_ticket(phone="09121112222", topic="other", body=BODY)
    assert auth_api.get(f"/api/v1/support/tickets/{other.tracking_code}/").status_code == 404


def test_create_validation_error(api, db):
    res = api.post("/api/v1/support/tickets/", {"topic": "x", "body": BODY}, format="json")
    assert res.status_code == 400 and "topic" in res.json()


def test_topics(api, db):
    rows = api.get("/api/v1/support/topics/").json()
    assert rows[0] == {"value": "order", "label": "پیگیری سفارش و ارسال"}


# --- admin ---


@pytest.fixture
def admin_client(db):
    admin = User.objects.create_superuser(phone="09120000000", password="pass12345")
    client = Client()
    client.force_login(admin)
    return client


def test_admin_reply(admin_client, django_capture_on_commit_callbacks):
    ticket = t.create_ticket(phone="09121112222", topic="other", body=BODY)
    url = f"/admin/support/supportticket/{ticket.pk}/change/"
    assert admin_client.get(url).status_code == 200
    assert admin_client.get("/admin/support/supportticket/").status_code == 200
    with (
        mock.patch("apps.accounts.tasks.send_sms.delay") as send,
        django_capture_on_commit_callbacks(execute=True),
    ):
        res = admin_client.post(
            url,
            {
                "status": "open",
                "reply": "سلام، بررسی شد.",
                "close_after_reply": "on",
                "messages-TOTAL_FORMS": "1",
                "messages-INITIAL_FORMS": "1",
                "messages-MIN_NUM_FORMS": "0",
                "messages-MAX_NUM_FORMS": "1000",
                "messages-0-id": ticket.messages.get().pk,
                "messages-0-ticket": ticket.pk,
            },
        )
    assert res.status_code == 302, res.content.decode()[:2000]
    ticket.refresh_from_db()
    assert ticket.status == SupportTicket.Status.CLOSED
    assert ticket.messages.filter(author="staff").count() == 1
    assert send.called


def test_support_role_has_ticket_perms(db):
    group = Group.objects.get(name="پشتیبانی مشتریان")
    assert group.permissions.filter(codename="change_supportticket").exists()
