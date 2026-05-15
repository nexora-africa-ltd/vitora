"""Tests for insurance models — creation, validation, properties."""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.core.exceptions import ValidationError

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


# ===================================================================
# InsuranceProvider
# ===================================================================
class TestInsuranceProvider:
    def test_create_provider(self, insurance_provider):
        assert insurance_provider.pk is not None
        assert insurance_provider.name == "Jubilee Health Insurance"
        assert insurance_provider.code == "JUBILEE"
        assert insurance_provider.status == InsuranceProvider.Status.ACTIVE

    def test_str(self, insurance_provider):
        assert str(insurance_provider) == "Jubilee Health Insurance"

    def test_unique_code_per_org(self, insurance_provider, sample_organization):
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            InsuranceProvider.objects.create(
                organization=sample_organization,
                name="Duplicate",
                code="JUBILEE",
            )


# ===================================================================
# InsurancePlan
# ===================================================================
class TestInsurancePlan:
    def test_create_plan(self, insurance_plan):
        assert insurance_plan.pk is not None
        assert insurance_plan.name == "Gold Plan"
        assert insurance_plan.default_copay_percent == Decimal("20.00")

    def test_str(self, insurance_plan):
        assert "Gold Plan" in str(insurance_plan)

    def test_validation_dates(self, insurance_provider, sample_organization):
        plan = InsurancePlan(
            organization=sample_organization,
            provider=insurance_provider,
            name="Bad Plan",
            code="BAD",
            effective_from=date.today(),
            effective_to=date.today() - timedelta(days=10),
        )
        with pytest.raises(ValidationError):
            plan.clean()

    def test_copay_validation(self, insurance_provider, sample_organization):
        plan = InsurancePlan(
            organization=sample_organization,
            provider=insurance_provider,
            name="Bad Plan",
            code="BAD2",
            default_copay_percent=Decimal("110.00"),
        )
        with pytest.raises(ValidationError):
            plan.clean()


# ===================================================================
# PatientInsurance
# ===================================================================
class TestPatientInsurance:
    def test_create_enrollment(self, patient_insurance):
        assert patient_insurance.pk is not None
        assert patient_insurance.member_number == "JUB-001234"
        assert patient_insurance.is_primary is True

    def test_is_valid_active(self, patient_insurance):
        assert patient_insurance.is_valid is True

    def test_is_valid_expired(self, patient_insurance):
        patient_insurance.valid_to = date.today() - timedelta(days=1)
        assert patient_insurance.is_valid is False

    def test_copay_percent_default(self, patient_insurance):
        assert patient_insurance.copay_percent == Decimal("20.00")

    def test_copay_percent_override(self, patient_insurance):
        patient_insurance.copay_override = Decimal("10.00")
        assert patient_insurance.copay_percent == Decimal("10.00")

    def test_days_until_expiry(self, patient_insurance):
        assert patient_insurance.days_until_expiry > 0

    def test_auto_sets_provider(self, sample_patient, insurance_plan, sample_organization):
        enrollment = PatientInsurance.objects.create(
            organization=sample_organization,
            patient=sample_patient,
            plan=insurance_plan,
            member_number="AUTO-001",
            valid_from=date.today(),
            valid_to=date.today() + timedelta(days=30),
        )
        assert enrollment.provider_id == insurance_plan.provider_id

    def test_date_validation(
        self, sample_patient, insurance_plan, sample_organization, insurance_provider
    ):
        enrollment = PatientInsurance(
            organization=sample_organization,
            patient=sample_patient,
            plan=insurance_plan,
            provider=insurance_provider,
            member_number="BAD-001",
            valid_from=date.today(),
            valid_to=date.today() - timedelta(days=1),
        )
        with pytest.raises(ValidationError):
            enrollment.clean()


# ===================================================================
# InsuranceProviderConfig
# ===================================================================
class TestInsuranceProviderConfig:
    def test_create_config(self, provider_config):
        assert provider_config.pk is not None
        assert provider_config.contract_number == "CTR-2025-001"

    def test_is_contract_active(self, provider_config):
        assert provider_config.is_contract_active is True

    def test_is_contract_inactive(self, provider_config):
        provider_config.contract_end = date.today() - timedelta(days=1)
        assert provider_config.is_contract_active is False


# ===================================================================
# InsuranceClaim
# ===================================================================
class TestInsuranceClaim:
    def test_create_claim(self, insurance_claim):
        assert insurance_claim.pk is not None
        assert insurance_claim.claim_number.startswith("IC-")
        assert insurance_claim.status == InsuranceClaim.Status.DRAFT

    def test_str(self, insurance_claim):
        assert "IC-" in str(insurance_claim)

    def test_auto_generates_claim_number(self, insurance_claim):
        assert len(insurance_claim.claim_number) > 0

    def test_is_overdue_false_when_not_submitted(self, insurance_claim):
        assert insurance_claim.is_overdue is False

    def test_is_appealable(self, insurance_claim):
        assert insurance_claim.is_appealable is False
        insurance_claim.status = InsuranceClaim.Status.REJECTED
        assert insurance_claim.is_appealable is True


# ===================================================================
# InsuranceClaim — State Transitions
# ===================================================================
class TestInsuranceClaimWorkflow:
    def test_submit(self, insurance_claim):
        insurance_claim.submit()
        assert insurance_claim.status == InsuranceClaim.Status.SUBMITTED
        assert insurance_claim.submission_date is not None

    def test_submit_invalid_status(self, insurance_claim):
        insurance_claim.status = InsuranceClaim.Status.PAID
        insurance_claim.save(update_fields=["status"])
        with pytest.raises(ValidationError):
            insurance_claim.submit()

    def test_acknowledge(self, insurance_claim):
        insurance_claim.submit()
        insurance_claim.acknowledge()
        assert insurance_claim.status == InsuranceClaim.Status.ACKNOWLEDGED

    def test_approve(self, insurance_claim):
        insurance_claim.submit()
        insurance_claim.approve(approved_amount=Decimal("4500.00"))
        assert insurance_claim.status == InsuranceClaim.Status.APPROVED
        assert insurance_claim.approved_amount == Decimal("4500.00")

    def test_partially_approve(self, insurance_claim):
        insurance_claim.submit()
        insurance_claim.partially_approve(approved_amount=Decimal("3000.00"))
        assert insurance_claim.status == InsuranceClaim.Status.PARTIALLY_APPROVED

    def test_reject(self, insurance_claim):
        insurance_claim.submit()
        insurance_claim.reject(reason="Insufficient documentation")
        assert insurance_claim.status == InsuranceClaim.Status.REJECTED
        assert "Insufficient" in insurance_claim.rejection_reason

    def test_query_and_respond(self, insurance_claim):
        insurance_claim.submit()
        insurance_claim.query_claim(details="Please provide lab results")
        assert insurance_claim.status == InsuranceClaim.Status.QUERY

        insurance_claim.respond_to_query(response="Lab results attached")
        assert insurance_claim.status == InsuranceClaim.Status.SUBMITTED
        assert insurance_claim.query_response == "Lab results attached"

    def test_mark_paid_full(self, insurance_claim):
        insurance_claim.submit()
        insurance_claim.approve(approved_amount=Decimal("5000.00"))
        insurance_claim.mark_paid(paid_amount=Decimal("5000.00"))
        assert insurance_claim.status == InsuranceClaim.Status.PAID

    def test_mark_paid_partial(self, insurance_claim):
        insurance_claim.submit()
        insurance_claim.approve(approved_amount=Decimal("5000.00"))
        insurance_claim.mark_paid(paid_amount=Decimal("3000.00"))
        assert insurance_claim.status == InsuranceClaim.Status.PARTIALLY_PAID

    def test_appeal(self, insurance_claim):
        insurance_claim.submit()
        insurance_claim.reject(reason="Denied")
        insurance_claim.appeal(notes="Requesting review")
        assert insurance_claim.status == InsuranceClaim.Status.APPEALED

    def test_appeal_invalid_status(self, insurance_claim):
        with pytest.raises(ValidationError):
            insurance_claim.appeal()

    def test_cancel(self, insurance_claim):
        insurance_claim.cancel(reason="Patient request")
        assert insurance_claim.status == InsuranceClaim.Status.CANCELLED

    def test_cancel_paid_fails(self, insurance_claim):
        insurance_claim.status = InsuranceClaim.Status.PAID
        insurance_claim.save(update_fields=["status"])
        with pytest.raises(ValidationError):
            insurance_claim.cancel()

    def test_write_off(self, insurance_claim):
        insurance_claim.write_off(reason="Uncollectable")
        assert insurance_claim.status == InsuranceClaim.Status.WRITTEN_OFF


# ===================================================================
# InsuranceClaimItem
# ===================================================================
class TestInsuranceClaimItem:
    def test_create_item(self, insurance_claim):
        item = InsuranceClaimItem.objects.create(
            claim=insurance_claim,
            service_description="General Consultation",
            service_code="CONS-001",
            quantity=1,
            unit_price=Decimal("2000.00"),
            claimed_amount=Decimal("2000.00"),
        )
        assert item.pk is not None
        assert item.status == InsuranceClaimItem.Status.PENDING


# ===================================================================
# InsurancePreauth — State Transitions
# ===================================================================
class TestInsurancePreauthWorkflow:
    def test_create(self, insurance_preauth):
        assert insurance_preauth.pk is not None
        assert insurance_preauth.preauth_number.startswith("IPA-")
        assert insurance_preauth.status == InsurancePreauth.Status.DRAFT

    def test_submit(self, insurance_preauth):
        insurance_preauth.submit()
        assert insurance_preauth.status == InsurancePreauth.Status.SUBMITTED

    def test_approve(self, insurance_preauth):
        insurance_preauth.submit()
        insurance_preauth.approve(approved_amount=Decimal("45000.00"), validity_days=14)
        assert insurance_preauth.status == InsurancePreauth.Status.APPROVED
        assert insurance_preauth.approved_amount == Decimal("45000.00")
        assert insurance_preauth.validity_period_days == 14
        assert insurance_preauth.expires_at is not None

    def test_deny(self, insurance_preauth):
        insurance_preauth.submit()
        insurance_preauth.deny(reason="Not medically necessary")
        assert insurance_preauth.status == InsurancePreauth.Status.DENIED

    def test_cancel(self, insurance_preauth):
        insurance_preauth.cancel(reason="Patient request")
        assert insurance_preauth.status == InsurancePreauth.Status.CANCELLED

    def test_expire(self, insurance_preauth):
        insurance_preauth.submit()
        insurance_preauth.approve(approved_amount=Decimal("45000.00"))
        insurance_preauth.expire()
        assert insurance_preauth.status == InsurancePreauth.Status.EXPIRED

    def test_is_active(self, insurance_preauth):
        insurance_preauth.submit()
        insurance_preauth.approve(approved_amount=Decimal("45000.00"))
        assert insurance_preauth.is_active is True

    def test_is_expired_property(self, insurance_preauth):
        insurance_preauth.submit()
        insurance_preauth.approve(approved_amount=Decimal("45000.00"), validity_days=0)
        # Manually set to past
        from django.utils import timezone

        insurance_preauth.expires_at = timezone.now() - timedelta(hours=1)
        insurance_preauth.save(update_fields=["expires_at"])
        assert insurance_preauth.is_expired is True
        assert insurance_preauth.is_active is False


# ===================================================================
# InsuranceRemittance
# ===================================================================
class TestInsuranceRemittance:
    def test_create(self, insurance_remittance):
        assert insurance_remittance.pk is not None
        assert insurance_remittance.status == InsuranceRemittance.Status.RECEIVED

    def test_reconcile_full(self, insurance_remittance, insurance_claim):
        insurance_claim.submit()
        insurance_claim.approve(approved_amount=Decimal("5000.00"))
        line = InsuranceRemittanceLine.objects.create(
            remittance=insurance_remittance,
            claim=insurance_claim,
            claim_number=insurance_claim.claim_number,
            paid_amount=Decimal("100000.00"),
            net_amount=Decimal("100000.00"),
        )
        insurance_remittance.reconcile()
        assert insurance_remittance.status == InsuranceRemittance.Status.RECONCILED
        assert insurance_remittance.reconciled_amount == Decimal("100000.00")

    def test_reconcile_partial(self, insurance_remittance):
        InsuranceRemittanceLine.objects.create(
            remittance=insurance_remittance,
            claim_number="IC-EXTERNAL-001",
            paid_amount=Decimal("30000.00"),
            net_amount=Decimal("30000.00"),
        )
        insurance_remittance.reconcile()
        assert insurance_remittance.status == InsuranceRemittance.Status.PARTIAL


# ===================================================================
# PayerTariff
# ===================================================================
class TestPayerTariff:
    def test_create(self, payer_tariff):
        assert payer_tariff.pk is not None
        assert payer_tariff.tariff_amount == Decimal("1500.00")

    def test_is_active(self, payer_tariff):
        assert payer_tariff.is_active is True

    def test_is_active_expired(self, payer_tariff):
        payer_tariff.effective_to = date.today() - timedelta(days=1)
        assert payer_tariff.is_active is False
