from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from apps.accounts.admin_views import staff_2fa_view
from apps.backoffice.views import sales_report_view
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
    path("cart/", include("apps.cart.api.urls")),
    path("back-in-stock/", include("apps.engagement.api.urls")),
    path("library/", include("apps.reader.api.urls")),
    path("seo/", include("apps.seo.api.urls")),
    path("growth/", include("apps.growth.api.urls")),  # growth: Torob, kit links, gifts, campaigns
    # --- د۳/د۴ impl/trust: me/readiness/, me/back-in-stock/, me/study-*, me/orders/<n>/start/ ---
    path("", include("apps.studyhub.api.urls")),
    # hubs, guides and curated lists (package ب, impl/hubs)
    path("content/", include("apps.content.api.urls")),
    path("study/", include("apps.study.api.urls")),  # retention stream
    # --- platform stream: inbox/me/changelog (PF-2/3/8/17) and support tickets (PF-11) ---
    path("", include("apps.inbox.api.urls")),
    path("support/", include("apps.support.api.urls")),
]

urlpatterns = [
    path("admin/2fa/", staff_2fa_view, name="staff-2fa"),
    path(
        "admin/reports/sales/",
        admin.site.admin_view(sales_report_view),
        name="backoffice-sales-report",
    ),
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1)),
]

if settings.DEBUG:
    # Public media only; private_media/ is never served.
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
