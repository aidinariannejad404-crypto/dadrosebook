from django.db import migrations


def seed(apps, schema_editor):
    from apps.core.sms_catalog import KINDS, TICKET_REPLY

    SmsTemplate = apps.get_model("core", "SmsTemplate")
    SmsTemplate.objects.get_or_create(
        key=TICKET_REPLY, defaults={"body": KINDS[TICKET_REPLY].default}
    )


class Migration(migrations.Migration):
    dependencies = [
        ("support", "0001_support_tickets"),
        ("core", "0003_sms_templates_abandoned_cart"),
    ]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
