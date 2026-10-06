"""د۵: the free sample in the real reader (no login), never more than the sample."""

import pytest
from django.core.cache import cache
from django.core.files.base import ContentFile

from apps.catalog.models import BookVariant
from apps.library.models import EbookFile
from apps.reader.models import PdfSample
from apps.reader.sample_epub import PAGE, PARA, build_epub
from apps.reader.services import files, pdf, sample
from apps.reader.services.epub import CHARS_PER_PAGE, html_text, process_epub
from apps.reader.services.fold import utf16_len

from .pdfbuild import build_pdf

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def clear_throttles():
    cache.clear()
    yield
    cache.clear()


def url(book, tail=""):
    return f"/api/v1/library/{book.slug}/sample/{tail}"


def big_epub(chapters: int = 6, paras: int = 40, image_first: bool = True) -> bytes:
    """An EPUB whose chapters are each ``paras`` paragraphs long (≈ 3 virtual pages each)."""
    opf_items = "".join(
        f'<item id="c{i}" href="text/c{i}.xhtml" media-type="application/xhtml+xml"/>'
        for i in range(chapters)
    )
    refs = "".join(f'<itemref idref="c{i}"/>' for i in range(chapters))
    files = {
        "OEBPS/content.opf": (
            '<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" '
            'version="3.0" unique-identifier="id"><metadata '
            'xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">b</dc:identifier>'
            "<dc:title>کتاب</dc:title><dc:language>fa</dc:language></metadata><manifest>"
            f'{opf_items}<item id="img" href="images/seal.png" media-type="image/png"/>'
            f"</manifest><spine>{refs}</spine></package>"
        )
    }
    for i in range(chapters):
        body = f"<h1>فصل {i}</h1>"
        if i == 0 and image_first:
            body += '<img src="../images/seal.png" alt="مهر"/>'
        body += "".join(f"<p>بند {j} فصل {i}: {PARA}</p>" for j in range(paras))
        if i == chapters - 1:
            body += '<img src="../images/seal.png" alt="مهر"/><p>پایان-محرمانه</p>'
        files[f"OEBPS/text/c{i}.xhtml"] = PAGE.format(title=f"فصل {i}", body=body)
    return build_epub(files, omit=("OEBPS/nav.xhtml", "OEBPS/text/ch1.xhtml"))


@pytest.fixture
def big(book, make_epub_file):
    ebook = make_epub_file(big_epub())
    process_epub(ebook)
    return ebook


# ---------- size rules ----------


@pytest.mark.parametrize(
    ("total", "admin", "expected"),
    [
        (100, None, 10),  # 10%
        (1000, None, 30),  # capped at 30 pages
        (5, None, 1),
        (1, None, 1),
        (100, 40, 40),  # admin choice
        (100, 90, 50),  # never more than half
    ],
)
def test_sample_page_count(total, admin, expected):
    ebook = EbookFile(sample_pages=admin)
    assert sample.sample_page_count(ebook, total) == expected


def test_truncate_html_closes_tags_and_keeps_offsets_prefix():
    html = '<h1>عنوان</h1><p>یک <strong>دو سه</strong> چهار</p><p id="x">پنج</p>'
    out = sample.truncate_html(html, 9)
    assert out.endswith("</strong></p>") and "پنج" not in out
    assert html_text(html).startswith(html_text(out).rstrip("…"))


# ---------- EPUB ----------


def test_epub_plan_whole_chapters_then_a_cut_one(big):
    package = big.epub_package
    plan = sample.epub_plan(big, package)
    budget = sample.sample_page_count(big, package.total_pages) * CHARS_PER_PAGE
    assert sum(c.chars for c in plan) <= budget
    assert plan[0].index == 0
    assert all(c.limit is None for c in plan[:-1])
    assert len(plan) < package.chapters.count()


def test_anonymous_sample_session(api, book, big):
    res = api.get(url(book))
    assert res.status_code == 200
    body = res.json()
    assert body["format"] == "EPUB" and body["watermark"] == "نمونه رایگان"
    assert body["owned"] is False and body["file_url"] == ""
    chapters = body["epub"]["chapters"]
    assert body["sample_pages"] == body["epub"]["total_pages"] < body["total_pages"]
    assert {t["chapter"] for t in body["epub"]["toc"]} <= {c["index"] for c in chapters}
    assert "no-store" in res["Cache-Control"]


def test_sample_chapters_stop_at_the_sample(api, book, big):
    chapters = api.get(url(book)).json()["epub"]["chapters"]
    last = chapters[-1]
    res = api.get(url(book, f"chapters/{last['index']}/"))
    assert res.status_code == 200
    data = res.json()
    assert data["sample_end"] is True and data["next"] is None
    full = big.epub_package.chapters.get(index=last["index"])
    assert utf16_len(html_text(data["html"])) < full.chars
    # the next chapter (and the end of the book) is never served
    beyond = api.get(url(book, f"chapters/{last['index'] + 1}/"))
    assert beyond.status_code == 404 and beyond.json()["code"] == "no_sample"
    final = big.epub_package.chapters.count() - 1
    assert api.get(url(book, f"chapters/{final}/")).status_code == 404


def test_sample_images_are_signed_only_inside_the_sample(api, book, big):
    first = api.get(url(book, "chapters/0/")).json()
    src = first["html"].split('src="', 1)[1].split('"', 1)[0]
    assert src.startswith("/api/v1/library/sample-assets/")
    assert api.get(src).status_code == 200
    token = sample.signing.dumps({"a": 999999}, salt=sample.SAMPLE_ASSET_SALT)
    assert api.get(f"/api/v1/library/sample-assets/{token}/").status_code == 404


def _asset_token(asset):
    return sample.signing.dumps({"a": asset.pk}, salt=sample.SAMPLE_ASSET_SALT)


def test_sample_asset_of_a_later_chapter_is_refused(book, make_epub_file):
    ebook = make_epub_file(big_epub(image_first=False))  # the image is only in the last chapter
    asset = process_epub(ebook).assets.get()
    with pytest.raises(sample.NoSample):
        sample.redeem_sample_asset(_asset_token(asset))


def test_sample_asset_refused_when_sample_disabled(book, big):
    asset = big.epub_package.assets.get()
    assert sample.redeem_sample_asset(_asset_token(asset)) == asset
    big.sample_enabled = False
    big.save()
    with pytest.raises(sample.NoSample):
        sample.redeem_sample_asset(_asset_token(asset))


def test_sample_disabled_or_inactive_book(api, book, big):
    big.sample_enabled = False
    big.save()
    assert api.get(url(book)).status_code == 404
    big.sample_enabled = True
    big.save()
    book.is_active = False
    book.save()
    assert api.get(url(book)).status_code == 404


def test_owner_sees_owned_flag(owner_api, book, big):
    assert owner_api.get(url(book)).json()["owned"] is True


def test_offers_for_the_end_cta(api, book, big):
    BookVariant.objects.create(book=book, type=BookVariant.Type.EBOOK, price=90_000)
    BookVariant.objects.create(book=book, type=BookVariant.Type.BUNDLE, price=250_000, stock=3)
    BookVariant.objects.create(book=book, type=BookVariant.Type.PRINT, price=200_000, stock=3)
    offers = api.get(url(book)).json()["offers"]
    assert sorted(o["type"] for o in offers) == ["BUNDLE", "EBOOK"]
    assert {o["price"] for o in offers} == {90_000, 250_000}


def test_sample_is_rate_limited(api, book, big, settings):
    settings.READER_SAMPLE_RATE = "2/hour"
    assert api.get(url(book)).status_code == 200
    assert api.get(url(book, "chapters/0/")).status_code == 200
    res = api.get(url(book))
    assert res.status_code == 429


# ---------- PDF ----------

PAGES = [[f"Page {i} text"] for i in range(1, 21)]


@pytest.fixture
def pdf_file(book):
    ebook = EbookFile(book=book, format=EbookFile.Format.PDF, version=1)
    ebook.file.save("book.pdf", ContentFile(build_pdf(PAGES, compress=True)), save=True)
    files.prepare(ebook)
    yield ebook
    sample.drop_pdf_sample(ebook)
    ebook.file.delete(save=False)


def test_pdf_sample_file_has_only_the_sample_pages(api, book, pdf_file):
    body = api.get(url(book)).json()
    assert body["format"] == "PDF" and body["sample_pages"] == 2 and body["total_pages"] == 20
    res = api.get(body["file_url"])
    assert res.status_code == 200 and res["Content-Type"] == "application/pdf"
    data = b"".join(res.streaming_content)
    texts = pdf.page_texts(data)
    assert len(texts) == 2 and "Page 2 text" in texts[1]
    assert b"Page 3 text" not in data


def test_pdf_sample_rebuilt_when_admin_changes_size(api, book, pdf_file):
    api.get(url(book))
    pdf_file.sample_pages = 5
    pdf_file.save()
    assert api.get(url(book)).json()["sample_pages"] == 5
    assert PdfSample.objects.get(ebook=pdf_file).pages == 5


def test_new_upload_drops_cached_sample(book, pdf_file):
    sample.pdf_sample(pdf_file)
    files.prepare(pdf_file)
    assert not PdfSample.objects.filter(ebook=pdf_file).exists()


def test_unreadable_pdf_has_no_sample(api, book):
    ebook = EbookFile(book=book, format=EbookFile.Format.PDF, version=1)
    ebook.file.save("bad.pdf", ContentFile(b"%PDF-1.4 broken"), save=True)
    assert api.get(url(book)).status_code == 404
    ebook.file.delete(save=False)


def test_file_endpoint_refuses_epub(api, book, big):
    assert api.get(url(book, "file/")).status_code == 404


# ---------- product page flag ----------


def test_book_detail_reader_sample_flag(api, book, big):
    BookVariant.objects.create(book=book, type=BookVariant.Type.EBOOK, price=90_000)
    data = api.get(f"/api/v1/catalog/books/{book.slug}/").json()
    assert data["reader_sample"] is True
    big.sample_enabled = False
    big.save()
    cache.clear()
    assert api.get(f"/api/v1/catalog/books/{book.slug}/").json()["reader_sample"] is False
