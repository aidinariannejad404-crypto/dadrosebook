from django.urls import path

from . import views

urlpatterns = [
    path("me/readiness/", views.ReadinessView.as_view(), name="me-readiness"),
    path("me/back-in-stock/", views.NotifyListView.as_view(), name="me-back-in-stock"),
    path(
        "me/back-in-stock/<int:pk>/",
        views.NotifyCancelView.as_view(),
        name="me-back-in-stock-cancel",
    ),
    path("me/study-reminders/", views.StudyRemindersView.as_view(), name="me-study-reminders"),
    path("me/study-plan/", views.PlanFromOrderView.as_view(), name="me-study-plan"),
    path(
        "me/orders/<str:number>/start/",
        views.StartStudyingView.as_view(),
        name="me-order-start",
    ),
]
