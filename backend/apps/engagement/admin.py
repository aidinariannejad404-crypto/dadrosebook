from django.contrib import admin
from django.db.models import Count, IntegerField, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce
from django.utils import timezone
from unfold.admin import ModelAdmin

from apps.accounts.phone import normalize_phone
from apps.core.jalali import to_jalali_str
from apps.core.money import to_persian_digits

from .models import BackInStockRequest
from .services import notify_requests


def _jalali(value):
    if value is None:
        return "—"
    local = timezone.localtime(value)
    return f"{to_jalali_str(local, persian_digits=True)} {local:%H:%M}"


@admin.register(BackInStockRequest)
class BackInStockRequestAdmin(ModelAdmin):
    list_display = (
        "phone",
        "book_title",
        "variant_type",
        "status",
        "source",
        "variant_pending",
        "variant_stock",
        "jalali_created_at",
        "jalali_notified_at",
    )
    list_filter = ("status", "source", "variant__type", "created_at")
    search_fields = ("phone", "variant__book__title")
    list_select_related = ("variant__book", "user")
    readonly_fields = (
        "variant",
        "phone",
        "user",
        "source",
        "notified_at",
        "converted_at",
        "created_at",
        "updated_at",
    )
    fields = (
        "variant",
        "phone",
        "user",
        "source",
        "status",
        "notified_at",
        "converted_at",
        "created_at",
        "updated_at",
    )
    actions = ("notify_now",)
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False

    def get_queryset(self, request):
        pending = (
            BackInStockRequest.objects.filter(
                variant_id=OuterRef("variant_id"), status=BackInStockRequest.Status.PENDING
            )
            .order_by()
            .values("variant_id")
            .annotate(n=Count("id"))
            .values("n")
        )
        return (
            super()
            .get_queryset(request)
            .annotate(
                pending_for_variant=Coalesce(Subquery(pending, output_field=IntegerField()), 0)
            )
        )

    def get_search_results(self, request, queryset, search_term):
        """Phone search accepts Persian digits, spaces and +98; otherwise search by book title."""
        term = search_term.strip()
        if not term:
            return queryset, False
        digits = normalize_phone(term)
        q = Q(variant__book__title__icontains=term)
        if digits:
            q |= Q(phone__contains=digits)
        return queryset.filter(q), False

    @admin.display(description="کتاب", ordering="variant__book__title")
    def book_title(self, obj):
        return obj.variant.book.title

    @admin.display(description="نوع نسخه", ordering="variant__type")
    def variant_type(self, obj):
        return obj.variant.get_type_display()

    @admin.display(description="در انتظارِ این نسخه", ordering="pending_for_variant")
    def variant_pending(self, obj):
        return to_persian_digits(obj.pending_for_variant)

    @admin.display(description="موجودی فعلی", ordering="variant__stock")
    def variant_stock(self, obj):
        return to_persian_digits(obj.variant.stock)

    @admin.display(description="تاریخ ثبت", ordering="created_at")
    def jalali_created_at(self, obj):
        return _jalali(obj.created_at)

    @admin.display(description="زمان اطلاع‌رسانی", ordering="notified_at")
    def jalali_notified_at(self, obj):
        return _jalali(obj.notified_at)

    @admin.action(description="اطلاع‌رسانی اکنون")
    def notify_now(self, request, queryset):
        ids = list(queryset.values_list("pk", flat=True))
        sent = notify_requests(BackInStockRequest.objects.filter(pk__in=ids))
        self.message_user(request, f"{to_persian_digits(sent)} پیامک ارسال شد.")
