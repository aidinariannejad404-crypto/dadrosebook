from urllib.parse import quote

from django import forms
from django.conf import settings
from django.contrib import admin
from django.db.models import Count
from django.utils.html import format_html
from unfold.admin import ModelAdmin, TabularInline
from unfold.contrib.forms.widgets import WysiwygWidget

from apps.core.forms import JalaliDateField
from apps.core.jalali import to_jalali_str
from apps.core.money import to_persian_digits

from .models import Banner, CuratedList, CuratedListItem, Guide, GuideVideo


@admin.register(Banner)
class BannerAdmin(ModelAdmin):
    list_display = ("title", "placement", "link_url", "order", "is_active")
    list_filter = ("placement", "is_active")
    list_editable = ("order", "is_active")
    search_fields = ("title", "subtitle")


@admin.register(GuideVideo)
class GuideVideoAdmin(ModelAdmin):
    list_display = ("title", "subject", "exam_type", "order", "is_active")
    list_filter = ("subject", "exam_type", "is_active")
    list_editable = ("order", "is_active")
    search_fields = ("title",)
    autocomplete_fields = ("subject", "exam_type")


# --- hubs & guides (package ب, impl/hubs) ---------------------------------------------------------


def storefront_url(path: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}{path}"


class GuideForm(forms.ModelForm):
    updated_on = JalaliDateField(
        label="تاریخ به‌روزرسانی محتوا (شمسی)",
        required=False,
        help_text="مثلاً ۱۴۰۵/۰۷/۱۴؛ آخرین بازبینی محتوایی.",
    )

    class Meta:
        model = Guide
        fields = (
            "title",
            "slug",
            "status",
            "summary",
            "intro",
            "body",
            "author",
            "reviewer",
            "updated_on",
            "exam_types",
            "subjects",
            "books",
        )


@admin.register(Guide)
class GuideAdmin(ModelAdmin):
    form = GuideForm
    list_display = ("title", "status", "author", "reviewer", "updated_on_jalali", "site_link")
    list_filter = ("status", "exam_types", "subjects")
    search_fields = ("title", "summary")
    autocomplete_fields = ("author", "reviewer", "exam_types", "subjects", "books")
    readonly_fields = ("site_link", "published_at", "created_at", "updated_at")
    fieldsets = (
        (None, {"fields": ("title", "slug", "status", "site_link", "summary")}),
        ("متن", {"fields": ("intro", "body")}),
        (
            "نویسنده و بازبین",
            {
                "fields": ("author", "reviewer", "updated_on"),
                "description": "روی سایت به شکل «نوشته … · بازبینی …» نمایش داده می‌شود؛ "
                "برای هر دو نفر سمت و زندگی‌نامه را در «نویسندگان و مترجمان» کامل کنید.",
            },
        ),
        ("ارتباط‌ها", {"fields": ("exam_types", "subjects", "books")}),
        (
            "زمان‌ها",
            {"fields": ("published_at", "created_at", "updated_at"), "classes": ("collapse",)},
        ),
    )

    def formfield_for_dbfield(self, db_field, request, **kwargs):
        if db_field.name in ("intro", "body"):
            kwargs["widget"] = WysiwygWidget
        return super().formfield_for_dbfield(db_field, request, **kwargs)

    @admin.display(description="به‌روزرسانی", ordering="updated_on")
    def updated_on_jalali(self, obj):
        return to_jalali_str(obj.updated_on, persian_digits=True) if obj.updated_on else "—"

    @admin.display(description="نمایش در سایت")
    def site_link(self, obj):
        if not obj.pk:
            return "پس از ذخیره ساخته می‌شود."
        path = f"/guide/{quote(obj.slug)}"
        if obj.is_published:
            return format_html(
                '<a href="{}" target="_blank" rel="noopener">مشاهده</a>', storefront_url(path)
            )
        return format_html(
            '<a href="{}" target="_blank" rel="noopener">پیش‌نمایش پیش‌نویس</a>',
            storefront_url(f"{path}?preview={obj.preview_key}"),
        )


class CuratedListItemInline(TabularInline):
    model = CuratedListItem
    extra = 1
    fields = ("order", "book", "note")
    autocomplete_fields = ("book",)


class CuratedListForm(forms.ModelForm):
    ends_on = JalaliDateField(
        label="تاریخ پایان (شمسی)",
        required=False,
        help_text="خالی یعنی همیشگی. پس از این تاریخ فهرست «پایان‌یافته» و noindex می‌شود.",
    )

    class Meta:
        model = CuratedList
        fields = ("title", "slug", "intro", "ends_on", "is_active", "order")


@admin.register(CuratedList)
class CuratedListAdmin(ModelAdmin):
    form = CuratedListForm
    list_display = ("title", "item_count", "ends_on_jalali", "order", "is_active", "site_link")
    list_editable = ("order", "is_active")
    list_filter = ("is_active",)
    search_fields = ("title",)
    readonly_fields = ("site_link",)
    fields = ("title", "slug", "site_link", "intro", "ends_on", "is_active", "order")
    inlines = [CuratedListItemInline]

    def formfield_for_dbfield(self, db_field, request, **kwargs):
        if db_field.name == "intro":
            kwargs["widget"] = WysiwygWidget
        return super().formfield_for_dbfield(db_field, request, **kwargs)

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(n_items=Count("items"))

    @admin.display(description="تعداد کتاب", ordering="n_items")
    def item_count(self, obj):
        return to_persian_digits(getattr(obj, "n_items", obj.items.count()))

    @admin.display(description="پایان", ordering="ends_on")
    def ends_on_jalali(self, obj):
        return to_jalali_str(obj.ends_on, persian_digits=True) if obj.ends_on else "همیشگی"

    @admin.display(description="نمایش در سایت")
    def site_link(self, obj):
        if not obj.pk:
            return "پس از ذخیره ساخته می‌شود."
        return format_html(
            '<a href="{}" target="_blank" rel="noopener">مشاهده</a>',
            storefront_url(f"/list/{quote(obj.slug)}"),
        )
