# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Test the SHR consent model and DHA consent lifecycle service.

Run with: poetry run pytest tests/shr/test_consent_service.py --no-cov
Inputs: Django test fixtures plus mocked DHA ILM responses.
"""

from unittest.mock import Mock

import pytest


@pytest.mark.django_db
class TestSHRConsentVisit:
    """Persist DHA SHR consent state without exposing bearer tokens."""

    def test_emergency_approval_stores_encrypted_token(
        self, sample_patient, sample_facility, test_user
    ):
        from hmis.apps.shr.models import SHRConsentVisit

        visit = SHRConsentVisit.objects.create(
            patient=sample_patient,
            facility=sample_facility,
            request_kind=SHRConsentVisit.RequestKind.EMERGENCY,
            visit_type=SHRConsentVisit.VisitType.OP,
            status=SHRConsentVisit.Status.PENDING,
            requested_by="Registration Clerk",
            created_by=test_user,
        )

        visit.approve(
            consent_id="VCR-20260624-13698E26",
            visit_id="47f7e19f-89f8-49a2-9b05-efa749793ce7",
            consent_token="secret-bearer-token",
        )
        visit.refresh_from_db()

        assert visit.status == SHRConsentVisit.Status.APPROVED
        assert visit.consent_token == "secret-bearer-token"
        assert visit.consent_token_encrypted != "secret-bearer-token"
        assert visit.visit_id == "47f7e19f-89f8-49a2-9b05-efa749793ce7"


@pytest.mark.django_db
class TestSHRConsentService:
    """Map DHA consent responses to the local SHR visit lifecycle."""

    def test_request_standard_consent_persists_pending_otp_reference(
        self, sample_patient, sample_facility, test_user
    ):
        from hmis.apps.shr.services.consent import SHRConsentService

        sample_patient.cr_number = "CR99551207471367-7"
        sample_patient.save(update_fields=["cr_number"])
        sample_facility.dha_fr_code = "FID-47-115307-8"
        sample_facility.save(update_fields=["dha_fr_code"])
        client = Mock()
        client.get.return_value.json = {"status": "success", "visits": []}
        client.post.return_value.json = {
            "status": "success",
            "consent_id": "VCR-20260624-13698E26",
            "consent_status": "Pending",
            "otp_record": "d67p9lhxxx",
        }

        visit = SHRConsentService(client=client).request_consent(
            patient=sample_patient,
            facility=sample_facility,
            user=test_user,
            requested_by="Registration Clerk",
            visit_type="OP",
            practitioner_id="PUID-0000443-3",
        )

        assert visit.consent_id == "VCR-20260624-13698E26"
        assert visit.otp_record == "d67p9lhxxx"
        assert visit.status == "PENDING"
        client.get.assert_called_once_with(
            "/shr/open-visits",
            params={"patient_id": "CR99551207471367-7", "facility_id": "FID-47-115307-8"},
            facility=sample_facility,
            user=test_user,
        )

    def test_request_reuses_dha_open_visit_and_refreshes_token(
        self, sample_patient, sample_facility, test_user
    ):
        from hmis.apps.shr.models import SHRConsentVisit
        from hmis.apps.shr.services.consent import SHRConsentService

        sample_patient.cr_number = "CR99551207471367-7"
        sample_patient.save(update_fields=["cr_number"])
        sample_facility.dha_fr_code = "FID-47-115307-8"
        sample_facility.save(update_fields=["dha_fr_code"])
        client = Mock()
        client.get.return_value.json = {
            "status": "success",
            "visits": [{"visit_id": "open-visit-id"}],
        }
        client.post.return_value.json = {"status": "success", "consent_token": "fresh-token"}

        visit = SHRConsentService(client=client).request_consent(
            patient=sample_patient,
            facility=sample_facility,
            user=test_user,
            requested_by="Registration Clerk",
            visit_type="OP",
            practitioner_id="PUID-0000443-3",
        )

        assert visit.status == SHRConsentVisit.Status.APPROVED
        assert visit.visit_id == "open-visit-id"
        assert visit.consent_token == "fresh-token"
        client.post.assert_called_once_with(
            "/shr/visits/open-visit-id/refresh",
            json_body={},
            facility=sample_facility,
            user=test_user,
            consent_token=None,
        )
