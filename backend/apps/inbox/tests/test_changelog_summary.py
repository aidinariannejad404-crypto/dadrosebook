import datetime as dt

from django.utils import timezone

from apps.inbox.models import ChangelogEntry
from apps.inbox.services import changelog
from apps.inbox.services.notifications import ANNOUNCEMENT, notify
from apps.library.services.entitlements import grant
from apps.reader.models import ReadingProgress


def entry(title, days_ago=0, **kw):
    return ChangelogEntry.objects.create(
        title=title,
        body="توضیح",
        published_at=timezone.localdate() - dt.timedelta(days=days_ago),
        **kw,
    )


def test_published_and_latest(db):
    old = entry("قدیمی", days_ago=10)
    entry("بی‌اعلان", days_ago=1, announce=False)
    entry("پیش‌نویس", is_published=False)
    entry("آینده", days_ago=-3)
    assert [e.title for e in changelog.published_entries()] == ["بی‌اعلان", "قدیمی"]
    assert changelog.latest_announcement() == old


def test_changelog_api(api, db):
    e = entry("فونت تازه در کتابخوان", area="reader")
    res = api.get("/api/v1/changelog/")
    assert res.status_code == 200
    row = res.json()["results"][0]
    assert row["title"] == "فونت تازه در کتابخوان" and row["area_label"] == "کتابخوان"
    assert row["published_jalali"]
    assert api.get("/api/v1/changelog/latest/").json()["entry"]["id"] == e.pk


def test_changelog_latest_empty(api, db):
    assert api.get("/api/v1/changelog/latest/").json() == {"entry": None}


def test_summary_without_library(user, auth_api):
    notify(user, ANNOUNCEMENT, "سلام")
    body = auth_api.get("/api/v1/inbox/summary/").json()
    assert body == {
        "unread": 1,
        "has_library": False,
        "continue_reading": None,
        "show_onboarding": True,
        "exam_type": None,
    }


def test_summary_continue_reading(user, auth_api, make_ebook):
    a, b, c = make_ebook("مدنی ۱"), make_ebook("تجارت"), make_ebook("تمام‌شده")
    for book in (a, b, c):
        grant(user, book)
    ReadingProgress.objects.create(user=user, book=a, page=10, total_pages=100)
    ReadingProgress.objects.create(user=user, book=b, page=40, total_pages=200)
    ReadingProgress.objects.create(user=user, book=c, page=50, total_pages=50)
    ReadingProgress.objects.filter(book=a).update(updated_at=timezone.now() - dt.timedelta(days=2))
    body = auth_api.get("/api/v1/inbox/summary/").json()
    assert body["has_library"] is True
    cont = body["continue_reading"]
    assert cont["book"]["title"] == "تجارت"
    assert cont["progress"]["page"] == 40 and cont["progress"]["percent"] == 20.0
