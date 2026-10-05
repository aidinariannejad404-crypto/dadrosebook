from django.contrib import admin
from django.contrib.admin.models import LogEntry
from django.utils.html import format_html
from unfold.admin import ModelAdmin

from apps.orders.admin import jalali_dt


@admin.register(LogEntry)
class LogEntryAdmin(ModelAdmin):
    """Read-only audit trail of every add / change / delete made in the panel."""

    list_display = ("when", "user", "action", "content_type", "object_link", "change_message_fa")
    list_filter = ("action_flag", "content_type", "user")
    search_fields = ("object_repr", "user__phone")
    list_select_related = ("user", "content_type")
    date_hierarchy = "action_time"
    list_per_page = 100

    ACTIONS = {1: "افزودن", 2: "ویرایش", 3: "حذف"}

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.display(description="زمان", ordering="action_time")
    def when(self, obj):
        return jalali_dt(obj.action_time)

    @admin.display(description="عمل", ordering="action_flag")
    def action(self, obj):
        return self.ACTIONS.get(obj.action_flag, "—")

    @admin.display(description="مورد")
    def object_link(self, obj):
        if obj.action_flag != 3 and obj.content_type_id and obj.object_id:
            url = obj.get_admin_url()
            if url:
                return format_html('<a href="{}">{}</a>', url, obj.object_repr)
        return obj.object_repr

    @admin.display(description="جزئیات")
    def change_message_fa(self, obj):
        return obj.get_change_message()
