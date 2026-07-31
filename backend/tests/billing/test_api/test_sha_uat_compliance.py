# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for DHA HIE UAT compliance gap closures.

Tests the local pre-flight validations added to close PARTIAL gaps in the
PHC/SHIF/ECCIF UAT checklists:
- P1: Preview-before-submit enforcement
- P1: All preauths approved before submit
- P2: Attachment size/type local validation
- P2: Discharge date cannot be future
- P3: ECCIF 24h billing window guard
- P3: Active visit same access point (consent dedup)
- P3: Deceased death notification attachment
"""

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import ANY, MagicMock, patch

import pytest  # type: ignore
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework import status

# Reuse the rich fixtures from test_sha_api.py
from tests.billing.test_api.test_sha_api import (  # noqa: F401
    api_client,
    sample_sha_claim,
    sample_sha_member,
    sha_client,
    test_user,
    user_with_sha_permissions,
)


@pytest.fixture
def sample_sha_claim_for_uat(db, sample_sha_claim):  # noqa: F811
    """SHA claim for UAT tests (uses pre-existing sample_sha_claim from test_sha_api)."""
    return sample_sha_claim


# =============================================================================
# P2: Preview-Before-Submit Enforcement
# =============================================================================


@pytest.mark.django_db
class TestPreviewBeforeSubmit:
    """DHA UAT: Claims must be previewed before submission."""

    def test_validate_fails_without_preview(self, sample_sha_claim_for_uat):
        """Should fail validation if previewed_at is None."""
        claim = sample_sha_claim_for_uat
        assert claim.previewed_at is None
        is_valid, errors = claim.validate_for_submission()
        assert is_valid is False
        assert any("previewed" in e.lower() for e in errors)

    def test_validate_passes_with_preview(self, sample_sha_claim_for_uat, test_user):  # noqa: F811
        """Should not raise preview error when previewed_at is set."""
        from hmis.apps.billing.models import SHAClaimAttachment, SHAClaimItem, SHATariff

        claim = sample_sha_claim_for_uat
        claim.previewed_at = timezone.now()
        claim.save(update_fields=["previewed_at"])

        # Set up claim items, attachments, amount so other checks pass
        tariff = SHATariff.objects.first()
        if not tariff:
            tariff = SHATariff(
                code="SHA-01-001",
                description="General Consultation",
                sha_amount=Decimal("500.00"),
                name="General Consultation",
                category="consultation",
                facility_level="L3",
                effective_date=date.today(),
            )
            tariff.save()
        SHAClaimItem.objects.create(
            claim=claim,
            tariff=tariff,
            description="Test",
            quantity=1,
            unit_price=Decimal("500.00"),
            claimed_amount=Decimal("500.00"),
        )
        for att_type in ["clinical_notes", "invoice"]:
            SHAClaimAttachment.objects.create(
                claim=claim,
                attachment_type=att_type,
                name=att_type,
                file=SimpleUploadedFile(f"{att_type}.pdf", b"%PDF-1.4", "application/pdf"),
                file_size=7,
                mime_type="application/pdf",
                checksum="a" * 32,
                original_filename=f"{att_type}.pdf",
                uploaded_by=test_user,
            )
        claim.calculate_claimed_amount()

        is_valid, errors = claim.validate_for_submission()
        assert "previewed" not in " ".join(errors).lower()

    def test_ilm_preview_stamps_previewed_at(self, sha_client, sample_sha_claim_for_uat):  # noqa: F811
        """ilm_preview action should stamp previewed_at on success."""
        claim = sample_sha_claim_for_uat
        assert claim.previewed_at is None

        with patch("hmis.apps.billing.services.ilm_claim_service.IlmClaimService") as svc:
            mock_result = MagicMock()
            mock_result.response.ok = True
            mock_result.status_code = 200
            mock_result.payload = {"claim_diagnoses": [{"icd_code": "J06.9"}]}
            svc.return_value.reconcile_interventions_from_preview.return_value = {
                "reconciled": True,
                "created": 0,
                "updated": 0,
                "restored": 0,
                "retired": 0,
            }
            svc.return_value.preview.return_value = mock_result
            response = sha_client.post(f"/api/sha/claims/{claim.id}/ilm/preview/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["reconciliation_summary"]["reconciled"] is True
        claim.refresh_from_db()
        assert claim.previewed_at is not None
        svc.return_value.reconcile_interventions_from_preview.assert_called_once_with(
            claim,
            mock_result.payload,
            user=ANY,
        )

    def test_ilm_preview_syncs_local_diagnosis_when_preview_has_none(
        self, sha_client, sample_sha_claim_for_uat
    ):  # noqa: F811
        """ilm_preview should backfill DHA diagnoses from local claim diagnosis codes."""
        claim = sample_sha_claim_for_uat

        with patch("hmis.apps.billing.services.ilm_claim_service.IlmClaimService") as svc:
            first_preview = MagicMock()
            first_preview.response.ok = True
            first_preview.status_code = 200
            first_preview.payload = {"claim_diagnoses": []}

            second_preview = MagicMock()
            second_preview.response.ok = True
            second_preview.status_code = 200
            second_preview.payload = {
                "claim_diagnoses": [{"icd_code": claim.primary_diagnosis_code}]
            }

            add_diag_result = MagicMock()
            add_diag_result.status_code = 200
            add_diag_result.payload = {}

            svc.return_value.preview.side_effect = [first_preview, second_preview]
            svc.return_value.add_diagnosis.return_value = add_diag_result

            response = sha_client.post(f"/api/sha/claims/{claim.id}/ilm/preview/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["payload"]["claim_diagnoses"]
        svc.return_value.add_diagnosis.assert_called_once_with(
            claim,
            icd_code=claim.primary_diagnosis_code,
            intervention_code="SHA-01-001",
            user=ANY,
        )

    def test_apply_preview_lines_resolves_tariff_by_description_when_code_missing(
        self, sha_client, sample_sha_claim_for_uat
    ):
        """apply-preview-lines should map unresolved codes by description as fallback."""
        from hmis.apps.billing.models import SHATariff

        claim = sample_sha_claim_for_uat
        tariff = SHATariff.objects.create(
            code="SHA-LAB-991",
            name="Complete blood count",
            description="Complete blood count",
            category=SHATariff.TariffCategory.LABORATORY,
            facility_level=claim.facility_level,
            sha_amount=Decimal("850.00"),
            effective_date=date.today(),
            is_active=True,
        )

        payload = {
            "invoices": [
                {
                    "invoice_number": "INV/DHA/RESOLVE-001",
                    "lines": [
                        {
                            "item_code": "sha-missing-001",
                            "item_name": "Complete blood count",
                            "quantity": 1,
                            "unit_price": "850.00",
                        }
                    ],
                }
            ]
        }

        response = sha_client.post(
            f"/api/sha/claims/{claim.id}/ilm/apply-preview-lines/",
            {"payload": payload, "replace_existing": True},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["description_resolved_count"] == 1
        assert response.data["unresolved_lines"] == []

        claim.refresh_from_db()
        item = claim.items.first()
        assert item is not None
        assert item.tariff_id == tariff.id

    def test_apply_preview_lines_auto_upserts_missing_tariff_from_preview_code(
        self, sha_client, sample_sha_claim_for_uat
    ):
        """apply-preview-lines should auto-create a local SHATariff when preview code is unknown."""
        from hmis.apps.billing.models import SHATariff

        claim = sample_sha_claim_for_uat
        payload = {
            "invoices": [
                {
                    "invoice_number": "INV/DHA/UPSERT-001",
                    "lines": [
                        {
                            "item_code": "SHA-03-001",
                            "item_name": "ICU CARE",
                            "quantity": 1,
                            "unit_price": "28000.00",
                        }
                    ],
                }
            ]
        }

        # Ensure this tariff does not already exist for a deterministic assertion.
        SHATariff.objects.filter(code="SHA-03-001").delete()

        response = sha_client.post(
            f"/api/sha/claims/{claim.id}/ilm/apply-preview-lines/",
            {"payload": payload, "replace_existing": True},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert "SHA-03-001" in response.data["auto_upserted_tariff_codes"]

        upserted = SHATariff.objects.get(code="SHA-03-001")
        assert upserted.name == "ICU CARE"
        assert str(upserted.sha_amount) == "28000.00"
        expected_level = (
            f"L{claim.facility.level}"
            if claim.facility and claim.facility.level
            else claim.facility_level
        )
        assert upserted.facility_level == expected_level

        claim.refresh_from_db()
        item = claim.items.first()
        assert item is not None
        assert item.tariff_id == upserted.id

    def test_apply_preview_lines_auto_materializes_local_invoice(
        self, sha_client, sample_sha_claim_for_uat
    ):
        """apply-preview-lines should create/link a local invoice and materialize invoice items."""
        from hmis.apps.billing.models import Invoice

        claim = sample_sha_claim_for_uat
        payload = {
            "invoices": [
                {
                    "invoice_number": "INV/DHA/MAT-001",
                    "lines": [
                        {
                            "item_code": "SHA-03-101",
                            "item_name": "Ward round",
                            "quantity": 2,
                            "unit_price": "1500.00",
                        }
                    ],
                }
            ]
        }

        response = sha_client.post(
            f"/api/sha/claims/{claim.id}/ilm/apply-preview-lines/",
            {"payload": payload, "replace_existing": True},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["invoice_linked"] is True
        assert response.data["materialized_invoice_id"]
        assert response.data["materialized_invoice_items_created"] == 1
        assert response.data["materialized_invoice_items_replaced"] == 0
        assert response.data["materialized_invoice_skipped_reason"] == ""
        assert response.data["final_bill_attachment_id"]
        assert response.data["final_bill_created"] is True
        assert response.data["final_bill_skipped_reason"] == ""
        assert response.data["claim_form_attachment_id"]
        assert response.data["claim_form_created"] is True
        assert response.data["claim_form_skipped_reason"] == ""
        assert response.data["critical_care_skipped_reason"] == "missing_admission_context"
        assert response.data["discharge_summary_skipped_reason"] == "missing_admission_context"
        assert response.data["allocation_pending_count"] == 0

        claim.refresh_from_db()
        assert claim.invoice_id == response.data["materialized_invoice_id"]
        assert claim.invoice is not None
        assert claim.invoice.items.count() == 1
        assert (
            claim.invoice.internal_notes
            and "DHA_PREVIEW_MATERIALIZED" in claim.invoice.internal_notes
        )
        final_bill = claim.attachments.get(id=response.data["final_bill_attachment_id"])
        assert final_bill.attachment_type == "invoice"
        assert "Final Bill" in final_bill.name
        assert "final_bill" in final_bill.original_filename
        assert claim.items.first() is not None
        assert claim.items.first().allocation_status == "resolved"

    def test_item_allocation_endpoint_requires_discount_reason(
        self, sha_client, sample_sha_claim_for_uat
    ):
        """Discounts/waivers require a reason for audit compliance."""
        from hmis.apps.billing.models import SHATariff

        claim = sample_sha_claim_for_uat
        tariff = SHATariff.objects.create(
            code="SHA-08-777",
            name="Allocation Test",
            description="Allocation Test",
            category=SHATariff.TariffCategory.LABORATORY,
            facility_level=claim.facility_level,
            sha_amount=Decimal("1000.00"),
            effective_date=date.today(),
            is_active=True,
        )
        item = claim.items.create(
            tariff=tariff,
            description="Allocation Test",
            service_date=claim.service_date,
            quantity=Decimal("1.00"),
            unit_price=Decimal("1000.00"),
            sha_covered_amount=Decimal("1000.00"),
            patient_payable_amount=Decimal("0.00"),
            discount_amount=Decimal("0.00"),
            allocation_status="pending",
        )

        response = sha_client.post(
            f"/api/sha/claims/{claim.id}/items/{item.id}/allocation/",
            {
                "sha_covered_amount": "700.00",
                "patient_payable_amount": "200.00",
                "discount_amount": "100.00",
                "discount_reason": "",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "reason" in str(response.data.get("error", "")).lower()

    def test_item_allocation_endpoint_resolves_split(self, sha_client, sample_sha_claim_for_uat):
        """Allocation endpoint should support partial split across SHA/patient/discount."""
        from hmis.apps.billing.models import SHATariff

        claim = sample_sha_claim_for_uat
        tariff = SHATariff.objects.create(
            code="SHA-08-778",
            name="Allocation Split",
            description="Allocation Split",
            category=SHATariff.TariffCategory.LABORATORY,
            facility_level=claim.facility_level,
            sha_amount=Decimal("1200.00"),
            effective_date=date.today(),
            is_active=True,
        )
        item = claim.items.create(
            tariff=tariff,
            description="Allocation Split",
            service_date=claim.service_date,
            quantity=Decimal("1.00"),
            unit_price=Decimal("1200.00"),
            sha_covered_amount=Decimal("1200.00"),
            patient_payable_amount=Decimal("0.00"),
            discount_amount=Decimal("0.00"),
            allocation_status="pending",
        )

        response = sha_client.post(
            f"/api/sha/claims/{claim.id}/items/{item.id}/allocation/",
            {
                "sha_covered_amount": "700.00",
                "patient_payable_amount": "300.00",
                "discount_amount": "200.00",
                "discount_reason": "Social support waiver",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["success"] is True

        item.refresh_from_db()
        assert str(item.sha_covered_amount) == "700.00"
        assert str(item.patient_payable_amount) == "300.00"
        assert str(item.discount_amount) == "200.00"
        assert item.discount_reason == "Social support waiver"
        assert item.allocation_status == "resolved"

    def test_materialize_preview_invoice_endpoint_creates_invoice_from_claim_items(
        self, sha_client, sample_sha_claim_for_uat
    ):
        """Explicit materialize endpoint should create invoice records from existing claim items."""
        from hmis.apps.billing.models import SHATariff

        claim = sample_sha_claim_for_uat
        tariff = SHATariff.objects.create(
            code="SHA-02-222",
            name="Xray Chest",
            description="Xray Chest",
            category=SHATariff.TariffCategory.LABORATORY,
            facility_level=claim.facility_level,
            sha_amount=Decimal("1800.00"),
            effective_date=date.today(),
            is_active=True,
        )
        claim.items.create(
            tariff=tariff,
            description="Xray Chest",
            service_date=claim.service_date,
            quantity=Decimal("1.00"),
            unit_price=Decimal("1800.00"),
            claimed_amount=Decimal("1800.00"),
        )

        response = sha_client.post(
            f"/api/sha/claims/{claim.id}/ilm/materialize-preview-invoice/",
            {"invoice_number": "INV/DHA/MAT-EXPLICIT-001", "replace_existing": True},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["success"] is True
        assert response.data["invoice_id"]
        assert response.data["materialized"] is True
        assert response.data["items_created"] == 1
        assert response.data["items_replaced"] == 0
        assert response.data["skipped_reason"] == ""
        assert response.data["final_bill_attachment_id"]
        assert response.data["final_bill_created"] is True
        assert response.data["final_bill_skipped_reason"] == ""
        assert response.data["claim_form_attachment_id"]
        assert response.data["claim_form_created"] is True
        assert response.data["claim_form_skipped_reason"] == ""
        assert response.data["critical_care_skipped_reason"] == "missing_admission_context"
        assert response.data["discharge_summary_skipped_reason"] == "missing_admission_context"

        claim.refresh_from_db()
        assert claim.invoice_id == response.data["invoice_id"]
        assert claim.invoice is not None
        assert claim.invoice.items.count() == 1
        final_bill = claim.attachments.get(id=response.data["final_bill_attachment_id"])
        assert final_bill.attachment_type == "invoice"
        assert "Final Bill" in final_bill.name

    def test_materialize_preview_invoice_generates_critical_care_and_discharge_summary_for_icu_admission(
        self,
        sha_client,
        sample_sha_claim_for_uat,
        sample_admission,
        sample_inpatient_ward,
        sample_bed,
        sample_facility,
        sample_organization,
        test_user,
    ):
        """Materialization should auto-generate CCU and discharge summary from the linked admission."""
        from django.utils import timezone

        from hmis.apps.billing.models import SHAClaimAttachment, SHATariff
        from hmis.apps.inpatient.models import Discharge, Ward

        icu_ward = Ward.objects.create(
            name="ICU Ward",
            code="ICU-01",
            ward_type="ICU",
            capacity=10,
            daily_rate=Decimal("5000.00"),
            organization=sample_organization,
            facility=sample_facility,
        )

        sample_admission.ward = icu_ward
        sample_admission.bed = sample_bed
        sample_admission.save(update_fields=["ward", "bed", "updated_at"])

        claim = sample_sha_claim_for_uat
        claim.encounter = sample_admission.ipd_encounter
        claim.claim_type = claim.ClaimType.INPATIENT
        claim.admission_date = sample_admission.admission_date
        claim.save(update_fields=["encounter", "claim_type", "admission_date", "updated_at"])

        Discharge.objects.create(
            admission=sample_admission,
            discharge_type="NORMAL",
            discharge_date=timezone.now(),
            discharged_by=test_user,
            admission_diagnosis=sample_admission.admitting_diagnosis,
            final_diagnosis=sample_admission.admitting_diagnosis,
            final_diagnosis_text="Recovered",
            treatment_summary="Stabilized in ICU and discharged.",
            patient_instructions="Return in 7 days.",
        )

        tariff = SHATariff.objects.create(
            code="SHA-ICU-901",
            name="ICU Monitoring",
            description="ICU Monitoring",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=claim.facility_level,
            sha_amount=Decimal("2500.00"),
            effective_date=date.today(),
            is_active=True,
        )
        claim.items.create(
            tariff=tariff,
            description="ICU Monitoring",
            service_date=claim.service_date,
            quantity=Decimal("1.00"),
            unit_price=Decimal("2500.00"),
            claimed_amount=Decimal("2500.00"),
            sha_covered_amount=Decimal("2500.00"),
            patient_payable_amount=Decimal("0.00"),
            discount_amount=Decimal("0.00"),
            allocation_status="pending",
            is_preview_line=True,
        )

        response = sha_client.post(
            f"/api/sha/claims/{claim.id}/ilm/materialize-preview-invoice/",
            {"invoice_number": "INV/DHA/ICU-001", "replace_existing": True},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["critical_care_attachment_id"]
        assert response.data["critical_care_created"] is True
        assert response.data["critical_care_skipped_reason"] == ""
        assert response.data["discharge_summary_attachment_id"]
        assert response.data["discharge_summary_created"] is True
        assert response.data["discharge_summary_skipped_reason"] == ""
        assert response.data["claim_form_attachment_id"]
        assert response.data["claim_form_created"] is True
        assert response.data["claim_form_skipped_reason"] == ""

        critical = SHAClaimAttachment.objects.get(id=response.data["critical_care_attachment_id"])
        assert critical.attachment_type == "clinical_notes"
        assert "Critical Care Unit Case" in critical.name
        discharge_summary = SHAClaimAttachment.objects.get(
            id=response.data["discharge_summary_attachment_id"]
        )
        assert discharge_summary.attachment_type == "discharge_summary"
        assert "Discharge Summary" in discharge_summary.name

    def test_ilm_submit_returns_unresolved_lines_for_missing_tariff_items(
        self, sha_client, sample_sha_claim_for_uat, test_user
    ):  # noqa: F811
        """Submit preflight should expose unresolved claim lines when tariff mapping is missing."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        from hmis.apps.billing.models import SHAClaimAttachment, SHAClaimItem

        claim = sample_sha_claim_for_uat
        claim.previewed_at = timezone.now()
        claim.save(update_fields=["previewed_at", "updated_at"])

        SHAClaimItem.objects.create(
            claim=claim,
            tariff=None,
            description="Unmapped lab item",
            service_date=claim.service_date,
            quantity=Decimal("1.00"),
            unit_price=Decimal("300.00"),
            claimed_amount=Decimal("300.00"),
        )

        for att_type in ["clinical_notes", "invoice"]:
            SHAClaimAttachment.objects.get_or_create(
                claim=claim,
                attachment_type=att_type,
                defaults={
                    "name": att_type,
                    "file": SimpleUploadedFile(f"{att_type}.pdf", b"%PDF-1.4", "application/pdf"),
                    "file_size": 7,
                    "mime_type": "application/pdf",
                    "checksum": "a" * 32,
                    "original_filename": f"{att_type}.pdf",
                    "uploaded_by": test_user,
                },
            )

        response = sha_client.post(
            f"/api/sha/claims/{claim.id}/ilm/submit/",
            {"invoice_number": "INV/DHA/TARIFF-MISS-001"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["code"] == "local_validation_failed"
        assert response.data["missing_tariff_count"] == 1
        assert len(response.data["unresolved_lines"]) == 1
        assert response.data["unresolved_lines"][0]["description"] == "Unmapped lab item"

    def test_validate_reports_specific_member_ineligibility_reason(self, sample_sha_claim_for_uat):
        """Validation should show concrete eligibility expiry reason instead of generic status label."""
        claim = sample_sha_claim_for_uat
        claim.sha_member.status = claim.sha_member.MembershipStatus.ACTIVE
        claim.sha_member.coverage_end_date = date.today() - timedelta(days=1)
        claim.sha_member.save()

        is_valid, errors = claim.validate_for_submission()

        assert is_valid is False
        assert any("Member not eligible: coverage expired on" in error for error in errors)


# =============================================================================
# P1: All Preauths Approved Before Submit
# =============================================================================


@pytest.mark.django_db
class TestAllPreauthsApprovedBeforeSubmit:
    """DHA UAT: All preauths on a claim must be approved before submission."""

    def test_pending_preauth_blocks_submission(self, sample_sha_claim_for_uat):
        """Should fail validation when a preauth is still pending."""
        from hmis.apps.billing.models import SHAPreauth

        claim = sample_sha_claim_for_uat
        claim.previewed_at = timezone.now()
        claim.save(update_fields=["previewed_at"])

        SHAPreauth.objects.create(
            claim=claim,
            patient=claim.patient,
            consent_token="test-token",
            intervention_code="SHA-07-001",
            status=SHAPreauth.Status.SUBMITTED,
            facility=claim.facility,
            organization=claim.organization,
        )

        is_valid, errors = claim.validate_for_submission()
        assert is_valid is False
        assert any("pre-authorization" in e.lower() and "approved" in e.lower() for e in errors)

    def test_approved_preauth_allows_submission(self, sample_sha_claim_for_uat):
        """Should not block when all preauths are approved."""
        from hmis.apps.billing.models import SHAPreauth

        claim = sample_sha_claim_for_uat
        claim.previewed_at = timezone.now()
        claim.save(update_fields=["previewed_at"])

        SHAPreauth.objects.create(
            claim=claim,
            patient=claim.patient,
            consent_token="test-token",
            intervention_code="SHA-07-001",
            status=SHAPreauth.Status.APPROVED,
            facility=claim.facility,
            organization=claim.organization,
        )

        is_valid, errors = claim.validate_for_submission()
        # Should NOT contain a preauth error (may still have other errors)
        assert not any(
            "pre-authorization" in e.lower() and "approved" in e.lower() and "pending" in e.lower()
            for e in errors
        )


# =============================================================================
# P2: Attachment Size/Type Validation
# =============================================================================


@pytest.mark.django_db
class TestAttachmentLocalValidation:
    """DHA UAT: Attachment files must be ≤2MB and .jpg/.png/.pdf only."""

    def test_oversized_file_rejected(self, sha_client, sample_sha_claim_for_uat):
        """Should reject files exceeding 2MB."""
        claim = sample_sha_claim_for_uat
        # Create a file >2MB
        large_content = b"x" * (2 * 1024 * 1024 + 1)
        large_file = SimpleUploadedFile("large.pdf", large_content, "application/pdf")

        response = sha_client.post(
            f"/api/sha/claims/{claim.id}/ilm/attachments/add/",
            {"file": large_file},
            format="multipart",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["code"] == "file_too_large"

    def test_invalid_extension_rejected(self, sha_client, sample_sha_claim_for_uat):
        """Should reject files with unsupported extensions."""
        claim = sample_sha_claim_for_uat
        bad_file = SimpleUploadedFile("malware.exe", b"MZ" * 100, "application/octet-stream")

        response = sha_client.post(
            f"/api/sha/claims/{claim.id}/ilm/attachments/add/",
            {"file": bad_file},
            format="multipart",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["code"] == "invalid_file_type"

    def test_valid_pdf_accepted(self, sha_client, sample_sha_claim_for_uat):
        """Should accept a valid PDF within size limits."""
        from hmis.apps.billing.models import SHAClaimAttachment

        claim = sample_sha_claim_for_uat
        valid_file = SimpleUploadedFile("report.pdf", b"%PDF-1.4 test content", "application/pdf")

        with patch("hmis.apps.billing.services.ilm_claim_service.IlmClaimService") as svc:
            mock_result = MagicMock()
            mock_result.status_code = 200
            mock_result.payload = {}
            svc.return_value.add_attachment.return_value = mock_result
            response = sha_client.post(
                f"/api/sha/claims/{claim.id}/ilm/attachments/add/",
                {
                    "file": valid_file,
                    "document_type": "CRITICAL_CARE_UNIT_CASE",
                    "document_title": "Critical Care Unit Case",
                },
                format="multipart",
            )
        assert response.status_code == status.HTTP_200_OK
        saved = claim.attachments.latest("id")
        assert saved.attachment_type == SHAClaimAttachment.AttachmentType.CLINICAL_NOTES
        assert saved.name == "Critical Care Unit Case"


# =============================================================================
# P2: Discharge Date Cannot Be Future
# =============================================================================


@pytest.mark.django_db
class TestDischargeNotFuture:
    """DHA UAT: Discharge date must not be in the future."""

    def test_future_discharge_date_rejected(self, sha_client):
        """Should reject discharge_date that is in the future."""
        future = (date.today() + timedelta(days=5)).isoformat()
        response = sha_client.post(
            "/api/sha/ilm/lifecycle/discharge/",
            {
                "consent_token": "test-token",
                "discharge_date": future,
                "discharge_reason": "RECOVERED",
                "invoice_number": "INV-001",
                "otp": "123456",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["code"] == "future_discharge_date"

    def test_today_discharge_date_accepted(self, sha_client):
        """Should accept discharge_date that is today."""
        today = date.today().isoformat()
        with patch("hmis.apps.billing.sha_ilm_lifecycle_views.IlmLifecycleService") as svc:
            mock_result = type(
                "Result",
                (),
                {
                    "response": type("R", (), {"ok": True, "status_code": 200})(),
                    "payload": {},
                    "status_code": 200,
                    "record_id": None,
                    "dha_external_id": "",
                    "correlation_id": "",
                },
            )()
            svc.return_value.discharge_inpatient.return_value = mock_result
            response = sha_client.post(
                "/api/sha/ilm/lifecycle/discharge/",
                {
                    "consent_token": "test-token",
                    "discharge_date": today,
                    "discharge_reason": "RECOVERED",
                    "invoice_number": "INV-001",
                    "otp": "123456",
                },
                format="json",
            )
        # Should not be 400 for future_discharge_date
        assert response.data.get("code") != "future_discharge_date"

    def test_discharge_auto_generates_final_bill_attachment(
        self, sha_client, sample_sha_claim_for_uat
    ):
        """Discharge should best-effort auto-generate a FINAL_BILL local attachment."""
        from hmis.apps.billing.models import ConsentToken

        claim = sample_sha_claim_for_uat
        consent = ConsentToken.objects.create(
            patient=claim.patient,
            sha_member=claim.sha_member,
            encounter=claim.encounter,
            facility=claim.facility,
            organization=claim.organization,
            consent_method=ConsentToken.ConsentMethod.OTP,
            status=ConsentToken.ConsentStatus.VALIDATED,
            identification_type="CR Number",
            identification_number="CR0001234567890-1",
            consent_token="auto-final-bill-token",
            created_by=claim.created_by,
        )
        assert consent.id is not None

        with patch("hmis.apps.billing.sha_ilm_lifecycle_views.IlmLifecycleService") as svc:
            with patch(
                "hmis.apps.billing.services.final_bill_attachment_service.FinalBillAttachmentService.ensure_for_claim"
            ) as ensure_final_bill:
                with patch(
                    "hmis.apps.billing.sha_ilm_lifecycle_views.AdmissionAttachmentService.ensure_for_claim"
                ) as ensure_admission_docs:
                    ensure_admission_docs.return_value = type(
                        "AdmissionDocs",
                        (),
                        {
                            "critical_care": type(
                                "Doc",
                                (),
                                {
                                    "attachment_id": 101,
                                    "created": True,
                                    "updated": False,
                                    "skipped_reason": "",
                                },
                            )(),
                            "discharge_summary": type(
                                "Doc",
                                (),
                                {
                                    "attachment_id": 102,
                                    "created": True,
                                    "updated": False,
                                    "skipped_reason": "",
                                },
                            )(),
                        },
                    )()
                mock_result = type(
                    "Result",
                    (),
                    {
                        "response": type("R", (), {"ok": True, "status_code": 200})(),
                        "payload": {},
                        "status_code": 200,
                        "record_id": None,
                        "dha_external_id": "",
                        "correlation_id": "",
                    },
                )()
                svc.return_value.discharge_inpatient.return_value = mock_result

                response = sha_client.post(
                    "/api/sha/ilm/lifecycle/discharge/",
                    {
                        "consent_token": "auto-final-bill-token",
                        "discharge_date": date.today().isoformat(),
                        "discharge_reason": "RECOVERED",
                        "invoice_number": "INV-001",
                        "otp": "123456",
                    },
                    format="json",
                )

        assert response.status_code == status.HTTP_200_OK
        assert "critical_care_attachment_id" in response.data
        assert "critical_care_created" in response.data
        assert "critical_care_skipped_reason" in response.data
        assert "discharge_summary_attachment_id" in response.data
        assert "discharge_summary_created" in response.data
        assert "discharge_summary_skipped_reason" in response.data
        assert "claim_form_attachment_id" in response.data
        assert "claim_form_created" in response.data
        assert "claim_form_skipped_reason" in response.data

    def test_discharge_blocked_when_allocation_pending(self, sha_client, sample_sha_claim_for_uat):
        """Discharge should block when payer allocation review is pending."""
        from hmis.apps.billing.models import ConsentToken, SHATariff

        claim = sample_sha_claim_for_uat
        tariff = SHATariff.objects.create(
            code="SHA-08-779",
            name="Pending Allocation",
            description="Pending Allocation",
            category=SHATariff.TariffCategory.LABORATORY,
            facility_level=claim.facility_level,
            sha_amount=Decimal("500.00"),
            effective_date=date.today(),
            is_active=True,
        )
        claim.items.create(
            tariff=tariff,
            description="Pending Allocation",
            service_date=claim.service_date,
            quantity=Decimal("1.00"),
            unit_price=Decimal("500.00"),
            sha_covered_amount=Decimal("500.00"),
            patient_payable_amount=Decimal("0.00"),
            discount_amount=Decimal("0.00"),
            allocation_status="pending",
        )
        ConsentToken.objects.create(
            patient=claim.patient,
            sha_member=claim.sha_member,
            encounter=claim.encounter,
            facility=claim.facility,
            organization=claim.organization,
            consent_method=ConsentToken.ConsentMethod.OTP,
            status=ConsentToken.ConsentStatus.VALIDATED,
            identification_type="CR Number",
            identification_number="CR0001234567890-1",
            consent_token="pending-allocation-token",
            created_by=claim.created_by,
        )

        with patch("hmis.apps.billing.sha_ilm_lifecycle_views.IlmLifecycleService") as svc:
            response = sha_client.post(
                "/api/sha/ilm/lifecycle/discharge/",
                {
                    "consent_token": "pending-allocation-token",
                    "discharge_date": date.today().isoformat(),
                    "discharge_reason": "RECOVERED",
                    "invoice_number": "INV-001",
                    "otp": "123456",
                },
                format="json",
            )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data.get("code") == "allocation_pending"
        svc.return_value.discharge_inpatient.assert_not_called()


# =============================================================================
# P3: ECCIF 24h Billing Window Guard
# =============================================================================


@pytest.mark.django_db
class TestECCIF24hBillingWindow:
    """DHA UAT: Emergency claims should be time-barred after 24h."""

    def test_add_line_blocked_after_24h(self, sha_client, sample_sha_claim_for_uat):
        """Should block add_line on ECCIF claims past 24h."""
        claim = sample_sha_claim_for_uat
        claim.is_emergency_claim = True
        claim.service_date = date.today() - timedelta(days=2)
        claim.save(update_fields=["is_emergency_claim", "service_date"])

        response = sha_client.post(
            f"/api/sha/claims/{claim.id}/ilm/lines/add/",
            {
                "intervention_code": "SHA-03-001",
                "service_name": "Emergency care",
                "service_identifier": "SRV-001",
                "unit_price": "1000",
                "quantity": "1",
                "scheme_code": "UHC",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["code"] == "eccif_time_barred"

    def test_add_diagnosis_blocked_after_24h(self, sha_client, sample_sha_claim_for_uat):
        """Should block add_diagnosis on ECCIF claims past 24h."""
        claim = sample_sha_claim_for_uat
        claim.is_emergency_claim = True
        claim.service_date = date.today() - timedelta(days=2)
        claim.save(update_fields=["is_emergency_claim", "service_date"])

        response = sha_client.post(
            f"/api/sha/claims/{claim.id}/ilm/diagnoses/add/",
            {"icd_code": "J06.9", "intervention_code": "SHA-03-001"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["code"] == "eccif_time_barred"

    def test_add_attachment_blocked_after_24h(self, sha_client, sample_sha_claim_for_uat):
        """Should block add_attachment on ECCIF claims past 24h."""
        claim = sample_sha_claim_for_uat
        claim.is_emergency_claim = True
        claim.service_date = date.today() - timedelta(days=2)
        claim.save(update_fields=["is_emergency_claim", "service_date"])

        valid_file = SimpleUploadedFile("report.pdf", b"%PDF-1.4 test", "application/pdf")
        response = sha_client.post(
            f"/api/sha/claims/{claim.id}/ilm/attachments/add/",
            {"file": valid_file},
            format="multipart",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["code"] == "eccif_time_barred"

    def test_non_emergency_not_blocked(self, sha_client, sample_sha_claim_for_uat):
        """Non-emergency claims should not be time-barred by 24h rule."""
        claim = sample_sha_claim_for_uat
        claim.is_emergency_claim = False
        claim.service_date = date.today() - timedelta(days=2)
        claim.save(update_fields=["is_emergency_claim", "service_date"])

        with patch("hmis.apps.billing.services.ilm_claim_service.IlmClaimService") as svc:
            mock_result = MagicMock()
            mock_result.status_code = 200
            mock_result.payload = {}
            svc.return_value.add_diagnosis.return_value = mock_result
            response = sha_client.post(
                f"/api/sha/claims/{claim.id}/ilm/diagnoses/add/",
                {"icd_code": "J06.9", "intervention_code": "SHA-01-001"},
                format="json",
            )
        # Should not be time-barred
        assert response.data.get("code") != "eccif_time_barred"


# =============================================================================
# P3: Consent Dedup With Access Point
# =============================================================================


@pytest.mark.django_db
class TestConsentDedupAccessPoint:
    """DHA UAT: Consent dedup should be per-access-point (IP vs OP)."""

    def test_op_consent_allows_ip_consent_same_day(self, sha_client, sample_sha_claim_for_uat):
        """Should allow IP consent when OP consent already exists for same patient/day."""
        from hmis.apps.billing.models import ConsentToken

        claim = sample_sha_claim_for_uat
        sha_member = claim.sha_member
        facility = claim.facility

        # Create existing OP consent for today
        ConsentToken.objects.create(
            patient=claim.patient,
            sha_member=sha_member,
            facility=facility,
            organization=facility.organization,
            consent_method=ConsentToken.ConsentMethod.OTP,
            status=ConsentToken.ConsentStatus.VALIDATED,
            identification_type="CR Number",
            identification_number="CR0001234567890-1",
            access_point="OP",
            created_by=claim.created_by,
        )

        # Request consent with inpatient interventions (SHA-07 = inpatient)
        with patch(
            "hmis.apps.billing.services.ilm_lifecycle_service.IlmLifecycleService.send_visit_otp"
        ) as mock_send:
            mock_result = MagicMock()
            mock_result.payload = {"otp_reference": "REF-123", "message": ""}
            mock_send.return_value = mock_result
            response = sha_client.post(
                "/api/sha/consent/send-otp/",
                {
                    "sha_member_id": sha_member.id,
                    "intervention_codes": ["SHA-07-001"],  # Inpatient
                },
                format="json",
            )

        # Should create new consent (not reuse OP one) since this is IP
        assert response.status_code == status.HTTP_201_CREATED

    def test_same_access_point_reuses_consent(self, sha_client, sample_sha_claim_for_uat):
        """Should reuse existing consent for same access point."""
        from hmis.apps.billing.models import ConsentToken

        claim = sample_sha_claim_for_uat
        sha_member = claim.sha_member
        facility = claim.facility

        # Create existing OP consent for today (with future expires_at to avoid exclusion)
        existing = ConsentToken.objects.create(
            patient=claim.patient,
            sha_member=sha_member,
            facility=facility,
            organization=facility.organization,
            consent_method=ConsentToken.ConsentMethod.OTP,
            status=ConsentToken.ConsentStatus.VALIDATED,
            identification_type="CR Number",
            identification_number="CR0001234567890-1",
            access_point="OP",
            otp_reference="EXISTING-REF",
            expires_at=timezone.now() + timedelta(hours=1),
            created_by=claim.created_by,
        )

        # Request consent with OP interventions (SHA-01 = outpatient)
        with patch(
            "hmis.apps.billing.services.sha_consent.SHAConsentService._make_request"
        ) as mock_req:
            mock_req.return_value = {"otp_reference": "NEW-REF", "message": ""}
            response = sha_client.post(
                "/api/sha/consent/send-otp/",
                {
                    "sha_member_id": sha_member.id,
                    "intervention_codes": ["SHA-01-001"],  # Outpatient
                },
                format="json",
            )

        # Should reuse existing
        assert response.status_code == status.HTTP_200_OK
        assert response.data["consent_id"] == existing.id
        assert "reused" in response.data["message"].lower()


# =============================================================================
# P3: Deceased Death Notification Attachment Check
# =============================================================================


@pytest.mark.django_db
class TestDeceasedDeathNotification:
    """DHA UAT: Discharge with reason DECEASED requires death notification attachment."""

    def test_deceased_without_death_notification_warns(self, sha_client, sample_sha_claim_for_uat):
        """Should reject discharge with DECEASED reason if no death notification uploaded."""
        from hmis.apps.billing.models import ConsentToken

        claim = sample_sha_claim_for_uat
        # Create a consent token with a known token string linked to the encounter
        ConsentToken.objects.create(
            patient=claim.patient,
            sha_member=claim.sha_member,
            encounter=claim.encounter,
            facility=claim.facility,
            organization=claim.organization,
            consent_method=ConsentToken.ConsentMethod.OTP,
            status=ConsentToken.ConsentStatus.VALIDATED,
            identification_type="CR Number",
            identification_number="CR0001234567890-1",
            consent_token="death-test-token",
            created_by=claim.created_by,
        )

        response = sha_client.post(
            "/api/sha/ilm/lifecycle/discharge/",
            {
                "consent_token": "death-test-token",
                "discharge_date": date.today().isoformat(),
                "discharge_reason": "DECEASED",
                "invoice_number": "INV-001",
                "otp": "123456",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data.get("code") == "missing_death_notification"
