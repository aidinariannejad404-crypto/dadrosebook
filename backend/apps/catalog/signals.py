"""Keep ``Book.search_text`` in sync with M2M and related-name changes."""

from django.db.models.signals import m2m_changed, post_save
from django.dispatch import receiver

from .models import Book, Person, Publisher, Subject
from .services.search import refresh_books, refresh_search_text

_M2M_ACTIONS = {"post_add", "post_remove", "post_clear"}


def _on_book_m2m_changed(sender, instance, action, reverse, pk_set, **kwargs):
    if action not in _M2M_ACTIONS:
        return
    if not reverse:
        refresh_search_text(instance)
    elif pk_set:
        refresh_books(Book.objects.filter(pk__in=pk_set))
    # reverse post_clear has no pk_set; rare (deleting a Person clears via cascade) — ignored.


for _through in (Book.authors.through, Book.translators.through, Book.subjects.through):
    m2m_changed.connect(_on_book_m2m_changed, sender=_through, dispatch_uid=f"search-{_through}")


@receiver(post_save, sender=Person, dispatch_uid="search-person-renamed")
def _person_saved(sender, instance, created, **kwargs):
    if not created:
        refresh_books(
            Book.objects.filter(authors=instance) | Book.objects.filter(translators=instance)
        )


@receiver(post_save, sender=Subject, dispatch_uid="search-subject-renamed")
def _subject_saved(sender, instance, created, **kwargs):
    if not created:
        refresh_books(instance.books.all())


@receiver(post_save, sender=Publisher, dispatch_uid="search-publisher-renamed")
def _publisher_saved(sender, instance, created, **kwargs):
    if not created:
        refresh_books(instance.books.all())
