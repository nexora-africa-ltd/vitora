"""
Growth chart PDF export service.

Generates PDF reports of pediatric growth measurements using ReportLab.
"""

import io
import logging
from datetime import date
from typing import TYPE_CHECKING

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

if TYPE_CHECKING:
    from hmis.apps.patients.models import Patient

logger = logging.getLogger(__name__)


def generate_growth_chart_pdf(patient: "Patient") -> bytes:
    """
    Generate a PDF report of a child's growth measurements.

    Args:
        patient: The patient to generate the report for

    Returns:
        PDF file as bytes
    """
    from hmis.apps.mch.models import GrowthMeasurement

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )

    styles = getSampleStyleSheet()
    elements = []

    # Custom styles
    title_style = ParagraphStyle(
        "TitleStyle",
        parent=styles["Heading1"],
        fontSize=16,
        spaceAfter=12,
        textColor=colors.HexColor("#1a365d"),
    )
    subtitle_style = ParagraphStyle(
        "SubtitleStyle",
        parent=styles["Heading2"],
        fontSize=12,
        spaceAfter=6,
        textColor=colors.HexColor("#2d3748"),
    )
    normal_style = ParagraphStyle(
        "NormalStyle",
        parent=styles["Normal"],
        fontSize=10,
        spaceAfter=4,
    )

    # Header
    elements.append(Paragraph("Vitora HMIS - Growth Chart Report", title_style))
    elements.append(Spacer(1, 0.3 * cm))

    # Patient Information
    elements.append(Paragraph("Patient Information", subtitle_style))

    age_text = ""
    if patient.date_of_birth:
        age_days = (date.today() - patient.date_of_birth).days
        age_months = age_days // 30
        age_years = age_days // 365
        if age_years >= 1:
            age_text = f"{age_years} years, {(age_days - age_years * 365) // 30} months"
        else:
            age_text = f"{age_months} months, {age_days % 30} days"

    patient_info = [
        ["Name:", f"{patient.first_name} {patient.last_name}"],
        ["MRN:", patient.mrn],
        ["Date of Birth:", str(patient.date_of_birth or "N/A")],
        ["Age:", age_text or "N/A"],
        ["Sex:", "Male" if patient.gender == "M" else "Female" if patient.gender == "F" else "Other"],
        ["Report Date:", str(date.today())],
    ]

    patient_table = Table(patient_info, colWidths=[4 * cm, 10 * cm])
    patient_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(patient_table)
    elements.append(Spacer(1, 0.5 * cm))

    # Growth Measurements
    elements.append(Paragraph("Growth Measurements", subtitle_style))

    measurements = GrowthMeasurement.objects.filter(
        patient=patient
    ).order_by("-measurement_date")[:20]  # Last 20 measurements

    if measurements.exists():
        # Table header
        headers = [
            "Date",
            "Age",
            "Weight\n(kg)",
            "Height\n(cm)",
            "HC\n(cm)",
            "MUAC\n(cm)",
            "WAZ",
            "HAZ",
            "WHZ",
            "Status",
        ]

        # Table data
        table_data = [headers]
        for m in measurements:
            age_str = f"{m.age_in_days // 30}m" if m.age_in_days else "-"
            table_data.append([
                str(m.measurement_date),
                age_str,
                f"{m.weight:.1f}" if m.weight else "-",
                f"{m.height:.1f}" if m.height else "-",
                f"{m.head_circumference:.1f}" if m.head_circumference else "-",
                f"{m.muac:.1f}" if m.muac else "-",
                f"{m.weight_for_age_z:.1f}" if m.weight_for_age_z else "-",
                f"{m.height_for_age_z:.1f}" if m.height_for_age_z else "-",
                f"{m.weight_for_height_z:.1f}" if m.weight_for_height_z else "-",
                m.nutritional_status[:10] if m.nutritional_status else "-",
            ])

        # Create table with styling
        col_widths = [2.2 * cm, 1.3 * cm, 1.4 * cm, 1.4 * cm, 1.2 * cm, 1.2 * cm, 1 * cm, 1 * cm, 1 * cm, 2.3 * cm]
        measurement_table = Table(table_data, colWidths=col_widths)
        measurement_table.setStyle(TableStyle([
            # Header row
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2d3748")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("ALIGN", (0, 0), (-1, 0), "CENTER"),
            # Data rows
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("ALIGN", (0, 1), (-1, -1), "CENTER"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            # Grid
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            # Alternate row colors
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7fafc")]),
        ]))
        elements.append(measurement_table)
    else:
        elements.append(Paragraph("No growth measurements recorded.", normal_style))

    elements.append(Spacer(1, 0.5 * cm))

    # Interpretation Legend
    elements.append(Paragraph("Z-Score Interpretation", subtitle_style))
    legend_data = [
        ["Z-Score Range", "Classification", "Action"],
        ["< -3", "Severe underweight/stunting/wasting", "Urgent referral"],
        ["-3 to -2", "Moderate underweight/stunting/wasting", "Nutrition counseling"],
        ["-2 to -1", "Mild underweight/stunting/wasting", "Monitor closely"],
        ["-1 to +1", "Normal", "Continue routine care"],
        ["+1 to +2", "Overweight (risk)", "Diet counseling"],
        ["> +2", "Obese", "Weight management referral"],
    ]
    legend_table = Table(legend_data, colWidths=[3 * cm, 6 * cm, 5 * cm])
    legend_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2d3748")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    elements.append(legend_table)

    elements.append(Spacer(1, 0.5 * cm))

    # MUAC Classification (if applicable)
    for m in measurements[:1]:  # Just check the latest
        if m.muac:
            elements.append(Paragraph("MUAC Classification (6-59 months)", subtitle_style))
            muac_data = [
                ["MUAC", "Classification"],
                ["< 11.5 cm", "Severe Acute Malnutrition (SAM) - Urgent referral"],
                ["11.5-12.4 cm", "Moderate Acute Malnutrition (MAM) - Supplementary feeding"],
                ["≥ 12.5 cm", "Normal"],
            ]
            muac_table = Table(muac_data, colWidths=[3 * cm, 11 * cm])
            muac_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2d3748")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ]))
            elements.append(muac_table)
            break

    elements.append(Spacer(1, 1 * cm))

    # Footer
    footer_style = ParagraphStyle(
        "FooterStyle",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.grey,
    )
    elements.append(Paragraph(
        "Generated by Vitora HMIS • WHO Child Growth Standards • For healthcare provider use only",
        footer_style,
    ))

    # Build PDF
    doc.build(elements)
    pdf_bytes = buffer.getvalue()
    buffer.close()

    return pdf_bytes
