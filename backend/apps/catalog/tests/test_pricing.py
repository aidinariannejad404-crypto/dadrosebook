import pytest

from apps.catalog.models import BookVariant
from apps.catalog.services.pricing import (
    book_min_price,
    discount_percent,
    effective_price,
    round_to,
)
from apps.catalog.services.seed import placeholder_prices


@pytest.mark.parametrize(
    ("price", "sale", "eff", "pct"),
    [
        (1_000_000, None, 1_000_000, 0),
        (1_495_000, 1_345_000, 1_345_000, 10),
        (1_000_000, 1_200_000, 1_000_000, 0),  # higher "sale" is ignored
        (1_000_000, 1_000_000, 1_000_000, 0),
        (1_000_000, 0, 0, 100),
        (0, None, 0, 0),
    ],
)
def test_effective_price_and_discount(price, sale, eff, pct):
    assert effective_price(price, sale) == eff
    assert discount_percent(price, sale) == pct


def test_round_to():
    assert round_to(672_750) == 670_000
    assert round_to(2_237_500) == 2_240_000


def test_placeholder_prices():
    assert placeholder_prices(2_200_000) == (990_000, 2_750_000)
    assert placeholder_prices(1_495_000) == (670_000, 1_870_000)


def test_variant_in_stock_rules():
    assert BookVariant(type="EBOOK", price=1, stock=0).in_stock
    assert not BookVariant(type="PRINT", price=1, stock=0).in_stock
    assert BookVariant(type="PRINT", price=1, stock=3).in_stock
    assert not BookVariant(type="BUNDLE", price=1, stock=0).in_stock
    assert BookVariant(type="BUNDLE", price=1, stock=2).in_stock


def test_variant_properties():
    v = BookVariant(type="PRINT", price=1_495_000, sale_price=1_345_000)
    assert v.effective_price == 1_345_000
    assert v.discount_percent == 10


def test_book_min_price():
    variants = [
        BookVariant(type="PRINT", price=2_200_000),
        BookVariant(type="EBOOK", price=1_000_000, sale_price=900_000),
    ]
    assert book_min_price(variants) == 900_000
    assert book_min_price([]) is None


@pytest.mark.django_db
def test_unique_book_type(catalog):
    from django.db import IntegrityError

    with pytest.raises(IntegrityError):
        BookVariant.objects.create(book=catalog["commerce_book"], type="PRINT", price=1)
