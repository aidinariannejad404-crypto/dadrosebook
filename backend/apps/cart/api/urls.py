from django.urls import path

from . import views

app_name = "cart"

urlpatterns = [
    path("", views.CartView.as_view(), name="cart"),
    path("items/", views.CartItemsView.as_view(), name="items"),
    path("items/bulk/", views.CartBulkView.as_view(), name="items-bulk"),
    path("items/<int:item_id>/", views.CartItemDetailView.as_view(), name="item"),
]
