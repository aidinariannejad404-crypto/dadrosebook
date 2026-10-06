from django.urls import path

from . import views

app_name = "study"

urlpatterns = [
    path("heartbeat/", views.HeartbeatView.as_view(), name="heartbeat"),
    path("goal/", views.GoalView.as_view(), name="goal"),
    path("report/", views.ReportView.as_view(), name="report"),
    path("forecast/", views.ForecastView.as_view(), name="forecast"),
    path("plan/", views.PlanView.as_view(), name="plan"),
    path("plan/check/", views.PlanCheckView.as_view(), name="plan-check"),
    path("plan/compress/", views.PlanCompressView.as_view(), name="plan-compress"),
    path("owned-books/", views.OwnedBooksView.as_view(), name="owned-books"),
    path("review-prompts/", views.ReviewPromptsView.as_view(), name="review-prompts"),
    path(
        "review-prompts/<int:pk>/dismiss/",
        views.ReviewPromptDismissView.as_view(),
        name="review-prompt-dismiss",
    ),
    path("books/<str:slug>/pace/", views.PaceView.as_view(), name="pace"),
    path("books/<str:slug>/upgrade/", views.UpgradeOfferView.as_view(), name="upgrade"),
]
