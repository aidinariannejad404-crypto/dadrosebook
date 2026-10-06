from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import (
    Bookmark,
    CopyLedger,
    EpubPackage,
    Highlight,
    OfflineLicense,
    ProblemReport,
    ReaderAccessLog,
    ReaderDevice,
    ReaderTraceCode,
    ReadingProgress,
    StatuteLink,
)
from .services.protection import normalize_code


class ReadOnlyAdmin(ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(ReadingProgress)
class ReadingProgressAdmin(ReadOnlyAdmin):
    list_display = ("user", "book", "page", "total_pages", "updated_at")
    search_fields = ("user__phone", "book__title")
    list_select_related = ("user", "book")


@admin.register(Highlight)
class HighlightAdmin(ReadOnlyAdmin):
    list_display = ("user", "book", "page", "color", "ebook_version", "anchor_status", "created_at")
    list_filter = ("color", "anchor_status")
    search_fields = ("user__phone", "book__title")
    list_select_related = ("user", "book")


@admin.register(EpubPackage)
class EpubPackageAdmin(ReadOnlyAdmin):
    list_display = (
        "ebook",
        "language",
        "direction",
        "chapter_count",
        "total_pages",
        "processed_at",
    )
    search_fields = ("ebook__book__title",)
    list_select_related = ("ebook__book",)
    exclude = ("toc",)
    actions = ("reprocess",)

    @admin.display(description="فصل‌ها")
    def chapter_count(self, obj):
        return obj.chapters.count()

    @admin.action(description="پردازش دوباره‌ی EPUB")
    def reprocess(self, request, queryset):
        from django.contrib import messages

        from .services.epub import InvalidEpub, process_epub

        for package in queryset.select_related("ebook"):
            try:
                process_epub(package.ebook)
            except InvalidEpub as exc:
                messages.error(request, f"{package.ebook}: {exc}")


@admin.register(Bookmark)
class BookmarkAdmin(ReadOnlyAdmin):
    list_display = ("user", "book", "page", "ebook_version", "anchor_status", "created_at")
    list_filter = ("anchor_status",)
    search_fields = ("user__phone", "book__title")
    list_select_related = ("user", "book")


@admin.register(ReaderDevice)
class ReaderDeviceAdmin(ModelAdmin):
    """Support can free a device slot for a customer (``revoked_at``)."""

    list_display = ("user", "label", "first_seen", "last_seen", "revoked_at")
    list_filter = ("revoked_at",)
    search_fields = ("user__phone",)
    list_select_related = ("user",)
    readonly_fields = ("user", "key", "label", "first_seen", "last_seen")
    actions = ("revoke",)

    def has_add_permission(self, request):
        return False

    @admin.action(description="حذف دستگاه (آزاد کردن ظرفیت)")
    def revoke(self, request, queryset):
        from django.utils import timezone

        queryset.filter(revoked_at__isnull=True).update(revoked_at=timezone.now())


@admin.register(ReaderAccessLog)
class ReaderAccessLogAdmin(ReadOnlyAdmin):
    list_display = ("created_at", "user", "book", "kind", "detail", "ip", "device")
    list_filter = ("kind",)
    search_fields = ("user__phone", "book__title", "ip")
    list_select_related = ("user", "book", "device")
    date_hierarchy = "created_at"


@admin.register(CopyLedger)
class CopyLedgerAdmin(ReadOnlyAdmin):
    list_display = ("user", "book", "used", "updated_at")
    search_fields = ("user__phone", "book__title")
    list_select_related = ("user", "book")
    actions = ("reset",)

    @admin.action(description="صفر کردن سهمیه کپی")
    def reset(self, request, queryset):
        queryset.update(used=0)


@admin.register(OfflineLicense)
class OfflineLicenseAdmin(ReadOnlyAdmin):
    list_display = ("user", "book", "device", "expires_at", "revoked_at", "created_at")
    list_filter = ("revoked_at",)
    search_fields = ("user__phone", "book__title")
    list_select_related = ("user", "book", "device")
    actions = ("revoke",)

    @admin.action(description="لغو مجوز آفلاین")
    def revoke(self, request, queryset):
        from django.utils import timezone

        queryset.filter(revoked_at__isnull=True).update(revoked_at=timezone.now())


# ---------- ه۶: statute article → commentary book ----------


@admin.register(StatuteLink)
class StatuteLinkAdmin(ModelAdmin):
    list_display = ("book", "chapter_index", "label", "anchor", "target_book", "order", "is_active")
    list_filter = ("is_active",)
    list_editable = ("order", "is_active")
    search_fields = ("book__title", "label", "target_book__title")
    autocomplete_fields = ("book", "target_book")
    list_select_related = ("book", "target_book")


# ---------- ه۸: problem reports from the reader ----------


@admin.register(ProblemReport)
class ProblemReportAdmin(ModelAdmin):
    list_display = (
        "created",
        "book",
        "kind",
        "page_or_location",
        "ebook_version",
        "device_label",
        "user",
        "status",
    )
    list_filter = ("status", "kind", "ebook_format")
    search_fields = ("book__title", "user__phone", "description")
    list_select_related = ("book", "user")
    date_hierarchy = "created_at"
    readonly_fields = (
        "user",
        "book",
        "ebook_version",
        "ebook_format",
        "kind",
        "description",
        "page",
        "location",
        "chapter_title",
        "device_label",
        "user_agent",
        "created_at",
        "resolved_at",
    )
    fields = (*readonly_fields[:-2], "status", "staff_note", "created_at", "resolved_at")
    actions = ("mark_in_progress", "mark_resolved", "mark_rejected")

    def has_add_permission(self, request):
        return False

    def save_model(self, request, obj, form, change):
        from django.utils import timezone

        if "status" in form.changed_data:
            obj.resolved_at = (
                timezone.now() if obj.status == ProblemReport.Status.RESOLVED else None
            )
        super().save_model(request, obj, form, change)

    @admin.display(description="زمان گزارش", ordering="created_at")
    def created(self, obj):
        from apps.core.jalali import to_jalali_str

        return to_jalali_str(obj.created_at, persian_digits=True) or "—"

    @admin.display(description="صفحه / فصل")
    def page_or_location(self, obj):
        from apps.core.money import to_persian_digits

        parts = []
        if obj.page:
            parts.append(f"ص {to_persian_digits(obj.page)}")
        if obj.chapter_title:
            parts.append(obj.chapter_title[:40])
        return " · ".join(parts) or "—"

    def _set(self, request, queryset, status):
        from apps.core.money import format_number

        from .services.problems import set_status

        count = set_status(queryset, status)
        self.message_user(request, f"وضعیت {format_number(count)} گزارش به‌روز شد.")

    @admin.action(description="در حال بررسی")
    def mark_in_progress(self, request, queryset):
        self._set(request, queryset, ProblemReport.Status.IN_PROGRESS)

    @admin.action(description="رسیدگی شد")
    def mark_resolved(self, request, queryset):
        self._set(request, queryset, ProblemReport.Status.RESOLVED)

    @admin.action(description="بدون نیاز به اقدام")
    def mark_rejected(self, request, queryset):
        self._set(request, queryset, ProblemReport.Status.REJECTED)


@admin.register(ReaderTraceCode)
class ReaderTraceCodeAdmin(ReadOnlyAdmin):
    """Look up who leaked a screenshot by the code seen on it (any case, dash optional)."""

    list_display = ("code", "user", "book", "created_at")
    search_fields = ("code", "user__phone", "book__title")
    search_help_text = "کد روی اسکرین‌شات را وارد کنید، مثلاً K7Q2-M9XD یا k7q2m9xd."
    list_select_related = ("user", "book")

    def get_search_results(self, request, queryset, search_term):
        code = normalize_code(search_term)
        if len(code) == 9:
            return queryset.filter(code=code), False
        return super().get_search_results(request, queryset, search_term)
