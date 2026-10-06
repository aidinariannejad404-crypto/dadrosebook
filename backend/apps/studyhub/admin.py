from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import StudyReminderConsent


@admin.register(StudyReminderConsent)
class StudyReminderConsentAdmin(ModelAdmin):
    list_display = ("user", "sms", "source", "consented_at", "withdrawn_at")
    list_filter = ("sms", "source")
    search_fields = ("user__phone",)
    list_select_related = ("user",)
    readonly_fields = ("user", "sms", "source", "consented_at", "withdrawn_at", "updated_at")

    def has_add_permission(self, request):
        return False
