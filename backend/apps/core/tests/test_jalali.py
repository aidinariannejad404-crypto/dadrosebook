import datetime as dt

import pytest
from django import forms

from apps.core.forms import JalaliDateField
from apps.core.jalali import jalali_year, parse_jalali_date, to_jalali_str


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("1405/08/14", dt.date(2026, 11, 5)),
        ("۱۴۰۵/۰۸/۱۴", dt.date(2026, 11, 5)),
        ("1405/9/20", dt.date(2026, 12, 11)),
        ("۱۴۰۵-۰۹-۲۰", dt.date(2026, 12, 11)),
        (" 1403/01/01 ", dt.date(2024, 3, 20)),
    ],
)
def test_parse_jalali_date(text, expected):
    assert parse_jalali_date(text) == expected


@pytest.mark.parametrize("text", ["", "1405/13/01", "1405/12/31", "abc", "05/08/14", None])
def test_parse_jalali_date_invalid(text):
    with pytest.raises(ValueError):
        parse_jalali_date(text)


def test_to_jalali_str():
    assert to_jalali_str(dt.date(2026, 11, 5)) == "1405/08/14"
    assert to_jalali_str(dt.date(2026, 12, 11), persian_digits=True) == "۱۴۰۵/۰۹/۲۰"
    assert to_jalali_str(dt.datetime(2026, 11, 5, 10, 0)) == "1405/08/14"
    assert to_jalali_str(None) == ""
    assert jalali_year(dt.date(2026, 10, 2)) == 1405


class _Form(forms.Form):
    date = JalaliDateField()


def test_jalali_date_field_cleans_to_gregorian():
    form = _Form(data={"date": "۱۴۰۵/۰۸/۱۴"})
    assert form.is_valid(), form.errors
    assert form.cleaned_data["date"] == dt.date(2026, 11, 5)


def test_jalali_date_field_rejects_garbage():
    form = _Form(data={"date": "1405/14/40"})
    assert not form.is_valid()
    assert "date" in form.errors


def test_jalali_date_field_renders_jalali():
    form = _Form(initial={"date": dt.date(2026, 12, 11)})
    assert 'value="1405/09/20"' in str(form["date"])
