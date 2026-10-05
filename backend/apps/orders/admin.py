import csv
import datetime as dt

import jdatetime
from django import forms
from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.http import HttpResponse
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils import timezone
from django.utils.html import format_html
from unfold.admin import ModelAdmin, TabularInline
from unfold.widgets import UnfoldAdminCheckboxSelectMultipleWidget

from apps.catalog.models import BookVariant
from apps.core.money import format_toman, to_persian_digits

from .models import (
    Address,
    DiscountCode,
    DiscountRedemption,
    Order,
    OrderItem,
    OrderStatusLog,
    ShippingMethod,
)
from .services import state
from .services.discounts import label_for


def jalali_dt(value) -> str:
    if value is None:
        return "—"
    local = timezone.localtime(value)
    text = jdatetime.datetime.fromgregorian(datetime=local).strftime("%Y/%m/%d %H:%M")
    return to_persian_digits(text)


class ReadOnlyInline(TabularInline):
    extra = 0
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


class OrderItemInline(ReadOnlyInline):
    model = OrderItem
    fields = ("title", "variant_type", "quantity", "list_price", "unit_price", "line_total")
    readonly_fields = fields


class OrderStatusLogInline(ReadOnlyInline):
    model = OrderStatusLog
    fields = ("from_status", "to_status", "note", "actor", "created_jalali")
    readonly_fields = fields

    @admin.display(description="زمان")
    def created_jalali(self, obj):
        return jalali_dt(obj.created_at)


class FollowupFilter(admin.SimpleListFilter):
    """The dashboard's work queue links here."""

    title = "پیگیری"
    parameter_name = "followup"

    def lookups(self, request, model_admin):
        return (
            ("prepare", "پرداخت‌شده، منتظر آماده‌سازی"),
            ("ship", "آماده‌شده، منتظر ارسال"),
            ("overdue", "مرسوله دیرکرد دارد"),
        )

    def queryset(self, request, queryset):
        from apps.core.services.store_settings import get_store_settings

        value = self.value()
        if value == "prepare":
            return queryset.filter(status=Order.Status.PAID, needs_shipping=True)
        if value == "ship":
            return queryset.filter(status=Order.Status.PROCESSING)
        if value == "overdue":
            days = get_store_settings().shipping_overdue_days
            return queryset.filter(
                status=Order.Status.SHIPPED,
                shipped_at__lt=timezone.now() - dt.timedelta(days=days),
            )
        return queryset


@admin.register(Order)
class OrderAdmin(ModelAdmin):
    inlines = (OrderItemInline, OrderStatusLogInline)
    actions = (
        "to_processing",
        "to_shipped",
        "to_delivered",
        "to_cancelled",
        "print_slips",
        "export_csv",
    )
    list_display = (
        "number",
        "user_phone",
        "status",
        "total_toman",
        "needs_shipping",
        "created_jalali",
        "paid_jalali",
    )
    list_filter = (FollowupFilter, "status", "needs_shipping", "shipping_method", "created_at")
    search_fields = ("number", "user__phone", "tracking_code")
    list_select_related = ("user",)
    date_hierarchy = "created_at"
    list_per_page = 50
    readonly_fields = (
        "number",
        "user",
        "status",
        "items_total",
        "discount_total",
        "discount_code",
        "discount_code_text",
        "shipping_total",
        "total",
        "needs_shipping",
        "shipping_method_name",
        "shipping_address_display",
        "customer_note",
        "created_jalali",
        "paid_jalali",
        "shipped_at",
        "delivered_at",
        "cancelled_at",
        "checkout_key",
        "print_link",
    )
    fieldsets = (
        (
            "سفارش",
            {
                "fields": (
                    "number",
                    "user",
                    "status",
                    "created_jalali",
                    "paid_jalali",
                    "print_link",
                )
            },
        ),
        (
            "مبالغ",
            {
                "fields": (
                    "items_total",
                    "discount_total",
                    "discount_code",
                    "discount_code_text",
                    "shipping_total",
                    "total",
                )
            },
        ),
        (
            "ارسال",
            {
                "fields": (
                    "needs_shipping",
                    "shipping_method_name",
                    "shipping_address_display",
                    "tracking_code",
                    "shipped_at",
                    "delivered_at",
                )
            },
        ),
        ("یادداشت‌ها", {"fields": ("customer_note", "staff_note")}),
        ("سایر", {"fields": ("cancelled_at", "checkout_key"), "classes": ("collapse",)}),
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.display(description="مشتری", ordering="user__phone")
    def user_phone(self, obj):
        return obj.user.phone

    @admin.display(description="مبلغ", ordering="total")
    def total_toman(self, obj):
        return format_toman(obj.total)

    @admin.display(description="ثبت", ordering="created_at")
    def created_jalali(self, obj):
        return jalali_dt(obj.created_at)

    @admin.display(description="پرداخت", ordering="paid_at")
    def paid_jalali(self, obj):
        return jalali_dt(obj.paid_at)

    @admin.display(description="نشانی ارسال")
    def shipping_address_display(self, obj):
        a = obj.shipping_address
        if not a:
            return "—"
        return (
            f"{a.get('recipient_name', '')} ({a.get('recipient_phone', '')}) — "
            f"{a.get('province', '')}، {a.get('city', '')}، {a.get('address_line', '')} — "
            f"کد پستی {a.get('postal_code', '')}"
        )

    @admin.display(description="چاپ")
    def print_link(self, obj):
        if not obj.pk:
            return "—"
        url = reverse("admin:orders_order_print", args=[obj.pk])
        return format_html('<a href="{}" target="_blank">فاکتور و برگه بسته‌بندی</a>', url)

    def get_urls(self):
        custom = [
            path(
                "<int:pk>/print/",
                self.admin_site.admin_view(self.print_view),
                name="orders_order_print",
            )
        ]
        return custom + super().get_urls()

    def print_view(self, request, pk):
        if not self.has_view_permission(request):
            raise PermissionDenied
        return self._render_slips(request, Order.objects.filter(pk=pk))

    def _render_slips(self, request, queryset):
        from apps.core.services.store_settings import get_store_settings

        orders = queryset.select_related("user").prefetch_related("items").order_by("created_at")
        return TemplateResponse(
            request,
            "backoffice/order_print.html",
            {
                "orders": [
                    {
                        "order": o,
                        "created": jalali_dt(o.created_at),
                        "paid": jalali_dt(o.paid_at),
                        "address": o.shipping_address or {},
                    }
                    for o in orders
                ],
                "settings": get_store_settings(),
                "title": "چاپ سفارش",
            },
        )

    @admin.action(description="چاپ فاکتور و برگه بسته‌بندی")
    def print_slips(self, request, queryset):
        return self._render_slips(request, queryset)

    @admin.action(description="خروجی اکسل (CSV)")
    def export_csv(self, request, queryset):
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="orders.csv"'
        response.write("\ufeff")  # BOM so Excel reads Persian text as UTF-8
        writer = csv.writer(response)
        writer.writerow(
            ["شماره", "ثبت", "پرداخت", "موبایل", "وضعیت", "اقلام", "مبلغ", "روش ارسال",
             "گیرنده", "استان", "شهر", "نشانی", "کد پستی", "کد رهگیری"]
        )  # fmt: skip
        for o in queryset.select_related("user").prefetch_related("items"):
            a = o.shipping_address or {}
            writer.writerow(
                [
                    o.number,
                    jalali_dt(o.created_at),
                    jalali_dt(o.paid_at),
                    o.user.phone,
                    o.get_status_display(),
                    " | ".join(
                        f"{i.title} ({i.variant_type}) ×{i.quantity}" for i in o.items.all()
                    ),
                    o.total,
                    o.shipping_method_name,
                    a.get("recipient_name", ""),
                    a.get("province", ""),
                    a.get("city", ""),
                    a.get("address_line", ""),
                    a.get("postal_code", ""),
                    o.tracking_code,
                ]
            )
        return response

    def _move(self, request, queryset, to_status):
        done, errors = 0, []
        for order in queryset:
            try:
                state.transition(order, to_status, actor=request.user, note="از پنل مدیریت")
            except state.TransitionError as exc:
                errors.append(f"{order.number}: {exc.message}")
            else:
                done += 1
        label = Order.Status(to_status).label
        if done:
            self.message_user(
                request, f"{to_persian_digits(done)} سفارش به «{label}» رفت.", messages.SUCCESS
            )
        for error in errors:
            self.message_user(request, error, messages.ERROR)

    @admin.action(description="آماده‌سازی")
    def to_processing(self, request, queryset):
        self._move(request, queryset, Order.Status.PROCESSING)

    @admin.action(description="ارسال‌شده (کد رهگیری لازم است)")
    def to_shipped(self, request, queryset):
        self._move(request, queryset, Order.Status.SHIPPED)

    @admin.action(description="تحویل‌شده")
    def to_delivered(self, request, queryset):
        self._move(request, queryset, Order.Status.DELIVERED)

    @admin.action(description="لغو")
    def to_cancelled(self, request, queryset):
        self._move(request, queryset, Order.Status.CANCELLED)


@admin.register(ShippingMethod)
class ShippingMethodAdmin(ModelAdmin):
    list_display = ("name", "code", "price_toman", "free_over", "tehran_only", "order", "is_active")
    list_editable = ("order", "is_active")
    search_fields = ("name", "code")

    @admin.display(description="هزینه", ordering="base_price")
    def price_toman(self, obj):
        return format_toman(obj.base_price)


class DiscountCodeForm(forms.ModelForm):
    formats = forms.MultipleChoiceField(
        label="فقط برای نسخه‌ها",
        choices=BookVariant.Type.choices,
        required=False,
        widget=UnfoldAdminCheckboxSelectMultipleWidget,
        help_text="هیچ‌کدام یعنی همه نسخه‌ها.",
    )

    class Meta:
        model = DiscountCode
        fields = (
            "code",
            "description",
            "kind",
            "value",
            "max_discount",
            "min_order_total",
            "max_uses",
            "per_user_limit",
            "valid_from",
            "valid_until",
            "subjects",
            "formats",
            "is_active",
        )

    def clean_formats(self):
        return list(self.cleaned_data.get("formats") or [])

    def clean(self):
        cleaned = super().clean()
        kind, value = cleaned.get("kind"), cleaned.get("value")
        if kind == DiscountCode.Kind.PERCENT and value is not None and not 1 <= value <= 100:
            self.add_error("value", "درصد باید بین ۱ تا ۱۰۰ باشد.")
        start, end = cleaned.get("valid_from"), cleaned.get("valid_until")
        if start and end and end <= start:
            self.add_error("valid_until", "پایان اعتبار باید بعد از شروع آن باشد.")
        return cleaned


@admin.register(DiscountCode)
class DiscountCodeAdmin(ModelAdmin):
    form = DiscountCodeForm
    list_display = (
        "code",
        "label",
        "used_count",
        "max_uses",
        "valid_from_jalali",
        "valid_until_jalali",
        "is_active",
    )
    list_filter = ("is_active", "kind")
    search_fields = ("code", "description")
    filter_horizontal = ("subjects",)
    readonly_fields = ("used_count",)

    @admin.display(description="تخفیف")
    def label(self, obj):
        return label_for(obj)

    @admin.display(description="شروع", ordering="valid_from")
    def valid_from_jalali(self, obj):
        return jalali_dt(obj.valid_from)

    @admin.display(description="پایان", ordering="valid_until")
    def valid_until_jalali(self, obj):
        return jalali_dt(obj.valid_until)


@admin.register(DiscountRedemption)
class DiscountRedemptionAdmin(ModelAdmin):
    list_display = ("code", "order", "user", "amount_toman", "created_jalali")
    list_filter = ("code",)
    search_fields = ("code__code", "order__number", "user__phone")
    list_select_related = ("code", "order", "user")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.display(description="مبلغ", ordering="amount")
    def amount_toman(self, obj):
        return format_toman(obj.amount)

    @admin.display(description="زمان", ordering="created_at")
    def created_jalali(self, obj):
        return jalali_dt(obj.created_at)


@admin.register(Address)
class AddressAdmin(ModelAdmin):
    list_display = ("recipient_name", "user", "province", "city", "is_default")
    list_filter = ("province",)
    search_fields = ("user__phone", "recipient_phone", "recipient_name", "postal_code")
    list_select_related = ("user",)
    raw_id_fields = ("user",)
