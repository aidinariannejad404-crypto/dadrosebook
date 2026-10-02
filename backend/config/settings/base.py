"""Base settings shared by every environment. Values come from the environment (django-environ)."""

from pathlib import Path

import environ
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
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardPagination",
    "PAGE_SIZE": 24,
    "UNAUTHENTICATED_USER": None,
    # ``?format=`` is a catalog filter (print/ebook/bundle), not DRF renderer selection.
    "URL_FORMAT_OVERRIDE": None,
    # Only views that set ``throttle_scope`` are throttled (per client IP).
    "DEFAULT_THROTTLE_RATES": {
        "study_plan": env("STUDY_PLAN_THROTTLE_RATE", default="10/hour"),
    },
    # Set to the number of trusted reverse proxies in prod so the client IP is read correctly.
    "NUM_PROXIES": env.int("NUM_PROXIES", default=None),
}

# --- CORS / CSRF --------------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:3000"])
CSRF_TRUSTED_ORIGINS = env.list(
    "CSRF_TRUSTED_ORIGINS", default=["http://localhost:8000", "http://localhost:3000"]
)

# --- Celery -------------------------------------------------------------------------------------
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default=REDIS_URL)
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default=REDIS_URL)
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]

# --- integrations -------------------------------------------------------------------------------
SMS_PROVIDER = env("SMS_PROVIDER", default="console")

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
                        "title": "گروه‌ها",
                        "icon": "group",
                        "link": reverse_lazy("admin:auth_group_changelist"),
                    },
                ],
            },
        ],
    },
}
