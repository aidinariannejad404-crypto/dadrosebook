"""Display clean-up for book descriptions imported from Sazito.

The stored HTML is already allow-listed (``text.sanitize_html``). Imported descriptions still carry
noise that hurts the product page: ``<img>`` tags with relative ``/uploads/...`` URLs that no
longer resolve (the alt text shows instead), embedded players, empty ``<p></p>`` spacers, ``·``
pseudo-bullets and a «ناشر : … / تعداد صفحات : …» spec list that duplicates the specs table.

``clean_description`` returns the HTML the API exposes: headings, paragraphs, real lists, bold,
links and tables are kept; everything else is unwrapped or dropped. Pure function, no DB access.
"""

import re
from dataclasses import dataclass, field
from functools import lru_cache
from html import escape
from html.parser import HTMLParser

import nh3

# Images, players and layout wrappers are not allowed here; their text content (if any) is kept
# (unwrapped), except for the tags in DROP_CONTENT.
KEEP_TAGS = {
    "p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote",
    "h2", "h3", "h4", "a", "hr", "table", "thead", "tbody", "tr", "th", "td",
}  # fmt: skip
DROP_CONTENT = {"script", "style", "iframe", "object", "embed", "noscript", "video", "audio"}
ATTRIBUTES = {"a": {"href", "title"}, "th": {"colspan", "rowspan"}, "td": {"colspan", "rowspan"}}
VOID = {"br", "hr"}
BLOCKS = {"p", "ul", "ol", "li", "blockquote", "h2", "h3", "h4", "table", "hr"}
HEADINGS = {"h2", "h3", "h4"}

# «ناشر : پیام غدیر», «تعداد صفحات: ۵۷۴» … — labels of the duplicated spec list.
SPEC_LABELS = (
    "ناشر", "انتشارات", "سال انتشار", "سال چاپ", "سال", "چاپ", "نوبت چاپ", "نوبت انتشار",
    "نوع کتاب", "نوع جلد", "جلد", "جلد کتاب", "قطع", "تعداد صفحات", "تعداد صفحه", "تعداد جلد",
    "مولف", "مؤلف", "مولفان", "مؤلفان", "نویسنده", "نویسندگان", "مترجم", "شابک", "ویرایش",
    "زبان", "وزن", "سبک کتاب",
)  # fmt: skip
_LABELS = "|".join(re.escape(x) for x in sorted(SPEC_LABELS, key=len, reverse=True))
SPEC_LINE = re.compile(r"^[\s\u00a0]*(?:" + _LABELS + r")[\s\u00a0]*[:：]")
# any short «برچسب : مقدار» line (the spec list mixes known and ad-hoc labels)
LABEL_LINE = re.compile(r"^[\s\u00a0]*[^:：\n]{1,30}[:：]")
SPEC_CELL = re.compile(r"^[\s\u00a0]*(?:" + _LABELS + r")[\s\u00a0]*[:：]?[\s\u00a0]*$")
SPEC_HEADING = re.compile(r"مشخصات")
BULLET = re.compile(r"^[\s ]*[·•●▪◦✅✔️-]+[\s ]*")
EMPTY_TEXT = re.compile(r"^[\s ‌​]*$")


@dataclass
class Node:
    tag: str  # "" for a text node
    attrs: list[tuple[str, str | None]] = field(default_factory=list)
    children: list["Node"] = field(default_factory=list)
    text: str = ""

    def text_content(self) -> str:
        if not self.tag:
            return self.text
        return "".join(c.text_content() for c in self.children)


class _TreeBuilder(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("root")
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Node(tag, attrs))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        self.stack[-1].children.append(Node("", text=data))


def _parse(html: str) -> Node:
    builder = _TreeBuilder()
    builder.feed(html)
    builder.close()
    return builder.root


def _serialize(node: Node) -> str:
    if not node.tag:
        return escape(node.text, quote=False)
    inner = "".join(_serialize(c) for c in node.children)
    if node.tag == "root":
        return inner
    attrs = "".join(f' {k}="{escape(v or "", quote=True)}"' for k, v in node.attrs)
    if node.tag in VOID:
        return f"<{node.tag}{attrs}>"
    return f"<{node.tag}{attrs}>{inner}</{node.tag}>"


def _is_empty(node: Node) -> bool:
    """No visible text (only whitespace, NBSP, ZWNJ and <br>)."""
    if not node.tag:
        return bool(EMPTY_TEXT.match(node.text))
    if node.tag == "hr":
        return False
    return all(_is_empty(c) for c in node.children)


def _is_spec_list(node: Node) -> bool:
    if node.tag not in {"ul", "ol"}:
        return False
    items = [c.text_content() for c in node.children if c.tag == "li"]
    known = sum(1 for t in items if SPEC_LINE.match(t))
    labelled = sum(1 for t in items if LABEL_LINE.match(t))
    return known >= 2 and labelled * 10 >= len(items) * 6


def _rows(node: Node) -> list[Node]:
    rows: list[Node] = []
    for c in node.children:
        if c.tag == "tr":
            rows.append(c)
        elif c.tag in {"thead", "tbody"}:
            rows.extend(_rows(c))
    return rows


def _is_spec_table(node: Node) -> bool:
    """A two-column «مولف : | علیرضا عبدالملکی» table."""
    if node.tag != "table":
        return False
    rows = _rows(node)
    firsts = []
    for row in rows:
        cells = [c for c in row.children if c.tag in {"th", "td"}]
        if cells:
            firsts.append(cells[0].text_content())
    known = sum(1 for t in firsts if SPEC_CELL.match(t))
    return known >= 1 and (known == len(firsts) or (known >= 2 and known * 2 >= len(firsts)))


def _is_spec_line(node: Node) -> bool:
    """A short «سال چاپ: ۱۴۰۱» paragraph (a sentence that merely starts with a label is kept)."""
    text = node.text_content().strip()
    return node.tag == "p" and len(text) <= 60 and bool(SPEC_LINE.match(text))


def _strip_bullet(node: Node) -> None:
    """Remove the leading «·» from the first text node of a paragraph."""
    for child in node.children:
        if not child.tag:
            if EMPTY_TEXT.match(child.text):
                continue
            child.text = BULLET.sub("", child.text, count=1)
            return
        if child.tag != "br":
            _strip_bullet(child)
            return


def _is_bullet_paragraph(node: Node) -> bool:
    return node.tag == "p" and bool(re.match(r"^[\s ]*[·•●▪◦]", node.text_content()))


def _trim_breaks(node: Node) -> None:
    """Drop <br>/whitespace at the start and end of a block."""
    while node.children and (
        node.children[0].tag == "br" or (not node.children[0].tag and _is_empty(node.children[0]))
    ):
        node.children.pop(0)
    while node.children and (
        node.children[-1].tag == "br"
        or (not node.children[-1].tag and _is_empty(node.children[-1]))
    ):
        node.children.pop()


def _drop_spec_blocks(node: Node) -> None:
    """Top-down: the spec list/table goes whole, before its cells are cleaned."""
    out: list[Node] = []
    for child in node.children:
        if _is_spec_list(child) or _is_spec_table(child):
            # its «مشخصات کتاب …» heading goes too (empty blocks between are dropped later)
            while out and (out[-1].tag in BLOCKS or out[-1].tag in HEADINGS):
                prev = out[-1]
                spec_heading = prev.tag in HEADINGS and SPEC_HEADING.search(prev.text_content())
                if spec_heading or (prev.tag in BLOCKS and _is_empty(prev)):
                    out.pop()
                else:
                    break
            continue
        if child.tag:
            _drop_spec_blocks(child)
        out.append(child)
    node.children = out


def _clean_children(node: Node) -> None:
    for child in node.children:
        if child.tag:
            _clean_children(child)

    out: list[Node] = []
    children = node.children
    i = 0
    while i < len(children):
        child = children[i]
        if child.tag in BLOCKS - {"hr"}:
            _trim_breaks(child)
        # loose «سال چاپ: ۱۴۰۱» lines at block level (not inside a list item or table cell)
        if node.tag in {"root", "blockquote"} and _is_spec_line(child):
            while i < len(children) and (_is_spec_line(children[i]) or _is_empty(children[i])):
                i += 1
            if out and out[-1].tag in HEADINGS and SPEC_HEADING.search(out[-1].text_content()):
                out.pop()
            continue
        # «·  item» paragraphs → one real list
        if _is_bullet_paragraph(child):
            items: list[Node] = []
            while i < len(children) and _is_bullet_paragraph(children[i]):
                p = children[i]
                _strip_bullet(p)
                items.append(Node("li", children=p.children))
                i += 1
            out.append(Node("ul", children=items))
            continue
        if child.tag and child.tag != "br" and child.tag in BLOCKS and _is_empty(child):
            i += 1
            continue
        out.append(child)
        i += 1
    # a lone <br> between blocks is noise
    if node.tag in {"root", "blockquote", "li", "td", "th"}:
        out = [c for c in out if c.tag != "br" or node.tag in {"li", "td", "th"}]
    node.children = out


@lru_cache(maxsize=512)
def clean_description(html: str | None) -> str:
    if not html:
        return ""
    allowed = nh3.clean(
        html,
        tags=KEEP_TAGS,
        clean_content_tags=DROP_CONTENT,
        attributes=ATTRIBUTES,
        url_schemes={"http", "https", "mailto"},
        link_rel="noopener noreferrer",
    )
    root = _parse(allowed)
    _drop_spec_blocks(root)
    _clean_children(root)
    # second pass: the structure may expose new empties (e.g. a heading left alone)
    _clean_children(root)
    result = _serialize(root).strip()
    # re-sanitise the serialiser's output so the API never emits anything outside the allow-list
    return nh3.clean(
        result,
        tags=KEEP_TAGS,
        attributes=ATTRIBUTES,
        url_schemes={"http", "https", "mailto"},
        link_rel="noopener noreferrer",
    ).strip()
