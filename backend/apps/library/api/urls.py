from django.urls import path

from .views import ClaimFreeView, LibraryView

urlpatterns = [
    path("", LibraryView.as_view(), name="library"),
    path("<str:slug>/claim-free/", ClaimFreeView.as_view(), name="library-claim-free"),
]
