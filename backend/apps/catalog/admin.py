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
    BookCourse,
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
    SubjectCourseDiscount,
)
from .services.books import active_variants_qs
from .services.completeness import (
    annotate_completeness,
    complete_q,
    completeness_percent,
    missing_labels,
)
from .services.course_links import suggest_course_links
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
    list_display = (
        "title",
        "course_type",
        "subject",
        "teachers_list",
        "price_toman",
        "hours_display",
        "students_count",
        "status",
        "is_active",
    )
    list_filter = ("course_type", "subject", "status", "exam_types", "is_free", "is_active")
    list_editable = ("is_active",)
    list_select_related = ("subject",)
    search_fields = ("title", "url", "teachers")
    autocomplete_fields = ("subject", "exam_types")
    readonly_fields = ("created_at", "updated_at")
    fieldsets = (
        (
            "اطلاعات اصلی",
            {"fields": ("title", "url", "course_type", "subject", "exam_types", "teachers")},
        ),
        (
            "قیمت و حجم",
            {
                "fields": (
                    "price",
                    "sale_price",
                    "is_free",
                    "hours",
                    "sessions",
                    "students_count",
                    "rating",
                    "reviews_count",
                )
            },
        ),
        (
            "محتوا",
            {
                "fields": (
                    "short_description",
                    "selling_points",
                    "intro_video_url",
                    "image",
                    "image_source_url",
                )
            },
        ),
        (
            "وضعیت",
            {
                "fields": (
                    "status",
                    "is_module",
                    "is_active",
                    "order",
                    "source_url",
                    "checked_on",
                    "notes",
                )
            },
        ),
        ("زمان‌ها", {"fields": ("created_at", "updated_at"), "classes": ("collapse",)}),
    )

    @admin.display(description="قیمت", ordering="price")
    def price_toman(self, obj):
        if obj.is_free:
            return "رایگان"
        return format_toman(obj.price) if obj.price is not None else "—"

    @admin.display(description="ساعت", ordering="hours")
    def hours_display(self, obj):
        if obj.hours is None:
            return "—"
        return to_persian_digits(f"{obj.hours.normalize():f}")

    @admin.display(description="مدرس")
    def teachers_list(self, obj):
        return "، ".join(obj.teachers or []) or "—"


class SubjectCourseDiscountForm(forms.ModelForm):
    expires_on = JalaliDateField(
        label="تاریخ انقضا (شمسی)",
        required=False,
        help_text="مثلاً ۱۴۰۵/۰۸/۰۷. خالی یعنی تا تاریخ آزمون بعدی.",
    )

    class Meta:
        model = SubjectCourseDiscount
        fields = ("subject", "code", "percent", "label", "expires_on", "is_active")


@admin.register(SubjectCourseDiscount)
class SubjectCourseDiscountAdmin(ModelAdmin):
    form = SubjectCourseDiscountForm
    list_display = ("code", "subject", "percent", "jalali_expires_on", "is_active")
    list_filter = ("subject", "is_active")
    list_editable = ("is_active",)
    list_select_related = ("subject",)
    search_fields = ("code", "label")

    @admin.display(description="انقضا", ordering="expires_on")
    def jalali_expires_on(self, obj):
        if obj.expires_on is None:
            return "تا آزمون بعدی"
        return to_jalali_str(obj.expires_on, persian_digits=True)


class BookCourseInline(TabularInline):
    model = BookCourse
    extra = 0
    fields = ("order", "course", "relevance", "reason")
    autocomplete_fields = ("course",)
    ordering = ("order", "id")
    verbose_name = "دوره مرتبط"
    verbose_name_plural = "دوره‌های مرتبط (فقط دوره‌های قابل خرید نمایش داده می‌شوند)"


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
    inlines = (BookVariantInline, BookSamplePageInline, BookCourseInline)
    actions = ("suggest_courses",)
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

    @admin.action(description="پیشنهاد خودکار دوره‌ها")
    def suggest_courses(self, request, queryset):
        result = suggest_course_links(queryset)
        self.message_user(
            request,
            f"برای {to_persian_digits(result['books'])} کتاب بدون دوره، "
            f"{to_persian_digits(result['links'])} پیوند «دوره همین درس» ساخته شد. "
            "کتاب‌هایی که از قبل دوره داشتند تغییری نکردند.",
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


class LowStockFilter(admin.SimpleListFilter):
    title = "موجودی کم"
    parameter_name = "low_stock"

    def lookups(self, request, model_admin):
        return (("1", "در حد هشدار یا کمتر"), ("0", "ناموجود"))

    def queryset(self, request, queryset):
        from apps.core.services.store_settings import get_store_settings

        physical = queryset.exclude(type=BookVariant.Type.EBOOK)
        if self.value() == "1":
            return physical.filter(stock__lte=get_store_settings().low_stock_threshold)
        if self.value() == "0":
            return physical.filter(stock=0)
        return queryset


@admin.register(BookVariant)
class BookVariantAdmin(ModelAdmin):
    list_display = (
        "book",
        "type",
        "price",
        "sale_price",
        "effective_price_toman",
        "stock",
        "price_is_placeholder",
        "is_active",
    )
    list_filter = (LowStockFilter, "type", "price_is_placeholder", "is_active")
    list_editable = ("price", "sale_price", "stock", "is_active")
    search_fields = ("book__title",)
    autocomplete_fields = ("book",)
    list_select_related = ("book",)
    actions = ("confirm_prices", "clear_sale_prices")

    @admin.display(description="قیمت نهایی")
    def effective_price_toman(self, obj):
        return format_toman(obj.effective_price)

    @admin.action(description="تأیید قیمت (برداشتن «قیمت موقت»)")
    def confirm_prices(self, request, queryset):
        n = queryset.update(price_is_placeholder=False)
        self.message_user(request, f"قیمت {to_persian_digits(n)} نسخه تأیید شد.")

    @admin.action(description="حذف قیمت تخفیف")
    def clear_sale_prices(self, request, queryset):
        n = queryset.exclude(sale_price=None).update(sale_price=None)
        self.message_user(request, f"تخفیف {to_persian_digits(n)} نسخه برداشته شد.")


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
