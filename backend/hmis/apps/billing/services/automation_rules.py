from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal

from django.db import transaction

from hmis.apps.billing.agent import BillingAgentService
from hmis.apps.billing.models import (
    BillingAutomationExecution,
    BillingAutomationRule,
    FacilityBillingConfig,
)

logger = logging.getLogger(__name__)


class BillingAutomationRuleService:
    """Rule engine for configurable billing automation triggers."""

    @classmethod
    def apply_encounter_created(cls, encounter, invoice=None) -> int:
        facility = getattr(encounter, "facility", None)
        if facility is None:
            return 0

        config = FacilityBillingConfig.objects.filter(facility=facility).first()
        if config is None:
            return 0

        rules = config.automation_rules.filter(
            is_active=True,
            trigger=BillingAutomationRule.Trigger.ENCOUNTER_CREATED,
        ).select_related("service")
        if not rules.exists():
            return 0

        invoice = invoice or BillingAgentService.get_or_create_draft_invoice(
            encounter.patient, encounter
        )
        return cls._apply_rules(
            rules=rules,
            context_key=f"encounter:{encounter.id}",
            encounter=encounter,
            invoice=invoice,
        )

    @classmethod
    def apply_admission_created(cls, admission, invoice=None) -> int:
        facility = getattr(admission, "facility", None)
        if facility is None:
            return 0

        config = FacilityBillingConfig.objects.filter(facility=facility).first()
        if config is None:
            return 0

        rules = config.automation_rules.filter(
            is_active=True,
            trigger=BillingAutomationRule.Trigger.ADMISSION_CREATED,
        ).select_related("service")
        if not rules.exists():
            return 0

        encounter = getattr(admission, "ipd_encounter", None)
        invoice = invoice or BillingAgentService.get_or_create_draft_invoice(
            admission.patient,
            encounter,
        )
        return cls._apply_rules(
            rules=rules,
            context_key=f"admission:{admission.id}",
            encounter=encounter,
            invoice=invoice,
        )

    @classmethod
    def apply_checkout(cls, encounter, invoice=None) -> int:
        facility = getattr(encounter, "facility", None)
        if facility is None:
            return 0

        config = FacilityBillingConfig.objects.filter(facility=facility).first()
        if config is None:
            return 0

        rules = config.automation_rules.filter(
            is_active=True,
            trigger=BillingAutomationRule.Trigger.CHECKOUT,
        ).select_related("service")
        if not rules.exists():
            return 0

        invoice = invoice or BillingAgentService.get_or_create_draft_invoice(
            encounter.patient,
            encounter,
        )
        return cls._apply_rules(
            rules=rules,
            context_key=f"checkout:{encounter.id}",
            encounter=encounter,
            invoice=invoice,
        )

    @classmethod
    def apply_daily(cls) -> int:
        """Apply active DAILY-trigger automation rules for active admissions."""
        from hmis.apps.inpatient.models import Admission

        active_admissions = Admission.objects.filter(admission_status="ACTIVE").select_related(
            "patient",
            "ipd_encounter",
            "facility",
        )

        applied_total = 0
        for admission in active_admissions:
            facility = getattr(admission, "facility", None)
            if facility is None:
                continue

            config = FacilityBillingConfig.objects.filter(facility=facility).first()
            if config is None:
                continue

            rules = config.automation_rules.filter(
                is_active=True,
                trigger=BillingAutomationRule.Trigger.DAILY,
            ).select_related("service")
            if not rules.exists():
                continue

            encounter = getattr(admission, "ipd_encounter", None)
            invoice = BillingAgentService.get_or_create_draft_invoice(
                admission.patient,
                encounter,
            )
            applied_total += cls._apply_rules(
                rules=rules,
                context_key=f"admission:{admission.id}",
                encounter=encounter,
                invoice=invoice,
            )

        return applied_total

    @classmethod
    def _apply_rules(cls, *, rules, context_key: str, encounter, invoice) -> int:
        today = date.today()
        applied = 0

        for rule in rules:
            if (
                encounter
                and rule.encounter_types
                and getattr(encounter, "encounter_type", "") not in set(rule.encounter_types)
            ):
                continue

            if not cls._can_run_for_date(rule=rule, context_key=context_key, today=today):
                continue

            execution, created = cls._reserve_execution_slot(
                rule=rule,
                context_key=context_key,
                encounter=encounter,
                run_date=today,
            )
            if not created:
                continue

            unit_price = cls._resolve_unit_price(rule)
            if unit_price is None:
                logger.warning(
                    "Billing automation rule %s skipped: no unit price/service configured",
                    rule.id,
                )
                execution.delete()
                continue

            description = rule.description_template.strip() or (
                rule.service.name if rule.service else rule.name
            )

            try:
                item = BillingAgentService.add_line_item(
                    invoice,
                    service=rule.service,
                    quantity=rule.quantity,
                    unit_price=unit_price,
                    description=description,
                    item_type=rule.item_type,
                )
            except Exception:
                execution.delete()
                logger.exception(
                    "Billing automation rule %s failed while creating invoice item",
                    rule.id,
                )
                continue

            execution.invoice_item = item
            execution.save(update_fields=["invoice_item"])
            applied += 1

        return applied

    @staticmethod
    def _resolve_unit_price(rule: BillingAutomationRule) -> Decimal | None:
        if rule.unit_price_override is not None:
            return Decimal(str(rule.unit_price_override))
        if rule.service_id and rule.service is not None:
            return Decimal(str(rule.service.unit_price))
        return None

    @staticmethod
    def _can_run_for_date(rule: BillingAutomationRule, context_key: str, today: date) -> bool:
        executions = BillingAutomationExecution.objects.filter(
            rule=rule,
            context_key=context_key,
        ).order_by("-execution_date")

        if rule.recurrence == BillingAutomationRule.Recurrence.ONCE:
            return not executions.exists()

        last = executions.first()
        if last is None:
            return True

        delta_days = (today - last.execution_date).days
        return delta_days >= max(rule.repeat_every_days, 1)

    @staticmethod
    @transaction.atomic
    def _reserve_execution_slot(*, rule, context_key, encounter, run_date):
        return BillingAutomationExecution.objects.get_or_create(
            rule=rule,
            context_key=context_key,
            execution_date=run_date,
            defaults={"encounter": encounter},
        )
