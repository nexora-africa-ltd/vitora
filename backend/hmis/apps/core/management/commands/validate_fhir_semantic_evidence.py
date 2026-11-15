# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Validate controlled INTER-SEM-001 semantic FHIR exports with HAPI FHIR R4.

Run: ``python manage.py validate_fhir_semantic_evidence --condition-id ...``.
Inputs: synthetic Condition, ProcedureOrder, LabResult, and facility IDs plus
``--output-dir``. The command fails closed unless HAPI R4 validates every export.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.test import RequestFactory

from hmis.apps.core.fhir.views_clinical_resources import FHIRProcedureView
from hmis.apps.core.fhir.views_observation_condition import FHIRConditionView, FHIRObservationView
from hmis.apps.core.services.hapi_r4_validation import HAPIR4ValidationService


class Command(BaseCommand):
    """Generate controlled, facility-scoped semantic interoperability evidence."""

    help = "Validate synthetic ICD-11, ICHI, and LOINC FHIR exports against HAPI R4."

    def add_arguments(self, parser) -> None:
        """Register required synthetic clinical resource IDs."""
        parser.add_argument("--condition-id", type=int, required=True)
        parser.add_argument("--procedure-id", type=int, required=True)
        parser.add_argument("--observation-id", type=int, required=True)
        parser.add_argument("--facility-id", type=int, required=True)
        parser.add_argument("--output-dir", type=Path, required=True)

    def handle(self, *args, **options) -> None:
        """Export, authoritatively validate, and retain semantic evidence artifacts."""
        resources = self._build_resources(options)
        output_dir = options["output_dir"]
        output_dir.mkdir(parents=True, exist_ok=True)

        validator = HAPIR4ValidationService()
        results: dict[str, dict[str, Any]] = {}
        for name, resource in resources.items():
            self._write_json(output_dir / f"{name}.json", resource)
            result = validator.validate_resource(resource)
            results[name] = asdict(result)
            if result.operation_outcome is not None:
                self._write_json(
                    output_dir / f"{name}-operation-outcome.json", result.operation_outcome
                )

        passed = all(result["authoritative"] and result["is_valid"] for result in results.values())
        self._write_json(
            output_dir / "validation-report.json",
            {
                "validation_authority": "HAPI FHIR R4 4.0.1 $validate",
                "scope": {"facility_id": options["facility_id"]},
                "passed": passed,
                "results": results,
            },
        )
        if not passed:
            raise CommandError(
                "Semantic FHIR evidence validation failed or was not authoritatively validated. "
                f"Review {output_dir / 'validation-report.json'}."
            )
        self.stdout.write(
            self.style.SUCCESS(
                f"FHIR semantic evidence validated; artifacts saved to {output_dir}."
            )
        )

    def _build_resources(self, options: dict[str, Any]) -> dict[str, dict[str, Any]]:
        """Load records and reject cross-facility or cross-patient evidence sets."""
        from hmis.apps.encounters.models import Diagnosis
        from hmis.apps.laboratory.models import LabResult
        from hmis.apps.procedures.models import ProcedureOrder

        facility_id = options["facility_id"]
        condition = self._get_or_error(Diagnosis, options["condition_id"], "Condition")
        procedure = self._get_or_error(ProcedureOrder, options["procedure_id"], "Procedure")
        observation = self._get_or_error(LabResult, options["observation_id"], "Observation")
        observation_order = observation.order_item.lab_order

        if (
            condition.encounter.facility_id != facility_id
            or procedure.facility_id != facility_id
            or observation_order.facility_id != facility_id
        ):
            raise CommandError("All semantic evidence records must belong to --facility-id.")
        patient_ids = {
            condition.encounter.patient_id,
            procedure.patient_id,
            observation_order.patient_id,
        }
        if len(patient_ids) != 1:
            raise CommandError(
                "Condition, Procedure, and Observation must belong to one synthetic patient."
            )

        request = RequestFactory().get("/fhir")
        return {
            "condition": FHIRConditionView()._to_fhir_condition(condition, request),
            "procedure": FHIRProcedureView()._to_fhir_procedure(procedure),
            "observation": FHIRObservationView()._lab_result_to_fhir(observation, request),
        }

    @staticmethod
    def _get_or_error(model, primary_key: int, label: str):
        """Get one record or stop before generating incomplete evidence."""
        try:
            return model.objects.select_related().get(pk=primary_key)
        except model.DoesNotExist as exc:
            raise CommandError(f"{label} {primary_key} was not found.") from exc

    @staticmethod
    def _write_json(path: Path, payload: dict[str, Any]) -> None:
        """Write deterministic UTF-8 JSON without modifying source records."""
        path.write_text(
            json.dumps(payload, indent=2, sort_keys=True, default=str) + "\n",
            encoding="utf-8",
        )
