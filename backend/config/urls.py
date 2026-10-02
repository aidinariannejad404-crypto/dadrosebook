from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from apps.core.views import HealthView, StoreSettingsView

api_v1 = [
    path("health/", HealthView.as_view(), name="health"),
    path("store/settings/", StoreSettingsView.as_view(), name="store-settings"),
    path("catalog/", include("apps.catalog.api.urls")),
    path("leads/", include("apps.leads.api.urls")),
    path("library/", include("apps.reader.api.urls")),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1)),
]

if settings.DEBUG:
    # Public media only; private_media/ is never served.
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
