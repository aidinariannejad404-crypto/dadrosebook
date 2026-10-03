from django.urls import path

from . import views

app_name = "reader"

urlpatterns = [
    path("files/<str:token>/", views.FileView.as_view(), name="file"),
    path("<str:slug>/read/", views.ReadView.as_view(), name="read"),
    path("<str:slug>/progress/", views.ProgressView.as_view(), name="progress"),
    path("<str:slug>/highlights/", views.HighlightListView.as_view(), name="highlights"),
    path(
        "<str:slug>/highlights/<int:pk>/",
        views.HighlightDetailView.as_view(),
        name="highlight",
    ),
]
