"""
Views for Clinical Templates.
"""

from django.db.models import Count
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import ClinicalTemplate
from .serializers import ClinicalTemplateListSerializer, ClinicalTemplateSerializer


class ClinicalTemplateViewSet(viewsets.ModelViewSet):
    """
    ViewSet for ClinicalTemplate model.

    Provides CRUD operations with:
    - Ownership-based access control
    - System template protection
    - Filtering by type, specialty, status
    - Search by name, description
    - Custom actions: clone, apply, popular, by-specialty
    """

    queryset = ClinicalTemplate.objects.all()
    serializer_class = ClinicalTemplateSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["template_type", "specialty", "is_active", "is_system"]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "usage_count", "created_at"]
    ordering = ["name"]

    def get_queryset(self):
        """Optimize queryset with prefetch."""
        return (
            ClinicalTemplate.objects.select_related("created_by").prefetch_related("sections").all()
        )

    def get_serializer_class(self):
        """Use list serializer for list action."""
        if self.action == "list":
            return ClinicalTemplateListSerializer
        return ClinicalTemplateSerializer

    def update(self, request, *args, **kwargs):
        """Override update to check ownership."""
        instance = self.get_object()

        # Check ownership (only owner can update)
        if not self._can_modify(request.user, instance):
            return Response(
                {"detail": "You do not have permission to modify this template."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        """Override partial_update to check ownership."""
        instance = self.get_object()

        if not self._can_modify(request.user, instance):
            return Response(
                {"detail": "You do not have permission to modify this template."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """Override destroy to check ownership and protect system templates."""
        instance = self.get_object()

        # System templates cannot be deleted
        if instance.is_system:
            return Response(
                {"detail": "System templates cannot be deleted."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Check ownership
        if not self._can_modify(request.user, instance):
            return Response(
                {"detail": "You do not have permission to delete this template."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return super().destroy(request, *args, **kwargs)

    def _can_modify(self, user, template) -> bool:
        """
        Check if user can modify a template.

        Args:
            user: The user attempting modification
            template: The template being modified

        Returns:
            bool: True if user can modify the template
        """
        # Superusers can modify anything
        if user.is_superuser:
            return True

        # Staff can modify system templates
        if user.is_staff and template.is_system:
            return True

        # System templates cannot be modified by regular users
        if template.is_system:
            return False

        # Owner can modify their own templates
        return template.created_by == user

    @action(detail=True, methods=["post"])
    def clone(self, request, pk=None):
        """
        Clone a template for the current user.

        Creates a copy of the template owned by the requesting user.
        """
        template = self.get_object()
        cloned = template.clone(user=request.user)

        serializer = ClinicalTemplateSerializer(cloned, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def apply(self, request, pk=None):
        """
        Apply a template to an encounter (increments usage count).

        Request body should contain 'encounter_id'.
        """
        template = self.get_object()

        # Increment usage count
        template.increment_usage()

        # Return success response
        return Response(
            {
                "detail": "Template applied successfully.",
                "template_id": template.id,
                "usage_count": template.usage_count,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"])
    def popular(self, request):
        """
        Get most popular templates by usage count.

        Query params:
            - limit: Number of templates to return (default 10)
        """
        limit = int(request.query_params.get("limit", 10))

        templates = ClinicalTemplate.objects.filter(is_active=True).order_by("-usage_count")[:limit]

        serializer = ClinicalTemplateListSerializer(templates, many=True)
        return Response({"results": serializer.data})

    @action(detail=False, methods=["get"], url_path="by-specialty")
    def by_specialty(self, request):
        """
        Get templates grouped by specialty.

        Returns dict with specialty as key and list of templates as value.
        """
        templates = ClinicalTemplate.objects.filter(is_active=True).order_by("specialty", "name")

        # Group by specialty
        grouped = {}
        for template in templates:
            specialty = template.specialty or "General"
            if specialty not in grouped:
                grouped[specialty] = []
            grouped[specialty].append(ClinicalTemplateListSerializer(template).data)

        return Response(grouped)
