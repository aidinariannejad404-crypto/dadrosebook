"""A small Persian EPUB 3 built in code: the dev demo (``seed_demo_ebooks --epub``) and tests."""

import base64
import io
import zipfile

# 1×1 PNG
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)

CONTAINER = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"""

OPF = """<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">dadrose-sample</dc:identifier>
    <dc:title>نمونه کتاب الکترونیک حقوق مدنی</dc:title>
    <dc:language>fa</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="c3" href="text/ch3.xhtml" media-type="application/xhtml+xml"/>
    <item id="img" href="images/seal.png" media-type="image/png"/>
    <item id="css" href="style.css" media-type="text/css"/>
  </manifest>
  <spine page-progression-direction="rtl">
    <itemref idref="c1"/><itemref idref="c2"/><itemref idref="c3"/>
  </spine>
</package>"""

NAV = """<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body><nav epub:type="toc"><ol>
  <li><a href="text/ch1.xhtml">پیشگفتار</a></li>
  <li><a href="text/ch2.xhtml">فصل اول: اموال</a>
    <ol><li><a href="text/ch2.xhtml#s1">مبحث اول: اموال منقول</a></li></ol></li>
  <li><a href="text/ch3.xhtml">فصل دوم: قراردادها</a></li>
</ol></nav></body></html>"""

PAGE = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="fa" dir="rtl">
<head><title>{title}</title><link rel="stylesheet" href="../style.css"/>
<style>p {{ color: red }}</style></head>
<body class="chapter">{body}</body></html>"""

PARA = (
    "مال بر دو قسم است: مال منقول و مال غیرمنقول. مالی که نقل آن از محلی به محل دیگر ممکن باشد "
    "بدون اینکه به خود یا محل آن خرابی وارد آید، منقول است. "
)

CHAPTERS = {
    "text/ch1.xhtml": (
        "پیشگفتار",
        "<h1>پیشگفتار</h1><p>این کتاب برای داوطلبان آزمون وکالت و قضاوت آماده شده است.</p>"
        '<p>برای شروع به <a href="ch2.xhtml#s1">مبحث اموال منقول</a> بروید یا '
        '<a href="https://dadrose.com">سایت دادرُز</a> را ببینید.</p>'
        '<script>alert("x")</script><p onclick="steal()">متن امن</p>'
        '<img src="../images/seal.png" alt="مهر"/>',
    ),
    "text/ch2.xhtml": (
        "فصل اول",
        "<h1>فصل اول: اموال</h1>"
        '<h2 id="s1">مبحث اول: اموال منقول</h2>'
        "<p>ماده ۱۹ - " + PARA * 3 + "</p>"
        "<p>ماده ۲۰ - " + PARA * 3 + "</p>"
        "<table><tr><th>نوع مال</th><th>ماده</th></tr><tr><td>منقول</td><td>۱۹</td></tr></table>",
    ),
    "text/ch3.xhtml": (
        "فصل دوم",
        "<h1>فصل دوم: قراردادها</h1>"
        "<p>ماده ۱۰ - قراردادهای خصوصی نسبت به کسانی که آن را منعقد نموده‌اند در صورتی که مخالف "
        "صریح قانون نباشد نافذ است.</p>"
        '<aside epub:type="footnote" xmlns:epub="http://www.idpf.org/2007/ops">'
        "پانویس: ماده ۱۰ قانون مدنی.</aside>",
    ),
}


def build_epub(
    files: dict[str, bytes | str] | None = None,
    *,
    omit: tuple[str, ...] = (),
    mimetype: bool = True,
) -> bytes:
    """The sample EPUB; ``files`` adds or replaces members, ``omit`` drops them."""
    members: dict[str, bytes | str] = {
        "META-INF/container.xml": CONTAINER,
        "OEBPS/content.opf": OPF,
        "OEBPS/nav.xhtml": NAV,
        "OEBPS/images/seal.png": PNG,
        "OEBPS/style.css": "body { font-family: serif; }",
    }
    for path, (title, body) in CHAPTERS.items():
        members[f"OEBPS/{path}"] = PAGE.format(title=title, body=body)
    members.update(files or {})
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        if mimetype:
            zf.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        for path, data in members.items():
            if path not in omit:
                zf.writestr(path, data.encode() if isinstance(data, str) else data)
    return buf.getvalue()
