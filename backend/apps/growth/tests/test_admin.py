import pytest

from apps.accounts.models import User


@pytest.mark.parametrize(
    "url",
    [
        "/admin/growth/campaign/",
        "/admin/growth/campaign/add/",
        "/admin/growth/gift/",
        "/admin/growth/kitshare/",
        "/admin/growth/partner/add/",
    ],
)
def test_admin_pages(client, db, url):
    client.force_login(User.objects.create_superuser("09120000000", "pass"))
    assert client.get(url).status_code == 200
