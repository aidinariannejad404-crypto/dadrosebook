from django.contrib import admin, messages
from django.db.models import Case, IntegerField, Value, When
from unfold.admin import ModelAdmin

from .models import Review
from .services import reviews as svc


@admin.register(Review)
class ReviewAdmin(ModelAdmin):
    list_display = ("book", "user", "rating", "status", "is_verified_purchase", "created_at")
    list_filter = ("status", "rating", "is_verified_purchase")
    search_fields = ("book__title", "user__phone", "body")
    list_select_related = ("book", "user")
    raw_id_fields = ("book", "user")
    readonly_fields = (
        "is_verified_purchase",
        "moderated_at",
        "moderated_by",
        "created_at",
        "updated_at",
    )
    fields = (
        "book",
        "user",
        "rating",
        "exam_type",
        "body",
        "status",
        "reject_reason",
        "is_verified_purchase",
        "moderated_by",
        "moderated_at",
        "created_at",
        "updated_at",
    )
    actions = ("approve_reviews", "reject_reviews")

    # Pending first, then newest.
    ordering = (
        Case(
            When(status=Review.Status.PENDING, then=Value(0)),
            default=Value(1),
            output_field=IntegerField(),
        ).asc(),
        "-created_at",
    )

    @admin.action(description="تأیید نظرات")
    def approve_reviews(self, request, queryset):
        count = svc.approve(queryset, request.user)
        self.message_user(request, f"{count} نظر تأیید شد.", messages.SUCCESS)

    @admin.action(description="رد نظرات")
    def reject_reviews(self, request, queryset):
        count = svc.reject(queryset, request.user, reason="")
        self.message_user(request, f"{count} نظر رد شد.", messages.WARNING)
