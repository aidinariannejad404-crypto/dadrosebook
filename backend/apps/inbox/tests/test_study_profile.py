import datetime as dt

import pytest

from apps.catalog.models import ExamEvent
from apps.inbox.services import study_profile as sp

TODAY = dt.date(2026, 10, 5)  # 1405/07/13


def test_year_choices():
    assert sp.year_choices(TODAY) == [1405, 1406, 1407, 1408]


def test_save_and_show_once(user, exam, subjects):
    assert sp.should_show_onboarding(user) is True
    profile = sp.save_profile(
        user,
        exam_type="vekalat",
        exam_year=1405,
        weak_subjects=["madani", "jaza"],
        today=TODAY,
    )
    assert profile.exam_type == exam
    assert sorted(s.slug for s in profile.weak_subjects.all()) == ["jaza", "madani"]
    assert profile.completed_at is not None
    assert sp.should_show_onboarding(user) is False


def test_skip(user):
    sp.skip_onboarding(user)
    assert sp.should_show_onboarding(user) is False


@pytest.mark.parametrize(
    ("kwargs", "field"),
    [
        ({"exam_type": "nope"}, "exam_type"),
        ({"exam_type": None, "exam_year": 1390}, "exam_year"),
        ({"exam_type": None, "exam_date": dt.date(2020, 1, 1)}, "exam_date"),
        (
            {"exam_type": None, "weak_subjects": ["madani", "tejarat", "jaza", "aein"]},
            "weak_subjects",
        ),
        ({"exam_type": None, "weak_subjects": ["unknown"]}, "weak_subjects"),
    ],
)
def test_validation(user, exam, subjects, kwargs, field):
    with pytest.raises(sp.StudyProfileError) as err:
        sp.save_profile(user, today=TODAY, **kwargs)
    assert err.value.field == field


def test_exam_date_sets_year(user, exam):
    p = sp.save_profile(user, exam_type="vekalat", exam_date=dt.date(2027, 3, 1), today=TODAY)
    assert p.exam_year == 1405


def test_upcoming_exams(exam):
    ExamEvent.objects.create(name="آزمون وکالت ۱۴۰۵", exam_type=exam, date=dt.date(2027, 3, 1))
    ExamEvent.objects.create(name="گذشته", exam_type=exam, date=dt.date(2025, 1, 1))
    assert sp.upcoming_exams(TODAY) == [
        {"exam_type": "vekalat", "name": "آزمون وکالت ۱۴۰۵", "date": "2027-03-01"}
    ]


def test_api(auth_api, exam, subjects):
    res = auth_api.get("/api/v1/me/study-profile/")
    assert res.status_code == 200
    body = res.json()
    assert body["show_onboarding"] is True and body["profile"]["exam_type"] is None
    assert body["max_weak_subjects"] == 3
    year = body["year_choices"][0]
    res = auth_api.put(
        "/api/v1/me/study-profile/",
        {"exam_type": "vekalat", "exam_year": year, "weak_subjects": ["madani"]},
        format="json",
    )
    assert res.status_code == 200, res.json()
    body = res.json()
    assert body["profile"]["exam_type"] == "vekalat"
    assert body["profile"]["exam_type_name"] == "وکالت"
    assert body["profile"]["weak_subjects"] == ["madani"]
    assert body["show_onboarding"] is False
    res = auth_api.put("/api/v1/me/study-profile/", {"exam_type": "x"}, format="json")
    assert res.status_code == 400 and "exam_type" in res.json()


def test_skip_api(auth_api, api):
    assert api.post("/api/v1/me/study-profile/skip/").status_code == 401
    res = auth_api.post("/api/v1/me/study-profile/skip/")
    assert res.status_code == 200 and res.json()["show_onboarding"] is False
