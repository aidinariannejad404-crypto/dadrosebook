import datetime as dt

import pytest
from django.contrib.auth.models import Group
from django.test import Client
from django.utils import timezone

from apps.accounts.models import User
from apps.backoffice.services import roles, work_queue
from apps.orders.models import Order
from apps.reviews.models import Review


def staff_client(role: str | None):
    user = User.objects.create_user(phone="09129999999", is_staff=True)
    if role:
        user.groups.add(Group.objects.get(name=role))
    client = Client()
    client.force_login(user)
    return client, user


def test_roles_created_after_migrate(db):
    names = set(Group.objects.values_list("name", flat=True))
    assert set(roles.ROLES) <= names
    shop = Group.objects.get(name="مدیر فروشگاه")
    assert shop.permissions.filter(codename="view_salesreport").exists()
    warehouse = Group.objects.get(name="انبار و ارسال")
    assert warehouse.permissions.filter(codename="change_order").exists()
    assert not warehouse.permissions.filter(codename="view_salesreport").exists()
    # Every listed permission exists (catches typos in ROLES).
    for spec in roles.ROLES.values():
        expected = sum(len(actions) for actions in spec.values())
        assert len(roles.role_permissions(spec)) == expected


def test_sync_is_idempotent_and_keeps_manual_permissions(db):
    group = Group.objects.get(name="پشتیبانی مشتریان")
    extra = roles.role_permissions({"content.banner": ("view",)})[0]
    group.permissions.add(extra)
    roles.sync_staff_roles()
    assert group.permissions.filter(pk=extra.pk).exists()
    assert Group.objects.filter(name="پشتیبانی مشتریان").count() == 1


def test_dashboard_for_superuser(admin_client, user, books, buy):
    buy(user, books["civil_print"])
    res = admin_client.get("/admin/")
    body = res.content.decode()
    assert res.status_code == 200
    assert "پیشخوان فروشگاه" in body
    assert "کارهای امروز" in body
    assert "پذیرش بسته چاپی + الکترونیک" in body
    assert "سفارش پرداخت‌شده برای آماده‌سازی" in body
    assert admin_client.get("/admin/?period=90").status_code == 200
    assert admin_client.get("/admin/?period=bogus").status_code == 200


def test_dashboard_hides_sales_from_warehouse_role(db):
    client, _ = staff_client("انبار و ارسال")
    body = client.get("/admin/").content.decode()
    assert "کارهای امروز" in body
    assert "پذیرش بسته چاپی" not in body
    assert "نظر در انتظار تأیید" not in body  # no review permission
    assert client.get("/admin/reports/sales/").status_code == 403


def test_sales_report_and_exports(admin_client, user, books, buy):
    order = buy(user, books["civil_bundle"])
    res = admin_client.get("/admin/reports/sales/")
    assert res.status_code == 200
    assert "گزارش فروش" in res.content.decode()
    res = admin_client.get("/admin/reports/sales/", {"start": "۱۴۰۰/۰۱/۰۱", "end": "1499/12/29"})
    assert res.status_code == 200
    csv_res = admin_client.get("/admin/reports/sales/", {"export": "orders"})
    text = csv_res.content.decode("utf-8-sig")
    assert csv_res["Content-Type"].startswith("text/csv")
    assert order.number in text
    books_csv = admin_client.get("/admin/reports/sales/", {"export": "books"})
    assert "حقوق مدنی" in books_csv.content.decode("utf-8-sig")
    bad = admin_client.get("/admin/reports/sales/", {"start": "nonsense"})
    assert bad.status_code == 200


def test_report_requires_login(client):
    res = client.get("/admin/reports/sales/")
    assert res.status_code == 302


def test_work_queue_counts_and_links(admin_client, user, books, buy):
    order = buy(user, books["civil_print"])
    Review.objects.create(book=books["civil_book"], user=user, rating=5, body="خوب")
    items = {i["key"]: i for i in work_queue.work_items()}
    assert items["prepare"]["count"] == 1
    assert items["reviews"]["count"] == 1
    assert items["low_stock"]["count"] >= 1  # commerce print has 3
    for item in items.values():
        assert admin_client.get(item["url"]).status_code == 200, item["url"]
    Order.objects.filter(pk=order.pk).update(
        status=Order.Status.SHIPPED, shipped_at=timezone.now() - dt.timedelta(days=30)
    )
    assert work_queue.shipped_overdue(10) == 1
    res = admin_client.get("/admin/orders/order/", {"followup": "overdue"})
    assert order.number in res.content.decode()


def test_badges(db, user, books, buy):
    assert work_queue.orders_badge(None) == ""
    buy(user, books["civil_print"])
    assert work_queue.orders_badge(None) == "۱"


@pytest.mark.parametrize(
    "url", ["/admin/admin/logentry/", "/admin/core/storesettings/", "/admin/accounts/user/"]
)
def test_admin_pages(admin_client, user, url):
    assert admin_client.get(url, follow=True).status_code == 200


def test_order_print_and_csv(admin_client, user, books, buy):
    order = buy(user, books["civil_print"])
    res = admin_client.get(f"/admin/orders/order/{order.pk}/print/")
    body = res.content.decode()
    assert res.status_code == 200
    assert order.number in body and "برگه بسته‌بندی" in body and "خیابان آزادی" in body
    post = {"_selected_action": [order.pk]}
    res = admin_client.post("/admin/orders/order/", {**post, "action": "print_slips"})
    assert order.number in res.content.decode()
    res = admin_client.post("/admin/orders/order/", {**post, "action": "export_csv"})
    assert order.number in res.content.decode("utf-8-sig")


def test_user_admin_summary_and_privilege_guard(admin_client, user, books, buy):
    buy(user, books["civil_print"])
    res = admin_client.get(f"/admin/accounts/user/{user.pk}/change/")
    assert "۱ سفارش موفق" in res.content.decode()
    client, support = staff_client("پشتیبانی مشتریان")
    res = client.get(f"/admin/accounts/user/{support.pk}/change/")
    assert res.status_code == 200
    assert 'name="is_superuser"' not in res.content.decode()


def test_variant_quick_edit_validation(admin_client, books):
    from apps.catalog.models import BookVariant

    v = books["commerce_print"]
    v.sale_price = v.price + 1
    with pytest.raises(Exception):  # noqa: B017
        v.full_clean()
    res = admin_client.get("/admin/catalog/bookvariant/", {"low_stock": "1"})
    assert res.status_code == 200
    admin_client.post(
        "/admin/catalog/bookvariant/",
        {"_selected_action": [v.pk], "action": "confirm_prices"},
    )
    assert BookVariant.objects.get(pk=v.pk).price_is_placeholder is False


def test_open_returns_in_work_queue_and_net_revenue(admin_client, user, books, buy):
    from apps.backoffice.services import metrics
    from apps.orders.services import returns

    order = buy(user, books["civil_print"])
    item = order.items.get()
    rr = returns.create_return(order, [(item, 1)], reason="CHANGED_MIND")
    items = {i["key"]: i for i in work_queue.work_items()}
    assert items["returns"]["count"] == 1
    assert admin_client.get(items["returns"]["url"]).status_code == 200
    assert work_queue.returns_badge(None) == "۱"
    Order.objects.filter(pk=order.pk).update(refunded_total=100)
    s = metrics.sales_summary(metrics.window_for_days(7))
    assert s["refunds"] == 100 and s["net"] == s["revenue"] - 100
    assert "خالص پس از استرداد" in admin_client.get("/admin/").content.decode()
    assert rr.pk
