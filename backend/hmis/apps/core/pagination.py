"""
Custom pagination classes for Vitora HMIS.

These classes extend DRF's pagination to:
1. Support page_size query parameter
2. Return empty results for out-of-range pages instead of 404
"""

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardPagination(PageNumberPagination):
    """
    Standard pagination with configurable page size.

    Supports:
    - page_size query parameter (default: 20, max: 100)
    - Returns empty list for out-of-range pages instead of 404

    Example: /api/patients/?page=2&page_size=10
    """

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100

    def paginate_queryset(self, queryset, request, view=None):
        """
        Override to return empty list for out-of-range pages instead of 404.
        """
        _ = view
        # Get page size from query params or default
        page_size = self.get_page_size(request)
        if not page_size:
            return None

        paginator = self.django_paginator_class(queryset, page_size)
        page_number = self.get_page_number(request, paginator)

        try:
            page_number = int(page_number)
        except (ValueError, TypeError):
            page_number = 1

        # If page is out of range, return last page or empty
        if page_number > paginator.num_pages:
            if paginator.num_pages == 0:
                # No items at all - return empty page
                self.page = None
                self.request = request
                return []
            # Return last page instead of 404
            page_number = paginator.num_pages

        try:
            self.page = paginator.page(page_number)
        except Exception:
            self.page = None
            self.request = request
            return []

        if paginator.num_pages > 1 and self.template is not None:
            self.display_page_controls = True

        self.request = request
        return list(self.page)

    def get_paginated_response(self, data):
        """
        Return paginated response with metadata.
        """
        if self.page is None:
            return Response(
                {
                    "count": 0,
                    "next": None,
                    "previous": None,
                    "results": data,
                }
            )

        return Response(
            {
                "count": self.page.paginator.count,
                "next": self.get_next_link(),
                "previous": self.get_previous_link(),
                "results": data,
            }
        )
