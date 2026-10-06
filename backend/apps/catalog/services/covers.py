"""Download book covers (and gallery images as sample pages) from their source URLs.

Used by ``manage.py fetch_covers``. Network or image errors are logged and counted, never raised:
one dead URL must not stop the run (it runs on every ``docker compose up``).
"""

import io
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from urllib.parse import urlsplit

import requests
from django.core.files.base import ContentFile
from PIL import Image, UnidentifiedImageError

from .. import seed_data as data
from ..models import Book, BookSamplePage
from .legacy_import import legacy_path

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/129.0.0.0 Safari/537.36"
)
# (connect, read) seconds: a short connect timeout keeps a blocked host from stalling startup.
TIMEOUT = (5, 20)
RETRIES = 3  # retries after the first attempt, for network errors / 429 / 5xx
BACKOFF = 1.0  # seconds; doubles each retry
MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024
# After this many URLs of one host failed at the network level, skip the rest of that host.
HOST_FAILURE_LIMIT = 3

COVER_MAX_HEIGHT = 900
COVER_MAX_BYTES = 400 * 1024
SAMPLE_MAX_HEIGHT = 1400
SAMPLE_MAX_BYTES = 600 * 1024


class FetchError(Exception):
    """A URL could not be turned into an image (message is logged)."""


class HostUnreachable(FetchError):
    """Network-level failure after all retries."""


def make_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
        }
    )
    return session


def download(
    session, url: str, *, retries: int = RETRIES, sleep: Callable[[float], None] | None = None
) -> bytes:
    """GET ``url`` with retries on network errors, 429 and 5xx. Raises ``FetchError``."""
    sleep = sleep or time.sleep
    delay = BACKOFF
    last_error = ""
    for attempt in range(retries + 1):
        if attempt:
            sleep(delay)
            delay *= 2
        try:
            response = session.get(url, timeout=TIMEOUT, stream=False)
        except requests.RequestException as exc:
            last_error = f"{type(exc).__name__}: {exc}"
            continue
        status = response.status_code
        if status == 429 or status >= 500:
            last_error = f"HTTP {status}"
            continue
        if status >= 400:
            raise FetchError(f"HTTP {status}")
        content = response.content
        if len(content) > MAX_DOWNLOAD_BYTES:
            raise FetchError(f"too large ({len(content)} bytes)")
        return content
    if last_error.startswith("HTTP"):
        raise FetchError(f"{last_error} after {retries + 1} attempts")
    raise HostUnreachable(f"{last_error} after {retries + 1} attempts")


def to_web_image(raw: bytes, *, max_height: int, max_bytes: int) -> bytes:
    """Verify ``raw`` is an image; return it as WebP, at most ``max_height`` px tall and
    ``max_bytes`` big (quality first, then size is reduced). Raises ``FetchError``."""
    try:
        with Image.open(io.BytesIO(raw)) as probe:
            probe.verify()
        image = Image.open(io.BytesIO(raw))
        image.load()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise FetchError(f"not an image ({exc})") from exc

    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        rgba = image.convert("RGBA")
        image = Image.new("RGB", rgba.size, (255, 255, 255))
        image.paste(rgba, mask=rgba.getchannel("A"))
    else:
        image = image.convert("RGB")

    if image.height > max_height:
        width = max(1, round(image.width * max_height / image.height))
        image = image.resize((width, max_height), Image.Resampling.LANCZOS)

    while True:
        for quality in (88, 82, 76, 70, 62):
            buffer = io.BytesIO()
            image.save(buffer, "WEBP", quality=quality, method=6)
            if buffer.tell() <= max_bytes:
                return buffer.getvalue()
        if image.width < 200 or image.height < 200:
            return buffer.getvalue()  # tiny already; accept
        image = image.resize(
            (round(image.width * 0.85), round(image.height * 0.85)), Image.Resampling.LANCZOS
        )


@dataclass
class FetchReport:
    covers_saved: int = 0
    covers_skipped: int = 0
    samples_saved: int = 0
    failures: list[tuple[str, str, str]] = field(default_factory=list)  # (book slug, url, error)
    skipped_hosts: set[str] = field(default_factory=set)

    @property
    def failed(self) -> int:
        return len(self.failures)


class _Fetcher:
    def __init__(self, session, report: FetchReport, sleep):
        self.session = session
        self.report = report
        self.sleep = sleep
        self.host_failures: dict[str, int] = {}

    def image(self, book: Book, url: str, *, max_height: int, max_bytes: int) -> bytes | None:
        host = urlsplit(url).hostname or ""
        if host in self.report.skipped_hosts:
            self.report.failures.append((book.slug, url, "host skipped (unreachable)"))
            return None
        try:
            raw = download(self.session, url, sleep=self.sleep)
            self.host_failures[host] = 0
            return to_web_image(raw, max_height=max_height, max_bytes=max_bytes)
        except HostUnreachable as exc:
            count = self.host_failures.get(host, 0) + 1
            self.host_failures[host] = count
            if count >= HOST_FAILURE_LIMIT:
                self.report.skipped_hosts.add(host)
            self._fail(book, url, exc)
        except FetchError as exc:
            self._fail(book, url, exc)
        except Exception as exc:  # noqa: BLE001 — never crash the whole run on one URL
            self._fail(book, url, exc)
        return None

    def _fail(self, book, url, exc):
        logger.warning("fetch_covers: %s — %s: %s", book.slug, url, exc)
        self.report.failures.append((book.slug, url, str(exc)))


def gallery_urls_by_path() -> dict[str, list[str]]:
    """Gallery image URLs of each seeded book (by ``legacy_path``) from the seed JSON."""
    return {legacy_path(r): r.get("gallery_urls") or [] for r in data.load_catalogue()}


def fetch_covers(
    *,
    force: bool = False,
    limit: int | None = None,
    with_samples: bool = False,
    session=None,
    sleep: Callable[[float], None] | None = None,
) -> FetchReport:
    """Download covers for books that have ``cover_source_url`` and no cover (all with ``force``).

    With ``with_samples``, gallery images (except the cover) become ``BookSamplePage`` rows for
    books that have none yet (``force`` replaces them). ``limit`` caps the number of books.
    """
    report = FetchReport()
    fetcher = _Fetcher(session or make_session(), report, sleep)

    books = Book.objects.exclude(cover_source_url="").order_by("id")
    if not force:
        report.covers_skipped = books.exclude(cover="").count()
        books = books.filter(cover="")
    if limit is not None:
        books = books[:limit]
    for book in books:
        content = fetcher.image(
            book, book.cover_source_url, max_height=COVER_MAX_HEIGHT, max_bytes=COVER_MAX_BYTES
        )
        if content is None:
            continue
        if book.cover:
            book.cover.delete(save=False)
        book.cover.save(f"book-{book.pk}.webp", ContentFile(content), save=False)
        book.save(update_fields=["cover", "updated_at"])
        report.covers_saved += 1

    if with_samples:
        _fetch_samples(fetcher, report, force=force, limit=limit)
    return report


def _fetch_samples(fetcher: _Fetcher, report: FetchReport, *, force: bool, limit: int | None):
    galleries = gallery_urls_by_path()
    books = Book.objects.exclude(legacy_path="").order_by("id")
    if not force:
        books = books.filter(sample_pages__isnull=True)
    processed = 0
    for book in books:
        urls = [u for u in galleries.get(book.legacy_path, []) if u != book.cover_source_url]
        if not urls:
            continue
        if limit is not None and processed >= limit:
            break
        processed += 1
        images = []
        for url in urls:
            content = fetcher.image(
                book, url, max_height=SAMPLE_MAX_HEIGHT, max_bytes=SAMPLE_MAX_BYTES
            )
            if content is not None:
                images.append(content)
        if not images:
            continue
        if force:
            for page in book.sample_pages.all():
                page.image.delete(save=False)
                page.delete()
        for order, content in enumerate(images, start=1):
            page = BookSamplePage(book=book, order=order)
            page.image.save(f"book-{book.pk}-{order}.webp", ContentFile(content), save=False)
            page.save()
            report.samples_saved += 1
