import pytest

from apps.accounts.models import OtpCode, User
from apps.accounts.services import otp


@pytest.mark.django_db
def test_otp_admin_is_read_only_and_hides_code(client, sent_codes):
    admin = User.objects.create_superuser("09120000000", "pass")
    client.force_login(admin)
    otp.request_code("09121234567")
    row = OtpCode.objects.get()
    res = client.get("/admin/accounts/otpcode/?q=۰۹۱۲۱۲۳۴۵۶۷")
    assert res.status_code == 200
    content = res.content.decode()
    assert "09121234567" in content
    assert row.code_hash not in content
    detail = client.get(f"/admin/accounts/otpcode/{row.pk}/change/").content.decode()
    assert row.code_hash not in detail
    assert client.get("/admin/accounts/otpcode/add/").status_code == 403


@pytest.mark.django_db
def test_user_admin_with_address_inline(client):
    admin = User.objects.create_superuser("09120000000", "pass")
    client.force_login(admin)
    assert client.get(f"/admin/accounts/user/{admin.pk}/change/").status_code == 200
