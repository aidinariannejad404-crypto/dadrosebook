import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import addresses as svc
from apps.accounts.services import tokens
from apps.orders.models import PROVINCES, Address

URL = "/api/v1/addresses/"

pytestmark = pytest.mark.django_db


def payload(**over):
    data = {
        "title": "خانه",
        "recipient_name": "علی رضایی",
        "recipient_phone": "۰۹۱۲ ۱۲۳ ۴۵۶۷",
        "province": "تهران",
        "city": "تهران",
        "postal_code": "۱۲۳۴۵-۶۷۸۹۰",
        "address_line": "خیابان انقلاب، پلاک ۱",
    }
    data.update(over)
    return data


def client_for(user):
    c = APIClient()
    c.cookies["dr_access"] = tokens.issue_pair(user)[0]
    return c


@pytest.fixture
def other(db):
    return User.objects.create_user("09120000000")


def test_anonymous_401(api):
    assert api.get(URL).status_code == 401
    assert api.post(URL, payload(), format="json").status_code == 401


def test_provinces_list(api):
    res = api.get(URL + "provinces/")
    assert res.status_code == 200
    assert res.json() == PROVINCES


def test_create_normalises_and_first_is_default(auth_api):
    res = auth_api.post(URL, payload(), format="json")
    assert res.status_code == 201, res.json()
    body = res.json()
    assert body["postal_code"] == "1234567890"
    assert body["recipient_phone"] == "09121234567"
    assert body["is_default"] is True
    assert body["is_tehran"] is True
    res = auth_api.post(URL, payload(province="فارس", city="شیراز"), format="json")
    assert res.json()["is_default"] is False
    assert res.json()["is_tehran"] is False


def test_create_with_default_unsets_others(auth_api, user):
    first = auth_api.post(URL, payload(), format="json").json()
    second = auth_api.post(URL, payload(is_default=True), format="json").json()
    assert second["is_default"] is True
    assert Address.objects.get(pk=first["id"]).is_default is False
    listing = auth_api.get(URL).json()
    assert [a["id"] for a in listing] == [second["id"], first["id"]]


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("postal_code", "12345"),
        ("postal_code", "12345678901"),
        ("postal_code", "abcdefghij"),
        ("recipient_phone", "0912"),
        ("province", "کالیفرنیا"),
        ("recipient_name", "  "),
        ("city", ""),
        ("address_line", ""),
    ],
)
def test_validation(auth_api, field, value):
    res = auth_api.post(URL, payload(**{field: value}), format="json")
    assert res.status_code == 400
    assert field in res.json()


def test_province_arabic_letters_accepted(auth_api):
    res = auth_api.post(URL, payload(province="كرمان"), format="json")  # Arabic kaf
    assert res.status_code == 201
    assert res.json()["province"] == "کرمان"


def test_max_addresses(auth_api, user):
    for _ in range(svc.MAX_ADDRESSES):
        assert auth_api.post(URL, payload(), format="json").status_code == 201
    res = auth_api.post(URL, payload(), format="json")
    assert res.status_code == 400
    assert "detail" in res.json()
    assert Address.objects.filter(user=user).count() == svc.MAX_ADDRESSES


def test_ownership(auth_api, other):
    foreign = svc.create_address(other, svc_data())
    url = f"{URL}{foreign.pk}/"
    assert auth_api.get(url).status_code == 404
    assert auth_api.patch(url, {"city": "x"}, format="json").status_code == 404
    assert auth_api.delete(url).status_code == 404
    assert auth_api.get(URL).json() == []
    assert Address.objects.filter(pk=foreign.pk).exists()
    mine = client_for(other).get(url)
    assert mine.status_code == 200 and mine.json()["id"] == foreign.pk


def test_retrieve_patch_delete(auth_api):
    created = auth_api.post(URL, payload(), format="json").json()
    url = f"{URL}{created['id']}/"
    assert auth_api.get(url).json()["city"] == "تهران"
    res = auth_api.patch(url, {"city": "ری", "postal_code": "۰۹۸۷۶۵۴۳۲۱"}, format="json")
    assert res.status_code == 200
    assert res.json()["city"] == "ری" and res.json()["postal_code"] == "0987654321"
    assert auth_api.patch(url, {"postal_code": "1"}, format="json").status_code == 400
    assert auth_api.delete(url).status_code == 204
    assert auth_api.get(url).status_code == 404


def test_patch_default_switches(auth_api):
    a = auth_api.post(URL, payload(), format="json").json()
    b = auth_api.post(URL, payload(), format="json").json()
    res = auth_api.patch(f"{URL}{b['id']}/", {"is_default": True}, format="json")
    assert res.json()["is_default"] is True
    assert Address.objects.get(pk=a["id"]).is_default is False
    # Unsetting the only default is ignored.
    res = auth_api.patch(f"{URL}{b['id']}/", {"is_default": False}, format="json")
    assert res.json()["is_default"] is True


def svc_data(**over):
    data = {
        "title": "",
        "recipient_name": "x",
        "recipient_phone": "09120000000",
        "province": "تهران",
        "city": "تهران",
        "postal_code": "1234567890",
        "address_line": "y",
    }
    data.update(over)
    return data


def test_delete_default_promotes_most_recent(user):
    a = svc.create_address(user, svc_data())
    b = svc.create_address(user, svc_data())
    c = svc.create_address(user, svc_data())
    assert a.is_default and not b.is_default
    svc.delete_address(a)
    c.refresh_from_db()
    b.refresh_from_db()
    assert c.is_default and not b.is_default
    svc.delete_address(b)  # not the default: nothing changes
    c.refresh_from_db()
    assert c.is_default
    svc.delete_address(c)
    assert not Address.objects.filter(user=user).exists()


def test_service_one_default_and_limit(user):
    for i in range(svc.MAX_ADDRESSES):
        svc.create_address(user, svc_data(is_default=i % 3 == 0))
    assert Address.objects.filter(user=user, is_default=True).count() == 1
    with pytest.raises(svc.AddressLimitReached):
        svc.create_address(user, svc_data())


def test_helpers():
    assert svc.normalize_postal_code(" ۱۲۳۴۵ ۶۷۸۹۰ ") == "1234567890"
    assert svc.canonical_province("سيستان و بلوچستان") == "سیستان و بلوچستان"
    assert svc.canonical_province("نیویورک") is None
