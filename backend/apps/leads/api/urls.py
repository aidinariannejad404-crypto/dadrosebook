from django.urls import path

from . import views

app_name = "leads"

urlpatterns = [
    path("study-plan/", views.StudyPlanCreateView.as_view(), name="study-plan-create"),
    path("study-plan/<uuid:token>/", views.StudyPlanDetailView.as_view(), name="study-plan"),
]
