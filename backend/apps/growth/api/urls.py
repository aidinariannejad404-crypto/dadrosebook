from django.urls import path

from . import views

urlpatterns = [
    path("torob/v3/products/", views.TorobProductsView.as_view(), name="torob-products"),
    path("feeds/emalls.json", views.emalls_json, name="emalls-json"),
    path("feeds/emalls.xml", views.emalls_xml, name="emalls-xml"),
    path("kit-shares/", views.KitShareCreateView.as_view(), name="kit-share-create"),
    path("kit-shares/resolve/", views.KitShareResolveView.as_view(), name="kit-share-resolve"),
    path("campaigns/", views.CampaignListView.as_view(), name="campaign-list"),
    path("campaigns/<str:slug>/", views.CampaignDetailView.as_view(), name="campaign-detail"),
    path("gifts/orders/<str:number>/", views.OrderGiftView.as_view(), name="order-gift"),
    path("gifts/<str:token>/", views.GiftDetailView.as_view(), name="gift-detail"),
    path("gifts/<str:token>/claim/", views.GiftClaimView.as_view(), name="gift-claim"),
]
