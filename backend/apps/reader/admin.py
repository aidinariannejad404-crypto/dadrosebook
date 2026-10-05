from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import (
    Bookmark,
    CopyLedger,
    EpubPackage,
    Highlight,
    OfflineLicense,
    ReaderAccessLog,
    ReaderDevice,
    ReadingProgress,
)


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
    list_display = ("user", "book", "page", "color", "created_at")
    list_filter = ("color",)
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
    list_display = ("user", "book", "page", "created_at")
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
