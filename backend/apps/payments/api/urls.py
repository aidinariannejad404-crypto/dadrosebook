from django.urls import path

from .views import FakeGatewayPageView, ZarinpalCallbackView

urlpatterns = [
    path("zarinpal/callback/", ZarinpalCallbackView.as_view(), name="payments-callback"),
    path("fake/<str:authority>/", FakeGatewayPageView.as_view(), name="payments-fake"),
]
