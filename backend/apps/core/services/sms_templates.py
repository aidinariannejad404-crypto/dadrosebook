"""Render the store's SMS texts from the admin-edited templates."""

import logging
import string

from ..sms_catalog import KINDS

logger = logging.getLogger(__name__)


def placeholders_in(body: str) -> set[str]:
    """Field names used in ``body``; raises ``ValueError`` on broken braces."""
    return {name for _, name, _, _ in string.Formatter().parse(body) if name is not None}


def unknown_placeholders(key: str, body: str) -> set[str]:
    return placeholders_in(body) - set(KINDS[key].placeholders)


class _Defaulting(dict):
    def __missing__(self, name):
        return ""


def render(key: str, body: str, context: dict) -> str:
    return string.Formatter().vformat(body, (), _Defaulting(context)).strip()


def render_sms(key: str, **context) -> str | None:
    """The message for ``key`` with ``context`` filled in, or ``None`` when staff turned it off.

    A template that fails to render (e.g. edited into something broken) falls back to the default
    text, so a typo in the admin never stops an order SMS.
    """
    from ..models import SmsTemplate

    kind = KINDS[key]
    row = SmsTemplate.objects.filter(key=key).first()
    if row is not None and not row.is_active:
        return None
    body = row.body if row is not None else kind.default
    try:
        return render(key, body, context)
    except (ValueError, IndexError, KeyError):
        logger.exception("SMS template %s is broken; using the default text", key)
        return render(key, kind.default, context)


def ensure_templates() -> None:
    """Create a row (with the default text) for every SMS kind that has none."""
    from ..models import SmsTemplate

    for key, kind in KINDS.items():
        SmsTemplate.objects.get_or_create(key=key, defaults={"body": kind.default})
