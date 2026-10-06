import pytest

from apps.orders.tests.conftest import (  # noqa: F401  (re-exported fixtures)
    address,
    api,
    auth_api,
    books,
    methods,
    no_free_shipping,
    other_user,
    shiraz_address,
    user,
)


@pytest.fixture(autouse=True)
def _site_url(settings):
    settings.SITE_URL = "https://dadrosebook.com"
