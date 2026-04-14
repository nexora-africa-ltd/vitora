"""
KENHDD Report Service.

Generates exportable compliance reports in JSON and CSV formats.

DHA Compliance: Gap #33 — KENHDD Schema Validation (Sprint 3.D)
"""

from __future__ import annotations

import csv
import io
import json
from typing import Any


class KENHDDReportService:
    """Generates exportable KENHDD compliance reports."""

    def export_compliance_report_json(self, validation_run: Any) -> str:
        """
        Export a validation run as a JSON compliance report.

        Args:
            validation_run: A ``KENHDDValidationRun`` instance.

        Returns:
            JSON string of the report.
        """
        report = {
            "report_type": "KENHDD Compliance Report",
            "resource_type": validation_run.resource_type,
            "run_at": validation_run.run_at.isoformat(),
            "run_by": (validation_run.run_by.get_full_name() if validation_run.run_by else None),
            "summary": {
                "records_checked": validation_run.records_checked,
                "records_compliant": validation_run.records_compliant,
                "compliance_score": float(validation_run.compliance_score),
                "mandatory_pass_rate": float(validation_run.mandatory_pass_rate),
            },
            "violations": validation_run.violations,
        }
        return json.dumps(report, indent=2, default=str)

    def export_compliance_report_csv(self, validation_run: Any) -> str:
        """
        Export a validation run as a CSV compliance report.

        Args:
            validation_run: A ``KENHDDValidationRun`` instance.

        Returns:
            CSV string of the report.
        """
        output = io.StringIO()
        writer = csv.writer(output)

        # Header
        writer.writerow(["KENHDD Compliance Report"])
        writer.writerow(["Resource Type", validation_run.resource_type])
        writer.writerow(["Run At", validation_run.run_at.isoformat()])
        writer.writerow(
            [
                "Run By",
                validation_run.run_by.get_full_name() if validation_run.run_by else "N/A",
            ]
        )
        writer.writerow([])

        # Summary
        writer.writerow(["Summary"])
        writer.writerow(["Records Checked", validation_run.records_checked])
        writer.writerow(["Records Compliant", validation_run.records_compliant])
        writer.writerow(
            [
                "Compliance Score (%)",
                float(validation_run.compliance_score),
            ]
        )
        writer.writerow(
            [
                "Mandatory Pass Rate (%)",
                float(validation_run.mandatory_pass_rate),
            ]
        )
        writer.writerow([])

        # Violations
        writer.writerow(["Violations by Element"])
        writer.writerow(["Element ID", "Violation Count"])
        for element_id, count in validation_run.violations.items():
            writer.writerow([element_id, count])

        return output.getvalue()
