from django.db import migrations

KEYS = ("edition_upgrade", "review_request")


def create_templates(apps, schema_editor):
    from apps.core.sms_catalog import KINDS

    SmsTemplate = apps.get_model("core", "SmsTemplate")
    for key in KEYS:
        SmsTemplate.objects.get_or_create(key=key, defaults={"body": KINDS[key].default})


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0003_sms_templates_abandoned_cart"),
        ("study", "0001_retention_models"),
    ]

    operations = [migrations.RunPython(create_templates, migrations.RunPython.noop)]
