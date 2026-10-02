import io

import pytest

from apps.reader.models import EbookFile, Highlight, ReadingProgress
from apps.reader.services import files, highlights, progress, session
from apps.reader.tests.conftest import PDF_BYTES


class TestCleanRects:
    def test_clamps_and_drops_empty(self):
        out = highlights.clean_rects(
            [{"x": -0.1, "y": 0.5, "w": 0.5, "h": 0.1}, {"x": 0.2, "y": 0.2, "w": 0, "h": 0.1}]
        )
        assert out == [{"x": 0.0, "y": 0.5, "w": 0.5, "h": 0.1}]

    def test_clamps_width_to_page(self):
        assert highlights.clean_rects([{"x": 0.9, "y": 0, "w": 0.5, "h": 0.1}])[0]["w"] == 0.1

    @pytest.mark.parametrize(
        "bad", ["x", [1], [{"x": 0, "y": 0, "w": 1}], [{"x": "a", "y": 0, "w": 1, "h": 1}]]
    )
    def test_rejects_malformed(self, bad):
        with pytest.raises(ValueError):
            highlights.clean_rects(bad)

    def test_rejects_too_many(self):
        rect = {"x": 0, "y": 0, "w": 0.1, "h": 0.1}
        with pytest.raises(ValueError):
            highlights.clean_rects([rect] * (highlights.MAX_RECTS + 1))


@pytest.mark.django_db
class TestProgress:
    def test_save_creates_then_updates(self, reader, book):
        progress.save_progress(reader, book, page=3, total_pages=10)
        p = progress.save_progress(reader, book, page=7, total_pages=10)
        assert ReadingProgress.objects.count() == 1
        assert (p.page, p.percent) == (7, 70.0)

    def test_page_is_clamped(self, reader, book):
        assert progress.save_progress(reader, book, page=50, total_pages=10).page == 10
        assert progress.save_progress(reader, book, page=0, total_pages=10).page == 1

    def test_percent_without_total(self, reader, book):
        assert progress.save_progress(reader, book, page=3, total_pages=0).percent == 0.0


@pytest.mark.django_db
class TestHighlights:
    def test_per_book_limit(self, reader, book, monkeypatch):
        monkeypatch.setattr(highlights, "MAX_PER_BOOK", 1)
        highlights.create_highlight(reader, book, page=1, text="a")
        with pytest.raises(highlights.HighlightLimit):
            highlights.create_highlight(reader, book, page=1, text="b")

    def test_listing_is_per_user_and_ordered(self, reader, stranger, book):
        Highlight.objects.create(user=reader, book=book, page=5, text="b")
        Highlight.objects.create(user=reader, book=book, page=2, text="a")
        Highlight.objects.create(user=stranger, book=book, page=1, text="x")
        assert [h.text for h in highlights.user_highlights(reader, book)] == ["a", "b"]
        assert [h.text for h in highlights.user_highlights(reader, book, page=5)] == ["b"]


class TestFiles:
    def test_magic_bytes(self):
        files.check_magic(EbookFile.Format.PDF, PDF_BYTES[:8])
        files.check_magic(EbookFile.Format.EPUB, b"PK\x03\x04abcd")
        with pytest.raises(files.InvalidEbookFile):
            files.check_magic(EbookFile.Format.PDF, b"<html>")
        with pytest.raises(files.InvalidEbookFile):
            files.check_magic(EbookFile.Format.EPUB, PDF_BYTES[:8])

    def test_prepare_upload_records_fingerprint(self):
        ebook = EbookFile(format=EbookFile.Format.PDF)
        files.prepare_upload(ebook, io.BytesIO(PDF_BYTES))
        assert ebook.size == len(PDF_BYTES)
        assert len(ebook.sha256) == 64

    @pytest.mark.django_db
    def test_activate_switches_active_file(self, ebook):
        new = EbookFile.objects.create(
            book=ebook.book, file="ebooks/v2.pdf", version=2, is_active=False
        )
        files.activate(new)
        ebook.refresh_from_db()
        new.refresh_from_db()
        assert new.is_active and not ebook.is_active


@pytest.mark.django_db
def test_watermark_masks_phone(reader):
    text = session.watermark_text(reader)
    assert text.startswith("0912***4567 · ۱۴")
    assert "1234567" not in text


@pytest.mark.django_db
def test_seed_demo_ebooks(book):
    from django.core.management import call_command

    from apps.catalog.models import BookVariant

    BookVariant.objects.create(book=book, type=BookVariant.Type.EBOOK, price=100000)
    call_command("seed_demo_ebooks", "--limit", "3")
    ebook = EbookFile.objects.get(book=book)
    assert ebook.is_active and ebook.size > 0
    call_command("seed_demo_ebooks", "--if-empty")
    assert EbookFile.objects.count() == 1
    ebook.file.delete(save=False)
