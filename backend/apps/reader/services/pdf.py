"""A small, dependency-free PDF reader for two jobs the server must do itself:

* **page text** (``page_texts``): re-anchoring highlights after a new file version and giving a
  highlight its surrounding context;
* **sample file** (``build_sample``): a new PDF holding only the first N pages, so the free sample
  never ships a byte of the pages after it.

Scope: classic and compressed (object stream) PDFs, FlateDecode streams, simple fonts and Type0
fonts with a ``ToUnicode`` CMap, form XObjects. Encrypted PDFs are refused. Anything it cannot
read raises ``PdfError``; callers then fall back (no text index → page-based annotations stay as
they are; no sample → the sample is simply not offered). Never used on untrusted uploads other
than staff-uploaded ebook files, and bounded by size/recursion limits anyway.
"""

import contextlib
import re
import zlib
from dataclasses import dataclass, field

MAX_DECODED = 64 * 1024 * 1024
MAX_DEPTH = 64
MAX_PAGES = 5000
MAX_FORM_DEPTH = 4


class PdfError(ValueError):
    pass


# ---------- values ----------


@dataclass(frozen=True)
class Name:
    raw: bytes  # as written, without the leading slash (escapes kept: re-serialised verbatim)

    @property
    def value(self) -> str:
        return re.sub(
            rb"#([0-9A-Fa-f]{2})", lambda m: bytes([int(m.group(1), 16)]), self.raw
        ).decode("latin-1")


@dataclass(frozen=True)
class Ref:
    num: int
    gen: int = 0


@dataclass
class Number:
    raw: bytes

    @property
    def value(self) -> float:
        try:
            return float(self.raw)
        except ValueError:
            return 0.0


@dataclass
class String:
    data: bytes


@dataclass
class Op:
    name: bytes


@dataclass
class Stream:
    dict: dict
    raw: bytes  # still encoded


@dataclass
class PdfObject:
    value: object
    stream: Stream | None = None


WS = b" \t\r\n\x0c\x00"
DELIMS = b"()<>[]{}/%"


class Lexer:
    def __init__(self, data: bytes, pos: int = 0):
        self.data = data
        self.pos = pos

    def skip_ws(self):
        data, n = self.data, len(self.data)
        while self.pos < n:
            c = data[self.pos]
            if c in WS:
                self.pos += 1
            elif c == 0x25:  # % comment
                end = data.find(b"\n", self.pos)
                self.pos = n if end == -1 else end + 1
            else:
                break

    def token(self):
        """Next value or operator; None at the end."""
        self.skip_ws()
        data = self.data
        if self.pos >= len(data):
            return None
        c = data[self.pos : self.pos + 1]
        if c == b"/":
            start = self.pos + 1
            self.pos = start
            while (
                self.pos < len(data) and data[self.pos] not in WS and data[self.pos] not in DELIMS
            ):
                self.pos += 1
            return Name(data[start : self.pos])
        if c == b"(":
            return String(self._literal())
        if c == b"<":
            if data[self.pos : self.pos + 2] == b"<<":
                self.pos += 2
                return Op(b"<<")
            end = data.find(b">", self.pos)
            if end == -1:
                raise PdfError("unterminated hex string")
            hexs = re.sub(rb"[^0-9A-Fa-f]", b"", data[self.pos + 1 : end])
            self.pos = end + 1
            if len(hexs) % 2:
                hexs += b"0"
            return String(bytes.fromhex(hexs.decode()))
        if c == b">":
            if data[self.pos : self.pos + 2] == b">>":
                self.pos += 2
                return Op(b">>")
            self.pos += 1
            return Op(b">")
        if c in (b"[", b"]", b"{", b"}"):
            self.pos += 1
            return Op(c)
        start = self.pos
        while self.pos < len(data) and data[self.pos] not in WS and data[self.pos] not in DELIMS:
            self.pos += 1
        if self.pos == start:  # stray delimiter
            self.pos += 1
            return Op(c)
        word = data[start : self.pos]
        if re.fullmatch(rb"[+-]?(\d+\.?\d*|\.\d+)", word):
            return Number(word)
        return Op(word)

    def _literal(self) -> bytes:
        data = self.data
        self.pos += 1
        depth = 1
        out = bytearray()
        while self.pos < len(data):
            ch = data[self.pos]
            self.pos += 1
            if ch == 0x5C:  # backslash
                if self.pos >= len(data):
                    break
                nxt = data[self.pos]
                self.pos += 1
                esc = {0x6E: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12}
                if nxt in esc:
                    out.append(esc[nxt])
                elif 0x30 <= nxt <= 0x37:
                    digits = bytes([nxt])
                    while (
                        len(digits) < 3 and self.pos < len(data) and 0x30 <= data[self.pos] <= 0x37
                    ):
                        digits += data[self.pos : self.pos + 1]
                        self.pos += 1
                    out.append(int(digits, 8) & 0xFF)
                elif nxt in (13, 10):
                    if nxt == 13 and self.pos < len(data) and data[self.pos] == 10:
                        self.pos += 1
                else:
                    out.append(nxt)
            elif ch == 0x28:
                depth += 1
                out.append(ch)
            elif ch == 0x29:
                depth -= 1
                if depth == 0:
                    return bytes(out)
                out.append(ch)
            else:
                out.append(ch)
        raise PdfError("unterminated string")


def parse_value(lex: Lexer, tok=None, depth: int = 0):
    """One value (dict, array, ref, …) starting at ``tok`` (or the next token)."""
    if depth > MAX_DEPTH:
        raise PdfError("nesting too deep")
    tok = lex.token() if tok is None else tok
    if tok is None:
        raise PdfError("unexpected end")
    if isinstance(tok, Op):
        if tok.name == b"<<":
            out = {}
            while True:
                key = lex.token()
                if isinstance(key, Op) and key.name == b">>":
                    return out
                if not isinstance(key, Name):
                    raise PdfError("bad dictionary key")
                out[key.value] = parse_value(lex, depth=depth + 1)
        if tok.name == b"[":
            arr = []
            while True:
                nxt = lex.token()
                if isinstance(nxt, Op) and nxt.name == b"]":
                    return arr
                arr.append(parse_value(lex, nxt, depth + 1))
        if tok.name == b"true":
            return True
        if tok.name == b"false":
            return False
        if tok.name == b"null":
            return None
        return tok
    if isinstance(tok, Number) and re.fullmatch(rb"\d+", tok.raw):
        save = lex.pos
        gen = lex.token()
        if isinstance(gen, Number) and re.fullmatch(rb"\d+", gen.raw):
            r = lex.token()
            if isinstance(r, Op) and r.name == b"R":
                return Ref(int(tok.raw), int(gen.raw))
        lex.pos = save
    return tok


# ---------- streams ----------


def decode_stream(stream: Stream) -> bytes:
    filters = stream.dict.get("Filter")
    if filters is None:
        return stream.raw
    if not isinstance(filters, list):
        filters = [filters]
    data = stream.raw
    for f in filters:
        name = f.value if isinstance(f, Name) else ""
        if name in ("FlateDecode", "Fl"):
            d = zlib.decompressobj()
            try:
                data = d.decompress(data, MAX_DECODED)
            except zlib.error:
                # truncated or noisy tail: keep what decoded cleanly
                data = b""
            if d.unconsumed_tail:
                raise PdfError("stream too large")
            parms = stream.dict.get("DecodeParms")
            if isinstance(parms, dict) and _num(parms.get("Predictor"), 1) >= 10:
                data = _png_unpredict(data, int(_num(parms.get("Columns"), 1)))
        else:
            raise PdfError(f"unsupported filter {name}")
    return data


def _png_unpredict(data: bytes, columns: int) -> bytes:
    row = columns + 1
    out = bytearray()
    prev = bytearray(columns)
    for i in range(0, len(data) - row + 1, row):
        kind, line = data[i], bytearray(data[i + 1 : i + row])
        if kind == 2:
            line = bytearray((a + b) & 0xFF for a, b in zip(line, prev, strict=True))
        elif kind not in (0, 2):
            raise PdfError("unsupported PNG predictor")
        out += line
        prev = line
    return bytes(out)


def _num(v, default=0.0) -> float:
    return v.value if isinstance(v, Number) else default


# ---------- document ----------

OBJ_RE = re.compile(rb"(?<![0-9])(\d+)\s+(\d+)\s+obj\b")


@dataclass
class Document:
    objects: dict[int, PdfObject] = field(default_factory=dict)
    trailer: dict = field(default_factory=dict)

    def resolve(self, v, depth: int = 0):
        while isinstance(v, Ref) and depth < MAX_DEPTH:
            obj = self.objects.get(v.num)
            v = obj.stream if obj and obj.stream else (obj.value if obj else None)
            depth += 1
        return v

    def get(self, d, key, default=None):
        if isinstance(d, Stream):
            d = d.dict
        if not isinstance(d, dict):
            return default
        v = self.resolve(d.get(key))
        return default if v is None else v

    # pages

    def page_refs(self) -> list[tuple[int, dict]]:
        """``[(object number, inherited attributes)]`` in reading order."""
        root = self.resolve(self.trailer.get("Root"))
        pages = self.get(root, "Pages")
        if not isinstance(pages, dict):
            raise PdfError("no page tree")
        out: list[tuple[int, dict]] = []
        seen: set[int] = set()

        def walk(node_ref, node, inherited, depth):
            if depth > MAX_DEPTH or len(out) > MAX_PAGES:
                raise PdfError("page tree too deep or too large")
            attrs = dict(inherited)
            for key in ("Resources", "MediaBox", "CropBox", "Rotate"):
                if key in node:
                    attrs[key] = node[key]
            kind = node.get("Type")
            kids = self.resolve(node.get("Kids"))
            if (isinstance(kind, Name) and kind.value == "Pages") or isinstance(kids, list):
                for kid in kids or []:
                    if isinstance(kid, Ref):
                        if kid.num in seen:
                            raise PdfError("page tree loop")
                        seen.add(kid.num)
                    child = self.resolve(kid)
                    if isinstance(child, dict):
                        walk(kid, child, attrs, depth + 1)
            elif isinstance(node_ref, Ref):
                out.append((node_ref.num, attrs))

        walk(pages_ref(self), pages, {}, 0)
        return out


def pages_ref(doc: Document):
    root = doc.resolve(doc.trailer.get("Root"))
    return root.get("Pages") if isinstance(root, dict) else None


def _parse_object_at(data: bytes, pos: int) -> PdfObject:
    lex = Lexer(data, pos)
    value = parse_value(lex)
    save = lex.pos
    tok = lex.token()
    if isinstance(tok, Op) and tok.name == b"stream" and isinstance(value, dict):
        start = lex.pos
        if data[start : start + 2] == b"\r\n":
            start += 2
        elif data[start : start + 1] in (b"\n", b"\r"):
            start += 1
        length = value.get("Length")
        end = -1
        if isinstance(length, Number):
            cand = start + int(length.value)
            if data[cand : cand + 30].lstrip(b"\r\n ").startswith(b"endstream"):
                end = cand
        if end == -1:
            found = data.find(b"endstream", start)
            if found == -1:
                raise PdfError("unterminated stream")
            end = found
            while end > start and data[end - 1 : end] in (b"\n", b"\r"):
                end -= 1
        return PdfObject(value, Stream(value, data[start:end]))
    lex.pos = save
    return PdfObject(value)


def parse(data: bytes) -> Document:
    if not data.startswith(b"%PDF-"):
        raise PdfError("not a PDF")
    doc = Document()
    trailer: dict = {}
    for m in OBJ_RE.finditer(data):
        try:
            obj = _parse_object_at(data, m.end())
        except PdfError:
            continue
        doc.objects[int(m.group(1))] = obj  # later definitions (incremental updates) win
        if obj.stream is not None:
            kind = obj.stream.dict.get("Type")
            if isinstance(kind, Name) and kind.value == "XRef":
                trailer.update(
                    {k: v for k, v in obj.stream.dict.items() if k in ("Root", "Encrypt")}
                )
    for m in re.finditer(rb"trailer", data):
        try:
            value = parse_value(Lexer(data, m.end()))
        except PdfError:
            continue
        if isinstance(value, dict):
            trailer.update({k: v for k, v in value.items() if k in ("Root", "Encrypt")})
    if "Encrypt" in trailer:
        raise PdfError("encrypted PDF")
    # objects stored inside object streams (PDF 1.5+)
    for obj in list(doc.objects.values()):
        if obj.stream is None:
            continue
        kind = obj.stream.dict.get("Type")
        if not (isinstance(kind, Name) and kind.value == "ObjStm"):
            continue
        try:
            raw = decode_stream(obj.stream)
            n = int(_num(obj.stream.dict.get("N")))
            first = int(_num(obj.stream.dict.get("First")))
            head = Lexer(raw)
            pairs = []
            for _ in range(n):
                num, off = head.token(), head.token()
                pairs.append((int(num.value), int(off.value)))
            for num, off in pairs:
                if num not in doc.objects:
                    doc.objects[num] = PdfObject(parse_value(Lexer(raw, first + off)))
        except (PdfError, AttributeError, ValueError, TypeError):
            continue
    if "Root" not in trailer:
        catalog = next(
            (
                num
                for num, o in doc.objects.items()
                if isinstance(o.value, dict)
                and isinstance(o.value.get("Type"), Name)
                and o.value["Type"].value == "Catalog"
            ),
            None,
        )
        if catalog is None:
            raise PdfError("no catalog")
        trailer["Root"] = Ref(catalog)
    doc.trailer = trailer
    return doc


# ---------- text ----------


@dataclass
class Font:
    cmap: dict[bytes, str] = field(default_factory=dict)
    widths: tuple[int, ...] = (1,)

    def decode(self, data: bytes) -> str:
        if not self.cmap:
            return data.decode("cp1252", "replace")
        out = []
        i = 0
        while i < len(data):
            for w in self.widths:
                code = data[i : i + w]
                if code in self.cmap:
                    out.append(self.cmap[code])
                    i += w
                    break
            else:
                i += self.widths[0]
        return "".join(out)


def _utf16(hexbytes: bytes) -> str:
    try:
        return hexbytes.decode("utf-16-be")
    except UnicodeDecodeError:
        return ""


def parse_cmap(data: bytes) -> Font:
    cmap: dict[bytes, str] = {}
    widths: set[int] = set()
    lex = Lexer(data)
    stack: list = []
    mode = None
    while True:
        try:
            tok = lex.token()
        except PdfError:
            break
        if tok is None:
            break
        if isinstance(tok, Op):
            name = tok.name
            if name in (b"begincodespacerange", b"beginbfchar", b"beginbfrange"):
                mode, stack = name, []
            elif name == b"endcodespacerange":
                widths.update(len(s.data) for s in stack[0::2] if isinstance(s, String))
                mode = None
            elif name == b"endbfchar":
                for src, dst in zip(stack[0::2], stack[1::2], strict=False):
                    if isinstance(src, String) and isinstance(dst, String):
                        cmap[src.data] = _utf16(dst.data)
                        widths.add(len(src.data))
                mode = None
            elif name == b"endbfrange":
                for lo, hi, dst in zip(stack[0::3], stack[1::3], stack[2::3], strict=False):
                    if not (isinstance(lo, String) and isinstance(hi, String)):
                        continue
                    width = len(lo.data)
                    widths.add(width)
                    a, b = int.from_bytes(lo.data, "big"), int.from_bytes(hi.data, "big")
                    if b - a > 65535:
                        continue
                    for k, code in enumerate(range(a, b + 1)):
                        key = code.to_bytes(width, "big")
                        if isinstance(dst, String):
                            base = bytearray(dst.data)
                            if base:
                                last = int.from_bytes(base[-2:], "big") + k
                                base[-2:] = (last & 0xFFFF).to_bytes(2, "big")
                            cmap[key] = _utf16(bytes(base))
                        elif isinstance(dst, list) and k < len(dst) and isinstance(dst[k], String):
                            cmap[key] = _utf16(dst[k].data)
                mode = None
            elif tok.name == b"[" and mode:
                arr = []
                while True:
                    nxt = lex.token()
                    if nxt is None or (isinstance(nxt, Op) and nxt.name == b"]"):
                        break
                    arr.append(nxt)
                stack.append(arr)
            continue
        if mode:
            stack.append(tok)
    return Font(cmap, tuple(sorted(widths, reverse=True)) or (1,))


def _fonts(doc: Document, resources) -> dict[str, Font]:
    out: dict[str, Font] = {}
    fonts = doc.get(resources, "Font", {})
    if not isinstance(fonts, dict):
        return out
    for key, ref in fonts.items():
        font = doc.resolve(ref)
        tu = doc.get(font, "ToUnicode")
        if isinstance(tu, Stream):
            try:
                out[key] = parse_cmap(decode_stream(tu))
                continue
            except PdfError:
                pass
        subtype = doc.get(font, "Subtype")
        two_byte = isinstance(subtype, Name) and subtype.value == "Type0"
        out[key] = Font({}, (2,) if two_byte else (1,))
    return out


def _content_bytes(doc: Document, contents) -> bytes:
    contents = doc.resolve(contents)
    parts = contents if isinstance(contents, list) else [contents]
    out = []
    for part in parts:
        stream = doc.resolve(part)
        if isinstance(stream, Stream):
            out.append(decode_stream(stream))
    return b"\n".join(out)


def _run_text(doc: Document, content: bytes, resources, depth: int = 0) -> str:
    fonts = _fonts(doc, resources)
    font = Font()
    lex = Lexer(content)
    operands: list = []
    out: list[str] = []
    while True:
        try:
            tok = lex.token()
        except PdfError:
            break
        if tok is None:
            break
        if isinstance(tok, Op) and tok.name in (b"[", b"<<"):
            try:
                operands.append(parse_value(lex, tok))
            except PdfError:
                break
            continue
        if not isinstance(tok, Op):
            operands.append(tok)
            continue
        op = tok.name
        if op == b"Tf" and len(operands) >= 2 and isinstance(operands[-2], Name):
            font = fonts.get(operands[-2].value, Font())
        elif op in (b"Tj", b"'", b'"') and operands and isinstance(operands[-1], String):
            if op != b"Tj":
                out.append("\n")
            out.append(font.decode(operands[-1].data))
        elif op == b"TJ" and operands and isinstance(operands[-1], list):
            for item in operands[-1]:
                if isinstance(item, String):
                    out.append(font.decode(item.data))
                elif isinstance(item, Number) and item.value < -200:
                    out.append(" ")
        elif op in (b"Td", b"TD", b"T*", b"Tm"):
            out.append(" ")
        elif op == b"ET":
            out.append("\n")
        elif op == b"Do" and operands and isinstance(operands[-1], Name) and depth < MAX_FORM_DEPTH:
            xobjects = doc.get(resources, "XObject", {})
            xo = (
                doc.resolve(xobjects.get(operands[-1].value))
                if isinstance(xobjects, dict)
                else None
            )
            subtype = doc.get(xo, "Subtype")
            if isinstance(xo, Stream) and isinstance(subtype, Name) and subtype.value == "Form":
                inner = doc.get(xo, "Resources", resources)
                with contextlib.suppress(PdfError):
                    out.append(_run_text(doc, decode_stream(xo), inner, depth + 1))
        operands = []
    return "".join(out)


def page_texts(data: bytes) -> list[str]:
    """Plain text of every page, in order (raises ``PdfError``)."""
    doc = parse(data)
    texts = []
    for num, attrs in doc.page_refs():
        page = doc.objects[num].value
        try:
            content = _content_bytes(doc, page.get("Contents"))
        except PdfError:
            content = b""
        resources = doc.resolve(page.get("Resources", attrs.get("Resources")))
        texts.append(_run_text(doc, content, resources))
    return texts


def page_count(data: bytes) -> int:
    return len(parse(data).page_refs())


# ---------- writing: the sample ----------


def _ser(v) -> bytes:
    if v is None:
        return b"null"
    if v is True:
        return b"true"
    if v is False:
        return b"false"
    if isinstance(v, Name):
        return b"/" + v.raw
    if isinstance(v, Number):
        return v.raw
    if isinstance(v, int):
        return str(v).encode()
    if isinstance(v, Ref):
        return f"{v.num} {v.gen} R".encode()
    if isinstance(v, String):
        return b"<" + v.data.hex().encode() + b">"
    if isinstance(v, list):
        return b"[" + b" ".join(_ser(x) for x in v) + b"]"
    if isinstance(v, dict):
        return (
            b"<<"
            + b"".join(b"/" + k.encode("latin-1") + b" " + _ser(x) for k, x in v.items())
            + b">>"
        )
    if isinstance(v, Op):
        return v.name
    raise PdfError("cannot serialise value")


def _refs(v, acc: list[int]):
    if isinstance(v, Ref):
        acc.append(v.num)
    elif isinstance(v, list):
        for x in v:
            _refs(x, acc)
    elif isinstance(v, dict):
        for x in v.values():
            _refs(x, acc)


# page keys dropped from sample pages: links/annotations, thumbnails, beads and structure point
# at other pages (or the whole document); the parent is replaced by the new page tree
DROP_PAGE_KEYS = {
    "Parent",
    "Annots",
    "B",
    "Thumb",
    "StructParents",
    "Tabs",
    "PieceInfo",
    "Metadata",
}


def build_sample(data: bytes, pages: int) -> tuple[bytes, int]:
    """A new PDF with only the first ``pages`` pages: ``(bytes, page count)``.

    Only objects reachable from those pages are written (outline, names, annotations and the
    original page tree are left out), so later pages' content cannot leak into the sample.
    """
    doc = parse(data)
    refs = doc.page_refs()
    if not refs:
        raise PdfError("no pages")
    chosen = refs[: max(1, pages)]
    new_objects: dict[int, bytes] = {}
    renum: dict[int, int] = {}
    next_num = [3]  # 1 catalog, 2 pages

    def num_for(old: int) -> int:
        if old not in renum:
            renum[old] = next_num[0]
            next_num[0] += 1
        return renum[old]

    def remap(v):
        if isinstance(v, Ref):
            return Ref(num_for(v.num))
        if isinstance(v, list):
            return [remap(x) for x in v]
        if isinstance(v, dict):
            return {k: remap(x) for k, x in v.items()}
        return v

    page_nums = []
    queue: list[int] = []
    for num, attrs in chosen:
        page = dict(doc.objects[num].value)
        for key in DROP_PAGE_KEYS:
            page.pop(key, None)
        for key, value in attrs.items():
            page.setdefault(key, value)
        page["Parent"] = Ref(2)
        acc: list[int] = []
        _refs({k: v for k, v in page.items() if k != "Parent"}, acc)
        queue.extend(acc)
        new = num_for(num)
        page_nums.append(new)
        body = remap({k: v for k, v in page.items() if k != "Parent"})
        body["Parent"] = Ref(2)
        new_objects[new] = _ser(body)
    page_set = {num for num, _ in refs}
    seen = {num for num, _ in chosen}
    while queue:
        old = queue.pop()
        if old in seen:
            continue
        seen.add(old)
        if old in page_set:
            raise PdfError("a resource points at another page")
        obj = doc.objects.get(old)
        if obj is None:
            new_objects[num_for(old)] = b"null"
            continue
        acc = []
        _refs(obj.value, acc)
        queue.extend(acc)
        if obj.stream is not None:
            d = dict(obj.stream.dict)
            d["Length"] = Number(str(len(obj.stream.raw)).encode())
            new_objects[num_for(old)] = (
                _ser(remap(d)) + b"\nstream\n" + obj.stream.raw + b"\nendstream"
            )
        else:
            new_objects[num_for(old)] = _ser(remap(obj.value))
    new_objects[1] = b"<</Type /Catalog /Pages 2 0 R>>"
    kids = b" ".join(f"{n} 0 R".encode() for n in page_nums)
    new_objects[2] = (
        b"<</Type /Pages /Kids [" + kids + b"] /Count " + str(len(page_nums)).encode() + b">>"
    )
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = {}
    for num in sorted(new_objects):
        offsets[num] = len(out)
        out += f"{num} 0 obj\n".encode() + new_objects[num] + b"\nendobj\n"
    size = max(new_objects) + 1
    xref = len(out)
    out += f"xref\n0 {size}\n".encode() + b"0000000000 65535 f \n"
    for num in range(1, size):
        if num in offsets:
            out += f"{offsets[num]:010d} 00000 n \n".encode()
        else:
            out += b"0000000000 65535 f \n"
    out += f"trailer\n<</Size {size} /Root 1 0 R>>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out), len(page_nums)
