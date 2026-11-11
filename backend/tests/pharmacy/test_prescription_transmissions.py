# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests real in-network electronic prescription transmission.

Run with: ``poetry run pytest tests/pharmacy/test_prescription_transmissions.py``.
Inputs: pharmacy-enabled facilities, a patient-linked prescription, and a user.
"""

from datetime import date, timedelta

import pytest
from django.core.exceptions import ValidationError


@pytest.fixture
def recipient_pharmacy(sample_organization, sample_county, sample_sub_county):
    """Provide a second pharmacy-enabled facility in the same organization."""
    from hmis.apps.core.models import Facility

    return Facility.objects.create(
        organization=sample_organization,
        name="Receiving Test Pharmacy",
        mfl_code="99998",
        level="3",
        county=sample_county,
        sub_county=sample_sub_county,
        has_pharmacy=True,
        is_active=True,
    )


@pytest.fixture
def electronic_prescription(
    sample_patient, sample_encounter, sample_facility, sample_organization, test_user
):
    """Provide a prescription with the required electronic prescribing details."""
    from hmis.apps.pharmacy.models import Drug, Prescription, PrescriptionItem

    drug = Drug.objects.create(
        code="AMOX-500-TRANSMISSION",
        generic_name="Amoxicillin",
        form="CAPSULE",
        strength="500 mg",
        unit="capsule",
        schedule="POM",
    )
    prescription = Prescription.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        prescribed_by=test_user,
        valid_until=date.today() + timedelta(days=7),
        facility=sample_facility,
        organization=sample_organization,
    )
    PrescriptionItem.objects.create(
        prescription=prescription,
        drug=drug,
        quantity=21,
        dosage="500 mg",
        frequency="Three times daily",
        duration="7 days",
        route="Oral",
    )
    return prescription


class TestPrescriptionTransmission:
    """Electronic handoff persists a receiving pharmacy request and lifecycle."""

    def test_transmit_creates_real_recipient_queue_request(
        self, electronic_prescription, recipient_pharmacy, test_user
    ):
        """A recipient pharmacy receives a persisted, actionable request."""
        from hmis.apps.pharmacy.transmissions import transmit_prescription

        transmission = transmit_prescription(
            prescription=electronic_prescription,
            recipient_facility=recipient_pharmacy,
            user=test_user,
        )

        assert transmission.status == "RECEIVED"
        assert transmission.recipient_request.facility == recipient_pharmacy
        assert transmission.recipient_request.requested_items == [
            {
                "drug_code": "AMOX-500-TRANSMISSION",
                "drug_name": "Amoxicillin",
                "dose": "500 mg",
                "frequency": "Three times daily",
                "duration": "7 days",
                "quantity": 21,
                "route": "Oral",
                "instructions": "",
            }
        ]

    def test_rejects_cross_organization_recipient(self, electronic_prescription, test_user):
        """Tenant boundaries prevent cross-organization prescription disclosure."""
        from hmis.apps.core.models import Facility, Organization
        from hmis.apps.pharmacy.transmissions import transmit_prescription

        organization = Organization.objects.create(name="Other Organization", slug="other-org")
        recipient = Facility.objects.create(
            organization=organization, name="Other Pharmacy", mfl_code="99997", level="3"
        )

        with pytest.raises(ValidationError):
            transmit_prescription(
                prescription=electronic_prescription, recipient_facility=recipient, user=test_user
            )
