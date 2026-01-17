"""
External laboratory integration for Vitora HMIS.

This module provides functionality for integrating with external laboratory
partners including requisition generation and result import.
"""

import csv
import io
from datetime import datetime
from io import BytesIO
from typing import BinaryIO

from django.core.files.uploadedfile import UploadedFile
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle

from .models import LabOrder, LabResult


class ExternalLabRequisition:
    """Generate requisition documents for external labs."""

    @staticmethod
    def generate_pdf(order: LabOrder) -> bytes:
        """
        Generate PDF requisition form for external laboratory.

        This generates a Kenya MOH compliant lab requisition form with:
        - Facility header
        - Patient demographics
        - Ordering clinician details
        - Test list with specimen requirements
        - Clinical notes
        - Order barcode

        Args:
            order: LabOrder instance

        Returns:
            bytes: PDF document as bytes
        """
        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4

        # Header
        pdf.setFont("Helvetica-Bold", 16)
        pdf.drawString(50, height - 50, "LABORATORY REQUISITION FORM")

        pdf.setFont("Helvetica", 10)
        pdf.drawString(50, height - 70, "Vitora HMIS - Kenya Ministry of Health")

        # Order Information
        y_position = height - 100
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawString(50, y_position, "Order Information")

        y_position -= 20
        pdf.setFont("Helvetica", 10)
        pdf.drawString(50, y_position, f"Order Number: {order.order_number}")
        y_position -= 15
        pdf.drawString(50, y_position, f"Order Date: {order.ordered_at.strftime('%Y-%m-%d %H:%M')}")
        y_position -= 15
        pdf.drawString(50, y_position, f"Priority: {order.get_priority_display()}")
        y_position -= 15
        pdf.drawString(50, y_position, f"Order Type: {order.get_order_type_display()}")

        if order.external_lab:
            y_position -= 15
            pdf.drawString(50, y_position, f"External Lab: {order.external_lab}")

        # Patient Demographics
        y_position -= 30
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawString(50, y_position, "Patient Information")

        y_position -= 20
        pdf.setFont("Helvetica", 10)
        patient = order.patient
        pdf.drawString(50, y_position, f"Name: {patient.first_name} {patient.last_name}")
        y_position -= 15
        pdf.drawString(50, y_position, f"MRN: {patient.mrn}")
        y_position -= 15
        pdf.drawString(50, y_position, f"Date of Birth: {patient.date_of_birth}")
        y_position -= 15
        pdf.drawString(50, y_position, f"Gender: {patient.get_gender_display()}")
        y_position -= 15
        pdf.drawString(50, y_position, f"Age: {patient.age} years")

        # Ordering Clinician
        y_position -= 30
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawString(50, y_position, "Ordering Clinician")

        y_position -= 20
        pdf.setFont("Helvetica", 10)
        clinician_name = order.ordered_by.get_full_name() or order.ordered_by.username
        pdf.drawString(50, y_position, f"Name: {clinician_name}")

        # Tests Requested
        y_position -= 30
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawString(50, y_position, "Tests Requested")

        y_position -= 20
        pdf.setFont("Helvetica", 9)

        # Create table for tests
        table_data = [["#", "Test Code", "Test Name", "Specimen Type"]]
        for idx, item in enumerate(order.items.all(), 1):
            test = item.test
            table_data.append([str(idx), test.code, test.name, test.get_specimen_type_display()])

        # Draw table
        table = Table(table_data, colWidths=[20, 60, 200, 100])
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 9),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
                    ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                    ("FONTSIZE", (0, 1), (-1, -1), 8),
                ]
            )
        )

        table.wrapOn(pdf, width, height)
        table_height = table._height
        table.drawOn(pdf, 50, y_position - table_height - 10)
        y_position -= table_height + 20

        # Clinical Notes
        if order.clinical_notes:
            y_position -= 20
            pdf.setFont("Helvetica-Bold", 12)
            pdf.drawString(50, y_position, "Clinical Notes / Indication")

            y_position -= 20
            pdf.setFont("Helvetica", 9)

            # Wrap text if too long
            text_object = pdf.beginText(50, y_position)
            text_object.setFont("Helvetica", 9)

            # Split notes into lines
            max_width = 500
            words = order.clinical_notes.split()
            lines = []
            current_line = []

            for word in words:
                test_line = " ".join(current_line + [word])
                if pdf.stringWidth(test_line, "Helvetica", 9) <= max_width:
                    current_line.append(word)
                else:
                    if current_line:
                        lines.append(" ".join(current_line))
                    current_line = [word]

            if current_line:
                lines.append(" ".join(current_line))

            for line in lines[:5]:  # Limit to 5 lines
                text_object.textLine(line)

            pdf.drawText(text_object)
            y_position -= len(lines[:5]) * 12 + 10

        # Barcode (simple text representation)
        y_position -= 30
        pdf.setFont("Helvetica-Bold", 10)
        pdf.drawString(50, y_position, f"Order ID: {order.order_number}")

        # Draw simple barcode representation
        pdf.setFont("Courier", 8)
        barcode_text = f"*{order.order_number}*"
        pdf.drawString(50, y_position - 15, barcode_text)

        # Footer
        pdf.setFont("Helvetica", 8)
        pdf.drawString(50, 40, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        pdf.drawString(50, 30, "Vitora HMIS - Laboratory Requisition Form")

        pdf.showPage()
        pdf.save()

        buffer.seek(0)
        return buffer.getvalue()

    @staticmethod
    def generate_hl7_message(order: LabOrder) -> str:
        """
        Generate HL7 ORM (Order) message for electronic lab integration.

        This is a stub implementation for future HL7 integration.

        Args:
            order: LabOrder instance

        Returns:
            str: HL7 ORM message (stub)
        """
        # Stub implementation - would need full HL7 library for production
        patient = order.patient

        hl7_message = f"""MSH|^~\\&|VITORA|FACILITY|LAB|EXTERNAL|{datetime.now().strftime('%Y%m%d%H%M%S')}||ORM^O01|{order.order_number}|P|2.5
PID|1||{patient.mrn}||{patient.last_name}^{patient.first_name}||{patient.date_of_birth.strftime('%Y%m%d')}|{patient.gender}
ORC|NW|{order.order_number}||||||{order.ordered_at.strftime('%Y%m%d%H%M%S')}
"""

        for item in order.items.all():
            test = item.test
            hl7_message += (
                f"OBR|1|{order.order_number}|{order.order_number}|{test.code}^{test.name}\n"
            )

        return hl7_message


class ExternalResultImporter:
    """Import results from external lab systems."""

    @staticmethod
    def import_from_csv(order: LabOrder, csv_file: BinaryIO, user) -> list[LabResult]:
        """
        Import results from CSV file.

        Expected CSV format:
        test_code,result_value,result_flag,interpretation,result_date

        Args:
            order: LabOrder instance
            csv_file: Uploaded CSV file
            user: User importing the results

        Returns:
            list[LabResult]: Created result objects

        Raises:
            ValueError: If CSV format is invalid or test codes don't match order
        """
        results = []

        # Read CSV file
        if isinstance(csv_file, UploadedFile):
            content = csv_file.read()
            if isinstance(content, bytes):
                content = content.decode("utf-8")
        else:
            content = csv_file.read()
            if isinstance(content, bytes):
                content = content.decode("utf-8")

        csv_reader = csv.DictReader(io.StringIO(content))

        # Validate required columns
        required_columns = {"test_code", "result_value"}
        if not required_columns.issubset(csv_reader.fieldnames or []):
            raise ValueError(f"CSV must contain columns: {required_columns}")

        # Process each row
        for row in csv_reader:
            test_code = row.get("test_code", "").strip()
            result_value = row.get("result_value", "").strip()

            if not test_code or not result_value:
                continue

            # Find matching order item
            order_item = None
            for item in order.items.all():
                if item.test.code == test_code:
                    order_item = item
                    break

            if not order_item:
                raise ValueError(f"Test code '{test_code}' not found in order {order.order_number}")

            # Check if result already exists
            if hasattr(order_item, "result"):
                continue  # Skip if result already exists

            # Determine result type and create result
            result_data = {
                "order_item": order_item,
                "entered_by": user,
                "is_external_result": True,
            }

            # Try to parse as numeric
            try:
                numeric_value = float(result_value)
                result_data["numeric_value"] = numeric_value
            except (ValueError, TypeError):
                # Not numeric, store as text
                result_data["text_value"] = result_value

            # Add optional fields
            if "result_flag" in row and row["result_flag"]:
                result_data["result_flag"] = row["result_flag"].strip().upper()

            if "interpretation" in row and row["interpretation"]:
                result_data["interpretation"] = row["interpretation"].strip()

            if "result_date" in row and row["result_date"]:
                try:
                    from datetime import datetime

                    result_date = datetime.strptime(row["result_date"].strip(), "%Y-%m-%d").date()
                    result_data["external_result_date"] = result_date
                except (ValueError, TypeError):
                    pass  # Skip invalid dates

            # Create result
            result = LabResult.objects.create(**result_data)

            # Auto-flag if numeric and no flag provided
            if result.numeric_value is not None and not result.result_flag:
                result.auto_flag_result()

            results.append(result)

        return results

    @staticmethod
    def import_from_hl7(hl7_message: str, user) -> list[LabResult]:  # noqa: ARG004
        """
        Parse HL7 ORU (Result) message and import results.

        This is a stub implementation for future HL7 integration.

        Args:
            hl7_message: HL7 ORU message string
            user: User importing the results

        Returns:
            list[LabResult]: Created result objects (stub returns empty list)
        """
        # Stub implementation - would need full HL7 library for production
        # In production, would use python-hl7 or similar library to parse

        # Example of what would be implemented:
        # 1. Parse MSH segment to get message metadata
        # 2. Parse PID segment to identify patient
        # 3. Parse OBR segments to identify orders
        # 4. Parse OBX segments to extract results
        # 5. Create LabResult objects for each result

        # For now, return empty list as this is future functionality
        return []
