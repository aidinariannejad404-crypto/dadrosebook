from django.apps import AppConfig


class BackofficeConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.backoffice"
    verbose_name = "پیشخوان و گزارش‌ها"

    def ready(self):
        from django.db.models.signals import post_migrate

        from .services.roles import sync_staff_roles

        post_migrate.connect(sync_staff_roles, sender=self)
