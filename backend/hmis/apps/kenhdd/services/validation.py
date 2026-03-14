"""
KENHDD Validation Service.

Core engine for validating Django model instances against
KENHDD data element definitions.

DHA Compliance: Gap #33 — KENHDD Schema Validation (Sprint 3.D)
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import models

logger = logging.getLogger(__name__)


# ──────────────────────────── Result Dataclasses ────────────────────────────


@dataclass
class KENHDDElementResult:
    """Result of validating a single KENHDD element against a record."""

    element_id: str
    element_name: str
    field_name: str
    status: str  # PASS, FAIL, WARNING, SKIPPED
    message: str = ""
    requirement_level: str = ""
    value: str = ""


@dataclass
class KENHDDRecordResult:
    """Result of validating all elements for a single record."""

    record_id: int | str
    resource_type: str
    elements: list[KENHDDElementResult] = field(default_factory=list)

    @property
    def is_compliant(self) -> bool:
        """A record is compliant if no MANDATORY elements FAIL."""
        return not any(
            e.status == "FAIL" and e.requirement_level == "MANDATORY"
            for e in self.elements
        )

    @property
    def pass_count(self) -> int:
        return sum(1 for e in self.elements if e.status == "PASS")

    @property
    def fail_count(self) -> int:
        return sum(1 for e in self.elements if e.status == "FAIL")

    @property
    def warning_count(self) -> int:
        return sum(1 for e in self.elements if e.status == "WARNING")


@dataclass
class KENHDDComplianceScore:
    """Aggregate compliance score for a resource type."""

    resource_type: str
    total_records: int
    compliant_records: int
    compliance_pct: float
    mandatory_pass_rate: float
    total_elements: int = 0
    violations_by_element: dict[str, int] = field(default_factory=dict)


# ──────────────────────────── Model Mapping ────────────────────────────

# Maps resource_type choices to (app_label, model_name) for dynamic model lookup.
RESOURCE_MODEL_MAP: dict[str, tuple[str, str]] = {
    "PATIENT": ("patients", "Patient"),
    "ENCOUNTER": ("encounters", "Encounter"),
    "DIAGNOSIS": ("encounters", "Diagnosis"),
    "FACILITY": ("core", "Facility"),
    "LAB_RESULT": ("laboratory", "LabResult"),
    "PRESCRIPTION": ("pharmacy", "PrescriptionItem"),
    "MCH_VISIT": ("mch", "ANCVisit"),
}


# ──────────────────────────── Service ────────────────────────────


class KENHDDValidationService:
    """
    Service for validating model instances against KENHDD data element
    definitions.
    """

    def _get_active_elements(
        self, resource_type: str
    ) -> models.QuerySet:
        """Return active KENHDD elements for the given resource type."""
        from hmis.apps.kenhdd.models import KENHDDDataElement

        return KENHDDDataElement.objects.filter(
            resource_type=resource_type,
            is_active=True,
        )

    def _resolve_field_value(self, instance: Any, field_path: str) -> Any:
        """
        Resolve a dot-separated field path on a model instance.

        Examples:
            "first_name" → instance.first_name
            "county.name" → instance.county.name
            "enrollment.gravida" → instance.enrollment.gravida
        """
        obj = instance
        for part in field_path.split("."):
            if obj is None:
                return None
            try:
                obj = getattr(obj, part, None)
            except Exception:
                return None
        return obj

    def _validate_element(self, element: Any, value: Any) -> KENHDDElementResult:
        """
        Validate a single value against a KENHDD data element definition.
        """
        element_id = element.element_id
        name = element.name
        field_name = element.model_field
        req_level = element.requirement_level

        # Check presence
        is_empty = value is None or (isinstance(value, str) and value.strip() == "")

        if is_empty:
            if req_level == "MANDATORY":
                return KENHDDElementResult(
                    element_id=element_id,
                    element_name=name,
                    field_name=field_name,
                    status="FAIL",
                    message=f"Mandatory field '{name}' is empty",
                    requirement_level=req_level,
                )
            elif req_level == "OPTIONAL":
                return KENHDDElementResult(
                    element_id=element_id,
                    element_name=name,
                    field_name=field_name,
                    status="PASS",
                    message="Optional field is empty (acceptable)",
                    requirement_level=req_level,
                )
            else:
                # CONDITIONAL — empty might be OK depending on context
                return KENHDDElementResult(
                    element_id=element_id,
                    element_name=name,
                    field_name=field_name,
                    status="WARNING",
                    message=f"Conditional field '{name}' is empty: {element.condition_expression}",
                    requirement_level=req_level,
                )

        str_value = str(value)

        # Type validation
        data_type = element.data_type
        if data_type == "INTEGER":
            try:
                int(str_value)
            except (ValueError, TypeError):
                return KENHDDElementResult(
                    element_id=element_id,
                    element_name=name,
                    field_name=field_name,
                    status="FAIL",
                    message=f"Expected integer, got '{str_value}'",
                    requirement_level=req_level,
                    value=str_value,
                )
        elif data_type == "DECIMAL":
            try:
                Decimal(str_value)
            except (InvalidOperation, ValueError, TypeError):
                return KENHDDElementResult(
                    element_id=element_id,
                    element_name=name,
                    field_name=field_name,
                    status="FAIL",
                    message=f"Expected decimal, got '{str_value}'",
                    requirement_level=req_level,
                    value=str_value,
                )
        elif data_type == "DATE":
            if not isinstance(value, (date, datetime)):
                # Also accept ISO date strings
                if isinstance(value, str):
                    try:
                        datetime.strptime(value, "%Y-%m-%d")
                    except ValueError:
                        return KENHDDElementResult(
                            element_id=element_id,
                            element_name=name,
                            field_name=field_name,
                            status="FAIL",
                            message=f"Expected date (YYYY-MM-DD), got '{str_value}'",
                            requirement_level=req_level,
                            value=str_value,
                        )
                else:
                    return KENHDDElementResult(
                        element_id=element_id,
                        element_name=name,
                        field_name=field_name,
                        status="FAIL",
                        message=f"Expected date, got '{type(value).__name__}'",
                        requirement_level=req_level,
                        value=str_value,
                    )
        elif data_type == "BOOLEAN":
            if not isinstance(value, bool):
                return KENHDDElementResult(
                    element_id=element_id,
                    element_name=name,
                    field_name=field_name,
                    status="FAIL",
                    message=f"Expected boolean, got '{type(value).__name__}'",
                    requirement_level=req_level,
                    value=str_value,
                )

        # Max length check
        if element.max_length and len(str_value) > element.max_length:
            return KENHDDElementResult(
                element_id=element_id,
                element_name=name,
                field_name=field_name,
                status="FAIL",
                message=f"Value exceeds max length {element.max_length} (got {len(str_value)})",
                requirement_level=req_level,
                value=str_value,
            )

        # Format pattern check
        if element.format_pattern:
            if not re.match(element.format_pattern, str_value):
                return KENHDDElementResult(
                    element_id=element_id,
                    element_name=name,
                    field_name=field_name,
                    status="WARNING",
                    message=f"Value '{str_value}' does not match expected format '{element.format_pattern}'",
                    requirement_level=req_level,
                    value=str_value,
                )

        return KENHDDElementResult(
            element_id=element_id,
            element_name=name,
            field_name=field_name,
            status="PASS",
            message="Valid",
            requirement_level=req_level,
            value=str_value,
        )

    def validate_record(
        self, resource_type: str, instance: Any
    ) -> KENHDDRecordResult:
        """
        Validate a single model instance against all active KENHDD elements
        for the given resource type.
        """
        elements = self._get_active_elements(resource_type)
        record_id = getattr(instance, "pk", getattr(instance, "id", "?"))

        result = KENHDDRecordResult(
            record_id=record_id,
            resource_type=resource_type,
        )

        for element in elements:
            value = self._resolve_field_value(instance, element.model_field)
            element_result = self._validate_element(element, value)
            result.elements.append(element_result)

        return result

    def get_model_class(self, resource_type: str) -> type[models.Model] | None:
        """Resolve the Django model class for a given resource type."""
        from django.apps import apps

        mapping = RESOURCE_MODEL_MAP.get(resource_type)
        if not mapping:
            return None
        try:
            return apps.get_model(mapping[0], mapping[1])
        except LookupError:
            logger.warning("Model not found for resource_type=%s", resource_type)
            return None

    def generate_compliance_report(
        self,
        resource_type: str | None = None,
        sample_size: int = 100,
        user: Any = None,
    ) -> list[KENHDDComplianceScore]:
        """
        Generate a compliance report by sampling records.

        Args:
            resource_type: Optional filter — if None, runs for all resource types.
            sample_size: Number of records to sample per resource type.
            user: The user initiating the report (for audit trail).

        Returns:
            List of KENHDDComplianceScore per resource type evaluated.
        """
        from hmis.apps.kenhdd.models import KENHDDValidationRun

        resource_types = (
            [resource_type] if resource_type else list(RESOURCE_MODEL_MAP.keys())
        )

        scores: list[KENHDDComplianceScore] = []

        for rt in resource_types:
            model_cls = self.get_model_class(rt)
            if model_cls is None:
                continue

            elements = self._get_active_elements(rt)
            if not elements.exists():
                continue

            # Sample records
            records = model_cls.objects.order_by("?")[:sample_size]
            total = len(records)
            if total == 0:
                scores.append(
                    KENHDDComplianceScore(
                        resource_type=rt,
                        total_records=0,
                        compliant_records=0,
                        compliance_pct=0.0,
                        mandatory_pass_rate=0.0,
                        total_elements=elements.count(),
                    )
                )
                continue

            compliant_count = 0
            mandatory_total = 0
            mandatory_pass = 0
            violations: dict[str, int] = {}

            for record in records:
                record_result = self.validate_record(rt, record)
                if record_result.is_compliant:
                    compliant_count += 1

                for elem_result in record_result.elements:
                    if elem_result.requirement_level == "MANDATORY":
                        mandatory_total += 1
                        if elem_result.status == "PASS":
                            mandatory_pass += 1

                    if elem_result.status in ("FAIL", "WARNING"):
                        violations[elem_result.element_id] = (
                            violations.get(elem_result.element_id, 0) + 1
                        )

            compliance_pct = round((compliant_count / total) * 100, 2) if total else 0.0
            mandatory_rate = (
                round((mandatory_pass / mandatory_total) * 100, 2)
                if mandatory_total
                else 100.0
            )

            score = KENHDDComplianceScore(
                resource_type=rt,
                total_records=total,
                compliant_records=compliant_count,
                compliance_pct=compliance_pct,
                mandatory_pass_rate=mandatory_rate,
                total_elements=elements.count(),
                violations_by_element=violations,
            )
            scores.append(score)

            # Persist the run
            run_obj = KENHDDValidationRun.objects.create(
                resource_type=rt,
                records_checked=total,
                records_compliant=compliant_count,
                compliance_score=Decimal(str(compliance_pct)),
                mandatory_pass_rate=Decimal(str(mandatory_rate)),
                violations=violations,
                run_by=user,
            )

            # Persist per-record failure details for drill-down
            from hmis.apps.kenhdd.models import KENHDDFailedRecord

            failed_objects = []
            for record in records:
                record_result = self.validate_record(rt, record)
                if not record_result.is_compliant or record_result.fail_count > 0 or record_result.warning_count > 0:
                    violation_details = [
                        {
                            "element_id": e.element_id,
                            "element_name": e.element_name,
                            "field_name": e.field_name,
                            "status": e.status,
                            "message": e.message,
                            "requirement_level": e.requirement_level,
                            "value": e.value,
                        }
                        for e in record_result.elements
                        if e.status in ("FAIL", "WARNING")
                    ]
                    if violation_details:
                        failed_objects.append(
                            KENHDDFailedRecord(
                                run=run_obj,
                                record_id=str(record_result.record_id),
                                is_compliant=record_result.is_compliant,
                                pass_count=record_result.pass_count,
                                fail_count=record_result.fail_count,
                                warning_count=record_result.warning_count,
                                violation_details=violation_details,
                            )
                        )
            if failed_objects:
                KENHDDFailedRecord.objects.bulk_create(failed_objects)

        return scores

    def get_compliance_summary(self) -> list[dict]:
        """
        Return the latest compliance score per resource type.
        """
        from hmis.apps.kenhdd.models import KENHDDValidationRun

        summary = []
        for rt, _ in RESOURCE_MODEL_MAP.items():
            latest = (
                KENHDDValidationRun.objects.filter(resource_type=rt)
                .order_by("-run_at")
                .first()
            )
            if latest:
                summary.append(
                    {
                        "resource_type": rt,
                        "compliance_score": float(latest.compliance_score),
                        "mandatory_pass_rate": float(latest.mandatory_pass_rate),
                        "records_checked": latest.records_checked,
                        "records_compliant": latest.records_compliant,
                        "violations": latest.violations,
                        "run_at": latest.run_at.isoformat(),
                        "run_by": (
                            latest.run_by.get_full_name()
                            if latest.run_by
                            else None
                        ),
                    }
                )
            else:
                summary.append(
                    {
                        "resource_type": rt,
                        "compliance_score": None,
                        "mandatory_pass_rate": None,
                        "records_checked": 0,
                        "records_compliant": 0,
                        "violations": {},
                        "run_at": None,
                        "run_by": None,
                    }
                )

        return summary
