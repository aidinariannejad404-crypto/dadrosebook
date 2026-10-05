from django.contrib import admin
from django.contrib.auth.admin import GroupAdmin as BaseGroupAdmin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import Group
from django.db.models import Count, Q, Sum
from django.urls import reverse
from django.utils.html import format_html, format_html_join
from unfold.admin import ModelAdmin, StackedInline
from unfold.forms import AdminPasswordChangeForm, UserChangeForm, UserCreationForm

from apps.core.money import format_toman, to_persian_digits
from apps.orders.models import Address

from .models import OtpCode, User
from .phone import normalize_phone


class PhoneUserCreationForm(UserCreationForm):
    class Meta(UserCreationForm.Meta):
        model = User
        fields = ("phone",)
        field_classes: dict = {}

    def clean_phone(self):
        return normalize_phone(self.cleaned_data.get("phone"))


class PhoneUserChangeForm(UserChangeForm):
    class Meta(UserChangeForm.Meta):
        model = User
        fields = "__all__"
        field_classes: dict = {}

    def clean_phone(self):
        return normalize_phone(self.cleaned_data.get("phone"))


admin.site.unregister(Group)


@admin.register(Group)
class GroupAdmin(BaseGroupAdmin, ModelAdmin):
    pass


class AddressInline(StackedInline):
    model = Address
    extra = 0
    fields = (
        ("title", "is_default"),
        ("recipient_name", "recipient_phone"),
        ("province", "city", "postal_code"),
        "address_line",
    )


@admin.register(User)
class UserAdmin(BaseUserAdmin, ModelAdmin):
    inlines = [AddressInline]
    form = PhoneUserChangeForm
    add_form = PhoneUserCreationForm
    change_password_form = AdminPasswordChangeForm

    list_display = (
        "phone",
        "first_name",
        "last_name",
        "paid_orders",
        "total_spent",
        "is_staff",
        "is_active",
        "date_joined",
    )
    readonly_fields = ("customer_summary", "last_login", "date_joined")
    list_filter = ("is_staff", "is_superuser", "is_active", "groups")
    search_fields = ("phone", "first_name", "last_name")
    ordering = ("-date_joined",)
    fieldsets = (
        (None, {"fields": ("phone", "password")}),
        ("اطلاعات شخصی", {"fields": ("first_name", "last_name")}),
        ("پرونده خرید", {"fields": ("customer_summary",)}),
        (
            "دسترسی‌ها",
            {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")},
        ),
        ("تاریخ‌ها", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("phone", "usable_password", "password1", "password2"),
            },
        ),
    )

    # Only a superuser may grant panel access or roles, so staff with «change user» (support)
    # cannot promote themselves or others.
    PRIVILEGE_FIELDS = ("is_staff", "is_superuser", "groups", "user_permissions")

    def get_readonly_fields(self, request, obj=None):
        fields = tuple(super().get_readonly_fields(request, obj))
        if not request.user.is_superuser:
            fields += self.PRIVILEGE_FIELDS
        return fields

    def get_queryset(self, request):
        paid = Q(orders__paid_at__isnull=False) & ~Q(orders__status="CANCELLED")
        return (
            super()
            .get_queryset(request)
            .annotate(
                num_paid_orders=Count("orders", filter=paid),
                spent=Sum("orders__total", filter=paid),
            )
        )

    @admin.display(description="سفارش موفق", ordering="num_paid_orders")
    def paid_orders(self, obj):
        return to_persian_digits(obj.num_paid_orders)

    @admin.display(description="مجموع خرید", ordering="spent")
    def total_spent(self, obj):
        return format_toman(obj.spent or 0)

    @admin.display(description="خلاصه")
    def customer_summary(self, obj):
        if not obj.pk:
            return "—"
        orders = obj.orders.order_by("-created_at")[:10]
        url = reverse("admin:orders_order_changelist") + f"?q={obj.phone}"
        rows = format_html_join(
            "",
            '<li><a href="{}">{}</a> — {} — {}</li>',
            (
                (
                    reverse("admin:orders_order_change", args=[o.pk]),
                    o.number,
                    o.get_status_display(),
                    format_toman(o.total),
                )
                for o in orders
            ),
        )
        return format_html(
            '{} سفارش موفق، مجموع {}. <a href="{}">همه سفارش‌ها</a><ul>{}</ul>',
            to_persian_digits(getattr(obj, "num_paid_orders", 0)),
            format_toman(getattr(obj, "spent", 0) or 0),
            url,
            rows,
        )


@admin.register(OtpCode)
class OtpCodeAdmin(ModelAdmin):
    """Read-only log of login codes; the code itself is never stored or shown (only its hash,
    which is hidden too)."""

    list_display = ("phone", "created_at", "expires_at", "attempts", "consumed_at", "ip")
    list_filter = ("created_at",)
    search_fields = ("phone",)
    fields = ("phone", "created_at", "expires_at", "attempts", "consumed_at", "ip")
    readonly_fields = fields
    ordering = ("-created_at",)
    date_hierarchy = "created_at"

    def get_search_results(self, request, queryset, search_term):
        return super().get_search_results(
            request, queryset, normalize_phone(search_term) or search_term
        )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
