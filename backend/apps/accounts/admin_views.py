"""``/admin/2fa/``: the staff second login step (see ``services/staff_2fa.py``)."""

from urllib.parse import urlencode

from django import forms
from django.conf import settings
from django.contrib import admin, messages
from django.http import HttpResponseRedirect
from django.shortcuts import render
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect
from unfold.widgets import UnfoldAdminTextInputWidget

from .admin_security import client_ip
from .services import staff_2fa


class Staff2faForm(forms.Form):
    code = forms.CharField(
        label="کد تأیید",
        max_length=32,
        widget=UnfoldAdminTextInputWidget(
            attrs={
                "autocomplete": "one-time-code",
                "inputmode": "numeric",
                "autofocus": True,
                "dir": "ltr",
                "class": "dr-otp-input",
            }
        ),
    )


def _safe_next(request, value: str | None) -> str:
    if value and url_has_allowed_host_and_scheme(
        value, allowed_hosts={request.get_host()}, require_https=request.is_secure()
    ):
        return value
    return reverse("admin:index")


def _to_persian_digits(value: int | str) -> str:
    return str(value).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def _mask_phone(phone: str) -> str:
    # 0912***4567: enough to recognise one's own number, without showing it in full.
    return f"{phone[:4]}***{phone[-4:]}" if len(phone) >= 8 else phone


def _send(request, user, *, explicit: bool) -> None:
    try:
        staff_2fa.send_code(user, ip=client_ip(request))
    except staff_2fa.Staff2faThrottled as exc:
        if explicit:
            wait = _to_persian_digits(exc.retry_after)
            messages.warning(request, staff_2fa.MSG_THROTTLED.format(seconds=wait))
    else:
        if explicit:
            messages.success(request, "کد جدید پیامک شد.")


@never_cache
@csrf_protect
def staff_2fa_view(request):
    user = request.user
    if not (user.is_authenticated and user.is_active and user.is_staff):
        query = urlencode({"next": request.get_full_path()})
        return HttpResponseRedirect(f"{reverse('admin:login')}?{query}")

    next_url = _safe_next(request, request.POST.get("next") or request.GET.get("next"))
    if staff_2fa.is_verified(request.session, user):
        return HttpResponseRedirect(next_url)

    form = Staff2faForm()
    if request.method == "POST" and request.POST.get("action") == "resend":
        _send(request, user, explicit=True)
        query = urlencode({"next": next_url})
        return HttpResponseRedirect(f"{reverse('staff-2fa')}?{query}")
    if request.method == "POST":
        form = Staff2faForm(request.POST)
        if form.is_valid():
            try:
                staff_2fa.verify_code(user, form.cleaned_data["code"], ip=client_ip(request))
            except staff_2fa.Staff2faError as exc:
                form.add_error("code", exc.message)
            else:
                request.session.cycle_key()
                staff_2fa.mark_verified(request.session, user)
                return HttpResponseRedirect(next_url)
    elif not staff_2fa.has_active_code(user):
        _send(request, user, explicit=False)

    context = {
        **admin.site.each_context(request),
        "title": "تأیید دومرحله‌ای",
        "form": form,
        "next": next_url,
        "masked_phone": _to_persian_digits(_mask_phone(user.phone)),
        "code_length": _to_persian_digits(settings.STAFF_2FA_CODE_LENGTH),
        "ttl_minutes": _to_persian_digits(settings.STAFF_2FA_TTL_SECONDS // 60),
        "resend_wait": staff_2fa.resend_wait(user),
    }
    return render(request, "admin/staff_2fa.html", context)
