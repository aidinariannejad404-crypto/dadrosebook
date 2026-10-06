"""Base settings shared by every environment. Values come from the environment (django-environ)."""

from pathlib import Path

import environ
from corsheaders.defaults import default_headers
from django.templatetags.static import static
from django.urls import reverse_lazy

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env", overwrite=False)

SECRET_KEY = env("SECRET_KEY", default="insecure-dev-key-change-me")
DEBUG = env.bool("DEBUG", default=False)
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

INSTALLED_APPS = [
    # unfold must come before django.contrib.admin
    "unfold",
    "unfold.contrib.filters",
    "unfold.contrib.forms",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # third party
    "rest_framework",
    "django_filters",
    "corsheaders",
    # local
    "apps.core",
    "apps.accounts",
    "apps.catalog",
    "apps.content",
    "apps.leads",
    "apps.orders",
    "apps.payments",
    "apps.library",
    "apps.reviews",
    "apps.wishlist",
    "apps.cart",
    "apps.engagement",
    "apps.reader",
    "apps.seo",
    "apps.growth",  # growth loops: Torob feed, kit links, gifts, partners, campaigns
    "apps.backoffice",  # last: its post_migrate roles need every app's permissions
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "apps.accounts.admin_security.AdminSecurityMiddleware",  # admin IP allowlist + staff 2FA
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": env.db("DATABASE_URL", default="postgres://dadrose:dadrose@localhost:5432/dadrose"),
}
DATABASES["default"]["CONN_MAX_AGE"] = env.int("CONN_MAX_AGE", default=60)
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Django sessions are used only by the admin (the storefront uses JWT cookies): a staff session
# ends after this many idle seconds (refreshed on every request) and when the browser closes.
SESSION_COOKIE_AGE = env.int("ADMIN_SESSION_IDLE_SECONDS", default=2 * 60 * 60)
SESSION_SAVE_EVERY_REQUEST = True
SESSION_EXPIRE_AT_BROWSER_CLOSE = True

REDIS_URL = env("REDIS_URL", default="redis://localhost:6379/0")
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_URL,
        "KEY_PREFIX": "dadrose",
    }
}

AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# --- i18n -------------------------------------------------------------------------------------
LANGUAGE_CODE = "fa"
LANGUAGES = [("fa", "فارسی")]
TIME_ZONE = "Asia/Tehran"
USE_I18N = True
USE_TZ = True

# --- static / media / storages ----------------------------------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
PRIVATE_MEDIA_ROOT = BASE_DIR / "private_media"  # never served by any URL

USE_S3 = env.bool("USE_S3", default=False)
S3_ENDPOINT_URL = env("S3_ENDPOINT_URL", default="")
S3_PUBLIC_BUCKET = env("S3_PUBLIC_BUCKET", default="")
S3_PRIVATE_BUCKET = env("S3_PRIVATE_BUCKET", default="")
S3_REGION = env("S3_REGION", default="")
AWS_ACCESS_KEY_ID = env("AWS_ACCESS_KEY_ID", default="")
AWS_SECRET_ACCESS_KEY = env("AWS_SECRET_ACCESS_KEY", default="")

if USE_S3:
    _s3_common = {
        "endpoint_url": S3_ENDPOINT_URL or None,
        "region_name": S3_REGION or None,
        "access_key": AWS_ACCESS_KEY_ID,
        "secret_key": AWS_SECRET_ACCESS_KEY,
        "file_overwrite": False,
    }
    STORAGES = {
        "default": {
            "BACKEND": "apps.core.storages.PublicS3Storage",
            "OPTIONS": {**_s3_common, "bucket_name": S3_PUBLIC_BUCKET},
        },
        "private": {
            "BACKEND": "apps.core.storages.PrivateS3Storage",
            "OPTIONS": {**_s3_common, "bucket_name": S3_PRIVATE_BUCKET},
        },
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }
else:
    STORAGES = {
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
            "OPTIONS": {"location": str(MEDIA_ROOT), "base_url": MEDIA_URL},
        },
        "private": {"BACKEND": "apps.core.storages.PrivateFileSystemStorage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }

# --- DRF ----------------------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    # httpOnly JWT cookies set by POST /auth/otp/verify/ (apps.accounts.authentication).
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.accounts.authentication.CookieJWTAuthentication"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardPagination",
    "PAGE_SIZE": 24,
    # ``?format=`` is a catalog filter (print/ebook/bundle), not DRF renderer selection.
    "URL_FORMAT_OVERRIDE": None,
    # Only views that set ``throttle_scope`` are throttled (per client IP).
    "DEFAULT_THROTTLE_RATES": {
        "study_plan": env("STUDY_PLAN_THROTTLE_RATE", default="10/hour"),
        "otp_request": env("OTP_REQUEST_THROTTLE_RATE", default="10/hour"),
        "otp_verify": env("OTP_VERIFY_THROTTLE_RATE", default="30/hour"),
        "reviews": env("REVIEW_THROTTLE_RATE", default="10/hour"),
        "back_in_stock": env("BACK_IN_STOCK_THROTTLE_RATE", default="10/hour"),
        # Redirect-hit and 404 beacons (``/seo/redirects/hit/``, ``/seo/not-found/``).
        "seo_beacon": env("SEO_BEACON_THROTTLE_RATE", default="120/min"),
    },
    # Set to the number of trusted reverse proxies in prod so the client IP is read correctly.
    "NUM_PROXIES": env.int("NUM_PROXIES", default=None),
}

# --- CORS / CSRF --------------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:3000"])
# Auth cookies travel with credentialed requests from the storefront origin.
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = (*default_headers, "x-cart-token", "x-reader-device")
CORS_EXPOSE_HEADERS = ["X-Search-Relaxed"]
CSRF_TRUSTED_ORIGINS = env.list(
    "CSRF_TRUSTED_ORIGINS", default=["http://localhost:8000", "http://localhost:3000"]
)

# --- Ebook reader (Phase 4) ---------------------------------------------------------------------
# Lifetime of the signed ebook file URL (S3 pre-signed URL or local signed token).
READER_URL_TTL_SECONDS = env.int("READER_URL_TTL_SECONDS", default=300)
# ``callable(user, book) -> bool``; default is the Phase 3 entitlement check.
READER_ENTITLEMENT_CHECKER = env(
    "READER_ENTITLEMENT_CHECKER", default="apps.library.services.entitlements.has_entitlement"
)
# Staff may open any ebook in the reader to check uploads.
READER_STAFF_PREVIEW = env.bool("READER_STAFF_PREVIEW", default=True)
# Phase 6: devices, copy limit and anti-scraping rates (per user).
READER_MAX_DEVICES = env.int("READER_MAX_DEVICES", default=3)
READER_DEVICE_WINDOW_DAYS = env.int("READER_DEVICE_WINDOW_DAYS", default=90)
READER_COPY_LIMIT = env.int("READER_COPY_LIMIT", default=1000)
READER_CHAPTER_RATE = env("READER_CHAPTER_RATE", default="30/min")
READER_CHAPTER_DAY_RATE = env("READER_CHAPTER_DAY_RATE", default="800/day")
READER_SEARCH_RATE = env("READER_SEARCH_RATE", default="30/min")
READER_DEVICE_REMOVE_RATE = env("READER_DEVICE_REMOVE_RATE", default="5/day")
# Total copy quota per user and book: percent of an EPUB's characters (min), fixed for PDF.
READER_COPY_QUOTA_PERCENT = env.int("READER_COPY_QUOTA_PERCENT", default=10)
READER_COPY_QUOTA_MIN = env.int("READER_COPY_QUOTA_MIN", default=2000)
READER_PDF_COPY_QUOTA = env.int("READER_PDF_COPY_QUOTA", default=20000)
READER_COPY_RATE = env("READER_COPY_RATE", default="60/min")
READER_EXPORT_RATE = env("READER_EXPORT_RATE", default="30/hour")
# Offline reading (EPUB): whole book stored encrypted on one device, time-limited license.
READER_OFFLINE_ENABLED = env.bool("READER_OFFLINE_ENABLED", default=True)
READER_OFFLINE_MAX_BOOKS = env.int("READER_OFFLINE_MAX_BOOKS", default=3)
READER_OFFLINE_DAYS = env.int("READER_OFFLINE_DAYS", default=14)
READER_OFFLINE_RATE = env("READER_OFFLINE_RATE", default="10/day")

# --- Celery -------------------------------------------------------------------------------------
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default=REDIS_URL)
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default=REDIS_URL)
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
# Periodic jobs (the worker runs with an embedded beat: `celery -A config worker -B`).
CELERY_BEAT_SCHEDULE = {
    "expire-unpaid-orders": {
        "task": "apps.orders.tasks.expire_unpaid_orders",
        "schedule": 300.0,
    },
    "purge-stale-carts": {
        "task": "apps.cart.tasks.purge_stale_carts",
        "schedule": 24 * 3600.0,
    },
    "abandoned-cart-reminders": {  # sends only when enabled in «تنظیمات فروشگاه»
        "task": "apps.cart.tasks.send_abandoned_cart_reminders",
        "schedule": 30 * 60.0,
    },
}

# --- integrations -------------------------------------------------------------------------------
SMS_PROVIDER = env("SMS_PROVIDER", default="console")
# Public storefront origin, used in SMS links (e.g. back-in-stock → {SITE_URL}/product/<slug>).
SITE_URL = env("SITE_URL", default="http://localhost:3000")

# --- cart ---------------------------------------------------------------------------------------
CART_MAX_QUANTITY = env.int("CART_MAX_QUANTITY", default=10)
CART_TTL_DAYS = env.int("CART_TTL_DAYS", default=60)

# --- auth (Phase 3): phone OTP + httpOnly JWT cookies ------------------------------------------
JWT_SIGNING_KEY = env("JWT_SIGNING_KEY", default=SECRET_KEY)
JWT_ACCESS_LIFETIME_SECONDS = env.int("JWT_ACCESS_LIFETIME_SECONDS", default=15 * 60)
JWT_REFRESH_LIFETIME_SECONDS = env.int("JWT_REFRESH_LIFETIME_SECONDS", default=30 * 24 * 3600)
AUTH_COOKIE_ACCESS = "dr_access"
AUTH_COOKIE_REFRESH = "dr_refresh"
AUTH_COOKIE_SECURE = env.bool("AUTH_COOKIE_SECURE", default=not DEBUG)
AUTH_COOKIE_SAMESITE = "Lax"
AUTH_COOKIE_DOMAIN = env("AUTH_COOKIE_DOMAIN", default=None)
OTP_LENGTH = 5
OTP_TTL_SECONDS = env.int("OTP_TTL_SECONDS", default=120)
OTP_RESEND_SECONDS = env.int("OTP_RESEND_SECONDS", default=60)
OTP_MAX_ATTEMPTS = 5
OTP_MAX_PER_PHONE_PER_HOUR = env.int("OTP_MAX_PER_PHONE_PER_HOUR", default=5)
# Console provider only: also log the code at WARNING (easy to spot in `docker compose logs`).
OTP_DEBUG_ECHO = env.bool("OTP_DEBUG_ECHO", default=DEBUG)

# --- admin security -----------------------------------------------------------------------------
# Staff must confirm an SMS code after the password (apps.accounts.admin_security).
STAFF_2FA_REQUIRED = env.bool("STAFF_2FA_REQUIRED", default=True)
STAFF_2FA_CODE_LENGTH = 6
STAFF_2FA_TTL_SECONDS = 5 * 60
STAFF_2FA_MAX_ATTEMPTS = 5
STAFF_2FA_RESEND_SECONDS = 60
# IPs or CIDR networks allowed to reach /admin/ (others get 404); empty = everyone.
ADMIN_ALLOWED_IPS = env.list("ADMIN_ALLOWED_IPS", default=[])

# --- payments (Phase 3) -------------------------------------------------------------------------
# "zarinpal" (sandbox unless ZARINPAL_SANDBOX=false) or "fake" (local simulator, dev/tests only).
PAYMENT_GATEWAY = env("PAYMENT_GATEWAY", default="zarinpal")
ZARINPAL_MERCHANT_ID = env("ZARINPAL_MERCHANT_ID", default="00000000-0000-0000-0000-000000000000")
ZARINPAL_SANDBOX = env.bool("ZARINPAL_SANDBOX", default=True)
ZARINPAL_TIMEOUT_SECONDS = env.int("ZARINPAL_TIMEOUT_SECONDS", default=15)
# Absolute URLs the browser can reach: the gateway calls back the API, which then redirects to the
# storefront's result page.
PUBLIC_API_URL = env("PUBLIC_API_URL", default="http://localhost:8000/api/v1")
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:3000")
# Unpaid orders are cancelled after this many minutes (Celery beat, every 5 minutes).
ORDER_PAYMENT_TIMEOUT_MINUTES = env.int("ORDER_PAYMENT_TIMEOUT_MINUTES", default=60)

# --- analytics (self-hosted Umami) -------------------------------------------------------------
# Server-side events (``apps.core.analytics.track_server_event``). Empty → no-op.
UMAMI_HOST = env("UMAMI_HOST", default="").rstrip("/")
UMAMI_WEBSITE_ID = env("UMAMI_WEBSITE_ID", default="")
SITE_HOST = env("SITE_HOST", default="")

# --- caching knobs ------------------------------------------------------------------------------
HOME_CACHE_SECONDS = env.int("HOME_CACHE_SECONDS", default=60)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}

# --- Admin (django-unfold) ----------------------------------------------------------------------


WQ = "apps.backoffice.services.work_queue."


def _nav(title, icon, model, badge=None):
    """A sidebar link to a model's changelist, shown only to staff who may view that model."""
    app_label, model_name = model.split("_", 1)
    item = {
        "title": title,
        "icon": icon,
        "link": reverse_lazy(f"admin:{model}_changelist"),
        "permission": lambda request: request.user.has_perm(f"{app_label}.view_{model_name}"),
    }
    if badge:
        item["badge"] = badge
    return item


UNFOLD = {
    "SITE_TITLE": "پنل مدیریت دادرُز",
    "SITE_HEADER": "پنل مدیریت دادرُز",
    "SITE_SUBHEADER": "فروشگاه کتاب دادرُز",
    "SITE_URL": "/",
    "SITE_SYMBOL": "menu_book",
    "DASHBOARD_CALLBACK": "apps.backoffice.views.dashboard_callback",
    "SHOW_HISTORY": True,
    "SHOW_VIEW_ON_SITE": False,
    "STYLES": [
        lambda request: static("admin_theme/admin.css"),  # Vazirmatn
        lambda request: static("admin_theme/unfold-rtl.css"),  # see build_admin_rtl_css
        lambda request: static("admin_theme/backoffice.css"),  # dashboard and reports
    ],
    "COLORS": {
        # Built around the brand navy #12264A (primary-800).
        "primary": {
            "50": "#f0f3f9",
            "100": "#dde4f1",
            "200": "#bccae3",
            "300": "#91a7cf",
            "400": "#637fb6",
            "500": "#42609c",
            "600": "#2c4a83",
            "700": "#1f3a6b",
            "800": "#12264a",
            "900": "#0e1e3b",
            "950": "#08122a",
        },
    },
    "SIDEBAR": {
        "show_search": True,
        "show_all_applications": False,
        "navigation": [
            {
                "title": "پیشخوان",
                "items": [
                    {
                        "title": "پیشخوان فروشگاه",
                        "icon": "dashboard",
                        "link": reverse_lazy("admin:index"),
                    },
                    {
                        "title": "گزارش فروش",
                        "icon": "monitoring",
                        "link": reverse_lazy("backoffice-sales-report"),
                        "permission": "apps.backoffice.permissions.can_view_reports",
                    },
                ],
            },
            {
                "title": "سفارش و فروش",
                "separator": True,
                "items": [
                    _nav(
                        "سفارش‌ها",
                        "receipt_long",
                        "orders_order",
                        WQ + "orders_badge",
                    ),
                    _nav(
                        "مرجوعی و استرداد",
                        "assignment_return",
                        "orders_returnrequest",
                        WQ + "returns_badge",
                    ),
                    _nav("پرداخت‌ها", "payments", "payments_payment"),
                    _nav("کدهای تخفیف", "sell", "orders_discountcode"),
                    _nav("استفاده‌های کد تخفیف", "redeem", "orders_discountredemption"),
                    _nav("روش‌های ارسال", "local_shipping", "orders_shippingmethod"),
                    _nav("سبدهای خرید و رهاشده", "shopping_cart", "cart_cart"),
                    _nav(
                        "موجود شد خبرم کن", "notifications_active", "engagement_backinstockrequest"
                    ),
                ],
            },
            {
                "title": "کاتالوگ",
                "separator": True,
                "items": [
                    _nav("کتاب‌ها", "menu_book", "catalog_book"),
                    _nav(
                        "نسخه‌ها، قیمت و موجودی",
                        "sell",
                        "catalog_bookvariant",
                        WQ + "low_stock_badge",
                    ),
                    _nav("درس‌ها", "palette", "catalog_subject"),
                    _nav("آزمون‌ها", "school", "catalog_examtype"),
                    _nav("تاریخ آزمون‌ها", "event", "catalog_examevent"),
                    _nav("بسته‌های مطالعاتی", "inventory_2", "catalog_studykitrecommendation"),
                    _nav("دسته‌بندی‌ها", "category", "catalog_category"),
                    _nav("نویسندگان و مترجمان", "person", "catalog_person"),
                    _nav("ناشران", "apartment", "catalog_publisher"),
                    _nav("دوره‌های مرتبط", "smart_display", "catalog_relatedcourse"),
                    _nav("کد تخفیف دوره‌ها", "percent", "catalog_subjectcoursediscount"),
                ],
            },
            {
                "title": "کتاب الکترونیک",
                "separator": True,
                "items": [
                    _nav("فایل‌های کتاب الکترونیک", "picture_as_pdf", "library_ebookfile"),
                    _nav("دسترسی‌های کتاب الکترونیک", "key", "library_ebookentitlement"),
                    _nav("پیشرفت مطالعه", "auto_stories", "reader_readingprogress"),
                    _nav("هایلایت‌ها", "border_color", "reader_highlight"),
                ],
            },
            {
                "title": "سئو",
                "separator": True,
                "items": [
                    {
                        "title": "ریدایرکت‌ها",
                        "icon": "alt_route",
                        "link": reverse_lazy("admin:seo_redirect_changelist"),
                    },
                    {
                        "title": "صفحه‌های پیدانشده (۴۰۴)",
                        "icon": "link_off",
                        "link": reverse_lazy("admin:seo_notfoundhit_changelist"),
                    },
                ],
            },
            {
                "title": "مشتریان و بازاریابی",
                "separator": True,
                "items": [
                    _nav("کاربران", "people", "accounts_user"),
                    _nav(
                        "نظرات",
                        "rate_review",
                        "reviews_review",
                        WQ + "reviews_badge",
                    ),
                    _nav("سرنخ‌ها (برنامه مطالعه)", "contact_phone", "leads_lead"),
                    _nav("علاقه‌مندی‌ها", "favorite", "wishlist_wishlistitem"),
                    _nav("نشانی‌ها", "home_pin", "orders_address"),
                ],
            },
            {
                "title": "محتوای سایت",
                "separator": True,
                "items": [
                    _nav("بنرها", "view_carousel", "content_banner"),
                    _nav("ویدیوهای راهنما", "play_circle", "content_guidevideo"),
                ],
            },
            {
                "title": "تنظیمات و امنیت",
                "separator": True,
                "items": [
                    _nav("تنظیمات فروشگاه", "settings", "core_storesettings"),
                    _nav("قالب پیامک‌ها", "sms", "core_smstemplate"),
                    _nav("نقش‌های کارکنان", "admin_panel_settings", "auth_group"),
                    _nav("تاریخچه تغییرات پنل", "history", "admin_logentry"),
                    _nav("کدهای ورود", "password", "accounts_otpcode"),
                ],
            },
        ],
    },
}

# --- growth (research package «و»: apps.growth) -------------------------------------------------
# Torob product API v3 (POST /torob_api/v3/products on the storefront host). Confirm field names,
# price unit and token claims in the Torob seller panel before going live (docs/growth-summary.md).
# TOROB_PUBLIC_KEY: Torob's Ed25519 public key (PEM, base64 or hex). Empty → 403 in production,
# open in DEBUG.
TOROB_PUBLIC_KEY = env("TOROB_PUBLIC_KEY", default="")
TOROB_JWT_AUDIENCE = env("TOROB_JWT_AUDIENCE", default="")
TOROB_JWT_LEEWAY = env.int("TOROB_JWT_LEEWAY", default=60)
TOROB_PRICE_UNIT = env("TOROB_PRICE_UNIT", default="toman")  # "toman" or "rial"
TOROB_GUARANTEE = env("TOROB_GUARANTEE", default="ضمانت اصالت و سلامت فیزیکی کالا")
# Gift links: days the recipient has to claim a paid gift.
GIFT_CLAIM_DAYS = env.int("GIFT_CLAIM_DAYS", default=90)
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"].update(
    {
        "kit_share": env("KIT_SHARE_THROTTLE_RATE", default="30/hour"),
        "gift_claim": env("GIFT_CLAIM_THROTTLE_RATE", default="20/hour"),
    }
)
