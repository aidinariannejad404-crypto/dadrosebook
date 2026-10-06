import pytest

from apps.content.services import indexing
from apps.content.services.indexing import (
    AUTHOR,
    EXAM,
    LIST,
    PUBLISHER,
    SUBJECT,
    is_indexable,
    missing_requirements,
    plain_text,
    word_count,
)

from .conftest import words


def test_word_count_ignores_markup_and_keeps_zwnj_words():
    assert word_count("") == 0
    assert word_count(None) == 0
    assert word_count("<p>این کتاب‌ها</p><p>می‌شود&nbsp;خوب</p>") == 4
    assert word_count("<ul><li>یک</li><li>دو</li></ul>") == 2
    assert plain_text("<p>a &amp; b</p>") == "a & b"


@pytest.mark.parametrize("kind", [EXAM, SUBJECT, LIST])
def test_intro_hubs_need_intro_and_books(kind, settings):
    settings.HUB_INDEX_MIN_INTRO_WORDS = 150
    settings.HUB_INDEX_MIN_BOOKS = 3
    assert is_indexable(kind, book_count=3, intro_words=150)
    assert not is_indexable(kind, book_count=2, intro_words=500)
    assert not is_indexable(kind, book_count=30, intro_words=149)
    assert not is_indexable(kind, book_count=30, intro_words=500, intro_is_placeholder=True)


def test_thresholds_are_configurable(settings):
    settings.HUB_INDEX_MIN_INTRO_WORDS = 10
    settings.HUB_INDEX_MIN_BOOKS = 1
    assert is_indexable(EXAM, book_count=1, intro_words=10)


def test_author_rule(settings):
    settings.AUTHOR_INDEX_MIN_BOOKS = 2
    assert not is_indexable(AUTHOR, book_count=0, bio_words=300)  # no books: thin
    assert not is_indexable(AUTHOR, book_count=1, bio_words=0)
    assert is_indexable(AUTHOR, book_count=1, bio_words=indexing.AUTHOR_INDEX_MIN_BIO_WORDS)
    assert is_indexable(AUTHOR, book_count=2, bio_words=0)


def test_publisher_rule(settings):
    settings.PUBLISHER_INDEX_MIN_BOOKS = 3
    assert not is_indexable(PUBLISHER, book_count=2)
    assert is_indexable(PUBLISHER, book_count=3)


def test_missing_requirements_explains_in_persian(settings):
    settings.HUB_INDEX_MIN_INTRO_WORDS = 150
    settings.HUB_INDEX_MIN_BOOKS = 3
    reasons = missing_requirements(EXAM, book_count=1, intro_words=20, intro_is_placeholder=True)
    assert reasons == [
        "مقدمه هنوز متن موقت است",
        "مقدمه ۲۰ کلمه است (حداقل ۱۵۰)",
        "۱ کتاب فعال دارد (حداقل ۳)",
    ]
    assert missing_requirements(EXAM, book_count=3, intro_words=word_count(words(150))) == []


def test_unknown_kind():
    with pytest.raises(ValueError):
        is_indexable("category", book_count=10)


@pytest.mark.django_db
def test_hub_status_for_rows(hub_world):
    indexable, missing = indexing.hub_status(hub_world["exam"])
    assert indexable and missing == []
    indexable, missing = indexing.hub_status(hub_world["civil"])  # no intro
    assert not indexable and "مقدمه" in missing[0]
    assert indexing.hub_status(hub_world["author"])[0]  # 3 active books
    assert not indexing.hub_status(hub_world["translator"])[0]  # 1 book, no bio
    assert indexing.hub_status(hub_world["publisher"])[0]  # 4 books
