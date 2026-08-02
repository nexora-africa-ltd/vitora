from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime
from io import BytesIO

from django.core.files.base import ContentFile
from django.db.models import Q
from django.utils import timezone

from hmis.apps.billing.models import SHAClaim, SHAClaimAttachment
from hmis.apps.billing.services.document_context import append_standard_header
from hmis.apps.imaging.models import ImagingOrder, RadiologyReport
from hmis.apps.inpatient.models import Admission, Discharge, Transfer, WardRound
from hmis.apps.laboratory.models import LabOrder, LabResult
from hmis.apps.pharmacy.models import Dispensing, Prescription

AUTO_CRITICAL_CARE_MARKER = "AUTO_CRITICAL_CARE_NOTE_FROM_ADMISSION"
AUTO_DISCHARGE_SUMMARY_MARKER = "AUTO_DISCHARGE_SUMMARY_FROM_ADMISSION"


@dataclass
class GeneratedAttachmentResult:
    attachment_id: int | None
    created: bool
    updated: bool
    skipped_reason: str = ""


@dataclass
class AdmissionAttachmentBundleResult:
    critical_care: GeneratedAttachmentResult
    discharge_summary: GeneratedAttachmentResult


class AdmissionAttachmentService:
    """Auto-generate admission-scoped CCU and discharge summary attachments."""

    @classmethod
    def ensure_for_claim(cls, *, claim: SHAClaim, user) -> AdmissionAttachmentBundleResult:
        uploader = user or getattr(claim, "created_by", None)
        if uploader is None:
            skipped = GeneratedAttachmentResult(None, False, False, "missing_uploader")
            return AdmissionAttachmentBundleResult(
                critical_care=skipped,
                discharge_summary=skipped,
            )

        admission = cls._resolve_admission(claim)
        if admission is None:
            missing = GeneratedAttachmentResult(None, False, False, "missing_admission_context")
            return AdmissionAttachmentBundleResult(
                critical_care=missing,
                discharge_summary=missing,
            )

        start, end = cls._admission_window(admission)
        ward_timeline = cls._ward_timeline(admission, start=start, end=end)
        critical_intervals = [
            (item["start"], item["end"], item["ward_name"])
            for item in ward_timeline
            if item["is_critical"]
        ]

        critical_result = cls._ensure_critical_care_attachment(
            claim=claim,
            uploader=uploader,
            admission=admission,
            start=start,
            end=end,
            ward_timeline=ward_timeline,
            critical_intervals=critical_intervals,
        )
        discharge_result = cls._ensure_discharge_summary_attachment(
            claim=claim,
            uploader=uploader,
            admission=admission,
            start=start,
            end=end,
            ward_timeline=ward_timeline,
        )
        return AdmissionAttachmentBundleResult(
            critical_care=critical_result,
            discharge_summary=discharge_result,
        )

    @classmethod
    def _resolve_admission(cls, claim: SHAClaim) -> Admission | None:
        encounter = getattr(claim, "encounter", None)
        if encounter is not None:
            admission = getattr(encounter, "admission", None)
            if admission is not None:
                return admission
            resolved = Admission.objects.filter(ipd_encounter=encounter).first()
            if resolved is not None:
                return resolved

        invoice_encounter = getattr(getattr(claim, "invoice", None), "encounter", None)
        if invoice_encounter is not None:
            admission = getattr(invoice_encounter, "admission", None)
            if admission is not None:
                return admission
            return Admission.objects.filter(ipd_encounter=invoice_encounter).first()

        return None

    @staticmethod
    def _admission_window(admission: Admission) -> tuple[datetime, datetime]:
        start = admission.admission_date
        discharge = getattr(admission, "discharge", None)
        end = (
            admission.discharge_date or getattr(discharge, "discharge_date", None) or timezone.now()
        )
        if end < start:
            end = start
        return start, end

    @classmethod
    def _ward_timeline(
        cls,
        admission: Admission,
        *,
        start: datetime,
        end: datetime,
    ) -> list[dict[str, object]]:
        transfers = list(
            admission.transfers.select_related("source_ward", "destination_ward").order_by(
                "transfer_date", "id"
            )
        )
        if transfers:
            initial_ward = transfers[0].source_ward
        else:
            initial_ward = admission.ward

        change_points: list[tuple[datetime, object]] = [(start, initial_ward)]
        for transfer in transfers:
            ts = transfer.transfer_date
            if ts < start or ts > end:
                continue
            change_points.append((ts, transfer.destination_ward))
        change_points.sort(key=lambda item: item[0])

        timeline: list[dict[str, object]] = []
        for idx, (point_start, ward) in enumerate(change_points):
            next_ts = change_points[idx + 1][0] if idx + 1 < len(change_points) else end
            if next_ts < point_start:
                next_ts = point_start
            ward_name = getattr(ward, "name", "Unknown Ward")
            ward_type = getattr(ward, "ward_type", "")
            timeline.append(
                {
                    "start": point_start,
                    "end": next_ts,
                    "ward_name": ward_name,
                    "ward_type": ward_type,
                    "is_critical": cls._is_critical_ward(ward),
                }
            )
        return timeline

    @staticmethod
    def _is_critical_ward(ward) -> bool:
        ward_type = str(getattr(ward, "ward_type", "") or "").strip().upper()
        ward_name = str(getattr(ward, "name", "") or "").strip().upper()
        ward_code = str(getattr(ward, "code", "") or "").strip().upper()
        if ward_type in {"ICU", "HDU", "NBU", "CRITICAL_CARE"}:
            return True
        haystack = f"{ward_name} {ward_code} {ward_type}"
        return any(
            token in haystack
            for token in ["ICU", "HDU", "NBU", "CRITICAL CARE", "HIGH DEPENDENCY", "NEWBORN"]
        )

    @staticmethod
    def _in_window(ts: datetime | None, start: datetime, end: datetime) -> bool:
        if ts is None:
            return False
        return start <= ts <= end

    @staticmethod
    def _in_any_interval(ts: datetime, intervals: list[tuple[datetime, datetime, str]]) -> bool:
        for interval_start, interval_end, _ward_name in intervals:
            if interval_start <= ts <= interval_end:
                return True
        return False

    @classmethod
    def _ensure_critical_care_attachment(
        cls,
        *,
        claim: SHAClaim,
        uploader,
        admission: Admission,
        start: datetime,
        end: datetime,
        ward_timeline: list[dict[str, object]],
        critical_intervals: list[tuple[datetime, datetime, str]],
    ) -> GeneratedAttachmentResult:
        if not critical_intervals:
            return GeneratedAttachmentResult(None, False, False, "no_icu_hdu_nbu_stay")

        manual_existing = (
            claim.attachments.filter(
                attachment_type=SHAClaimAttachment.AttachmentType.CLINICAL_NOTES
            )
            .filter(
                Q(name__icontains="critical care unit case")
                | Q(original_filename__icontains="critical_care_unit_case")
            )
            .exclude(description__icontains=AUTO_CRITICAL_CARE_MARKER)
            .first()
        )
        if manual_existing:
            return GeneratedAttachmentResult(
                manual_existing.id, False, False, "manual_critical_care_note_exists"
            )

        content = cls._render_critical_care_text(
            admission=admission,
            claim=claim,
            start=start,
            end=end,
            ward_timeline=ward_timeline,
            critical_intervals=critical_intervals,
        )
        filename = f"critical_care_unit_case_{claim.claim_number}.pdf"
        return cls._upsert_attachment(
            claim=claim,
            uploader=uploader,
            attachment_type=SHAClaimAttachment.AttachmentType.CLINICAL_NOTES,
            attachment_name=f"Critical Care Unit Case - {claim.claim_number}",
            marker=AUTO_CRITICAL_CARE_MARKER,
            description=(
                "Auto-generated critical care unit case notes from admission-scoped ICU/HDU/NBU "
                "timeline and chronological clinical events"
            ),
            content=content,
            filename=filename,
            find_existing_q=Q(description__icontains=AUTO_CRITICAL_CARE_MARKER)
            | Q(name__icontains="critical care unit case")
            | Q(original_filename__icontains="critical_care_unit_case"),
        )

    @classmethod
    def _ensure_discharge_summary_attachment(
        cls,
        *,
        claim: SHAClaim,
        uploader,
        admission: Admission,
        start: datetime,
        end: datetime,
        ward_timeline: list[dict[str, object]],
    ) -> GeneratedAttachmentResult:
        manual_existing = (
            claim.attachments.filter(
                attachment_type=SHAClaimAttachment.AttachmentType.DISCHARGE_SUMMARY
            )
            .exclude(description__icontains=AUTO_DISCHARGE_SUMMARY_MARKER)
            .first()
        )
        if manual_existing:
            return GeneratedAttachmentResult(
                manual_existing.id, False, False, "manual_discharge_summary_exists"
            )

        content = cls._render_discharge_summary_text(
            admission=admission,
            claim=claim,
            start=start,
            end=end,
            ward_timeline=ward_timeline,
        )
        filename = f"discharge_summary_{claim.claim_number}.pdf"
        return cls._upsert_attachment(
            claim=claim,
            uploader=uploader,
            attachment_type=SHAClaimAttachment.AttachmentType.DISCHARGE_SUMMARY,
            attachment_name=f"Discharge Summary - {claim.claim_number}",
            marker=AUTO_DISCHARGE_SUMMARY_MARKER,
            description=(
                "Auto-generated discharge summary from admission-scoped ward timeline, "
                "clinical highlights, and discharge workflow state"
            ),
            content=content,
            filename=filename,
            find_existing_q=Q(description__icontains=AUTO_DISCHARGE_SUMMARY_MARKER)
            | Q(name__icontains="discharge summary")
            | Q(original_filename__icontains="discharge_summary"),
        )

    @classmethod
    def _render_critical_care_text(
        cls,
        *,
        admission: Admission,
        claim: SHAClaim,
        start: datetime,
        end: datetime,
        ward_timeline: list[dict[str, object]],
        critical_intervals: list[tuple[datetime, datetime, str]],
    ) -> str:
        lines: list[str] = []
        append_standard_header(lines, title="CRITICAL CARE UNIT CASE", claim=claim)
        lines.extend(
            [
                "Admission Context",
                "-----------------",
                f"Admission Number: {admission.admission_number}",
                f"Patient ID: {admission.patient_id}",
                f"Admission Window: {start.isoformat()} -> {end.isoformat()}",
                "",
                "Critical Care Intervals",
                "----------------------",
            ]
        )

        for interval_start, interval_end, ward_name in critical_intervals:
            lines.append(
                f"- {timezone.localtime(interval_start).strftime('%Y-%m-%d %H:%M')} -> "
                f"{timezone.localtime(interval_end).strftime('%Y-%m-%d %H:%M')} @ {ward_name}"
            )

        lines.extend(["", "Chronological Clinical Timeline", "-----------------------------"])
        events = cls._collect_admission_events(admission=admission, start=start, end=end)
        events = [event for event in events if cls._in_any_interval(event[0], critical_intervals)]
        if not events:
            lines.append(
                "- No ICU/HDU/NBU-specific clinical events captured in this admission window."
            )
        else:
            for timestamp, source, content in sorted(events, key=lambda item: item[0]):
                lines.append(
                    f"[{timezone.localtime(timestamp).strftime('%Y-%m-%d %H:%M')}] {source}: {content}"
                )

        lines.extend(["", "Bed/Ward Timeline", "-----------------"])
        for item in ward_timeline:
            lines.append(
                "- "
                + f"{timezone.localtime(item['start']).strftime('%Y-%m-%d %H:%M')} -> "
                + f"{timezone.localtime(item['end']).strftime('%Y-%m-%d %H:%M')} "
                + f"{item['ward_name']} ({item['ward_type'] or 'N/A'})"
            )
        return "\n".join(lines).strip()

    @classmethod
    def _render_discharge_summary_text(
        cls,
        *,
        admission: Admission,
        claim: SHAClaim,
        start: datetime,
        end: datetime,
        ward_timeline: list[dict[str, object]],
    ) -> str:
        discharge = (
            Discharge.objects.filter(admission=admission).prefetch_related("diagnoses").first()
        )

        lines: list[str] = []
        append_standard_header(lines, title="DISCHARGE SUMMARY", claim=claim)
        lines.extend(
            [
                "Admission Context",
                "-----------------",
                f"Admission Number: {admission.admission_number}",
                f"Admission Date: {timezone.localtime(admission.admission_date).strftime('%Y-%m-%d %H:%M')}",
                (
                    f"Discharge Date: {timezone.localtime(end).strftime('%Y-%m-%d %H:%M')}"
                    if discharge is not None
                    else f"Summary Window End: {timezone.localtime(end).strftime('%Y-%m-%d %H:%M')}"
                ),
                f"Admitting Diagnosis: {admission.admitting_diagnosis} - {admission.admitting_diagnosis_text}",
                "",
            ]
        )

        if discharge is None:
            lines.append("No finalized discharge record exists yet for this admission.")
        else:
            lines.extend(
                [
                    f"Discharge Type: {discharge.discharge_type}",
                    f"Final Diagnosis: {discharge.final_diagnosis} - {discharge.final_diagnosis_text}",
                    f"Treatment Summary: {discharge.treatment_summary or 'N/A'}",
                    f"Procedures Performed: {discharge.procedures_performed or 'N/A'}",
                    f"Follow-up Date: {discharge.follow_up_date or 'N/A'}",
                    f"Follow-up Instructions: {discharge.follow_up_instructions or 'N/A'}",
                    f"Patient Instructions: {discharge.patient_instructions or 'N/A'}",
                ]
            )
            diagnoses = list(discharge.diagnoses.all())
            if diagnoses:
                lines.append("")
                lines.append("Discharge Diagnoses:")
                for diagnosis in diagnoses:
                    lines.append(f"- {diagnosis.role}: {diagnosis.code} - {diagnosis.description}")

        lines.extend(["", "Admission Ward Timeline", "----------------------"])
        for item in ward_timeline:
            lines.append(
                "- "
                + f"{timezone.localtime(item['start']).strftime('%Y-%m-%d %H:%M')} -> "
                + f"{timezone.localtime(item['end']).strftime('%Y-%m-%d %H:%M')} "
                + f"{item['ward_name']} ({item['ward_type'] or 'N/A'})"
            )

        lines.extend(
            ["", "Admission-Scoped Clinical Highlights", "-----------------------------------"]
        )
        events = cls._collect_admission_events(admission=admission, start=start, end=end)
        if not events:
            lines.append("- No chronological events recorded in this admission window.")
        else:
            for timestamp, source, content in sorted(events, key=lambda item: item[0]):
                lines.append(
                    f"[{timezone.localtime(timestamp).strftime('%Y-%m-%d %H:%M')}] {source}: {content}"
                )
        return "\n".join(lines).strip()

    @classmethod
    def _collect_admission_events(
        cls,
        *,
        admission: Admission,
        start: datetime,
        end: datetime,
    ) -> list[tuple[datetime, str, str]]:
        events: list[tuple[datetime, str, str]] = []

        encounter = getattr(admission, "ipd_encounter", None)
        if encounter is not None:
            encounter_ts = getattr(encounter, "vitals_recorded_at", None) or getattr(
                encounter, "created_at", None
            )
            if cls._in_window(encounter_ts, start, end):
                vitals = []
                if getattr(encounter, "temperature", None) is not None:
                    vitals.append(f"Temp {encounter.temperature}")
                if getattr(encounter, "pulse", None) is not None:
                    vitals.append(f"Pulse {encounter.pulse}")
                if getattr(encounter, "respiratory_rate", None) is not None:
                    vitals.append(f"RR {encounter.respiratory_rate}")
                if getattr(encounter, "spo2", None) is not None:
                    vitals.append(f"SpO2 {encounter.spo2}")
                content_parts = []
                if vitals:
                    content_parts.append("Vitals: " + ", ".join(vitals))
                if getattr(encounter, "notes", ""):
                    content_parts.append(f"Notes: {encounter.notes}")
                if getattr(encounter, "assessment", ""):
                    content_parts.append(f"Assessment: {encounter.assessment}")
                if content_parts:
                    events.append((encounter_ts, "Encounter", " | ".join(content_parts)))

        ward_rounds = WardRound.objects.filter(admission=admission).select_related("conducted_by")
        for ward_round in ward_rounds:
            round_ts = datetime.combine(ward_round.round_date, ward_round.round_time)
            if timezone.is_naive(round_ts):
                round_ts = timezone.make_aware(round_ts, timezone.get_current_timezone())
            if not cls._in_window(round_ts, start, end):
                continue
            clinician = (
                ward_round.conducted_by.get_full_name().strip() or ward_round.conducted_by.username
            )
            events.append(
                (
                    round_ts,
                    "Ward Round",
                    (
                        f"By {clinician}; Condition {ward_round.get_condition_status_display()}; "
                        f"Assessment: {ward_round.assessment}; Plan: {ward_round.plan}"
                    ),
                )
            )

        transfers = Transfer.objects.filter(admission=admission).select_related(
            "source_ward", "destination_ward"
        )
        for transfer in transfers:
            if not cls._in_window(transfer.transfer_date, start, end):
                continue
            events.append(
                (
                    transfer.transfer_date,
                    "Ward Transfer",
                    (
                        f"{transfer.source_ward.name} -> {transfer.destination_ward.name}; "
                        f"Reason: {transfer.reason}; Notes: {transfer.reason_details or transfer.clinical_handover_notes or 'N/A'}"
                    ),
                )
            )

        lab_orders = LabOrder.objects.filter(admission=admission).prefetch_related("items__test")
        for order in lab_orders:
            if cls._in_window(order.ordered_at, start, end):
                test_labels: list[str] = []
                for item in order.items.all():
                    test = getattr(item, "test", None)
                    if test is None:
                        continue
                    loinc = str(getattr(test, "loinc_code", "") or "").strip()
                    code = str(getattr(test, "code", "") or "").strip()
                    name = str(getattr(test, "name", "") or "").strip()
                    detail = name or code or "Unnamed test"
                    if loinc:
                        detail = f"{detail} [LOINC {loinc}]"
                    elif code:
                        detail = f"{detail} [{code}]"
                    test_labels.append(detail)
                tests_rendered = (
                    "; ".join(test_labels[:6]) if test_labels else "No test items listed"
                )
                events.append(
                    (
                        order.ordered_at,
                        "Lab Order",
                        (
                            f"{order.order_number} ({order.status}) - Priority {order.priority}; "
                            f"Tests: {tests_rendered}"
                        ),
                    )
                )
        lab_results = LabResult.objects.filter(
            order_item__lab_order__admission=admission
        ).select_related("order_item__test")
        for result in lab_results:
            result_ts = result.verified_at or result.entered_at
            if not cls._in_window(result_ts, start, end):
                continue
            value = result.text_value or result.numeric_value or ""
            events.append(
                (
                    result_ts,
                    "Lab Result",
                    (
                        f"{result.order_item.test.name}: {value} {result.result_unit or ''} "
                        f"({result.result_flag or result.verification_status})"
                    ).strip(),
                )
            )

        imaging_orders = ImagingOrder.objects.filter(admission=admission).prefetch_related(
            "items__procedure"
        )
        for order in imaging_orders:
            if cls._in_window(order.ordered_at, start, end):
                procedure_labels: list[str] = []
                for item in order.items.all():
                    procedure = getattr(item, "procedure", None)
                    if procedure is None:
                        continue
                    name = str(getattr(procedure, "name", "") or "").strip()
                    code = str(getattr(procedure, "code", "") or "").strip()
                    loinc = str(getattr(procedure, "loinc_code", "") or "").strip()
                    label = name or code or "Unnamed procedure"
                    if loinc:
                        label = f"{label} [LOINC {loinc}]"
                    elif code:
                        label = f"{label} [{code}]"
                    procedure_labels.append(label)
                procedures_rendered = (
                    "; ".join(procedure_labels[:6])
                    if procedure_labels
                    else "No procedure items listed"
                )
                events.append(
                    (
                        order.ordered_at,
                        "Imaging Order",
                        (
                            f"{order.order_number} ({order.status}) - Procedures: {procedures_rendered}; "
                            f"Indication: {order.clinical_indication or 'N/A'}"
                        ),
                    )
                )
        reports = RadiologyReport.objects.filter(imaging_order__admission=admission).select_related(
            "imaging_order"
        )
        for report in reports:
            report_ts = report.signed_at or report.created_at
            if not cls._in_window(report_ts, start, end):
                continue
            events.append(
                (
                    report_ts,
                    "Radiology Report",
                    f"{report.imaging_order.order_number}: {report.impression}",
                )
            )

        prescriptions = Prescription.objects.filter(admission=admission)
        for prescription in prescriptions:
            if cls._in_window(prescription.prescribed_at, start, end):
                events.append(
                    (
                        prescription.prescribed_at,
                        "Medication Order",
                        f"{prescription.prescription_number} ({prescription.status})",
                    )
                )

        dispensings = Dispensing.objects.filter(
            prescription_item__prescription__admission=admission
        ).select_related("drug")
        for dispensing in dispensings:
            if cls._in_window(dispensing.dispensed_at, start, end):
                events.append(
                    (
                        dispensing.dispensed_at,
                        "Medication Administration",
                        f"{dispensing.drug.generic_name}: dispensed {dispensing.quantity_dispensed}",
                    )
                )

        return events

    @classmethod
    def _upsert_attachment(
        cls,
        *,
        claim: SHAClaim,
        uploader,
        attachment_type: str,
        attachment_name: str,
        marker: str,
        description: str,
        content: str,
        filename: str,
        find_existing_q: Q,
    ) -> GeneratedAttachmentResult:
        if not content:
            return GeneratedAttachmentResult(None, False, False, "no_admission_data")

        pdf_bytes = cls._render_pdf_bytes(content)
        checksum = hashlib.sha256(pdf_bytes).hexdigest()

        attachment = (
            claim.attachments.filter(attachment_type=attachment_type)
            .filter(find_existing_q)
            .order_by("-created_at")
            .first()
        )
        if attachment is None:
            created = SHAClaimAttachment.objects.create(
                claim=claim,
                attachment_type=attachment_type,
                name=attachment_name,
                description=f"{description} | System Tag: {marker}",
                file=ContentFile(pdf_bytes, name=filename),
                file_size=len(pdf_bytes),
                mime_type="application/pdf",
                checksum=checksum,
                original_filename=filename,
                uploaded_by=uploader,
            )
            return GeneratedAttachmentResult(created.id, True, False, "")

        attachment.file.save(filename, ContentFile(pdf_bytes), save=False)
        attachment.name = attachment_name
        attachment.description = f"{description} | System Tag: {marker}"
        attachment.file_size = len(pdf_bytes)
        attachment.mime_type = "application/pdf"
        attachment.checksum = checksum
        attachment.original_filename = filename
        attachment.save(
            update_fields=[
                "file",
                "name",
                "description",
                "file_size",
                "mime_type",
                "checksum",
                "original_filename",
            ]
        )
        return GeneratedAttachmentResult(attachment.id, False, True, "")

    @staticmethod
    def _render_pdf_bytes(content: str) -> bytes:
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
