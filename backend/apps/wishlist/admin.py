from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import WishlistItem


@admin.register(WishlistItem)
class WishlistItemAdmin(ModelAdmin):
    list_display = ("user", "book", "created_at")
    search_fields = ("user__phone", "book__title")
    list_select_related = ("user", "book")
    readonly_fields = ("user", "book", "created_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
