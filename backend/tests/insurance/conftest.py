"""Fixtures for insurance tests."""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore

from hmis.apps.insurance.models import (
    InsuranceClaim,
    InsuranceClaimItem,
    InsurancePlan,
    InsurancePreauth,
    InsuranceProvider,
    InsuranceProviderConfig,
    InsuranceRemittance,
    InsuranceRemittanceLine,
    PatientInsurance,
    PayerTariff,
)


@pytest.fixture
def admin_client(api_client, test_user, test_staff_profile):
    """Authenticated API client with admin (is_staff) privileges.

    Reuses the same test_user & staff profile, promoting to is_staff
    so IsAdminUser passes while tenant scoping still works.
    """
    test_user.is_staff = True
    test_user.save(update_fields=["is_staff"])
    api_client.force_authenticate(user=test_user)
    return api_client


@pytest.fixture
def insurance_provider(db, sample_organization):
    """Create a sample InsuranceProvider."""
    return InsuranceProvider.objects.create(
        organization=sample_organization,
        name="Jubilee Health Insurance",
        code="JUBILEE",
        provider_type=InsuranceProvider.ProviderType.PRIVATE,
        status=InsuranceProvider.Status.ACTIVE,
        contact_email="claims@jubilee.co.ke",
        contact_phone="+254700000000",
    )


@pytest.fixture
def second_provider(db, sample_organization):
    """Create a second InsuranceProvider for multi-provider tests."""
    return InsuranceProvider.objects.create(
        organization=sample_organization,
        name="AAR Healthcare",
        code="AAR",
        provider_type=InsuranceProvider.ProviderType.PRIVATE,
        status=InsuranceProvider.Status.ACTIVE,
    )


@pytest.fixture
def insurance_plan(db, insurance_provider, sample_organization):
    """Create a sample InsurancePlan."""
    return InsurancePlan.objects.create(
        organization=sample_organization,
        provider=insurance_provider,
        name="Gold Plan",
        code="GOLD",
        plan_type=InsurancePlan.PlanType.INDIVIDUAL,
        coverage_type=InsurancePlan.CoverageType.COMPREHENSIVE,
        default_copay_percent=Decimal("20.00"),
        annual_limit=Decimal("500000.00"),
        preauth_required=False,
        status=InsurancePlan.Status.ACTIVE,
        effective_from=date.today() - timedelta(days=365),
        effective_to=date.today() + timedelta(days=365),
    )


@pytest.fixture
def patient_insurance(db, sample_patient, insurance_plan, insurance_provider, sample_organization):
    """Create a sample PatientInsurance enrollment."""
    return PatientInsurance.objects.create(
        organization=sample_organization,
        patient=sample_patient,
        plan=insurance_plan,
        provider=insurance_provider,
        member_number="JUB-001234",
        member_type=PatientInsurance.MemberType.PRINCIPAL,
        status=PatientInsurance.Status.ACTIVE,
        valid_from=date.today() - timedelta(days=180),
        valid_to=date.today() + timedelta(days=180),
        is_primary=True,
    )


@pytest.fixture
def insurance_claim(
    db,
    patient_insurance,
    insurance_provider,
    sample_patient,
    sample_facility,
    sample_organization,
):
    """Create a sample InsuranceClaim."""
    return InsuranceClaim.objects.create(
        facility=sample_facility,
        organization=sample_organization,
        patient_insurance=patient_insurance,
        provider=insurance_provider,
        patient=sample_patient,
        claim_type=InsuranceClaim.ClaimType.OUTPATIENT,
        total_amount=Decimal("5000.00"),
        diagnosis_codes=["J06.9"],
    )


@pytest.fixture
def insurance_preauth(
    db,
    patient_insurance,
    insurance_provider,
    sample_patient,
    sample_facility,
    sample_organization,
):
    """Create a sample InsurancePreauth."""
    return InsurancePreauth.objects.create(
        facility=sample_facility,
        organization=sample_organization,
        patient_insurance=patient_insurance,
        provider=insurance_provider,
        patient=sample_patient,
        preauth_type=InsurancePreauth.PreauthType.ADMISSION,
        estimated_cost=Decimal("50000.00"),
        diagnosis_codes=["K35.8"],
        requested_services=[
            {"description": "Appendectomy", "code": "47600", "quantity": 1, "estimated_cost": 50000}
        ],
    )


@pytest.fixture
def provider_config(db, insurance_provider, sample_facility, sample_organization):
    """Create a sample InsuranceProviderConfig."""
    return InsuranceProviderConfig.objects.create(
        facility=sample_facility,
        organization=sample_organization,
        provider=insurance_provider,
        contract_number="CTR-2025-001",
        contract_start=date.today() - timedelta(days=365),
        contract_end=date.today() + timedelta(days=365),
        accreditation_status=InsuranceProviderConfig.AccreditationStatus.ACCREDITED,
        submission_format=InsuranceProviderConfig.SubmissionFormat.MANUAL,
    )


@pytest.fixture
def payer_tariff(db, insurance_provider, sample_organization):
    """Create a sample PayerTariff."""
    return PayerTariff.objects.create(
        organization=sample_organization,
        provider=insurance_provider,
        service_code="CONS-001",
        payer_code="JUB-CONS-001",
        payer_description="General Consultation",
        tariff_amount=Decimal("1500.00"),
        facility_charge=Decimal("2000.00"),
        effective_from=date.today() - timedelta(days=180),
    )


@pytest.fixture
def insurance_remittance(db, insurance_provider, sample_facility, sample_organization):
    """Create a sample InsuranceRemittance."""
    return InsuranceRemittance.objects.create(
        facility=sample_facility,
        organization=sample_organization,
        provider=insurance_provider,
        remittance_number="REM-2025-001",
        remittance_date=date.today(),
        total_amount=Decimal("100000.00"),
    )
