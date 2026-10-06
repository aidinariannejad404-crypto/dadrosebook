from pathlib import Path

import pytest

from apps.reader.services import pdf

from .pdfbuild import build_pdf

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "sample-ebook.pdf"

PAGES = [
    ["Chapter one", "Article 10 private contracts are binding"],
    ["Chapter two", "Movable property can be moved"],
    ["Chapter three", "SECRET-LAST-PAGE text"],
]
FA_PAGES = ["ماده ۱۰ - قراردادهای خصوصی نافذ است", "ماده ۱۹ - مال منقول", "صفحه پایانی محرمانه"]


def compact(s: str) -> str:
    return "".join(s.split())


@pytest.mark.parametrize("compress", [False, True])
@pytest.mark.parametrize("objstm", [False, True])
def test_page_texts_plain_flate_and_object_streams(compress, objstm):
    texts = pdf.page_texts(build_pdf(PAGES, compress=compress, objstm=objstm))
    assert len(texts) == 3
    assert "Article 10 private contracts are binding" in texts[0]
    assert "SECRET-LAST-PAGE" in texts[2]


def test_page_texts_tounicode_persian():
    texts = pdf.page_texts(build_pdf(FA_PAGES, unicode=True, compress=True))
    assert [compact(t) for t in texts] == [compact(t) for t in FA_PAGES]


def test_fixture_pdf_has_six_pages_of_text():
    texts = pdf.page_texts(FIXTURE.read_bytes())
    assert len(texts) == 6
    assert "Sample page 4" in texts[3]


def test_literal_string_escapes():
    data = build_pdf([r"a (nested) \ back"])
    assert "a (nested) \\ back" in pdf.page_texts(data)[0]


def test_not_a_pdf_and_encrypted_are_refused():
    with pytest.raises(pdf.PdfError):
        pdf.page_texts(b"hello")
    encrypted = build_pdf(["x"]).replace(b"/Root 1 0 R", b"/Root 1 0 R /Encrypt 5 0 R")
    with pytest.raises(pdf.PdfError):
        pdf.page_texts(encrypted)


@pytest.mark.parametrize("objstm", [False, True])
def test_build_sample_keeps_only_the_first_pages(objstm):
    source = build_pdf(PAGES, compress=False, objstm=objstm, annots=True)
    out, count = pdf.build_sample(source, 2)
    assert count == 2
    texts = pdf.page_texts(out)
    assert len(texts) == 2
    assert "Movable property" in texts[1]
    # nothing of the last page travels with the sample (content, link target or outline)
    assert b"SECRET-LAST-PAGE" not in out
    assert b"/Outlines" not in out
    assert b"/Annots" not in out


def test_build_sample_of_compressed_unicode_pdf():
    out, count = pdf.build_sample(build_pdf(FA_PAGES, unicode=True, compress=True), 1)
    assert count == 1
    texts = pdf.page_texts(out)
    assert compact(texts[0]) == compact(FA_PAGES[0])
    assert "محرمانه" not in "".join(texts)


def test_build_sample_clamps_page_count():
    _, count = pdf.build_sample(build_pdf(PAGES), 99)
    assert count == 3
    _, count = pdf.build_sample(build_pdf(PAGES), 0)
    assert count == 1


def test_build_sample_of_fixture_is_a_valid_pdf():
    out, _ = pdf.build_sample(FIXTURE.read_bytes(), 2)
    assert out.startswith(b"%PDF-") and out.rstrip().endswith(b"%%EOF")
    assert b"Sample page 3" not in out
    assert pdf.page_count(out) == 2
