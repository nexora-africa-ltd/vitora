"""PDF export helpers for theatre documentation."""

import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _build_document_buffer(title: str):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.6 * cm,
        leftMargin=1.6 * cm,
        topMargin=1.6 * cm,
        bottomMargin=1.6 * cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TheatrePdfTitle",
        parent=styles["Heading1"],
        fontSize=16,
        spaceAfter=10,
        textColor=colors.HexColor("#0f172a"),
    )
    section_style = ParagraphStyle(
        "TheatrePdfSection",
        parent=styles["Heading2"],
        fontSize=11,
        spaceAfter=6,
        textColor=colors.HexColor("#0f766e"),
    )
    normal_style = ParagraphStyle(
        "TheatrePdfNormal",
        parent=styles["Normal"],
        fontSize=9,
        leading=12,
        spaceAfter=4,
    )

    elements = [Paragraph(title, title_style)]
    return buffer, doc, styles, section_style, normal_style, elements


def _info_table(rows: list[list[str]]):
    table = Table(rows, colWidths=[4.2 * cm, 11.2 * cm])
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def generate_operative_note_pdf(*, surgery_case, operative_note) -> bytes:
    buffer, doc, _, section_style, normal_style, elements = _build_document_buffer(
        f"Vitora HMIS - Operative Note {surgery_case.case_number}"
    )

    elements.append(
        _info_table(
            [
                ["Patient", f"{surgery_case.patient.first_name} {surgery_case.patient.last_name}"],
                ["MRN", surgery_case.patient.mrn],
                ["Procedure", surgery_case.primary_procedure.name],
                ["Theatre", surgery_case.theatre.name],
                ["Scheduled", f"{surgery_case.scheduled_date} {surgery_case.scheduled_start_time}"],
                [
                    "Dictated By",
                    operative_note.dictated_by.get_full_name()
                    or operative_note.dictated_by.username,
                ],
            ]
        )
    )
    elements.append(Spacer(1, 0.35 * cm))

    sections = [
        (
            "Diagnosis",
            [
                f"Pre-operative: {operative_note.pre_operative_diagnosis}",
                f"Post-operative: {operative_note.post_operative_diagnosis}",
            ],
        ),
        ("Procedure", [operative_note.procedure_performed, operative_note.technique_description]),
        ("Findings", [operative_note.findings]),
        (
            "Intra-Operative Details",
            [
                f"Incision Time: {operative_note.incision_time or 'Not recorded'}",
                f"Closure Time: {operative_note.closure_time or 'Not recorded'}",
                f"Estimated Blood Loss: {operative_note.estimated_blood_loss} mL",
                f"Implants Used: {operative_note.implants_used or 'None recorded'}",
                f"Drains Placed: {operative_note.drains_placed or 'None recorded'}",
                f"Sutures Used: {operative_note.sutures_used or 'None recorded'}",
            ],
        ),
        (
            "Specimens & Complications",
            [
                f"Specimens Sent: {operative_note.specimens_sent or 'None recorded'}",
                f"Frozen Section: {'Yes' if operative_note.frozen_section else 'No'}",
                f"Frozen Section Result: {operative_note.frozen_section_result or 'N/A'}",
                f"Complications: {operative_note.intraoperative_complications or 'None recorded'}",
            ],
        ),
        (
            "Post-Operative Plan",
            [operative_note.post_operative_plan or "No post-operative plan documented."],
        ),
    ]

    for title, lines in sections:
        elements.append(Paragraph(title, section_style))
        for line in lines:
            elements.append(Paragraph(str(line), normal_style))
        elements.append(Spacer(1, 0.15 * cm))

    if operative_note.signed_at:
        elements.append(Paragraph("Signature", section_style))
        signer = operative_note.signed_by.get_full_name() if operative_note.signed_by else "Unknown"
        elements.append(
            Paragraph(
                f"Signed by {signer or 'Unknown'} at {operative_note.signed_at}", normal_style
            )
        )

    doc.build(elements)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes


def generate_pacu_summary_pdf(*, surgery_case, pacu_record) -> bytes:
    buffer, doc, _, section_style, normal_style, elements = _build_document_buffer(
        f"Vitora HMIS - PACU Summary {surgery_case.case_number}"
    )

    elements.append(
        _info_table(
            [
                ["Patient", f"{surgery_case.patient.first_name} {surgery_case.patient.last_name}"],
                ["MRN", surgery_case.patient.mrn],
                ["Procedure", surgery_case.primary_procedure.name],
                ["Arrival Time", str(pacu_record.arrival_time)],
                [
                    "Arrival Nurse",
                    pacu_record.arriving_nurse.get_full_name()
                    or pacu_record.arriving_nurse.username,
                ],
                ["Discharge Destination", pacu_record.discharge_destination or "Pending"],
            ]
        )
    )
    elements.append(Spacer(1, 0.35 * cm))

    elements.append(Paragraph("Recovery Summary", section_style))
    summary_lines = [
        f"Initial Aldrete Score: {pacu_record.initial_aldrete_score}",
        f"Initial Pain Score: {pacu_record.initial_pain_score if pacu_record.initial_pain_score is not None else 'Not recorded'}",
        f"Latest Aldrete Score: {pacu_record.latest_aldrete_score if pacu_record.latest_aldrete_score is not None else 'Not recorded'}",
        f"Medications Given: {pacu_record.medications_given or 'None recorded'}",
        f"Complications: {pacu_record.complications_notes or 'No complications documented'}",
        f"Discharge Notes: {pacu_record.discharge_notes or 'No discharge notes documented'}",
    ]
    for line in summary_lines:
        elements.append(Paragraph(line, normal_style))
    elements.append(Spacer(1, 0.2 * cm))

    elements.append(Paragraph("Handover", section_style))
    elements.append(
        Paragraph(f"Given To: {pacu_record.handover_given_to or 'Not documented'}", normal_style)
    )
    elements.append(
        Paragraph(
            f"Completed At: {pacu_record.handover_completed_at or 'Not documented'}", normal_style
        )
    )
    elements.append(
        Paragraph(
            f"Notes: {pacu_record.handover_notes or 'No handover notes documented.'}", normal_style
        )
    )
    elements.append(Spacer(1, 0.2 * cm))

    elements.append(Paragraph("Complication Flags", section_style))
    for label, flag in [
        ("Nausea/Vomiting", pacu_record.nausea_vomiting),
        ("Shivering", pacu_record.shivering),
        ("Respiratory Issues", pacu_record.respiratory_issues),
        ("Cardiovascular Issues", pacu_record.cardiovascular_issues),
    ]:
        elements.append(Paragraph(f"{label}: {'Yes' if flag else 'No'}", normal_style))
    elements.append(Spacer(1, 0.2 * cm))

    vitals = [["Recorded At", "HR", "SpO2", "Aldrete", "Pain", "Notes"]]
    for vital in pacu_record.vital_readings.order_by("recorded_at"):
        vitals.append(
            [
                str(vital.recorded_at),
                str(vital.heart_rate or "-"),
                str(vital.spo2 or "-"),
                str(vital.aldrete_score or "-"),
                str(vital.pain_score or "-"),
                vital.notes or "-",
            ]
        )

    elements.append(Paragraph("Recovery Observations", section_style))
    vitals_table = Table(
        vitals, colWidths=[3.2 * cm, 1.4 * cm, 1.6 * cm, 1.7 * cm, 1.4 * cm, 6.0 * cm]
    )
    vitals_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f766e")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ]
        )
    )
    elements.append(vitals_table)

    doc.build(elements)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
