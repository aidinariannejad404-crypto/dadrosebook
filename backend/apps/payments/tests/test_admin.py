import pytest
from django.urls import reverse

from apps.accounts.models import User
from apps.payments.services import payments as svc

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client(client):
    client.force_login(User.objects.create_superuser("09120000000", "admin-pass"))
    return client


def test_payment_admin(admin_client, fake_gateway, order):
    svc.start_payment(order)
    payment = order.payments.get()
    changelist = reverse("admin:payments_payment_changelist")
    response = admin_client.get(changelist, {"q": order.number})
    assert response.status_code == 200
    assert order.number in response.content.decode()
    assert admin_client.get(changelist, {"q": payment.authority}).status_code == 200
    change = admin_client.get(reverse("admin:payments_payment_change", args=[payment.pk]))
    assert change.status_code == 200
    assert "redirected" in change.content.decode()
    assert admin_client.get(reverse("admin:payments_payment_add")).status_code == 403
    delete = reverse("admin:payments_payment_delete", args=[payment.pk])
    assert admin_client.get(delete).status_code == 403
