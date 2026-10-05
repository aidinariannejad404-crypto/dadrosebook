"""The SMS messages the store sends, their placeholders and default texts.

Texts are edited in the admin («قالب پیامک‌ها», ``core.SmsTemplate``); these defaults are used
until a row exists. Placeholders use ``{name}`` syntax.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class SmsKind:
    key: str
    label: str
    placeholders: dict[str, str]  # name → Persian description
    default: str
    marketing: bool = False  # promotional (needs the customer's consent) vs. service message


ORDER_PAID = "order_paid"
ORDER_SHIPPED = "order_shipped"
BACK_IN_STOCK = "back_in_stock"
ABANDONED_CART = "abandoned_cart"
REFUND_DONE = "refund_done"
# --- ux stream: login code (WebOTP line is appended in code, never editable) ---
OTP_LOGIN = "otp_login"

KINDS: dict[str, SmsKind] = {
    k.key: k
    for k in (
        SmsKind(
            ORDER_PAID,
            "پرداخت موفق سفارش",
            {"order": "شماره سفارش", "total": "مبلغ پرداختی"},
            "سفارش {order} با موفقیت پرداخت شد.\nدادرُز",
        ),
        SmsKind(
            ORDER_SHIPPED,
            "ارسال سفارش",
            {"order": "شماره سفارش", "tracking": "کد رهگیری مرسوله"},
            "سفارش {order} ارسال شد. کد رهگیری مرسوله: {tracking}\nدادرُز",
        ),
        SmsKind(
            BACK_IN_STOCK,
            "موجود شد خبرم کن",
            {"book": "نام کتاب", "format": "نوع نسخه", "link": "لینک خرید"},
            "دادرُز: «{book}» ({format}) موجود شد. برای خرید: {link}",
        ),
        SmsKind(
            ABANDONED_CART,
            "یادآوری سبد خرید رهاشده",
            {
                "book": "نام اولین کتاب سبد",
                "count": "تعداد کتاب‌های سبد",
                "link": "لینک سبد",
                "code": "کد تخفیف یادآوری (اگر تعیین شده)",
            },
            "دادرُز: «{book}» هنوز در سبد خرید شماست. برای تکمیل خرید: {link}\nلغو۱۱",
            marketing=True,
        ),
        SmsKind(
            REFUND_DONE,
            "استرداد وجه",
            {"order": "شماره سفارش", "amount": "مبلغ بازگشتی", "reference": "شماره پیگیری"},
            "مبلغ {amount} بابت سفارش {order} به شما بازگردانده شد. شماره پیگیری: {reference}"
            "\nدادرُز",
        ),
        # --- ux stream ---
        SmsKind(
            OTP_LOGIN,
            "کد ورود",
            {"code": "کد یک‌بارمصرف"},
            "کد ورود شما به دادرُز: {code}",
        ),
    )
}
