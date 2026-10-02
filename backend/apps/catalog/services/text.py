import nh3

ALLOWED_TAGS = {
    "p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote",
    "h2", "h3", "h4", "a", "span", "hr",
}  # fmt: skip
ALLOWED_ATTRIBUTES = {"a": {"href", "title"}}


def sanitize_html(html: str | None) -> str:
    """Strip everything except a small set of formatting tags (descriptions come from the admin)."""
    if not html:
        return ""
    return nh3.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        url_schemes={"http", "https", "mailto"},
        link_rel="noopener noreferrer",
    ).strip()
