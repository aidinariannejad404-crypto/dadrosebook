"""``track_server_event`` → Umami ``/api/send`` (Celery runs eagerly in tests)."""

from unittest import mock

import pytest
import requests
from django.test import RequestFactory

from apps.core import analytics

UMAMI = {
    "UMAMI_HOST": "https://stats.dadrosebook.com",
    "UMAMI_WEBSITE_ID": "11111111-2222-3333-4444-555555555555",
    "SITE_HOST": "dadrosebook.com",
}


@pytest.fixture
def configured(settings):
    for key, value in UMAMI.items():
        setattr(settings, key, value)
    return settings


@pytest.mark.parametrize(
    "overrides",
    [
        {"UMAMI_HOST": "", "UMAMI_WEBSITE_ID": ""},
        {"UMAMI_HOST": "https://stats.dadrosebook.com", "UMAMI_WEBSITE_ID": ""},
        {"UMAMI_HOST": "", "UMAMI_WEBSITE_ID": "abc"},
    ],
)
def test_noop_when_not_configured(settings, overrides):
    for key, value in overrides.items():
        setattr(settings, key, value)
    with mock.patch("apps.core.analytics.requests.post") as post:
        analytics.track_server_event("purchase", {"value": 1})
    post.assert_not_called()


def test_posts_umami_payload(configured):
    with mock.patch("apps.core.analytics.requests.post") as post:
        analytics.track_server_event(
            "purchase",
            {"order_number": "DR-1001", "value": 2_200_000, "currency": "TOMAN"},
            url="/checkout/result",
        )
    post.assert_called_once()
    args, kwargs = post.call_args
    assert args[0] == "https://stats.dadrosebook.com/api/send"
    assert kwargs["json"] == {
        "type": "event",
        "payload": {
            "website": UMAMI["UMAMI_WEBSITE_ID"],
            "hostname": "dadrosebook.com",
            "url": "/checkout/result",
            "name": "purchase",
            "data": {"order_number": "DR-1001", "value": 2_200_000, "currency": "TOMAN"},
            "language": "fa-IR",
        },
    }
    assert kwargs["timeout"] == 3
    user_agent = kwargs["headers"]["User-Agent"]
    assert user_agent.startswith("Mozilla/5.0")
    assert "bot" not in user_agent.lower()


def test_forwards_client_ip_from_request(configured):
    request = RequestFactory().post("/", REMOTE_ADDR="5.6.7.8")
    with mock.patch("apps.core.analytics.requests.post") as post:
        analytics.track_server_event("purchase", None, request=request)
    assert post.call_args.kwargs["headers"]["X-Forwarded-For"] == "5.6.7.8"
    assert post.call_args.kwargs["json"]["payload"]["data"] == {}


@pytest.mark.parametrize(
    "error",
    [requests.Timeout("slow"), requests.ConnectionError("down"), ValueError("weird")],
)
def test_never_raises_and_logs_warning(configured, caplog, error):
    with mock.patch("apps.core.analytics.requests.post", side_effect=error):
        analytics.track_server_event("purchase", {"value": 1})
    assert "not sent" in caplog.text


def test_http_error_is_logged(configured, caplog):
    response = mock.Mock()
    response.raise_for_status.side_effect = requests.HTTPError("500")
    with mock.patch("apps.core.analytics.requests.post", return_value=response):
        assert analytics.send_event(analytics.build_payload("x", {})) is False
    assert "not sent" in caplog.text


def test_broker_failure_does_not_raise(configured, caplog):
    with mock.patch(
        "apps.core.tasks.send_analytics_event.delay", side_effect=ConnectionError("no broker")
    ):
        analytics.track_server_event("purchase", {})
    assert "not queued" in caplog.text
