from django.contrib import admin
from django.http import HttpResponseRedirect
from django.urls import reverse
from unfold.admin import ModelAdmin

from .models import StoreSettings
from .services.store_settings import get_store_settings


@admin.register(StoreSettings)
class StoreSettingsAdmin(ModelAdmin):
    """Single-instance admin: the list page redirects to the one settings row."""

    fieldsets = (
        ("ارسال", {"fields": ("free_shipping_threshold", "print_dispatch_note",
                              "delivery_tehran_note", "delivery_province_note")}),
        ("مشاوره و پشتیبانی", {"fields": ("consult_whatsapp", "consult_telegram",
                                         "support_hours")}),
        ("اعتماد", {"fields": ("enamad_html", "students_count_claim")}),
    )  # fmt: skip

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        obj = get_store_settings()
        return HttpResponseRedirect(reverse("admin:core_storesettings_change", args=[obj.pk]))
