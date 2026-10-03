from django.db import migrations

METHODS = [
    {
        "code": "post",
        "name": "پست پیشتاز",
        "base_price": 45000,
        "eta_note": "۳ تا ۵ روز کاری",
        "tehran_only": False,
        "order": 0,
    },
    {
        "code": "courier",
        "name": "پیک تهران",
        "base_price": 65000,
        "eta_note": "ارسال همان روز یا فردا",
        "tehran_only": True,
        "order": 1,
    },
]


def seed(apps, schema_editor):
    ShippingMethod = apps.get_model("orders", "ShippingMethod")
    for spec in METHODS:
        code = spec["code"]
        defaults = {k: v for k, v in spec.items() if k != "code"}
        ShippingMethod.objects.get_or_create(code=code, defaults=defaults)


class Migration(migrations.Migration):
    dependencies = [("orders", "0001_initial")]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
