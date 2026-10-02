from django import forms
from django.contrib import admin
from django.template.defaultfilters import filesizeformat
from unfold.admin import ModelAdmin

from .models import EbookFile, Highlight, ReadingProgress
from .services.files import InvalidEbookFile, activate, prepare_upload


class EbookFileForm(forms.ModelForm):
    class Meta:
        model = EbookFile
        fields = ["book", "format", "file", "version", "pages", "is_active"]

    def _get_validation_exclusions(self):
        # Skip the one-active-file constraint here: save_model deactivates the previous file
        # first, so uploading a new active version must not be rejected.
        return {*super()._get_validation_exclusions(), "is_active"}

    def clean(self):
        cleaned = super().clean()
        upload = cleaned.get("file")
        if upload and "file" in self.changed_data:
            self.instance.format = cleaned.get("format") or EbookFile.Format.PDF
            try:
                prepare_upload(self.instance, upload)
            except InvalidEbookFile as exc:
                self.add_error("file", str(exc))
        return cleaned


@admin.register(EbookFile)
class EbookFileAdmin(ModelAdmin):
    form = EbookFileForm
    list_display = ("book", "format", "version", "pages", "human_size", "is_active", "updated_at")
    list_filter = ("format", "is_active")
    search_fields = ("book__title", "book__slug")
    autocomplete_fields = ("book",)
    readonly_fields = ("size", "sha256", "created_at", "updated_at")
    actions = ("make_active",)

    @admin.display(description="حجم")
    def human_size(self, obj):
        return filesizeformat(obj.size)

    def save_model(self, request, obj, form, change):
        if obj.is_active:
            # Deactivate the previous file first so the one-active-file constraint holds.
            EbookFile.objects.filter(book=obj.book, is_active=True).exclude(pk=obj.pk).update(
                is_active=False
            )
        super().save_model(request, obj, form, change)

    @admin.action(description="فعال‌کردن این فایل (غیرفعال‌شدن بقیه‌ی فایل‌های کتاب)")
    def make_active(self, request, queryset):
        for ebook in queryset.select_related("book"):
            activate(ebook)


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
