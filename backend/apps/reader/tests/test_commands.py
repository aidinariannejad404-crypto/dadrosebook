import pytest
from django.core.management import call_command

from apps.catalog.models import Book
from apps.library.models import EbookFile
from apps.reader.models import EpubPackage, ReaderAccessLog
from apps.reader.services.epub import delete_package


@pytest.mark.django_db
def test_seed_epub_and_process_command(capsys):
    Book.objects.create(title="آیین دادرسی مدنی")
    call_command("seed_demo_ebooks", "--epub", "--limit", "1")
    ebook = EbookFile.objects.get(format="EPUB")
    assert EpubPackage.objects.get(ebook=ebook).chapters.count() == 3
    call_command("process_ebooks")
    assert "processed 0" in capsys.readouterr().out
    call_command("process_ebooks", "--force")
    assert "processed 1" in capsys.readouterr().out
    delete_package(ebook)
    ebook.file.delete(save=False)


@pytest.mark.django_db
def test_prune_reader_logs(capsys):
    old = ReaderAccessLog.objects.create(kind="open")
    ReaderAccessLog.objects.filter(pk=old.pk).update(created_at="2020-01-01T00:00:00Z")
    ReaderAccessLog.objects.create(kind="open")
    call_command("prune_reader_logs")
    assert ReaderAccessLog.objects.count() == 1
