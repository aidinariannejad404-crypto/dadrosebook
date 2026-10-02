from django.urls import path

from . import views

app_name = "engagement"

urlpatterns = [
    path("", views.BackInStockView.as_view(), name="back-in-stock"),
]
