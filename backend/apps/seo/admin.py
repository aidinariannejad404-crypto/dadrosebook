from urllib.parse import urlencode

from django import forms
from django.contrib import admin, messages
from django.core.exceptions import ValidationError
from django.shortcuts import render
from django.urls import reverse
from django.utils import timezone
from django.utils.html import format_html
from unfold.admin import ModelAdmin
from unfold.decorators import action

from apps.core.jalali import to_jalali_str
from apps.core.money import format_number, to_persian_digits

from .models import NotFoundHit, Redirect
from .services.csv_import import import_csv
from .services.redirects import invalidate_redirect_map

MAX_CSV_BYTES = 5 * 1024 * 1024


def _jalali(value):
    if not value:
        return "—"
    local = timezone.localtime(value)
    return f"{to_jalali_str(local, persian_digits=True)} {to_persian_digits(f'{local:%H:%M}')}"


class RedirectCsvForm(forms.Form):
    file = forms.FileField(
        label="فایل CSV",
        help_text="هر سطر: نشانی قدیمی، نشانی جدید و (اختیاری) کد ۳۰۱ یا ۳۰۲. "
        "سطر عنوان اختیاری است. ریدایرکت‌های موجود با همان نشانی قدیمی به‌روز می‌شوند.",
        widget=forms.ClearableFileInput(attrs={"accept": ".csv,text/csv"}),
    )

    def clean_file(self):
        upload = self.cleaned_data["file"]
        if upload.size > MAX_CSV_BYTES:
            raise forms.ValidationError("حجم فایل بیش از ۵ مگابایت است.")
        return upload


class RedirectAdminForm(forms.ModelForm):
    class Meta:
        model = Redirect
        fields = ("old_path", "new_path", "status_code", "is_active", "note", "source")


@admin.register(Redirect)
class RedirectAdmin(ModelAdmin):
    form = RedirectAdminForm
    list_display = (
        "old_path",
        "new_path",
        "status_code",
        "is_active",
        "hits",
        "jalali_last_hit",
        "source",
    )
    list_filter = ("is_active", "status_code", "source")
    list_editable = ("is_active",)
    search_fields = ("old_path", "new_path", "note")
    readonly_fields = ("hit_count", "jalali_last_hit", "old_path_key")
    actions = ("activate", "deactivate")
    actions_list = ("import_csv",)
    list_per_page = 50

    def get_fieldsets(self, request, obj=None):
        main = ("old_path", "new_path", "status_code", "is_active", "note")
        stats = ("source", "hit_count", "jalali_last_hit", "old_path_key")
        return (
            (None, {"fields": main}),
            ("آمار", {"fields": stats if obj else ("source",)}),
        )

    def get_readonly_fields(self, request, obj=None):
        fields = tuple(self.readonly_fields)
        return (*fields, "source") if obj else fields

    def get_changeform_initial_data(self, request):
        """Supports ``?old_path=…&source=NOT_FOUND`` from the 404 list."""
        initial = super().get_changeform_initial_data(request)
        source = request.GET.get("source")
        initial["source"] = source if source in Redirect.Source.values else Redirect.Source.ADMIN
        return initial

    @admin.display(description="بازدید", ordering="hit_count")
    def hits(self, obj):
        return format_number(obj.hit_count)

    @admin.display(description="آخرین بازدید", ordering="last_hit_at")
    def jalali_last_hit(self, obj):
        return _jalali(obj.last_hit_at)

    @admin.action(description="فعال کردن")
    def activate(self, request, queryset):
        count = 0
        for redirect in queryset.filter(is_active=False):
            redirect.is_active = True
            try:
                redirect.full_clean()
            except ValidationError as exc:
                messages.error(request, f"{redirect}: {' '.join(exc.messages)}")
                continue
            redirect.save()
            count += 1
        messages.success(request, f"{to_persian_digits(count)} ریدایرکت فعال شد.")

    @admin.action(description="غیرفعال کردن")
    def deactivate(self, request, queryset):
        count = queryset.update(is_active=False)
        invalidate_redirect_map()  # .update() skips the post_save signal
        messages.success(request, f"{to_persian_digits(count)} ریدایرکت غیرفعال شد.")

    @action(description="درون‌ریزی CSV", url_path="import-csv", icon="upload_file")
    def import_csv(self, request):
        report = None
        if request.method == "POST":
            form = RedirectCsvForm(request.POST, request.FILES)
            if form.is_valid():
                report = import_csv(form.cleaned_data["file"].read())
                messages.success(
                    request,
                    f"ساخته شد: {to_persian_digits(report.created)}، "
                    f"به‌روز شد: {to_persian_digits(report.updated)}، "
                    f"بدون تغییر: {to_persian_digits(report.skipped)}، "
                    f"خطا: {to_persian_digits(len(report.errors))}",
                )
                form = RedirectCsvForm()
        else:
            form = RedirectCsvForm()
        context = {
            **self.admin_site.each_context(request),
            "title": "درون‌ریزی ریدایرکت‌ها از CSV",
            "opts": self.model._meta,
            "form": form,
            "report": report,
            "changelist_url": reverse("admin:seo_redirect_changelist"),
        }
        return render(request, "admin/seo/redirect/import_csv.html", context)


@admin.register(NotFoundHit)
class NotFoundHitAdmin(ModelAdmin):
    list_display = (
        "path",
        "hits_display",
        "jalali_last_seen",
        "jalali_first_seen",
        "last_referer",
        "resolved",
        "create_redirect",
    )
    list_filter = ("resolved",)
    search_fields = ("path", "last_referer")
    readonly_fields = ("path", "hits", "first_seen", "last_seen", "last_referer")
    fields = ("path", "hits", "first_seen", "last_seen", "last_referer", "resolved")
    ordering = ("-hits", "-last_seen")
    actions = ("mark_resolved", "mark_unresolved")
    list_per_page = 50

    def has_add_permission(self, request):
        return False

    @admin.display(description="تعداد", ordering="hits")
    def hits_display(self, obj):
        return format_number(obj.hits)

    @admin.display(description="آخرین بار", ordering="last_seen")
    def jalali_last_seen(self, obj):
        return _jalali(obj.last_seen)

    @admin.display(description="اولین بار", ordering="first_seen")
    def jalali_first_seen(self, obj):
        return _jalali(obj.first_seen)

    @admin.display(description="ریدایرکت")
    def create_redirect(self, obj):
        query = urlencode({"old_path": obj.path, "source": Redirect.Source.NOT_FOUND})
        url = f"{reverse('admin:seo_redirect_add')}?{query}"
        return format_html('<a href="{}" class="text-primary-600 underline">ساخت ریدایرکت</a>', url)

    @admin.action(description="علامت «رسیدگی شد»")
    def mark_resolved(self, request, queryset):
        count = queryset.update(resolved=True)
        messages.success(request, f"{to_persian_digits(count)} مورد رسیدگی‌شده علامت خورد.")

    @admin.action(description="برگرداندن به فهرست رسیدگی‌نشده")
    def mark_unresolved(self, request, queryset):
        count = queryset.update(resolved=False)
        messages.success(request, f"{to_persian_digits(count)} مورد برگردانده شد.")
