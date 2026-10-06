"""Hub, guide and list endpoints (package ب). All public and read-only."""

from django.conf import settings
from django.utils.cache import patch_cache_control
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from ..services import hubs
from ..services.guides import (
    curated_list_flags,
    get_curated_list,
    get_guide,
    guide_books,
    guide_is_indexable,
    published_guides,
)
from . import serializers as s

NOT_FOUND = "صفحه پیدا نشد."


def _hub_view(builder, serializer_class):
    @method_decorator(cache_page(settings.HUB_CACHE_SECONDS), name="get")
    class HubView(APIView):
        def get(self, request, slug):
            data = builder(slug)
            if data is None:
                raise NotFound(NOT_FOUND)
            return Response(serializer_class(data, context={"request": request}).data)

    return HubView


ExamHubView = _hub_view(hubs.exam_hub, s.ExamHubSerializer)
SubjectHubView = _hub_view(hubs.subject_hub, s.SubjectHubSerializer)
AuthorHubView = _hub_view(hubs.author_hub, s.AuthorHubSerializer)
PublisherHubView = _hub_view(hubs.publisher_hub, s.PublisherHubSerializer)


@method_decorator(cache_page(settings.HUB_CACHE_SECONDS), name="get")
class GuideListView(APIView):
    """``GET /content/guides/`` — published guides, newest content first."""

    def get(self, request):
        guides = published_guides()
        return Response(s.GuideCardSerializer(guides, many=True, context={"request": request}).data)


class GuideDetailView(APIView):
    """``GET /content/guides/<slug>/[?preview=<key>]`` — a draft only with its preview key."""

    def get(self, request, slug):
        preview = request.query_params.get("preview")
        guide = get_guide(slug, preview)
        if guide is None:
            raise NotFound(NOT_FOUND)
        context = {"request": request}
        data = {
            **s.GuideDetailSerializer(guide, context=context).data,
            "indexable": guide_is_indexable(guide),
            "books": s.BookCardSerializer(guide_books(guide), many=True, context=context).data,
        }
        response = Response(data)
        if guide.is_published:
            patch_cache_control(response, public=True, max_age=settings.HUB_CACHE_SECONDS)
        else:
            patch_cache_control(response, private=True, no_store=True)
        return response


@method_decorator(cache_page(settings.HUB_CACHE_SECONDS), name="get")
class CuratedListDetailView(APIView):
    """``GET /content/lists/<slug>/`` — an active list (expired ones are flagged, not hidden)."""

    def get(self, request, slug):
        curated = get_curated_list(slug)
        if curated is None:
            raise NotFound(NOT_FOUND)
        context = {"request": request}
        entries = curated.ordered_entries
        return Response(
            {
                **s.CuratedListDetailSerializer(curated, context=context).data,
                **curated_list_flags(curated, len(entries)),
                "book_count": len(entries),
                "entries": s.ListEntrySerializer(entries, many=True, context=context).data,
            }
        )
