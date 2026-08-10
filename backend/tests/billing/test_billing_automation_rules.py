from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from hmis.apps.billing.models import (
    BillingAutomationExecution,
    BillingAutomationRule,
    FacilityBillingConfig,
    Invoice,
    Service,
    ServiceCategory,
)
from hmis.apps.encounters.models import Encounter


@pytest.mark.django_db
class TestBillingAutomationRuleService:
    @pytest.fixture
    def consult_service(self, db, test_user):
        category = ServiceCategory.objects.create(
            name="Consultation",
            code="CONS",
            description="Consultation services",
            display_order=1,
        )
        return Service.objects.create(
            category=category,
            code="CONS-OPD",
            name="OPD Consultation",
            unit_price=Decimal("800.00"),
            created_by=test_user,
        )

    @pytest.fixture
    def encounter(self, db, sample_patient, sample_facility, sample_organization):
        return Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Fever",
            facility=sample_facility,
            organization=sample_organization,
        )

    @pytest.fixture
    def facility_config(self, db, sample_facility):
        return FacilityBillingConfig.objects.create(facility=sample_facility)

    def test_apply_encounter_created_adds_invoice_item_and_execution(
        self,
        encounter,
        facility_config,
        consult_service,
    ):
        from hmis.apps.billing.services.automation_rules import BillingAutomationRuleService

        BillingAutomationRule.objects.create(
            billing_config=facility_config,
            name="Default Consultation",
            trigger=BillingAutomationRule.Trigger.ENCOUNTER_CREATED,
            recurrence=BillingAutomationRule.Recurrence.ONCE,
            service=consult_service,
            quantity=Decimal("1.00"),
            item_type="service",
            description_template="Consultation charge",
        )

        applied = BillingAutomationRuleService.apply_encounter_created(encounter)

        assert applied == 1
        invoice = Invoice.objects.get(encounter=encounter, status=Invoice.Status.DRAFT)
        item = invoice.items.get(description="Consultation charge")
        assert item.service_id == consult_service.id
        assert item.unit_price == consult_service.unit_price
        assert (
            BillingAutomationExecution.objects.filter(
                rule__billing_config=facility_config,
                context_key=f"encounter:{encounter.id}",
            ).count()
            == 1
        )

    def test_apply_encounter_created_is_idempotent_for_once_rules(
        self,
        encounter,
        facility_config,
        consult_service,
    ):
        from hmis.apps.billing.services.automation_rules import BillingAutomationRuleService

        BillingAutomationRule.objects.create(
            billing_config=facility_config,
            name="One-time Consultation",
            trigger=BillingAutomationRule.Trigger.ENCOUNTER_CREATED,
            recurrence=BillingAutomationRule.Recurrence.ONCE,
            service=consult_service,
            quantity=Decimal("1.00"),
            item_type="service",
        )

        first = BillingAutomationRuleService.apply_encounter_created(encounter)
        second = BillingAutomationRuleService.apply_encounter_created(encounter)

        assert first == 1
        assert second == 0
        invoice = Invoice.objects.get(encounter=encounter, status=Invoice.Status.DRAFT)
        assert invoice.items.filter(service=consult_service).count() == 1

    def test_recurring_rule_respects_repeat_interval(
        self,
        encounter,
        facility_config,
        consult_service,
    ):
        from hmis.apps.billing.services.automation_rules import BillingAutomationRuleService

        rule = BillingAutomationRule.objects.create(
            billing_config=facility_config,
            name="Recurring Follow-up",
            trigger=BillingAutomationRule.Trigger.ENCOUNTER_CREATED,
            recurrence=BillingAutomationRule.Recurrence.RECURRING,
            repeat_every_days=2,
            service=consult_service,
            quantity=Decimal("1.00"),
            item_type="service",
        )

        first = BillingAutomationRuleService.apply_encounter_created(encounter)
        assert first == 1

        execution = BillingAutomationExecution.objects.get(rule=rule)
        execution.execution_date = timezone.localdate() - timedelta(days=1)
        execution.save(update_fields=["execution_date"])

        skipped = BillingAutomationRuleService.apply_encounter_created(encounter)
        assert skipped == 0

        execution.execution_date = timezone.localdate() - timedelta(days=2)
        execution.save(update_fields=["execution_date"])

        applied_again = BillingAutomationRuleService.apply_encounter_created(encounter)
        assert applied_again == 1

        invoice = Invoice.objects.get(encounter=encounter, status=Invoice.Status.DRAFT)
        assert invoice.items.filter(service=consult_service).count() == 2

    def test_apply_admission_created_runs_admission_trigger_rules(
        self,
        sample_admission,
        consult_service,
    ):
        from hmis.apps.billing.services.automation_rules import BillingAutomationRuleService

        facility_config, _ = FacilityBillingConfig.objects.get_or_create(
            facility=sample_admission.facility,
        )
        BillingAutomationRule.objects.create(
            billing_config=facility_config,
            name="Admission Fee Automation",
            trigger=BillingAutomationRule.Trigger.ADMISSION_CREATED,
            recurrence=BillingAutomationRule.Recurrence.ONCE,
            service=consult_service,
            quantity=Decimal("1.00"),
            item_type="service",
            description_template="Admission automation fee",
        )

        invoice = Invoice.objects.filter(
            encounter=sample_admission.ipd_encounter,
            status=Invoice.Status.DRAFT,
        ).first()
        before = (
            invoice.items.filter(description="Admission automation fee").count() if invoice else 0
        )

        applied = BillingAutomationRuleService.apply_admission_created(sample_admission)

        assert applied == 1
        invoice = Invoice.objects.get(
            encounter=sample_admission.ipd_encounter,
            status=Invoice.Status.DRAFT,
        )
        assert invoice.items.filter(description="Admission automation fee").count() == before + 1

    def test_apply_checkout_runs_checkout_trigger_rules(
        self,
        encounter,
        facility_config,
        consult_service,
    ):
        from hmis.apps.billing.services.automation_rules import BillingAutomationRuleService

        BillingAutomationRule.objects.create(
            billing_config=facility_config,
            name="Checkout Charge",
            trigger=BillingAutomationRule.Trigger.CHECKOUT,
            recurrence=BillingAutomationRule.Recurrence.ONCE,
            service=consult_service,
            quantity=Decimal("1.00"),
            item_type="service",
            description_template="Checkout automation fee",
        )

        applied = BillingAutomationRuleService.apply_checkout(encounter)

        assert applied == 1
        invoice = Invoice.objects.get(encounter=encounter, status=Invoice.Status.DRAFT)
        assert invoice.items.filter(description="Checkout automation fee").count() == 1

    def test_apply_daily_runs_daily_trigger_rules_for_active_admissions(
        self,
        sample_admission,
        consult_service,
    ):
        from hmis.apps.billing.services.automation_rules import BillingAutomationRuleService

        facility_config, _ = FacilityBillingConfig.objects.get_or_create(
            facility=sample_admission.facility,
        )
        BillingAutomationRule.objects.create(
            billing_config=facility_config,
            name="Daily IPD Charge",
            trigger=BillingAutomationRule.Trigger.DAILY,
            recurrence=BillingAutomationRule.Recurrence.RECURRING,
            repeat_every_days=1,
            service=consult_service,
            quantity=Decimal("1.00"),
            item_type="service",
            description_template="Daily automation fee",
        )

        applied = BillingAutomationRuleService.apply_daily()

        assert applied >= 1
        invoice = Invoice.objects.get(
            encounter=sample_admission.ipd_encounter,
            status=Invoice.Status.DRAFT,
        )
        assert invoice.items.filter(description="Daily automation fee").exists()
