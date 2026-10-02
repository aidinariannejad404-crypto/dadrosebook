import pytest

from apps.core.slugs import persian_slugify, unique_slug


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("حقوق مدنی دوجلدی", "حقوق-مدنی-دوجلدی"),
        ("سریع‌خوان متون فقه", "سریع-خوان-متون-فقه"),
        ("آموزش جامع حقوق تجارت (۲ جلدی)", "آموزش-جامع-حقوق-تجارت-2-جلدی"),
        ("كتاب علي", "کتاب-علی"),
        ("Hello,  World!", "hello-world"),
        ("حقوق، تجارت؟ «نمونه»", "حقوق-تجارت-نمونه"),
        ("--- دوره ---", "دوره"),
        ("", ""),
    ],
)
def test_persian_slugify(text, expected):
    assert persian_slugify(text) == expected


def test_slugify_max_length():
    assert len(persian_slugify("کتاب " * 100, max_length=20)) <= 20
    assert not persian_slugify("کتاب " * 100, max_length=20).endswith("-")


@pytest.mark.django_db
def test_unique_slug_appends_counter():
    from apps.catalog.models import Subject

    Subject.objects.create(name="حقوق مدنی")
    second = Subject(name="حقوق مدنی")
    assert unique_slug(second, second.name) == "حقوق-مدنی-2"
    second.save()
    third = Subject(name="حقوق مدني")
    third.save()
    assert third.slug == "حقوق-مدنی-3"


@pytest.mark.django_db
def test_unique_slug_ignores_self():
    from apps.catalog.models import Subject

    subject = Subject.objects.create(name="اصول فقه")
    assert unique_slug(subject, subject.name) == "اصول-فقه"
