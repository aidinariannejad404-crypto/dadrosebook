from .base import *  # noqa: F403
from .base import BASE_DIR

DEBUG = False
SECRET_KEY = "test-secret-key"  # noqa: S105
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
CELERY_TASK_ALWAYS_EAGER = True
MEDIA_ROOT = BASE_DIR / ".test-media"
PRIVATE_MEDIA_ROOT = BASE_DIR / ".test-private-media"
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
        "OPTIONS": {"location": str(MEDIA_ROOT), "base_url": "/media/"},
    },
    "private": {"BACKEND": "apps.core.storages.PrivateFileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
ALLOWED_HOSTS = ["testserver", "localhost"]
# Admin tests use force_login; the 2FA tests turn this on with override_settings.
STAFF_2FA_REQUIRED = False
ADMIN_ALLOWED_IPS: list[str] = []
