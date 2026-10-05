import io
import itertools
import zipfile

import pytest

from apps.reader.models import EpubAsset, EpubChapter
from apps.reader.sample_epub import NAV, OPF, build_epub
from apps.reader.services import epub
from apps.reader.services.fold import fold, utf16_len
from apps.reader.services.search import BadQuery, search

pytestmark = pytest.mark.django_db


def test_fold_is_one_to_one():
    text = "ماده ۱۹ قانونِ مدني كه‌می‌شود ABC İ"
    folded = fold(text)
    assert len(folded) == len(text)
    assert "ماده 19" in folded
    assert "مدنی که" in folded
    assert "abc" in folded
    assert folded.endswith("İ")  # lowercase is two chars: kept as is


def test_utf16_len_counts_astral_as_two():
    assert utf16_len("a😀") == 3


def test_resolve_stays_inside_archive():
    assert epub.resolve("OEBPS/text/ch1.xhtml", "../images/a.png") == "OEBPS/images/a.png"
    assert epub.resolve("OEBPS/ch1.xhtml", "../../etc/passwd") is None
    assert epub.resolve("OEBPS/ch1.xhtml", "/etc/passwd") is None
    assert epub.resolve("OEBPS/ch1.xhtml", "https://x.test/a") is None
    assert epub.resolve("OEBPS/ch1.xhtml", "a%20b.xhtml") == "OEBPS/a b.xhtml"


def test_process_sample(epub_ebook):
    package = epub.process_epub(epub_ebook)
    chapters = list(package.chapters.order_by("index"))
    assert [c.title for c in chapters] == ["پیشگفتار", "فصل اول: اموال", "فصل دوم: قراردادها"]
    assert package.direction == "rtl"
    assert package.language == "fa"
    assert chapters[0].start_page == 1
    for prev, cur in itertools.pairwise(chapters):
        assert cur.start_page == prev.start_page + prev.pages
    assert package.total_pages == sum(c.pages for c in chapters)
    assert package.toc[2] == {
        "title": "مبحث اول: اموال منقول",
        "chapter": 1,
        "anchor": "s1",
        "level": 1,
    }


def test_sanitized_html(epub_ebook):
    package = epub.process_epub(epub_ebook)
    html = package.chapters.get(index=0).html
    assert "<script" not in html and "alert" not in html
    assert "onclick" not in html
    assert "<style" not in html and "color: red" not in html
    assert 'href="#epub:1:s1"' in html
    assert 'href="https://dadrose.com"' in html
    assert 'rel="noopener noreferrer nofollow"' in html
    asset = EpubAsset.objects.get(package=package)
    assert f'src="/__asset__/{asset.pk}"' in html
    assert asset.media_type == "image/png"
    assert 'id="epub-s1"' in package.chapters.get(index=1).html


def test_reprocess_replaces_package_and_assets(epub_ebook):
    first = epub.process_epub(epub_ebook)
    old_asset = EpubAsset.objects.get(package=first)
    second = epub.process_epub(epub_ebook)
    assert first.pk != second.pk
    assert EpubChapter.objects.filter(package_id=first.pk).count() == 0
    assert not EpubAsset.objects.filter(pk=old_asset.pk).exists()
    new_asset = EpubAsset.objects.get(package=second)
    assert new_asset.file.storage.exists(new_asset.file.name)


def test_get_package_processes_lazily(epub_ebook):
    assert epub.get_package(epub_ebook).chapters.count() == 3


def test_ncx_fallback(make_epub_file):
    opf = OPF.replace(' properties="nav"', "").replace(
        "</manifest>",
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest>',
    )
    ncx = """<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>
      <navPoint id="a"><navLabel><text>فصل الف</text></navLabel><content src="text/ch2.xhtml"/>
        <navPoint id="b"><navLabel><text>بند ب</text></navLabel><content src="text/ch2.xhtml#s1"/>
        </navPoint></navPoint></navMap></ncx>"""
    ebook = make_epub_file(build_epub({"OEBPS/content.opf": opf, "OEBPS/toc.ncx": ncx}))
    package = epub.process_epub(ebook)
    assert [(t["title"], t["level"], t["anchor"]) for t in package.toc] == [
        ("فصل الف", 0, ""),
        ("بند ب", 1, "s1"),
    ]
    # chapters without a TOC entry take their first heading
    assert package.chapters.get(index=0).title == "پیشگفتار"


def test_svg_cover_becomes_img(make_epub_file):
    page = (
        '<html><body><svg xmlns="http://www.w3.org/2000/svg"><image xlink:href="../images/seal.png"'
        ' width="10" height="10"/></svg></body></html>'
    )
    ebook = make_epub_file(build_epub({"OEBPS/text/ch1.xhtml": page}))
    package = epub.process_epub(ebook)
    assert "/__asset__/" in package.chapters.get(index=0).html
    assert package.chapters.get(index=0).title == "پیشگفتار"  # from the nav


@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        ({"omit": ("META-INF/container.xml",)}, "container.xml"),
        ({"files": {"OEBPS/content.opf": "<package><manifest/></package>"}}, "spine"),
        (
            {"files": {"OEBPS/content.opf": '<!DOCTYPE x [<!ENTITY a "b">]><package/>'}},
            "entity",
        ),
        ({"files": {"OEBPS/content.opf": "<package"}}, "خراب"),
    ],
)
def test_broken_files_rejected(kwargs, message):
    zf = epub.open_zip(io.BytesIO(build_epub(**kwargs)))
    with pytest.raises(epub.InvalidEpub, match=message):
        epub.parse_document(zf)


def test_not_a_zip():
    with pytest.raises(epub.InvalidEpub):
        epub.open_zip(io.BytesIO(b"PK\x03\x04garbage"))


def test_zip_bomb_ratio_rejected():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("big.txt", b"0" * (5 * 1024 * 1024))
    with pytest.raises(epub.InvalidEpub, match="فشرده"):
        epub.open_zip(io.BytesIO(buf.getvalue()))


def test_nav_without_toc_type_falls_back_to_any_nav(make_epub_file):
    nav = NAV.replace(' epub:type="toc"', "")
    package = epub.process_epub(make_epub_file(build_epub({"OEBPS/nav.xhtml": nav})))
    assert len(package.toc) == 4


def test_search_folds_digits_and_letters(epub_ebook):
    package = epub.process_epub(epub_ebook)
    out = search(package, "ماده 10")
    assert [(r["chapter"], r["occurrence"]) for r in out["results"]] == [(2, 0), (2, 1)]
    first = out["results"][0]
    assert first["match"] == "ماده ۱۰"
    assert first["after"].startswith(" - قراردادهای")
    assert not out["truncated"]
    assert search(package, "مدني")["results"]  # Arabic yeh matches Persian yeh


def test_search_truncates(make_epub_file):
    page = "<html><body><p>" + "ماده " * 150 + "</p></body></html>"
    package = epub.process_epub(make_epub_file(build_epub({"OEBPS/text/ch3.xhtml": page})))
    out = search(package, "ما")
    assert len(out["results"]) == 100
    assert out["truncated"]


def test_search_query_length():
    with pytest.raises(BadQuery):
        search(None, " ا ")
