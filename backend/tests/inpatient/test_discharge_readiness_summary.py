# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Tests for the facility-scoped inpatient discharge-readiness summary endpoint.

Run with: poetry run pytest tests/inpatient/test_discharge_readiness_summary.py -q
Inputs: authenticated facility-scoped API requests and inpatient clearance records.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.billing.models import Invoice
from hmis.apps.laboratory.models import LabOrder
from hmis.apps.pharmacy.models import Prescription


@pytest.mark.django_db
class TestDischargeReadinessSummary:
    """Tests for GET /api/inpatient/discharge-readiness-summary/."""

    def test_requires_authentication(self, api_client):
        response = api_client.get("/api/inpatient/discharge-readiness-summary/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_counts_active_admissions_by_required_clearance(
        self,
        authenticated_client,
        sample_admission,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """Counts each blocked active admission once per failed clearance type."""
        Invoice.objects.create(
            patient=sample_admission.patient,
            encounter=sample_admission.ipd_encounter,
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timedelta(days=30),
            subtotal=Decimal("500.00"),
            total_amount=Decimal("500.00"),
            balance_due=Decimal("500.00"),
            status=Invoice.Status.PENDING,
            created_by=test_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        Prescription.objects.create(
            patient=sample_admission.patient,
            admission=sample_admission,
            encounter=sample_admission.ipd_encounter,
            prescribed_by=test_user,
            valid_until=date.today() + timedelta(days=30),
            status="PENDING",
            facility=sample_facility,
            organization=sample_organization,
        )
        LabOrder.objects.create(
            patient=sample_admission.patient,
            admission=sample_admission,
            encounter=sample_admission.ipd_encounter,
            ordered_by=test_user,
            status="ORDERED",
            facility=sample_facility,
            organization=sample_organization,
        )

        response = authenticated_client.get("/api/inpatient/discharge-readiness-summary/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {
            "pharmacy_blocked": 1,
            "billing_blocked": 1,
            "lab_blocked": 1,
            "total_blocked": 1,
        }

    def test_excludes_discharged_admissions(
        self,
        authenticated_client,
        sample_admission,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """Discharged admissions do not contribute to blocker counts."""
        sample_admission.admission_status = "DISCHARGED"
        sample_admission.save(update_fields=["admission_status"])
        Prescription.objects.create(
            patient=sample_admission.patient,
            admission=sample_admission,
            prescribed_by=test_user,
            valid_until=date.today() + timedelta(days=30),
            status="PENDING",
            facility=sample_facility,
            organization=sample_organization,
        )

        response = authenticated_client.get("/api/inpatient/discharge-readiness-summary/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {
            "pharmacy_blocked": 0,
            "billing_blocked": 0,
            "lab_blocked": 0,
            "total_blocked": 0,
        }

    def test_excludes_active_admissions_from_another_facility(
        self,
        authenticated_client,
        sample_admission,
        test_user,
        sample_organization,
        sample_county,
        sample_sub_county,
    ):
        """The request facility does not receive another facility's blocked admission."""
        from hmis.apps.core.models import Facility

        other_facility = Facility.objects.create(
            organization=sample_organization,
            name="Other Test Health Centre",
            mfl_code="99998",
            level="3",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        sample_admission.facility = other_facility
        sample_admission.save(update_fields=["facility"])
        Prescription.objects.create(
            patient=sample_admission.patient,
            admission=sample_admission,
            prescribed_by=test_user,
            valid_until=date.today() + timedelta(days=30),
            status="PENDING",
            facility=other_facility,
            organization=sample_organization,
        )

        response = authenticated_client.get("/api/inpatient/discharge-readiness-summary/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {
            "pharmacy_blocked": 0,
            "billing_blocked": 0,
            "lab_blocked": 0,
            "total_blocked": 0,
        }
