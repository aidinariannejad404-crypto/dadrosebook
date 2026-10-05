import csv
import datetime as dt

import jdatetime
from django import forms
from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.forms.models import BaseInlineFormSet
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils import timezone
from django.utils.html import format_html
from unfold.admin import ModelAdmin, TabularInline
from unfold.decorators import action, display
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
    ReturnLine,
    ReturnRequest,
    ReturnRequestLog,
    ShippingMethod,
)
from .services import returns, state
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


class OrderReturnInline(ReadOnlyInline):
    model = ReturnRequest
    fk_name = "order"
    fields = ("status", "reason", "amount_toman", "refund_method", "created_jalali")
    readonly_fields = fields
    show_change_link = True
    verbose_name_plural = "مرجوعی‌های این سفارش"

    @admin.display(description="مبلغ استرداد")
    def amount_toman(self, obj):
        return format_toman(obj.refund_amount) if obj.refund_amount is not None else "—"

    @admin.display(description="ثبت")
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
    inlines = (OrderItemInline, OrderReturnInline, OrderStatusLogInline)
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
        "refunded_total",
        "returns_link",
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
                    "refunded_total",
                    "returns_link",
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

    @admin.display(description="مرجوعی")
    def returns_link(self, obj):
        if not obj.pk or not obj.is_paid:
            return "—"
        add = reverse("admin:orders_returnrequest_add") + f"?order={obj.pk}"
        listing = reverse("admin:orders_returnrequest_changelist") + f"?order__id__exact={obj.pk}"
        window = WINDOW_LABELS[window_key(obj)][0]
        return format_html(
            '<a href="{}">ثبت مرجوعی</a> · <a href="{}">مرجوعی‌های این سفارش</a> · {}',
            add,
            listing,
            window,
        )

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


# --- returns and refunds (مرجوعی و استرداد وجه) ------------------------------------------------

WINDOW_LABELS = {
    "in": ("داخل مهلت ۷ روزه", "success"),
    "out": ("خارج از مهلت ۷ روزه", "danger"),
    "pending": ("هنوز تحویل نشده", "warning"),
}


def window_key(order, at=None) -> str:
    inside = returns.within_window(order, at=at)
    if inside is None:
        return "pending"
    return "in" if inside else "out"


class ReturnRequestForm(forms.ModelForm):
    class Meta:
        model = ReturnRequest
        fields = (
            "reason",
            "description",
            "restock",
            "revoke_ebook",
            "refund_method",
            "refund_amount",
            "shaba",
            "card_number",
            "account_holder",
            "refund_reference",
            "staff_note",
        )

    def clean_shaba(self):
        value = self.cleaned_data.get("shaba")
        return returns.validate_shaba(value) if value else ""

    def clean_card_number(self):
        value = self.cleaned_data.get("card_number")
        return returns.validate_card_number(value) if value else ""

    def clean(self):
        cleaned = super().clean()
        order = getattr(self, "return_order", None)
        amount = cleaned.get("refund_amount")
        if order is not None and amount is not None and "refund_amount" in self.fields:
            try:
                returns.validate_refund_amount(order, amount)
            except returns.ReturnError as exc:
                self.add_error("refund_amount", exc.message)
        return cleaned


class ReturnLineFormSet(BaseInlineFormSet):
    def clean(self):
        super().clean()
        order = getattr(self, "return_order", None)
        if order is None or any(self.errors):
            return
        pairs = []
        for form in self.forms:
            data = getattr(form, "cleaned_data", None) or {}
            if not data or data.get("DELETE") or not data.get("order_item"):
                continue
            pairs.append((data["order_item"], data.get("quantity")))
        try:
            returns.validate_lines(order, pairs, exclude=self.instance)
        except returns.ReturnError as exc:
            raise forms.ValidationError(exc.message) from None


class ReturnLineInline(TabularInline):
    model = ReturnLine
    formset = ReturnLineFormSet
    extra = 0
    min_num = 1
    fields = ("order_item", "quantity", "purchased", "share_toman")
    readonly_fields = ("purchased", "share_toman")

    @staticmethod
    def _editable(obj) -> bool:
        return obj is None or obj.status in (
            ReturnRequest.Status.REQUESTED,
            ReturnRequest.Status.APPROVED,
        )

    def get_extra(self, request, obj=None, **kwargs):
        return 0 if obj else 1

    def has_add_permission(self, request, obj=None):
        return self._editable(obj) and super().has_add_permission(request, obj)

    def has_change_permission(self, request, obj=None):
        return self._editable(obj) and super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        return self._editable(obj) and super().has_delete_permission(request, obj)

    def get_formset(self, request, obj=None, **kwargs):
        formset = super().get_formset(request, obj, **kwargs)
        formset.return_order = getattr(request, "_return_order", None)
        return formset

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "order_item":
            order = getattr(request, "_return_order", None)
            kwargs["queryset"] = (
                OrderItem.objects.filter(order=order) if order else OrderItem.objects.none()
            )
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    @admin.display(description="خریداری‌شده")
    def purchased(self, obj):
        return to_persian_digits(obj.order_item.quantity) if obj.pk else "—"

    @admin.display(description="سهم مبلغ")
    def share_toman(self, obj):
        return format_toman(obj.amount_share) if obj.pk else "—"


class ReturnRequestLogInline(ReadOnlyInline):
    model = ReturnRequestLog
    fields = ("from_status", "to_status", "note", "actor", "created_jalali")
    readonly_fields = fields

    @admin.display(description="زمان")
    def created_jalali(self, obj):
        return jalali_dt(obj.created_at)


@admin.register(ReturnRequest)
class ReturnRequestAdmin(ModelAdmin):
    form = ReturnRequestForm
    inlines = (ReturnLineInline, ReturnRequestLogInline)
    actions = ("approve_selected", "receive_selected", "refund_selected", "reject_selected")
    actions_detail = (
        "approve_detail",
        "receive_detail",
        "refund_detail",
        "reject_detail",
        "cancel_detail",
    )
    list_display = (
        "id",
        "order",
        "customer",
        "status",
        "reason",
        "amount_toman",
        "refund_method",
        "window_label",
        "created_jalali",
    )
    list_filter = ("status", "reason", "refund_method", "created_at")
    search_fields = ("order__number", "order__user__phone", "refund_reference", "shaba")
    list_select_related = ("order", "order__user")
    date_hierarchy = "created_at"
    list_per_page = 50
    fieldsets = (
        (
            "مرجوعی",
            {
                "fields": (
                    "order_link",
                    "status",
                    "window_label",
                    "reason",
                    "description",
                    "restock",
                    "revoke_ebook",
                )
            },
        ),
        (
            "استرداد وجه",
            {
                "fields": (
                    "refundable_display",
                    "suggested_display",
                    "refund_amount",
                    "refund_method",
                    "shaba",
                    "card_number",
                    "account_holder",
                    "refund_reference",
                )
            },
        ),
        (
            "زمان‌ها و یادداشت",
            {
                "fields": (
                    "staff_note",
                    "created_by",
                    "created_jalali",
                    "approved_jalali",
                    "received_jalali",
                    "refunded_jalali",
                    "closed_jalali",
                )
            },
        ),
    )
    BASE_READONLY = (
        "order_link",
        "status",
        "window_label",
        "refundable_display",
        "suggested_display",
        "created_by",
        "created_jalali",
        "approved_jalali",
        "received_jalali",
        "refunded_jalali",
        "closed_jalali",
    )

    def has_delete_permission(self, request, obj=None):
        return False

    def get_readonly_fields(self, request, obj=None):
        fields = list(self.BASE_READONLY)
        if obj is None:
            return fields
        s = ReturnRequest.Status
        if obj.status in (s.REFUNDED, s.REJECTED, s.CANCELLED):
            editable = set(returns.EDITABLE_WHEN_CLOSED)
            fields += [f for f in ReturnRequestForm.Meta.fields if f not in editable]
        elif obj.status == s.RECEIVED:
            fields += ["restock"]
        return fields

    # -- which order --

    @staticmethod
    def _order_from_request(request):
        try:
            return Order.objects.select_related("user").get(pk=int(request.GET.get("order", "")))
        except (Order.DoesNotExist, ValueError, TypeError):
            return None

    def add_view(self, request, form_url="", extra_context=None):
        order = self._order_from_request(request)
        if order is None or not order.is_paid:
            self.message_user(
                request,
                "مرجوعی را از صفحه سفارش (پیوند «ثبت مرجوعی») ثبت کنید؛ سفارش باید پرداخت‌شده باشد.",
                messages.WARNING,
            )
            return redirect("admin:orders_order_changelist")
        request._return_order = order
        return super().add_view(request, form_url, extra_context)

    def change_view(self, request, object_id, form_url="", extra_context=None):
        obj = self.get_object(request, object_id)
        if obj is not None:
            request._return_order = obj.order
        return super().change_view(request, object_id, form_url, extra_context)

    def get_form(self, request, obj=None, change=False, **kwargs):
        form = super().get_form(request, obj, change=change, **kwargs)
        form.return_order = getattr(request, "_return_order", None)
        return form

    def get_changeform_initial_data(self, request):
        initial = super().get_changeform_initial_data(request)
        initial.pop("order", None)
        return initial

    def save_model(self, request, obj, form, change):
        if not change:
            obj.order = request._return_order
            obj.created_by = request.user
        request._return_changed = list(form.changed_data)
        super().save_model(request, obj, form, change)

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        obj = form.instance
        if not change:
            returns.finalize_created(obj, actor=request.user)
            return
        changed = list(getattr(request, "_return_changed", []))
        lines_changed = any(fs.has_changed() for fs in formsets if fs.model is ReturnLine)
        if obj.status != ReturnRequest.Status.REFUNDED and (
            obj.refund_amount is None or (lines_changed and "refund_amount" not in changed)
        ):
            obj.refund_amount = returns.default_refund_amount(obj)
            obj.save(update_fields=["refund_amount", "updated_at"])
        if lines_changed:
            changed.append("اقلام")
        returns.log_edit(obj, changed, actor=request.user)

    # -- display --

    @admin.display(description="سفارش")
    def order_link(self, obj):
        order = obj.order if obj and obj.pk else None
        if order is None:
            return "—"
        url = reverse("admin:orders_order_change", args=[order.pk])
        return format_html(
            '<a href="{}">{}</a> — {} — {}',
            url,
            order.number,
            order.user.phone,
            format_toman(order.total),
        )

    @admin.display(description="مشتری", ordering="order__user__phone")
    def customer(self, obj):
        return obj.order.user.phone

    @admin.display(description="مبلغ استرداد", ordering="refund_amount")
    def amount_toman(self, obj):
        return format_toman(obj.refund_amount) if obj.refund_amount is not None else "—"

    @display(
        description="مهلت قانونی",
        label=dict(WINDOW_LABELS.values()),
    )
    def window_label(self, obj):
        if obj is None or not obj.pk:
            return "—"
        return WINDOW_LABELS[window_key(obj.order, at=obj.created_at)][0]

    @admin.display(description="قابل استرداد در این سفارش")
    def refundable_display(self, obj):
        if obj is None or not obj.pk:
            return "—"
        order = obj.order
        return (
            f"{format_toman(returns.refundable_amount(order))} "
            f"(مبلغ سفارش {format_toman(order.total)}، "
            f"مستردشده {format_toman(order.refunded_total)})"
        )

    @admin.display(description="سهم اقلام مرجوعی")
    def suggested_display(self, obj):
        if obj is None or not obj.pk:
            return "پس از ذخیره محاسبه می‌شود؛ مبلغ استرداد را خالی بگذارید تا همین مقدار ثبت شود."
        return format_toman(returns.default_refund_amount(obj))

    @admin.display(description="ثبت", ordering="created_at")
    def created_jalali(self, obj):
        return jalali_dt(obj.created_at) if obj and obj.pk else "—"

    @admin.display(description="تأیید")
    def approved_jalali(self, obj):
        return jalali_dt(obj.approved_at) if obj else "—"

    @admin.display(description="دریافت کالا")
    def received_jalali(self, obj):
        return jalali_dt(obj.received_at) if obj else "—"

    @admin.display(description="استرداد")
    def refunded_jalali(self, obj):
        return jalali_dt(obj.refunded_at) if obj else "—"

    @admin.display(description="رد/لغو")
    def closed_jalali(self, obj):
        return jalali_dt(obj.closed_at) if obj else "—"

    # -- actions --

    def _run(self, request, items, service, done_label):
        done = 0
        for rr in items:
            try:
                service(rr, actor=request.user, note="از پنل مدیریت")
            except returns.ReturnError as exc:
                self.message_user(
                    request, f"مرجوعی {to_persian_digits(rr.pk)}: {exc.message}", messages.ERROR
                )
            else:
                done += 1
        if done:
            self.message_user(
                request, f"{to_persian_digits(done)} مرجوعی {done_label}.", messages.SUCCESS
            )

    def _detail(self, request, object_id, service, done_label):
        if not self.has_change_permission(request):
            raise PermissionDenied
        rr = get_object_or_404(ReturnRequest, pk=object_id)
        self._run(request, [rr], service, done_label)
        return redirect("admin:orders_returnrequest_change", rr.pk)

    @admin.action(description="تأیید مرجوعی", permissions=["change"])
    def approve_selected(self, request, queryset):
        self._run(request, queryset, returns.approve, "تأیید شد")

    @admin.action(description="کالا دریافت شد (بازگشت به موجودی)", permissions=["change"])
    def receive_selected(self, request, queryset):
        self._run(request, queryset, returns.mark_received, "دریافت شد")

    @admin.action(description="استرداد وجه", permissions=["change"])
    def refund_selected(self, request, queryset):
        self._run(request, queryset, returns.refund, "مسترد شد")

    @admin.action(description="رد مرجوعی", permissions=["change"])
    def reject_selected(self, request, queryset):
        self._run(request, queryset, returns.reject, "رد شد")

    @action(description="تأیید", url_path="approve", permissions=["change"])
    def approve_detail(self, request, object_id):
        return self._detail(request, object_id, returns.approve, "تأیید شد")

    @action(description="کالا دریافت شد", url_path="receive", permissions=["change"])
    def receive_detail(self, request, object_id):
        return self._detail(request, object_id, returns.mark_received, "دریافت شد")

    @action(description="استرداد وجه", url_path="refund", permissions=["change"])
    def refund_detail(self, request, object_id):
        return self._detail(request, object_id, returns.refund, "مسترد شد")

    @action(description="رد", url_path="reject", permissions=["change"])
    def reject_detail(self, request, object_id):
        return self._detail(request, object_id, returns.reject, "رد شد")

    @action(description="لغو", url_path="cancel", permissions=["change"])
    def cancel_detail(self, request, object_id):
        return self._detail(request, object_id, returns.cancel, "لغو شد")
