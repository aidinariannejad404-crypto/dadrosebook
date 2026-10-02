"""``Book.resource_type`` and the legacy ``is_quick_review`` flag stay in sync.

``resource_type == QUICK_REVIEW`` ⇔ ``is_quick_review``. Whichever of the two was changed wins:

- a new book, or one whose ``resource_type`` changed since it was loaded: ``resource_type`` wins;
- otherwise ``is_quick_review`` wins (code and fixtures that only set the flag keep working).
"""

QUICK_REVIEW = "QUICK_REVIEW"
TEXTBOOK = "TEXTBOOK"


def sync_quick_review(book, loaded_resource_type: str | None) -> None:
    """Make ``book.is_quick_review`` and ``book.resource_type`` agree (in place, no save)."""
    if loaded_resource_type is None:
        # New book: an explicit non-default resource type wins over the flag.
        resource_wins = book.resource_type != TEXTBOOK
    else:
        resource_wins = book.resource_type != loaded_resource_type

    if resource_wins:
        book.is_quick_review = book.resource_type == QUICK_REVIEW
    elif book.is_quick_review:
        book.resource_type = QUICK_REVIEW
    elif book.resource_type == QUICK_REVIEW:
        book.resource_type = TEXTBOOK
