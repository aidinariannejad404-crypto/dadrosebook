from django.urls import path

from . import views

urlpatterns = [
    path("auth/otp/request/", views.OtpRequestView.as_view(), name="auth-otp-request"),
    path("auth/otp/verify/", views.OtpVerifyView.as_view(), name="auth-otp-verify"),
    path("auth/refresh/", views.RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("me/", views.MeView.as_view(), name="me"),
    path("addresses/", views.AddressListCreateView.as_view(), name="address-list"),
    path("addresses/provinces/", views.ProvinceListView.as_view(), name="address-provinces"),
    path("addresses/<int:pk>/", views.AddressDetailView.as_view(), name="address-detail"),
]
