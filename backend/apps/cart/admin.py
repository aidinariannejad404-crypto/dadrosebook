from django.contrib import admin
from django.db.models import Count, Sum
from django.utils import timezone
from unfold.admin import ModelAdmin, TabularInline

from apps.core.jalali import to_jalali_str
from apps.core.money import format_toman, to_persian_digits

from .models import Cart, CartItem
from .services.abandoned import abandoned_carts, send_reminders
from .services.rules import line_issue

ISSUE_LABELS = {
    "out_of_stock": "ناموجود",
    "insufficient_stock": "موجودی ناکافی",
    "unavailable": "غیرفعال",
    "price_unavailable": "قیمت نامشخص",
}


class CartItemInline(TabularInline):
    model = CartItem
    extra = 0
    can_delete = True
    fields = ("variant", "quantity", "unit_price", "status", "created_at")
    readonly_fields = ("variant", "quantity", "unit_price", "status", "created_at")

    def has_add_permission(self, request, obj=None):
        return False

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("variant__book")

    @admin.display(description="قیمت واحد")
    def unit_price(self, obj):
        return format_toman(obj.variant.effective_price)

    @admin.display(description="وضعیت")
    def status(self, obj):
        issue = line_issue(obj.variant, obj.quantity)
        return "قابل خرید" if issue is None else ISSUE_LABELS.get(issue, issue)


class AbandonedFilter(admin.SimpleListFilter):
    title = "سبد رهاشده"
    parameter_name = "abandoned"

    def lookups(self, request, model_admin):
        return (("1", "رهاشده (قابل یادآوری)"), ("reminded", "یادآوری‌شده"))

    def queryset(self, request, queryset):
        if self.value() == "1":
            return queryset.filter(pk__in=abandoned_carts().values("pk"))
        if self.value() == "reminded":
            return queryset.filter(reminded_at__isnull=False)
        return queryset


@admin.register(Cart)
class CartAdmin(ModelAdmin):
    list_display = (
        "__str__",
        "user",
        "is_guest",
        "lines",
        "units",
        "jalali_updated_at",
        "jalali_reminded_at",
    )
    list_filter = (AbandonedFilter, ("user", admin.EmptyFieldListFilter), "updated_at")
    actions = ("send_reminder",)
    search_fields = ("token", "user__phone")
    readonly_fields = ("token", "user", "created_at", "updated_at", "reminded_at")
    list_select_related = ("user",)
    inlines = (CartItemInline,)
    date_hierarchy = "updated_at"

    def has_add_permission(self, request):
        return False

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .annotate(line_count=Count("items"), unit_count=Sum("items__quantity"))
        )

    @admin.display(description="مهمان", boolean=True)
    def is_guest(self, obj):
        return obj.user_id is None

    @admin.display(description="تعداد قلم", ordering="line_count")
    def lines(self, obj):
        return to_persian_digits(obj.line_count)

    @admin.display(description="تعداد کل", ordering="unit_count")
    def units(self, obj):
        return to_persian_digits(obj.unit_count or 0)

    @admin.display(description="آخرین تغییر", ordering="updated_at")
    def jalali_updated_at(self, obj):
        local = timezone.localtime(obj.updated_at)
        return f"{to_jalali_str(local, persian_digits=True)} {local:%H:%M}"

    @admin.display(description="یادآوری", ordering="reminded_at")
    def jalali_reminded_at(self, obj):
        if obj.reminded_at is None:
            return "—"
        local = timezone.localtime(obj.reminded_at)
        return f"{to_jalali_str(local, persian_digits=True)} {local:%H:%M}"

    @admin.action(description="ارسال پیامک یادآوری سبد")
    def send_reminder(self, request, queryset):
        sent = send_reminders(force=True, carts=queryset.filter(user__isnull=False))
        skipped = queryset.count() - sent
        self.message_user(
            request,
            f"برای {to_persian_digits(sent)} سبد پیامک یادآوری فرستاده شد."
            + (
                f" {to_persian_digits(skipped)} سبد مهمان، خالی، ناموجود یا از قبل یادآوری‌شده "
                "بود (یا پیامک در «قالب پیامک‌ها» خاموش است)."
                if skipped
                else ""
            ),
        )
