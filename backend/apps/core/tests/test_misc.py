import pytest
from django.core.files.base import ContentFile
from django.core.files.storage import storages

from apps.core.tasks import ping


def test_ping_task():
    assert ping.delay().get() == "pong"


def test_private_storage_has_no_url(tmp_path, settings):
    storage = storages["private"]
    storage.location = str(tmp_path)
    name = storage.save("ebook.pdf", ContentFile(b"%PDF"))
    assert storage.exists(name)
    with pytest.raises(NotImplementedError):
        storage.url(name)


@pytest.mark.django_db
def test_health(client):
    response = client.get("/api/v1/health/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
