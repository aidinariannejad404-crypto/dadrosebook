import csv

from django.contrib import admin
from django.http import HttpResponse
from django.utils import timezone
from unfold.admin import ModelAdmin

from apps.accounts.phone import normalize_phone
from apps.core.jalali import to_jalali_str

from .models import Lead

CSV_HEADER = [
    "تاریخ (شمسی)",
    "موبایل",
    "منبع",
    "آزمون",
    "درس‌ها",
    "کتاب‌ها",
    "ساعت در روز",
    "رضایت",
    "توکن",
]


@admin.register(Lead)
class LeadAdmin(ModelAdmin):
    list_display = (
        "phone",
        "source",
        "exam_type",
        "subjects_list",
        "hours_per_day",
        "consent",
        "jalali_created_at",
    )
    list_filter = ("source", "exam_type", "consent", "subjects", "created_at")
    search_fields = ("phone",)
    list_select_related = ("exam_type",)
    readonly_fields = (
        "phone",
        "source",
        "exam_type",
        "subjects",
        "books",
        "hours_per_day",
        "consent",
        "token",
        "ip_hash",
        "user_agent",
        "created_at",
    )
    exclude = ("plan",)
    actions = ("export_csv",)
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related("subjects", "books")

    def get_search_results(self, request, queryset, search_term):
        """Phone search accepts Persian digits, spaces and +98."""
        digits = normalize_phone(search_term)
        if not digits:
            return queryset, False
        return queryset.filter(phone__contains=digits), False

    @admin.display(description="درس‌ها")
    def subjects_list(self, obj):
        return "، ".join(s.name for s in obj.subjects.all()) or "—"

    @admin.display(description="تاریخ", ordering="created_at")
    def jalali_created_at(self, obj):
        local = timezone.localtime(obj.created_at)
        return f"{to_jalali_str(local, persian_digits=True)} {local:%H:%M}"

    @admin.action(description="خروجی CSV")
    def export_csv(self, request, queryset):
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="leads.csv"'
        response.write("﻿")  # BOM so Excel reads Persian text
        writer = csv.writer(response)
        writer.writerow(CSV_HEADER)
        rows = queryset.select_related("exam_type").prefetch_related("subjects", "books")
        for lead in rows.order_by("-created_at"):
            local = timezone.localtime(lead.created_at)
            writer.writerow(
                [
                    f"{to_jalali_str(local)} {local:%H:%M}",
                    lead.phone,
                    lead.get_source_display(),
                    lead.exam_type.name if lead.exam_type else "",
                    "، ".join(s.name for s in lead.subjects.all()),
                    "، ".join(b.title for b in lead.books.all()),
                    lead.hours_per_day,
                    "بله" if lead.consent else "خیر",
                    str(lead.token),
                ]
            )
        return response
