from django.apps import AppConfig


class EngagementConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.engagement"
    label = "engagement"
    verbose_name = "اطلاع‌رسانی موجودی"

    def ready(self) -> None:
        from . import signals  # noqa: F401
