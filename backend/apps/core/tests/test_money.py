import pytest

from apps.core.money import format_number, format_toman, to_persian_digits, to_rial


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (2_200_000, "۲٬۲۰۰٬۰۰۰ تومان"),
        (8_125_000, "۸٬۱۲۵٬۰۰۰ تومان"),
        (950, "۹۵۰ تومان"),
        (0, "۰ تومان"),
    ],
)
def test_format_toman(value, expected):
    assert format_toman(value) == expected


def test_format_toman_none():
    assert format_toman(None) == ""


def test_format_number_and_digits():
    assert format_number(1234567) == "۱٬۲۳۴٬۵۶۷"
    assert to_persian_digits("1405/08/14") == "۱۴۰۵/۰۸/۱۴"


def test_to_rial():
    assert to_rial(2_200_000) == 22_000_000
    assert isinstance(to_rial(1), int)
