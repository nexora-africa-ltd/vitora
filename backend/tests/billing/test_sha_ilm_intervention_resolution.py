"""Tests for SHA claim intervention metadata enrichment and resolution."""

import io
import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.utils import timezone

User = get_user_model()


def _make_test_user():
    unique = uuid.uuid4().hex[:8]
    return User.objects.create_user(
        username=f"intervention-test-{unique}",
        password="testpass",
        email=f"intervention-{unique}@test.com",
    )


def _make_sha_claim(patient, facility, encounter, organization):
    from hmis.apps.billing.models import SHAClaim, SHAMember

    user = _make_test_user()
    member = SHAMember.objects.create(
        patient=patient,
        sha_number=f"SHA-INTER-{uuid.uuid4().hex[:6]}",
        national_id="12345678",
        membership_type="principal",
        status="active",
        coverage_start_date=date.today(),
        created_by=user,
    )
    return SHAClaim.objects.create(
        patient=patient,
        sha_member=member,
        encounter=encounter,
        claim_type="outpatient",
        status=SHAClaim.ClaimStatus.DRAFT,
        service_date=date.today(),
        primary_diagnosis_code="A00",
        primary_diagnosis_description="Cholera",
        claimed_amount=Decimal("5000.00"),
        facility_code=facility.mfl_code,
        organization=organization,
        facility=facility,
        created_by=user,
    )


class TestGetLocalInterventionClaimDefaults:
    """Tests for the intervention metadata helper."""

    def test_returns_defaults_for_unknown_code(self):
        from hmis.apps.billing.services.intervention_fallback import (
            get_local_intervention_claim_defaults,
        )

        defaults = get_local_intervention_claim_defaults("SHA-99-999")
        assert defaults["intervention_name"] == ""
        assert defaults["benefit_code"] == "SHA-99"
        assert defaults["payment_mechanism"] == ""
        assert defaults["needs_preauth"] is False

    def test_returns_defaults_for_known_code(self):
        from hmis.apps.billing.services.intervention_fallback import (
            get_local_intervention_claim_defaults,
        )

        defaults = get_local_intervention_claim_defaults("SHA-01-001")
        assert defaults["intervention_name"] != ""
        assert defaults["benefit_code"] != ""
        assert isinstance(defaults["schemes"], list)
        assert isinstance(defaults["intervention_payload"], dict)


class TestPersistConsentInterventions:
    """Tests for _persist_consent_interventions metadata enrichment."""

    def test_enriches_claim_intervention_metadata(
        self, sample_patient, sample_facility, sample_encounter, sample_organization
    ):
        from hmis.apps.billing.models import SHAClaimIntervention
        from hmis.apps.billing.sha_views import _persist_consent_interventions

        claim = _make_sha_claim(
            sample_patient, sample_facility, sample_encounter, sample_organization
        )

        _persist_consent_interventions(
            patient=sample_patient,
            facility=sample_facility,
            intervention_codes=["SHA-01-001"],
        )

        intervention = SHAClaimIntervention.objects.get(claim=claim, intervention_code="SHA-01-001")
        assert intervention.status == "active"
        assert intervention.intervention_name != ""
        assert intervention.benefit_code != ""

    def test_does_not_create_when_no_intervention_codes(
        self, sample_patient, sample_facility, sample_encounter, sample_organization
    ):
        from hmis.apps.billing.models import SHAClaimIntervention
        from hmis.apps.billing.sha_views import _persist_consent_interventions

        claim = _make_sha_claim(
            sample_patient, sample_facility, sample_encounter, sample_organization
        )

        _persist_consent_interventions(
            patient=sample_patient,
            facility=sample_facility,
            intervention_codes=[],
        )

        assert SHAClaimIntervention.objects.filter(claim=claim).count() == 0


class TestAutoAttachInterventions:
    """Tests for auto_attach_interventions metadata enrichment."""

    def test_enriches_metadata_when_attaching(
        self, sample_patient, sample_facility, sample_encounter, sample_organization
    ):
        from hmis.apps.billing.models import SHAClaimIntervention
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        claim = _make_sha_claim(
            sample_patient, sample_facility, sample_encounter, sample_organization
        )

        result = SHAClaimAutomationService.auto_attach_interventions(
            claim.pk,
            [{"code": "SHA-01-001", "name": "Test Consult", "tariff": "1000"}],
        )

        assert result["attached"] == 1
        intervention = SHAClaimIntervention.objects.get(claim=claim, intervention_code="SHA-01-001")
        assert intervention.status == "active"
        assert intervention.intervention_name == "Test Consult"
        assert intervention.benefit_code != ""

    def test_skips_non_draft_claims(
        self, sample_patient, sample_facility, sample_encounter, sample_organization
    ):
        from hmis.apps.billing.models import SHAClaim
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        claim = _make_sha_claim(
            sample_patient, sample_facility, sample_encounter, sample_organization
        )
        claim.status = SHAClaim.ClaimStatus.SUBMITTED
        claim.save(update_fields=["status"])

        result = SHAClaimAutomationService.auto_attach_interventions(
            claim.pk,
            [{"code": "SHA-01-001", "name": "Test Consult", "tariff": "1000"}],
        )

        assert result["reason"] == "not_draft"


class TestResolveClaimInterventionCode:
    """Tests for the intervention code resolution priority logic."""

    def _make_claim(self, sample_patient, sample_facility, sample_encounter, sample_organization):
        return _make_sha_claim(
            sample_patient, sample_facility, sample_encounter, sample_organization
        )

    def _viewset(self):
        from hmis.apps.billing.sha_views import SHAClaimViewSet

        return SHAClaimViewSet()

    def test_returns_latest_preauth_intervention_code(
        self, sample_patient, sample_facility, sample_encounter, sample_organization
    ):
        from hmis.apps.billing.models import SHAClaimIntervention, SHAPreauth

        claim = self._make_claim(
            sample_patient, sample_facility, sample_encounter, sample_organization
        )
        SHAClaimIntervention.objects.create(
            claim=claim,
            intervention_code="SHA-01-001",
            status="active",
        )
        SHAPreauth.objects.create(
            claim=claim,
            facility=claim.facility,
            organization=claim.organization,
            patient=claim.patient,
            sha_member=claim.sha_member,
            consent_token="token-1",
            intervention_code="SHA-19-277",
            status="pending",
            requested_by=claim.created_by,
        )

        code = self._viewset()._resolve_claim_intervention_code(claim)
        assert code == "SHA-19-277"

    def test_falls_back_to_consent_token_interventions(
        self, sample_patient, sample_facility, sample_encounter, sample_organization
    ):
        from hmis.apps.billing.models import ConsentToken, SHAClaimIntervention

        claim = self._make_claim(
            sample_patient, sample_facility, sample_encounter, sample_organization
        )
        SHAClaimIntervention.objects.create(
            claim=claim,
            intervention_code="SHA-01-001",
            status="active",
        )
        ConsentToken.objects.create(
            patient=sample_patient,
            sha_member=claim.sha_member,
            facility=sample_facility,
            organization=sample_organization,
            identification_number="12345678",
            encounter=sample_encounter,
            consent_method=ConsentToken.ConsentMethod.OTP,
            consent_token="token-2",
            auth_guid="auth-2",
            intervention_codes=["SHA-19-277"],
            status=ConsentToken.ConsentStatus.VALIDATED,
            validated_at=timezone.now(),
            expires_at=timezone.now() + timezone.timedelta(hours=1),
            created_by=claim.created_by,
        )

        from hmis.apps.billing.services.consent_token_resolver import resolve_for_claim

        resolved = resolve_for_claim(claim)
        assert resolved.token == "token-2"

        consent_obj = (
            ConsentToken.objects.filter(consent_token="token-2").order_by("-validated_at").first()
        )
        assert consent_obj is not None
        assert consent_obj.intervention_codes == ["SHA-19-277"]

        code = self._viewset()._resolve_claim_intervention_code(claim)
        assert code == "SHA-19-277"

    def test_falls_back_to_active_claim_intervention(
        self, sample_patient, sample_facility, sample_encounter, sample_organization
    ):
        from hmis.apps.billing.models import SHAClaimIntervention

        claim = self._make_claim(
            sample_patient, sample_facility, sample_encounter, sample_organization
        )
        SHAClaimIntervention.objects.create(
            claim=claim,
            intervention_code="SHA-01-001",
            status="active",
        )

        code = self._viewset()._resolve_claim_intervention_code(claim)
        assert code == "SHA-01-001"

    def test_returns_empty_when_no_source_available(
        self, sample_patient, sample_facility, sample_encounter, sample_organization
    ):
        claim = self._make_claim(
            sample_patient, sample_facility, sample_encounter, sample_organization
        )

        code = self._viewset()._resolve_claim_intervention_code(claim)
        assert code == ""

    def test_ignores_cancelled_preauth(
        self, sample_patient, sample_facility, sample_encounter, sample_organization
    ):
        from hmis.apps.billing.models import SHAClaimIntervention, SHAPreauth

        claim = self._make_claim(
            sample_patient, sample_facility, sample_encounter, sample_organization
        )
        SHAClaimIntervention.objects.create(
            claim=claim,
            intervention_code="SHA-01-001",
            status="active",
        )
        SHAPreauth.objects.create(
            claim=claim,
            facility=claim.facility,
            organization=claim.organization,
            patient=claim.patient,
            sha_member=claim.sha_member,
            consent_token="token-3",
            intervention_code="SHA-19-277",
            status="cancelled",
            requested_by=claim.created_by,
        )

        code = self._viewset()._resolve_claim_intervention_code(claim)
        assert code == "SHA-01-001"


@pytest.mark.django_db
class TestBackfillClaimInterventionsIlmCommand:
    def test_backfills_fund_and_full_payload(
        self, sample_patient, sample_facility, sample_encounter, sample_organization
    ):
        from hmis.apps.billing.models import SHAClaimIntervention

        sample_patient.cr_number = "CR8254672331312-6"
        sample_patient.save(update_fields=["cr_number"])

        claim = _make_sha_claim(
            sample_patient, sample_facility, sample_encounter, sample_organization
        )
        intervention = SHAClaimIntervention.objects.create(
            claim=claim,
            intervention_code="SHA-19-277",
            intervention_name="",
            benefit_code="SHA-19",
            required_document_types=[],
            payment_mechanism="",
            access_point="",
        )

        payload = {
            "code": "SHA-19-277",
            "name": "Burr hole",
            "payment_mechanism": "FEE FOR SERVICE",
            "access_point": "OP",
            "required_document_types": ["MEDICAL_REPORT"],
            "overall_tariff": "1000.00",
            "fund": "SHIF",
            "intervention_fund": "SURGICAL",
            "supported_scheme": "SHA",
            "schemes": ["SHA", "SHIF"],
            "raw_data": {"anything": "kept"},
        }

        with (
            patch(
                "hmis.apps.billing.management.commands.backfill_sha_claim_interventions_ilm.IlmRegistriesService.fetch_sub_benefits"
            ) as mock_sub,
            patch(
                "hmis.apps.billing.management.commands.backfill_sha_claim_interventions_ilm.IlmRegistriesService.fetch_benefit_interventions"
            ) as mock_interventions,
        ):
            mock_sub.return_value = SimpleNamespace(
                payload={"results": [{"subBenefitCode": "SHA-19-SC-10"}]}
            )
            mock_interventions.return_value = SimpleNamespace(payload={"results": [payload]})

            call_command(
                "backfill_sha_claim_interventions_ilm",
                "--claim-id",
                str(claim.id),
                "--commit",
                "--max-sub-benefits",
                "5",
            )

        intervention.refresh_from_db()
        assert intervention.intervention_name == "Burr hole"
        assert intervention.payment_mechanism == "FEE_FOR_SERVICE"
        assert intervention.access_point == "OP"
        assert intervention.required_document_types == ["MEDICAL_REPORT"]
        assert intervention.fund == "SHIF"
        assert intervention.intervention_fund == "SURGICAL"
        assert intervention.supported_scheme == "SHA"
        assert intervention.schemes == ["SHA", "SHIF"]
        assert intervention.intervention_payload["code"] == "SHA-19-277"
        assert intervention.intervention_payload["raw_data"]["anything"] == "kept"


@pytest.mark.django_db
class TestInterventionMetadataGapReportCommand:
    def test_reports_claims_missing_fund_or_schemes(
        self, sample_patient, sample_facility, sample_encounter, sample_organization
    ):
        from hmis.apps.billing.models import SHAClaimIntervention

        claim = _make_sha_claim(
            sample_patient, sample_facility, sample_encounter, sample_organization
        )
        SHAClaimIntervention.objects.create(
            claim=claim,
            intervention_code="SHA-19-277",
            status="active",
            fund="",
            schemes=[],
        )
        SHAClaimIntervention.objects.create(
            claim=claim,
            intervention_code="SHA-03-002",
            status="active",
            fund="SHIF",
            schemes=["SHA"],
        )

        stdout = io.StringIO()
        call_command(
            "report_sha_claim_intervention_fund_gaps", "--claim-id", str(claim.id), stdout=stdout
        )
        output = stdout.getvalue()

        assert "Reported rows: 1" in output
        assert "code=SHA-19-277" in output
        assert "code=SHA-03-002" not in output
        assert f"Claim IDs with gaps: {claim.id}" in output


class TestPushLocalAttachments:
    """Tests for ilm_push_local_attachments intervention code selection."""

    def _make_claim_with_user(
        self, sample_patient, sample_facility, sample_encounter, sample_organization
    ):
        claim = _make_sha_claim(
            sample_patient, sample_facility, sample_encounter, sample_organization
        )
        user = claim.created_by
        user.is_superuser = True
        user.save(update_fields=["is_superuser"])
        return claim, user

    def test_rejects_when_no_intervention_code_source(
        self,
        authenticated_client,
        sample_patient,
        sample_facility,
        sample_encounter,
        sample_organization,
    ):
        from hmis.apps.billing.models import SHAClaimAttachment

        claim, user = self._make_claim_with_user(
            sample_patient, sample_facility, sample_encounter, sample_organization
        )
        authenticated_client.force_authenticate(user=user)

        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type="clinical_notes",
            name="test.pdf",
            description="test attachment",
            file=ContentFile(b"test content", name="test.pdf"),
            uploaded_by=user,
        )

        response = authenticated_client.post(
            f"/api/billing/claims/{claim.id}/ilm/attachments/push-local/"
        )
        assert response.status_code == 400
        assert response.data["code"] == "no_active_intervention"

    def test_uses_preauth_intervention_code(
        self,
        authenticated_client,
        sample_patient,
        sample_facility,
        sample_encounter,
        sample_organization,
    ):
        from hmis.apps.billing.models import SHAClaimAttachment, SHAClaimIntervention, SHAPreauth

        claim, user = self._make_claim_with_user(
            sample_patient, sample_facility, sample_encounter, sample_organization
        )
        authenticated_client.force_authenticate(user=user)

        SHAClaimIntervention.objects.create(
            claim=claim,
            intervention_code="SHA-01-001",
            status="active",
        )
        SHAPreauth.objects.create(
            claim=claim,
            facility=claim.facility,
            organization=claim.organization,
            patient=claim.patient,
            sha_member=claim.sha_member,
            consent_token="token-4",
            intervention_code="SHA-19-277",
            status="pending",
            requested_by=user,
        )
        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type="clinical_notes",
            name="test.pdf",
            description="test attachment",
            file=ContentFile(b"test content", name="test.pdf"),
            uploaded_by=user,
        )

        mock_service = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.payload = {}
        mock_service.add_attachment.return_value = mock_response

        with patch(
            "hmis.apps.billing.sha_views.SHAClaimViewSet._ilm_service",
            return_value=mock_service,
        ):
            response = authenticated_client.post(
                f"/api/billing/claims/{claim.id}/ilm/attachments/push-local/"
            )

        assert response.status_code == 200
        mock_service.add_attachment.assert_called_once()
        _, call_kwargs = mock_service.add_attachment.call_args
        assert call_kwargs["extra_fields"].get("intervention_code") == "SHA-19-277"
