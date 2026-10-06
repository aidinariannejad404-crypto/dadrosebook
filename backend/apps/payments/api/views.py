"""Gateway callback (302 to the storefront result page) and the local fake-gateway page."""

from urllib.parse import urlencode

from django.conf import settings
from django.http import Http404, HttpResponse, HttpResponseRedirect
from django.utils.html import format_html
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.core.money import format_toman

from ..models import Payment
from ..services.payments import CALLBACK_PATH, PaymentNotFound, handle_callback

RESULT_STATUS = {"paid": "paid", "failed": "failed", "cancelled": "cancelled", "unknown": "pending"}


def _result_url(**params) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/checkout/result?{urlencode(params)}"


class ZarinpalCallbackView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        authority = request.query_params.get("Authority", "").strip()
        status_param = request.query_params.get("Status", "").strip()
        try:
            order, outcome = handle_callback(authority, status_param)
        except PaymentNotFound:
            return HttpResponseRedirect(_result_url(status="failed"))
        return HttpResponseRedirect(
            _result_url(order=order.number, status=RESULT_STATUS.get(outcome, "pending"))
        )


_FAKE_PAGE = """<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>درگاه پرداخت آزمایشی</title>
<style>
body{{margin:0;background:#F5F6F9;color:#10182B;font-family:Vazirmatn,Tahoma,sans-serif;
display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}}
main{{background:#fff;border-radius:16px;padding:24px;max-width:420px;width:100%;
box-shadow:0 4px 24px rgba(18,38,74,.08)}}
h1{{font-size:1.25rem;color:#12264A;margin:0 0 8px}}
p{{margin:8px 0;line-height:1.8}}
.note{{font-size:.875rem;color:#475569}}
.actions{{display:flex;flex-direction:column;gap:12px;margin-top:20px}}
a{{display:flex;align-items:center;justify-content:center;min-height:48px;border-radius:12px;
text-decoration:none;font-weight:700}}
a:focus-visible{{outline:3px solid #C8A24B;outline-offset:2px}}
.ok{{background:#12264A;color:#fff}}
.nok{{background:#fff;color:#12264A;border:2px solid #12264A}}
</style></head><body><main>
<h1>درگاه پرداخت آزمایشی</h1>
<p class="note">این صفحه فقط در محیط توسعه است و پولی جابه‌جا نمی‌شود.</p>
<p>سفارش: <strong dir="ltr">{number}</strong></p>
<p>مبلغ: <strong>{amount}</strong></p>
<div class="actions">
<a class="ok" href="{ok_url}">پرداخت موفق</a>
<a class="nok" href="{nok_url}">انصراف از پرداخت</a>
</div></main></body></html>"""


class FakeGatewayPageView(APIView):
    """``PAYMENT_GATEWAY=fake`` only: simulates the bank page."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, authority: str):
        if settings.PAYMENT_GATEWAY != "fake":
            raise Http404
        payment = (
            Payment.objects.select_related("order")
            .filter(authority=authority, gateway="fake")
            .first()
        )
        if payment is None:
            raise Http404
        base = settings.PUBLIC_API_URL.rstrip("/") + CALLBACK_PATH
        html = format_html(
            _FAKE_PAGE,
            number=payment.order.number,
            amount=format_toman(payment.order.total),
            ok_url=f"{base}?{urlencode({'Authority': authority, 'Status': 'OK'})}",
            nok_url=f"{base}?{urlencode({'Authority': authority, 'Status': 'NOK'})}",
        )
        return HttpResponse(html, content_type="text/html; charset=utf-8")
