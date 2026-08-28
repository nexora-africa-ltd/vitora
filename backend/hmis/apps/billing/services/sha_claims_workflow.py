# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: F405
"""Billing sha claims workflow for Vitora HMIS.

What this file is for:
- Implement sha claims workflow logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.billing.services.sha_claims_shared import *  # noqa: F403


class SHAClaimsWorkflowMixin:
    def __init__(self, facility=None):
        """Initialize SHAClaimsService.

        Args:
            facility: Optional Facility instance. When provided, resolves
                      the DHA Facility Registry code (fr_code) from:
                      1. facility.billing_config.sha_facility_fr_code
                      2. facility.dha_fr_code
                      3. settings.SHA_FACILITY_FR_CODE (global fallback)
        """
        self.api_base_url = settings.SHA_API_BASE_URL.rstrip("/")
        self.auth_service = legacy_sha_claims_module().SHAAuthService()

        # Resolve DHA Facility Registry code (fr_code) — used in FHIR bundles,
        # claim submissions, and DHA API requests. This is NOT the MFL code.
        if facility is not None:
            fr_code = resolve_fr_code(facility, allow_settings_fallback=False).value
            self.facility_code = (
                fr_code
                or getattr(settings, "SHA_FACILITY_FR_CODE", "")
                or getattr(settings, "FACILITY_MFL_CODE", "")
            )
        else:
            self.facility_code = getattr(settings, "SHA_FACILITY_FR_CODE", "") or getattr(
                settings, "FACILITY_MFL_CODE", ""
            )

        self.facility_level = settings.FACILITY_LEVEL
        self.facility_name = getattr(settings, "FACILITY_NAME", "Healthcare Facility")

        # SHA MIS FHIR Base URL (different from API base URL)
        # UAT: https://qa-mis.apeiro-digital.com
        # Production: https://mis.apeiro-digital.com
        self.fhir_base_url = getattr(
            settings, "SHA_FHIR_BASE_URL", "https://qa-mis.apeiro-digital.com"
        ).rstrip("/")

        # Backward compatible attributes for tests
        self.api_key = settings.SHA_API_KEY

        # Get endpoints from settings
        self.claims_submit_endpoint = settings.SHA_ENDPOINTS.get(
            "claims_submit", "/v1/shr-med/bundle"
        )
        self.claims_status_endpoint = settings.SHA_ENDPOINTS.get(
            "claims_status", "/v1/shr-med/claim-status"
        )

    def create_claim_from_encounter(
        self, encounter, invoice, user, claim_type: str = None, admission=None
    ) -> SHAClaim:
        """
        Create a new claim from an encounter and invoice.

        Args:
            encounter: The encounter to claim for
            invoice: Associated invoice
            user: User creating the claim
            claim_type: Override claim type (auto-detected if None)
            admission: Optional Admission instance (used for IPD diagnosis and dates)

        Returns:
            New SHAClaim instance

        Raises:
            ValidationError: If patient does not have SHA membership

        Example:
            >>> claim = service.create_claim_from_encounter(
            ...     encounter=encounter,
            ...     invoice=invoice,
            ...     user=request.user,
            ...     admission=admission,
            ... )
        """
        patient = encounter.patient

        # Verify SHA membership
        if not hasattr(patient, "sha_member"):
            raise ValidationError("Patient does not have SHA membership")

        sha_member = patient.sha_member

        # Determine claim type
        if not claim_type:
            claim_type = self._determine_claim_type(encounter)

        # Extract diagnosis info from encounter if available
        # Get diagnosis from encounter's diagnoses relation if available
        primary_diagnosis_code = ""
        primary_diagnosis_description = ""
        secondary_diagnosis_codes = []

        # Check if encounter has diagnoses relation
        if hasattr(encounter, "diagnoses") and encounter.diagnoses.exists():
            # Get primary diagnosis first
            primary = encounter.diagnoses.filter(diagnosis_type="PRIMARY").first()
            if primary:
                if primary.icd10_code:
                    primary_diagnosis_code = primary.icd10_code.code
                    primary_diagnosis_description = primary.icd10_code.description
                elif primary.free_text_diagnosis:
                    primary_diagnosis_code = "UNSPECIFIED"
                    primary_diagnosis_description = primary.free_text_diagnosis

            # Get secondary diagnoses
            secondaries = encounter.diagnoses.filter(diagnosis_type="SECONDARY")
            for diag in secondaries:
                if diag.icd10_code:
                    secondary_diagnosis_codes.append(diag.icd10_code.code)

        # Fall back to direct attributes if no diagnoses relation
        if not primary_diagnosis_code:
            primary_diagnosis_code = getattr(encounter, "primary_diagnosis_code", "") or ""
            primary_diagnosis_description = (
                getattr(encounter, "primary_diagnosis_description", "") or ""
            )

        if not secondary_diagnosis_codes:
            secondary_diagnosis_codes = getattr(encounter, "secondary_diagnosis_codes", []) or []

        # For IPD claims, fall back to admission/discharge diagnoses if encounter has none
        if claim_type == SHAClaim.ClaimType.INPATIENT or (
            not claim_type and encounter.encounter_type == "IPD"
        ):
            if not primary_diagnosis_code:
                # Use provided admission or look it up
                if admission is None:
                    admission_obj = getattr(encounter, "admission", None)
                    if admission_obj is None and hasattr(encounter, "patient"):
                        from hmis.apps.inpatient.models import Admission

                        admission_obj = (
                            Admission.objects.filter(patient=encounter.patient)
                            .order_by("-admission_date")
                            .first()
                        )
                else:
                    admission_obj = admission

                if admission_obj is not None:
                    # At admission time: use admitting diagnosis
                    if getattr(admission_obj, "admitting_diagnosis", None):
                        primary_diagnosis_code = admission_obj.admitting_diagnosis or ""
                        primary_diagnosis_description = (
                            getattr(admission_obj, "admitting_diagnosis_text", "") or ""
                        )

                    # At discharge time (or if admitting dx missing): try discharge diagnoses
                    if not primary_diagnosis_code:
                        discharge = getattr(admission_obj, "discharge", None)
                        if discharge is not None and hasattr(discharge, "diagnoses"):
                            d_primary = discharge.diagnoses.filter(role="PRIMARY").first()
                            if d_primary:
                                primary_diagnosis_code = d_primary.code or ""
                                primary_diagnosis_description = d_primary.description or ""
                            if not secondary_diagnosis_codes:
                                d_secondaries = discharge.diagnoses.filter(
                                    role__in=["SECONDARY", "COMPLICATION"]
                                )
                                for dd in d_secondaries:
                                    if dd.code:
                                        secondary_diagnosis_codes.append(dd.code)

        # Build claim data - always include required fields even if empty (model validation will catch)
        # Resolve DHA Facility Registry code (fr_code) from the encounter's facility.
        # Priority: billing_config.sha_facility_fr_code > dha_fr_code > self.facility_code (init fallback)
        encounter_facility = getattr(encounter, "facility", None)
        if encounter_facility is not None:
            fr_code = resolve_fr_code(encounter_facility, allow_settings_fallback=False).value
            facility_code = fr_code or self.facility_code
        else:
            facility_code = self.facility_code
        facility_level = getattr(encounter_facility, "level", None) or self.facility_level
        # Normalize to "L{n}" format expected by SHATariff.TariffLevel choices
        if (
            facility_level
            and isinstance(facility_level, (str, int))
            and not str(facility_level).upper().startswith("L")
        ):
            facility_level = f"L{facility_level}"

        # Determine the DHA HIE claim flow based on encounter, facility, and scheme
        facility = getattr(encounter, "facility", None)
        eligibility_data = getattr(sha_member, "eligibility_response", None) or None
        claim_flow = (
            determine_flow(encounter, facility, eligibility_data=eligibility_data)
            if facility
            else SHAClaim.ClaimFlow.PHC
        )

        claim_data = {
            "patient": patient,
            "sha_member": sha_member,
            "encounter": encounter,
            "invoice": invoice,
            "claim_type": claim_type,
            "claim_flow": claim_flow,
            "is_emergency_claim": claim_flow == SHAClaim.ClaimFlow.ECCIF,
            "service_date": encounter.encounter_date,
            "facility_code": facility_code,
            "facility_level": facility_level,
            "created_by": user,
        }

        # Add diagnosis info
        if primary_diagnosis_code:
            claim_data["primary_diagnosis_code"] = primary_diagnosis_code
            claim_data["primary_diagnosis_description"] = primary_diagnosis_description
        if secondary_diagnosis_codes:
            claim_data["secondary_diagnosis_codes"] = secondary_diagnosis_codes

        # For IPD claims, extract admission date from Admission object
        if claim_type == SHAClaim.ClaimType.INPATIENT:
            if admission is not None:
                admission_dt = getattr(admission, "admission_date", None)
                if admission_dt:
                    claim_data["admission_date"] = (
                        admission_dt.date() if hasattr(admission_dt, "date") else admission_dt
                    )
            else:
                # Fallback: try encounter's admission reverse relation
                admission_rel = getattr(encounter, "admission", None)
                if admission_rel is not None:
                    admission_dt = getattr(admission_rel, "admission_date", None)
                    if admission_dt:
                        claim_data["admission_date"] = (
                            admission_dt.date() if hasattr(admission_dt, "date") else admission_dt
                        )
                # Fallback: try encounter's own admission_date field
                if "admission_date" not in claim_data:
                    admission_dt = getattr(encounter, "admission_date", None)
                    if admission_dt:
                        claim_data["admission_date"] = (
                            admission_dt.date() if hasattr(admission_dt, "date") else admission_dt
                        )

        # Create claim
        claim = SHAClaim.objects.create(**claim_data)

        # Create claim items from invoice items
        for invoice_item in invoice.items.all():
            SHAClaimItem.create_from_invoice_item(claim, invoice_item)

        return claim

    def update_claim_on_discharge(self, claim: SHAClaim, discharge) -> SHAClaim:
        """Update an existing inpatient SHA claim with discharge data.

        Called at discharge time to populate discharge_date, final diagnoses,
        and refresh claim items from the finalized invoice.

        Args:
            claim: The existing SHAClaim (created at admission time).
            discharge: The Discharge instance with discharge_date and diagnoses.

        Returns:
            Updated SHAClaim instance.
        """
        # Set discharge date
        discharge_dt = discharge.discharge_date
        if discharge_dt:
            claim.discharge_date = (
                discharge_dt.date() if hasattr(discharge_dt, "date") else discharge_dt
            )

        # Update diagnoses from discharge records (overrides admitting diagnosis if present)
        if hasattr(discharge, "diagnoses"):
            primary = discharge.diagnoses.filter(role="PRIMARY").first()
            if primary:
                claim.primary_diagnosis_code = primary.code or ""
                claim.primary_diagnosis_description = primary.description or ""

            secondaries = discharge.diagnoses.filter(role__in=["SECONDARY", "COMPLICATION"])
            secondary_codes = [dd.code for dd in secondaries if dd.code]
            if secondary_codes:
                claim.secondary_diagnosis_codes = secondary_codes

        # Refresh claim items from updated invoice
        if claim.invoice:
            claim.claim_items.all().delete()
            for invoice_item in claim.invoice.items.all():
                SHAClaimItem.create_from_invoice_item(claim, invoice_item)

        # Recalculate claimed amount
        from decimal import Decimal

        claim.claimed_amount = sum(
            item.claimed_amount or Decimal("0") for item in claim.claim_items.all()
        )

        claim.save()
        return claim

    def _determine_claim_type(self, encounter) -> str:
        """
        Auto-determine claim type from encounter.

        Args:
            encounter: Encounter to determine type from

        Returns:
            ClaimType value string
        """
        if encounter.encounter_type == "IPD":
            return SHAClaim.ClaimType.INPATIENT
        elif encounter.encounter_type == "EMERGENCY":
            return SHAClaim.ClaimType.EMERGENCY
        return SHAClaim.ClaimType.OUTPATIENT

    def validate_claim(self, claim: SHAClaim, user=None) -> tuple[bool, list[str]]:
        """
        Comprehensive claim validation.

        Validates using local claim checks and, when eligibility is the only
        blocker, performs a forced eligibility refresh before returning.

        Args:
            claim: SHAClaim to validate
            user: Optional user context for remote eligibility refresh

        Returns:
            Tuple of (is_valid, list_of_errors)
        """
        is_valid, errors = claim.validate_for_submission()
        if is_valid:
            return is_valid, errors

        has_member_error = any(str(err).startswith("Member not eligible:") for err in errors)
        if not has_member_error or not getattr(claim, "sha_member", None):
            return is_valid, errors

        refresh_user = (
            user or getattr(claim, "created_by", None) or getattr(claim, "submitted_by", None)
        )
        if refresh_user is None:
            return is_valid, errors

        try:
            legacy_sha_claims_module().SHAEligibilityService().check_eligibility(
                claim.sha_member,
                refresh_user,
                force_refresh=True,
                facility=getattr(claim, "facility", None),
            )
            claim.sha_member.refresh_from_db()
            return claim.validate_for_submission()
        except (
            AttributeError,
            TypeError,
            RuntimeError,
            OSError,
            AssertionError,
        ) as exc:  # pragma: no cover - defensive fallback
            logger.warning(
                "Eligibility refresh failed during claim validation for claim %s: %s",
                claim.id,
                exc,
            )
            return is_valid, errors
