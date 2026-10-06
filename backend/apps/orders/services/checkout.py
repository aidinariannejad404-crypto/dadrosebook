"""Checkout: turn a re-priced quote into an order, then hand it to the payment gateway.

* ``create_order(user, data, checkout_key)`` — idempotent per ``checkout_key``.
* ``begin_payment(order)`` — free orders are paid at once (``None``); otherwise the gateway URL.
* ``checkout(user, data, checkout_key)`` — both, returns ``(order, payment_url)``.

Errors are ``CheckoutError(detail)`` where ``detail`` is the 400 response body.
"""

from django.db import IntegrityError, transaction

from ..models import Address, Order, OrderItem, OrderStatusLog
from . import quote as quote_service
from . import state


class CheckoutError(Exception):
    def __init__(self, detail: dict):
        super().__init__(detail)
        self.detail = detail


KEY_TAKEN = "این درخواست قبلاً ثبت شده است؛ صفحه را دوباره بارگذاری کنید."
ADDRESS_REQUIRED = "نشانی ارسال را انتخاب کنید."
ADDRESS_NOT_FOUND = "نشانی انتخاب‌شده پیدا نشد."
METHOD_REQUIRED = "روش ارسال را انتخاب کنید."
METHOD_NOT_ALLOWED = "این روش ارسال برای نشانی انتخاب‌شده در دسترس نیست."


def _existing(user, checkout_key):
    order = Order.objects.filter(checkout_key=checkout_key).first()
    if order is not None and order.user_id != user.pk:
        raise CheckoutError({"checkout_key": [KEY_TAKEN]})
    return order


def create_order(user, data: dict, checkout_key, *, build_url=None) -> Order:
    # growth (و۴): ``data["gift"]`` (sender_name, recipient_name, message) makes it a gift order:
    # no address now (the recipient enters it when claiming), only a shipping method.
    gift = data.get("gift")
    if checkout_key is not None:
        order = _existing(user, checkout_key)
        if order is not None:
            return order

    address_id = data.get("address_id")
    address = Address.objects.filter(pk=address_id, user=user).first() if address_id else None
    pricing = quote_service.compute(
        data.get("items") or [],
        user=user,
        address=address,
        shipping_method_id=data.get("shipping_method_id"),
        discount_code=data.get("discount_code"),
        build_url=build_url,
    )
    quote = pricing.quote
    if quote["problems"]:
        raise CheckoutError({"problems": quote["problems"]})
    if not quote["lines"]:
        raise CheckoutError({"items": ["سبد خرید خالی است."]})

    errors: dict[str, list[str]] = {}
    if quote["needs_shipping"] and gift is not None:  # growth (و۴)
        if not data.get("shipping_method_id"):
            errors["shipping_method_id"] = [METHOD_REQUIRED]
        elif pricing.shipping_method is None:
            errors["shipping_method_id"] = [METHOD_NOT_ALLOWED]
    elif quote["needs_shipping"]:
        if not address_id:
            errors["address_id"] = [ADDRESS_REQUIRED]
        elif address is None:
            errors["address_id"] = [ADDRESS_NOT_FOUND]
        if not data.get("shipping_method_id"):
            errors["shipping_method_id"] = [METHOD_REQUIRED]
        elif pricing.shipping_method is None and address is not None:
            errors["shipping_method_id"] = [METHOD_NOT_ALLOWED]
    if quote["discount_error"]:
        errors["discount_code"] = [quote["discount_error"]]
    if errors:
        raise CheckoutError(errors)

    discount = quote["discount"]
    method = pricing.shipping_method if quote["needs_shipping"] else None
    try:
        with transaction.atomic():
            order = Order.objects.create(
                user=user,
                checkout_key=checkout_key,
                status=Order.Status.PENDING_PAYMENT,
                items_total=quote["items_total"],
                discount_total=discount["amount"] if discount else 0,
                shipping_total=quote["shipping_total"],
                total=quote["total"],
                discount_code=pricing.discount_code,
                discount_code_text=discount["code"] if discount else "",
                needs_shipping=quote["needs_shipping"],
                shipping_method=method,
                shipping_method_name=method.name if method else "",
                shipping_address=(
                    address.snapshot() if quote["needs_shipping"] and gift is None else None
                ),
                customer_note=(data.get("customer_note") or "").strip()[:500],
            )
            OrderItem.objects.bulk_create(
                [
                    OrderItem(
                        order=order,
                        variant_id=line["variant_id"],
                        book_id=line["book_id"],
                        title=line["title"][:300],
                        variant_type=line["variant_type"],
                        list_price=line["list_price"],
                        unit_price=line["unit_price"],
                        quantity=line["quantity"],
                        line_total=line["line_total"],
                    )
                    for line in quote["lines"]
                ]
            )
            OrderStatusLog.objects.create(
                order=order, from_status="", to_status=Order.Status.PENDING_PAYMENT
            )
            if gift is not None:  # growth (و۴)
                from apps.growth.services.gifts import attach_gift

                attach_gift(order, gift)
    except IntegrityError:
        # A concurrent request with the same checkout_key won the race.
        order = _existing(user, checkout_key) if checkout_key is not None else None
        if order is None:
            raise
    return order


def begin_payment(order: Order) -> str | None:
    """``None`` for free (now paid) or no-longer-payable orders, else the gateway redirect URL.

    Raises ``apps.payments.services.gateway.GatewayError`` when the gateway refuses.
    """
    if order.status != Order.Status.PENDING_PAYMENT:
        return None
    if order.total == 0:
        state.mark_paid(order, note="سفارش رایگان")
        return None
    from apps.payments.services.payments import start_payment

    return start_payment(order)


def checkout(user, data: dict, checkout_key, *, build_url=None) -> tuple[Order, str | None]:
    order = create_order(user, data, checkout_key, build_url=build_url)
    return order, begin_payment(order)


def stock_problems(order: Order) -> list[dict]:
    """Re-check an unpaid order's lines before a payment retry (same codes as the quote)."""
    from apps.catalog.models import BookVariant

    problems = []
    items = list(order.items.all())
    variants = BookVariant.objects.select_related("book").in_bulk(
        [i.variant_id for i in items if i.variant_id]
    )
    for item in items:
        variant = variants.get(item.variant_id)
        if variant is None:
            problems.append(
                {
                    "variant_id": item.variant_id,
                    "code": "inactive",
                    "message": quote_service.PROBLEM_MESSAGES["inactive"],
                }
            )
            continue
        problem = quote_service.variant_problem(variant, item.quantity)
        if problem:
            problems.append(problem)
    return problems
