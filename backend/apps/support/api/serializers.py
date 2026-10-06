from rest_framework import serializers

from ..models import SupportTicket, TicketMessage


class TicketCreateSerializer(serializers.Serializer):
    topic = serializers.CharField(max_length=20)
    subject = serializers.CharField(max_length=150, required=False, allow_blank=True)
    body = serializers.CharField(max_length=5000)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    order_number = serializers.CharField(max_length=40, required=False, allow_blank=True)
    book = serializers.CharField(max_length=300, required=False, allow_blank=True)
    source = serializers.CharField(max_length=40, required=False, allow_blank=True)


class TicketMessageSerializer(serializers.ModelSerializer):
    author_label = serializers.CharField(source="get_author_display", read_only=True)

    class Meta:
        model = TicketMessage
        fields = ["id", "author", "author_label", "body", "created_at"]
        read_only_fields = fields


class TicketSummarySerializer(serializers.ModelSerializer):
    topic_label = serializers.CharField(source="get_topic_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    order_number = serializers.CharField(source="order.number", default=None, read_only=True)
    book_title = serializers.CharField(source="book.title", default=None, read_only=True)

    class Meta:
        model = SupportTicket
        fields = [
            "tracking_code",
            "topic",
            "topic_label",
            "subject",
            "status",
            "status_label",
            "order_number",
            "book_title",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class TicketDetailSerializer(TicketSummarySerializer):
    messages = TicketMessageSerializer(many=True, read_only=True)

    class Meta(TicketSummarySerializer.Meta):
        fields = [*TicketSummarySerializer.Meta.fields, "messages"]
        read_only_fields = fields


class GuestLookupSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=32)
    tracking_code = serializers.CharField(max_length=32)


class ReplySerializer(serializers.Serializer):
    body = serializers.CharField(max_length=5000)
    # guests prove ownership with phone + tracking code (the code is in the URL)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
