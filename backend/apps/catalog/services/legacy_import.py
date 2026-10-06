"""Pure helpers that map a record scraped from the old store (Sazito) onto our models.

Used by ``services.seed``; every function here is side-effect free and tested on its own.
"""

import datetime as dt
import re
from dataclasses import dataclass
from urllib.parse import unquote, urlsplit

import jdatetime

from apps.core.money import format_toman, to_persian_digits
from apps.core.normalize import normalize_persian

from .. import seed_data as data

TEXTBOOK = "TEXTBOOK"
TESTS = "TESTS"
LAWS = "LAWS"
QUICK_REVIEW = "QUICK_REVIEW"
COURSE_NOTES = "COURSE_NOTES"

# Matched against the title normalised with ZWNJ/spaces removed («سریع‌خوان» = «سریع خوان»).
_TESTS_MARKERS = ("تست", "چهارگزینه", "مجموعهسوالات", "مجموعهپرسش", "مجموعهآزمون")
_LAWS_MARKERS = ("قوانین", "تحریری", "قانونیار")


def legacy_path(record: dict) -> str:
    """Decoded old path, e.g. ``/product/آیین-دادرسی-مدنی-45370``."""
    return unquote(record.get("old_url_encoded") or record["old_url"])


def old_slug(record: dict) -> str:
    """The old store's product slug, exactly as on the old site (URL-decoded)."""
    path = legacy_path(record)
    prefix = "/product/"
    if not path.startswith(prefix):
        raise ValueError(f"not a product URL: {path!r}")
    return path[len(prefix) :].strip("/")


def _compact(text: str) -> str:
    return normalize_persian(text, zwnj="remove").replace(" ", "")


def infer_resource_type(record: dict) -> str:
    """Resource type from the title (the old store has no such field).

    سریع‌خوان → QUICK_REVIEW; «جزوه» → COURSE_NOTES; «تست» or a question bank
    («مجموعه سوالات/پرسش/آزمون‌ها», «چهارگزینه‌ای») → TESTS; law texts («قوانین»، «… تحریری»،
    «قانون‌یار»، titles starting with «قانون») → LAWS; everything else → TEXTBOOK.
    """
    title = _compact(record.get("title") or "")
    if record.get("is_quick_review") or "سریعخوان" in title:
        return QUICK_REVIEW
    if "جزوه" in title:
        return COURSE_NOTES
    if any(marker in title for marker in _TESTS_MARKERS):
        return TESTS
    if any(marker in title for marker in _LAWS_MARKERS) or title.startswith("قانون"):
        return LAWS
    return TEXTBOOK


def stock_for(record: dict) -> int:
    if not record.get("in_stock"):
        return 0
    return record.get("stock") or data.DEFAULT_STOCK


def jalali_label(iso_date: str | None) -> str:
    """``"2026-10-02"`` → ``"۱۴۰۵/۰۷/۱۰"`` (empty when unknown)."""
    if not iso_date:
        return ""
    day = jdatetime.date.fromgregorian(date=dt.date.fromisoformat(iso_date))
    return to_persian_digits(day.strftime("%Y/%m/%d"))


@dataclass(frozen=True)
class PriceDecision:
    price: int
    sale_price: int | None
    note: str
    old_price: int

    @property
    def changed(self) -> bool:
        return self.price != self.old_price


def price_decision(record: dict) -> PriceDecision:
    """Apply the owner's price policy: use the publisher's current price when it is higher.

    ``market_price`` (publisher cover price) above the old store's price replaces it; a sale
    price that is no longer below the new price is dropped. ``note`` says where the price came
    from (shown in the admin as «منبع قیمت»).
    """
    price = int(record["price"])
    sale = record.get("sale_price")
    market = record.get("market_price")
    checked = jalali_label(record.get("checked"))
    if market and market > price:
        host = urlsplit(record.get("market_price_source") or "").hostname or "ناشر"
        host = host.removeprefix("www.")
        new_sale = sale if sale is not None and sale < market else None
        note = (
            f"به‌روزشده از قیمت ناشر ({host}) {checked}؛ قیمت سایت قبلی {format_toman(price)}"
        ).strip()
        return PriceDecision(int(market), new_sale, note, price)
    note = f"قیمت سایت قبلی (dadrosebook.com) {checked}".strip()
    return PriceDecision(price, sale, note, price)


def sales_ranks(records: list[dict]) -> dict[str, int]:
    """Synthetic ``sales_count`` per old slug (no sales data exists).

    In-stock books first, then out-of-stock ones; within each group the old store's order. The
    first book gets ``len(records)``, the last gets 1.
    """
    ordered = [r for r in records if r.get("in_stock")] + [
        r for r in records if not r.get("in_stock")
    ]
    total = len(ordered)
    return {old_slug(r): total - i for i, r in enumerate(ordered)}


# --- description HTML --------------------------------------------------------------------------

_ATTR_URL_RE = re.compile(r"""(?P<attr>\b(?:src|href))=(?P<q>["'])(?P<url>/[^"']*)(?P=q)""", re.I)
_ANCHOR_RE = re.compile(r"<a\b(?P<attrs>[^>]*)>(?P<text>.*?)</a\s*>", re.I | re.S)
_HREF_RE = re.compile(r"""\bhref=(["'])(?P<url>[^"']*)\1""", re.I)


def _host(url: str) -> str:
    return (urlsplit(url).hostname or "").lower()


def _is_retailer(host: str) -> bool:
    return any(host == h or host.endswith("." + h) for h in data.RETAILER_HOSTS)


def rewrite_description(html: str, image_urls: list[str] | None = None) -> str:
    """Make an old-store description work on the new site (sanitising happens on save).

    - relative ``/uploads/...`` ``src``/``href`` → the absolute copy from ``image_urls`` (matched
      by path suffix), otherwise ``https://dadrosebook.com/uploads/...``;
    - links to the old store's own products/categories → relative ``/product/…``,
      ``/category/…`` (same URL scheme here, so they stay on this site);
    - links to other retailers (``RETAILER_HOSTS``) are removed, their text is kept.
    """
    if not html:
        return ""
    image_urls = image_urls or []

    def absolutise(match: re.Match) -> str:
        url = match["url"]
        if url.startswith(("//", "/product/", "/category/")):
            return match[0]  # protocol-relative, or a page that keeps its URL here
        absolute = next((u for u in image_urls if u.endswith(url)), None)
        if absolute is None:
            absolute = data.OLD_SITE + url
        return f"{match['attr']}={match['q']}{absolute}{match['q']}"

    html = _ATTR_URL_RE.sub(absolutise, html)

    def fix_anchor(match: re.Match) -> str:
        href = _HREF_RE.search(match["attrs"])
        if not href:
            return match[0]
        url = href["url"].strip()
        host = _host(url)
        if _is_retailer(host):
            return match["text"]
        if host in data.OLD_SITE_HOSTS:
            parts = urlsplit(url)
            if parts.path.startswith(("/product/", "/category/")):
                attrs = match["attrs"].replace(href[0], f'href="{parts.path}"')
                return f"<a{attrs}>{match['text']}</a>"
        return match[0]

    return _ANCHOR_RE.sub(fix_anchor, html)
