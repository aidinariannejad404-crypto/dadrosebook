import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.catalog.models import Subject
from apps.catalog.tests.conftest import bundle_variant, ebook_variant, make_book, print_variant
from apps.core.services.store_settings import get_store_settings
from apps.orders.models import Address, ShippingMethod


@pytest.fixture
def user(db):
    return User.objects.create_user(phone="09121234567")


@pytest.fixture
def other_user(db):
    return User.objects.create_user(phone="09351234567")


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def auth_api(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def no_free_shipping(db):
    s = get_store_settings()
    s.free_shipping_threshold = 0
    s.save()
    return s


@pytest.fixture
def methods(db, no_free_shipping):
    """The seeded methods (data migration), re-read so tests see their ids."""
    return {
        "post": ShippingMethod.objects.get(code="post"),
        "courier": ShippingMethod.objects.get(code="courier"),
    }


@pytest.fixture
def books(db):
    civil = Subject.objects.create(name="حقوق مدنی", color="#1F4E8C", order=0)
    commerce = Subject.objects.create(name="حقوق تجارت", color="#1E7A5A", order=2)
    civil_book = make_book(
        "حقوق مدنی دوجلدی",
        subjects=[commerce, civil],
        variants=[
            print_variant(2_200_000, 12, sale_price=2_000_000),
            ebook_variant(990_000),
            bundle_variant(2_750_000, 5),
        ],
    )
    commerce_book = make_book(
        "درسنامه تجارت",
        subtitle="ویرایش ۱۴۰۵",
        subjects=[commerce],
        variants=[print_variant(1_000_000, 3), ebook_variant(500_000)],
    )
    v = {f"civil_{x.type.lower()}": x for x in civil_book.variants.all()}
    v.update({f"commerce_{x.type.lower()}": x for x in commerce_book.variants.all()})
    return {
        "civil": civil,
        "commerce": commerce,
        "civil_book": civil_book,
        "commerce_book": commerce_book,
        **v,
    }


@pytest.fixture
def address(user):
    return Address.objects.create(
        user=user,
        recipient_name="علی رضایی",
        recipient_phone="09121234567",
        province="تهران",
        city="تهران",
        postal_code="1234567890",
        address_line="خیابان آزادی",
        is_default=True,
    )


@pytest.fixture
def shiraz_address(user):
    return Address.objects.create(
        user=user,
        recipient_name="علی رضایی",
        recipient_phone="09121234567",
        province="فارس",
        city="شیراز",
        postal_code="1234567890",
        address_line="خیابان زند",
    )
