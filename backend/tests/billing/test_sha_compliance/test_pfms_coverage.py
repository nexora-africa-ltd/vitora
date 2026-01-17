"""
Tests for PFMS (Public Finance Management System) Dual Coverage Support.

SHA Integration Checklist Item #13:
"If the patient is eligible for PFMS coverage then both SHA and PFMS coverage
must be mentioned in insurance section. Also an extension to be added to show
which claim item belongs to which coverage."

Reference: docs/sha-guides/claims-submission.md

Test Coverage:
- PFMS eligibility flag on SHAMember model
- PFMS scheme codes (CAT-PFMS-001)
- Dual coverage in insurance section
- Item-level coverage assignment
- Bundle structure with PFMS coverage
"""

from datetime import date
from decimal import Decimal

import pytest  # type: ignore
from django.core.exceptions import ValidationError

# Try to import required modules
try:
    from hmis.apps.billing.models import SHAClaim, SHAClaimItem, SHAMember, SHATariff

    HAS_SHA_MODELS = True
except ImportError:
    HAS_SHA_MODELS = False

try:
    from hmis.apps.billing.services.sha_claims import SHAClaimsService

    HAS_SHA_CLAIMS_SERVICE = True
except ImportError:
    HAS_SHA_CLAIMS_SERVICE = False


@pytest.fixture
def pfms_eligible_member(sha_test_patient, sha_test_user):
    """Create an SHA member with PFMS eligibility."""
    from hmis.apps.billing.models import SHAMember

    # Delete any existing SHA member for this patient
    SHAMember.objects.filter(patient=sha_test_patient).delete()

    member = SHAMember.objects.create(
        patient=sha_test_patient,
        sha_number="SHA-PFMS001234",
        national_id="12345678",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        is_pfms_eligible=True,
        pfms_category="vulnerable",
        created_by=sha_test_user,
    )
    return member


@pytest.fixture
def pfms_claim_with_items(
    pfms_eligible_member, sha_test_user, sha_test_encounter, sha_test_invoice, sha_tariff
):
    """Create a claim for a PFMS-eligible member with items."""
    from hmis.apps.billing.models import SHAClaim, SHAClaimItem

    claim = SHAClaim.objects.create(
        patient=pfms_eligible_member.patient,
        sha_member=pfms_eligible_member,
        encounter=sha_test_encounter,
        invoice=sha_test_invoice,
        claim_type="outpatient",
        service_date=date.today(),
        facility_code="FID-22-123456-0",
        facility_level="L4",
        primary_diagnosis_code="J06.9",
        primary_diagnosis_description="Acute upper respiratory infection",
        claimed_amount=Decimal("500.00"),
        status="draft",
        created_by=sha_test_user,
    )

    # Add claim item with PFMS coverage
    SHAClaimItem.objects.create(
        claim=claim,
        tariff=sha_tariff,
        description="General Consultation",
        quantity=1,
        unit_price=Decimal("500.00"),
        claimed_amount=Decimal("500.00"),
        coverage_type="pfms",  # Item covered by PFMS
    )

    return claim


@pytest.mark.django_db
class TestPFMSEligibilityModel:
    """Tests for PFMS eligibility fields on SHAMember model."""

    def test_sha_member_has_pfms_eligible_field(self, sample_patient, test_user):
        """
        SHA Requirement: SHAMember must track PFMS eligibility.

        PFMS covers vulnerable populations (indigent, elderly, disabled, orphans).
        """
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-TEST123456",
            national_id="12345678",
            membership_type=SHAMember.MembershipType.PRINCIPAL,
            created_by=test_user,
        )

        # Should have is_pfms_eligible field
        assert hasattr(member, "is_pfms_eligible")
        # Default should be False
        assert member.is_pfms_eligible is False

    def test_sha_member_pfms_category_field(self, sample_patient, test_user):
        """
        SHA Requirement: PFMS-eligible members should have a category.

        Categories: vulnerable, elderly, disabled, orphan, indigent
        """
        from hmis.apps.billing.models import SHAMember

        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number="SHA-TEST123457",
            national_id="12345679",
            membership_type=SHAMember.MembershipType.PRINCIPAL,
            is_pfms_eligible=True,
            pfms_category="vulnerable",
            created_by=test_user,
        )

        assert member.is_pfms_eligible is True
        assert member.pfms_category == "vulnerable"

    def test_pfms_category_required_when_pfms_eligible(self, sample_patient, test_user):
        """PFMS category should be required when is_pfms_eligible is True."""
        from hmis.apps.billing.models import SHAMember

        with pytest.raises(ValidationError) as exc_info:
            SHAMember.objects.create(
                patient=sample_patient,
                sha_number="SHA-TEST123458",
                national_id="12345680",
                membership_type=SHAMember.MembershipType.PRINCIPAL,
                is_pfms_eligible=True,
                pfms_category="",  # Empty category
                created_by=test_user,
            )

        assert "pfms_category" in str(exc_info.value)

    def test_pfms_category_choices_valid(self, sample_patient, test_user):
        """PFMS category must be a valid choice."""
        from hmis.apps.billing.models import SHAMember

        valid_categories = ["vulnerable", "elderly", "disabled", "orphan", "indigent"]

        for idx, category in enumerate(valid_categories):
            member = SHAMember.objects.create(
                patient=sample_patient,
                sha_number=f"SHA-PFMS{idx:06d}",
                national_id=f"1234{idx:04d}",
                membership_type=SHAMember.MembershipType.PRINCIPAL,
                is_pfms_eligible=True,
                pfms_category=category,
                created_by=test_user,
            )
            assert member.pfms_category == category
            member.delete()


@pytest.mark.django_db
class TestPFMSClaimItemCoverage:
    """Tests for item-level PFMS coverage assignment."""

    def test_claim_item_has_coverage_type_field(self, sha_claim_with_items):
        """
        SHA Requirement: Each claim item must indicate which coverage applies.

        Reference: claims-submission.md item #13
        """

        item = sha_claim_with_items.items.first()
        assert hasattr(item, "coverage_type")

    def test_claim_item_coverage_type_choices(self, sha_claim_with_items):
        """Coverage type must be sha, pfms, or both."""

        item = sha_claim_with_items.items.first()

        # Default should be 'sha'
        assert item.coverage_type in ["sha", "pfms", "both"]

    def test_pfms_claim_items_use_pfms_coverage(self, pfms_claim_with_items):
        """Items for PFMS-eligible members can use PFMS coverage."""
        item = pfms_claim_with_items.items.first()
        assert item.coverage_type == "pfms"


@pytest.mark.django_db
@pytest.mark.skipif(not HAS_SHA_CLAIMS_SERVICE, reason="SHAClaimsService not available")
class TestPFMSDualCoverageBundle:
    """Tests for FHIR bundle with dual SHA+PFMS coverage."""

    def test_pfms_bundle_has_two_coverage_resources(self, pfms_claim_with_items):
        """
        SHA Requirement: PFMS-eligible claims must have both coverages.

        Reference: claims-submission.md item #13
        "both SHA and PFMS coverage must be mentioned in insurance section"
        """
        service = SHAClaimsService()
        bundle = service.package_claim(pfms_claim_with_items)

        # Find all Coverage resources
        coverage_resources = [
            entry.get("resource")
            for entry in bundle.get("entry", [])
            if entry.get("resource", {}).get("resourceType") == "Coverage"
        ]

        assert (
            len(coverage_resources) == 2
        ), "PFMS-eligible claims must have both SHA and PFMS Coverage resources"

    def test_pfms_coverage_has_correct_scheme_code(self, pfms_claim_with_items):
        """
        SHA Requirement: PFMS coverage must have CAT-PFMS-001 scheme code.
        """
        service = SHAClaimsService()
        bundle = service.package_claim(pfms_claim_with_items)

        # Find PFMS Coverage resource
        coverage_resources = [
            entry.get("resource")
            for entry in bundle.get("entry", [])
            if entry.get("resource", {}).get("resourceType") == "Coverage"
        ]

        scheme_codes = []
        for coverage in coverage_resources:
            for ext in coverage.get("extension", []):
                if "schemeCategoryCode" in ext.get("url", ""):
                    scheme_codes.append(ext.get("valueString"))

        assert "CAT-SHA-001" in scheme_codes, "Must have SHA coverage"
        assert "CAT-PFMS-001" in scheme_codes, "Must have PFMS coverage"

    def test_pfms_claim_has_two_insurance_entries(self, pfms_claim_with_items):
        """
        SHA Requirement: Claim must reference both coverages in insurance array.
        """
        service = SHAClaimsService()
        bundle = service.package_claim(pfms_claim_with_items)

        # Find Claim resource
        claim_resource = None
        for entry in bundle.get("entry", []):
            if entry.get("resource", {}).get("resourceType") == "Claim":
                claim_resource = entry.get("resource")
                break

        assert claim_resource is not None, "Bundle must contain Claim resource"

        insurance = claim_resource.get("insurance", [])
        assert (
            len(insurance) == 2
        ), "PFMS-eligible claims must have 2 insurance entries (SHA + PFMS)"

    def test_claim_items_have_coverage_extension(self, pfms_claim_with_items):
        """
        SHA Requirement: Claim items must have extension showing coverage.

        Reference: claims-submission.md item #13
        "an extension to be added to show which claim item belongs to which coverage"
        """
        service = SHAClaimsService()
        bundle = service.package_claim(pfms_claim_with_items)

        # Find Claim resource
        claim_resource = None
        for entry in bundle.get("entry", []):
            if entry.get("resource", {}).get("resourceType") == "Claim":
                claim_resource = entry.get("resource")
                break

        assert claim_resource is not None

        items = claim_resource.get("item", [])
        assert len(items) > 0, "Claim must have items"

        # Each item should have coverage extension
        for item in items:
            extensions = item.get("extension", [])
            coverage_ext = [e for e in extensions if "Coverage" in e.get("url", "")]
            assert (
                len(coverage_ext) > 0
            ), f"Item {item.get('sequence')} must have coverage extension"

    def test_non_pfms_member_has_single_coverage(self, sha_claim_with_items):
        """Non-PFMS members should have only SHA coverage."""
        service = SHAClaimsService()
        bundle = service.package_claim(sha_claim_with_items)

        # Find all Coverage resources
        coverage_resources = [
            entry.get("resource")
            for entry in bundle.get("entry", [])
            if entry.get("resource", {}).get("resourceType") == "Coverage"
        ]

        assert (
            len(coverage_resources) == 1
        ), "Non-PFMS members should have only one Coverage resource"


@pytest.mark.django_db
class TestPFMSSchemeCategories:
    """Tests for PFMS scheme category codes."""

    PFMS_SCHEME_CODES = {
        "vulnerable": "CAT-PFMS-001",
        "elderly": "CAT-PFMS-002",
        "disabled": "CAT-PFMS-003",
        "orphan": "CAT-PFMS-004",
        "indigent": "CAT-PFMS-005",
    }

    def test_pfms_category_to_scheme_code_mapping(self):
        """Each PFMS category should map to a scheme code."""
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        service = SHAClaimsService()

        for category, expected_code in self.PFMS_SCHEME_CODES.items():
            code = service.get_pfms_scheme_code(category)
            assert code == expected_code, f"Category '{category}' should map to '{expected_code}'"

    def test_default_pfms_scheme_code(self):
        """Unknown categories should default to CAT-PFMS-001."""
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        service = SHAClaimsService()
        code = service.get_pfms_scheme_code("unknown")
        assert code == "CAT-PFMS-001"
