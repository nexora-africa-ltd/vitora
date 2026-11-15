# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Validate DHA synthetic FHIR exports with local screening and HAPI FHIR R4.

Run: ``python manage.py validate_fhir_r4_evidence --patient-id ... --encounter-id ...``
with all four resource IDs and ``--output-dir``. Inputs must identify DHA-only
synthetic records. The command writes export JSON, HAPI OperationOutcomes, and a
summary report; HAPI failure exits non-zero and is never treated as a local pass.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.test import RequestFactory

from hmis.apps.core.fhir.views_clinical_resources import FHIRDiagnosticReportView
from hmis.apps.core.fhir.views_encounter import FHIREncounterView
from hmis.apps.core.fhir.views_observation_condition import FHIRObservationView
from hmis.apps.core.fhir.views_patient_admin import FHIRPatientView
from hmis.apps.core.services.hapi_r4_validation import HAPIR4ValidationService


class Command(BaseCommand):
    """Generate controlled, authoritative HAPI R4 validation evidence."""

    help = "Validate four DHA synthetic FHIR exports against HAPI FHIR R4 and save evidence."

    def add_arguments(self, parser) -> None:
        """Register required synthetic resource IDs and an output directory."""
        parser.add_argument("--patient-id", type=int, required=True)
        parser.add_argument("--encounter-id", type=int, required=True)
        parser.add_argument("--observation-id", type=int, required=True)
        parser.add_argument("--diagnostic-report-id", type=int, required=True)
        parser.add_argument("--output-dir", type=Path, required=True)

    def handle(self, *args, **options) -> None:
        """Export resources, require HAPI validation, and write retained evidence."""
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
        report = {
            "validation_authority": "HAPI FHIR R4 4.0.1 $validate",
            "passed": passed,
            "results": results,
        }
        self._write_json(output_dir / "validation-report.json", report)

        if not passed:
            raise CommandError(
                "FHIR R4 evidence validation failed or was not authoritatively validated. "
                f"Review {output_dir / 'validation-report.json'}."
            )

        self.stdout.write(
            self.style.SUCCESS(f"FHIR R4 evidence validated; artifacts saved to {output_dir}.")
        )

    def _build_resources(self, options: dict[str, Any]) -> dict[str, dict[str, Any]]:
        """Load the requested synthetic records and map each to FHIR JSON."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.laboratory.models import DiagnosticReport, LabResult
        from hmis.apps.patients.models import Patient

        patient = self._get_or_error(Patient, options["patient_id"], "Patient")
        encounter = self._get_or_error(Encounter, options["encounter_id"], "Encounter")
        observation = self._get_or_error(LabResult, options["observation_id"], "LabResult")
        report = self._get_or_error(
            DiagnosticReport,
            options["diagnostic_report_id"],
            "DiagnosticReport",
        )

        expected_patient_id = patient.id
        linked_patient_ids = {
            encounter.patient_id,
            observation.order_item.lab_order.patient_id,
            report.lab_order.patient_id,
        }
        if linked_patient_ids != {expected_patient_id}:
            raise CommandError(
                "All provided Encounter, Observation, and DiagnosticReport records must belong to --patient-id."
            )

        parsed_base_url = urlparse(settings.FHIR_BASE_URL)
        request = RequestFactory().get(
            "/fhir",
            HTTP_HOST=parsed_base_url.netloc,
            secure=parsed_base_url.scheme == "https",
        )
        return {
            "patient": FHIRPatientView()._to_fhir_patient(patient, request),
            "encounter": FHIREncounterView.to_fhir_resource(encounter),
            "observation": FHIRObservationView()._lab_result_to_fhir(observation, request),
            "diagnostic-report": FHIRDiagnosticReportView()._to_fhir_diagnostic_report(report),
        }

    @staticmethod
    def _get_or_error(model, primary_key: int, label: str):
        """Get one required record or stop before generating incomplete evidence."""
        try:
            return model.objects.select_related().get(pk=primary_key)
        except model.DoesNotExist as exc:
            raise CommandError(f"{label} {primary_key} was not found.") from exc

    @staticmethod
    def _write_json(path: Path, payload: dict[str, Any]) -> None:
        """Write deterministic UTF-8 JSON evidence without changing source records."""
        path.write_text(
            json.dumps(payload, indent=2, sort_keys=True, default=str) + "\n", encoding="utf-8"
        )
