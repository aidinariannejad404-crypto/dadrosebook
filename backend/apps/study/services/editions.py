"""Edition upgrades (ه۲): owners of an older edition get a discount on the newer one.

* Ownership = a paid, not cancelled order line of the book, or an active ebook entitlement.
* ``upgrade_offer(user, book)`` — the best active link whose old edition the user owns, unless
  the user already owns the new edition.
* ``apply_upgrade_discounts(lines, user)`` — called by the checkout quote: one unit of each
  eligible line gets ``upgrade_discount_percent`` off its effective price (integer toman).
* ``notify_owners(link)`` — one SMS per owner and link (idempotent, see ``EditionUpgradeNotice``).
"""

import logging
from collections.abc import Iterable

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.core.money import to_persian_digits
from apps.core.services.sms_templates import render_sms
from apps.core.sms_catalog import EDITION_UPGRADE

from ..models import EditionLink, EditionUpgradeNotice

logger = logging.getLogger(__name__)

PAID_EXCLUDED = ("CANCELLED", "FAILED", "PENDING_PAYMENT")


def _authenticated(user) -> bool:
    return user is not None and getattr(user, "is_authenticated", False)


def owned_book_ids(user, book_ids: Iterable[int] | None = None) -> set[int]:
    """Books the user bought (paid order line) or may read (active entitlement)."""
    from apps.library.models import EbookEntitlement
    from apps.orders.models import OrderItem

    if not _authenticated(user):
        return set()
    items = OrderItem.objects.filter(
        order__user=user, order__paid_at__isnull=False, book__isnull=False
    ).exclude(order__status__in=PAID_EXCLUDED)
    ents = EbookEntitlement.objects.filter(user=user, revoked_at__isnull=True)
    if book_ids is not None:
        ids = list(book_ids)
        items = items.filter(book_id__in=ids)
        ents = ents.filter(book_id__in=ids)
    return set(items.values_list("book_id", flat=True)) | set(
        ents.values_list("book_id", flat=True)
    )


def owner_ids(book) -> set[int]:
    """Users who own ``book`` (paid order line or active entitlement)."""
    from apps.library.models import EbookEntitlement
    from apps.orders.models import OrderItem

    buyers = (
        OrderItem.objects.filter(book=book, order__paid_at__isnull=False)
        .exclude(order__status__in=PAID_EXCLUDED)
        .values_list("order__user_id", flat=True)
    )
    readers = EbookEntitlement.objects.filter(book=book, revoked_at__isnull=True).values_list(
        "user_id", flat=True
    )
    return set(buyers) | set(readers)


def best_links(user, book_ids: Iterable[int]) -> dict[int, EditionLink]:
    """``new_book_id → link`` for every book in ``book_ids`` the user may upgrade to."""
    book_ids = set(book_ids)
    if not _authenticated(user) or not book_ids:
        return {}
    links = list(
        EditionLink.objects.filter(is_active=True, new_book_id__in=book_ids).select_related(
            "old_book"
        )
    )
    if not links:
        return {}
    owned = owned_book_ids(user, book_ids | {link.old_book_id for link in links})
    best: dict[int, EditionLink] = {}
    for link in links:
        if link.new_book_id in owned or link.old_book_id not in owned:
            continue
        current = best.get(link.new_book_id)
        if current is None or link.upgrade_discount_percent > current.upgrade_discount_percent:
            best[link.new_book_id] = link
    return best


def edition_label(book) -> str:
    """«ویرایش ۱۴۰۴» from the publish year, else the edition text, else the title."""
    if book.publish_year:
        return f"ویرایش {to_persian_digits(book.publish_year)}"
    if book.edition:
        edition = book.edition.strip()
        return edition if edition.startswith("ویرایش") else f"ویرایش {edition}"
    return f"«{book.title}»"


def upgrade_offer(user, book) -> dict | None:
    link = best_links(user, [book.pk]).get(book.pk)
    if link is None:
        return None
    old = link.old_book
    percent = link.upgrade_discount_percent
    return {
        "percent": percent,
        "old_book": {"title": old.title, "slug": old.slug, "edition_label": edition_label(old)},
        "message": f"شما {edition_label(old)} را دارید؛ ارتقا با "
        f"{to_persian_digits(percent)}٪ تخفیف",
    }


def upgrade_amount(unit_price: int, percent: int) -> int:
    return max(0, min(unit_price, unit_price * percent // 100))


def apply_upgrade_discounts(lines: list[dict], user) -> int:
    """Discount one unit of each upgradeable line in place; returns the total discount.

    Each changed line gets ``upgrade_discount`` (toman) and ``upgrade_label``; ``line_total``
    drops by that amount, and for a single unit ``unit_price`` drops too (so the order line
    snapshot stays ``unit_price × quantity``).
    """
    links = best_links(user, {line["book_id"] for line in lines})
    total = 0
    for line in lines:
        link = links.get(line["book_id"])
        if link is None:
            continue
        amount = upgrade_amount(line["unit_price"], link.upgrade_discount_percent)
        if amount <= 0:
            continue
        line["upgrade_discount"] = amount
        line["upgrade_label"] = (
            f"تخفیف ارتقا از {edition_label(link.old_book)} "
            f"({to_persian_digits(link.upgrade_discount_percent)}٪)"
        )
        if line["quantity"] == 1:
            line["unit_price"] -= amount
        line["line_total"] -= amount
        total += amount
    return total


def upgrade_sms_text(link: EditionLink) -> str | None:
    new = link.new_book
    return render_sms(
        EDITION_UPGRADE,
        book=new.title,
        edition=edition_label(new),
        old_edition=edition_label(link.old_book),
        percent=to_persian_digits(link.upgrade_discount_percent),
        link=f"{settings.SITE_URL.rstrip('/')}/product/{new.slug}",
    )


def notify_owners(link: EditionLink) -> int:
    """SMS every owner of the old edition who has not been told yet; returns how many."""
    from apps.accounts.models import User
    from apps.accounts.tasks import send_sms

    link = EditionLink.objects.select_related("new_book", "old_book").get(pk=link.pk)
    if not link.is_active:
        return 0
    text = upgrade_sms_text(link)
    if text is None:  # staff turned the template off
        return 0
    targets = owner_ids(link.old_book) - owner_ids(link.new_book)
    already = set(EditionUpgradeNotice.objects.filter(link=link).values_list("user_id", flat=True))
    sent = 0
    for user in User.objects.filter(pk__in=targets - already, is_active=True).order_by("pk"):
        try:
            with transaction.atomic():
                EditionUpgradeNotice.objects.create(link=link, user=user)
                transaction.on_commit(lambda p=user.phone, t=text: send_sms.delay(p, t))
        except IntegrityError:  # a concurrent run already told this user
            continue
        sent += 1
    EditionLink.objects.filter(pk=link.pk).update(notified_at=timezone.now())
    logger.info("edition upgrade %s: %s owners notified", link.pk, sent)
    return sent
