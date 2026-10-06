"""``fetch_covers``: mocked HTTP session, plus one run against a local ``http.server``."""

import functools
import http.server
import io
import threading
from pathlib import Path

import pytest
import requests
from django.core.management import call_command
from PIL import Image

from apps.catalog import seed_data
from apps.catalog.models import Book, BookSamplePage
from apps.catalog.services import covers
from apps.catalog.services.covers import FetchError, download, fetch_covers, to_web_image

pytestmark = pytest.mark.django_db


def image_bytes(size=(600, 1800), fmt="PNG", mode="RGB") -> bytes:
    buffer = io.BytesIO()
    Image.new(mode, size, (200, 30, 30, 128) if mode == "RGBA" else (200, 30, 30)).save(buffer, fmt)
    return buffer.getvalue()


class FakeResponse:
    def __init__(self, status=200, content=b""):
        self.status_code = status
        self.content = content


class FakeSession:
    """``responses`` maps URL → list of responses/exceptions, consumed in order."""

    def __init__(self, responses):
        self.responses = {url: list(items) for url, items in responses.items()}
        self.calls = []

    def get(self, url, timeout=None, **kwargs):
        self.calls.append(url)
        items = self.responses.get(url) or [requests.ConnectionError("no route")]
        item = items.pop(0) if len(items) > 1 else items[0]
        if isinstance(item, Exception):
            raise item
        return item


def no_sleep(_seconds):
    pass


@pytest.fixture(autouse=True)
def media(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    settings.STORAGES = {
        **settings.STORAGES,
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
            "OPTIONS": {"location": str(tmp_path), "base_url": "/media/"},
        },
    }
    return tmp_path


def make_book(slug, url, legacy=""):
    return Book.objects.create(title=slug, slug=slug, cover_source_url=url, legacy_path=legacy)


def test_to_web_image_resizes_and_limits_size():
    out = to_web_image(image_bytes((1200, 3000)), max_height=900, max_bytes=400 * 1024)
    image = Image.open(io.BytesIO(out))
    assert image.format == "WEBP" and image.height == 900 and image.width == 360
    assert len(out) <= 400 * 1024
    transparent = to_web_image(image_bytes(mode="RGBA"), max_height=900, max_bytes=400 * 1024)
    assert Image.open(io.BytesIO(transparent)).mode == "RGB"
    with pytest.raises(FetchError):
        to_web_image(b"<html>not an image</html>", max_height=900, max_bytes=1000)


def test_download_retries_then_succeeds():
    session = FakeSession(
        {"u": [requests.Timeout("slow"), FakeResponse(503), FakeResponse(200, b"ok")]}
    )
    assert download(session, "u", sleep=no_sleep) == b"ok"
    assert len(session.calls) == 3


def test_download_gives_up_and_does_not_retry_404():
    session = FakeSession({"u": [requests.ConnectionError("down")]})
    with pytest.raises(covers.HostUnreachable):
        download(session, "u", sleep=no_sleep)
    assert len(session.calls) == 1 + covers.RETRIES
    missing = FakeSession({"m": [FakeResponse(404)]})
    with pytest.raises(FetchError, match="404"):
        download(missing, "m", sleep=no_sleep)
    assert len(missing.calls) == 1


def test_fetch_covers_with_mocked_session(media):
    ok = make_book("ok", "https://img.test/ok.png")
    bad = make_book("bad", "https://img.test/bad.png")
    html = make_book("html", "https://img.test/page.html")
    Book.objects.create(title="no source", slug="no-source")
    session = FakeSession(
        {
            "https://img.test/ok.png": [FakeResponse(200, image_bytes())],
            "https://img.test/bad.png": [FakeResponse(404)],
            "https://img.test/page.html": [FakeResponse(200, b"<html></html>")],
        }
    )

    report = fetch_covers(session=session, sleep=no_sleep)

    assert report.covers_saved == 1 and report.failed == 2
    ok.refresh_from_db()
    bad.refresh_from_db()
    html.refresh_from_db()
    assert ok.cover.name.endswith(".webp") and not bad.cover and not html.cover
    stored = Image.open(ok.cover.path)
    assert stored.format == "WEBP" and stored.height == 900
    assert Path(ok.cover.path).stat().st_size <= covers.COVER_MAX_BYTES

    # Idempotent: books that have a cover are skipped unless --force.
    session.calls.clear()
    again = fetch_covers(session=session, sleep=no_sleep)
    assert again.covers_saved == 0 and again.covers_skipped == 1
    assert "https://img.test/ok.png" not in session.calls
    forced = fetch_covers(session=session, sleep=no_sleep, force=True, limit=1)
    assert forced.covers_saved == 1 and session.calls.count("https://img.test/ok.png") == 1


def test_unreachable_host_is_skipped_after_a_few_failures():
    for i in range(6):
        make_book(f"b{i}", f"https://down.test/{i}.jpg")
    session = FakeSession({})
    report = fetch_covers(session=session, sleep=no_sleep)
    assert report.failed == 6 and report.covers_saved == 0
    assert report.skipped_hosts == {"down.test"}
    assert len(session.calls) == covers.HOST_FAILURE_LIMIT * (1 + covers.RETRIES)


def test_with_samples_saves_gallery_except_cover(monkeypatch):
    cover = "https://img.test/cover.png"
    book = make_book("g", cover, legacy="/product/g")
    gallery = [cover, "https://img.test/p1.png", "https://img.test/p2.png"]
    monkeypatch.setattr(covers, "gallery_urls_by_path", lambda: {"/product/g": gallery})
    session = FakeSession({url: [FakeResponse(200, image_bytes((800, 600)))] for url in gallery})

    report = fetch_covers(session=session, sleep=no_sleep, with_samples=True)
    assert report.covers_saved == 1 and report.samples_saved == 2
    pages = list(book.sample_pages.order_by("order"))
    assert [p.order for p in pages] == [1, 2]
    assert session.calls.count(cover) == 1

    report = fetch_covers(session=session, sleep=no_sleep, with_samples=True)
    assert report.samples_saved == 0 and BookSamplePage.objects.count() == 2


def test_command_never_crashes(monkeypatch, capsys):
    make_book("x", "https://img.test/x.png")
    monkeypatch.setattr(covers, "make_session", lambda: FakeSession({}))
    monkeypatch.setattr(covers.time, "sleep", no_sleep)
    call_command("fetch_covers", "--limit", "5")
    out = capsys.readouterr()
    assert "0 saved" in out.out and "1 failed" in out.out


def test_gallery_urls_come_from_seed_json():
    galleries = covers.gallery_urls_by_path()
    records = seed_data.load_catalogue()
    assert len(galleries) == len(records)
    assert galleries["/product/صفر-تا-صد-متون-فقه"] == records[0]["gallery_urls"]


@pytest.fixture
def image_server(tmp_path):
    root = tmp_path / "www"
    root.mkdir()
    (root / "cover.jpg").write_bytes(image_bytes((700, 2100), "JPEG"))
    (root / "page.html").write_text("<html></html>")

    class QuietHandler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(
        ("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(root))
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


def test_fetch_from_local_http_server(image_server, monkeypatch):
    monkeypatch.setattr(covers.time, "sleep", no_sleep)
    real = make_book("real", f"{image_server}/cover.jpg")
    missing = make_book("missing", f"{image_server}/nope.jpg")
    html = make_book("html", f"{image_server}/page.html")

    call_command("fetch_covers")

    real.refresh_from_db()
    missing.refresh_from_db()
    html.refresh_from_db()
    assert real.cover and Image.open(real.cover.path).size == (300, 900)
    assert not missing.cover and not html.cover
