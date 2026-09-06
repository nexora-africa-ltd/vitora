# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for the facility-scoped inpatient bed-assignment request workflow.

Run with: poetry run pytest tests/inpatient/test_bed_assignment_request.py -q
Inputs: standard pytest fixtures for inpatient patients, wards, beds, and API clients.
"""

from decimal import Decimal

import pytest  # type: ignore
from rest_framework import status

from hmis.apps.core.models import Facility
from hmis.apps.inpatient.models import Admission, BedAssignmentRequest, Ward


@pytest.mark.django_db
class TestBedAssignmentRequestWorkflow:
    """Model workflow tests for dedicated pre-admission bed requests."""

    def test_assign_reserves_bed_without_creating_admission(
        self, sample_patient, sample_bed, sample_facility, test_user
    ):
        """An assignment reserves a bed while leaving admission creation separate."""
        request = BedAssignmentRequest.objects.create(
            patient=sample_patient,
            requested_ward=sample_bed.ward,
            priority="URGENT",
            reason="Requires inpatient observation",
            requested_by=test_user,
            facility=sample_facility,
        )

        request.assign(sample_bed, test_user)
        request.refresh_from_db()
        sample_bed.refresh_from_db()

        assert request.status == "ASSIGNED"
        assert request.assigned_bed == sample_bed
        assert request.assigned_by == test_user
        assert request.assigned_at is not None
        assert sample_bed.status == "RESERVED"
        assert Admission.objects.count() == 0

    def test_assign_rejects_non_pending_request(
        self, sample_patient, sample_bed, sample_facility, test_user
    ):
        """Cancelled requests cannot be assigned later."""
        request = BedAssignmentRequest.objects.create(
            patient=sample_patient,
            reason="Needs a bed",
            requested_by=test_user,
            facility=sample_facility,
        )
        request.cancel()

        with pytest.raises(ValueError, match="pending"):
            request.assign(sample_bed, test_user)

    def test_cancel_releases_reserved_bed(
        self, sample_patient, sample_bed, sample_facility, test_user
    ):
        """Cancelling an assigned request releases only its reservation."""
        request = BedAssignmentRequest.objects.create(
            patient=sample_patient,
            reason="Needs a bed",
            requested_by=test_user,
            facility=sample_facility,
        )
        request.assign(sample_bed, test_user)

        request.cancel()
        request.refresh_from_db()
        sample_bed.refresh_from_db()

        assert request.status == "CANCELLED"
        assert sample_bed.status == "AVAILABLE"


@pytest.mark.django_db
class TestBedAssignmentRequestAPI:
    """Tenant-scoped API tests for bed-assignment requests."""

    def test_create_assign_and_cancel_request(
        self, authenticated_client, sample_patient, sample_bed
    ):
        """The dedicated API creates and progresses a request without an admission."""
        create_response = authenticated_client.post(
            "/api/inpatient/bed-assignment-requests/",
            {
                "patient": sample_patient.id,
                "requested_ward": sample_bed.ward_id,
                "priority": "URGENT",
                "reason": "Requires inpatient observation",
            },
            format="json",
        )

        assert create_response.status_code == status.HTTP_201_CREATED
        assert create_response.data["status"] == "PENDING"
        request_id = create_response.data["id"]

        assign_response = authenticated_client.post(
            f"/api/inpatient/bed-assignment-requests/{request_id}/assign/",
            {"bed": sample_bed.id},
            format="json",
        )

        assert assign_response.status_code == status.HTTP_200_OK
        assert assign_response.data["status"] == "ASSIGNED"
        assert assign_response.data["assigned_bed"] == sample_bed.id
        assert Admission.objects.count() == 0

        cancel_response = authenticated_client.post(
            f"/api/inpatient/bed-assignment-requests/{request_id}/cancel/",
            {},
            format="json",
        )

        assert cancel_response.status_code == status.HTTP_200_OK
        assert cancel_response.data["status"] == "CANCELLED"
        sample_bed.refresh_from_db()
        assert sample_bed.status == "AVAILABLE"

    def test_list_is_scoped_to_current_facility(
        self,
        authenticated_client,
        sample_county,
        sample_sub_county,
        sample_organization,
        sample_patient,
        sample_facility,
        test_user,
    ):
        """Requests belonging to another facility are never returned."""
        other_facility = Facility.objects.create(
            organization=sample_organization,
            name="Other Health Centre",
            mfl_code="99998",
            level="3",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        other_ward = Ward.objects.create(
            organization=sample_organization,
            facility=other_facility,
            name="Other Medical Ward",
            code="OTHER-MED",
            ward_type="MEDICAL",
            capacity=1,
            daily_rate=Decimal("500.00"),
        )
        visible_request = BedAssignmentRequest.objects.create(
            patient=sample_patient,
            requested_ward=None,
            reason="Current facility request",
            requested_by=test_user,
            facility=sample_facility,
        )
        hidden_request = BedAssignmentRequest.objects.create(
            patient=sample_patient,
            requested_ward=other_ward,
            reason="Other facility request",
            requested_by=test_user,
            facility=other_facility,
        )

        response = authenticated_client.get("/api/inpatient/bed-assignment-requests/")

        assert response.status_code == status.HTTP_200_OK
        returned_ids = {item["id"] for item in response.data["results"]}
        assert visible_request.id in returned_ids
        assert hidden_request.id not in returned_ids
