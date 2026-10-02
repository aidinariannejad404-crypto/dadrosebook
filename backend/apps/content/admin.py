from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import Banner, GuideVideo


@admin.register(Banner)
class BannerAdmin(ModelAdmin):
    list_display = ("title", "placement", "link_url", "order", "is_active")
    list_filter = ("placement", "is_active")
    list_editable = ("order", "is_active")
    search_fields = ("title", "subtitle")


@admin.register(GuideVideo)
class GuideVideoAdmin(ModelAdmin):
    list_display = ("title", "subject", "exam_type", "order", "is_active")
    list_filter = ("subject", "exam_type", "is_active")
    list_editable = ("order", "is_active")
    search_fields = ("title",)
    autocomplete_fields = ("subject", "exam_type")
