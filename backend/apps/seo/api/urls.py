from django.urls import path

from . import views

app_name = "seo"

urlpatterns = [
    path("redirects/", views.RedirectMapView.as_view(), name="redirects"),
    path("redirects/hit/", views.RedirectHitView.as_view(), name="redirect-hit"),
    path("not-found/", views.NotFoundView.as_view(), name="not-found"),
    path("sitemap/", views.SitemapView.as_view(), name="sitemap"),
]
