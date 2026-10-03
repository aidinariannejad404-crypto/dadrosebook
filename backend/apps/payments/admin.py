from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline

from apps.core.jalali import to_jalali_str
from apps.core.money import format_number

from .models import Payment, PaymentLog


class PaymentLogInline(TabularInline):
    model = PaymentLog
    extra = 0
    can_delete = False
    fields = ("created_at", "event", "from_status", "to_status", "data")
    readonly_fields = fields
    ordering = ("created_at", "id")

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Payment)
class PaymentAdmin(ModelAdmin):
    list_display = (
        "id",
        "order_link",
        "gateway",
        "amount_display",
        "status",
        "ref_id",
        "created_display",
    )
    list_filter = ("gateway", "status")
    search_fields = ("authority", "ref_id", "order__number")
    list_select_related = ("order",)
    inlines = [PaymentLogInline]
    readonly_fields = [f.name for f in Payment._meta.fields]
    fields = (
        "order",
        "gateway",
        "amount_rial",
        "status",
        "authority",
        "ref_id",
        "card_pan",
        "error",
        "verified_at",
        "created_at",
        "updated_at",
        "raw_request",
        "raw_verify",
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.display(description="سفارش", ordering="order__number")
    def order_link(self, obj):
        return obj.order.number

    @admin.display(description="مبلغ (ریال)", ordering="amount_rial")
    def amount_display(self, obj):
        return format_number(obj.amount_rial)

    @admin.display(description="ایجاد", ordering="created_at")
    def created_display(self, obj):
        return to_jalali_str(obj.created_at, persian_digits=True) or "—"
