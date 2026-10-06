from django.urls import path

from . import views

app_name = "wishlist"

# Included at /api/v1/wishlist/.
urlpatterns = [
    path("", views.WishlistView.as_view(), name="list"),
    path("ids/", views.WishlistIdsView.as_view(), name="ids"),
    path("<int:book_id>/", views.WishlistItemView.as_view(), name="item"),
    # --- ux stream (ج۶) ---
    path("merge/", views.WishlistMergeView.as_view(), name="merge"),
    path("cards/", views.WishlistGuestCardsView.as_view(), name="guest-cards"),
]
