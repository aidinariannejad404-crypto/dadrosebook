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
    # Phase 3
    path("", include("apps.accounts.api.urls")),  # auth/…, me/, addresses/
    path("", include("apps.orders.api.urls")),  # shipping-methods/, checkout/…, orders/…
    path("payments/", include("apps.payments.api.urls")),
    path("library/", include("apps.library.api.urls")),
    path("", include("apps.reviews.api.urls")),  # catalog/books/<slug>/reviews/, me/reviews/
    path("wishlist/", include("apps.wishlist.api.urls")),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1)),
]

if settings.DEBUG:
    # Public media only; private_media/ is never served.
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
