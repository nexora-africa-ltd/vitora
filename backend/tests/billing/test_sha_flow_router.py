"""
Tests for DHA HIE Phase 2 & 3: Flow Router, Preauth Guard, Celery Polling,
UHC Eligibility, and FHIR Bundle Consent/Preauth Extensions.

Covers:
- sha_flow_router.determine_flow() — all facility level + scheme combinations
- SHAClaim.validate_for_submission() — preauth guard for restricted services
- poll_preauth_statuses Celery task
- _normalize_response UHC scheme detection
- package_claim consent token + preauth reference in FHIR Bundle
"""

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.utils import timezone

from hmis.apps.billing.models import (
    ConsentToken,
    PreauthRequest,
    SHAClaim,
    SHAClaimItem,
    SHAMember,
    SHATariff,
)
from hmis.apps.billing.services.sha_flow_router import ClaimFlow, determine_flow

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def sha_member(db, sample_patient, test_user):
    """SHA member for tests."""
    return SHAMember.objects.create(
        patient=sample_patient,
        sha_number="SHA-FLOW-001",
        national_id="31234567",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        coverage_start_date=date.today() - timedelta(days=180),
        coverage_end_date=date.today() + timedelta(days=180),
        created_by=test_user,
    )


@pytest.fixture
def sha_claim(db, sample_patient, sha_member, test_user, sample_facility, sample_encounter):
    """Draft SHA claim."""
    return SHAClaim.objects.create(
        patient=sample_patient,
        sha_member=sha_member,
        encounter=sample_encounter,
        claim_type=SHAClaim.ClaimType.OUTPATIENT,
        status=SHAClaim.ClaimStatus.DRAFT,
        service_date=date.today(),
        primary_diagnosis_code="K35.80",
        primary_diagnosis_description="Acute appendicitis",
        facility=sample_facility,
        facility_code=sample_facility.mfl_code or "12345",
        facility_level="L3",
        created_by=test_user,
    )


@pytest.fixture
def tariff_no_preauth(db):
    """Tariff that does NOT require pre-authorization."""
    return SHATariff.objects.create(
        code="CONS-001",
        name="General Consultation",
        category=SHATariff.TariffCategory.CONSULTATION,
        facility_level=SHATariff.TariffLevel.LEVEL_3,
        sha_amount=Decimal("500.00"),
        effective_date=date.today(),
        requires_preauthorization=False,
    )


@pytest.fixture
def tariff_preauth(db):
    """Tariff that requires pre-authorization."""
    return SHATariff.objects.create(
        code="SURG-001",
        name="Appendectomy",
        category=SHATariff.TariffCategory.SURGERY,
        facility_level=SHATariff.TariffLevel.LEVEL_4,
        sha_amount=Decimal("75000.00"),
        effective_date=date.today(),
        requires_preauthorization=True,
    )


@pytest.fixture
def claim_item_no_preauth(db, sha_claim, tariff_no_preauth):
    """Claim item with a tariff not requiring preauth."""
    return SHAClaimItem.objects.create(
        claim=sha_claim,
        tariff=tariff_no_preauth,
        description="General Consultation",
        quantity=1,
        unit_price=Decimal("500.00"),
        claimed_amount=Decimal("500.00"),
    )


@pytest.fixture
def claim_item_preauth(db, sha_claim, tariff_preauth):
    """Claim item with a tariff requiring preauth."""
    return SHAClaimItem.objects.create(
        claim=sha_claim,
        tariff=tariff_preauth,
        description="Appendectomy",
        quantity=1,
        unit_price=Decimal("75000.00"),
        claimed_amount=Decimal("75000.00"),
    )


@pytest.fixture
def validated_consent(db, sample_patient, sha_member, test_user, sample_facility):
    """Validated, non-expired consent token."""
    ct = ConsentToken.objects.create(
        patient=sample_patient,
        sha_member=sha_member,
        facility=sample_facility,
        consent_method=ConsentToken.ConsentMethod.OTP,
        status=ConsentToken.ConsentStatus.PENDING,
        otp_reference="OTP-FLOW-001",
        identification_type="National ID",
        identification_number="31234567",
        created_by=test_user,
    )
    ct.mark_validated(token="consent-flow-token-xyz", expires_in_seconds=3600)
    return ct


@pytest.fixture
def approved_preauth(
    db, sha_claim, sample_patient, sha_member, validated_consent, test_user, sample_facility
):
    """Approved preauth request."""
    return PreauthRequest.objects.create(
        claim=sha_claim,
        patient=sample_patient,
        sha_member=sha_member,
        consent_token=validated_consent,
        facility=sample_facility,
        preauth_reference="PA-FLOW-001",
        procedure_code="SURG-001",
        diagnosis_codes=["K35.80"],
        estimated_cost=Decimal("75000.00"),
        scheduled_date=date.today() + timedelta(days=7),
        clinical_notes="Appendectomy required",
        decision=PreauthRequest.PreauthDecision.APPROVED,
        valid_until=date.today() + timedelta(days=30),
        approved_amount=Decimal("75000.00"),
        submitted_at=timezone.now(),
        created_by=test_user,
    )


# ---------------------------------------------------------------------------
# Flow Router Tests
# ---------------------------------------------------------------------------


class TestFlowRouter:
    """Tests for sha_flow_router.determine_flow()."""

    def _make_encounter(self, encounter_type="OPD"):
        enc = MagicMock()
        enc.encounter_type = encounter_type
        enc.pk = 1
        return enc

    def _make_facility(self, level="3"):
        fac = MagicMock()
        fac.level = level
        fac.pk = 1
        return fac

    # --- Emergency always routes to ECCIF ---

    def test_emergency_encounter_routes_to_eccif(self):
        """Emergency encounter type always returns ECCIF regardless of scheme/level."""
        enc = self._make_encounter("EMERGENCY")
        fac = self._make_facility("2")
        result = determine_flow(enc, fac, {"primary_scheme_name": "SHIF"})
        assert result == ClaimFlow.ECCIF

    def test_emergency_eccif_regardless_of_facility_level(self):
        """ECCIF for emergency at Level 6 national referral."""
        enc = self._make_encounter("EMERGENCY")
        fac = self._make_facility("6")
        result = determine_flow(enc, fac, {"primary_scheme_name": "UHC"})
        assert result == ClaimFlow.ECCIF

    # --- UHC scheme routing ---

    def test_uhc_level2_routes_to_phc(self):
        """UHC scheme at Level 2 dispensary → PHC."""
        enc = self._make_encounter("OPD")
        fac = self._make_facility("2")
        result = determine_flow(enc, fac, {"primary_scheme_name": "UHC"})
        assert result == ClaimFlow.PHC

    def test_uhc_level3_routes_to_phc(self):
        """UHC scheme at Level 3 health centre → PHC."""
        enc = self._make_encounter("OPD")
        fac = self._make_facility("3")
        result = determine_flow(enc, fac, {"primary_scheme_name": "UHC"})
        assert result == ClaimFlow.PHC

    def test_uhc_level4_routes_to_shif(self):
        """UHC scheme at Level 4 hospital → SHIF (fallback heuristic)."""
        enc = self._make_encounter("OPD")
        fac = self._make_facility("4")
        result = determine_flow(enc, fac, {"primary_scheme_name": "UHC"})
        assert result == ClaimFlow.SHIF

    def test_uhc_level5_routes_to_shif(self):
        """UHC scheme at Level 5 county referral → SHIF (fallback heuristic)."""
        enc = self._make_encounter("OPD")
        fac = self._make_facility("5")
        result = determine_flow(enc, fac, {"primary_scheme_name": "UHC"})
        assert result == ClaimFlow.SHIF

    # --- SHIF scheme routing ---

    def test_shif_level3_routes_to_shif(self):
        """SHIF scheme at Level 3 → SHIF."""
        enc = self._make_encounter("OPD")
        fac = self._make_facility("3")
        result = determine_flow(enc, fac, {"primary_scheme_name": "SHIF"})
        assert result == ClaimFlow.SHIF

    def test_shif_level4_routes_to_shif(self):
        """SHIF scheme at Level 4 → SHIF."""
        enc = self._make_encounter("OPD")
        fac = self._make_facility("4")
        result = determine_flow(enc, fac, {"primary_scheme_name": "SHIF"})
        assert result == ClaimFlow.SHIF

    def test_shif_level6_routes_to_shif(self):
        """SHIF scheme at Level 6 national referral → SHIF."""
        enc = self._make_encounter("OPD")
        fac = self._make_facility("6")
        result = determine_flow(enc, fac, {"primary_scheme_name": "SHIF"})
        assert result == ClaimFlow.SHIF

    def test_shif_level2_routes_to_phc(self):
        """SHIF scheme at Level 2 dispensary → PHC (fallback heuristic)."""
        enc = self._make_encounter("OPD")
        fac = self._make_facility("2")
        result = determine_flow(enc, fac, {"primary_scheme_name": "SHIF"})
        assert result == ClaimFlow.PHC

    # --- Scheme name normalization ---

    def test_uhc_case_insensitive(self):
        """Scheme name 'uhc' (lowercase) should still route to PHC."""
        enc = self._make_encounter("OPD")
        fac = self._make_facility("2")
        result = determine_flow(enc, fac, {"primary_scheme_name": "uhc"})
        assert result == ClaimFlow.PHC

    def test_shif_with_whitespace(self):
        """Scheme name ' SHIF ' with whitespace should still route correctly."""
        enc = self._make_encounter("OPD")
        fac = self._make_facility("4")
        result = determine_flow(enc, fac, {"primary_scheme_name": " SHIF "})
        assert result == ClaimFlow.SHIF

    # --- No eligibility data / unknown scheme ---

    def test_no_eligibility_data_level4_defaults_to_shif(self):
        """No eligibility data at Level 4+ defaults to SHIF."""
        enc = self._make_encounter("OPD")
        fac = self._make_facility("4")
        result = determine_flow(enc, fac, None)
        assert result == ClaimFlow.SHIF

    def test_no_eligibility_data_level2_defaults_to_phc(self):
        """No eligibility data at Level 2 defaults to PHC."""
        enc = self._make_encounter("OPD")
        fac = self._make_facility("2")
        result = determine_flow(enc, fac, None)
        assert result == ClaimFlow.PHC

    def test_unknown_scheme_level5_defaults_to_shif(self):
        """Unknown scheme at Level 5 defaults to SHIF."""
        enc = self._make_encounter("IPD")
        fac = self._make_facility("5")
        result = determine_flow(enc, fac, {"primary_scheme_name": "UNKNOWN_SCHEME"})
        assert result == ClaimFlow.SHIF

    def test_unknown_scheme_level3_defaults_to_phc(self):
        """Unknown scheme at Level 3 defaults to PHC."""
        enc = self._make_encounter("OPD")
        fac = self._make_facility("3")
        result = determine_flow(enc, fac, {"primary_scheme_name": "OTHER"})
        assert result == ClaimFlow.PHC

    # --- IPD encounter type (not emergency) ---

    def test_ipd_not_emergency(self):
        """IPD encounter is not emergency — routes by scheme/level."""
        enc = self._make_encounter("IPD")
        fac = self._make_facility("4")
        result = determine_flow(enc, fac, {"primary_scheme_name": "SHIF"})
        assert result == ClaimFlow.SHIF

    # --- All 6 facility levels parametrized ---

    @pytest.mark.parametrize(
        "level,scheme,expected",
        [
            ("1", "UHC", ClaimFlow.PHC),  # Community unit — default PHC
            ("2", "UHC", ClaimFlow.PHC),
            ("3", "UHC", ClaimFlow.PHC),
            ("4", "UHC", ClaimFlow.SHIF),  # Heuristic: UHC at L4+
            ("5", "UHC", ClaimFlow.SHIF),
            ("6", "UHC", ClaimFlow.SHIF),
            ("1", "SHIF", ClaimFlow.PHC),  # SHIF at L1 → default PHC
            ("2", "SHIF", ClaimFlow.PHC),
            ("3", "SHIF", ClaimFlow.SHIF),
            ("4", "SHIF", ClaimFlow.SHIF),
            ("5", "SHIF", ClaimFlow.SHIF),
            ("6", "SHIF", ClaimFlow.SHIF),
        ],
    )
    def test_all_level_scheme_combinations(self, level, scheme, expected):
        """Parametrized: all facility levels × UHC/SHIF schemes."""
        enc = self._make_encounter("OPD")
        fac = self._make_facility(level)
        result = determine_flow(enc, fac, {"primary_scheme_name": scheme})
        assert result == expected


# ---------------------------------------------------------------------------
# Preauth Guard Tests (validate_for_submission)
# ---------------------------------------------------------------------------


class TestPreauthGuard:
    """Tests for preauth guard in SHAClaim.validate_for_submission()."""

    def _add_attachments(self, sha_claim, user):
        """Helper to add required attachments to a claim."""
        sha_claim.attachments.create(
            attachment_type="clinical_notes",
            file="notes.pdf",
            name="Clinical Notes",
            uploaded_by=user,
        )
        sha_claim.attachments.create(
            attachment_type="invoice",
            file="invoice.pdf",
            name="Invoice",
            uploaded_by=user,
        )

    def test_claim_without_preauth_items_passes(self, sha_claim, claim_item_no_preauth, test_user):
        """Claim with only non-preauth tariffs passes validation."""
        sha_claim.claimed_amount = Decimal("500.00")
        sha_claim.save(update_fields=["claimed_amount"])
        self._add_attachments(sha_claim, test_user)

        is_valid, errors = sha_claim.validate_for_submission()
        preauth_errors = [e for e in errors if "pre-authorization" in e.lower()]
        assert len(preauth_errors) == 0

    def test_claim_with_preauth_items_no_approval_fails(
        self, sha_claim, claim_item_preauth, test_user
    ):
        """Claim with preauth-required tariff but no approved preauth fails."""
        sha_claim.claimed_amount = Decimal("75000.00")
        sha_claim.save(update_fields=["claimed_amount"])
        self._add_attachments(sha_claim, test_user)

        is_valid, errors = sha_claim.validate_for_submission()
        assert is_valid is False
        preauth_errors = [e for e in errors if "pre-authorization" in e.lower()]
        assert len(preauth_errors) == 1
        assert "SURG-001" in preauth_errors[0]

    def test_claim_with_approved_preauth_passes(
        self, sha_claim, claim_item_preauth, approved_preauth, test_user
    ):
        """Claim with preauth-required tariff and approved preauth passes."""
        sha_claim.claimed_amount = Decimal("75000.00")
        sha_claim.save(update_fields=["claimed_amount"])
        self._add_attachments(sha_claim, test_user)

        is_valid, errors = sha_claim.validate_for_submission()
        preauth_errors = [e for e in errors if "pre-authorization" in e.lower()]
        assert len(preauth_errors) == 0

    def test_claim_with_expired_preauth_fails(
        self, sha_claim, claim_item_preauth, approved_preauth, test_user
    ):
        """Claim with expired preauth fails validation."""
        approved_preauth.valid_until = date.today() - timedelta(days=1)
        approved_preauth.save(update_fields=["valid_until"])

        sha_claim.claimed_amount = Decimal("75000.00")
        sha_claim.save(update_fields=["claimed_amount"])
        self._add_attachments(sha_claim, test_user)

        is_valid, errors = sha_claim.validate_for_submission()
        assert is_valid is False
        preauth_errors = [e for e in errors if "expired" in e.lower()]
        assert len(preauth_errors) == 1

    def test_claim_with_denied_preauth_fails(
        self, sha_claim, claim_item_preauth, approved_preauth, test_user
    ):
        """Claim where preauth was denied fails."""
        approved_preauth.decision = PreauthRequest.PreauthDecision.DENIED
        approved_preauth.save(update_fields=["decision"])

        sha_claim.claimed_amount = Decimal("75000.00")
        sha_claim.save(update_fields=["claimed_amount"])
        self._add_attachments(sha_claim, test_user)

        is_valid, errors = sha_claim.validate_for_submission()
        assert is_valid is False
        preauth_errors = [e for e in errors if "pre-authorization" in e.lower()]
        assert len(preauth_errors) == 1


# ---------------------------------------------------------------------------
# Celery poll_preauth_statuses Task Tests
# ---------------------------------------------------------------------------


class TestPollPreauthStatusesTask:
    """Tests for the poll_preauth_statuses Celery task."""

    @patch("hmis.apps.billing.services.sha_preauth.SHAPreauthService.poll_status")
    def test_polls_pending_preauths(self, mock_poll, db, sha_claim, approved_preauth):
        """Task should poll all PENDING preauth requests."""
        from hmis.apps.billing.tasks import poll_preauth_statuses

        # Reset to PENDING for polling
        approved_preauth.decision = PreauthRequest.PreauthDecision.PENDING
        approved_preauth.save(update_fields=["decision"])

        result = poll_preauth_statuses()

        assert mock_poll.call_count == 1
        assert "Polled 1" in result
        assert "0 error(s)" in result

    @patch("hmis.apps.billing.services.sha_preauth.SHAPreauthService.poll_status")
    def test_skips_approved_preauths(self, mock_poll, db, approved_preauth):
        """Task should not poll already-approved preauths."""
        from hmis.apps.billing.tasks import poll_preauth_statuses

        result = poll_preauth_statuses()

        mock_poll.assert_not_called()
        assert "Polled 0" in result

    @patch("hmis.apps.billing.services.sha_preauth.SHAPreauthService.poll_status")
    def test_handles_poll_errors_gracefully(self, mock_poll, db, sha_claim, approved_preauth):
        """Task should handle errors gracefully and continue."""
        from hmis.apps.billing.tasks import poll_preauth_statuses

        approved_preauth.decision = PreauthRequest.PreauthDecision.PENDING
        approved_preauth.save(update_fields=["decision"])

        mock_poll.side_effect = Exception("DHA API timeout")

        result = poll_preauth_statuses()

        assert "0 error(s)" not in result
        assert "1 error(s)" in result


# ---------------------------------------------------------------------------
# UHC Scheme Detection in Eligibility Normalization
# ---------------------------------------------------------------------------


class TestUHCSchemeDetection:
    """Tests for UHC scheme handling in _normalize_response."""

    def _make_service(self):
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService.__new__(SHAEligibilityService)
        service.auth_mode = "ilm"
        return service

    def test_uhc_scheme_prioritized(self):
        """UHC scheme should be prioritized when no SHIF scheme exists."""
        service = self._make_service()
        response = {
            "memberCrNumber": "CR001",
            "schemes": [
                {
                    "schemeName": "UHC",
                    "coverage": {"status": "active"},
                    "memberType": "PRINCIPAL",
                },
            ],
        }

        result = service._normalize_response(response)
        assert result["primary_scheme_name"] == "UHC"
        assert result["eligible"] is True

    def test_shif_prioritized_over_uhc(self):
        """SHIF should be prioritized over UHC when both exist."""
        service = self._make_service()
        response = {
            "memberCrNumber": "CR001",
            "schemes": [
                {
                    "schemeName": "UHC",
                    "coverage": {"status": "active"},
                    "memberType": "PRINCIPAL",
                },
                {
                    "schemeName": "SHIF",
                    "coverage": {"status": "active"},
                    "memberType": "PRINCIPAL",
                },
            ],
        }

        result = service._normalize_response(response)
        assert result["primary_scheme_name"] == "SHIF"

    def test_uhc_case_insensitive_detection(self):
        """UHC detection should be case-insensitive."""
        service = self._make_service()
        response = {
            "memberCrNumber": "CR001",
            "schemes": [
                {
                    "schemeName": "uhc",
                    "coverage": {"status": "active"},
                    "memberType": "PRINCIPAL",
                },
            ],
        }

        result = service._normalize_response(response)
        assert result["primary_scheme_name"] == "uhc"  # Original casing preserved
        assert result["eligible"] is True

    def test_uhc_not_covered_falls_back(self):
        """UHC scheme with inactive coverage should still be used if only scheme."""
        service = self._make_service()
        response = {
            "memberCrNumber": "CR001",
            "schemes": [
                {
                    "schemeName": "UHC",
                    "coverage": {"status": "inactive"},
                    "memberType": "PRINCIPAL",
                },
            ],
        }

        result = service._normalize_response(response)
        assert result["primary_scheme_name"] == "UHC"
        assert result["eligible"] is False  # Not covered


# ---------------------------------------------------------------------------
# Facility-aware coverage (eligible_schemes + coverage_caveat)
# ---------------------------------------------------------------------------


class TestFacilityAwareCoverage:
    """Tests for evaluate_facility_coverage and check_eligibility facility kwarg."""

    def test_normalize_response_includes_eligible_schemes(self):
        """_normalize_response should expose uppercase eligible_schemes list."""
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService

        service = SHAEligibilityService.__new__(SHAEligibilityService)
        service.auth_mode = "ilm"

        response = {
            "memberCrNumber": "CR001",
            "schemes": [
                {"schemeName": "UHC", "coverage": {"status": "active"}, "memberType": "PRINCIPAL"},
                {
                    "schemeName": "shif",
                    "coverage": {"status": "inactive"},
                    "memberType": "PRINCIPAL",
                },
            ],
        }

        result = service._normalize_response(response)
        assert result["eligible_schemes"] == ["UHC"]

    def test_evaluate_facility_coverage_uhc_only_at_level_4_blocks(self):
        """UHC-only member at Level 4 hospital should be flagged with caveat."""
        from hmis.apps.billing.services.sha_eligibility import evaluate_facility_coverage

        info = evaluate_facility_coverage(["UHC"], "4")
        assert info["coverage_blocked"] is True
        assert info["usable_schemes"] == []
        assert "UHC" in info["coverage_caveat"]
        assert "Level 4" in info["coverage_caveat"]
        assert info["billable_schemes"] == ["PMF", "SHIF"]

    def test_evaluate_facility_coverage_shif_at_level_4_passes(self):
        """SHIF member at Level 4 should have no caveat."""
        from hmis.apps.billing.services.sha_eligibility import evaluate_facility_coverage

        info = evaluate_facility_coverage(["SHIF"], "4")
        assert info["coverage_blocked"] is False
        assert info["coverage_caveat"] == ""
        assert info["usable_schemes"] == ["SHIF"]

    def test_evaluate_facility_coverage_uhc_at_level_3_passes(self):
        """UHC at Level 3 health centre is billable \u2014 no caveat."""
        from hmis.apps.billing.services.sha_eligibility import evaluate_facility_coverage

        info = evaluate_facility_coverage(["UHC"], "3")
        assert info["coverage_blocked"] is False
        assert info["coverage_caveat"] == ""
        assert "UHC" in info["usable_schemes"]

    def test_evaluate_facility_coverage_uhc_at_level_2_passes(self):
        """UHC at Level 2 dispensary is billable."""
        from hmis.apps.billing.services.sha_eligibility import evaluate_facility_coverage

        info = evaluate_facility_coverage(["UHC"], "2")
        assert info["coverage_blocked"] is False
        assert info["usable_schemes"] == ["UHC"]

    def test_evaluate_facility_coverage_shif_at_level_2_blocks(self):
        """SHIF-only at a Level 2 dispensary should be blocked."""
        from hmis.apps.billing.services.sha_eligibility import evaluate_facility_coverage

        info = evaluate_facility_coverage(["SHIF"], "2")
        assert info["coverage_blocked"] is True
        assert info["billable_schemes"] == ["UHC"]
        assert "SHIF" in info["coverage_caveat"]

    def test_evaluate_facility_coverage_no_facility_level_returns_passthrough(self):
        """When facility level is unknown, no caveat is set."""
        from hmis.apps.billing.services.sha_eligibility import evaluate_facility_coverage

        info = evaluate_facility_coverage(["UHC"], None)
        assert info["coverage_blocked"] is False
        assert info["coverage_caveat"] == ""

    def test_evaluate_facility_coverage_empty_eligible_schemes(self):
        """No eligible schemes \u2014 nothing to caveat about."""
        from hmis.apps.billing.services.sha_eligibility import evaluate_facility_coverage

        info = evaluate_facility_coverage([], "4")
        assert info["coverage_blocked"] is False
        assert info["coverage_caveat"] == ""

    def test_evaluate_facility_coverage_case_insensitive(self):
        """Scheme name matching is case-insensitive."""
        from hmis.apps.billing.services.sha_eligibility import evaluate_facility_coverage

        info = evaluate_facility_coverage(["uhc"], "4")
        assert info["coverage_blocked"] is True


# ---------------------------------------------------------------------------
# package_claim Consent/Preauth Extensions
# ---------------------------------------------------------------------------


class TestPackageClaimExtensions:
    """Tests for consent token and preauth reference in FHIR Bundle."""

    def _make_claims_service(self):
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        service = SHAClaimsService.__new__(SHAClaimsService)
        service.fhir_base_url = "https://ts.kenya-hie.health"
        service.facility_code = "12345"
        service.facility_name = "Test Health Centre"
        service.facility_level = "L3"
        service.sha_api_url = "https://claims.sha.go.ke"
        return service

    @patch(
        "hmis.apps.billing.services.sha_claims.SHAClaimsService._get_active_consent",
        return_value=None,
    )
    @patch(
        "hmis.apps.billing.services.sha_claims.SHAClaimsService._get_approved_preauth",
        return_value=None,
    )
    def test_no_consent_or_preauth_no_extensions(self, mock_preauth, mock_consent, sha_claim):
        """Bundle should not include consent/preauth extensions when none exist."""
        service = self._make_claims_service()
        bundle = service.package_claim(sha_claim)

        claim_entry = next(e for e in bundle["entry"] if e["resource"]["resourceType"] == "Claim")
        extensions = claim_entry["resource"].get("extension", [])
        consent_ext = [e for e in extensions if "consent-token" in e.get("url", "")]
        preauth_ext = [e for e in extensions if "preauth-reference" in e.get("url", "")]
        assert len(consent_ext) == 0
        assert len(preauth_ext) == 0
        assert "preAuthRef" not in claim_entry["resource"]

    @patch(
        "hmis.apps.billing.services.sha_claims.SHAClaimsService._get_approved_preauth",
        return_value=None,
    )
    def test_consent_token_included_in_bundle(self, mock_preauth, sha_claim, validated_consent):
        """Bundle should include consent token extension when consent exists."""
        service = self._make_claims_service()
        with patch.object(service, "_get_active_consent", return_value=validated_consent):
            bundle = service.package_claim(sha_claim)

        claim_entry = next(e for e in bundle["entry"] if e["resource"]["resourceType"] == "Claim")
        extensions = claim_entry["resource"].get("extension", [])
        consent_ext = [e for e in extensions if "consent-token" in e.get("url", "")]
        assert len(consent_ext) == 1
        assert consent_ext[0]["valueString"] == "consent-flow-token-xyz"

    def test_preauth_reference_included_in_bundle(
        self, sha_claim, validated_consent, approved_preauth
    ):
        """Bundle should include preauth reference extension and preAuthRef."""
        service = self._make_claims_service()
        with patch.object(service, "_get_active_consent", return_value=validated_consent):
            with patch.object(service, "_get_approved_preauth", return_value=approved_preauth):
                bundle = service.package_claim(sha_claim)

        claim_entry = next(e for e in bundle["entry"] if e["resource"]["resourceType"] == "Claim")
        resource = claim_entry["resource"]
        extensions = resource.get("extension", [])
        preauth_ext = [e for e in extensions if "preauth-reference" in e.get("url", "")]
        assert len(preauth_ext) == 1
        assert preauth_ext[0]["valueString"] == "PA-FLOW-001"
        assert resource["preAuthRef"] == ["PA-FLOW-001"]


# ---------------------------------------------------------------------------
# SHAClaim ClaimFlow Field Tests
# ---------------------------------------------------------------------------


class TestClaimFlowField:
    """Tests for the claim_flow and is_emergency_claim fields on SHAClaim."""

    def test_claim_flow_default_empty(self, sha_claim):
        """claim_flow should default to empty string."""
        assert sha_claim.claim_flow == ""

    def test_is_emergency_claim_default_false(self, sha_claim):
        """is_emergency_claim should default to False."""
        assert sha_claim.is_emergency_claim is False

    def test_set_claim_flow_phc(self, sha_claim):
        """Should be able to set claim_flow to PHC."""
        sha_claim.claim_flow = SHAClaim.ClaimFlow.PHC
        sha_claim.save(update_fields=["claim_flow"])
        sha_claim.refresh_from_db()
        assert sha_claim.claim_flow == "phc"

    def test_set_claim_flow_shif(self, sha_claim):
        """Should be able to set claim_flow to SHIF."""
        sha_claim.claim_flow = SHAClaim.ClaimFlow.SHIF
        sha_claim.save(update_fields=["claim_flow"])
        sha_claim.refresh_from_db()
        assert sha_claim.claim_flow == "shif"

    def test_set_claim_flow_eccif(self, sha_claim):
        """Should be able to set claim_flow to ECCIF."""
        sha_claim.claim_flow = SHAClaim.ClaimFlow.ECCIF
        sha_claim.is_emergency_claim = True
        sha_claim.save(update_fields=["claim_flow", "is_emergency_claim"])
        sha_claim.refresh_from_db()
        assert sha_claim.claim_flow == "eccif"
        assert sha_claim.is_emergency_claim is True
