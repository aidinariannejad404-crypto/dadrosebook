from django import forms
from django.contrib import admin
from unfold.admin import ModelAdmin

from apps.library.models import EbookFile

from .models import Highlight, ReadingProgress
from .services.files import InvalidEbookFile, activate, validate_upload


class EbookFileForm(forms.ModelForm):
    class Meta:
        model = EbookFile
        fields = ["book", "format", "file", "version", "is_active"]
        help_texts = {
            "file": "در فضای خصوصی ذخیره می‌شود و فقط با لینک امضاشده‌ی کوتاه‌مدت خوانده می‌شود.",
            "is_active": "هر کتاب یک فایل فعال دارد؛ با ذخیره، فایل فعال قبلی غیرفعال می‌شود.",
        }

    def clean(self):
        cleaned = super().clean()
        upload = cleaned.get("file")
        if upload and "file" in self.changed_data:
            try:
                validate_upload(cleaned.get("format") or EbookFile.Format.PDF, upload)
            except InvalidEbookFile as exc:
                self.add_error("file", str(exc))
        return cleaned


class EbookFileAdmin(ModelAdmin):
    """Upload screen for ebook files (model owned by apps.library, workflow by the reader)."""

    form = EbookFileForm
    list_display = ("book", "format", "version", "is_active", "updated_at")
    list_filter = ("format", "is_active")
    search_fields = ("book__title", "book__slug")
    autocomplete_fields = ("book",)
    readonly_fields = ("created_at", "updated_at")
    actions = ("make_active",)

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if obj.is_active:
            activate(obj)

    @admin.action(description="فعال‌کردن این فایل (غیرفعال‌شدن بقیه‌ی فایل‌های کتاب)")
    def make_active(self, request, queryset):
        for ebook in queryset.select_related("book"):
            activate(ebook)


if not admin.site.is_registered(EbookFile):
    admin.site.register(EbookFile, EbookFileAdmin)


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
