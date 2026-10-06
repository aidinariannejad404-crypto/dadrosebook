from django import forms
from django.contrib import admin
from django.utils import timezone
from unfold.admin import ModelAdmin

from apps.core.forms import JalaliDateField
from apps.core.jalali import to_jalali_str

from .models import ChangelogEntry, Notification, UserStudyProfile
from .services.notifications import INBOX_KINDS, kind_label


def _jalali(value):
    if value is None:
        return "—"
    local = timezone.localtime(value)
    return f"{to_jalali_str(local, persian_digits=True)} {local:%H:%M}"


class NotificationForm(forms.ModelForm):
    """Staff send inbox-only messages (announcements, a personal discount code)."""

    kind = forms.ChoiceField(
        label="نوع", choices=[(k, label) for k, (label, _) in INBOX_KINDS.items()]
    )

    class Meta:
        model = Notification
        fields = ("user", "kind", "title", "body", "link", "discount_code")


@admin.register(Notification)
class NotificationAdmin(ModelAdmin):
    form = NotificationForm
    list_display = ("title", "user", "kind_display", "is_read", "created_jalali")
    list_filter = ("kind", ("read_at", admin.EmptyFieldListFilter), "created_at")
    search_fields = ("user__phone", "title", "body", "discount_code")
    list_select_related = ("user",)
    autocomplete_fields = ("user",)
    date_hierarchy = "created_at"

    @admin.display(description="نوع")
    def kind_display(self, obj):
        return kind_label(obj.kind)

    @admin.display(description="خوانده شد", boolean=True)
    def is_read(self, obj):
        return obj.read_at is not None

    @admin.display(description="زمان", ordering="created_at")
    def created_jalali(self, obj):
        return _jalali(obj.created_at)

    def get_readonly_fields(self, request, obj=None):
        # sent messages are a record: only new ones are written here
        return ("user", "kind", "title", "body", "link", "discount_code") if obj else ()

    def get_form(self, request, obj=None, **kwargs):
        if obj is not None:
            kwargs["form"] = forms.ModelForm
        return super().get_form(request, obj, **kwargs)


@admin.register(UserStudyProfile)
class UserStudyProfileAdmin(ModelAdmin):
    list_display = ("user", "exam_type", "exam_year", "completed_at", "skipped_at")
    list_filter = ("exam_type", "exam_year")
    search_fields = ("user__phone",)
    list_select_related = ("user", "exam_type")
    autocomplete_fields = ("user",)
    filter_horizontal = ("weak_subjects",)


class ChangelogEntryForm(forms.ModelForm):
    published_at = JalaliDateField(label="تاریخ انتشار (شمسی)", help_text="مثلاً ۱۴۰۵/۰۷/۱۴")

    class Meta:
        model = ChangelogEntry
        fields = ("title", "body", "area", "link", "published_at", "is_published", "announce")


@admin.register(ChangelogEntry)
class ChangelogEntryAdmin(ModelAdmin):
    form = ChangelogEntryForm
    list_display = ("title", "area", "published_jalali", "is_published", "announce")
    list_filter = ("area", "is_published", "announce")
    search_fields = ("title", "body")
    list_editable = ("is_published", "announce")

    @admin.display(description="تاریخ انتشار", ordering="published_at")
    def published_jalali(self, obj):
        return to_jalali_str(obj.published_at, persian_digits=True)
