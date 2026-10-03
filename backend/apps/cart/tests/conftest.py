import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.catalog.models import BookVariant
from apps.catalog.tests.conftest import bundle_variant, ebook_variant, make_book, print_variant


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(phone="09121234567")


@pytest.fixture
def books(db):
    civil = make_book(
        "حقوق مدنی",
        variants=[
            print_variant(2_200_000, 12, sale_price=2_000_000),
            ebook_variant(990_000),
            bundle_variant(2_750_000, 5),
        ],
    )
    low = make_book("آیین دادرسی", variants=[print_variant(500_000, 3)])
    sold_out = make_book("کتاب ناموجود", variants=[print_variant(400_000, 0)])
    placeholder = make_book(
        "قیمت موقت", variants=[print_variant(300_000, 10, price_is_placeholder=True)]
    )
    inactive_variant = make_book("نسخه غیرفعال", variants=[print_variant(300_000, 10)])
    inactive_variant.variants.update(is_active=False)
    inactive_book = make_book(
        "کتاب غیرفعال", variants=[print_variant(300_000, 10)], is_active=False
    )

    def v(book, type_=BookVariant.Type.PRINT):
        return book.variants.get(type=type_)

    return {
        "print": v(civil),
        "ebook": v(civil, BookVariant.Type.EBOOK),
        "bundle": v(civil, BookVariant.Type.BUNDLE),
        "low": v(low),
        "sold_out": v(sold_out),
        "placeholder": v(placeholder),
        "inactive_variant": v(inactive_variant),
        "inactive_book": v(inactive_book),
    }
