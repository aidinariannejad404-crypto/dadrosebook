"""Seed data for ``manage.py seed_catalog``.

The books and categories are the REAL catalogue of the current store (dadrosebook.com, Sazito),
scraped into ``seed_catalogue.json`` (78 books) and ``seed_old_categories.json`` (18 categories).
Old slugs are kept exactly so ``/product/<slug>`` and ``/category/<slug>`` URLs stay identical.
Exam types, subjects, exam dates, the Dadrose course, kit weights, banners and guide videos are
defined here.
"""

import datetime as dt
import json
from pathlib import Path

EXAM_TYPES = [
    # name, short_name
    ("کانون وکلا", "کانون"),
    ("مرکز وکلا", "مرکز"),
    ("قضاوت", "قضاوت"),
    ("سردفتری", "سردفتری"),
    ("ارشد و دکتری", "ارشد"),
]

SUBJECTS = [
    ("حقوق مدنی", "#1F4E8C"),
    ("آیین دادرسی مدنی", "#2E6F9E"),
    ("حقوق تجارت", "#1E7A5A"),
    ("حقوق جزا", "#A23B32"),
    ("آیین دادرسی کیفری", "#7A2B3A"),
    ("اصول فقه", "#8A6A2E"),
    ("متون فقه", "#6B5A3A"),
    ("حقوق اساسی", "#5A3E8A"),
    ("حقوق ثبت", "#4A5563"),
    # Placeholder colour: the brief gave none (PLAN.md open question 4).
    ("قوانین خاص", "#3F6B6B"),
]

KANOON = "کانون وکلا"
MARKAZ = "مرکز وکلا"

DATA_DIR = Path(__file__).resolve().parent
CATALOGUE_FILE = DATA_DIR / "seed_catalogue.json"
OLD_CATEGORIES_FILE = DATA_DIR / "seed_old_categories.json"

OLD_SITE = "https://dadrosebook.com"
OLD_SITE_HOSTS = {"dadrosebook.com", "www.dadrosebook.com"}
# Links to other retailers are removed from imported descriptions (their text is kept).
RETAILER_HOSTS = {
    "hovalvakil.com",
    "digikala.com",
    "ketabrah.ir",
    "taaghche.com",
    "fidibo.com",
    "iranketab.ir",
    "30book.com",
    "adinehbook.com",
}

# In stock on the old site but without a stock number.
DEFAULT_STOCK = 10

# --- categories --------------------------------------------------------------------------------
# Old category slug → parent slug. Every other old category is a root. Order = old menu order.
CATEGORY_PARENTS = {
    "حقوق-تجارت": "آزمون-وکالت",
    "حقوق-جزا": "آزمون-وکالت",
    "آیین-دادرسی-کیفری": "آزمون-وکالت",
    "فقه": "آزمون-وکالت",
    "حقوق-اساسی": "آزمون-وکالت",
    "حقوق-ثبت": "آزمون-وکالت",
    "حقوق-مدنی-7710a": "آزمون-وکالت",
    "آیین-دادرسی-مدنی": "آزمون-وکالت",
    "حقوق-خصوصی": "ارشد-و-دکتری",
    "جزا-و-جرم-شناسی": "ارشد-و-دکتری",
    # A second, separate Sazito «قضاوت» category (one book); kept for its URL.
    "قضاوت": "قضاوت-836ca",
}
# Roots to create when the old site has no such category (slug → name).
EXTRA_ROOT_CATEGORIES = {"ارشد-و-دکتری": "ارشد و دکتری"}
# Old categories that are not migrated (no books: disabled course products).
SKIPPED_CATEGORIES = {"دوره-های-آموزشی"}

# --- leftovers of the earlier demo seed --------------------------------------------------------
# Demo books whose slug is not a real old-store slug are deactivated (is_active=False), never
# deleted. Demo books whose slug matches a real book are updated in place.
DEMO_BOOK_SLUGS = [
    "حقوق-مدنی-دوجلدی-دکتر-شکری",
    "آیین-دادرسی-مدنی-دکتر-شکری",
    "آیین-دادرسی-مدنی",
    "درسنامه-جامع-حقوق-تجارت",
    "آموزش-جامع-حقوق-تجارت-2-جلدی",
    "اصول-فقه-آزمونی-دکتر-شب-خیز",
    "متون-فقه-کانون-وکلا-محسن-سینجلی",
    "1100-تست-برگزیده-متون-فقه",
    "شرح-آزمونی-آیین-دادرسی-کیفری",
    "سریع-خوان-آیین-دادرسی-کیفری",
    "سریع-خوان-متون-فقه-مرکز-وکلا",
    "سریع-خوان-جزای-عمومی",
    "سریع-خوان-قوانین-خاص-جزایی",
]
# Demo categories not on the old site are deactivated the same way.
DEMO_CATEGORY_SLUGS = [
    "حقوق-مدنی",
    "اصول-فقه",
    "متون-فقه",
    "قوانین-خاص",
    "حقوق-جزا-و-جرم-شناسی",
    "حقوق-عمومی",
]

# --- study kits --------------------------------------------------------------------------------
KIT_MAX_ITEMS = 6


def load_catalogue() -> list[dict]:
    """Book records scraped from the old store, in the old store's order (by old id)."""
    with CATALOGUE_FILE.open(encoding="utf-8") as f:
        return json.load(f)


def load_old_categories() -> list[dict]:
    """Old store categories in old menu order (plus an uncategorised pseudo-row, slug None)."""
    with OLD_CATEGORIES_FILE.open(encoding="utf-8") as f:
        return json.load(f)


RELATED_COURSE = {
    "title": "دوره جامع حقوق مدنی ۱ تا ۸",
    "price": 8_125_000,
    "url": "https://dadrose.com/",
    "subject": "حقوق مدنی",  # linked to every book of this subject
}

EXAM_EVENTS = [
    # name, exam type, Jalali (y, m, d), expected Gregorian date (asserted in tests)
    ("آزمون کانون وکلا ۱۴۰۵", KANOON, (1405, 8, 14), dt.date(2026, 11, 5)),
    ("آزمون مرکز وکلا ۱۴۰۵", MARKAZ, (1405, 9, 20), dt.date(2026, 12, 11)),
]

KIT_EXAM_TYPES = [KANOON, MARKAZ]

# ضریب دروس (StudyKitRecommendation.weight) per exam type.
# TO BE VERIFIED against the official exam booklet (دفترچه آزمون) before launch: these values come
# from public articles (iran-tahsil; see docs/research/competitor-analysis.md, P1-10).
SUBJECT_WEIGHTS = {
    KANOON: {
        "حقوق مدنی": 4,
        "حقوق جزا": 3,
        "آیین دادرسی مدنی": 3,
        "حقوق تجارت": 2,
        "آیین دادرسی کیفری": 2,
        "اصول فقه": 1,
        "متون فقه": 1,
    },
}

BANNERS = [
    {
        "placement": "HERO",
        "title": "منابع آزمون وکالت ۱۴۰۵، یک‌جا و مطمئن",
        "subtitle": "آزمونت را انتخاب کن تا بسته مطالعاتی هر درس را با کتاب‌های پیشنهادی "
        "اساتید دادرُز ببینی و یک‌جا سفارش بدهی.",
        "link_url": "/kit",
        "link_label": "ساخت بسته مطالعاتی من",
        "order": 0,
    },
    {
        "placement": "COURSE",
        "title": "کتاب + دوره؛ مسیر کامل حقوق مدنی",
        "subtitle": "کتاب‌های حقوق مدنی را همراه با «دوره جامع حقوق مدنی ۱ تا ۸» دادرُز بخوانید و "
        "هر مبحث را با ویدیو مرور کنید.",
        "link_url": "https://dadrose.com/",
        "link_label": "مشاهده دوره",
        "order": 0,
    },
]

GUIDE_VIDEOS = [
    {"title": "کدام کتاب حقوق مدنی را بخوانم؟", "subject": "حقوق مدنی", "exam_type": None},
    {
        "title": "کدام کتاب آیین دادرسی مدنی را بخوانم؟",
        "subject": "آیین دادرسی مدنی",
        "exam_type": None,
    },
    {"title": "کدام کتاب متون فقه را بخوانم؟", "subject": "متون فقه", "exam_type": KANOON},
]
GUIDE_VIDEO_URL = "https://dadrose.com/"

SUPERUSER_PHONE = "09120000000"
SUPERUSER_PASSWORD = "admin"  # noqa: S105 — dev only, refused unless DEBUG
