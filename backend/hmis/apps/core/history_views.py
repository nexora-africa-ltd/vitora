"""
History API views for version tracking and audit trail.

Provides API endpoints for retrieving model change history
for DHA compliance requirements.

Sprint 1.D: Audit & Integrity Enhancements (DHA Compliance)
"""

from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.history import get_full_history, get_history_diff
from hmis.apps.core.models import AuditLog


class ModelHistoryMixin:
    """
    Mixin that adds history endpoints to a ViewSet.

    Usage:
        class PatientViewSet(ModelHistoryMixin, viewsets.ModelViewSet):
            queryset = Patient.objects.all()
            serializer_class = PatientSerializer
    """

    @action(detail=True, methods=["get"], url_path="history")
    def history(self, request, pk=None):
        """
        Get the version history for a specific instance.

        Returns a list of all changes made to this record, with field-level diffs.

        Query Parameters:
            limit (int): Maximum number of versions to return (default: 50)

        Response:
            [
                {
                    "version_id": 123,
                    "history_type": "updated",
                    "history_date": "2026-02-23T10:30:00Z",
                    "history_user": "admin",
                    "history_user_id": 1,
                    "changes": {
                        "first_name": {"old": "John", "new": "Johnny"},
                        "phone_number": {"old": "0700123456", "new": "0700654321"}
                    }
                },
                ...
            ]
        """
        instance = self.get_object()

        if not hasattr(instance, "history"):
            return Response(
                {"detail": f"{instance.__class__.__name__} does not have history tracking enabled"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        limit = request.query_params.get("limit", 50)
        try:
            limit = int(limit)
        except ValueError:
            limit = 50

        # Log the history access
        AuditLog.log(
            action="view_history",
            user=request.user,
            resource_type=instance.__class__.__name__,
            resource_id=instance.pk,
            ip_address=self._get_client_ip(request),
            details={"limit": limit},
        )

        history = get_full_history(instance, limit=limit)
        return Response(history)

    @action(detail=True, methods=["get"], url_path="history/(?P<version_id>[0-9]+)")
    def history_version(self, request, pk=None, version_id=None):
        """
        Get details of a specific version.

        Returns the changes made in a specific version compared to the previous version.

        Path Parameters:
            version_id (int): The history_id of the version to retrieve

        Response:
            {
                "version_id": 123,
                "history_type": "updated",
                "history_date": "2026-02-23T10:30:00Z",
                "history_user": "admin",
                "changes": {
                    "first_name": {"old": "John", "new": "Johnny"}
                }
            }
        """
        instance = self.get_object()

        if not hasattr(instance, "history"):
            return Response(
                {"detail": f"{instance.__class__.__name__} does not have history tracking enabled"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            version_id = int(version_id)
            version_diff = get_history_diff(instance, version_id=version_id)
        except ValueError:
            return Response(
                {"detail": f"Version {version_id} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(version_diff)

    @action(detail=True, methods=["get"], url_path="history-count")
    def history_count(self, request, pk=None):
        """
        Get the number of versions for a specific instance.

        Response:
            {
                "count": 15
            }
        """
        instance = self.get_object()

        if not hasattr(instance, "history"):
            return Response(
                {"detail": f"{instance.__class__.__name__} does not have history tracking enabled"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        count = instance.history.count()
        return Response({"count": count})

    def _get_client_ip(self, request):
        """Extract client IP from request."""
        x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if x_forwarded_for:
            ip = x_forwarded_for.split(",")[0]
        else:
            ip = request.META.get("REMOTE_ADDR")
        return ip


class PatientHistoryView(APIView):
    """
    Standalone API view for patient history.

    GET /api/patients/{id}/history/
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, patient_id):
        """Get history for a specific patient."""
        from hmis.apps.patients.models import Patient

        try:
            patient = Patient.objects.get(pk=patient_id)
        except Patient.DoesNotExist:
            return Response(
                {"detail": "Patient not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        limit = request.query_params.get("limit", 50)
        try:
            limit = int(limit)
        except ValueError:
            limit = 50

        # Log the history access
        AuditLog.log(
            action="view_patient_history",
            user=request.user,
            resource_type="Patient",
            resource_id=patient.pk,
            patient_id=patient.pk,
            ip_address=self._get_client_ip(request),
            details={"limit": limit},
        )

        history = get_full_history(patient, limit=limit)
        return Response(history)

    def _get_client_ip(self, request):
        """Extract client IP from request."""
        x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if x_forwarded_for:
            ip = x_forwarded_for.split(",")[0]
        else:
            ip = request.META.get("REMOTE_ADDR")
        return ip


class EncounterHistoryView(APIView):
    """
    Standalone API view for encounter history.

    GET /api/encounters/{id}/history/
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, encounter_id):
        """Get history for a specific encounter."""
        from hmis.apps.encounters.models import Encounter

        try:
            encounter = Encounter.objects.get(pk=encounter_id)
        except Encounter.DoesNotExist:
            return Response(
                {"detail": "Encounter not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        limit = request.query_params.get("limit", 50)
        try:
            limit = int(limit)
        except ValueError:
            limit = 50

        # Log the history access
        AuditLog.log(
            action="view_encounter_history",
            user=request.user,
            resource_type="Encounter",
            resource_id=encounter.pk,
            patient_id=encounter.patient_id,
            ip_address=self._get_client_ip(request),
            details={"limit": limit},
        )

        history = get_full_history(encounter, limit=limit)
        return Response(history)

    def _get_client_ip(self, request):
        """Extract client IP from request."""
        x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if x_forwarded_for:
            ip = x_forwarded_for.split(",")[0]
        else:
            ip = request.META.get("REMOTE_ADDR")
        return ip
