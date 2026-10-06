from django.urls import path

from . import views

urlpatterns = [
    path("topics/", views.TopicListView.as_view(), name="support-topics"),
    path("tickets/", views.TicketListCreateView.as_view(), name="support-tickets"),
    path("tickets/<str:code>/", views.TicketDetailView.as_view(), name="support-ticket"),
    path(
        "tickets/<str:code>/messages/",
        views.TicketReplyView.as_view(),
        name="support-ticket-reply",
    ),
    path("lookup/", views.GuestLookupView.as_view(), name="support-lookup"),
]
