"""
What this file is for: inpatient discharge viewset and discharge medication-to-prescription conversion helper.
How to use: imported by ``inpatient.views`` so existing router imports remain stable.
Supported inputs/args: DRF request payloads/query params handled by DischargeViewSet actions.
"""

# ruff: noqa: ARG002

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import NestedTenantScopeMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import (
    ReadRequiresModelPermission,
    WriteRequiresRolePermission,
    get_client_ip,
)

from ..models import Discharge
from ..serializers import DischargeSerializer


class DischargeViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for Discharge model.

    Provides CRUD operations for discharges with:
    - Automatic admission/bed status updates
    - Clearance tracking
    - Filtering by discharge type

    Endpoints:
    - GET /api/inpatient/discharges/ - List all discharges
    - GET /api/inpatient/discharges/{id}/ - Discharge detail
    - POST /api/inpatient/discharges/ - Create discharge
    - PATCH /api/inpatient/discharges/{id}/ - Update discharge
    """

    queryset = Discharge.objects.select_related(
        "admission",
        "admission__mch_registration",
        "pnc_clinic_visit",
        "pnc_appointment",
    ).prefetch_related("diagnoses")
    serializer_class = DischargeSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    tenant_facility_chain = "admission__ward__facility"
    tenant_org_chain = "admission__organization"
    filterset_fields = [
        "admission",
        "discharge_type",
        "pharmacy_cleared",
        "billing_cleared",
        "discharged_by",
    ]
    search_fields = [
        "admission__admission_number",
        "admission__patient__first_name",
        "admission__patient__last_name",
    ]
    ordering_fields = ["discharge_date", "created_at"]
    ordering = ["-discharge_date"]

    def perform_create(self, serializer):
        """Create discharge and log action."""
        instance = serializer.save()

        # Log discharge creation
        AuditLog.log(
            action="discharge_create",
            user=self.request.user,
            resource_type="Discharge",
            resource_id=instance.id,
            details={
                "admission_number": instance.admission.admission_number,
                "patient": instance.admission.patient.id,
                "discharge_type": instance.discharge_type,
                "length_of_stay": instance.length_of_stay,
            },
            ip_address=get_client_ip(self.request),
        )

    @action(detail=True, methods=["post"], url_path="create-prescriptions")
    def create_prescriptions(self, request, pk=None):
        """Create pharmacy prescriptions from manual discharge medications.

        For each INTERNAL manual medication (no prescription_id), attempts to
        match the drug_name against the Drug catalog and creates a Prescription
        + PrescriptionItem. Returns results indicating which meds were matched.
        """
        from datetime import timedelta

        from django.utils import timezone

        from hmis.apps.pharmacy.models import Drug, Prescription, PrescriptionItem

        discharge = self.get_object()
        meds = discharge.discharge_medications or []

        # Filter to only manual INTERNAL meds (no existing prescription_id)
        manual_internal = [
            m
            for m in meds
            if not m.get("prescription_id")
            and m.get("dispensing_type", "EXTERNAL") == "INTERNAL"
            and m.get("drug_name")
        ]

        if not manual_internal:
            return Response(
                {
                    "detail": "No manual INTERNAL medications to convert.",
                    "created": [],
                    "failed": [],
                },
                status=status.HTTP_200_OK,
            )

        admission = discharge.admission
        patient = admission.patient
        facility = admission.ward.facility if admission.ward else None
        organization = admission.organization

        created = []
        failed = []

        for med in manual_internal:
            drug_name = med["drug_name"].strip()
            # Case-insensitive lookup — try exact first, then icontains
            drug = Drug.objects.filter(generic_name__iexact=drug_name).first()
            if not drug:
                drug = Drug.objects.filter(generic_name__icontains=drug_name).first()
            if not drug:
                # Try brand names (JSONField array)
                drug = Drug.objects.filter(brand_names__icontains=drug_name).first()

            if not drug:
                failed.append({"drug_name": drug_name, "reason": "Drug not found in catalog"})
                continue

            # Create prescription
            prescription = Prescription(
                patient=patient,
                admission=admission,
                prescribed_by=request.user,
                valid_until=timezone.now().date() + timedelta(days=30),
                dispensing_type="INTERNAL",
                is_discharge_medication=True,
                clinical_notes=f"Auto-created from discharge medications. {med.get('instructions', '')}".strip(),
            )
            if facility:
                prescription.facility = facility
            if organization:
                prescription.organization = organization
            prescription.save()

            # Parse quantity from duration (e.g., "7 days" + "TDS" → 21)
            quantity = _estimate_quantity(med.get("duration", ""), med.get("frequency", ""))

            PrescriptionItem.objects.create(
                prescription=prescription,
                drug=drug,
                quantity=quantity,
                dosage=med.get("dosage", ""),
                frequency=med.get("frequency", ""),
                duration=med.get("duration", ""),
                instructions=med.get("instructions", ""),
            )

            created.append(
                {
                    "drug_name": drug_name,
                    "prescription_id": prescription.id,
                    "prescription_number": prescription.prescription_number,
                }
            )

        # Update discharge_medications JSON with prescription_ids for matched meds
        if created:
            created_map = {c["drug_name"].lower(): c["prescription_id"] for c in created}
            updated_meds = []
            for m in meds:
                if m.get("drug_name", "").strip().lower() in created_map and not m.get(
                    "prescription_id"
                ):
                    m["prescription_id"] = created_map[m["drug_name"].strip().lower()]
                updated_meds.append(m)
            discharge.discharge_medications = updated_meds
            discharge.save(update_fields=["discharge_medications"])

        return Response(
            {
                "created": created,
                "failed": failed,
                "detail": f"Created {len(created)} prescription(s). {len(failed)} failed.",
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


def _estimate_quantity(duration: str, frequency: str) -> int:
    """Estimate total quantity from duration and frequency strings.

    Examples:
        _estimate_quantity("7 days", "TDS") → 21
        _estimate_quantity("5 days", "BD") → 10
        _estimate_quantity("", "OD") → 7 (default 7 days)
    """
    import re

    # Parse days from duration
    days_match = re.search(r"(\d+)\s*(?:day|d)", duration, re.IGNORECASE)
    days = int(days_match.group(1)) if days_match else 7

    # Parse frequency
    freq_lower = frequency.lower().strip()
    freq_map = {
        "od": 1,
        "once daily": 1,
        "once a day": 1,
        "daily": 1,
        "qd": 1,
        "bd": 2,
        "bid": 2,
        "twice daily": 2,
        "twice a day": 2,
        "b.d.": 2,
        "tds": 3,
        "tid": 3,
        "three times daily": 3,
        "t.d.s.": 3,
        "8 hourly": 3,
        "qid": 4,
        "qds": 4,
        "four times daily": 4,
        "6 hourly": 4,
        "stat": 1,
        "prn": 1,  # As needed — estimate 1/day
        "nocte": 1,
        "at night": 1,
    }
    times_per_day = freq_map.get(freq_lower, 1)

    # Check for numeric frequency like "3 times daily"
    if times_per_day == 1:
        num_match = re.search(r"(\d+)\s*(?:times|x)", frequency, re.IGNORECASE)
        if num_match:
            times_per_day = int(num_match.group(1))

    return max(1, days * times_per_day)
