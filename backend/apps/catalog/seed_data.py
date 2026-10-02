"""Seed catalogue for Phase 1 (used by ``manage.py seed_catalog``).

Real prices for PRINT variants come from the current store. EBOOK/BUNDLE prices and the
سریع‌خوان prices are placeholders (``price_is_placeholder=True``) until the owner confirms them.
Publishers are unknown, so books have no publisher yet.
"""

import datetime as dt

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

BAR_EXAM_CATEGORY = "آزمون وکالت"
QUICK_REVIEW_CATEGORY = "سریع‌خوان"
CATEGORIES = [
    # (name, children). Children of «آزمون وکالت» are one per subject.
    (BAR_EXAM_CATEGORY, [name for name, _ in SUBJECTS]),
    ("ارشد و دکتری", ["حقوق خصوصی", "حقوق جزا و جرم‌شناسی", "حقوق عمومی"]),
    (QUICK_REVIEW_CATEGORY, []),
]

KANOON = "کانون وکلا"
MARKAZ = "مرکز وکلا"
DEFAULT_EXAM_TYPES = [KANOON, MARKAZ]

_TOC_CIVIL = """بخش اول: اموال و مالکیت
بخش دوم: حق انتفاع و ارتفاق
بخش سوم: قواعد عمومی قراردادها
بخش چهارم: عقود معین
بخش پنجم: الزامات خارج از قرارداد
بخش ششم: اشخاص و خانواده
بخش هفتم: ارث و وصیت
پیوست: تست‌های آزمون‌های سال‌های اخیر"""

_TOC_CIVIL_PROCEDURE = """فصل اول: صلاحیت دادگاه‌ها
فصل دوم: دعوا و اقسام آن
فصل سوم: دادخواست و جلسه دادرسی
فصل چهارم: ادله اثبات دعوا
فصل پنجم: رأی و طرق شکایت از آرا
فصل ششم: دعاوی طاری و دستور موقت
پیوست: تست‌های طبقه‌بندی‌شده"""

_TOC_COMMERCIAL = """فصل اول: تاجر و اعمال تجاری
فصل دوم: شرکت‌های تجاری
فصل سوم: اسناد تجاری (برات، سفته، چک)
فصل چهارم: ورشکستگی
فصل پنجم: حق‌العمل‌کاری، حمل‌ونقل و قائم‌مقامی
پیوست: پرسش‌های چهارگزینه‌ای"""

_TOC_USUL = """مباحث الفاظ: اوامر و نواهی
عام و خاص، مطلق و مقید
مفاهیم
حجت و امارات
اصول عملیه: برائت، احتیاط، تخییر، استصحاب
تعارض ادله"""

_TOC_FIQH = """کتاب البیع و خیارات
کتاب الاجاره
کتاب النکاح و الطلاق
کتاب الحدود و القصاص
کتاب الدیات
ترجمه و شرح عبارات دشوار"""

_TOC_CRIMINAL_PROCEDURE = """فصل اول: کلیات و دعاوی ناشی از جرم
فصل دوم: کشف جرم و تحقیقات مقدماتی
فصل سوم: صلاحیت دادگاه‌های کیفری
فصل چهارم: رسیدگی در دادگاه
فصل پنجم: اعتراض به آرا و اجرای احکام"""

_TOC_QUICK = """جمع‌بندی مواد پرتکرار
نکات تستی هر فصل
جدول‌های مقایسه‌ای
تست‌های سال‌های اخیر با پاسخ کوتاه"""


def _desc(*paragraphs: str) -> str:
    return "".join(f"<p>{p}</p>" for p in paragraphs)


BOOKS = [
    {
        "title": "حقوق مدنی دوجلدی",
        "authors": ["دکتر شکری"],
        "subjects": ["حقوق مدنی"],
        "price": 2_200_000,
        "stock": 24,
        "volumes": 2,
        "pages": 1240,
        "is_featured": True,
        "description": _desc(
            "مجموعه دوجلدی حقوق مدنی برای داوطلبان آزمون وکالت؛ تمام مباحث قانون مدنی به زبان "
            "ساده، همراه با نظریات مشورتی و آرای وحدت رویه.",
            "در پایان هر فصل، تست‌های آزمون‌های کانون و مرکز وکلا با پاسخ تشریحی آمده است.",
        ),
        "table_of_contents": _TOC_CIVIL,
        "study_plan_note": "منبع اصلی حقوق مدنی؛ از ماه‌های اول برنامه مطالعه شروع کنید و دو بار "
        "به‌طور کامل مرور کنید.",
    },
    {
        "title": "آیین دادرسی مدنی",
        "authors": ["دکتر شکری"],
        "subjects": ["آیین دادرسی مدنی"],
        "price": 1_500_000,
        "stock": 18,
        "pages": 760,
        "is_featured": True,
        "description": _desc(
            "شرح کاربردی قانون آیین دادرسی مدنی با تمرکز بر نکات پرتکرار آزمون وکالت و مثال‌های "
            "عملی از رویه دادگاه‌ها."
        ),
        "table_of_contents": _TOC_CIVIL_PROCEDURE,
        "study_plan_note": "بعد از دور اول حقوق مدنی بخوانید؛ فصل صلاحیت و طرق شکایت را با دقت "
        "بیشتری مرور کنید.",
    },
    {
        "title": "آیین دادرسی مدنی",
        "authors": [],
        "subjects": ["آیین دادرسی مدنی"],
        "price": 1_750_000,
        "stock": 12,
        "pages": 840,
        "description": _desc(
            "درسنامه آیین دادرسی مدنی همراه با تست‌های طبقه‌بندی‌شده موضوعی و پاسخ‌نامه تشریحی."
        ),
        "table_of_contents": _TOC_CIVIL_PROCEDURE,
        "study_plan_note": "برای مرور دوم و تست‌زنی موضوعی آیین دادرسی مدنی مناسب است.",
    },
    {
        "title": "درسنامه جامع حقوق تجارت",
        "authors": [],
        "subjects": ["حقوق تجارت"],
        "price": 1_495_000,
        "sale_price": 1_345_000,
        "stock": 30,
        "pages": 690,
        "description": _desc(
            "درسنامه‌ای جامع برای حقوق تجارت؛ از تاجر و اعمال تجاری تا ورشکستگی، با جدول‌های "
            "مقایسه‌ای شرکت‌های تجاری."
        ),
        "table_of_contents": _TOC_COMMERCIAL,
        "study_plan_note": "حقوق تجارت را هم‌زمان با مرور دوم مدنی شروع کنید؛ اسناد تجاری "
        "بیشترین سهم تست را دارد.",
    },
    {
        "title": "آموزش جامع حقوق تجارت (۲ جلدی)",
        "authors": [],
        "subjects": ["حقوق تجارت"],
        "price": 1_790_000,
        "stock": 9,
        "volumes": 2,
        "pages": 1080,
        "description": _desc(
            "آموزش گام‌به‌گام حقوق تجارت در دو جلد، با تحلیل مواد قانون تجارت و لایحه اصلاحی "
            "و تست‌های آزمون‌های سال‌های اخیر."
        ),
        "table_of_contents": _TOC_COMMERCIAL,
        "study_plan_note": "اگر وقت بیشتری دارید، این مجموعه را به‌جای درسنامه به‌عنوان منبع "
        "اصلی تجارت بخوانید.",
    },
    {
        "title": "اصول فقه آزمونی",
        "authors": ["دکتر شب‌خیز"],
        "subjects": ["اصول فقه"],
        "price": 850_000,
        "stock": 21,
        "pages": 430,
        "description": _desc(
            "اصول فقه به زبان ساده و با رویکرد آزمونی؛ مباحث الفاظ و اصول عملیه همراه با "
            "مثال‌های حقوقی."
        ),
        "table_of_contents": _TOC_USUL,
        "study_plan_note": "روزی یک ساعت در کنار درس‌های اصلی؛ تست‌های هر فصل را بلافاصله بزنید.",
    },
    {
        "title": "متون فقه کانون وکلا",
        "authors": ["محسن سینجلی"],
        "subjects": ["متون فقه"],
        "exam_types": [KANOON],
        "price": 960_000,
        "stock": 15,
        "pages": 520,
        "description": _desc(
            "ترجمه و شرح متون فقه مطابق منابع آزمون کانون وکلا، با تمرکز بر عبارت‌های "
            "پرتکرار در تست‌ها."
        ),
        "table_of_contents": _TOC_FIQH,
        "study_plan_note": "مخصوص داوطلبان کانون وکلا؛ هم‌زمان با اصول فقه بخوانید.",
    },
    {
        "title": "۱۱۰۰ تست برگزیده متون فقه",
        "authors": [],
        "subjects": ["متون فقه"],
        "price": 480_000,
        "stock": 40,
        "pages": 310,
        "description": _desc(
            "۱۱۰۰ تست برگزیده متون فقه از آزمون‌های سال‌های گذشته با پاسخ تشریحی و ارجاع به متن عربی."
        ),
        "table_of_contents": """تست‌های بیع و خیارات
تست‌های اجاره و نکاح
تست‌های حدود، قصاص و دیات
پاسخ‌نامه تشریحی""",
        "study_plan_note": "بعد از پایان دور اول متون فقه، برای تثبیت و سنجش خودتان.",
    },
    {
        "title": "شرح آزمونی آیین دادرسی کیفری",
        "authors": [],
        "subjects": ["آیین دادرسی کیفری"],
        "price": 900_000,
        "stock": 5,
        "pages": 560,
        "description": _desc(
            "شرح مواد قانون آیین دادرسی کیفری با رویکرد آزمونی، نمودارهای مراحل دادرسی و "
            "تست‌های طبقه‌بندی‌شده."
        ),
        "table_of_contents": _TOC_CRIMINAL_PROCEDURE,
        "study_plan_note": "بعد از حقوق جزا بخوانید؛ مراحل تحقیقات مقدماتی پرتکرارترین بخش است.",
    },
    # --- سریع‌خوان (out of stock, placeholder prices) -------------------------------------------
    {
        "title": "سریع‌خوان آیین دادرسی کیفری",
        "authors": [],
        "subjects": ["آیین دادرسی کیفری"],
        "price": 390_000,
        "stock": 0,
        "quick_review": True,
        "pages": 180,
        "description": _desc("جمع‌بندی فشرده آیین دادرسی کیفری برای هفته‌های آخر قبل از آزمون."),
        "table_of_contents": _TOC_QUICK,
        "study_plan_note": "برای مرور نهایی در یک ماه آخر.",
    },
    {
        "title": "سریع‌خوان متون فقه مرکز وکلا",
        "authors": [],
        "subjects": ["متون فقه"],
        "exam_types": [MARKAZ],
        "price": 390_000,
        "stock": 0,
        "quick_review": True,
        "pages": 160,
        "description": _desc("مرور سریع متون فقه مطابق منابع آزمون مرکز وکلا."),
        "table_of_contents": _TOC_QUICK,
        "study_plan_note": "برای مرور نهایی در یک ماه آخر.",
    },
    {
        "title": "سریع‌خوان جزای عمومی",
        "authors": [],
        "subjects": ["حقوق جزا"],
        "price": 390_000,
        "stock": 0,
        "quick_review": True,
        "pages": 170,
        "description": _desc("نکات کلیدی حقوق جزای عمومی در قالب جدول و خلاصه."),
        "table_of_contents": _TOC_QUICK,
        "study_plan_note": "برای مرور نهایی در یک ماه آخر.",
    },
    {
        "title": "سریع‌خوان قوانین خاص جزایی",
        "authors": [],
        "subjects": ["قوانین خاص"],
        "price": 390_000,
        "stock": 0,
        "quick_review": True,
        "pages": 150,
        "description": _desc("خلاصه قوانین خاص جزایی پرتکرار در آزمون وکالت."),
        "table_of_contents": _TOC_QUICK,
        "study_plan_note": "برای مرور نهایی در یک ماه آخر.",
    },
]

SALES_COUNT_START = 180
SALES_COUNT_STEP = 15

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
        "subtitle": "حقوق مدنی دوجلدی را همراه با «دوره جامع حقوق مدنی ۱ تا ۸» دادرُز بخوانید و "
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
