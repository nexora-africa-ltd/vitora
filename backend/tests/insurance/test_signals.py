"""Tests for insurance domain event publishing via signals."""

from decimal import Decimal

import pytest  # type: ignore

from hmis.apps.billing.models import Invoice, InvoiceItem, Service, ServiceCategory
from hmis.apps.core.events.types import InsuranceEvents
from hmis.apps.core.models import AuditLog
from hmis.apps.insurance.models import (
    InsuranceClaim,
    InsurancePreauth,
    InsuranceProvider,
    InsuranceRemittance,
    PatientInsurance,
)


class TestInsuranceProviderEvents:
    def test_create_publishes_event(self, db, mocker, sample_organization):
        mock_publish = mocker.patch("hmis.apps.insurance.signals.publish_event")
        InsuranceProvider.objects.create(
            organization=sample_organization,
            name="Event Test Provider",
            code="EVT",
        )
        mock_publish.assert_called_once()
        assert mock_publish.call_args[0][0] == InsuranceEvents.PROVIDER_CREATED

    def test_update_publishes_event(self, mocker, insurance_provider):
        mock_publish = mocker.patch("hmis.apps.insurance.signals.publish_event")
        insurance_provider.contact_email = "new@example.com"
        insurance_provider.save()
        mock_publish.assert_called_once()
        assert mock_publish.call_args[0][0] == InsuranceEvents.PROVIDER_UPDATED


class TestPatientInsuranceEvents:
    def test_create_publishes_event(
        self, db, mocker, sample_patient, insurance_plan, sample_organization
    ):
        mock_publish = mocker.patch("hmis.apps.insurance.signals.publish_event")
        PatientInsurance.objects.create(
            organization=sample_organization,
            patient=sample_patient,
            plan=insurance_plan,
            member_number="EVT-001",
            valid_from="2025-01-01",
            valid_to="2026-01-01",
        )
        mock_publish.assert_called_once()
        assert mock_publish.call_args[0][0] == InsuranceEvents.ENROLLMENT_CREATED


class TestInsuranceClaimEvents:
    def test_create_publishes_event(
        self,
        db,
        mocker,
        patient_insurance,
        insurance_provider,
        sample_patient,
        sample_facility,
        sample_organization,
    ):
        mock_publish = mocker.patch("hmis.apps.insurance.signals.publish_event")
        InsuranceClaim.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            patient_insurance=patient_insurance,
            provider=insurance_provider,
            patient=sample_patient,
            claim_type="outpatient",
            total_amount=Decimal("1000.00"),
        )
        mock_publish.assert_called_once()
        assert mock_publish.call_args[0][0] == InsuranceEvents.CLAIM_CREATED

    def test_submit_publishes_submitted_event(self, mocker, insurance_claim):
        mock_publish = mocker.patch("hmis.apps.insurance.signals.publish_event")
        insurance_claim.submit()
        mock_publish.assert_called_once()
        assert mock_publish.call_args[0][0] == InsuranceEvents.CLAIM_SUBMITTED

    def test_approve_publishes_approved_event(self, mocker, insurance_claim):
        insurance_claim.submit()
        mock_publish = mocker.patch("hmis.apps.insurance.signals.publish_event")
        insurance_claim.approve(approved_amount=Decimal("4000.00"))
        mock_publish.assert_called_once()
        assert mock_publish.call_args[0][0] == InsuranceEvents.CLAIM_APPROVED

    def test_reject_publishes_rejected_event(self, mocker, insurance_claim):
        insurance_claim.submit()
        mock_publish = mocker.patch("hmis.apps.insurance.signals.publish_event")
        insurance_claim.reject(reason="Invalid")
        mock_publish.assert_called_once()
        assert mock_publish.call_args[0][0] == InsuranceEvents.CLAIM_REJECTED

    def test_paid_publishes_paid_event(self, mocker, insurance_claim):
        insurance_claim.submit()
        insurance_claim.approve(approved_amount=Decimal("5000.00"))
        mock_publish = mocker.patch("hmis.apps.insurance.signals.publish_event")
        insurance_claim.mark_paid(paid_amount=Decimal("5000.00"))
        mock_publish.assert_called_once()
        assert mock_publish.call_args[0][0] == InsuranceEvents.CLAIM_PAID

    def test_approved_claim_auto_finalizes_linked_draft_invoice(
        self,
        sample_patient,
        test_user,
        insurance_claim,
        sample_facility,
        sample_organization,
    ):
        """Insurance claim approval should transition linked draft invoice to pending."""
        category = ServiceCategory.objects.create(
            name="Signal Test",
            code="SIG",
            description="Signal test category",
            display_order=1,
        )
        service = Service.objects.create(
            category=category,
            code="SIG-001",
            name="Signal Test Service",
            unit_price=Decimal("1000.00"),
            created_by=test_user,
        )
        invoice = Invoice.objects.create(
            patient=sample_patient,
            invoice_date="2026-01-01",
            due_date="2026-01-31",
            status=Invoice.Status.DRAFT,
            payment_type=Invoice.PaymentType.INSURANCE,
            payer_type=Invoice.PayerType.PRIVATE_INSURANCE,
            created_by=test_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        InvoiceItem.objects.create(
            invoice=invoice,
            service=service,
            description=service.name,
            quantity=1,
            unit_price=Decimal("1000.00"),
        )
        insurance_claim.invoice = invoice
        insurance_claim.save(update_fields=["invoice", "updated_at"])

        insurance_claim.submit()
        insurance_claim.approve(approved_amount=Decimal("4000.00"))

        invoice.refresh_from_db()
        assert invoice.status == Invoice.Status.PENDING

        audit_entry = AuditLog.objects.filter(
            action="invoice_auto_finalized_by_claim_approval",
            resource_type="Invoice",
            resource_id=invoice.id,
        ).first()
        assert audit_entry is not None
        assert audit_entry.details.get("trigger") == "insurance_claim_approval"


class TestInsurancePreauthEvents:
    def test_create_publishes_event(
        self,
        db,
        mocker,
        patient_insurance,
        insurance_provider,
        sample_patient,
        sample_facility,
        sample_organization,
    ):
        mock_publish = mocker.patch("hmis.apps.insurance.signals.publish_event")
        InsurancePreauth.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            patient_insurance=patient_insurance,
            provider=insurance_provider,
            patient=sample_patient,
            preauth_type="admission",
            estimated_cost=Decimal("50000.00"),
        )
        mock_publish.assert_called_once()
        assert mock_publish.call_args[0][0] == InsuranceEvents.PREAUTH_CREATED

    def test_submit_publishes_event(self, mocker, insurance_preauth):
        mock_publish = mocker.patch("hmis.apps.insurance.signals.publish_event")
        insurance_preauth.submit()
        mock_publish.assert_called_once()
        assert mock_publish.call_args[0][0] == InsuranceEvents.PREAUTH_SUBMITTED

    def test_approve_publishes_event(self, mocker, insurance_preauth):
        insurance_preauth.submit()
        mock_publish = mocker.patch("hmis.apps.insurance.signals.publish_event")
        insurance_preauth.approve(approved_amount=Decimal("45000.00"))
        mock_publish.assert_called_once()
        assert mock_publish.call_args[0][0] == InsuranceEvents.PREAUTH_APPROVED

    def test_deny_publishes_event(self, mocker, insurance_preauth):
        insurance_preauth.submit()
        mock_publish = mocker.patch("hmis.apps.insurance.signals.publish_event")
        insurance_preauth.deny(reason="Not needed")
        mock_publish.assert_called_once()
        assert mock_publish.call_args[0][0] == InsuranceEvents.PREAUTH_DENIED


class TestInsuranceRemittanceEvents:
    def test_create_publishes_event(
        self, db, mocker, insurance_provider, sample_facility, sample_organization
    ):
        mock_publish = mocker.patch("hmis.apps.insurance.signals.publish_event")
        InsuranceRemittance.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            provider=insurance_provider,
            remittance_number="REM-EVT-001",
            remittance_date="2025-06-01",
            total_amount=Decimal("50000.00"),
        )
        mock_publish.assert_called_once()
        assert mock_publish.call_args[0][0] == InsuranceEvents.REMITTANCE_RECEIVED
