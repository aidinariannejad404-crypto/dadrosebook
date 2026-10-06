from urllib.parse import quote

import pytest

from apps.catalog.models import Person, RelatedCourse
from apps.content.models import Guide
from apps.content.services import hubs

from .conftest import words

pytestmark = pytest.mark.django_db


def url(kind: str, slug: str) -> str:
    return f"/api/v1/content/{kind}/{quote(slug)}/"


def test_exam_hub_groups_by_weight_and_puts_kit_essentials_first(hub_world):
    data = hubs.exam_hub(hub_world["exam"].slug)
    assert data["book_count"] == 4  # inactive book excluded
    assert data["indexable"] is True
    assert [g["subject"].name for g in data["groups"]] == ["حقوق تجارت", "حقوق مدنی"]  # weight 5, 3
    civil = data["groups"][1]
    assert civil["weight"] == 3 and civil["book_count"] == 3
    # «مدنی 0» has the fewest sales but is the kit essential → first
    assert [b.title for b in civil["books"]] == ["مدنی 0", "مدنی 2", "مدنی 1"]
    assert data["kit"] == {"essential_count": 1, "book_count": 2, "subject_count": 2}
    assert data["next_event"].name == "آزمون کانون ۱۴۰۵"


def test_exam_hub_unknown_or_inactive(hub_world):
    assert hubs.exam_hub("نیست") is None
    hub_world["exam"].is_active = False
    hub_world["exam"].save()
    assert hubs.exam_hub(hub_world["exam"].slug) is None


def test_exam_hub_placeholder_intro_is_noindex(hub_world):
    exam = hub_world["exam"]
    exam.intro_is_placeholder = True
    exam.save()
    assert hubs.exam_hub(exam.slug)["indexable"] is False


def test_exam_hub_api_shape(api, hub_world):
    RelatedCourse.objects.create(
        title="دوره جامع مدنی", url="https://dadrose.com/c/1", price=1_000_000
    ).exam_types.set([hub_world["exam"]])
    guide = Guide.objects.create(title="راهنما", body="<p>متن</p>", status="PUBLISHED")
    guide.exam_types.set([hub_world["exam"]])
    Guide.objects.create(title="پیش‌نویس", body="<p>متن</p>").exam_types.set([hub_world["exam"]])
    response = api.get(url("exams", hub_world["exam"].slug))
    assert response.status_code == 200
    body = response.json()
    assert set(body) >= {"exam", "intro_words", "indexable", "next_event", "kit", "groups"}
    assert body["exam"]["intro"].startswith("<p>")
    assert body["groups"][1]["books"][0]["kit_role"] == "essential"
    assert [c["title"] for c in body["courses"]] == ["دوره جامع مدنی"]
    assert [g["title"] for g in body["guides"]] == ["راهنما"]  # drafts never listed
    assert api.get(url("exams", "نیست")).status_code == 404


def test_intro_html_is_sanitised(hub_world):
    exam = hub_world["exam"]
    exam.intro = '<p onclick="x()">سلام</p><script>alert(1)</script>'
    exam.save()
    exam.refresh_from_db()
    assert exam.intro == "<p>سلام</p>"


def test_subject_hub(api, hub_world):
    civil = hub_world["civil"]
    data = hubs.subject_hub(civil.slug)
    assert data["book_count"] == 3
    assert data["indexable"] is False  # no intro yet
    civil.intro = words(150)
    civil.save()
    assert hubs.subject_hub(civil.slug)["indexable"] is True
    body = api.get(url("subjects", civil.slug)).json()
    assert [b["title"] for b in body["books"]] == ["مدنی 2", "مدنی 1", "مدنی 0"]  # by sales
    assert body["exams"] == [
        {"exam": body["exams"][0]["exam"], "book_count": 3},
    ]
    assert body["authors"][0]["person"]["name"] == "دکتر شکری"
    assert body["authors"][0]["book_count"] == 3


def test_author_hub_lists_authored_and_translated(api, hub_world):
    data = hubs.author_hub(hub_world["author"].slug)
    assert data["book_count"] == 3 and data["indexable"] is True
    assert len(data["authored"]) == 3 and data["translated"] == []
    translator = hubs.author_hub(hub_world["translator"].slug)
    assert translator["book_count"] == 1 and translator["indexable"] is False
    assert [b.title for b in translator["translated"]] == ["تجارت جامع"]


def test_author_hub_credentials_and_same_as(api, hub_world):
    person = hub_world["author"]
    person.affiliation = "دانشگاه تهران"
    person.same_as = "https://ut.ac.ir/x\nhttp://insecure.example\nnot a url\nhttps://ut.ac.ir/x"
    person.save()
    body = api.get(url("authors", person.slug)).json()
    assert body["person"]["job_title"] == "استاد دانشگاه"
    assert body["person"]["affiliation"] == "دانشگاه تهران"
    assert body["same_as"] == ["https://ut.ac.ir/x"]


def test_author_without_books_or_bio_is_404(api, db):
    Person.objects.create(name="بی‌کتاب")
    assert api.get(url("authors", "بی-کتاب")).status_code == 404
    Person.objects.create(name="با بیوگرافی", bio="زندگی‌نامه")
    assert api.get(url("authors", "با-بیوگرافی")).status_code == 200


def test_publisher_hub(api, hub_world):
    body = api.get(url("publishers", hub_world["publisher"].slug)).json()
    assert body["book_count"] == 4
    assert body["indexable"] is True
    assert {s["name"] for s in body["subjects"]} == {"حقوق مدنی", "حقوق تجارت"}
    assert api.get(url("publishers", "نیست")).status_code == 404
