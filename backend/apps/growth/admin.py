import datetime as dt

from django import forms
from django.contrib import admin
from django.utils import timezone
from django.utils.html import format_html
from unfold.admin import ModelAdmin, TabularInline

from apps.core.money import format_toman, to_persian_digits
from apps.orders.admin import jalali_dt

from .models import Campaign, Gift, KitShare, Partner, PartnerCode
from .services import campaigns as campaign_service
from .services import gifts as gift_service
from .services.partners import partner_report

# --- و۵ partners --------------------------------------------------------------------------------


class PartnerCodeInline(TabularInline):
    model = PartnerCode
    extra = 1
    autocomplete_fields = ("discount_code",)
    verbose_name = "کد تخفیف همکار"
    verbose_name_plural = "کدهای تخفیف این همکار"


class ReportPeriodFilter(admin.SimpleListFilter):
    """Window of the report columns (on ``paid_at``); the partner list itself is not filtered."""

    title = "بازه گزارش"
    parameter_name = "period"

    def lookups(self, request, model_admin):
        return (("30", "۳۰ روز اخیر"), ("90", "۹۰ روز اخیر"), ("365", "یک سال اخیر"))

    def queryset(self, request, queryset):
        return queryset


@admin.register(Partner)
class PartnerAdmin(ModelAdmin):
    list_display = (
        "name",
        "kind",
        "codes_list",
        "orders_count",
        "customers_count",
        "revenue_toman",
        "net_revenue_toman",
        "discount_toman",
        "is_active",
    )
    list_filter = (ReportPeriodFilter, "kind", "is_active")
    search_fields = ("name", "contact_name", "codes__discount_code__code")
    inlines = [PartnerCodeInline]

    def changelist_view(self, request, extra_context=None):
        days = request.GET.get("period")
        start = None
        if days and days.isdigit():
            start = timezone.now() - dt.timedelta(days=int(days))
        self._report = {row["partner"].pk: row for row in partner_report(start=start)}
        return super().changelist_view(request, extra_context)

    def _row(self, obj) -> dict:
        report = getattr(self, "_report", None)
        if report is None:
            report = self._report = {row["partner"].pk: row for row in partner_report()}
        return report.get(obj.pk) or {}

    @admin.display(description="کدها")
    def codes_list(self, obj):
        return "، ".join(self._row(obj).get("codes") or []) or "—"

    @admin.display(description="سفارش پرداخت‌شده")
    def orders_count(self, obj):
        return to_persian_digits(self._row(obj).get("orders", 0))

    @admin.display(description="مشتری")
    def customers_count(self, obj):
        return to_persian_digits(self._row(obj).get("customers", 0))

    @admin.display(description="فروش")
    def revenue_toman(self, obj):
        return format_toman(self._row(obj).get("revenue", 0))

    @admin.display(description="فروش خالص (پس از استرداد)")
    def net_revenue_toman(self, obj):
        return format_toman(self._row(obj).get("net_revenue", 0))

    @admin.display(description="تخفیف داده‌شده")
    def discount_toman(self, obj):
        return format_toman(self._row(obj).get("discount", 0))


# --- و۶ campaigns -------------------------------------------------------------------------------


class CampaignForm(forms.ModelForm):
    class Meta:
        model = Campaign
        fields = (
            "title",
            "slug",
            "subtitle",
            "description",
            "hero_image",
            "hero_color",
            "starts_at",
            "ends_at",
            "exam_event",
            "books",
            "subjects",
            "discount_code",
            "show_on_home",
            "is_active",
        )

    def clean(self):
        cleaned = super().clean()
        start, end = cleaned.get("starts_at"), cleaned.get("ends_at")
        if start and end and end <= start:
            self.add_error("ends_at", "پایان کمپین باید بعد از شروع آن باشد.")
        color = cleaned.get("hero_color") or ""
        if color and not (len(color) == 7 and color.startswith("#")):
            self.add_error("hero_color", "رنگ را به شکل #RRGGBB وارد کنید.")
        return cleaned


@admin.register(Campaign)
class CampaignAdmin(ModelAdmin):
    form = CampaignForm
    list_display = (
        "title",
        "state_label",
        "starts_jalali",
        "ends_jalali",
        "discount_code",
        "show_on_home",
        "is_active",
        "landing_link",
    )
    list_filter = ("is_active", "show_on_home")
    search_fields = ("title", "slug")
    prepopulated_fields = {"slug": ("title",)}
    autocomplete_fields = ("discount_code", "books")
    filter_horizontal = ("subjects",)
    list_select_related = ("discount_code",)
    fieldsets = (
        (
            None,
            {"fields": ("title", "slug", "subtitle", "description", "hero_image", "hero_color")},
        ),
        ("زمان", {"fields": ("starts_at", "ends_at", "exam_event")}),
        ("کتاب‌ها و تخفیف", {"fields": ("books", "subjects", "discount_code")}),
        ("نمایش", {"fields": ("show_on_home", "is_active")}),
    )

    @admin.display(description="وضعیت")
    def state_label(self, obj):
        return {
            campaign_service.UPCOMING: "به‌زودی",
            campaign_service.ACTIVE: "در حال اجرا",
            campaign_service.ENDED: "پایان‌یافته",
        }[campaign_service.campaign_state(obj)]

    @admin.display(description="شروع", ordering="starts_at")
    def starts_jalali(self, obj):
        return jalali_dt(obj.starts_at)

    @admin.display(description="پایان", ordering="ends_at")
    def ends_jalali(self, obj):
        return jalali_dt(obj.ends_at)

    @admin.display(description="صفحه")
    def landing_link(self, obj):
        from django.conf import settings

        url = f"{settings.SITE_URL.rstrip('/')}/campaign/{obj.slug}"
        return format_html('<a href="{}" target="_blank" rel="noopener">مشاهده</a>', url)


# --- و۴ gifts -----------------------------------------------------------------------------------


@admin.register(Gift)
class GiftAdmin(ModelAdmin):
    list_display = (
        "order",
        "sender_name",
        "recipient_name",
        "state_label",
        "expires_jalali",
        "claimed_by",
    )
    list_filter = ("status",)
    search_fields = ("order__number", "token", "claimed_by__phone", "sender_name")
    list_select_related = ("order", "claimed_by")
    readonly_fields = (
        "order",
        "token",
        "status",
        "activated_at",
        "expires_at",
        "claimed_by",
        "claimed_at",
        "shipping_address",
        "created_at",
    )
    fields = (
        "order",
        "token",
        "sender_name",
        "recipient_name",
        "message",
        "status",
        "activated_at",
        "expires_at",
        "claimed_by",
        "claimed_at",
        "shipping_address",
        "created_at",
    )

    def has_add_permission(self, request):
        return False

    @admin.display(description="وضعیت")
    def state_label(self, obj):
        return {
            gift_service.PENDING: "در انتظار پرداخت",
            gift_service.ACTIVE: "آماده دریافت",
            gift_service.CLAIMED: "دریافت‌شده",
            gift_service.EXPIRED: "منقضی",
            gift_service.CANCELLED: "لغوشده",
        }[gift_service.state(obj)]

    @admin.display(description="مهلت دریافت", ordering="expires_at")
    def expires_jalali(self, obj):
        return jalali_dt(obj.expires_at)


# --- و۳ kit shares ------------------------------------------------------------------------------


@admin.register(KitShare)
class KitShareAdmin(ModelAdmin):
    list_display = ("token", "exam_type", "books_count", "views", "created_jalali")
    readonly_fields = ("token", "exam_type", "variant_ids", "views", "created_at")
    search_fields = ("token",)

    def has_add_permission(self, request):
        return False

    @admin.display(description="تعداد کتاب")
    def books_count(self, obj):
        return to_persian_digits(len(obj.variant_ids or []))

    @admin.display(description="زمان", ordering="created_at")
    def created_jalali(self, obj):
        return jalali_dt(obj.created_at)
