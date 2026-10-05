from django import template

from apps.core.jalali import to_jalali_str
from apps.core.money import format_number, format_toman, to_persian_digits

register = template.Library()


@register.filter
def toman(value):
    return format_toman(value or 0)


@register.filter
def num(value):
    return format_number(value or 0)


@register.filter
def fa(value):
    return to_persian_digits(value)


@register.filter
def jalali(value):
    return to_jalali_str(value, persian_digits=True)
