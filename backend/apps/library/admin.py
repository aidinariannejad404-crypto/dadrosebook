import os

from django import forms
from django.contrib import admin, messages
from django.utils import timezone
from unfold.admin import ModelAdmin

from apps.core.jalali import to_jalali_str
from apps.core.money import format_number

from .models import EbookEntitlement, EbookFile
from .services.entitlements import grant


def _human_size(num_bytes: int) -> str:
    if num_bytes >= 1024 * 1024:
        return f"{format_number(round(num_bytes / (1024 * 1024)))} مگابایت"
    return f"{format_number(max(1, round(num_bytes / 1024)))} کیلوبایت"


class EbookFileForm(forms.ModelForm):
    # A plain file input: the default widget renders a link to the file, and private files have
    # no public URL (``PrivateFileSystemStorage.url`` refuses on purpose).
    file = forms.FileField(
        label="فایل",
        required=False,
        widget=forms.FileInput(attrs={"accept": ".pdf,.epub"}),
        help_text="در فضای خصوصی ذخیره می‌شود و هیچ پیوند عمومی ندارد. "
        "برای جایگزینی، فایل تازه بارگذاری کنید.",
    )

    class Meta:
        model = EbookFile
        fields = ("book", "format", "file", "version", "is_active")

    def clean_file(self):
        file = self.cleaned_data.get("file")
        if not file and not (self.instance.pk and self.instance.file):
            raise forms.ValidationError("بارگذاری فایل الزامی است.")
        return file


@admin.register(EbookFile)
class EbookFileAdmin(ModelAdmin):
    form = EbookFileForm
    list_display = ("book", "format", "version", "file_name", "file_size", "is_active")
    list_filter = ("format", "is_active")
    search_fields = ("book__title",)
    autocomplete_fields = ("book",)
    list_select_related = ("book",)
    readonly_fields = ("file_name", "file_size")

    @admin.display(description="نام فایل")
    def file_name(self, obj):
        return os.path.basename(obj.file.name) if obj and obj.file else "—"

    @admin.display(description="حجم")
    def file_size(self, obj):
        if not obj or not obj.file:
            return "—"
        try:
            return _human_size(obj.file.size)
        except (OSError, NotImplementedError, ValueError):
            return "فایل یافت نشد"


class ActiveEntitlementFilter(admin.SimpleListFilter):
    title = "وضعیت دسترسی"
    parameter_name = "active"

    def lookups(self, request, model_admin):
        return (("1", "فعال"), ("0", "لغوشده"))

    def queryset(self, request, queryset):
        if self.value() == "1":
            return queryset.filter(revoked_at__isnull=True)
        if self.value() == "0":
            return queryset.filter(revoked_at__isnull=False)
        return queryset


class EntitlementAddForm(forms.ModelForm):
    class Meta:
        model = EbookEntitlement
        fields = ("user", "book")

    def _get_validation_exclusions(self):
        # Skip the (user, book) unique constraint: ``grant`` is idempotent and re-activates a
        # revoked entitlement.
        return {*super()._get_validation_exclusions(), "user"}

    def validate_unique(self):
        pass


@admin.register(EbookEntitlement)
class EbookEntitlementAdmin(ModelAdmin):
    list_display = ("user", "book", "source", "order_number", "is_active_display", "granted")
    list_filter = ("source", ActiveEntitlementFilter)
    search_fields = ("user__phone", "book__title", "source_order__number")
    list_select_related = ("user", "book", "source_order")
    autocomplete_fields = ("user", "book")
    actions = ("revoke_access", "restore_access")

    def get_form(self, request, obj=None, change=False, **kwargs):
        if obj is None:
            kwargs["form"] = EntitlementAddForm
        return super().get_form(request, obj, change=change, **kwargs)

    def get_fields(self, request, obj=None):
        if obj is None:
            return ("user", "book")
        return ("user", "book", "source", "source_order", "revoked_at", "created_at")

    def get_readonly_fields(self, request, obj=None):
        if obj is None:
            return ()
        return ("user", "book", "source", "source_order", "revoked_at", "created_at")

    def save_model(self, request, obj, form, change):
        if change:
            return  # everything is read-only; use the actions to revoke or restore
        ent = grant(obj.user, obj.book, source=EbookEntitlement.Source.ADMIN)
        obj.pk = ent.pk
        obj.source = ent.source
        obj.source_order = ent.source_order
        obj.revoked_at = ent.revoked_at
        obj.created_at = ent.created_at

    @admin.display(description="سفارش", ordering="source_order__number")
    def order_number(self, obj):
        return obj.source_order.number if obj.source_order_id else "—"

    @admin.display(description="فعال", boolean=True, ordering="revoked_at")
    def is_active_display(self, obj):
        return obj.is_active

    @admin.display(description="زمان اعطا", ordering="created_at")
    def granted(self, obj):
        return to_jalali_str(obj.created_at, persian_digits=True) or "—"

    @admin.action(description="لغو دسترسی")
    def revoke_access(self, request, queryset):
        count = queryset.filter(revoked_at__isnull=True).update(revoked_at=timezone.now())
        self.message_user(request, f"دسترسی {format_number(count)} مورد لغو شد.", messages.SUCCESS)

    @admin.action(description="بازگرداندن دسترسی")
    def restore_access(self, request, queryset):
        count = queryset.filter(revoked_at__isnull=False).update(revoked_at=None)
        self.message_user(
            request, f"دسترسی {format_number(count)} مورد بازگردانده شد.", messages.SUCCESS
        )
