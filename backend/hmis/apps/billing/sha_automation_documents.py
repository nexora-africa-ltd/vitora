# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: F405
"""Billing sha automation documents for Vitora HMIS.

What this file is for:
- Implement sha automation documents logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.billing.sha_automation_shared import *  # noqa: F403
from hmis.apps.billing.sha_automation_shared import _sha_automation_handled_exceptions


class SHAClaimAutomationDocumentsMixin:
    @classmethod
    def auto_attach_documents(cls, claim_id: int) -> dict:
        """
        Auto-generate and attach digital documents to a SHA claim.

        The DHA HIE attachment endpoint accepts multipart file uploads.
        This method renders clinical data (lab results, notes, prescriptions)
        to simple text/PDF-like content, saves to a Django FileField, and
        creates local SHAClaimAttachment records. On claim submission, the
        existing IlmClaimService.add_attachment() picks them up and POSTs
        to DHA's /api/v1/claims/attachments as multipart.

        Returns:
            Dict with 'attached' count, 'already_attached' count, and details.
        """
        from django.core.files.base import ContentFile

        from hmis.apps.billing.models import SHAClaim, SHAClaimAttachment

        try:
            claim = SHAClaim.objects.select_related("encounter", "patient").get(pk=claim_id)
            encounter = claim.encounter
            if not encounter:
                return {"attached": 0, "error": "No encounter linked"}

            # Get existing attachment types for this claim
            existing_types = set(
                SHAClaimAttachment.objects.filter(claim=claim).values_list(
                    "attachment_type", flat=True
                )
            )

            attached = 0
            already_attached = 0

            # --- Lab results → lab_report ---
            if "lab_report" not in existing_types:
                lab_content = cls._render_lab_results_text(encounter, claim)
                if lab_content:
                    pdf_bytes = cls._render_text_pdf_bytes(lab_content)
                    file_obj = ContentFile(pdf_bytes, name=f"lab_results_{claim.claim_number}.pdf")
                    SHAClaimAttachment.objects.create(
                        claim=claim,
                        attachment_type="lab_report",
                        name=f"Lab Results - {claim.claim_number}",
                        description=(
                            "Auto-generated laboratory results report from verified encounter "
                            "lab results for claim support"
                        ),
                        file=file_obj,
                        file_size=len(pdf_bytes),
                        mime_type="application/pdf",
                        original_filename=f"lab_results_{claim.claim_number}.pdf",
                        uploaded_by=claim.created_by,
                    )
                    attached += 1
            else:
                already_attached += 1

            # --- Comprehensive report → medical_report ---
            if "medical_report" not in existing_types:
                medical_report_content = cls._render_medical_report_text(
                    encounter, claim.patient, claim
                )
                if medical_report_content:
                    pdf_bytes = cls._render_text_pdf_bytes(medical_report_content)
                    file_obj = ContentFile(
                        pdf_bytes,
                        name=f"medical_report_{claim.claim_number}.pdf",
                    )
                    SHAClaimAttachment.objects.create(
                        claim=claim,
                        attachment_type="medical_report",
                        name=f"Medical Report - {claim.claim_number}",
                        description=(
                            "Auto-generated comprehensive medical report from encounter context, "
                            "diagnostic findings, treatment timeline, and disposition"
                        ),
                        file=file_obj,
                        file_size=len(pdf_bytes),
                        mime_type="application/pdf",
                        original_filename=f"medical_report_{claim.claim_number}.pdf",
                        uploaded_by=claim.created_by,
                    )
                    attached += 1
            else:
                already_attached += 1

            # --- Clinical notes → clinical_notes ---
            if "clinical_notes" not in existing_types:
                notes_content = cls._render_clinical_notes_text(encounter, claim.patient, claim)
                if notes_content:
                    pdf_bytes = cls._render_text_pdf_bytes(notes_content)
                    file_obj = ContentFile(
                        pdf_bytes,
                        name=f"clinical_notes_{claim.claim_number}.pdf",
                    )
                    SHAClaimAttachment.objects.create(
                        claim=claim,
                        attachment_type="clinical_notes",
                        name=f"Clinical Notes - {claim.claim_number}",
                        description=(
                            "Auto-generated clinical notes summary from encounter narrative, "
                            "structured vitals, and inpatient timeline"
                        ),
                        file=file_obj,
                        file_size=len(pdf_bytes),
                        mime_type="application/pdf",
                        original_filename=f"clinical_notes_{claim.claim_number}.pdf",
                        uploaded_by=claim.created_by,
                    )
                    attached += 1
            else:
                already_attached += 1

            # --- Invoice summary → invoice (required for submission validation) ---
            if "invoice" not in existing_types:
                invoice_content = cls._render_invoice_text(claim)
                if invoice_content:
                    pdf_bytes = cls._render_text_pdf_bytes(invoice_content)
                    file_obj = ContentFile(pdf_bytes, name=f"invoice_{claim.claim_number}.pdf")
                    SHAClaimAttachment.objects.create(
                        claim=claim,
                        attachment_type="invoice",
                        name=f"Invoice - {claim.claim_number}",
                        description=(
                            "Auto-generated invoice summary from linked invoice or claim line items"
                        ),
                        file=file_obj,
                        file_size=len(pdf_bytes),
                        mime_type="application/pdf",
                        original_filename=f"invoice_{claim.claim_number}.pdf",
                        uploaded_by=claim.created_by,
                    )
                    attached += 1
            else:
                already_attached += 1

            # --- Prescriptions → prescription ---
            if "prescription" not in existing_types:
                rx_content = cls._render_prescriptions_text(encounter, claim)
                if rx_content:
                    pdf_bytes = cls._render_text_pdf_bytes(rx_content)
                    file_obj = ContentFile(
                        pdf_bytes,
                        name=f"prescriptions_{claim.claim_number}.pdf",
                    )
                    SHAClaimAttachment.objects.create(
                        claim=claim,
                        attachment_type="prescription",
                        name=f"Prescriptions - {claim.claim_number}",
                        description=(
                            "Auto-generated prescription record from encounter medication orders"
                        ),
                        file=file_obj,
                        file_size=len(pdf_bytes),
                        mime_type="application/pdf",
                        original_filename=f"prescriptions_{claim.claim_number}.pdf",
                        uploaded_by=claim.created_by,
                    )
                    attached += 1
            else:
                already_attached += 1

            return {"attached": attached, "already_attached": already_attached}

        except _sha_automation_handled_exceptions():
            logger.exception("Auto-attach documents failed for claim %s", claim_id)
            return {"attached": 0, "error": "Auto-attach documents failed"}

    @classmethod
    def _render_text_pdf_bytes(cls, content: str) -> bytes:
        """Render plain text into a simple PDF byte stream for SHA attachments."""
        from io import BytesIO

        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas

        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4
        x = 40
        y = height - 40
        max_width = width - 80
        line_height = 14

        for raw_line in content.splitlines() or [""]:
            line = raw_line or " "
            while line:
                chunk = line
                while pdf.stringWidth(chunk, "Helvetica", 10) > max_width and len(chunk) > 1:
                    chunk = chunk[:-1]
                pdf.setFont("Helvetica", 10)
                pdf.drawString(x, y, chunk)
                y -= line_height
                line = line[len(chunk) :]
                if y < 50:
                    pdf.showPage()
                    y = height - 40

        pdf.save()
        return buffer.getvalue()

    @classmethod
    def _render_invoice_text(cls, claim) -> str | None:
        """Render invoice summary text for required invoice attachment.

        Preferred source: linked local invoice.
        Fallback source: SHA claim items + DHA invoice number.
        """
        invoice = getattr(claim, "invoice", None)
        if invoice:
            lines: list[str] = []
            append_standard_header(lines, title="INVOICE SUMMARY", claim=claim)
            lines.extend(
                [
                    "Invoice Context",
                    "---------------",
                    f"Invoice Number: {invoice.invoice_number or 'N/A'}",
                    f"Invoice Date: {invoice.invoice_date or 'N/A'}",
                    "",
                    "Invoice Lines",
                    "-------------",
                ]
            )

            items = list(invoice.items.all()) if hasattr(invoice, "items") else []
            if items:
                for item in items:
                    description = getattr(item, "description", "") or getattr(
                        item, "service_name", ""
                    )
                    quantity = getattr(item, "quantity", "")
                    unit_price = getattr(item, "unit_price", "")
                    line_total = getattr(item, "line_total", "")
                    lines.append(
                        f"- {description} | Qty: {quantity} | Unit: {unit_price} | Total: {line_total}"
                    )
            else:
                lines.append("No invoice line items found.")

            total_amount = getattr(invoice, "total_amount", None)
            if total_amount is not None:
                lines.extend(["", f"Invoice Total: {total_amount}"])

            return "\n".join(lines)

        # Fallback: render from claim items + DHA invoice number.
        claim_items = (
            list(claim.items.select_related("tariff").all()) if hasattr(claim, "items") else []
        )
        dha_invoice_number = getattr(claim, "dha_invoice_number", "") or ""

        if not claim_items and not dha_invoice_number:
            return None

        lines: list[str] = []
        append_standard_header(lines, title="INVOICE SUMMARY (AUTO-GENERATED)", claim=claim)
        lines.extend(
            [
                "Invoice Context",
                "---------------",
                f"DHA Invoice Number: {dha_invoice_number or 'N/A'}",
                f"Service Date: {getattr(claim, 'service_date', '') or 'N/A'}",
                "Source: SHA claim items (no linked local invoice)",
                "",
                "Claim Item Lines",
                "----------------",
            ]
        )

        if claim_items:
            for item in claim_items:
                tariff_code = getattr(getattr(item, "tariff", None), "code", "") or ""
                description = getattr(item, "description", "") or ""
                quantity = getattr(item, "quantity", "")
                unit_price = getattr(item, "unit_price", "")
                line_total = getattr(item, "claimed_amount", "")
                code_prefix = f"[{tariff_code}] " if tariff_code else ""
                lines.append(
                    f"- {code_prefix}{description} | Qty: {quantity} | Unit: {unit_price} | Total: {line_total}"
                )
        else:
            lines.append("No SHA claim items found.")

        claimed_total = getattr(claim, "claimed_amount", None)
        if claimed_total is not None:
            lines.extend(["", f"Claim Total: {claimed_total}"])

        return "\n".join(lines)

    @classmethod
    def _render_lab_results_text(cls, encounter, claim=None) -> str | None:
        """Render verified lab results as structured text for SHA attachment."""
        lab_results = cls._get_completed_lab_results(encounter)
        if not lab_results:
            return None

        lines: list[str] = []
        if claim is not None:
            append_standard_header(lines, title="LABORATORY RESULTS REPORT", claim=claim)
            lines.extend(
                [
                    "Encounter Context",
                    "-----------------",
                    f"Patient: {encounter.patient}",
                    f"Encounter Date: {encounter.encounter_date}",
                    "",
                    "Verified Results",
                    "----------------",
                ]
            )
        else:
            lines.extend(
                [
                    "LABORATORY RESULTS REPORT",
                    f"Patient: {encounter.patient}",
                    f"Encounter Date: {encounter.encounter_date}",
                    f"Generated: {timezone.now().strftime('%Y-%m-%d %H:%M')}",
                    "-" * 50,
                    "",
                ]
            )

        for result in lab_results:
            test_name = getattr(result, "test_name", "") or getattr(result, "test", "")
            value = getattr(result, "value", "") or getattr(result, "result_value", "")
            unit = getattr(result, "unit", "") or ""
            ref_range = getattr(result, "reference_range", "") or ""
            status = getattr(result, "status", "")

            lines.append(f"Test: {test_name or 'Unnamed test'}")
            lines.append(f"  Result: {value} {unit}")
            if ref_range:
                lines.append(f"  Reference Range: {ref_range}")
            if status:
                lines.append(f"  Status: {status}")
            lines.append("")

        return "\n".join(lines)

    @classmethod
    def _render_clinical_notes_text(cls, encounter, patient, claim=None) -> str | None:
        """Render clinical notes as structured text for SHA attachment."""
        chief_complaint = encounter.chief_complaint or ""
        clinical_notes = getattr(encounter, "clinical_notes", "") or ""
        encounter_notes = getattr(encounter, "notes", "") or ""
        inpatient_summary = ""
        discharge_summary = ""

        if getattr(encounter, "encounter_type", "") == "IPD":
            try:
                from hmis.apps.inpatient.services.clinical_summary import (
                    compose_inpatient_clinical_summary_text,
                )

                inpatient_summary = compose_inpatient_clinical_summary_text(encounter)
            except _sha_automation_handled_exceptions():
                inpatient_summary = ""

            discharge = getattr(getattr(encounter, "admission", None), "discharge", None)
            if discharge is not None:
                discharge_lines = ["DISCHARGE SUMMARY", "-" * 50]
                discharge_date = getattr(discharge, "discharge_date", None)
                if discharge_date is not None:
                    discharge_lines.append(f"Discharge date: {discharge_date}")

                discharge_type = ""
                if hasattr(discharge, "get_discharge_type_display"):
                    discharge_type = discharge.get_discharge_type_display() or ""
                if discharge_type:
                    discharge_lines.append(f"Discharge type: {discharge_type}")

                final_dx = getattr(discharge, "final_diagnosis_text", "") or getattr(
                    discharge, "final_diagnosis", ""
                )
                if final_dx:
                    discharge_lines.append(f"Final diagnosis: {final_dx}")

                treatment_summary = getattr(discharge, "treatment_summary", "") or ""
                if treatment_summary:
                    discharge_lines.append("")
                    discharge_lines.append("Treatment summary:")
                    discharge_lines.append(treatment_summary)

                procedures = getattr(discharge, "procedures_performed", "") or ""
                if procedures:
                    discharge_lines.append("")
                    discharge_lines.append("Procedures performed:")
                    discharge_lines.append(procedures)

                discharge_meds = getattr(discharge, "discharge_medications", []) or []
                if isinstance(discharge_meds, list) and discharge_meds:
                    discharge_lines.append("")
                    discharge_lines.append("Discharge medications:")
                    for med in discharge_meds[:20]:
                        if not isinstance(med, dict):
                            continue
                        drug_name = str(med.get("drug_name") or "").strip()
                        dosage = str(med.get("dosage") or "").strip()
                        frequency = str(med.get("frequency") or "").strip()
                        duration = str(med.get("duration") or "").strip()
                        med_line = drug_name or "Medication"
                        details = ", ".join(x for x in [dosage, frequency, duration] if x)
                        if details:
                            med_line = f"{med_line} ({details})"
                        discharge_lines.append(f"- {med_line}")

                patient_instructions = getattr(discharge, "patient_instructions", "") or ""
                if patient_instructions:
                    discharge_lines.append("")
                    discharge_lines.append("Patient instructions:")
                    discharge_lines.append(patient_instructions)

                discharge_summary = "\n".join(discharge_lines).strip()

        if (
            not chief_complaint
            and not clinical_notes
            and not encounter_notes
            and not inpatient_summary
            and not discharge_summary
        ):
            return None

        lines: list[str] = []
        if claim is not None:
            append_standard_header(lines, title="CLINICAL NOTES", claim=claim)
            lines.extend(
                [
                    "Encounter Context",
                    "-----------------",
                    f"Patient: {patient}",
                    f"Encounter Date: {encounter.encounter_date}",
                    f"Encounter Type: {encounter.encounter_type}",
                    "",
                ]
            )
        else:
            lines.extend(
                [
                    "CLINICAL NOTES",
                    f"Patient: {patient}",
                    f"Encounter Date: {encounter.encounter_date}",
                    f"Encounter Type: {encounter.encounter_type}",
                    f"Generated: {timezone.now().strftime('%Y-%m-%d %H:%M')}",
                    "-" * 50,
                    "",
                ]
            )

        if chief_complaint:
            lines.append(f"Chief Complaint: {chief_complaint}")
            lines.append("")

        if clinical_notes:
            lines.append("Clinical Notes:")
            lines.append(clinical_notes)
            lines.append("")

        if encounter_notes:
            lines.append("Encounter Notes:")
            lines.append(encounter_notes)
            lines.append("")

        if inpatient_summary:
            lines.append(inpatient_summary)
            lines.append("")

        if discharge_summary:
            lines.append(discharge_summary)
            lines.append("")

        # Include diagnoses if available
        diagnoses = encounter.diagnoses.all() if hasattr(encounter, "diagnoses") else []
        if diagnoses:
            lines.append("Diagnoses:")
            for dx in diagnoses:
                code = (getattr(dx, "icd_code", "") or getattr(dx, "code", "") or "").strip()
                desc = (getattr(dx, "description", "") or "").strip()
                if not code and not desc:
                    fallback_code = str(getattr(claim, "primary_diagnosis_code", "") or "").strip()
                    fallback_desc = str(
                        getattr(claim, "primary_diagnosis_description", "") or ""
                    ).strip()
                    if fallback_code or fallback_desc:
                        lines.append(
                            f"  - {fallback_code or 'N/A'}: {fallback_desc or 'Primary diagnosis'}"
                        )
                    continue
                if code and desc:
                    lines.append(f"  - {code}: {desc}")
                elif code:
                    lines.append(f"  - {code}")
                else:
                    lines.append(f"  - {desc}")
            lines.append("")

        # Include vitals if available
        vitals = []
        if encounter.temperature:
            vitals.append(f"Temp: {encounter.temperature}°C")
        if encounter.pulse:
            vitals.append(f"Pulse: {encounter.pulse} bpm")
        if encounter.blood_pressure:
            vitals.append(f"BP: {encounter.blood_pressure}")
        if encounter.spo2:
            vitals.append(f"SpO2: {encounter.spo2}%")
        if vitals:
            lines.append(f"Vitals: {', '.join(vitals)}")
            lines.append("")

        return "\n".join(lines)

    @classmethod
    def _render_medical_report_text(cls, encounter, patient, claim=None) -> str | None:
        """Render a comprehensive medical report for DHA MEDICAL_REPORT uploads."""
        clinical_notes = cls._render_clinical_notes_text(encounter, patient, claim)
        lab_results = cls._get_completed_lab_results(encounter)
        prescriptions = cls._get_encounter_prescriptions(encounter)
        invoice_text = cls._render_invoice_text(claim) if claim is not None else None

        if not clinical_notes and not lab_results and not prescriptions and not invoice_text:
            return None

        lines: list[str] = []
        if claim is not None:
            append_standard_header(lines, title="COMPREHENSIVE MEDICAL REPORT", claim=claim)
            lines.extend(
                [
                    "Report Context",
                    "--------------",
                    f"Patient: {patient}",
                    f"Encounter Date: {encounter.encounter_date}",
                    f"Encounter Type: {encounter.encounter_type}",
                    "",
                ]
            )
        else:
            lines.extend(
                [
                    "COMPREHENSIVE MEDICAL REPORT",
                    f"Patient: {patient}",
                    f"Encounter Date: {encounter.encounter_date}",
                    f"Encounter Type: {encounter.encounter_type}",
                    f"Generated: {timezone.now().strftime('%Y-%m-%d %H:%M')}",
                    "-" * 50,
                    "",
                ]
            )

        if clinical_notes:
            lines.extend(["Clinical Narrative", "------------------", clinical_notes.strip(), ""])

        if lab_results:
            lines.extend(["Laboratory Findings", "-------------------"])
            for result in lab_results:
                test_name = getattr(result, "test_name", "") or getattr(result, "test", "")
                value = getattr(result, "value", "") or getattr(result, "result_value", "")
                unit = getattr(result, "unit", "") or ""
                ref_range = getattr(result, "reference_range", "") or ""
                status = getattr(result, "status", "") or ""
                rendered_result = f"{value} {unit}".strip() or "N/A"
                lines.append(f"- {test_name or 'Unnamed test'}: {rendered_result}")
                if ref_range:
                    lines.append(f"  Reference range: {ref_range}")
                if status:
                    lines.append(f"  Result status: {status}")
            lines.append("")

        if prescriptions:
            lines.extend(["Medication Plan", "---------------"])
            for rx in prescriptions:
                med_name = (
                    getattr(rx, "medication_name", "") or getattr(rx, "drug_name", "") or str(rx)
                )
                dosage = getattr(rx, "dosage", "") or ""
                frequency = getattr(rx, "frequency", "") or ""
                duration = getattr(rx, "duration", "") or ""
                details = ", ".join(part for part in [dosage, frequency, duration] if part)
                if details:
                    lines.append(f"- {med_name}: {details}")
                else:
                    lines.append(f"- {med_name}")
            lines.append("")

        if invoice_text:
            lines.extend(["Financial Summary", "-----------------"])
            invoice_lines = [line for line in invoice_text.splitlines() if line.strip()]
            lines.extend(invoice_lines[:25])
            lines.append("")

        return "\n".join(lines).strip()

    @classmethod
    def _render_prescriptions_text(cls, encounter, claim=None) -> str | None:
        """Render prescriptions as structured text for SHA attachment."""
        prescriptions = cls._get_encounter_prescriptions(encounter)
        if not prescriptions:
            return None

        lines: list[str] = []
        if claim is not None:
            append_standard_header(lines, title="PRESCRIPTION RECORD", claim=claim)
            lines.extend(
                [
                    "Encounter Context",
                    "-----------------",
                    f"Patient: {encounter.patient}",
                    f"Encounter Date: {encounter.encounter_date}",
                    "",
                    "Prescription Lines",
                    "------------------",
                ]
            )
        else:
            lines.extend(
                [
                    "PRESCRIPTION RECORD",
                    f"Patient: {encounter.patient}",
                    f"Encounter Date: {encounter.encounter_date}",
                    f"Generated: {timezone.now().strftime('%Y-%m-%d %H:%M')}",
                    "-" * 50,
                    "",
                ]
            )

        for rx in prescriptions:
            med_name = getattr(rx, "medication_name", "") or getattr(rx, "drug_name", "") or str(rx)
            dosage = getattr(rx, "dosage", "") or ""
            frequency = getattr(rx, "frequency", "") or ""
            duration = getattr(rx, "duration", "") or ""

            lines.append(f"Medication: {med_name}")
            if dosage:
                lines.append(f"  Dosage: {dosage}")
            if frequency:
                lines.append(f"  Frequency: {frequency}")
            if duration:
                lines.append(f"  Duration: {duration}")
            lines.append("")

        return "\n".join(lines)

    @classmethod
    def _get_completed_lab_results(cls, encounter):
        """Get completed lab results for an encounter."""
        try:
            from hmis.apps.laboratory.models import LabResult

            return list(
                LabResult.objects.filter(
                    order__encounter=encounter,
                    status="VERIFIED",
                )
            )
        except _sha_automation_handled_exceptions():
            return []

    @classmethod
    def _get_encounter_prescriptions(cls, encounter):
        """Get prescriptions linked to an encounter."""
        try:
            from hmis.apps.pharmacy.models import Prescription

            return list(Prescription.objects.filter(encounter=encounter))
        except _sha_automation_handled_exceptions():
            return []

    # -------------------------------------------------------------------------
    # 5. Remittance fetch and reconciliation
    # -------------------------------------------------------------------------
