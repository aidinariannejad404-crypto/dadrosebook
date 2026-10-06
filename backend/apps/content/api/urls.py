from django.urls import path

from . import views

app_name = "content"

# ``str`` converters so Unicode Persian slugs resolve.
urlpatterns = [
    path("exams/<str:slug>/", views.ExamHubView.as_view(), name="exam-hub"),
    path("subjects/<str:slug>/", views.SubjectHubView.as_view(), name="subject-hub"),
    path("authors/<str:slug>/", views.AuthorHubView.as_view(), name="author-hub"),
    path("publishers/<str:slug>/", views.PublisherHubView.as_view(), name="publisher-hub"),
    path("guides/", views.GuideListView.as_view(), name="guide-list"),
    path("guides/<str:slug>/", views.GuideDetailView.as_view(), name="guide-detail"),
    path("lists/<str:slug>/", views.CuratedListDetailView.as_view(), name="list-detail"),
]
