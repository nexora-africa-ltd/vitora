"""Tests for procedure models: creation, state transitions, computed properties."""

from datetime import date, timedelta

import pytest  # type: ignore
from django.utils import timezone

from hmis.apps.procedures.models import (
    ProcedureCatalog,
    ProcedureConsent,
    ProcedureConsumable,
    ProcedureKit,
    ProcedureKitItem,
    ProcedureLog,
    ProcedureOrder,
    ProcedureOutcome,
)


class TestProcedureCatalog:
    """Tests for ProcedureCatalog model."""

    def test_create_catalog_entry(self, procedure_catalog_entry):
        assert procedure_catalog_entry.code == "PROC-WC-001"
        assert procedure_catalog_entry.name == "Wound Dressing (Simple)"
        assert procedure_catalog_entry.category == ProcedureCatalog.Category.WOUND_CARE
        assert procedure_catalog_entry.risk_level == ProcedureCatalog.RiskLevel.LOW
        assert procedure_catalog_entry.is_active is True

    def test_str_representation(self, procedure_catalog_entry):
        assert str(procedure_catalog_entry) == "PROC-WC-001 - Wound Dressing (Simple)"

    def test_category_choices(self):
        assert len(ProcedureCatalog.Category.choices) == 13

    def test_body_system_choices(self):
        assert len(ProcedureCatalog.BodySystem.choices) == 13

    def test_default_values(self, db):
        entry = ProcedureCatalog.objects.create(
            code="PROC-TEST-001",
            name="Test Procedure",
        )
        assert entry.category == ProcedureCatalog.Category.MINOR
        assert entry.body_system == ProcedureCatalog.BodySystem.GENERAL
        assert entry.risk_level == ProcedureCatalog.RiskLevel.LOW
        assert entry.typical_duration_minutes == 30
        assert entry.consent_required is True
        assert entry.minimum_staff_count == 1
        assert entry.is_active is True


class TestProcedureKit:
    """Tests for ProcedureKit and ProcedureKitItem models."""

    def test_create_kit(self, procedure_catalog_entry):
        kit = ProcedureKit.objects.create(
            procedure=procedure_catalog_entry,
            name="Standard Wound Dressing Kit",
            is_default=True,
        )
        assert str(kit) == "Wound Dressing (Simple) - Standard Wound Dressing Kit"
        assert kit.is_active is True


class TestProcedureOrder:
    """Tests for ProcedureOrder model."""

    def test_create_order(self, procedure_order):
        assert procedure_order.order_number.startswith("PROC-")
        assert procedure_order.status == ProcedureOrder.Status.ORDERED
        assert procedure_order.priority == ProcedureOrder.Priority.ROUTINE

    def test_auto_generated_order_number(self, procedure_order):
        today = timezone.now().date()
        expected_prefix = f"PROC-{today.strftime('%Y%m%d')}-"
        assert procedure_order.order_number.startswith(expected_prefix)

    def test_sequential_order_numbers(
        self, db, procedure_catalog_entry, sample_patient, sample_encounter, test_user
    ):
        order1 = ProcedureOrder.objects.create(
            procedure=procedure_catalog_entry,
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            indication="First order",
        )
        order2 = ProcedureOrder.objects.create(
            procedure=procedure_catalog_entry,
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            indication="Second order",
        )
        num1 = int(order1.order_number.split("-")[-1])
        num2 = int(order2.order_number.split("-")[-1])
        assert num2 == num1 + 1

    def test_str_representation(self, procedure_order):
        assert "PROC-" in str(procedure_order)
        assert "Wound Dressing" in str(procedure_order)

    # State transition tests
    def test_request_consent(self, procedure_order):
        procedure_order.request_consent()
        assert procedure_order.status == ProcedureOrder.Status.CONSENT_PENDING

    def test_schedule(self, procedure_order):
        tomorrow = date.today() + timedelta(days=1)
        procedure_order.schedule(date=tomorrow, location="Room 3")
        procedure_order.refresh_from_db()
        assert procedure_order.status == ProcedureOrder.Status.SCHEDULED
        assert procedure_order.scheduled_date == tomorrow
        assert procedure_order.scheduled_location == "Room 3"

    def test_mark_ready(self, procedure_order):
        procedure_order.status = ProcedureOrder.Status.SCHEDULED
        procedure_order.save()
        procedure_order.mark_ready()
        assert procedure_order.status == ProcedureOrder.Status.READY

    def test_start_procedure(self, procedure_order, test_user):
        procedure_order.status = ProcedureOrder.Status.SCHEDULED
        procedure_order.save()
        log = procedure_order.start_procedure(performed_by=test_user)
        procedure_order.refresh_from_db()

        assert procedure_order.status == ProcedureOrder.Status.IN_PROGRESS
        assert isinstance(log, ProcedureLog)
        assert log.performed_by == test_user
        assert log.status == ProcedureLog.Status.IN_PROGRESS

    def test_complete(self, procedure_order):
        procedure_order.status = ProcedureOrder.Status.IN_PROGRESS
        procedure_order.save()
        procedure_order.complete()
        assert procedure_order.status == ProcedureOrder.Status.COMPLETED

    def test_cancel(self, procedure_order, test_user):
        procedure_order.cancel(user=test_user, reason="Patient refused")
        procedure_order.refresh_from_db()
        assert procedure_order.status == ProcedureOrder.Status.CANCELLED
        assert procedure_order.cancelled_by == test_user
        assert procedure_order.cancellation_reason == "Patient refused"
        assert procedure_order.cancelled_at is not None

    # Computed properties
    def test_is_overdue_false_when_no_date(self, procedure_order):
        assert procedure_order.is_overdue is False

    def test_is_overdue_true_when_past(
        self, db, procedure_catalog_entry, sample_patient, sample_encounter, test_user
    ):
        order = ProcedureOrder.objects.create(
            procedure=procedure_catalog_entry,
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            indication="Test overdue",
            status=ProcedureOrder.Status.SCHEDULED,
            scheduled_date=timezone.now().date() - timedelta(days=2),
        )
        assert order.is_overdue is True

    def test_is_overdue_false_when_completed(self, procedure_order):
        procedure_order.scheduled_date = date.today() - timedelta(days=1)
        procedure_order.status = ProcedureOrder.Status.COMPLETED
        procedure_order.save()
        assert procedure_order.is_overdue is False

    def test_can_perform_not_scheduled(self, procedure_order):
        can, reason = procedure_order.can_perform()
        assert can is False
        assert "performable status" in reason

    def test_can_perform_without_consent(self, procedure_order):
        procedure_order.status = ProcedureOrder.Status.SCHEDULED
        procedure_order.save()
        can, reason = procedure_order.can_perform()
        assert can is False
        assert "Consent" in reason


class TestProcedureConsent:
    """Tests for ProcedureConsent model."""

    def test_create_consent(self, procedure_order, test_user):
        consent = ProcedureConsent.objects.create(
            order=procedure_order,
            consent_text="I consent to this procedure.",
            obtained_by=test_user,
        )
        assert consent.status == ProcedureConsent.Status.PENDING
        assert consent.consent_type == ProcedureConsent.ConsentType.WRITTEN

    def test_sign_consent(self, procedure_order, test_user):
        consent = ProcedureConsent.objects.create(
            order=procedure_order,
            consent_text="I consent.",
            obtained_by=test_user,
            procedure_explained=True,
            risks_explained=True,
            signed_by_patient=True,
        )
        consent.sign(user=test_user)
        consent.refresh_from_db()
        assert consent.status == ProcedureConsent.Status.SIGNED
        assert consent.obtained_at is not None

    def test_decline_consent(self, procedure_order, test_user):
        consent = ProcedureConsent.objects.create(
            order=procedure_order,
            consent_text="I consent.",
            obtained_by=test_user,
        )
        consent.decline(reason="Fear of procedure")
        consent.refresh_from_db()
        assert consent.status == ProcedureConsent.Status.DECLINED
        assert consent.decline_reason == "Fear of procedure"

    def test_withdraw_consent(self, procedure_order, test_user):
        consent = ProcedureConsent.objects.create(
            order=procedure_order,
            consent_text="I consent.",
            obtained_by=test_user,
            status=ProcedureConsent.Status.SIGNED,
        )
        consent.withdraw(reason="Changed mind")
        consent.refresh_from_db()
        assert consent.status == ProcedureConsent.Status.WITHDRAWN

    def test_is_valid_signed_with_all_requirements(self, procedure_order, test_user):
        consent = ProcedureConsent.objects.create(
            order=procedure_order,
            consent_text="I consent.",
            obtained_by=test_user,
            status=ProcedureConsent.Status.SIGNED,
            procedure_explained=True,
            risks_explained=True,
            signed_by_patient=True,
        )
        assert consent.is_valid() is True

    def test_is_valid_false_when_pending(self, procedure_order, test_user):
        consent = ProcedureConsent.objects.create(
            order=procedure_order,
            consent_text="I consent.",
            obtained_by=test_user,
        )
        assert consent.is_valid() is False

    def test_is_valid_false_when_not_explained(self, procedure_order, test_user):
        consent = ProcedureConsent.objects.create(
            order=procedure_order,
            consent_text="I consent.",
            obtained_by=test_user,
            status=ProcedureConsent.Status.SIGNED,
            procedure_explained=False,
            risks_explained=False,
        )
        assert consent.is_valid() is False


class TestProcedureLog:
    """Tests for ProcedureLog model."""

    def test_create_log(self, procedure_order, test_user):
        procedure_order.status = ProcedureOrder.Status.SCHEDULED
        procedure_order.save()
        log = procedure_order.start_procedure(performed_by=test_user)
        assert log.status == ProcedureLog.Status.IN_PROGRESS
        assert log.started_at is not None

    def test_complete_log(self, procedure_order, test_user):
        procedure_order.status = ProcedureOrder.Status.SCHEDULED
        procedure_order.save()
        log = procedure_order.start_procedure(performed_by=test_user)
        log.complete(status="COMPLETED", outcome="Wound dressed successfully")
        log.refresh_from_db()
        assert log.status == ProcedureLog.Status.COMPLETED
        assert log.ended_at is not None
        assert log.immediate_outcome == "Wound dressed successfully"
        assert log.actual_duration_minutes is not None

        procedure_order.refresh_from_db()
        assert procedure_order.status == ProcedureOrder.Status.COMPLETED

    def test_abandon_log(self, procedure_order, test_user):
        procedure_order.status = ProcedureOrder.Status.SCHEDULED
        procedure_order.save()
        log = procedure_order.start_procedure(performed_by=test_user)
        log.abandon(reason="Patient became uncooperative")
        log.refresh_from_db()
        assert log.status == ProcedureLog.Status.ABANDONED

        procedure_order.refresh_from_db()
        assert procedure_order.status == ProcedureOrder.Status.CANCELLED

    def test_duration_auto_calculated(self, procedure_order, test_user):
        procedure_order.status = ProcedureOrder.Status.SCHEDULED
        procedure_order.save()
        log = procedure_order.start_procedure(performed_by=test_user)
        log.ended_at = log.started_at + timedelta(minutes=25)
        log.save()
        assert log.actual_duration_minutes == 25


class TestProcedureConsumable:
    """Tests for ProcedureConsumable model."""

    def test_auto_total_cost(self, procedure_order, test_user):
        from decimal import Decimal

        procedure_order.status = ProcedureOrder.Status.SCHEDULED
        procedure_order.save()
        log = procedure_order.start_procedure(performed_by=test_user)

        from hmis.apps.pharmacy.models import Drug

        drug = Drug.objects.create(
            code="DRG-001",
            generic_name="Gauze Pad",
            form="OTHER",
            strength="N/A",
            unit="PIECE",
        )

        consumable = ProcedureConsumable.objects.create(
            log=log,
            drug=drug,
            quantity=5,
            unit_cost=Decimal("50.00"),
            recorded_by=test_user,
        )
        assert consumable.total_cost == Decimal("250.00")


class TestProcedureOutcome:
    """Tests for ProcedureOutcome model."""

    def test_create_outcome(self, procedure_order, test_user):
        procedure_order.status = ProcedureOrder.Status.SCHEDULED
        procedure_order.save()
        log = procedure_order.start_procedure(performed_by=test_user)
        log.complete()
        log.refresh_from_db()

        outcome = ProcedureOutcome.objects.create(
            log=log,
            assessment_date=date.today(),
            outcome=ProcedureOutcome.OutcomeStatus.HEALING,
            findings="Wound healing well, no signs of infection",
            assessed_by=test_user,
            next_follow_up=date.today() + timedelta(days=7),
        )
        assert "Healing" in str(outcome)
        assert outcome.next_follow_up == date.today() + timedelta(days=7)
