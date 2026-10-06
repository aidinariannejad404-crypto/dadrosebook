"""Tiny PDF writer for tests: one text line per row, optional Flate, object streams, ToUnicode."""

import zlib


def _esc(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_pdf(
    pages: list[list[str]] | list[str],
    *,
    compress: bool = False,
    objstm: bool = False,
    unicode: bool = False,
    annots: bool = False,
) -> bytes:
    """``pages``: a list of pages, each a string or a list of lines."""
    pages = [[p] if isinstance(p, str) else p for p in pages]
    chars = sorted({ch for page in pages for line in page for ch in line})
    codes = {ch: i + 1 for i, ch in enumerate(chars)}
    objects: dict[int, bytes] = {}
    n_pages = len(pages)
    # 1 catalog, 2 pages, 3 font, 4 tounicode, then per page: page, content
    font = (
        b"<< /Type /Font /Subtype /Type0 /BaseFont /Demo /Encoding /Identity-H /ToUnicode 4 0 R >>"
        if unicode
        else b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    )
    objects[3] = font
    if unicode:
        lines = ["/CIDInit /ProcSet findresource begin", "begincmap", "1 begincodespacerange"]
        lines.append("<0000> <FFFF>")
        lines.append("endcodespacerange")
        lines.append(f"{len(chars)} beginbfchar")
        for ch, code in codes.items():
            lines.append(f"<{code:04X}> <{ch.encode('utf-16-be').hex().upper()}>")
        lines += ["endbfchar", "endcmap"]
        cmap = "\n".join(lines).encode()
        objects[4] = b"<< /Length %d >>\nstream\n" % len(cmap) + cmap + b"\nendstream"
    kids = []
    for i, page in enumerate(pages):
        page_num, content_num = 10 + i * 2, 11 + i * 2
        kids.append(f"{page_num} 0 R")
        ops = []
        y = 760
        for line in page:
            if unicode:
                hexs = "".join(f"{codes[ch]:04X}" for ch in line)
                ops.append(f"BT /F1 12 Tf 72 {y} Td <{hexs}> Tj ET")
            else:
                ops.append(f"BT /F1 12 Tf 72 {y} Td ({_esc(line)}) Tj ET")
            y -= 20
        stream = "\n".join(ops).encode()
        extra = b""
        if compress:
            stream = zlib.compress(stream)
            extra = b" /Filter /FlateDecode"
        objects[content_num] = (
            b"<< /Length %d%s >>\nstream\n" % (len(stream), extra) + stream + b"\nendstream"
        )
        annot = b""
        if annots and n_pages > 1:
            # a link to the last page: the sample must not drag that page along
            last = 10 + (n_pages - 1) * 2
            annot = b" /Annots [<< /Type /Annot /Subtype /Link /Dest [%d 0 R /Fit] >>]" % last
        objects[page_num] = b"<< /Type /Page /Parent 2 0 R /Contents %d 0 R%s >>" % (
            content_num,
            annot,
        )
    objects[2] = (
        f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {n_pages} "
        "/MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> >>"
    ).encode()
    objects[1] = b"<< /Type /Catalog /Pages 2 0 R /Outlines 5 0 R >>"
    objects[5] = b"<< /Type /Outlines /Count 0 >>"

    out = bytearray(b"%PDF-1.5\n")
    if objstm:
        packed = {k: v for k, v in objects.items() if b"stream" not in v}
        rest = {k: v for k, v in objects.items() if k not in packed}
        header, body = [], b""
        for num, value in packed.items():
            header.append(f"{num} {len(body)}")
            body += value + b"\n"
        head = (" ".join(header) + "\n").encode()
        data = zlib.compress(head + body)
        rest[900] = (
            b"<< /Type /ObjStm /N %d /First %d /Length %d /Filter /FlateDecode >>\nstream\n"
            % (len(packed), len(head), len(data))
            + data
            + b"\nendstream"
        )
        rest[901] = b"<< /Type /XRef /Root 1 0 R /Size 902 /Length 0 >>\nstream\n\nendstream"
        for num, value in sorted(rest.items()):
            out += b"%d 0 obj\n" % num + value + b"\nendobj\n"
        out += b"startxref\n0\n%%EOF\n"
        return bytes(out)
    for num, value in sorted(objects.items()):
        out += b"%d 0 obj\n" % num + value + b"\nendobj\n"
    out += b"trailer\n<< /Root 1 0 R /Size 100 >>\nstartxref\n0\n%%EOF\n"
    return bytes(out)
