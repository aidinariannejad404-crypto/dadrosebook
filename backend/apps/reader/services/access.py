"""Who may read which ebook.

Entitlements belong to Phase 3: ``apps.library.services.entitlements.has_entitlement`` is the one
answer. The reader resolves its checker from ``settings.READER_ENTITLEMENT_CHECKER`` (a dotted path,
default: that function) so tests and future rules (e.g. subscriptions) can swap it.
"""

from collections.abc import Callable
from functools import cache

from django.conf import settings
from django.utils.module_loading import import_string

from apps.catalog.models import Book
from apps.library.models import EbookFile

DEFAULT_CHECKER = "apps.library.services.entitlements.has_entitlement"

EntitlementChecker = Callable[[object, Book], bool]


class ReaderError(Exception):
    status = 400
    code = "reader_error"
    message = "خطا در کتابخوان."


class NoEntitlement(ReaderError):
    status = 403
    code = "no_entitlement"
    message = "این کتاب الکترونیک در کتابخانه شما نیست."


class NoEbook(ReaderError):
    status = 404
    code = "no_ebook"
    message = "نسخه الکترونیک این کتاب هنوز آماده نیست."


@cache
def _load_checker(path: str) -> EntitlementChecker:
    return import_string(path)


def get_checker() -> EntitlementChecker:
    return _load_checker(getattr(settings, "READER_ENTITLEMENT_CHECKER", DEFAULT_CHECKER))


def can_read(user, book: Book) -> bool:
    if user is None or not getattr(user, "is_authenticated", False) or not user.is_active:
        return False
    if user.is_staff and getattr(settings, "READER_STAFF_PREVIEW", True):
        return True  # the store team checks uploaded files in the real reader
    return get_checker()(user, book)


def require_access(user, book: Book) -> None:
    if not can_read(user, book):
        raise NoEntitlement


def active_file(book: Book) -> EbookFile:
    file = EbookFile.objects.filter(book=book, is_active=True).order_by("-version").first()
    if file is None or not file.file:
        raise NoEbook
    return file
