from django.urls import path

from . import views

urlpatterns = [
    path("shipping-methods/", views.ShippingMethodListView.as_view(), name="shipping-methods"),
    path("checkout/quote/", views.QuoteView.as_view(), name="checkout-quote"),
    path("checkout/", views.CheckoutView.as_view(), name="checkout"),
    path("orders/", views.OrderListView.as_view(), name="order-list"),
    path("orders/<str:number>/", views.OrderDetailView.as_view(), name="order-detail"),
    path("orders/<str:number>/pay/", views.OrderPayView.as_view(), name="order-pay"),
]
