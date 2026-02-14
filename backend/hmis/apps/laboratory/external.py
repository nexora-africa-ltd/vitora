"""
External laboratory integration for Vitora HMIS.

This module provides functionality for integrating with external laboratory
partners including requisition generation and result import.
"""

import csv
import io
from datetime import datetime
from typing import BinaryIO

from django.core.files.uploadedfile import UploadedFile

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
        # Consolidated implementation lives in services.requisition.
        from .services.requisition import ExternalLabRequisition as ServiceExternalLabRequisition

        pdf_buffer = ServiceExternalLabRequisition(order).generate_pdf()
        return pdf_buffer.getvalue()

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
