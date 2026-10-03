"""Default redirects from the old Sazito store (``manage.py seed_redirects``, also run by
``seed_catalog``).

Idempotent and conservative: only missing redirects are created (matched by key), so rows the
store team edited or deactivated in the admin are never touched.
"""

from django.core.exceptions import ValidationError

from apps.catalog import seed_data
from apps.catalog.models import Book, Category
from apps.catalog.services.legacy_import import legacy_path, old_slug

from ..models import Redirect
from .keys import redirect_key
from .redirects import validate_redirect

ACADEMY_URL = "https://dadrose.com/"
# Old categories that are not migrated → where their visitors should land. Others → "/".
CATEGORY_TARGETS = {"دوره-های-آموزشی": ACADEMY_URL}

ASSUMED_NOTE = "مسیر استاندارد فروشگاه‌های سازیتو (فرض‌شده، در خروجی سایت قبلی بررسی نشده است)."
# (old path, new path, note). /search and /login exist on the new site with the same path.
SAZITO_STANDARD_PATHS = [
    ("/products", "/search", ASSUMED_NOTE),
    ("/blog", "https://dadrose.com/blog/", ASSUMED_NOTE),
    ("/page/about-us", "/", ASSUMED_NOTE + " تا ساخته شدن صفحه درباره ما."),
    ("/page/contact-us", "/", ASSUMED_NOTE + " تا ساخته شدن صفحه تماس با ما."),
    ("/register", "/login", ASSUMED_NOTE),
    ("/profile", "/account", ASSUMED_NOTE),
]


def product_redirects() -> list[tuple[str, str, str]]:
    """Old product URLs whose book now has a different slug."""
    specs = []
    for record in seed_data.load_catalogue():
        path = legacy_path(record)
        book = Book.objects.filter(legacy_path=path).only("slug").first()
        if book and book.slug != old_slug(record):
            specs.append((path, f"/product/{book.slug}", "نامک کتاب در سایت جدید تغییر کرده است."))
    return specs


def category_redirects() -> list[tuple[str, str, str]]:
    """Old category paths without an active category of the same slug."""
    active = set(Category.objects.filter(is_active=True).values_list("slug", flat=True))
    if not active:  # catalogue not seeded yet: nothing to compare against
        return []
    specs = []
    for row in seed_data.load_old_categories():
        slug = row.get("slug")
        if not slug or slug in active:
            continue
        target = CATEGORY_TARGETS.get(slug, "/")
        specs.append((f"/category/{slug}", target, "دسته‌بندی سایت قبلی که منتقل نشده است."))
    return specs


def default_redirects() -> list[tuple[str, str, str]]:
    return product_redirects() + category_redirects() + SAZITO_STANDARD_PATHS


def seed_redirects() -> dict[str, int]:
    counts = {"created": 0, "existing": 0, "invalid": 0}
    existing = set(Redirect.objects.values_list("old_path_key", flat=True))
    for old_path, new_path, note in default_redirects():
        key = redirect_key(old_path)
        if key in existing:
            counts["existing"] += 1
            continue
        try:
            validate_redirect(old_path, new_path)
        except ValidationError:
            counts["invalid"] += 1
            continue
        Redirect.objects.create(
            old_path=old_path, new_path=new_path, note=note, source=Redirect.Source.SEED
        )
        existing.add(key)
        counts["created"] += 1
    return counts
