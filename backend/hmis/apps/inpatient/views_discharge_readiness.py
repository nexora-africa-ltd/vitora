# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Facility-scoped summary of active admissions blocked from normal discharge.

Use via GET /api/inpatient/discharge-readiness-summary/.
Inputs: an authenticated request with a resolved facility context.
"""

from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.billing.models import Invoice
from hmis.apps.core.mixins import resolve_request_tenant
from hmis.apps.core.permissions import ReadRequiresModelPermission
from hmis.apps.laboratory.models import LabOrder
from hmis.apps.licensing.permissions import requires_feature
from hmis.apps.pharmacy.models import Prescription

from .clearance import calculate_patient_blocking_balance
from .models import Admission
from .services.admission_workflows import admission_order_q


class DischargeReadinessSummaryView(APIView):
    """Return clearance blocker counts for active admissions in one facility."""

    queryset = Admission.objects.all()
    permission_classes = [
        IsAuthenticated,
        requires_feature("inpatient"),
        ReadRequiresModelPermission,
    ]

    def get(self, request):
        """Count active admissions blocked by pharmacy, billing, or laboratory clearance."""
        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if facility is None:
            active_admissions = Admission.objects.none()
        else:
            active_admissions = Admission.objects.filter(
                facility=facility,
                admission_status="ACTIVE",
            ).select_related("ipd_encounter", "opd_encounter")

        pharmacy_blocked = 0
        billing_blocked = 0
        lab_blocked = 0
        total_blocked = 0

        for admission in active_admissions:
            order_q = admission_order_q(admission)
            has_pharmacy_blocker = (
                Prescription.objects.filter(order_q, dispensing_type="INTERNAL")
                .exclude(status__in=["DISPENSED", "CANCELLED"])
                .exists()
            )
            has_lab_blocker = (
                LabOrder.objects.filter(order_q, order_type="IN_HOUSE")
                .exclude(status__in=["COMPLETED", "CANCELLED"])
                .exists()
            )
            invoice_q = Q(encounter=admission.ipd_encounter)
            if admission.opd_encounter_id:
                invoice_q |= Q(encounter=admission.opd_encounter)
            unpaid_invoices = Invoice.objects.filter(invoice_q).exclude(
                status__in=[
                    Invoice.Status.DRAFT,
                    Invoice.Status.PAID,
                    Invoice.Status.CANCELLED,
                    Invoice.Status.WRITTEN_OFF,
                ]
            )
            has_billing_blocker = (
                calculate_patient_blocking_balance(unpaid_invoices)["outstanding_amount"] > 0
            )

            pharmacy_blocked += int(has_pharmacy_blocker)
            billing_blocked += int(has_billing_blocker)
            lab_blocked += int(has_lab_blocker)
            total_blocked += int(has_pharmacy_blocker or has_billing_blocker or has_lab_blocker)

        return Response(
            {
                "pharmacy_blocked": pharmacy_blocked,
                "billing_blocked": billing_blocked,
                "lab_blocked": lab_blocked,
                "total_blocked": total_blocked,
            }
        )
