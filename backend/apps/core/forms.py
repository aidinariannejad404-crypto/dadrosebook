"""Admin form helpers."""

import datetime as dt

from django import forms
from unfold.widgets import UnfoldAdminTextInputWidget

from .jalali import parse_jalali_date, to_jalali_str


class JalaliDateInput(UnfoldAdminTextInputWidget):
    """Text input that shows a Gregorian ``date`` value as Jalali ``1405/08/14``."""

    def __init__(self, attrs=None):
        attrs = {"placeholder": "۱۴۰۵/۰۸/۱۴", "dir": "ltr", "autocomplete": "off", **(attrs or {})}
        super().__init__(attrs=attrs)

    def format_value(self, value):
        if isinstance(value, dt.date):
            return to_jalali_str(value)
        return super().format_value(value)


class JalaliDateField(forms.Field):
    """Accepts a Jalali date (Persian or ASCII digits) and cleans to a Gregorian ``date``."""

    widget = JalaliDateInput
    default_error_messages = {
        "invalid": "تاریخ را به شکل شمسی وارد کنید، مثلاً ۱۴۰۵/۰۸/۱۴.",
    }

    def to_python(self, value):
        if value in self.empty_values:
            return None
        if isinstance(value, dt.date):
            return value
        try:
            return parse_jalali_date(str(value))
        except ValueError as exc:
            raise forms.ValidationError(self.error_messages["invalid"], code="invalid") from exc

    def prepare_value(self, value):
        if isinstance(value, dt.date):
            return to_jalali_str(value)
        return value
