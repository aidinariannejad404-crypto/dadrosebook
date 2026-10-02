from django.urls import path

from .views import LibraryView

urlpatterns = [
    path("", LibraryView.as_view(), name="library"),
]
