"""ه۱: annotations survive a new ebook file version."""

import pytest
from django.core.files.base import ContentFile

from apps.library.models import EbookFile
from apps.reader.models import AnchorStatus, Bookmark, Highlight, ReadingProgress
from apps.reader.sample_epub import CHAPTERS, OPF, PAGE, build_epub
from apps.reader.services import anchoring, files, reanchor
from apps.reader.services.bookmarks import add_bookmark
from apps.reader.services.epub import get_package, process_epub
from apps.reader.services.highlights import create_highlight
from apps.reader.services.progress import save_progress

from .pdfbuild import build_pdf

pytestmark = pytest.mark.django_db

ART20 = "ماده ۲۰ - مال بر دو قسم است"
ART10 = "قراردادهای خصوصی نسبت به کسانی که آن را منعقد نموده‌اند"

# v2: a new front chapter (every chapter index shifts by one), a new paragraph before article 19
# (offsets shift), and article 10 amended (its old wording is gone).
NEW_OPF = OPF.replace(
    '<item id="c1"',
    '<item id="c0" href="text/ch0.xhtml" media-type="application/xhtml+xml"/>\n    <item id="c1"',
).replace('<itemref idref="c1"/>', '<itemref idref="c0"/><itemref idref="c1"/>')
CH2_TITLE, CH2_BODY = CHAPTERS["text/ch2.xhtml"]
V2_FILES = {
    "OEBPS/content.opf": NEW_OPF,
    "OEBPS/text/ch0.xhtml": PAGE.format(
        title="یادداشت ویرایش", body="<h1>یادداشت ویرایش ۱۴۰۵</h1>"
    ),
    "OEBPS/text/ch2.xhtml": PAGE.format(
        title=CH2_TITLE,
        body=CH2_BODY.replace(
            "<p>ماده ۱۹ - ",
            "<p>ماده ۱۸ مکرر - متن تازه‌ای که در ویرایش جدید اضافه شده است.</p><p>ماده ۱۹ - ",
        ),
    ),
    "OEBPS/text/ch3.xhtml": PAGE.format(
        title="فصل دوم",
        body="<h1>فصل دوم: قراردادها</h1><p>ماده ۱۰ - (اصلاحی) متن این ماده تغییر کرده است.</p>",
    ),
}


def chapter_text(ebook, index):
    return get_package(ebook).chapters.get(index=index).text


def epub_range(ebook, chapter, quote, occurrence=0):
    text = chapter_text(ebook, chapter)
    pos = -1
    for _ in range(occurrence + 1):
        pos = text.index(quote, pos + 1)
    return f"epub:{chapter}:{pos}-{pos + len(quote)}", pos


def new_version(book, data, version=2, fmt=EbookFile.Format.EPUB, name="v2.epub"):
    ebook = EbookFile(book=book, format=fmt, version=version)
    ebook.file.save(name, ContentFile(data), save=True)
    files.prepare(ebook)
    return ebook


@pytest.fixture
def v1(epub_ebook):
    process_epub(epub_ebook)
    return epub_ebook


# ---------- matching ----------


def test_compact_ignores_spacing_zwnj_and_letter_forms():
    assert anchoring.compact("مي‌شود  ۱۰") == anchoring.compact("می شود 10")


def test_segment_offsets_are_utf16():
    seg = anchoring.Segment(0, "a😀 b")
    assert seg.span16(1, 2) == (1, 3)  # the emoji is two UTF-16 units
    assert seg.span16(2, 3) == (4, 5)


def test_locate_prefers_matching_context():
    text = "الف مال است. ب مال است. ج مال است."
    segs = [anchoring.Segment(0, text)]
    found = anchoring.locate(segs, "مال است", before="ب ", after=". ج")
    assert text[found.start16 : found.end16] == "مال است"
    assert text[: found.start16].endswith("ب ")


def test_short_ambiguous_quote_without_context_is_not_guessed():
    segs = [anchoring.Segment(0, "دو دو دو")]
    assert anchoring.locate(segs, "دو") is None
    assert anchoring.locate([anchoring.Segment(0, "یک دو")], "دو") is not None


def test_context_at():
    before, after = anchoring.context_at("aaa bbb   ccc ddd", 4, 7)
    assert before == "aaa"
    assert after == "ccc ddd"


# ---------- stamping at creation ----------


def test_new_highlight_gets_version_and_context(v1, reader, book):
    loc, pos = epub_range(v1, 1, ART20)
    h = create_highlight(reader, book, page=2, text=ART20, rects=[], location=loc)
    assert h.ebook_version == 1
    text = chapter_text(v1, 1)
    assert text[:pos].rstrip().endswith(h.context_before[-10:])
    assert h.context_after and text[pos + len(ART20) :].lstrip().startswith(h.context_after[:10])


def test_bookmark_and_progress_get_context(v1, reader, book):
    text = chapter_text(v1, 2)
    offset = text.index("ماده ۱۰")
    b, _ = add_bookmark(reader, book, page=3, location=f"epub:2:{offset}")
    assert b.ebook_version == 1 and b.context_after.startswith("ماده ۱۰")
    p = save_progress(reader, book, page=3, total_pages=5, location=f"epub:2:{offset}")
    assert p.ebook_version == 1 and p.context_after.startswith("ماده ۱۰")


# ---------- EPUB v1 → v2 ----------


def test_epub_highlights_follow_the_text(v1, reader, book):
    loc, _ = epub_range(v1, 1, ART20)
    moved = create_highlight(reader, book, page=2, text=ART20, rects=[], location=loc, note="مهم")
    # the second «مال بر دو قسم است» inside article 20: context picks the right one
    loc2, pos2 = epub_range(v1, 1, "مال بر دو قسم است", occurrence=4)
    repeat = create_highlight(
        reader, book, page=2, text="مال بر دو قسم است", rects=[], location=loc2
    )
    gone_loc, _ = epub_range(v1, 2, ART10)
    gone = create_highlight(reader, book, page=3, text=ART10, rects=[], location=gone_loc)

    v2 = new_version(book, build_epub(V2_FILES))
    files.activate(v2, reanchor=False)
    result = reanchor.reanchor_book(book, v2)
    assert result["highlights"] == {"moved": 2, "kept": 0, "orphaned": 1, "skipped": 0}

    moved.refresh_from_db()
    text2 = chapter_text(v2, 2)
    m = reanchor.EPUB_RANGE_RE.match(moved.location)
    assert m.group(1) == "2"  # chapter index shifted by the new front chapter
    assert text2[int(m.group(2)) : int(m.group(3))] == ART20
    assert moved.ebook_version == 2 and moved.anchor_status == AnchorStatus.ANCHORED
    assert moved.note == "مهم"

    repeat.refresh_from_db()
    m = reanchor.EPUB_RANGE_RE.match(repeat.location)
    start = int(m.group(2))
    old_text = chapter_text(v1, 1)
    # same occurrence: the same amount of article-20 text precedes it
    assert text2[start - 60 : start] == old_text[pos2 - 60 : pos2]

    gone.refresh_from_db()
    assert gone.anchor_status == AnchorStatus.ORPHANED
    assert gone.previous_page == 3 and gone.text == ART10  # kept, not dropped
    assert gone.ebook_version == 2


def test_bookmarks_and_progress_follow_the_text(v1, reader, stranger, book):
    text = chapter_text(v1, 1)
    offset = text.index("ماده ۲۰")
    b, _ = add_bookmark(reader, book, page=2, location=f"epub:1:{offset}", label="ماده ۲۰")
    save_progress(reader, book, page=2, total_pages=4, location=f"epub:1:{offset}")
    gone_offset = chapter_text(v1, 2).index(ART10)
    lost, _ = add_bookmark(reader, book, page=3, location=f"epub:2:{gone_offset}")
    save_progress(stranger, book, page=3, total_pages=4, location=f"epub:2:{gone_offset}")

    v2 = new_version(book, build_epub(V2_FILES))
    files.activate(v2, reanchor=False)
    reanchor.reanchor_book(book, v2)

    b.refresh_from_db()
    m = reanchor.EPUB_POINT_RE.match(b.location)
    assert m.group(1) == "2"
    assert chapter_text(v2, 2)[int(m.group(2)) :].startswith("ماده ۲۰")
    lost.refresh_from_db()
    assert lost.anchor_status == AnchorStatus.ORPHANED

    mine = ReadingProgress.objects.get(user=reader, book=book)
    assert mine.ebook_version == 2
    assert chapter_text(v2, 2)[int(mine.location.split(":")[2]) :].startswith("ماده ۲۰")
    theirs = ReadingProgress.objects.get(user=stranger, book=book)
    assert theirs.location == "" and theirs.ebook_version == 2  # same share of the book instead
    assert theirs.total_pages == get_package(v2).total_pages


def test_legacy_annotations_without_context_use_the_previous_file(v1, reader, book):
    loc, _ = epub_range(v1, 1, ART20)
    # created before ه۱: no version, no context
    h = Highlight.objects.create(user=reader, book=book, page=2, text=ART20, location=loc)
    offset = chapter_text(v1, 1).index("ماده ۲۰")
    b = Bookmark.objects.create(user=reader, book=book, page=2, location=f"epub:1:{offset}")
    v2 = new_version(book, build_epub(V2_FILES))
    files.activate(v2, reanchor=False)
    reanchor.reanchor_book(book, v2)
    h.refresh_from_db()
    b.refresh_from_db()
    assert h.anchor_status == AnchorStatus.ANCHORED and h.location.startswith("epub:2:")
    assert b.anchor_status == AnchorStatus.ANCHORED and b.location.startswith("epub:2:")


def test_orphan_comes_back_when_a_later_version_restores_the_text(v1, reader, book):
    loc, _ = epub_range(v1, 2, ART10)
    h = create_highlight(reader, book, page=3, text=ART10, rects=[], location=loc)
    v2 = new_version(book, build_epub(V2_FILES))
    files.activate(v2, reanchor=False)
    reanchor.reanchor_book(book, v2)
    h.refresh_from_db()
    assert h.anchor_status == AnchorStatus.ORPHANED
    v3 = new_version(book, build_epub(), version=3, name="v3.epub")
    files.activate(v3, reanchor=False)
    reanchor.reanchor_book(book, v3)
    h.refresh_from_db()
    assert h.anchor_status == AnchorStatus.ANCHORED and h.ebook_version == 3


def test_same_version_is_left_alone_unless_forced(v1, reader, book):
    loc, _ = epub_range(v1, 1, ART20)
    h = create_highlight(reader, book, page=2, text=ART20, rects=[], location=loc)
    assert reanchor.reanchor_book(book, v1)["highlights"]["kept"] == 0
    assert reanchor.reanchor_book(book, v1, force=True)["highlights"]["kept"] == 1
    h.refresh_from_db()
    assert h.location == loc


def test_duplicate_bookmark_after_reanchor_is_merged(v1, reader, book):
    text = chapter_text(v1, 1)
    offset = text.index("ماده ۲۰")
    add_bookmark(reader, book, page=2, location=f"epub:1:{offset}")
    v2 = new_version(book, build_epub(V2_FILES))
    files.activate(v2, reanchor=False)
    reanchor.reanchor_book(book, v2)
    target = Bookmark.objects.get(user=reader, book=book)
    # a stale copy made offline in v1 lands on the same spot and is merged away
    stale = Bookmark.objects.create(
        user=reader,
        book=book,
        page=2,
        location=f"epub:1:{offset}",
        ebook_version=1,
        context_after=target.context_after,
        context_before=target.context_before,
    )
    reanchor.reanchor_book(book, v2)
    assert not Bookmark.objects.filter(pk=stale.pk).exists()
    assert Bookmark.objects.filter(user=reader, book=book).count() == 1


# ---------- PDF ----------

PDF_V1 = [
    ["Intro page"],
    ["Article 10 private contracts are binding on the parties"],
    ["Article 11 property is movable or immovable"],
]
PDF_V2 = [
    ["Intro page"],
    ["Preface to the 1405 edition"],
    ["Article 10 private contracts are binding on the parties"],
    ["Article 11 was repealed"],
]


@pytest.fixture
def pdf_v1(book):
    ebook = EbookFile(book=book, format=EbookFile.Format.PDF, version=1)
    ebook.file.save("v1.pdf", ContentFile(build_pdf(PDF_V1, compress=True)), save=True)
    files.prepare(ebook)
    return ebook


def test_pdf_highlights_move_pages_and_drop_stale_boxes(pdf_v1, reader, book):
    rects = [{"x": 0.1, "y": 0.1, "w": 0.5, "h": 0.03}]
    h = create_highlight(
        reader, book, page=2, text="private contracts are binding", rects=rects, location=""
    )
    assert h.ebook_version == 1 and h.context_before.endswith("Article 10")
    lost = create_highlight(
        reader, book, page=3, text="property is movable or immovable", rects=rects, location=""
    )
    b, _ = add_bookmark(reader, book, page=2)
    assert b.context_after.startswith("Article 10")

    v2 = new_version(
        book, build_pdf(PDF_V2, compress=True), fmt=EbookFile.Format.PDF, name="v2.pdf"
    )
    files.activate(v2, reanchor=False)
    reanchor.reanchor_book(book, v2)
    h.refresh_from_db()
    assert (h.page, h.rects, h.previous_page) == (3, [], 2)  # boxes re-derived by the reader
    lost.refresh_from_db()
    assert lost.anchor_status == AnchorStatus.ORPHANED
    b.refresh_from_db()
    assert b.page == 3


def test_pdf_highlight_on_unchanged_page_keeps_its_boxes(pdf_v1, reader, book):
    rects = [{"x": 0.1, "y": 0.1, "w": 0.5, "h": 0.03}]
    h = create_highlight(reader, book, page=2, text="private contracts", rects=rects, location="")
    v2 = new_version(
        book, build_pdf([*PDF_V1, ["New appendix"]]), fmt=EbookFile.Format.PDF, name="v2.pdf"
    )
    files.activate(v2, reanchor=False)
    reanchor.reanchor_book(book, v2)
    h.refresh_from_db()
    assert h.page == 2 and h.rects == rects and h.ebook_version == 2


def test_pdf_without_text_is_skipped_not_orphaned(book, reader, pdf_v1):
    h = create_highlight(reader, book, page=2, text="private contracts", rects=[], location="")
    v2 = new_version(book, b"%PDF-1.4\nnot really a pdf", fmt=EbookFile.Format.PDF, name="b.pdf")
    files.activate(v2, reanchor=False)
    assert reanchor.reanchor_book(book, v2) == {"error": "no_text"}
    h.refresh_from_db()
    assert h.anchor_status == AnchorStatus.ANCHORED and h.ebook_version == 1


def test_pdf_to_epub_switch(pdf_v1, reader, book):
    """A book re-published as EPUB: a PDF highlight becomes an EPUB range."""
    from apps.reader.sample_epub import build_epub as epub_bytes

    h = create_highlight(
        reader, book, page=2, text="Article 10 private contracts", rects=[], location=""
    )
    data = epub_bytes(
        {
            "OEBPS/text/ch3.xhtml": PAGE.format(
                title="t", body="<p>Article 10 private contracts are binding</p>"
            )
        }
    )
    v2 = new_version(book, data)
    files.activate(v2, reanchor=False)
    reanchor.reanchor_book(book, v2)
    h.refresh_from_db()
    assert h.location.startswith("epub:2:") and h.anchor_status == AnchorStatus.ANCHORED


# ---------- pipeline: activation queues the Celery task ----------


def test_activation_queues_reanchoring(v1, reader, book, django_capture_on_commit_callbacks):
    loc, _ = epub_range(v1, 1, ART20)
    h = create_highlight(reader, book, page=2, text=ART20, rects=[], location=loc)
    v2 = new_version(book, build_epub(V2_FILES))
    with django_capture_on_commit_callbacks(execute=True) as callbacks:
        files.activate(v2)
    assert len(callbacks) == 1
    h.refresh_from_db()
    assert h.ebook_version == 2 and h.location.startswith("epub:2:")


def test_activation_without_annotations_queues_nothing(
    v1, book, django_capture_on_commit_callbacks
):
    v2 = new_version(book, build_epub(V2_FILES))
    with django_capture_on_commit_callbacks(execute=False) as callbacks:
        files.activate(v2)
    assert callbacks == []


def test_stale_offline_write_is_reanchored(v1, reader, book, django_capture_on_commit_callbacks):
    """A highlight queued offline in v1 and replayed after v2 went live."""
    loc, _ = epub_range(v1, 1, ART20)
    v2 = new_version(book, build_epub(V2_FILES))
    files.activate(v2, reanchor=False)
    with django_capture_on_commit_callbacks(execute=True):
        h = create_highlight(
            reader, book, page=2, text=ART20, rects=[], location=loc, ebook_version=1
        )
    h.refresh_from_db()
    assert h.ebook_version == 2 and h.location.startswith("epub:2:")


def test_process_ebooks_reanchor_flag(v1, reader, book):
    from django.core.management import call_command

    loc, _ = epub_range(v1, 1, ART20)
    h = create_highlight(reader, book, page=2, text=ART20, rects=[], location=loc)
    v2 = new_version(book, build_epub(V2_FILES))
    files.activate(v2, reanchor=False)
    call_command("process_ebooks", "--reanchor")
    h.refresh_from_db()
    assert h.ebook_version == 2


# ---------- API ----------


def test_api_exposes_anchor_status(owner_api, v1, reader, book):
    loc, _ = epub_range(v1, 2, ART10)
    create_highlight(reader, book, page=3, text=ART10, rects=[], location=loc)
    v2 = new_version(book, build_epub(V2_FILES))
    files.activate(v2, reanchor=False)
    reanchor.reanchor_book(book, v2)
    url = f"/api/v1/library/{book.slug}/highlights/"
    item = owner_api.get(url).json()[0]
    assert item["anchor_status"] == "orphaned" and item["previous_page"] == 3
    # page filter (PDF page view) skips orphans
    assert owner_api.get(url + "?page=3").json() == []


def test_api_create_accepts_version_and_client_context(owner_api, pdf_v1, book):
    url = f"/api/v1/library/{book.slug}/highlights/"
    res = owner_api.post(
        url,
        {
            "page": 1,
            "text": "Intro",
            "rects": [],
            "ebook_version": 1,
            "context_before": "x" * 90,
            "context_after": "after",
        },
        format="json",
    )
    assert res.status_code == 201, res.json()
    body = res.json()
    assert body["ebook_version"] == 1 and body["anchor_status"] == "anchored"
    assert len(body["context_before"]) <= anchoring.CONTEXT_CHARS
