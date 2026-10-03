from django.urls import path

from . import views

app_name = "reviews"

# Included at the /api/v1/ root. ``str`` converter so Unicode Persian slugs resolve.
urlpatterns = [
    path("catalog/books/<str:slug>/reviews/", views.BookReviewsView.as_view(), name="book-reviews"),
    path("me/reviews/", views.MyReviewsView.as_view(), name="my-reviews"),
]
