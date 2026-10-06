from django.contrib import admin, messages
from django.utils import timezone
from unfold.admin import ModelAdmin, TabularInline

from apps.core.jalali import to_jalali_str
from apps.core.money import to_persian_digits

from .models import (
    EditionLink,
    EditionUpgradeNotice,
    ReadingDay,
    ReviewPrompt,
    StudyPlan,
    StudyPlanBook,
    StudyProfile,
)
from .services.editions import owner_ids


def _jalali(value):
    if value is None:
        return "—"
    local = timezone.localtime(value)
    return f"{to_jalali_str(local, persian_digits=True)} {local:%H:%M}"


@admin.register(EditionLink)
class EditionLinkAdmin(ModelAdmin):
    list_display = (
        "new_book",
        "old_book",
        "percent",
        "is_active",
        "owners",
        "notices_sent",
        "jalali_notified_at",
    )
    list_filter = ("is_active",)
    search_fields = ("new_book__title", "old_book__title")
    autocomplete_fields = ("new_book", "old_book")
    list_select_related = ("new_book", "old_book")
    readonly_fields = ("notified_at", "created_at", "updated_at")
    fields = (
        "new_book",
        "old_book",
        "upgrade_discount_percent",
        "is_active",
        "notified_at",
        "created_at",
        "updated_at",
    )
    actions = ("notify_owners",)

    @admin.display(description="تخفیف")
    def percent(self, obj):
        return f"{to_persian_digits(obj.upgrade_discount_percent)}٪"

    @admin.display(description="دارندگان ویرایش قبلی")
    def owners(self, obj):
        return to_persian_digits(len(owner_ids(obj.old_book)))

    @admin.display(description="پیامک‌های ارسال‌شده")
    def notices_sent(self, obj):
        return to_persian_digits(obj.notices.count())

    @admin.display(description="آخرین ارسال")
    def jalali_notified_at(self, obj):
        return _jalali(obj.notified_at)

    @admin.action(description="ارسال پیامک ارتقا به دارندگان ویرایش قبلی")
    def notify_owners(self, request, queryset):
        from .tasks import notify_edition_owners

        links = list(queryset.filter(is_active=True))
        for link in links:
            notify_edition_owners.delay(link.pk)
        self.message_user(
            request,
            f"ارسال پیامک برای {to_persian_digits(len(links))} ارتقا در صف قرار گرفت. "
            "به هر دارنده فقط یک بار پیامک می‌رسد.",
            messages.SUCCESS,
        )


@admin.register(EditionUpgradeNotice)
class EditionUpgradeNoticeAdmin(ModelAdmin):
    list_display = ("user", "link", "sent_at")
    list_select_related = ("user", "link__new_book", "link__old_book")
    search_fields = ("user__phone", "link__new_book__title")
    readonly_fields = ("link", "user", "sent_at")

    def has_add_permission(self, request):
        return False


@admin.register(ReviewPrompt)
class ReviewPromptAdmin(ModelAdmin):
    list_display = ("user", "book", "reason", "created_at", "sms_sent_at", "answered_at")
    list_filter = ("reason", "sms_sent_at", "answered_at", "dismissed_at")
    search_fields = ("user__phone", "book__title")
    list_select_related = ("user", "book")
    readonly_fields = (
        "user",
        "book",
        "reason",
        "sms_sent_at",
        "dismissed_at",
        "answered_at",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request):
        return False


class StudyPlanBookInline(TabularInline):
    model = StudyPlanBook
    extra = 0
    fields = ("title", "total_pages", "pages_done")
    readonly_fields = ("title", "total_pages", "pages_done")
    can_delete = False


@admin.register(StudyPlan)
class StudyPlanAdmin(ModelAdmin):
    list_display = ("user", "exam_name", "exam_date", "is_active", "compressed_count", "created_at")
    list_filter = ("is_active",)
    search_fields = ("user__phone", "exam_name")
    list_select_related = ("user",)
    readonly_fields = (
        "user",
        "lead",
        "exam_name",
        "exam_date",
        "hours_per_day",
        "compressed_count",
        "last_compressed_at",
        "created_at",
    )
    exclude = ("days", "review")
    inlines = (StudyPlanBookInline,)

    def has_add_permission(self, request):
        return False


@admin.register(ReadingDay)
class ReadingDayAdmin(ModelAdmin):
    list_display = ("user", "date", "minutes_display", "goal_minutes", "goal_met_at")
    list_filter = ("date",)
    search_fields = ("user__phone",)
    list_select_related = ("user",)
    readonly_fields = ("user", "date", "seconds", "goal_minutes", "goal_met_at")

    @admin.display(description="دقیقه")
    def minutes_display(self, obj):
        return to_persian_digits(obj.minutes)

    def has_add_permission(self, request):
        return False


@admin.register(StudyProfile)
class StudyProfileAdmin(ModelAdmin):
    list_display = ("user", "daily_goal_minutes", "review_sms", "last_beat_at")
    search_fields = ("user__phone",)
    list_select_related = ("user",)
    readonly_fields = ("user", "last_beat_at")
