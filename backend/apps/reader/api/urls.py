from django.urls import path

from . import views

app_name = "reader"

urlpatterns = [
    path("files/<str:token>/", views.FileView.as_view(), name="file"),
    path("epub-assets/<str:token>/", views.EpubAssetView.as_view(), name="epub-asset"),
    path("devices/", views.DeviceListView.as_view(), name="devices"),
    path("devices/<int:pk>/", views.DeviceDetailView.as_view(), name="device"),
    path("offline/", views.OfflineListView.as_view(), name="offline-list"),
    path("offline/<int:pk>/", views.OfflineDetailView.as_view(), name="offline-license"),
    path("<str:slug>/epub/chapters/<int:index>/", views.ChapterView.as_view(), name="epub-chapter"),
    path("<str:slug>/epub/search/", views.SearchView.as_view(), name="epub-search"),
    path("<str:slug>/bookmarks/", views.BookmarkListView.as_view(), name="bookmarks"),
    path("<str:slug>/copies/", views.CopyView.as_view(), name="copies"),
    path("<str:slug>/notes/export/", views.NotesExportView.as_view(), name="notes-export"),
    path("<str:slug>/offline/", views.OfflineView.as_view(), name="offline"),
    path("<str:slug>/bookmarks/<int:pk>/", views.BookmarkDetailView.as_view(), name="bookmark"),
    path("<str:slug>/read/", views.ReadView.as_view(), name="read"),
    path("<str:slug>/progress/", views.ProgressView.as_view(), name="progress"),
    path("<str:slug>/highlights/", views.HighlightListView.as_view(), name="highlights"),
    path(
        "<str:slug>/highlights/<int:pk>/",
        views.HighlightDetailView.as_view(),
        name="highlight",
    ),
]
