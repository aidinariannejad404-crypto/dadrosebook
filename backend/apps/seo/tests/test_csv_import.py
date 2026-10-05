from urllib.parse import quote

import pytest

from apps.seo.models import Redirect
from apps.seo.services.csv_import import import_csv

pytestmark = pytest.mark.django_db


def test_good_rows_with_header_bom_and_encoded_paths():
    csv_text = (
        "﻿old_path,new_path,status\n"
        f"https://dadrosebook.com{quote('/product/قدیمی')},/product/جدید,301\n"
        "/products,/search\n"
        "/blog,https://dadrose.com/blog/,302\n"
        "\n"
    )
    report = import_csv(csv_text.encode("utf-8"))
    assert (report.created, report.updated, report.skipped, report.errors) == (3, 0, 0, [])
    r = Redirect.objects.get(old_path="/product/قدیمی")
    assert (r.new_path, r.status_code, r.source) == ("/product/جدید", 301, "IMPORT")
    assert Redirect.objects.get(old_path="/blog").status_code == 302


def test_without_header():
    report = import_csv("/a,/b\n")
    assert report.created == 1


def test_bad_rows_are_reported_with_line_numbers():
    csv_text = "\n".join(
        [
            "old_path,new_path,status",
            "/only-old",  # 2: missing target
            "/a,not-a-path",  # 3: invalid target
            "/b,/b/",  # 4: self redirect
            "/c,/d,307",  # 5: bad status
            "/" + "x" * 600 + ",/",  # 6: too long
            "/e,/f",  # 7: fine
            "/g,/e",  # 8: chain into /e
        ]
    )
    report = import_csv(csv_text)
    assert report.created == 1
    assert [line for line, _ in report.errors] == [2, 3, 4, 5, 6, 8]
    assert all(message for _, message in report.errors)
    assert list(Redirect.objects.values_list("old_path", flat=True)) == ["/e"]


def test_duplicates_in_file():
    report = import_csv("/a,/x\n" + quote("/a") + "/,/y\n")
    assert report.created == 1
    assert report.errors[0][0] == 2
    assert Redirect.objects.get().new_path == "/x"


def test_update_existing_and_skip_unchanged():
    seeded = Redirect.objects.create(
        old_path="/products", new_path="/", source=Redirect.Source.SEED, is_active=False
    )
    Redirect.objects.create(old_path="/same", new_path="/target")
    report = import_csv("/products/,/search,302\n/same,/target\n")
    assert (report.created, report.updated, report.skipped) == (0, 1, 1)
    seeded.refresh_from_db()
    assert (seeded.new_path, seeded.status_code, seeded.is_active) == ("/search", 302, True)
    assert seeded.source == Redirect.Source.SEED  # the origin is kept


def test_http_target_is_upgraded_to_https():
    import_csv("/blog,http://dadrose.com/blog/\n")
    assert Redirect.objects.get().new_path == "https://dadrose.com/blog/"


def test_cp1256_file_from_excel():
    # cp1256 has no Persian yeh/kaf; Excel writes the Arabic letters, which the key normalises.
    report = import_csv("/product/كتاب-قديمي,/product/جديد\n".encode("cp1256"))
    assert report.created == 1
    assert Redirect.objects.get().old_path_key == "/product/کتاب-قدیمی"
