from django.apps import AppConfig


class StudyConfig(AppConfig):
    """Retention: reading minutes, goal and streak, the living study plan, edition upgrades and
    review prompts (UX research items ه۲، ه۳، ه۴، ه۵، ه۷)."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.study"
    label = "study"
    verbose_name = "مطالعه و نگهداشت"
