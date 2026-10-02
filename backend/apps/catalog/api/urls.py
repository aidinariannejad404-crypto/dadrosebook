from django.urls import path

from . import views

app_name = "catalog"

# ``str`` converters (not ``slug``) so Unicode Persian slugs resolve.
urlpatterns = [
    path("home/", views.HomeView.as_view(), name="home"),
    path("books/", views.BookListView.as_view(), name="book-list"),
    path("books/<str:slug>/", views.BookDetailView.as_view(), name="book-detail"),
    path("books/<str:slug>/related/", views.RelatedBooksView.as_view(), name="book-related"),
    path("subjects/", views.SubjectListView.as_view(), name="subject-list"),
    path("exam-types/", views.ExamTypeListView.as_view(), name="exam-type-list"),
    path("categories/", views.CategoryTreeView.as_view(), name="category-list"),
    path("categories/<str:slug>/", views.CategoryDetailView.as_view(), name="category-detail"),
    path("exam-events/", views.ExamEventListView.as_view(), name="exam-event-list"),
    path("courses/", views.CourseListView.as_view(), name="course-list"),
    path("study-kits/", views.StudyKitListView.as_view(), name="study-kit-list"),
]
