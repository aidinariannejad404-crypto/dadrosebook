from rest_framework import serializers

from .models import StoreSettings


class StoreSettingsSerializer(serializers.ModelSerializer):
    free_shipping_threshold = serializers.SerializerMethodField()

    class Meta:
        model = StoreSettings
        fields = [
            "free_shipping_threshold",
            "print_dispatch_note",
            "delivery_tehran_note",
            "delivery_province_note",
            "consult_whatsapp",
            "consult_telegram",
            "support_hours",
            "enamad_html",
            "students_count_claim",
        ]

    def get_free_shipping_threshold(self, obj: StoreSettings) -> int | None:
        return obj.free_shipping_threshold or None
