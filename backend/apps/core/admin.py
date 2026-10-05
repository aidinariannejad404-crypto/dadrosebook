from django import forms
from django.contrib import admin
from django.http import HttpResponseRedirect
from django.urls import reverse
from django.utils.html import format_html, format_html_join
from unfold.admin import ModelAdmin

from .models import SmsTemplate, StoreSettings
from .services.sms_templates import ensure_templates, render, unknown_placeholders
from .services.store_settings import get_store_settings
from .sms_catalog import KINDS


@admin.register(StoreSettings)
class StoreSettingsAdmin(ModelAdmin):
    """Single-instance admin: the list page redirects to the one settings row."""

    fieldsets = (
        ("ارسال", {"fields": ("free_shipping_threshold", "print_dispatch_note",
                              "delivery_tehran_note", "delivery_province_note")}),
        ("مشاوره و پشتیبانی", {"fields": ("consult_whatsapp", "consult_telegram",
                                         "support_hours")}),
        ("پیشخوان مدیریت", {"fields": ("low_stock_threshold", "shipping_overdue_days")}),
        ("سبد رهاشده", {"fields": ("abandoned_cart_enabled", "abandoned_cart_hours",
                                   "abandoned_cart_code")}),
        ("اعتماد", {"fields": ("enamad_html", "students_count_claim")}),
    )  # fmt: skip

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        obj = get_store_settings()
        return HttpResponseRedirect(reverse("admin:core_storesettings_change", args=[obj.pk]))


class SmsTemplateForm(forms.ModelForm):
    class Meta:
        model = SmsTemplate
        fields = ("body", "is_active")

    def clean_body(self):
        body = self.cleaned_data["body"]
        try:
            unknown = unknown_placeholders(self.instance.key, body)
        except ValueError as exc:
            raise forms.ValidationError(
                "آکولادها درست باز و بسته نشده‌اند. متغیرها باید مثل {order} نوشته شوند."
            ) from exc
        if unknown:
            raise forms.ValidationError(
                "این متغیرها برای این پیامک تعریف نشده‌اند: " + "، ".join(sorted(unknown))
            )
        return body


@admin.register(SmsTemplate)
class SmsTemplateAdmin(ModelAdmin):
    form = SmsTemplateForm
    list_display = ("__str__", "kind_type", "short_body", "is_active")
    list_editable = ("is_active",)
    readonly_fields = ("kind_label", "variables", "preview", "updated_at")
    fields = ("kind_label", "body", "variables", "preview", "is_active", "updated_at")

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        ensure_templates()
        return super().changelist_view(request, extra_context)

    @admin.display(description="پیامک")
    def kind_label(self, obj):
        return str(obj)

    @admin.display(description="نوع")
    def kind_type(self, obj):
        kind = KINDS.get(obj.key)
        return "تبلیغاتی (لغو۱۱ لازم)" if kind and kind.marketing else "خدماتی"

    @admin.display(description="متن")
    def short_body(self, obj):
        return obj.body if len(obj.body) <= 70 else obj.body[:70] + "…"

    @admin.display(description="متغیرهای مجاز")
    def variables(self, obj):
        kind = KINDS.get(obj.key)
        if not kind:
            return "—"
        return format_html(
            "<ul>{}</ul>",
            format_html_join(
                "", '<li><code dir="ltr">{{{}}}</code> — {}</li>', kind.placeholders.items()
            ),
        )

    @admin.display(description="پیش‌نمایش با داده نمونه")
    def preview(self, obj):
        sample = {
            "order": "DR0507135839",
            "total": "۸۹۵٬۰۰۰ تومان",
            "tracking": "123456789012345678",
            "book": "قانون مدنی تحریری",
            "format": "نسخه چاپی",
            "link": "https://dadrosebook.com/cart",
            "count": "۲",
            "code": "SABAD10",
            "amount": "۸۵۰٬۰۰۰ تومان",
            "reference": "۷۷۴۴۱۲",
        }
        try:
            text = render(obj.key, obj.body, sample)
        except (ValueError, IndexError, KeyError):
            return "متن خطا دارد."
        return format_html(
            '<div style="white-space:pre-line;max-width:28rem;padding:.75rem;border-radius:.75rem;'
            'background:#f0f3f9">{}</div>'
            '<div style="font-size:.75rem;color:#64748b">{} نویسه</div>',
            text,
            len(text),
        )
