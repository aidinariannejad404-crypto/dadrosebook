from django.urls import path

from . import views

urlpatterns = [
    path("inbox/", views.NotificationListView.as_view(), name="inbox"),
    path("inbox/summary/", views.NavSummaryView.as_view(), name="inbox-summary"),
    path("inbox/read/", views.MarkReadView.as_view(), name="inbox-read"),
    path("inbox/codes/", views.PersonalCodesView.as_view(), name="inbox-codes"),
    path(
        "me/notification-settings/",
        views.NotificationSettingsView.as_view(),
        name="notification-settings",
    ),
    path("me/study-profile/", views.StudyProfileView.as_view(), name="study-profile"),
    path("me/study-profile/skip/", views.StudyProfileSkipView.as_view(), name="study-profile-skip"),
    path("changelog/", views.ChangelogListView.as_view(), name="changelog"),
    path("changelog/latest/", views.ChangelogLatestView.as_view(), name="changelog-latest"),
]
