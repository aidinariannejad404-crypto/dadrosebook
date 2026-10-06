from rest_framework import serializers

from apps.catalog.api.serializers import (
    BookCardWithVariantsSerializer,
    ExamEventSerializer,
    ExamTypeMiniSerializer,
)
from apps.orders.services import discounts

from ..models import Campaign, Gift
from ..services import campaigns as campaign_service
from ..services import gifts as gift_service


class CampaignSummarySerializer(serializers.ModelSerializer):
    hero_image = serializers.ImageField(read_only=True)
    state = serializers.SerializerMethodField()
    discount_label = serializers.SerializerMethodField()

    class Meta:
        model = Campaign
        fields = [
            "id",
            "title",
            "slug",
            "subtitle",
            "hero_image",
            "hero_color",
            "starts_at",
            "ends_at",
            "state",
            "discount_label",
        ]

    def get_state(self, obj: Campaign) -> str:
        return campaign_service.campaign_state(obj, self.context.get("now"))

    def get_discount_label(self, obj: Campaign) -> str | None:
        code = obj.discount_code
        if code is None or not code.is_active:
            return None
        return discounts.label_for(code)


class CampaignDetailSerializer(CampaignSummarySerializer):
    description = serializers.CharField()
    exam_event = ExamEventSerializer(read_only=True, allow_null=True)
    books = serializers.SerializerMethodField()
    min_order_total = serializers.SerializerMethodField()

    class Meta(CampaignSummarySerializer.Meta):
        fields = [
            *CampaignSummarySerializer.Meta.fields,
            "description",
            "exam_event",
            "min_order_total",
            "books",
        ]

    def get_min_order_total(self, obj: Campaign) -> int:
        return obj.discount_code.min_order_total if obj.discount_code_id else 0

    def get_books(self, obj: Campaign) -> list[dict]:
        books = campaign_service.eligible_books(obj)
        return BookCardWithVariantsSerializer(books, many=True, context=self.context).data


class KitShareCreateSerializer(serializers.Serializer):
    exam = serializers.CharField(max_length=160, required=False, allow_blank=True, allow_null=True)
    variant_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1), min_length=1, max_length=40
    )


def serialize_shared_kit(kit, context) -> dict:
    return {
        "token": kit.token,
        "exam": ExamTypeMiniSerializer(kit.exam).data if kit.exam else None,
        "items": [
            {
                "book": BookCardWithVariantsSerializer(book, context=context).data,
                "variant_id": kit.selected.get(book.pk),
            }
            for book in kit.books
        ],
    }


class GiftClaimSerializer(serializers.Serializer):
    address_id = serializers.IntegerField(required=False, allow_null=True)


def _cover(item, request):
    book = item.book
    if book is None or not book.cover:
        return None
    return request.build_absolute_uri(book.cover.url) if request else book.cover.url


def _subject_color(item):
    from apps.orders.services.quote import subject_color

    return subject_color(item.book) if item.book is not None else None


class GiftPublicSerializer(serializers.ModelSerializer):
    """What anyone holding the link may see: no buyer identity beyond the chosen sender name."""

    state = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()
    needs_address = serializers.SerializerMethodField()
    has_ebook = serializers.SerializerMethodField()
    claimed_by_me = serializers.SerializerMethodField()

    class Meta:
        model = Gift
        fields = [
            "token",
            "sender_name",
            "recipient_name",
            "message",
            "state",
            "expires_at",
            "claimed_at",
            "needs_address",
            "has_ebook",
            "claimed_by_me",
            "items",
        ]

    def get_state(self, obj: Gift) -> str:
        return gift_service.state(obj)

    def get_needs_address(self, obj: Gift) -> bool:
        return obj.order.needs_shipping

    def get_has_ebook(self, obj: Gift) -> bool:
        return any(i.grants_ebook for i in obj.order.items.all())

    def get_claimed_by_me(self, obj: Gift) -> bool:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and obj.claimed_by_id == user.pk)

    def get_items(self, obj: Gift) -> list[dict]:
        request = self.context.get("request")
        return [
            {
                "title": item.title,
                "book_slug": item.book.slug if item.book_id else None,
                "variant_type": item.variant_type,
                "quantity": item.quantity,
                "cover": _cover(item, request),
                "subject_color": _subject_color(item),
            }
            for item in obj.order.items.select_related("book").all()
        ]


class GiftOwnerSerializer(GiftPublicSerializer):
    """The buyer's view (order page / payment result): the claim URL to share."""

    claim_url = serializers.SerializerMethodField()
    order_number = serializers.CharField(source="order.number")

    class Meta(GiftPublicSerializer.Meta):
        fields = [*GiftPublicSerializer.Meta.fields, "claim_url", "order_number"]

    def get_claim_url(self, obj: Gift) -> str | None:
        if obj.status == Gift.Status.PENDING_PAYMENT:
            return None
        return gift_service.claim_url(obj)
