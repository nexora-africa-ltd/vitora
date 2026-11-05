# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Render tenant-scoped quality measure result reports as PDF or XLSX downloads.

Used by ``QualityMeasureResultViewSet.export``. Inputs are an iterable of
``QualityMeasureResult`` rows and a reporting year; no command-line arguments
or environment variables are supported.
"""

from __future__ import annotations

from collections.abc import Iterable
from io import BytesIO

from hmis.apps.quality.models import QualityMeasureResult

RESULT_HEADERS = [
    "Measure code",
    "Measure name",
    "Clinic",
    "Period",
    "Numerator",
    "Denominator",
    "Percentage",
    "Target met",
]


def result_export_rows(results: Iterable[QualityMeasureResult]) -> list[list[str | int]]:
    """Build stable, presentation-ready rows for quality result exports."""
    return [
        [
            result.measure.code,
            result.measure.name,
            result.clinic.name,
            f"{result.year} {result.get_period_type_display()} {result.period}",
            result.numerator,
            result.denominator,
            f"{result.percentage}%",
            "Yes" if result.meets_target else "No",
        ]
        for result in results
    ]


def export_results_to_xlsx(results: Iterable[QualityMeasureResult], year: int) -> bytes:
    """Create an XLSX workbook for the supplied quality measure results."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    workbook = Workbook()
    worksheet = workbook.active
    if worksheet is None:  # pragma: no cover - openpyxl always creates an active sheet
        worksheet = workbook.create_sheet("Quality results")
    worksheet.title = "Quality results"
    worksheet.append([f"Quality Measure Results — {year}"])
    worksheet.append(RESULT_HEADERS)
    for row in result_export_rows(results):
        worksheet.append(row)

    header_fill = PatternFill("solid", fgColor="0F766E")
    for cell in worksheet[2]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = header_fill
    worksheet.freeze_panes = "A3"
    for column, width in {
        "A": 20,
        "B": 42,
        "C": 28,
        "D": 24,
        "E": 13,
        "F": 15,
        "G": 15,
        "H": 14,
    }.items():
        worksheet.column_dimensions[column].width = width

    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def export_results_to_pdf(results: Iterable[QualityMeasureResult], year: int) -> bytes:
    """Create a compact, printable PDF report for quality measure results."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    output = BytesIO()
    document = SimpleDocTemplate(
        output,
        pagesize=landscape(A4),
        rightMargin=12 * mm,
        leftMargin=12 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
    )
    styles = getSampleStyleSheet()
    rows = result_export_rows(results)
    table_data = [RESULT_HEADERS, *rows]
    table = Table(
        table_data,
        repeatRows=1,
        colWidths=[24 * mm, 52 * mm, 35 * mm, 28 * mm, 18 * mm, 22 * mm, 22 * mm, 20 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F766E")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D1D5DB")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F0FDFA")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    document.build(
        [
            Paragraph(f"Quality Measure Results — {year}", styles["Title"]),
            Spacer(1, 6 * mm),
            table,
        ]
    )
    return output.getvalue()
