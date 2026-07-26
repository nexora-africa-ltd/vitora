from datetime import date
from decimal import Decimal

import pytest

from hmis.apps.billing.models import SHAClaim, SHAMember
from hmis.apps.billing.services.document_context import build_claim_document_context


@pytest.fixture
def sample_sha_member(sample_patient, test_user):
    return SHAMember.objects.create(
        patient=sample_patient,
        sha_number="SHA-5555555555",
        national_id="55555555",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        coverage_start_date=date.today(),
        coverage_end_date=date.today(),
        created_by=test_user,
    )


@pytest.mark.django_db
def test_document_context_uses_sha_member_number(
    sample_sha_member, sample_encounter, sample_facility, test_user
):
    claim = SHAClaim.objects.create(
        patient=sample_sha_member.patient,
        sha_member=sample_sha_member,
        encounter=sample_encounter,
        claim_type=SHAClaim.ClaimType.OUTPATIENT,
        status=SHAClaim.ClaimStatus.DRAFT,
        service_date=date.today(),
        primary_diagnosis_code="J06.9",
        primary_diagnosis_description="Acute upper respiratory infection",
        claimed_amount=Decimal("1000.00"),
        facility_code="FR-001",
        facility_level="L3",
        facility=sample_facility,
        created_by=test_user,
    )

    ctx = build_claim_document_context(claim)

    assert ctx.sha_member_number == sample_sha_member.sha_number


@pytest.mark.django_db
def test_document_context_extracts_scheme_and_fund_from_eligibility_response(
    sample_sha_member,
    sample_encounter,
    sample_facility,
    test_user,
):
    sample_sha_member.benefit_package = ""
    sample_sha_member.eligibility_response = {
        "fund_name": "Consolidated Health Fund",
        "schemes": [{"schemeName": "SHIF"}],
    }
    sample_sha_member.save(update_fields=["benefit_package", "eligibility_response", "updated_at"])

    claim = SHAClaim.objects.create(
        patient=sample_sha_member.patient,
        sha_member=sample_sha_member,
        encounter=sample_encounter,
        claim_type=SHAClaim.ClaimType.OUTPATIENT,
        claim_flow=SHAClaim.ClaimFlow.SHIF,
        status=SHAClaim.ClaimStatus.DRAFT,
        service_date=date.today(),
        primary_diagnosis_code="J06.9",
        primary_diagnosis_description="Acute upper respiratory infection",
        claimed_amount=Decimal("1000.00"),
        facility_code="FR-001",
        facility_level="L3",
        facility=sample_facility,
        created_by=test_user,
    )

    ctx = build_claim_document_context(claim)

    assert ctx.fund == "Consolidated Health Fund"
    assert ctx.scheme == "SHIF"
