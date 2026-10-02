"""Store-wide settings (singleton ``StoreSettings``)."""

import nh3

ENAMAD_TAGS = {"a", "img"}
ENAMAD_ATTRIBUTES = {
    "a": {"href", "target", "referrerpolicy", "id"},
    "img": {"src", "alt", "referrerpolicy", "id", "width", "height"},
}


def sanitize_enamad_html(html: str | None) -> str:
    """Keep only the ``<a><img></a>`` trust-seal snippet; scripts, styles and handlers are removed.

    ``rel`` is ``noopener`` only: eNamad checks the referrer, so ``noreferrer`` would break it.
    """
    if not html:
        return ""
    return nh3.clean(
        html,
        tags=ENAMAD_TAGS,
        attributes=ENAMAD_ATTRIBUTES,
        url_schemes={"https"},
        link_rel="noopener",
    ).strip()


def get_store_settings():
    """The singleton, created with defaults on first use."""
    from ..models import StoreSettings

    obj = StoreSettings.objects.filter(pk=StoreSettings.SINGLETON_PK).first()
    if obj is None:
        obj, _ = StoreSettings.objects.get_or_create(pk=StoreSettings.SINGLETON_PK)
    return obj
