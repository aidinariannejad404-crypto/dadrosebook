from django.contrib import admin
from django.contrib.auth.admin import GroupAdmin as BaseGroupAdmin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import Group
from unfold.admin import ModelAdmin, StackedInline
from unfold.forms import AdminPasswordChangeForm, UserChangeForm, UserCreationForm

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

    list_display = ("phone", "first_name", "last_name", "is_staff", "is_active", "date_joined")
    list_filter = ("is_staff", "is_superuser", "is_active", "groups")
    search_fields = ("phone", "first_name", "last_name")
    ordering = ("-date_joined",)
    fieldsets = (
        (None, {"fields": ("phone", "password")}),
        ("اطلاعات شخصی", {"fields": ("first_name", "last_name")}),
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
