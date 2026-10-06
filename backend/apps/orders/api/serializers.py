from rest_framework import serializers

from apps.catalog.models import BookVariant

from ..models import Order
from ..services import quote as quote_service
from ..services import state

VARIANT_LABELS = dict(BookVariant.Type.choices)
DIGITAL_TYPES = ("EBOOK", "BUNDLE")


class CheckoutItemSerializer(serializers.Serializer):
    variant_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(
        min_value=1,
        max_value=quote_service.MAX_QUANTITY,
        default=1,
        error_messages={
            "min_value": "تعداد باید دست‌کم ۱ باشد.",
            "max_value": "از هر کتاب حداکثر ۲۰ عدد می‌توان سفارش داد.",
        },
    )


class QuoteRequestSerializer(serializers.Serializer):
    items = CheckoutItemSerializer(
        many=True,
        min_length=1,
        max_length=quote_service.MAX_LINES,
        error_messages={
            "min_length": "سبد خرید خالی است.",
            "max_length": "حداکثر ۳۰ قلم کالا در یک سفارش مجاز است.",
            "empty": "سبد خرید خالی است.",
        },
        allow_empty=False,
    )
    address_id = serializers.IntegerField(required=False, allow_null=True)
    province = serializers.CharField(required=False, allow_blank=True, max_length=50)
    shipping_method_id = serializers.IntegerField(required=False, allow_null=True)
    discount_code = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=40
    )
    customer_note = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=500,
        error_messages={"max_length": "یادداشت حداکثر ۵۰۰ نویسه است."},
    )


# --- growth (و۴): gift orders ---
class GiftRequestSerializer(serializers.Serializer):
    sender_name = serializers.CharField(max_length=80, allow_blank=True, required=False)
    recipient_name = serializers.CharField(max_length=80, allow_blank=True, required=False)
    message = serializers.CharField(
        max_length=300,
        allow_blank=True,
        required=False,
        error_messages={"max_length": "پیام هدیه حداکثر ۳۰۰ نویسه است."},
    )


# --- end growth ---


class CheckoutRequestSerializer(QuoteRequestSerializer):
    checkout_key = serializers.UUIDField(
        error_messages={
            "required": "کلید تسویه لازم است.",
            "invalid": "کلید تسویه معتبر نیست.",
        }
    )
    gift = GiftRequestSerializer(required=False, allow_null=True)  # growth (و۴)


def _build_url(context):
    request = context.get("request")
    return request.build_absolute_uri if request is not None else None


def _cover(book, context):
    if book is None:
        return None
    return quote_service.cover_url(book, _build_url(context))


def _color(book):
    return quote_service.subject_color(book) if book is not None else None


class OrderSummarySerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    items_count = serializers.SerializerMethodField()
    covers = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = (
            "number",
            "status",
            "status_label",
            "total",
            "created_at",
            "paid_at",
            "items_count",
            "covers",
        )

    def get_items_count(self, order) -> int:
        return sum(item.quantity for item in order.items.all())

    def get_covers(self, order) -> list[dict]:
        return [
            {
                "title": item.title,
                "cover": _cover(item.book, self.context),
                "subject_color": _color(item.book),
            }
            for item in list(order.items.all())[:3]
        ]


class OrderDetailSerializer(OrderSummarySerializer):
    items = serializers.SerializerMethodField()
    timeline = serializers.SerializerMethodField()
    payment = serializers.SerializerMethodField()
    can_pay = serializers.SerializerMethodField()
    delivery_estimate = serializers.SerializerMethodField()
    discount_code = serializers.CharField(source="discount_code_text", read_only=True)

    class Meta(OrderSummarySerializer.Meta):
        fields = (
            *OrderSummarySerializer.Meta.fields,
            "items",
            "items_total",
            "discount_total",
            "discount_code",
            "shipping_total",
            "needs_shipping",
            "shipping_method_name",
            "shipping_address",
            "tracking_code",
            "customer_note",
            "timeline",
            "payment",
            "can_pay",
            "delivery_estimate",
        )

    def get_items(self, order) -> list[dict]:
        from apps.library.services.entitlements import has_entitlement

        result = []
        for item in order.items.all():
            book = item.book
            can_read = bool(
                book is not None
                and item.variant_type in DIGITAL_TYPES
                and has_entitlement(order.user, book)
            )
            result.append(
                {
                    "title": item.title,
                    "book_slug": book.slug if book is not None else None,
                    "variant_type": item.variant_type,
                    "variant_type_label": VARIANT_LABELS.get(item.variant_type, item.variant_type),
                    "quantity": item.quantity,
                    "list_price": item.list_price,
                    "unit_price": item.unit_price,
                    "line_total": item.line_total,
                    "cover": _cover(book, self.context),
                    "subject_color": _color(book),
                    "can_read": can_read,
                }
            )
        return result

    def get_timeline(self, order) -> list[dict]:
        return [
            {
                "status": log.to_status,
                "label": Order.Status(log.to_status).label
                if log.to_status in Order.Status.values
                else log.to_status,
                "at": serializers.DateTimeField().to_representation(log.created_at),
            }
            for log in order.status_logs.all()
        ]

    def get_payment(self, order) -> dict | None:
        payments = sorted(order.payments.all(), key=lambda p: (p.created_at, p.pk), reverse=True)
        if not payments:
            return None
        latest = payments[0]
        return {
            "status": latest.status,
            "ref_id": latest.ref_id,
            "card_pan": latest.card_pan,
            "gateway": latest.gateway,
        }

    def get_can_pay(self, order) -> bool:
        return state.can_pay(order)

    def get_delivery_estimate(self, order) -> dict | None:
        """د۲ (impl/trust): the delivery window promised for a paid, not yet delivered order."""
        from ..services.delivery import order_estimate

        if not order.is_paid:
            return None
        estimate = order_estimate(order)
        return estimate.as_dict() if estimate else None
