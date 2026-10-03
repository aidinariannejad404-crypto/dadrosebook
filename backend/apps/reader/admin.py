from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import Highlight, ReadingProgress


class ReadOnlyAdmin(ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(ReadingProgress)
class ReadingProgressAdmin(ReadOnlyAdmin):
    list_display = ("user", "book", "page", "total_pages", "updated_at")
    search_fields = ("user__phone", "book__title")
    list_select_related = ("user", "book")


@admin.register(Highlight)
class HighlightAdmin(ReadOnlyAdmin):
    list_display = ("user", "book", "page", "color", "created_at")
    list_filter = ("color",)
    search_fields = ("user__phone", "book__title")
    list_select_related = ("user", "book")
