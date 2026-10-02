from django import forms
from django.contrib import admin
from django.db.models import BooleanField, Case, Count, Prefetch, Value, When
from django.utils.html import format_html, format_html_join
from unfold.admin import ModelAdmin, TabularInline
from unfold.contrib.forms.widgets import WysiwygWidget
from unfold.decorators import display

from apps.core.forms import JalaliDateField
from apps.core.jalali import to_jalali_str
from apps.core.money import format_toman, to_persian_digits

from .models import (
    Book,
    BookSamplePage,
    BookVariant,
    Category,
    ExamEvent,
    ExamType,
    Person,
    Publisher,
    RelatedCourse,
    StudyKitItem,
    StudyKitRecommendation,
    Subject,
)
from .services.books import active_variants_qs
from .services.completeness import (
    annotate_completeness,
    complete_q,
    completeness_percent,
    missing_labels,
)
from .services.editions import current_exam_year
from .services.pricing import book_min_price
from .services.search import search_books


@admin.register(ExamType)
class ExamTypeAdmin(ModelAdmin):
    list_display = ("name", "short_name", "slug", "order", "is_active")
    list_editable = ("order", "is_active")
    search_fields = ("name", "short_name")


@admin.register(Subject)
class SubjectAdmin(ModelAdmin):
    list_display = ("name", "color_swatch", "slug", "order", "is_active")
    list_editable = ("order", "is_active")
    search_fields = ("name",)

    @admin.display(description="رنگ")
    def color_swatch(self, obj):
        return format_html(
            '<span style="display:inline-flex;align-items:center;gap:.5rem">'
            '<span style="width:1.25rem;height:1.25rem;border-radius:.375rem;'
            'background:{};display:inline-block;border:1px solid rgba(0,0,0,.1)"></span>'
            '<code dir="ltr">{}</code></span>',
            obj.color,
            obj.color,
        )


@admin.register(Category)
class CategoryAdmin(ModelAdmin):
    list_display = ("__str__", "slug", "parent", "order", "is_active")
    list_filter = ("parent", "is_active")
    list_editable = ("order", "is_active")
    search_fields = ("name",)
    autocomplete_fields = ("parent",)
    list_select_related = ("parent",)


@admin.register(Person)
class PersonAdmin(ModelAdmin):
    list_display = ("name", "slug")
    search_fields = ("name",)


@admin.register(Publisher)
class PublisherAdmin(ModelAdmin):
    list_display = ("name", "slug", "website")
    search_fields = ("name",)


@admin.register(RelatedCourse)
class RelatedCourseAdmin(ModelAdmin):
    list_display = ("title", "price_toman", "url", "order", "is_active")
    list_editable = ("order", "is_active")
    search_fields = ("title",)

    @admin.display(description="قیمت", ordering="price")
    def price_toman(self, obj):
        return format_toman(obj.price)


class BookVariantInline(TabularInline):
    model = BookVariant
    extra = 0
    max_num = 3
    fields = (
        "type",
        "price",
        "sale_price",
        "stock",
        "is_active",
        "price_is_placeholder",
        "price_note",
    )


class BookSamplePageInline(TabularInline):
    model = BookSamplePage
    extra = 0
    fields = ("image", "order")


class CompletenessFilter(admin.SimpleListFilter):
    title = "کامل‌بودن"
    parameter_name = "complete"

    def lookups(self, request, model_admin):
        return (("no", "ناقص"), ("yes", "کامل"))

    def queryset(self, request, queryset):
        if self.value() == "yes":
            return queryset.filter(complete_q())
        if self.value() == "no":
            return queryset.exclude(complete_q())
        return queryset


@admin.register(Book)
class BookAdmin(ModelAdmin):
    inlines = (BookVariantInline, BookSamplePageInline)
    list_display = (
        "cover_thumb",
        "title",
        "subjects_list",
        "resource_type",
        "min_price_toman",
        "stock_status",
        "completeness",
        "current_edition",
        "sales_count",
        "is_featured",
        "is_quick_review",
        "is_active",
    )
    list_display_links = ("cover_thumb", "title")
    list_filter = (
        CompletenessFilter,
        "resource_type",
        "subjects",
        "exam_types",
        "categories",
        "is_featured",
        "is_quick_review",
        "is_active",
    )
    search_fields = ("title", "search_text")
    autocomplete_fields = (
        "authors",
        "translators",
        "publisher",
        "subjects",
        "exam_types",
        "categories",
        "related_courses",
    )
    readonly_fields = ("is_quick_review", "created_at", "updated_at")
    list_per_page = 50
    fieldsets = (
        (
            "اطلاعات اصلی",
            {"fields": ("title", "subtitle", "slug", "authors", "translators", "publisher")},
        ),
        (
            "طبقه‌بندی",
            {"fields": ("resource_type", "subjects", "exam_types", "categories")},
        ),
        (
            "مشخصات",
            {
                "fields": (
                    "edition",
                    "publish_year",
                    "law_updated_until",
                    "volumes",
                    "pages",
                    "isbn",
                )
            },
        ),
        (
            "محتوا",
            {"fields": ("description", "table_of_contents", "study_plan_note", "study_days")},
        ),
        ("رسانه", {"fields": ("cover", "cover_source_url", "sample_pdf", "intro_video_url")}),
        (
            "فروش و نمایش",
            {
                "fields": (
                    "related_courses",
                    "is_featured",
                    "is_quick_review",
                    "sales_count",
                    "season_sales_count",
                    "is_active",
                    "legacy_path",
                )
            },
        ),
        ("زمان‌ها", {"fields": ("created_at", "updated_at"), "classes": ("collapse",)}),
    )

    def formfield_for_dbfield(self, db_field, request, **kwargs):
        if db_field.name == "description":
            kwargs["widget"] = WysiwygWidget
        return super().formfield_for_dbfield(db_field, request, **kwargs)

    def get_search_results(self, request, queryset, search_term):
        """Normalised Persian search (ي/ی، ك/ک، ZWNJ، digits) via the catalog search service."""
        if not search_term:
            return queryset, False
        return search_books(queryset, search_term), False

    def get_queryset(self, request):
        year = current_exam_year()
        return annotate_completeness(
            super()
            .get_queryset(request)
            .prefetch_related(
                "subjects",
                Prefetch("variants", queryset=active_variants_qs(), to_attr="active_variants"),
            )
        ).annotate(
            is_current_edition=Case(
                When(publish_year__gte=year, then=Value(True)),
                default=Value(False),
                output_field=BooleanField(),
            )
        )

    @display(description="کامل‌بودن")
    def completeness(self, obj):
        percent = completeness_percent(obj)
        missing = "، ".join(missing_labels(obj)) or "کامل"
        colour = "#15803d" if percent == 100 else "#b45309" if percent >= 50 else "#b91c1c"
        return format_html(
            '<span title="کم دارد: {}" style="color:{};font-weight:600">{}٪</span>',
            missing,
            colour,
            to_persian_digits(percent),
        )

    @display(description="ویرایش جاری؟", boolean=True, ordering="is_current_edition")
    def current_edition(self, obj):
        return obj.is_current_edition

    @display(description="جلد")
    def cover_thumb(self, obj):
        if obj.cover:
            return format_html(
                '<img src="{}" alt="" style="width:40px;height:56px;object-fit:cover;'
                'border-radius:4px">',
                obj.cover.url,
            )
        color = next((s.color for s in obj.subjects.all()), "#12264A")
        return format_html(
            '<span style="display:inline-block;width:40px;height:56px;border-radius:4px;'
            'background:{}"></span>',
            color,
        )

    @admin.display(description="درس‌ها")
    def subjects_list(self, obj):
        return format_html_join(
            "، ",
            '<span style="color:{}">{}</span>',
            ((s.color, s.name) for s in obj.subjects.all()),
        )

    @admin.display(description="کمترین قیمت")
    def min_price_toman(self, obj):
        price = book_min_price(obj.active_variants)
        return format_toman(price) if price is not None else "—"

    @display(
        description="موجودی",
        label={"موجود": "success", "ناموجود": "danger", "بدون نسخه": "warning"},
    )
    def stock_status(self, obj):
        variants = obj.active_variants
        if not variants:
            return "بدون نسخه"
        return "موجود" if any(v.in_stock for v in variants) else "ناموجود"


@admin.register(BookVariant)
class BookVariantAdmin(ModelAdmin):
    list_display = (
        "book",
        "type",
        "price_toman",
        "sale_price_toman",
        "stock",
        "price_is_placeholder",
        "is_active",
    )
    list_filter = ("type", "price_is_placeholder", "is_active")
    list_editable = ("stock", "is_active")
    search_fields = ("book__title",)
    autocomplete_fields = ("book",)
    list_select_related = ("book",)

    @admin.display(description="قیمت", ordering="price")
    def price_toman(self, obj):
        return format_toman(obj.price)

    @admin.display(description="قیمت با تخفیف", ordering="sale_price")
    def sale_price_toman(self, obj):
        return format_toman(obj.sale_price) or "—"


class ExamEventForm(forms.ModelForm):
    date = JalaliDateField(label="تاریخ برگزاری (شمسی)", help_text="مثلاً ۱۴۰۵/۰۸/۱۴")

    class Meta:
        model = ExamEvent
        fields = ("name", "exam_type", "date", "is_active")


@admin.register(ExamEvent)
class ExamEventAdmin(ModelAdmin):
    form = ExamEventForm
    list_display = ("name", "exam_type", "jalali_date", "is_active")
    list_filter = ("exam_type", "is_active")
    list_select_related = ("exam_type",)
    ordering = ("date",)

    @admin.display(description="تاریخ (شمسی)", ordering="date")
    def jalali_date(self, obj):
        return to_jalali_str(obj.date, persian_digits=True)


class StudyKitItemInline(TabularInline):
    model = StudyKitItem
    extra = 0
    fields = ("order", "book", "is_essential")
    autocomplete_fields = ("book",)
    ordering = ("order", "id")


@admin.register(StudyKitRecommendation)
class StudyKitRecommendationAdmin(ModelAdmin):
    inlines = (StudyKitItemInline,)
    list_display = ("exam_type", "subject", "weight", "items_count", "is_active")
    list_editable = ("weight",)
    list_filter = ("exam_type", "subject", "is_active")
    list_select_related = ("exam_type", "subject")

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(num_items=Count("items"))

    @admin.display(description="تعداد کتاب", ordering="num_items")
    def items_count(self, obj):
        return obj.num_items
