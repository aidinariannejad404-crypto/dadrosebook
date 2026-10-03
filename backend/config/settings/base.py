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
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
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
    },
    # Set to the number of trusted reverse proxies in prod so the client IP is read correctly.
    "NUM_PROXIES": env.int("NUM_PROXIES", default=None),
}

# --- CORS / CSRF --------------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:3000"])
# Auth cookies travel with credentialed requests from the storefront origin.
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = (*default_headers, "x-cart-token")
CORS_EXPOSE_HEADERS = ["X-Search-Relaxed"]
CSRF_TRUSTED_ORIGINS = env.list(
    "CSRF_TRUSTED_ORIGINS", default=["http://localhost:8000", "http://localhost:3000"]
)

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

# --- caching knobs ------------------------------------------------------------------------------
HOME_CACHE_SECONDS = env.int("HOME_CACHE_SECONDS", default=60)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}

# --- Admin (django-unfold) ----------------------------------------------------------------------
UNFOLD = {
    "SITE_TITLE": "پنل مدیریت دادرُز",
    "SITE_HEADER": "پنل مدیریت دادرُز",
    "SITE_SUBHEADER": "فروشگاه کتاب دادرُز",
    "SITE_URL": "/",
    "SITE_SYMBOL": "menu_book",
    "SHOW_HISTORY": True,
    "SHOW_VIEW_ON_SITE": False,
    "STYLES": [
        lambda request: static("admin_theme/admin.css"),  # Vazirmatn
        lambda request: static("admin_theme/unfold-rtl.css"),  # see build_admin_rtl_css
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
                "title": "کاتالوگ",
                "separator": True,
                "items": [
                    {
                        "title": "کتاب‌ها",
                        "icon": "menu_book",
                        "link": reverse_lazy("admin:catalog_book_changelist"),
                    },
                    {
                        "title": "نسخه‌ها و قیمت‌ها",
                        "icon": "sell",
                        "link": reverse_lazy("admin:catalog_bookvariant_changelist"),
                    },
                    {
                        "title": "درس‌ها",
                        "icon": "palette",
                        "link": reverse_lazy("admin:catalog_subject_changelist"),
                    },
                    {
                        "title": "آزمون‌ها",
                        "icon": "school",
                        "link": reverse_lazy("admin:catalog_examtype_changelist"),
                    },
                    {
                        "title": "تاریخ آزمون‌ها",
                        "icon": "event",
                        "link": reverse_lazy("admin:catalog_examevent_changelist"),
                    },
                    {
                        "title": "دسته‌بندی‌ها",
                        "icon": "account_tree",
                        "link": reverse_lazy("admin:catalog_category_changelist"),
                    },
                    {
                        "title": "نویسندگان و مترجمان",
                        "icon": "person_edit",
                        "link": reverse_lazy("admin:catalog_person_changelist"),
                    },
                    {
                        "title": "ناشران",
                        "icon": "domain",
                        "link": reverse_lazy("admin:catalog_publisher_changelist"),
                    },
                    {
                        "title": "بسته‌های مطالعاتی",
                        "icon": "library_books",
                        "link": reverse_lazy("admin:catalog_studykitrecommendation_changelist"),
                    },
                    {
                        "title": "دوره‌های مرتبط",
                        "icon": "cast_for_education",
                        "link": reverse_lazy("admin:catalog_relatedcourse_changelist"),
                    },
                ],
            },
            {
                "title": "فروش",
                "separator": True,
                "items": [
                    {
                        "title": "سفارش‌ها",
                        "icon": "receipt_long",
                        "link": reverse_lazy("admin:orders_order_changelist"),
                    },
                    {
                        "title": "پرداخت‌ها",
                        "icon": "payments",
                        "link": reverse_lazy("admin:payments_payment_changelist"),
                    },
                    {
                        "title": "کدهای تخفیف",
                        "icon": "sell",
                        "link": reverse_lazy("admin:orders_discountcode_changelist"),
                    },
                    {
                        "title": "استفاده‌های کد تخفیف",
                        "icon": "redeem",
                        "link": reverse_lazy("admin:orders_discountredemption_changelist"),
                    },
                    {
                        "title": "روش‌های ارسال",
                        "icon": "local_shipping",
                        "link": reverse_lazy("admin:orders_shippingmethod_changelist"),
                    },
                    {
                        "title": "دسترسی‌های کتاب الکترونیک",
                        "icon": "local_library",
                        "link": reverse_lazy("admin:library_ebookentitlement_changelist"),
                    },
                    {
                        "title": "فایل‌های کتاب الکترونیک",
                        "icon": "picture_as_pdf",
                        "link": reverse_lazy("admin:library_ebookfile_changelist"),
                    },
                ],
            },
            {
                "title": "نظرات کاربران",
                "separator": True,
                "items": [
                    {
                        "title": "نظرات",
                        "icon": "reviews",
                        "link": reverse_lazy("admin:reviews_review_changelist"),
                    },
                    {
                        "title": "علاقه‌مندی‌ها",
                        "icon": "favorite",
                        "link": reverse_lazy("admin:wishlist_wishlistitem_changelist"),
                    },
                ],
            },
            {
                "title": "محتوای صفحه اصلی",
                "separator": True,
                "items": [
                    {
                        "title": "بنرها",
                        "icon": "web",
                        "link": reverse_lazy("admin:content_banner_changelist"),
                    },
                    {
                        "title": "ویدیوهای راهنما",
                        "icon": "smart_display",
                        "link": reverse_lazy("admin:content_guidevideo_changelist"),
                    },
                ],
            },
            {
                "title": "فروش",
                "separator": True,
                "items": [
                    {
                        "title": "سبدهای خرید",
                        "icon": "shopping_cart",
                        "link": reverse_lazy("admin:cart_cart_changelist"),
                    },
                    {
                        "title": "موجود شد خبرم کن",
                        "icon": "notifications_active",
                        "link": reverse_lazy("admin:engagement_backinstockrequest_changelist"),
                    },
                ],
            },
            {
                "title": "تنظیمات",
                "separator": True,
                "items": [
                    {
                        "title": "تنظیمات فروشگاه",
                        "icon": "storefront",
                        "link": reverse_lazy("admin:core_storesettings_changelist"),
                    },
                ],
            },
            {
                "title": "کاربران",
                "separator": True,
                "items": [
                    {
                        "title": "کاربران",
                        "icon": "people",
                        "link": reverse_lazy("admin:accounts_user_changelist"),
                    },
                    {
                        "title": "نشانی‌ها",
                        "icon": "home_pin",
                        "link": reverse_lazy("admin:orders_address_changelist"),
                    },
                    {
                        "title": "کدهای ورود",
                        "icon": "password",
                        "link": reverse_lazy("admin:accounts_otpcode_changelist"),
                    },
                    {
                        "title": "گروه‌ها",
                        "icon": "group",
                        "link": reverse_lazy("admin:auth_group_changelist"),
                    },
                ],
            },
        ],
    },
}
