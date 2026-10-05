import csv
import datetime as dt

from django import forms
from django.contrib import admin
from django.core.exceptions import PermissionDenied
from django.http import HttpResponse
from django.template.response import TemplateResponse
from django.utils import timezone

from apps.cart.services.abandoned import recovery as abandoned_recovery
from apps.core.forms import JalaliDateField
from apps.core.jalali import to_jalali_str
from apps.core.money import format_number, format_toman, to_persian_digits

from .services import metrics, work_queue

REPORT_PERM = "backoffice.view_salesreport"
PERIODS = {"7": 7, "30": 30, "90": 90, "365": 365}


def bars(rows: list[dict], key: str) -> list[dict]:
    """Add a 0–100 ``height`` to each row for the CSS bar chart."""
    top = max((r[key] for r in rows), default=0) or 1
    return [{**r, "height": round(r[key] * 100 / top)} for r in rows]


def kpi(title, value, *, before=None, now_raw=None, suffix="", hint=""):
    change = metrics.change_percent(now_raw, before) if before is not None else None
    return {
        "title": title,
        "value": value,
        "suffix": suffix,
        "hint": hint,
        "change": change,
        "change_text": f"{to_persian_digits(abs(change))}٪" if change is not None else "",
    }


def rate_text(rate) -> str:
    return f"{to_persian_digits(rate)}٪" if rate is not None else "—"


def overview(window: metrics.Window) -> dict:
    now = metrics.sales_summary(window)
    prev = metrics.sales_summary(window.previous())
    bundle = metrics.bundle_adoption(window)
    repeat = metrics.repeat_purchase(window)
    recovery = metrics.notify_me_recovery(window)
    carts = abandoned_recovery(window.start, window.end)
    return {
        "kpis": [
            kpi("فروش", format_toman(now["revenue"]), before=prev["revenue"],
                now_raw=now["revenue"]),
            kpi("سفارش موفق", format_number(now["orders"]), before=prev["orders"],
                now_raw=now["orders"]),
            kpi("میانگین ارزش سفارش", format_toman(now["aov"]), before=prev["aov"],
                now_raw=now["aov"]),
            kpi("نسخه فروخته‌شده", format_number(now["units"]), before=prev["units"],
                now_raw=now["units"]),
        ],
        "goals": [
            kpi("پذیرش بسته چاپی + الکترونیک", rate_text(bundle["rate"]),
                hint=f"{format_number(bundle['bundle'])} بسته از "
                f"{format_number(bundle['bundle'] + bundle['print'])} نسخه چاپی"),
            kpi("خرید تکراری", rate_text(repeat["rate"]),
                hint=f"{format_number(repeat['repeat'])} از {format_number(repeat['customers'])} "
                "مشتری بیش از یک بار خریدند"),
            kpi("بازگشت «خبرم کن»", rate_text(recovery["rate"]),
                hint=f"{format_number(recovery['converted'])} خرید از "
                f"{format_number(recovery['notified'])} پیامک؛ "
                f"{format_number(recovery['waiting'])} در انتظار موجودی"),
            kpi("مشتری جدید", format_number(metrics.first_time_customers(window)),
                hint="اولین خرید در این بازه"),
            kpi("بازگشت سبد رهاشده", rate_text(metrics.percent(carts["recovered"],
                                                                 carts["reminded"])),
                hint=f"{format_number(carts['recovered'])} خرید از "
                f"{format_number(carts['reminded'])} پیامک یادآوری"),
        ],
        "formats": metrics.sales_by_format(window),
        "daily": bars(metrics.daily_revenue(window), "revenue"),
        "top_books": metrics.top_books(window, limit=10),
    }  # fmt: skip


def period_from(request, default="30") -> tuple[str, metrics.Window]:
    period = request.GET.get("period", default)
    if period not in PERIODS:
        period = default
    return period, metrics.window_for_days(PERIODS[period])


def dashboard_callback(request, context):
    """``UNFOLD["DASHBOARD_CALLBACK"]``: the admin home page."""
    user = request.user
    context["work_items"] = work_queue.work_items(user)
    context["upcoming_exams"] = [
        {
            "name": e.name,
            "date": to_jalali_str(e.date, persian_digits=True),
            "days_left": to_persian_digits((e.date - timezone.localdate()).days),
        }
        for e in work_queue.upcoming_exams()
    ]
    if user.has_perm(REPORT_PERM):
        period, window = period_from(request, default="7")
        context["period"] = period
        context["periods"] = [("7", "۷ روز"), ("30", "۳۰ روز"), ("90", "۹۰ روز")]
        context["can_report"] = True
        context.update(overview(window))
        today = metrics.sales_summary(metrics.window_for_days(1))
        context["today"] = {
            "revenue": format_toman(today["revenue"]),
            "orders": format_number(today["orders"]),
        }
    return context


class ReportForm(forms.Form):
    start = JalaliDateField(label="از تاریخ", required=False)
    end = JalaliDateField(label="تا تاریخ", required=False)

    def window(self) -> metrics.Window:
        today = timezone.localdate()
        data = self.cleaned_data if self.is_valid() else {}
        end = data.get("end") or today
        start = data.get("start") or end - dt.timedelta(days=29)
        if start > end:
            start, end = end, start
        return metrics.window_for_dates(start, end)


def sales_report_view(request):
    if not request.user.has_perm(REPORT_PERM):
        raise PermissionDenied
    form = ReportForm(request.GET or None)
    window = form.window()
    if request.GET.get("export") in ("orders", "books"):
        return export_csv(request.GET["export"], window)
    summary = metrics.sales_summary(window)
    last_day = (window.end - dt.timedelta(days=1)).date()
    context = {
        **admin.site.each_context(request),
        "title": "گزارش فروش",
        "form": form,
        "range_text": f"{to_jalali_str(window.start.date(), persian_digits=True)} تا "
        f"{to_jalali_str(last_day, persian_digits=True)}",
        "summary": {
            "revenue": format_toman(summary["revenue"]),
            "orders": format_number(summary["orders"]),
            "aov": format_toman(summary["aov"]),
            "units": format_number(summary["units"]),
            "customers": format_number(summary["customers"]),
            "discounts": format_toman(summary["discounts"]),
            "shipping": format_toman(summary["shipping"]),
        },
        "codes": metrics.discount_codes(window),
        "query": request.GET.urlencode(),
        **overview(window),
    }
    context["top_books"] = metrics.top_books(window, limit=50)
    return TemplateResponse(request, "backoffice/sales_report.html", context)


def export_csv(kind: str, window: metrics.Window) -> HttpResponse:
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    name = f"{kind}-{to_jalali_str(window.start.date()).replace('/', '')}.csv"
    response["Content-Disposition"] = f'attachment; filename="{name}"'
    response.write("﻿")  # BOM so Excel reads Persian text as UTF-8
    writer = csv.writer(response)
    if kind == "books":
        writer.writerow(["کتاب", "تعداد", "فروش (تومان)"])
        for row in metrics.top_books(window, limit=10_000):
            writer.writerow([row["title"], row["units"], row["revenue"]])
        return response
    writer.writerow(
        [
            "شماره",
            "تاریخ پرداخت",
            "موبایل",
            "وضعیت",
            "جمع اقلام",
            "تخفیف",
            "ارسال",
            "مبلغ",
            "کد تخفیف",
        ]
    )
    for o in metrics.sales_qs(window).select_related("user").order_by("paid_at"):
        writer.writerow(
            [
                o.number,
                to_jalali_str(timezone.localtime(o.paid_at)),
                o.user.phone,
                o.get_status_display(),
                o.items_total,
                o.discount_total,
                o.shipping_total,
                o.total,
                o.discount_code_text,
            ]
        )
    return response
