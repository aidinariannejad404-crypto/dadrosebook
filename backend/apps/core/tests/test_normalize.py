import pytest

from apps.core.normalize import normalize_persian, search_variants, tokenize_query


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("علي", "علی"),  # Arabic yeh
        ("موسى", "موسی"),  # alef maksura
        ("كتاب", "کتاب"),  # Arabic kaf
        ("خانۀ", "خانه"),
        ("مدرسة", "مدرسه"),
        ("أحمد إبراهيم", "احمد ابراهیم"),
        ("آیین", "آیین"),  # آ is kept
        ("مؤسسه", "موسسه"),
        ("حُقُوقِ مَدَنی", "حقوق مدنی"),  # harakat
        ("قرآنٰ", "قرآن"),  # superscript alef U+0670
        ("كتـــاب", "کتاب"),  # tatweel
        ("۱۲۳۴۵۶۷۸۹۰", "1234567890"),  # Persian digits
        ("١٢٣٤٥٦٧٨٩٠", "1234567890"),  # Arabic-Indic digits
        ("  حقوق   \n مدنی\t", "حقوق مدنی"),
        ("ISBN Abc", "isbn abc"),
        ("", ""),
        (None, ""),
    ],
)
def test_normalize_persian(raw, expected):
    assert normalize_persian(raw) == expected


def test_zwnj_modes():
    text = "سریع‌خوان"
    assert normalize_persian(text) == "سریع خوان"
    assert normalize_persian(text, zwnj="space") == "سریع خوان"
    assert normalize_persian(text, zwnj="remove") == "سریعخوان"
    assert normalize_persian(text, zwnj="keep") == "سریع‌خوان"


@pytest.mark.parametrize("mark", ["‏", "‎", "​"])
def test_other_invisibles_follow_mode(mark):
    text = f"کتاب{mark}ها"
    assert normalize_persian(text, zwnj="space") == "کتاب ها"
    assert normalize_persian(text, zwnj="remove") == "کتابها"
    assert normalize_persian(text, zwnj="keep") == "کتابها"


def test_unknown_mode_raises():
    with pytest.raises(ValueError):
        normalize_persian("x", zwnj="bogus")


def test_mixed_arabic_and_persian_forms_are_equal():
    assert normalize_persian("شكري") == normalize_persian("شکری")
    assert normalize_persian("آيين دادرسي") == normalize_persian("آیین دادرسی")


@pytest.mark.parametrize("query", ["سریع‌خوان", "سریع خوان", "سریعخوان", "سريع‌خوان"])
@pytest.mark.parametrize("title", ["سریع‌خوان متون فقه", "سریع خوان متون فقه", "سریعخوان متون"])
def test_search_variants_match_all_spellings(title, query):
    haystack = search_variants(title)
    assert all(token in haystack for token in tokenize_query(query))


def test_search_variants_empty():
    assert search_variants("") == ""
    assert search_variants(None) == ""


def test_search_variants_deduplicates_simple_words():
    assert search_variants("کتاب") == "کتاب"


def test_tokenize_query():
    assert tokenize_query("  حقوق‌مدني  ۱۱۰۰ ") == ["حقوق", "مدنی", "1100"]
    assert tokenize_query("") == []
