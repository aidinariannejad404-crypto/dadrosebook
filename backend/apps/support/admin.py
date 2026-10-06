from django import forms
from django.contrib import admin, messages
from django.utils import timezone
from unfold.admin import ModelAdmin, TabularInline

from apps.core.jalali import to_jalali_str

from .models import SupportTicket, TicketMessage
from .services import tickets


def _jalali(value):
    if value is None:
        return "—"
    local = timezone.localtime(value)
    return f"{to_jalali_str(local, persian_digits=True)} {local:%H:%M}"


class TicketMessageInline(TabularInline):
    model = TicketMessage
    extra = 0
    can_delete = False
    fields = ("author", "body", "staff_user", "created_jalali")
    readonly_fields = fields
    verbose_name_plural = "گفتگو"

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    @admin.display(description="زمان")
    def created_jalali(self, obj):
        return _jalali(obj.created_at)


class SupportTicketForm(forms.ModelForm):
    reply = forms.CharField(
        label="پاسخ به مشتری",
        required=False,
        widget=forms.Textarea(attrs={"rows": 5}),
        help_text="با ذخیره، پاسخ برای مشتری پیامک می‌شود و در «پیام‌های من» هم می‌آید.",
    )
    close_after_reply = forms.BooleanField(label="پس از پاسخ، درخواست بسته شود", required=False)

    class Meta:
        model = SupportTicket
        fields = ("status",)


@admin.register(SupportTicket)
class SupportTicketAdmin(ModelAdmin):
    form = SupportTicketForm
    inlines = (TicketMessageInline,)
    list_display = (
        "tracking_code",
        "subject",
        "topic",
        "status",
        "phone",
        "created_jalali",
        "waiting_since",
    )
    list_filter = ("status", "topic", "created_at")
    search_fields = ("tracking_code", "phone", "subject", "name", "order__number")
    list_select_related = ("order", "book", "user")
    date_hierarchy = "created_at"
    actions = ("close_tickets",)
    readonly_fields = (
        "tracking_code",
        "user",
        "phone",
        "name",
        "topic",
        "subject",
        "order",
        "book",
        "source",
        "created_jalali",
        "last_customer_jalali",
        "last_staff_jalali",
    )
    fieldsets = (
        (
            "درخواست",
            {
                "fields": (
                    "tracking_code",
                    "status",
                    "topic",
                    "subject",
                    ("phone", "name"),
                    "user",
                    ("order", "book"),
                    "source",
                    ("created_jalali", "last_customer_jalali", "last_staff_jalali"),
                )
            },
        ),
        ("پاسخ", {"fields": ("reply", "close_after_reply")}),
    )

    def has_add_permission(self, request):
        return False  # customers open tickets on the site

    @admin.display(description="ثبت", ordering="created_at")
    def created_jalali(self, obj):
        return _jalali(obj.created_at)

    @admin.display(description="آخرین پیام مشتری")
    def last_customer_jalali(self, obj):
        return _jalali(obj.last_customer_at)

    @admin.display(description="آخرین پاسخ پشتیبانی")
    def last_staff_jalali(self, obj):
        return _jalali(obj.last_staff_at)

    @admin.display(description="در انتظار از")
    def waiting_since(self, obj):
        if obj.status != SupportTicket.Status.OPEN:
            return "—"
        return _jalali(obj.last_customer_at)

    def save_model(self, request, obj, form, change):
        reply = (form.cleaned_data.get("reply") or "").strip()
        if reply:
            tickets.staff_reply(
                obj,
                reply,
                staff_user=request.user,
                close=bool(form.cleaned_data.get("close_after_reply")),
            )
            messages.success(request, "پاسخ ثبت و برای مشتری پیامک شد.")
            return
        if "status" in form.changed_data:
            tickets.set_status(obj, obj.status)
            return
        super().save_model(request, obj, form, change)

    @admin.action(description="بستن درخواست‌های انتخاب‌شده")
    def close_tickets(self, request, queryset):
        n = 0
        for ticket in queryset.exclude(status=SupportTicket.Status.CLOSED):
            tickets.set_status(ticket, SupportTicket.Status.CLOSED)
            n += 1
        self.message_user(request, f"{n} درخواست بسته شد.")
