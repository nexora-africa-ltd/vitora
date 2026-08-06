"""Tests for ``IlmClaimService`` — DHA HIE Middleware claim build & dispatch.

Focuses on payload shape, consent-token resolution, and the persistence
side-effects on the SHAClaim model. The HTTP layer itself is tested in
``test_ilm_client.py``; here we mock ``IlmClient`` to keep tests fast.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from django.utils import timezone

from hmis.apps.billing.models import ConsentToken, SHAClaim, SHAClaimIntervention, SHAMember
from hmis.apps.billing.services.consent_token_resolver import (
    ConsentTokenExpiredError,
    ConsentTokenNotFoundError,
)
from hmis.apps.billing.services.ilm_claim_service import (
    ATTACHMENTS_PATH,
    CLOSE_PATH,
    DIAGNOSES_PATH,
    INTERVENTION_RESTORE_PATH,
    INTERVENTION_RETIRE_PATH,
    INTERVENTION_SWITCH_PATH,
    INTERVENTIONS_PATH,
    LINES_EDIT_PATH,
    LINES_PATH,
    PREVIEW_PATH,
    SUBMIT_PATH,
    VIRTUAL_CLAIM_LINE_PATH,
    VISIT_PATH,
    ClaimLine,
    CloseClaimParams,
    IlmClaimService,
    StartVisitParams,
    VisitAlreadyOpenedError,
)
from hmis.apps.billing.services.ilm_client import IlmResponse
from hmis.apps.billing.services.multipart_builder import MultipartFile


def _make_response(status_code=200, payload=None, headers=None):
    return IlmResponse(
        status_code=status_code,
        headers=headers or {},
        json=payload,
        text="" if payload is None else str(payload),
        elapsed_ms=12,
    )


@pytest.fixture
def mock_client():
    client = MagicMock()
    client.post.return_value = _make_response(200, {"ok": True})
    client.patch.return_value = _make_response(200, {"ok": True})
    return client


@pytest.fixture
def service(mock_client):
    return IlmClaimService(client=mock_client)


@pytest.fixture
def sha_member(db, sample_patient, test_user):
    SHAMember.objects.filter(patient=sample_patient).delete()
    return SHAMember.objects.create(
        patient=sample_patient,
        sha_number="SHA-TEST-0001",
        national_id="12345678",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        created_by=test_user,
    )


@pytest.fixture
def claim(db, sample_patient, sample_encounter, sha_member, sample_facility, test_user):
    return SHAClaim.objects.create(
        patient=sample_patient,
        sha_member=sha_member,
        encounter=sample_encounter,
        facility=sample_facility,
        claim_type=SHAClaim.ClaimType.OUTPATIENT,
        service_date=date.today(),
        primary_diagnosis_code="J06.9",
        primary_diagnosis_description="URI",
        claimed_amount=Decimal("500.00"),
        facility_code="MFL-001",
        facility_level="L4",
        created_by=test_user,
    )


@pytest.fixture
def consent(db, claim, test_user):
    return ConsentToken.objects.create(
        patient=claim.patient,
        sha_member=claim.sha_member,
        encounter=claim.encounter,
        facility=claim.facility,
        consent_method=ConsentToken.ConsentMethod.OTP,
        status=ConsentToken.ConsentStatus.VALIDATED,
        identification_number="12345678",
        consent_token="CT-TOKEN-XYZ",
        validated_at=timezone.now(),
        expires_at=timezone.now() + timedelta(hours=1),
        created_by=test_user,
    )


# ---------------------------------------------------------------------------
# start_visit
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestStartVisit:
    def test_outpatient_visit_posts_expected_payload(self, service, mock_client, claim, test_user):
        mock_client.post.return_value = _make_response(
            201,
            {"authorization_code": "AUTH-123", "claim_id": "DHA-9999"},
            headers={"X-Correlation-Id": "corr-abc"},
        )
        result = service.start_visit(
            claim,
            StartVisitParams(
                otp="123456",
                patient_id="CR-001",
                intervention_codes=["SHA-12-001"],
                service_type="OUTPATIENT",
            ),
            user=test_user,
        )
        assert result.status_code == 201
        mock_client.post.assert_called_once()
        path, kwargs = mock_client.post.call_args[0][0], mock_client.post.call_args.kwargs
        # full URL includes the legacy DHA base URL
        assert path.endswith(VISIT_PATH)
        body = kwargs["json_body"]
        # all-capitated codes are passed through with service_type CAPITATION
        assert body == {
            "otp": "123456",
            "patient_id": "CR-001",
            "intervention_codes": ["SHA-12-001"],
            "service_type": "CAPITATION",
        }
        assert kwargs["facility"] == claim.facility
        # Claim was updated
        claim.refresh_from_db()
        assert claim.dha_external_id == "DHA-9999"
        assert claim.dha_visit_started_at is not None
        assert claim.last_dha_status == "VISIT_STARTED"
        assert claim.dha_correlation_id == "corr-abc"
        # ConsentToken row was upserted
        assert ConsentToken.objects.filter(
            encounter=claim.encounter, consent_token="AUTH-123"
        ).exists()

    def test_mixed_codes_filters_capitated_only(self, service, mock_client, claim, test_user):
        mock_client.post.return_value = _make_response(
            201,
            {"authorization_code": "AUTH-123", "claim_id": "DHA-9999"},
            headers={"X-Correlation-Id": "corr-abc"},
        )
        result = service.start_visit(
            claim,
            StartVisitParams(
                otp="123456",
                patient_id="CR-001",
                intervention_codes=["SHA-06-001", "SHA-12-001", "SHA-12-002"],
                service_type="OUTPATIENT",
            ),
            user=test_user,
        )
        assert result.status_code == 201
        path, kwargs = mock_client.post.call_args[0][0], mock_client.post.call_args.kwargs
        body = kwargs["json_body"]
        # only non-capitated codes are sent
        assert body["intervention_codes"] == ["SHA-06-001"]

    def test_inpatient_visit_requires_admission_date(self, service, claim, test_user):
        with pytest.raises(ValueError, match="admission_date"):
            service.start_visit(
                claim,
                StartVisitParams(
                    otp="123",
                    patient_id="CR-001",
                    intervention_codes=["SHA-06-001"],
                    service_type="INPATIENT",
                ),
                user=test_user,
            )

    def test_inpatient_visit_includes_admission_fields(
        self, service, mock_client, claim, test_user
    ):
        mock_client.post.return_value = _make_response(201, {"authorization_code": "A"})
        service.start_visit(
            claim,
            StartVisitParams(
                otp="123",
                patient_id="CR-001",
                intervention_codes=["SHA-06-001"],
                service_type="INPATIENT",
                admission_date="2026-04-29",
                estimated_days_of_admission=3,
            ),
            user=test_user,
        )
        body = mock_client.post.call_args.kwargs["json_body"]
        assert body["admission_date"] == "2026-04-29"
        assert body["estimated_days_of_admission"] == 3

    def test_blocks_duplicate_open_visit_when_remote_session_active(
        self, service, mock_client, claim, consent, test_user
    ):
        claim.dha_visit_started_at = timezone.now()
        claim.save(update_fields=["dha_visit_started_at", "updated_at"])
        mock_client.post.return_value = _make_response(200, {"interventions": []})

        with pytest.raises(VisitAlreadyOpenedError, match="already active"):
            service.start_visit(
                claim,
                StartVisitParams(
                    otp="123456",
                    patient_id="CR-001",
                    intervention_codes=["SHA-06-001"],
                    service_type="OUTPATIENT",
                ),
                user=test_user,
            )

        assert mock_client.post.call_count == 1
        assert mock_client.post.call_args[0][0] == PREVIEW_PATH

    def test_allows_start_visit_when_local_marker_stale(
        self, service, mock_client, claim, consent, test_user
    ):
        claim.dha_visit_started_at = timezone.now()
        claim.save(update_fields=["dha_visit_started_at", "updated_at"])

        with patch.object(service, "_has_active_remote_visit", return_value=False):
            mock_client.post.return_value = _make_response(
                201,
                {"authorization_code": "AUTH-NEW", "claim_id": "DHA-1001"},
            )
            result = service.start_visit(
                claim,
                StartVisitParams(
                    otp="123456",
                    patient_id="CR-001",
                    intervention_codes=["SHA-06-001"],
                    service_type="OUTPATIENT",
                ),
                user=test_user,
            )

        assert result.status_code == 201
        assert mock_client.post.call_args[0][0] == VISIT_PATH


# ---------------------------------------------------------------------------
# Interventions
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestInterventions:
    def test_add_intervention_includes_consent_token(self, service, mock_client, claim, consent):
        # Use a non-capitated code so the call goes through the standard
        # interventions endpoint (capitated codes are redirected to the
        # virtual claim line endpoint — covered by TestVirtualClaimLine).
        service.add_intervention(claim, "SHA-06-001")
        path = mock_client.post.call_args[0][0]
        body = mock_client.post.call_args.kwargs["json_body"]
        assert path == INTERVENTIONS_PATH
        assert body == {"consent_token": "CT-TOKEN-XYZ", "intervention_code": "SHA-06-001"}
        assert mock_client.post.call_args.kwargs["consent_token"] == "CT-TOKEN-XYZ"

    def test_add_intervention_capitated_redirects_to_virtual_claim_line(
        self, service, mock_client, claim, consent
    ):
        # Capitated codes (SHA-12-* / SHA-08-001/002/003) must redirect to
        # the virtual claim line endpoint rather than /claims/interventions.
        service.add_intervention(claim, "SHA-12-001")
        path = mock_client.post.call_args[0][0]
        body = mock_client.post.call_args.kwargs["json_body"]
        assert path == VIRTUAL_CLAIM_LINE_PATH
        assert body == {
            "consent_token": "CT-TOKEN-XYZ",
            "intervention_code": "SHA-12-001",
            "unit_price": "0.01",
            "quantity": "1",
        }
        assert mock_client.post.call_args.kwargs["consent_token"] == "CT-TOKEN-XYZ"

    def test_switch_intervention_without_retain(self, service, mock_client, claim, consent):
        service.switch_intervention(
            claim,
            existing_intervention_code="A",
            new_intervention_code="B",
        )
        path = mock_client.post.call_args[0][0]
        body = mock_client.post.call_args.kwargs["json_body"]
        assert path == INTERVENTION_SWITCH_PATH
        assert body == {
            "consent_token": "CT-TOKEN-XYZ",
            "existing_intervention_code": "A",
            "new_intervention_code": "B",
            "retain_bill_items": False,
        }

    def test_switch_intervention_retain_requires_bill_range(self, service, claim, consent):
        with pytest.raises(ValueError, match="bill_from"):
            service.switch_intervention(
                claim,
                existing_intervention_code="A",
                new_intervention_code="B",
                retain_bill_items=True,
            )

    def test_switch_intervention_with_retain(self, service, mock_client, claim, consent):
        service.switch_intervention(
            claim,
            existing_intervention_code="A",
            new_intervention_code="B",
            retain_bill_items=True,
            bill_from="L-1",
            bill_to="L-9",
        )
        body = mock_client.post.call_args.kwargs["json_body"]
        assert body["bill_from"] == "L-1"
        assert body["bill_to"] == "L-9"

    def test_restore_intervention(self, service, mock_client, claim, consent):
        service.restore_intervention(claim, "SHA-12-001")
        assert mock_client.post.call_args[0][0] == INTERVENTION_RESTORE_PATH

    def test_retire_intervention(self, service, mock_client, claim, consent):
        service.retire_intervention(claim, "SHA-12-001")
        assert mock_client.post.call_args[0][0] == INTERVENTION_RETIRE_PATH

    def test_sparse_payload_does_not_erase_existing_metadata(self, service, claim):
        intervention = SHAClaimIntervention.objects.create(
            claim=claim,
            intervention_code="SHA-06-001",
            status="active",
            required_document_types=["MEDICAL_REPORT"],
            tariff_amount=Decimal("900.00"),
            intervention_name="Existing",
        )

        result = service.start_visit(
            claim,
            StartVisitParams(
                otp="123456",
                patient_id="CR-001",
                intervention_codes=["SHA-06-001"],
                service_type="OUTPATIENT",
            ),
        )
        assert result.status_code == 200

        intervention.refresh_from_db()
        assert intervention.required_document_types == ["MEDICAL_REPORT"]
        assert intervention.tariff_amount == Decimal("900.00")
        assert intervention.intervention_name == "Existing"

    def test_enriches_missing_metadata_from_registry_fail_open(self, service, claim):
        claim.patient.cr_number = "CR1234567890123-1"
        claim.patient.save(update_fields=["cr_number"])

        with patch("hmis.apps.billing.services.ilm_registries_service.IlmRegistriesService") as M:
            registry = M.return_value
            registry.fetch_sub_benefits.return_value = MagicMock(
                payload={"results": [{"sub_benefit_code": "SHA-06-SC-01"}]}
            )
            registry.fetch_benefit_interventions.return_value = MagicMock(
                payload={
                    "results": [
                        {
                            "code": "SHA-06-001",
                            "document_types": ["MEDICAL_REPORT", "LAB_REPORT"],
                            "overallTariff": "777.00",
                        }
                    ]
                }
            )

            service.start_visit(
                claim,
                StartVisitParams(
                    otp="123456",
                    patient_id="CR-001",
                    intervention_codes=["SHA-06-001"],
                    service_type="OUTPATIENT",
                ),
            )

        intervention = SHAClaimIntervention.objects.get(claim=claim, intervention_code="SHA-06-001")
        assert intervention.required_document_types == ["MEDICAL_REPORT", "LAB_REPORT"]
        assert intervention.tariff_amount == Decimal("777.00")

    def test_reconcile_from_preview_upserts_and_tracks_omission_streak(self, service, claim):
        SHAClaimIntervention.objects.create(
            claim=claim,
            intervention_code="SHA-07-001",
            intervention_name="Legacy local intervention",
            status=SHAClaimIntervention.InterventionStatus.ACTIVE,
        )
        SHAClaimIntervention.objects.create(
            claim=claim,
            intervention_code="SHA-19-197",
            intervention_name="Old name",
            status=SHAClaimIntervention.InterventionStatus.ACTIVE,
        )

        summary = service.reconcile_interventions_from_preview(
            claim,
            {
                "payload": {
                    "interventions": [
                        {
                            "id": "bf919afd-1b89-4a01-b5dc-9e821db3e525",
                            "intervention_code": "SHA-19-197",
                            "intervention_name": "Bilateral nephrostomy tube insertion",
                            "intervention_payment_mechanism": "FEE FOR SERVICE",
                            "keph_level_tarrif": "72800",
                            "needs_preauth": True,
                            "requires_surgical_preauth": False,
                            "sub_benefit_code": "SHA-19-SC-08",
                            "intervention_fund": "ALL",
                            "supported_scheme": "BOTH",
                            "applicable_document_types": ["CLAIM_FORM", "FINAL_BILL"],
                        },
                        {
                            "id": "eecfcce3-09c1-4f95-aa94-28c38e648e2e",
                            "intervention_code": "SHA-19-277",
                            "intervention_name": "Burr hole(s): subdural hematoma, brain abscess",
                            "intervention_payment_mechanism": "FEE FOR SERVICE",
                            "keph_level_tarrif": "268800",
                            "needs_preauth": True,
                            "supported_scheme": "BOTH",
                            "applicable_document_types": ["CLAIM_FORM"],
                        },
                    ]
                }
            },
        )

        assert summary["reconciled"] is True
        assert summary["created"] == 1
        assert summary["retired"] == 0

        preserved = SHAClaimIntervention.objects.get(claim=claim, intervention_code="SHA-07-001")
        assert preserved.status == SHAClaimIntervention.InterventionStatus.ACTIVE
        assert preserved.preview_missing_streak == 1
        assert preserved.auto_retired_by_omission is False

        existing = SHAClaimIntervention.objects.get(claim=claim, intervention_code="SHA-19-197")
        assert existing.status == SHAClaimIntervention.InterventionStatus.ACTIVE
        assert existing.intervention_name == "Bilateral nephrostomy tube insertion"
        assert existing.dha_intervention_id == "bf919afd-1b89-4a01-b5dc-9e821db3e525"
        assert existing.payment_mechanism == SHAClaimIntervention.PaymentMechanism.FEE_FOR_SERVICE
        assert existing.tariff_amount == Decimal("72800")
        assert existing.required_document_types == ["CLAIM_FORM", "FINAL_BILL"]

        created = SHAClaimIntervention.objects.get(claim=claim, intervention_code="SHA-19-277")
        assert created.status == SHAClaimIntervention.InterventionStatus.ACTIVE
        assert created.payment_mechanism == SHAClaimIntervention.PaymentMechanism.FEE_FOR_SERVICE
        assert created.tariff_amount == Decimal("268800")

    def test_reconcile_soft_retires_after_second_consecutive_omission(self, service, claim):
        intervention = SHAClaimIntervention.objects.create(
            claim=claim,
            intervention_code="SHA-07-001",
            intervention_name="Legacy local intervention",
            status=SHAClaimIntervention.InterventionStatus.ACTIVE,
        )

        summary_first = service.reconcile_interventions_from_preview(
            claim,
            {"payload": {"interventions": []}},
        )
        intervention.refresh_from_db()
        assert summary_first["retired"] == 0
        assert intervention.status == SHAClaimIntervention.InterventionStatus.ACTIVE
        assert intervention.preview_missing_streak == 1
        assert intervention.auto_retired_by_omission is False

        summary_second = service.reconcile_interventions_from_preview(
            claim,
            {"payload": {"interventions": []}},
        )
        intervention.refresh_from_db()
        assert summary_second["retired"] == 1
        assert summary_second["soft_retired_by_omission"] == 1
        assert "SHA-07-001" in summary_second["soft_retired_by_omission_codes"]
        assert intervention.status == SHAClaimIntervention.InterventionStatus.RETIRED
        assert intervention.preview_missing_streak == 2
        assert intervention.auto_retired_by_omission is True

    def test_reconcile_resets_omission_streak_when_code_reappears(self, service, claim):
        intervention = SHAClaimIntervention.objects.create(
            claim=claim,
            intervention_code="SHA-07-001",
            intervention_name="Legacy local intervention",
            status=SHAClaimIntervention.InterventionStatus.RETIRED,
            preview_missing_streak=3,
            auto_retired_by_omission=True,
        )

        summary = service.reconcile_interventions_from_preview(
            claim,
            {
                "payload": {
                    "interventions": [
                        {
                            "intervention_code": "SHA-07-001",
                            "intervention_name": "Returned intervention",
                            "workflow_state": "ACTIVE",
                        }
                    ]
                }
            },
        )

        intervention.refresh_from_db()
        assert summary["restored"] == 1
        assert intervention.status == SHAClaimIntervention.InterventionStatus.ACTIVE
        assert intervention.preview_missing_streak == 0
        assert intervention.auto_retired_by_omission is False
        assert intervention.last_seen_in_preview_at is not None

    def test_reconcile_from_preview_skips_when_interventions_missing(self, service, claim):
        SHAClaimIntervention.objects.create(
            claim=claim,
            intervention_code="SHA-07-001",
            status=SHAClaimIntervention.InterventionStatus.ACTIVE,
        )

        summary = service.reconcile_interventions_from_preview(claim, {"payload": {"foo": "bar"}})

        assert summary["reconciled"] is False
        assert summary["reason"] == "missing_interventions_field"
        assert (
            SHAClaimIntervention.objects.get(
                claim=claim,
                intervention_code="SHA-07-001",
            ).status
            == SHAClaimIntervention.InterventionStatus.ACTIVE
        )

    def test_reconcile_marks_remote_inactive_intervention_as_retired(self, service, claim):
        existing = SHAClaimIntervention.objects.create(
            claim=claim,
            intervention_code="SHA-19-196",
            intervention_name="Ballon Angioplasty",
            status=SHAClaimIntervention.InterventionStatus.ACTIVE,
        )

        summary = service.reconcile_interventions_from_preview(
            claim,
            {
                "payload": {
                    "interventions": [
                        {
                            "id": "df47e6d2-78a3-4895-bdf1-26ff4ba0a89d",
                            "intervention_code": "SHA-19-196",
                            "intervention_name": "Ballon Angioplasty",
                            "workflow_state": "INACTIVE",
                            "intervention_payment_mechanism": "FEE FOR SERVICE",
                        }
                    ]
                }
            },
        )

        assert summary["reconciled"] is True
        assert summary["retired"] == 1
        assert "SHA-19-196" in summary["retired_codes"]
        assert "SHA-19-196" not in summary["updated_codes"]

        existing.refresh_from_db()
        assert existing.status == SHAClaimIntervention.InterventionStatus.RETIRED


@pytest.mark.django_db
class TestVirtualClaimLine:
    """PHC virtual claim line — DHA HIE user-journey Scenario C."""

    def test_minimal_payload(self, service, mock_client, claim, consent):
        service.add_virtual_claim_line(claim, intervention_code="PHC-001")
        path = mock_client.post.call_args[0][0]
        body = mock_client.post.call_args.kwargs["json_body"]
        assert path == VIRTUAL_CLAIM_LINE_PATH
        assert body == {
            "consent_token": "CT-TOKEN-XYZ",
            "intervention_code": "PHC-001",
            "unit_price": "0.01",
            "quantity": "1",
        }
        assert mock_client.post.call_args.kwargs["consent_token"] == "CT-TOKEN-XYZ"

    def test_full_payload(self, service, mock_client, claim, consent):
        service.add_virtual_claim_line(
            claim,
            intervention_code="PHC-002",
            service_name="Consultation",
            service_identifier="SVC-1",
            unit_price="200.00",
            quantity="1",
            scheme_code="PHC",
            extra={"capitation_period": "2026-04"},
        )
        body = mock_client.post.call_args.kwargs["json_body"]
        assert body["intervention_code"] == "PHC-002"
        assert body["service_name"] == "Consultation"
        assert body["service_identifier"] == "SVC-1"
        assert body["unit_price"] == "200.00"
        assert body["quantity"] == "1"
        assert body["scheme_code"] == "PHC"
        assert body["capitation_period"] == "2026-04"
        assert body["consent_token"] == "CT-TOKEN-XYZ"


# ---------------------------------------------------------------------------
# Diagnoses
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestDiagnoses:
    def test_add_diagnosis(self, service, mock_client, claim, consent):
        service.add_diagnosis(claim, icd_code="1F44", intervention_code="SHA-12-001")
        path = mock_client.post.call_args[0][0]
        body = mock_client.post.call_args.kwargs["json_body"]
        assert path == DIAGNOSES_PATH
        assert body["icd_code"] == "1F44"
        assert body["intervention_code"] == "SHA-12-001"

    def test_remove_diagnosis_uses_patch(self, service, mock_client, claim, consent):
        service.remove_diagnosis(claim, icd_code="1F44", intervention_code="SHA-12-001")
        path = mock_client.patch.call_args[0][0]
        body = mock_client.patch.call_args.kwargs["json_body"]
        assert path == DIAGNOSES_PATH
        assert body == {
            "consent_token": "CT-TOKEN-XYZ",
            "icd_code": "1F44",
            "intervention_code": "SHA-12-001",
        }


# ---------------------------------------------------------------------------
# Lines
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestLines:
    def test_add_line(self, service, mock_client, claim, consent):
        service.add_line(
            claim,
            ClaimLine(
                intervention_code="SHA-12-001",
                service_name="Consult",
                service_identifier="C/123",
                unit_price="200",
                quantity="1",
                scheme_code="UHC",
            ),
        )
        path = mock_client.post.call_args[0][0]
        body = mock_client.post.call_args.kwargs["json_body"]
        assert path == LINES_PATH
        assert body["service_name"] == "Consult"
        assert body["consent_token"] == "CT-TOKEN-XYZ"

    def test_edit_line_only_includes_provided_fields(self, service, mock_client, claim, consent):
        service.edit_line(claim, claim_line_id="LINE-1", quantity=5)
        body = mock_client.patch.call_args.kwargs["json_body"]
        assert mock_client.patch.call_args[0][0] == LINES_EDIT_PATH
        assert body["claim_line_id"] == "LINE-1"
        assert body["quantity"] == 5
        assert "unit_price" not in body
        assert "scheme_code" not in body

    def test_remove_line(self, service, mock_client, claim, consent):
        service.remove_line(claim, claim_line_id="LINE-1")
        body = mock_client.patch.call_args.kwargs["json_body"]
        assert mock_client.patch.call_args[0][0] == LINES_PATH
        assert body == {"consent_token": "CT-TOKEN-XYZ", "claim_line_id": "LINE-1"}


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAttachments:
    def test_add_attachment_uses_multipart(self, service, mock_client, claim, consent):
        files = [MultipartFile(field_name="file", filename="x.pdf", content=b"hello")]
        service.add_attachment(claim, files, extra_fields={"category": "lab"})
        path = mock_client.post.call_args[0][0]
        kwargs = mock_client.post.call_args.kwargs
        assert path == ATTACHMENTS_PATH
        assert "files" in kwargs
        assert kwargs["data"] == {"consent_token": "CT-TOKEN-XYZ", "category": "lab"}

    def test_remove_attachment(self, service, mock_client, claim, consent):
        service.remove_attachment(claim, attachment_id="A-1", intervention_code="SHA-12-001")
        body = mock_client.patch.call_args.kwargs["json_body"]
        assert mock_client.patch.call_args[0][0] == ATTACHMENTS_PATH
        assert body == {
            "consent_token": "CT-TOKEN-XYZ",
            "attachment_id": "A-1",
            "intervention_code": "SHA-12-001",
        }


# ---------------------------------------------------------------------------
# Lifecycle: preview / submit / close
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestLifecycle:
    def test_preview(self, service, mock_client, claim, consent):
        service.preview(claim)
        assert mock_client.post.call_args[0][0] == PREVIEW_PATH
        body = mock_client.post.call_args.kwargs["json_body"]
        assert body == {"consent_token": "CT-TOKEN-XYZ"}

    def test_submit_persists_status_and_reference(
        self, service, mock_client, claim, consent, test_user
    ):
        mock_client.post.return_value = _make_response(
            200,
            {"sha_claim_reference": "SHA-REF-123"},
            headers={"X-Correlation-Id": "corr-z"},
        )
        result = service.submit(claim, invoice_number="INV/1", user=test_user)
        assert result.status_code == 200
        body = mock_client.post.call_args.kwargs["json_body"]
        assert body == {"consent_token": "CT-TOKEN-XYZ", "invoice_number": "INV/1"}
        claim.refresh_from_db()
        assert claim.status == "submitted"
        assert claim.submitted_at is not None
        assert claim.sha_claim_reference == "SHA-REF-123"
        assert claim.last_dha_status == "SUBMITTED"
        assert claim.dha_correlation_id == "corr-z"

    def test_submit_persists_status_even_when_payload_is_not_object(
        self, service, mock_client, claim, consent, test_user
    ):
        mock_client.post.return_value = _make_response(
            200,
            ["ok"],
            headers={"X-Correlation-Id": "corr-array"},
        )
        result = service.submit(claim, invoice_number="INV/2", user=test_user)
        assert result.status_code == 200
        claim.refresh_from_db()
        assert claim.status == "submitted"
        assert claim.submitted_at is not None
        assert claim.last_dha_status == "SUBMITTED"
        assert claim.dha_correlation_id == "corr-array"

    def test_close_marks_written_off(self, service, mock_client, claim, consent):
        mock_client.post.return_value = _make_response(200, {})
        service.close(
            claim,
            CloseClaimParams(cancel_reason_type="WRONG_PATIENT", cancel_reason_text="oops"),
        )
        body = mock_client.post.call_args.kwargs["json_body"]
        assert mock_client.post.call_args[0][0] == CLOSE_PATH
        assert body["cancel_reason_type"] == "WRONG_PATIENT"
        assert body["cancel_reason_text"] == "oops"
        assert body["consent_token"] == "CT-TOKEN-XYZ"
        claim.refresh_from_db()
        assert claim.status == "written_off"
        assert claim.last_dha_status == "CLOSED"


# ---------------------------------------------------------------------------
# Full lifecycle integration test
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestFullLifecycle:
    """End-to-end happy path: start_visit → add_intervention → add_line
    → preview → submit → close."""

    def test_full_lifecycle_success(self, service, mock_client, claim, test_user):
        # Each DHA call returns a progressively richer response so the
        # persistence side-effects (claim.dha_external_id, claim.status,
        # claim.sha_claim_reference, etc.) are exercised end-to-end.
        mock_client.post.side_effect = [
            # 1. start_visit
            _make_response(
                201,
                {"authorization_code": "AUTH-FLOW-1", "claim_id": "DHA-FLOW-99"},
                headers={"X-Correlation-Id": "corr-flow"},
            ),
            # 2. add_intervention (non-capitated code)
            _make_response(200, {"ok": True}),
            # 3. add_line
            _make_response(200, {"claim_line_id": "LINE-FLOW-1"}),
            # 4. preview
            _make_response(200, {"ok": True}),
            # 5. submit
            _make_response(
                200,
                {"sha_claim_reference": "SHA-REF-FLOW"},
                headers={"X-Correlation-Id": "corr-submit"},
            ),
            # 6. close
            _make_response(200, {"ok": True}),
        ]

        # --- start_visit ---
        sv_result = service.start_visit(
            claim,
            StartVisitParams(
                otp="123456",
                patient_id="CR-001",
                intervention_codes=["SHA-06-001"],
                service_type="OUTPATIENT",
            ),
            user=test_user,
        )
        assert sv_result.status_code == 201
        assert sv_result.authorization_code == "AUTH-FLOW-1"
        claim.refresh_from_db()
        assert claim.dha_external_id == "DHA-FLOW-99"
        assert claim.dha_visit_started_at is not None
        assert claim.last_dha_status == "VISIT_STARTED"
        assert claim.dha_correlation_id == "corr-flow"
        # ConsentToken was created from authorization_code
        assert ConsentToken.objects.filter(
            encounter=claim.encounter, consent_token="AUTH-FLOW-1"
        ).exists()

        # --- add_intervention ---
        ai_result = service.add_intervention(claim, "SHA-06-001")
        assert ai_result.status_code == 200

        # --- add_line ---
        al_result = service.add_line(
            claim,
            ClaimLine(
                intervention_code="SHA-06-001",
                service_name="Consultation",
                service_identifier="C/001",
                unit_price="500.00",
                quantity="1",
                scheme_code="UHC",
            ),
        )
        assert al_result.status_code == 200

        # --- preview ---
        pv_result = service.preview(claim)
        assert pv_result.status_code == 200

        # --- submit ---
        sb_result = service.submit(claim, invoice_number="INV/FLOW/1", user=test_user)
        assert sb_result.status_code == 200
        claim.refresh_from_db()
        assert claim.status == "submitted"
        assert claim.submitted_at is not None
        assert claim.sha_claim_reference == "SHA-REF-FLOW"
        assert claim.last_dha_status == "SUBMITTED"
        assert claim.dha_correlation_id == "corr-submit"

        # --- close ---
        cls_result = service.close(
            claim,
            CloseClaimParams(
                cancel_reason_type="WRONG_PATIENT", cancel_reason_text="wrong patient"
            ),
        )
        assert cls_result.status_code == 200
        claim.refresh_from_db()
        assert claim.status == "written_off"
        assert claim.last_dha_status == "CLOSED"

        # Exactly 6 POSTs were made in sequence
        assert mock_client.post.call_count == 6


# ---------------------------------------------------------------------------
# Consent-token error handling
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestConsentResolution:
    def test_missing_consent_raises(self, service, claim):
        with pytest.raises(ConsentTokenNotFoundError):
            service.add_intervention(claim, "SHA-12-001")

    def test_claim_resolution_does_not_fallback_to_patient_token(
        self,
        service,
        claim,
        test_user,
        mock_client,
    ):
        # Token exists for patient/member but not linked to claim encounter.
        ConsentToken.objects.create(
            patient=claim.patient,
            sha_member=claim.sha_member,
            encounter=None,
            facility=claim.facility,
            consent_method=ConsentToken.ConsentMethod.OTP,
            status=ConsentToken.ConsentStatus.VALIDATED,
            identification_number="12345678",
            consent_token="PATIENT-LEVEL-TOKEN",
            validated_at=timezone.now(),
            expires_at=timezone.now() + timedelta(hours=1),
            created_by=test_user,
        )

        with pytest.raises(ConsentTokenNotFoundError):
            service.add_intervention(claim, "SHA-12-001")

        mock_client.post.assert_not_called()

    def test_expired_consent_raises(self, service, claim, test_user):
        ConsentToken.objects.create(
            patient=claim.patient,
            sha_member=claim.sha_member,
            encounter=claim.encounter,
            facility=claim.facility,
            consent_method=ConsentToken.ConsentMethod.OTP,
            status=ConsentToken.ConsentStatus.VALIDATED,
            identification_number="12345678",
            consent_token="EXPIRED",
            validated_at=timezone.now() - timedelta(hours=2),
            expires_at=timezone.now() - timedelta(minutes=1),
            created_by=test_user,
        )
        with pytest.raises(ConsentTokenExpiredError):
            service.add_intervention(claim, "SHA-12-001")
