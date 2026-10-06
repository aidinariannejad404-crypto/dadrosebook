"""د۴ «خبرم کن» list in the account, with cancel."""

import datetime as dt

from django.utils import timezone

from apps.engagement.models import BackInStockRequest
from apps.studyhub.services import notify

S = BackInStockRequest.Status


def _req(variant, phone, user=None, **kw):
    return BackInStockRequest.objects.create(variant=variant, phone=phone, user=user, **kw)


def test_list_includes_user_and_phone_requests(user, other_user, books):
    by_user = _req(books["civil_print"], "09129999999", user=user)
    by_phone = _req(books["commerce_print"], user.phone)
    _req(books["civil_print"], other_user.phone, user=other_user)
    _req(books["civil_bundle"], user.phone, status=S.CANCELLED)
    _req(
        books["commerce_ebook"],
        user.phone,
        status=S.NOTIFIED,
        notified_at=timezone.now() - dt.timedelta(days=40),
    )
    recent = _req(books["civil_ebook"], user.phone, status=S.NOTIFIED, notified_at=timezone.now())
    ids = [r["id"] for r in notify.notify_list(user)]
    assert set(ids) == {by_user.pk, by_phone.pk, recent.pk}
    row = next(r for r in notify.notify_list(user) if r["id"] == by_phone.pk)
    assert row["book"]["title"] == books["commerce_book"].title
    assert row["variant"]["type"] == "PRINT" and row["status_label"] == "در انتظار"


def test_cancel_only_own_pending(auth_api, user, other_user, books):
    mine = _req(books["civil_print"], user.phone)
    theirs = _req(books["civil_print"], other_user.phone, user=other_user)
    assert auth_api.get("/api/v1/me/back-in-stock/").status_code == 200
    assert auth_api.delete(f"/api/v1/me/back-in-stock/{theirs.pk}/").status_code == 404
    assert auth_api.delete(f"/api/v1/me/back-in-stock/{mine.pk}/").status_code == 204
    mine.refresh_from_db()
    assert mine.status == S.CANCELLED
    assert auth_api.delete(f"/api/v1/me/back-in-stock/{mine.pk}/").status_code == 404
