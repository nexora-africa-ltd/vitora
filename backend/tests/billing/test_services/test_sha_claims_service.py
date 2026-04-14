"""
TDD Red Phase Tests for SHAClaimsService.

This module contains failing tests for the SHAClaimsService class
that handles SHA claims creation, validation, packaging, and submission.

Following TDD guidelines from docs/tdd-guidelines.md:
1. RED: Write failing tests that define expected behavior (THIS FILE)
2. GREEN: Write minimal code to make tests pass
3. REFACTOR: Improve code while keeping tests green

Test Coverage (15 tests):
- [ ] Test `create_claim_from_encounter()` creates claim and items
- [ ] Test claim type auto-detection for OPD
- [ ] Test claim type auto-detection for IPD
- [ ] Test claim type auto-detection for Emergency
- [ ] Test patient without SHA membership raises error
- [ ] Test `validate_claim()` delegation to model
- [ ] Test `package_claim()` returns FHIR bundle
- [ ] Test FHIR Claim resource structure
- [ ] Test FHIR Patient resource included
- [ ] Test FHIR Coverage resource included
- [ ] Test `submit_claim()` success flow
- [ ] Test `submit_claim()` updates claim status
- [ ] Test `submit_claim()` logs audit entry
- [ ] Test `submit_claim()` handles API error
- [ ] Test attachments included in submission

Reference: docs/sprint-2.1-2.2-sha-claims-integration-deliverables.md § Services & Business Logic
"""

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest  # type: ignore
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone

from hmis.apps.billing.models import (
    Invoice,
    InvoiceItem,
    Service,
    ServiceCategory,
    SHAClaim,
    SHAClaimAttachment,
    SHAClaimItem,
    SHAMember,
    SHATariff,
)
from hmis.apps.core.models import AuditLog

# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def claims_service_category(db):
    """Create a service category for claims tests."""
    return ServiceCategory.objects.create(
        name="Consultation", code="CONS", description="Consultation services", display_order=1
    )


@pytest.fixture
def claims_service(db, claims_service_category, test_user):
    """Create a service for claims tests."""
    return Service.objects.create(
        category=claims_service_category,
        code="CONS-GEN",
        name="General Consultation",
        description="General doctor consultation",
        unit_price=Decimal("500.00"),
        sha_code="SHA-CONS-001",
        created_by=test_user,
    )


@pytest.fixture
def claims_tariff(db, claims_service):
    """Create a SHA tariff for claims tests."""
    return SHATariff.objects.create(
        code="SHA-CONS-001",
        name="General Consultation",
        category=SHATariff.TariffCategory.CONSULTATION,
        facility_level=SHATariff.TariffLevel.LEVEL_3,
        sha_amount=Decimal("450.00"),
        effective_date=date.today() - timedelta(days=365),
        is_active=True,
        internal_service=claims_service,  # Link to service for auto-discovery
    )


@pytest.fixture
def claims_patient(db, sample_county, sample_sub_county, sample_organization):
    """Create a patient for claims tests."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Claims",
        last_name="Patient",
        date_of_birth="1985-06-15",
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
        organization=sample_organization,
    )


@pytest.fixture
def claims_sha_member(db, claims_patient, test_user):
    """Create a SHA member for claims tests."""
    return SHAMember.objects.create(
        patient=claims_patient,
        sha_number="SHA-CLAIMS-001",
        national_id="11223344",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        coverage_start_date=date.today() - timedelta(days=365),
        coverage_end_date=date.today() + timedelta(days=365),
        eligibility_valid_until=date.today() + timedelta(days=30),
        created_by=test_user,
    )


@pytest.fixture
def claims_patient_no_sha(db, sample_county, sample_sub_county, sample_organization):
    """Create a patient without SHA membership for error tests."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="NoSHA",
        last_name="Patient",
        date_of_birth="1990-01-01",
        gender="F",
        county=sample_county,
        sub_county=sample_sub_county,
        organization=sample_organization,
    )


@pytest.fixture
def claims_icd10_code(db):
    """Create an ICD-10 code for claims tests."""
    from hmis.apps.encounters.models import ICD10Code

    return ICD10Code.objects.create(
        code="J00",
        description="Acute nasopharyngitis [common cold]",
        category="Diseases of the respiratory system",
        chapter=10,
    )


@pytest.fixture
def claims_encounter_opd(db, claims_patient, claims_icd10_code, test_user, sample_facility):
    """Create an OPD encounter for claims tests with diagnosis."""
    from hmis.apps.encounters.models import Diagnosis, Encounter

    encounter = Encounter.objects.create(
        patient=claims_patient,
        encounter_type="OPD",
        encounter_date=date.today(),
        chief_complaint="General checkup",
        facility=sample_facility,
    )
    # Add primary diagnosis
    Diagnosis.objects.create(
        encounter=encounter,
        icd10_code=claims_icd10_code,
        diagnosis_type="PRIMARY",
        is_confirmed=True,
    )
    return encounter


@pytest.fixture
def claims_encounter_ipd(db, claims_patient, claims_icd10_code, test_user, sample_facility):
    """Create an IPD encounter for claims tests with diagnosis."""
    from hmis.apps.encounters.models import Diagnosis, Encounter

    encounter = Encounter.objects.create(
        patient=claims_patient,
        encounter_type="IPD",
        encounter_date=date.today(),
        chief_complaint="Admitted for observation",
        facility=sample_facility,
    )
    # Set admission_date for IPD claims
    encounter.admission_date = date.today()
    encounter.save()
    # Add primary diagnosis
    Diagnosis.objects.create(
        encounter=encounter,
        icd10_code=claims_icd10_code,
        diagnosis_type="PRIMARY",
        is_confirmed=True,
    )
    return encounter


@pytest.fixture
def claims_encounter_emergency(db, claims_patient, claims_icd10_code, test_user, sample_facility):
    """Create an EMERGENCY encounter for claims tests with diagnosis."""
    from hmis.apps.encounters.models import Diagnosis, Encounter

    encounter = Encounter.objects.create(
        patient=claims_patient,
        encounter_type="EMERGENCY",
        encounter_date=date.today(),
        chief_complaint="Emergency care needed",
        facility=sample_facility,
    )
    # Add primary diagnosis
    Diagnosis.objects.create(
        encounter=encounter,
        icd10_code=claims_icd10_code,
        diagnosis_type="PRIMARY",
        is_confirmed=True,
    )
    return encounter


@pytest.fixture
def claims_encounter_no_sha(
    db, claims_patient_no_sha, claims_icd10_code, test_user, sample_facility
):
    """Create an encounter for patient without SHA."""
    from hmis.apps.encounters.models import Diagnosis, Encounter

    encounter = Encounter.objects.create(
        patient=claims_patient_no_sha,
        encounter_type="OPD",
        encounter_date=date.today(),
        chief_complaint="Regular visit",
        facility=sample_facility,
    )
    # Add primary diagnosis
    Diagnosis.objects.create(
        encounter=encounter,
        icd10_code=claims_icd10_code,
        diagnosis_type="PRIMARY",
        is_confirmed=True,
    )
    return encounter


@pytest.fixture
def claims_invoice(
    db, claims_patient, claims_encounter_opd, test_user, sample_facility, sample_organization
):
    """Create an invoice for claims tests."""
    return Invoice.objects.create(
        patient=claims_patient,
        encounter=claims_encounter_opd,
        invoice_date=date.today(),
        due_date=date.today() + timedelta(days=30),
        status=Invoice.Status.PENDING,
        payment_type=Invoice.PaymentType.INSURANCE,
        created_by=test_user,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def claims_invoice_item(db, claims_invoice, claims_service):
    """Create an invoice item for claims tests."""
    return InvoiceItem.objects.create(
        invoice=claims_invoice,
        service=claims_service,
        description=claims_service.name,
        quantity=Decimal("1"),
        unit_price=claims_service.unit_price,
    )


@pytest.fixture
def valid_claim(
    db,
    claims_patient,
    claims_sha_member,
    claims_encounter_opd,
    claims_invoice,
    claims_invoice_item,
    claims_tariff,
    claims_service,
    test_user,
):
    """Create a valid claim with items and attachments for submission tests."""
    claim = SHAClaim.objects.create(
        patient=claims_patient,
        sha_member=claims_sha_member,
        encounter=claims_encounter_opd,
        invoice=claims_invoice,
        claim_type=SHAClaim.ClaimType.OUTPATIENT,
        service_date=date.today(),
        primary_diagnosis_code="J00",
        primary_diagnosis_description="Common cold",
        facility_code="TEST-001",
        facility_level=SHATariff.TariffLevel.LEVEL_3,
        created_by=test_user,
    )

    # Add claim item
    SHAClaimItem.objects.create(
        claim=claim,
        tariff=claims_tariff,
        service=claims_service,
        description="General Consultation",
        quantity=Decimal("1"),
        unit_price=Decimal("450.00"),
    )

    # Add required attachments
    SHAClaimAttachment.objects.create(
        claim=claim,
        attachment_type=SHAClaimAttachment.AttachmentType.CLINICAL_NOTES,
        name="Clinical Notes",
        file="sha_claims/test/clinical_notes.pdf",
        mime_type="application/pdf",
        original_filename="clinical_notes.pdf",
        uploaded_by=test_user,
    )
    SHAClaimAttachment.objects.create(
        claim=claim,
        attachment_type=SHAClaimAttachment.AttachmentType.INVOICE,
        name="Invoice",
        file="sha_claims/test/invoice.pdf",
        mime_type="application/pdf",
        original_filename="invoice.pdf",
        uploaded_by=test_user,
    )

    return claim


@pytest.fixture
def clinic_visit_for_sha_claim_context(
    db, claims_patient, test_user, sample_facility, sample_organization
):
    """Create a clinic visit to attach to an encounter for clinic-context tests."""

    from hmis.apps.clinics.models import Clinic, ClinicSession, ClinicVisit

    clinic = Clinic.objects.create(
        name="Eye Clinic",
        clinic_type="EYE",
        code="EYE-CLINIC",
        status="ACTIVE",
        facility=sample_facility,
        organization=sample_organization,
    )
    session = ClinicSession.objects.create(
        clinic=clinic,
        session_date=timezone.localdate(),
        status="OPEN",
        opened_at=timezone.now(),
        opened_by=test_user,
        facility=sample_facility,
        organization=sample_organization,
    )
    visit = ClinicVisit.objects.create(
        session=session,
        patient=claims_patient,
        status="COMPLETED",
        priority="STANDARD",
        visit_type="NEW",
        source="DIRECT",
        chief_complaint="Eye pain",
        registered_by=test_user,
        facility=sample_facility,
        organization=sample_organization,
    )
    return visit


@pytest.fixture
def mock_sha_submission_response():
    """Mock successful SHA API submission response."""
    return {
        "success": True,
        "claim_reference": "SHA-REF-2026-001234",
        "status": "acknowledged",
        "message": "Claim received successfully",
        "received_at": timezone.now().isoformat(),
    }


# ============================================================================
# Test Classes
# ============================================================================


@pytest.mark.django_db
class TestSHAClaimsServiceCreateClaim:
    """Tests for SHAClaimsService.create_claim_from_encounter() method."""

    def test_create_claim_from_encounter_creates_claim_and_items(
        self,
        claims_encounter_opd,
        claims_invoice,
        claims_invoice_item,
        claims_sha_member,
        claims_tariff,
        test_user,
    ):
        """
        Test that create_claim_from_encounter() creates claim and items.

        Given: An encounter with invoice and items
        When: create_claim_from_encounter() is called
        Then: SHAClaim is created with SHAClaimItem for each invoice item
        """
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        service = SHAClaimsService()

        claim = service.create_claim_from_encounter(
            encounter=claims_encounter_opd,
            invoice=claims_invoice,
            user=test_user,
        )

        # Verify claim created
        assert isinstance(claim, SHAClaim)
        assert claim.patient == claims_encounter_opd.patient
        assert claim.sha_member == claims_sha_member
        assert claim.encounter == claims_encounter_opd
        assert claim.invoice == claims_invoice
        assert claim.service_date == claims_encounter_opd.encounter_date
        assert claim.facility_code == settings.FACILITY_MFL_CODE
        assert claim.facility_level == settings.FACILITY_LEVEL
        assert claim.created_by == test_user

        # Verify claim items created from invoice items
        assert claim.items.count() == 1
        claim_item = claim.items.first()
        assert claim_item.description == claims_invoice_item.description
        assert claim_item.quantity == claims_invoice_item.quantity

    def test_claim_type_auto_detection_for_opd(
        self, claims_encounter_opd, claims_invoice, claims_sha_member, test_user
    ):
        """
        Test that OPD encounters result in OUTPATIENT claim type.

        Given: An OPD encounter
        When: create_claim_from_encounter() is called without explicit claim_type
        Then: Claim type is set to OUTPATIENT
        """
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        service = SHAClaimsService()

        claim = service.create_claim_from_encounter(
            encounter=claims_encounter_opd,
            invoice=claims_invoice,
            user=test_user,
        )

        assert claim.claim_type == SHAClaim.ClaimType.OUTPATIENT

    def test_claim_type_auto_detection_for_ipd(
        self, claims_encounter_ipd, claims_invoice, claims_sha_member, test_user
    ):
        """
        Test that IPD encounters result in INPATIENT claim type.

        Given: An IPD encounter
        When: create_claim_from_encounter() is called without explicit claim_type
        Then: Claim type is set to INPATIENT
        """
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        # Update invoice to use IPD encounter
        claims_invoice.encounter = claims_encounter_ipd
        claims_invoice.save()

        service = SHAClaimsService()

        claim = service.create_claim_from_encounter(
            encounter=claims_encounter_ipd,
            invoice=claims_invoice,
            user=test_user,
        )

        assert claim.claim_type == SHAClaim.ClaimType.INPATIENT

    def test_claim_type_auto_detection_for_emergency(
        self, claims_encounter_emergency, claims_invoice, claims_sha_member, test_user
    ):
        """
        Test that EMERGENCY encounters result in EMERGENCY claim type.

        Given: An EMERGENCY encounter
        When: create_claim_from_encounter() is called without explicit claim_type
        Then: Claim type is set to EMERGENCY
        """
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        # Update invoice to use emergency encounter
        claims_invoice.encounter = claims_encounter_emergency
        claims_invoice.save()

        service = SHAClaimsService()

        claim = service.create_claim_from_encounter(
            encounter=claims_encounter_emergency,
            invoice=claims_invoice,
            user=test_user,
        )

        assert claim.claim_type == SHAClaim.ClaimType.EMERGENCY

    def test_patient_without_sha_membership_raises_error(
        self, claims_encounter_no_sha, claims_invoice, test_user
    ):
        """
        Test that creating claim for patient without SHA raises ValidationError.

        Given: An encounter for patient without SHA membership
        When: create_claim_from_encounter() is called
        Then: ValidationError is raised with appropriate message
        """
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        # Update invoice patient to match encounter
        claims_invoice.patient = claims_encounter_no_sha.patient
        claims_invoice.encounter = claims_encounter_no_sha
        claims_invoice.save()

        service = SHAClaimsService()

        with pytest.raises(ValidationError) as exc_info:
            service.create_claim_from_encounter(
                encounter=claims_encounter_no_sha,
                invoice=claims_invoice,
                user=test_user,
            )

        assert "SHA membership" in str(exc_info.value)


@pytest.mark.django_db
class TestSHAClaimsServiceValidation:
    """Tests for SHAClaimsService.validate_claim() method."""

    def test_validate_claim_delegation_to_model(self, valid_claim):
        """
        Test that validate_claim() delegates to model's validate_for_submission().

        Given: A valid claim
        When: validate_claim() is called
        Then: Returns result from model's validate_for_submission()
        """
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        service = SHAClaimsService()

        is_valid, errors = service.validate_claim(valid_claim)

        # Should return tuple (bool, list)
        assert isinstance(is_valid, bool)
        assert isinstance(errors, list)

        # Valid claim should pass validation
        assert is_valid is True
        assert len(errors) == 0


@pytest.mark.django_db
class TestSHAClaimsServicePackaging:
    """Tests for SHAClaimsService.package_claim() method."""

    def test_package_claim_returns_fhir_bundle(self, valid_claim):
        """
        Test that package_claim() returns SHA-compliant FHIR bundle.

        Given: A valid claim
        When: package_claim() is called
        Then: Returns dict with FHIR Bundle structure (type: 'message' per SHA spec)

        Reference: docs/sha-guides/claims.md - Bundle must have type 'message'
        """
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        service = SHAClaimsService()

        bundle = service.package_claim(valid_claim)

        assert isinstance(bundle, dict)
        assert bundle["resourceType"] == "Bundle"
        # SHA requires 'message' bundle type (not 'collection')
        assert bundle["type"] == "message"
        assert "id" in bundle  # SHA requires bundle ID
        assert "meta" in bundle  # SHA requires meta.profile
        assert "timestamp" in bundle
        assert "entry" in bundle
        assert isinstance(bundle["entry"], list)
        # SHA bundle order: Organization, Coverage, Patient, Claim (4 entries)
        assert len(bundle["entry"]) >= 4

    def test_fhir_claim_resource_structure(self, valid_claim):
        """
        Test that FHIR Claim resource has correct SHA-compliant structure.

        Given: A valid claim
        When: package_claim() is called
        Then: Bundle contains properly structured Claim resource per SHA spec

        Reference: docs/sha-guides/claims.md - Claim Resource section
        """

        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        service = SHAClaimsService()

        bundle = service.package_claim(valid_claim)

        # Find Claim resource in bundle
        claim_entry = next(
            (e for e in bundle["entry"] if e["resource"].get("resourceType") == "Claim"), None
        )

        assert claim_entry is not None
        # SHA requires fullUrl in entry
        assert "fullUrl" in claim_entry

        claim_resource = claim_entry["resource"]

        # Verify required FHIR Claim fields (SHA-compliant)
        assert claim_resource["resourceType"] == "Claim"
        assert "id" in claim_resource  # SHA requires id
        assert "identifier" in claim_resource
        # Identifier uses UUID format (bundle GUID)
        assert claim_resource["identifier"][0]["value"] == claim_resource["id"]
        assert claim_resource["status"] == "active"
        assert "type" in claim_resource
        # SHA requires claim type coding
        assert claim_resource["type"]["coding"][0]["code"] == "institutional"
        assert claim_resource["use"] == "claim"
        assert "patient" in claim_resource
        # SHA requires patient reference with identifier
        assert "identifier" in claim_resource["patient"]
        assert "provider" in claim_resource
        # SHA requires billablePeriod
        assert "billablePeriod" in claim_resource
        # SHA requires insurance reference
        assert "insurance" in claim_resource
        assert "diagnosis" in claim_resource
        assert "item" in claim_resource
        assert "total" in claim_resource
        assert claim_resource["total"]["currency"] == "KES"

    def test_fhir_patient_resource_included(self, valid_claim):
        """
        Test that FHIR Patient resource is included in bundle.

        Given: A valid claim
        When: package_claim() is called
        Then: Bundle contains Patient resource
        """
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        service = SHAClaimsService()

        bundle = service.package_claim(valid_claim)

        # Find Patient resource in bundle
        patient_entry = next(
            (e for e in bundle["entry"] if e["resource"].get("resourceType") == "Patient"), None
        )

        assert patient_entry is not None
        # SHA requires fullUrl
        assert "fullUrl" in patient_entry
        patient_resource = patient_entry["resource"]
        assert patient_resource["resourceType"] == "Patient"
        # SHA requires patient ID to be SHA CR Number
        assert "id" in patient_resource
        # SHA requires identifier with shanumber system
        assert "identifier" in patient_resource
        assert patient_resource["identifier"][0]["system"].endswith("/identifier/shanumber")

    def test_fhir_coverage_resource_included(self, valid_claim):
        """
        Test that FHIR Coverage resource is included in bundle.

        Given: A valid claim
        When: package_claim() is called
        Then: Bundle contains Coverage resource with SHA scheme extensions

        Reference: docs/sha-guides/claims.md - Coverage Resource section
        """
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        service = SHAClaimsService()

        bundle = service.package_claim(valid_claim)

        # Find Coverage resource in bundle
        coverage_entry = next(
            (e for e in bundle["entry"] if e["resource"].get("resourceType") == "Coverage"), None
        )

        assert coverage_entry is not None
        # SHA requires fullUrl
        assert "fullUrl" in coverage_entry
        coverage_resource = coverage_entry["resource"]
        assert coverage_resource["resourceType"] == "Coverage"
        # SHA requires scheme extensions (flat format per spec)
        assert "extension" in coverage_resource

        # Find schemeCategoryCode extension with CAT-SHA-001
        # Per SHA spec: flat extension with url ending in 'schemeCategoryCode'
        scheme_code_ext = next(
            (
                ext
                for ext in coverage_resource["extension"]
                if "schemeCategoryCode" in ext.get("url", "")
            ),
            None,
        )
        assert scheme_code_ext is not None, (
            "Coverage must have schemeCategoryCode extension per SHA spec"
        )
        assert scheme_code_ext.get("valueString") == "CAT-SHA-001", (
            "schemeCategoryCode must be CAT-SHA-001"
        )

        # Find schemeCategoryName extension
        scheme_name_ext = next(
            (
                ext
                for ext in coverage_resource["extension"]
                if "schemeCategoryName" in ext.get("url", "")
            ),
            None,
        )
        assert scheme_name_ext is not None, (
            "Coverage must have schemeCategoryName extension per SHA spec"
        )
        assert scheme_name_ext.get("valueString") == "SOCIAL HEALTH AUTHORITY", (
            "schemeCategoryName must be 'SOCIAL HEALTH AUTHORITY'"
        )

    def test_fhir_organization_resource_included(self, valid_claim):
        """
        Test that FHIR Organization resource is included in bundle.

        Given: A valid claim
        When: package_claim() is called
        Then: Bundle contains Organization resource for the healthcare facility

        Reference: docs/sha-guides/claims.md - Organization Resource section
        """
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        service = SHAClaimsService()

        bundle = service.package_claim(valid_claim)

        # Find Organization resource in bundle
        org_entry = next(
            (e for e in bundle["entry"] if e["resource"].get("resourceType") == "Organization"),
            None,
        )

        assert org_entry is not None
        # SHA requires fullUrl
        assert "fullUrl" in org_entry
        org_resource = org_entry["resource"]
        assert org_resource["resourceType"] == "Organization"
        # SHA requires organization ID
        assert "id" in org_resource
        # SHA requires facility name
        assert "name" in org_resource
        # SHA requires identifier with facility code
        assert "identifier" in org_resource

    def test_claim_includes_clinic_context_when_encounter_has_clinic_visit(
        self, valid_claim, clinic_visit_for_sha_claim_context
    ):
        """Claim bundle should include clinic context (service delivery point) when available."""

        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        # Attach clinic visit context to encounter
        encounter = valid_claim.encounter
        assert encounter is not None
        encounter.clinic_visit = clinic_visit_for_sha_claim_context
        encounter.save(update_fields=["clinic_visit"])

        service = SHAClaimsService()
        bundle = service.package_claim(valid_claim)

        claim_entry = next(
            (e for e in bundle["entry"] if e["resource"].get("resourceType") == "Claim"),
            None,
        )
        assert claim_entry is not None
        claim_resource = claim_entry["resource"]

        clinic = clinic_visit_for_sha_claim_context.session.clinic

        # Facility/service point should reference the clinic as a Location
        assert "facility" in claim_resource
        assert claim_resource["facility"]["reference"] == (
            f"{service.fhir_base_url}/fhir/Location/{clinic.code}"
        )
        assert claim_resource["facility"].get("display") == clinic.name

        # Include clinic code as a distinct identifier (do not change the primary UUID identifier)
        clinic_code_identifier = next(
            (
                ident
                for ident in claim_resource.get("identifier", [])
                if ident.get("system", "").endswith("/identifier/clinic-code")
            ),
            None,
        )
        assert clinic_code_identifier is not None
        assert clinic_code_identifier.get("value") == clinic.code

        # Include clinic type for routing/reporting context
        clinic_type_ext = next(
            (
                ext
                for ext in claim_resource.get("extension", [])
                if ext.get("url") == "https://vitora.health/fhir/StructureDefinition/clinic-type"
            ),
            None,
        )
        assert clinic_type_ext is not None
        assert clinic_type_ext.get("valueString") == clinic.clinic_type

    def test_claim_without_clinic_context_still_packages(self, valid_claim):
        """Packaging must remain valid when encounter has no clinic visit context."""

        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        service = SHAClaimsService()
        bundle = service.package_claim(valid_claim)

        claim_entry = next(
            (e for e in bundle["entry"] if e["resource"].get("resourceType") == "Claim"),
            None,
        )
        assert claim_entry is not None
        claim_resource = claim_entry["resource"]

        assert "facility" not in claim_resource


@pytest.mark.django_db
class TestSHAClaimsServiceSubmission:
    """Tests for SHAClaimsService.submit_claim() method (offline-first)."""

    def test_submit_claim_success_flow(self, valid_claim, test_user, mock_sha_submission_response):
        """
        Test successful claim submission flow (offline-first queuing).

        Given: A valid claim ready for submission
        When: submit_claim() is called
        Then: Claim is queued for offline submission
        """
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        service = SHAClaimsService()

        response = service.submit_claim(valid_claim, test_user)

        # Offline-first implementation queues claims
        assert response["status"] == "queued"
        assert response["message"] == "Claim queued for submission when online"
        assert "queue_entry_id" in response
        assert response["claim_number"] == valid_claim.claim_number

    def test_submit_claim_updates_claim_status(
        self, valid_claim, test_user, mock_sha_submission_response
    ):
        """
        Test that submit_claim() updates claim status to PENDING_SUBMISSION.

        Given: A valid claim
        When: submit_claim() is called
        Then: Claim status is PENDING_SUBMISSION (queued for later)
        """
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        service = SHAClaimsService()

        service.submit_claim(valid_claim, test_user)

        # Refresh from database
        valid_claim.refresh_from_db()

        # Offline-first: claim is queued, not submitted directly
        assert valid_claim.status == SHAClaim.ClaimStatus.PENDING_SUBMISSION
        assert "queued" in valid_claim.submission_response
        assert valid_claim.submission_response["queued"] is True
        assert "queue_entry_id" in valid_claim.submission_response

    def test_submit_claim_logs_audit_entry(
        self, valid_claim, test_user, mock_sha_submission_response
    ):
        """
        Test that submit_claim() creates audit log entry for queuing.

        Given: A valid claim
        When: submit_claim() is called
        Then: AuditLog entry is created for sha_claim_queued action
        """
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        service = SHAClaimsService()

        # Check for queued action (offline-first implementation)
        initial_audit_count = AuditLog.objects.filter(action="sha_claim_queued").count()

        service.submit_claim(valid_claim, test_user)

        # Check audit log was created for queuing
        final_audit_count = AuditLog.objects.filter(action="sha_claim_queued").count()
        assert final_audit_count == initial_audit_count + 1

        # Verify audit log content
        audit_log = AuditLog.objects.filter(action="sha_claim_queued").latest("timestamp")
        assert audit_log.user == test_user
        assert audit_log.resource_type == "SHAClaim"
        assert audit_log.resource_id == valid_claim.id
        assert "queue_entry_id" in audit_log.details

    def test_submit_claim_handles_validation_error(self, valid_claim, test_user):
        """
        Test that submit_claim() handles validation errors.

        Given: A valid claim with validation issues in packaging
        When: Packaging fails
        Then: ValidationError is raised
        """
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        service = SHAClaimsService()

        # Mock package_claim to raise validation error
        with patch.object(
            service, "package_claim", side_effect=ValidationError("Invalid claim data")
        ):
            with pytest.raises(ValidationError) as exc_info:
                service.submit_claim(valid_claim, test_user)

        assert "Invalid claim data" in str(exc_info.value)

    def test_claim_queued_creates_sync_queue_entry(self, valid_claim, test_user):
        """
        Test that submit_claim() creates sync queue entry for offline processing.

        Given: A valid claim
        When: submit_claim() is called
        Then: SyncQueue entry is created with PENDING status
        """
        from hmis.apps.billing.services.sha_claims import SHAClaimsService
        from hmis.apps.core.models import SyncQueue

        service = SHAClaimsService()

        initial_queue_count = SyncQueue.objects.filter(model_name="SHAClaimSubmission").count()

        service.submit_claim(valid_claim, test_user)

        # Verify queue entry was created
        final_queue_count = SyncQueue.objects.filter(model_name="SHAClaimSubmission").count()
        assert final_queue_count == initial_queue_count + 1

        # Verify queue entry data
        queue_entry = SyncQueue.objects.filter(model_name="SHAClaimSubmission").latest("created_at")
        assert queue_entry.status == "PENDING"
        assert queue_entry.data.get("claim_id") == valid_claim.id


@pytest.mark.django_db
class TestSHAClaimsServiceConfiguration:
    """Tests for SHAClaimsService configuration."""

    def test_service_uses_settings_for_configuration(self):
        """
        Test that service reads configuration from Django settings.

        Given: Django settings with facility configuration
        When: SHAClaimsService is instantiated
        Then: Service uses settings values
        """
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        service = SHAClaimsService()

        assert hasattr(service, "api_base_url")
        assert hasattr(service, "api_key")
        assert hasattr(service, "facility_code")
        assert hasattr(service, "facility_level")
        assert hasattr(service, "auth_service")

        assert service.api_base_url == settings.SHA_API_BASE_URL.rstrip("/")
        assert service.api_key == settings.SHA_API_KEY
        assert service.facility_code == settings.FACILITY_MFL_CODE
        assert service.facility_level == settings.FACILITY_LEVEL
