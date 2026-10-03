from rest_framework import serializers

# Generous limits: over-long paths are accepted and then ignored by the services (204, no-op).
MAX_BEACON_LENGTH = 4000


class HitSerializer(serializers.Serializer):
    path = serializers.CharField(max_length=MAX_BEACON_LENGTH, trim_whitespace=True)


class NotFoundSerializer(serializers.Serializer):
    path = serializers.CharField(max_length=MAX_BEACON_LENGTH, trim_whitespace=True)
    referer = serializers.CharField(
        max_length=MAX_BEACON_LENGTH, required=False, allow_blank=True, allow_null=True
    )
