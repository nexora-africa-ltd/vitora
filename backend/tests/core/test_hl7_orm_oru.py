# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Tests for HL7 v2.5.1 ORM (Order) and ORU (Result) services.

Covers Gap #4 (HL7 v2 ORM/ORU) from the interoperability audit.
"""

import pytest  # type: ignore

from hmis.apps.hl7.services.orm_service import ORMService
from hmis.apps.hl7.services.oru_service import ORUParser, ParsedORUMessage


class TestORMService:
    """Tests for HL7 v2.5.1 ORM^O01 message building."""

    def test_build_msh_segment(self):
        """Should build valid MSH segment with ORM^O01."""
        service = ORMService()
        msh = service._build_msh()
        fields = msh.split("|")

        assert fields[0] == "MSH"
        assert "^~\\&" in fields[1]
        assert fields[8].startswith("ORM^O01")
        assert fields[10] == "P"  # Processing ID
        assert fields[11] == "2.5.1"  # Version

    def test_build_pid_segment(self, sample_patient):
        """Should build PID segment from patient model."""
        service = ORMService()
        pid = service._build_pid(sample_patient)
        fields = pid.split("|")

        assert fields[0] == "PID"
        assert str(sample_patient.pk) in fields[2]
        assert sample_patient.mrn in fields[3]
        # Name: last^first
        assert sample_patient.last_name in fields[5]
        assert sample_patient.first_name in fields[5]

    def test_build_pv1_outpatient(self):
        """Should build PV1 with outpatient class."""
        service = ORMService()
        pv1 = service._build_pv1(None)
        fields = pv1.split("|")

        assert fields[0] == "PV1"
        assert fields[2] == "O"  # Outpatient

    def test_build_orc_new_order(self, sample_patient):
        """Should build ORC for new order."""
        service = ORMService()

        class MockOrder:
            pk = 42
            status = "ORDERED"
            ordered_by = None

        orc = service._build_orc(MockOrder(), "NW")
        fields = orc.split("|")

        assert fields[0] == "ORC"
        assert fields[1] == "NW"
        assert "42" in fields[2]

    @pytest.mark.django_db
    def test_build_lab_order_message(self, sample_patient):
        """Should build complete ORM message for lab order."""
        service = ORMService()

        class MockItem:
            pk = 1
            test_catalog = None
            priority = "ROUTINE"

        class MockLabOrder:
            pk = 100
            patient = sample_patient
            encounter = None
            status = "ORDERED"
            ordered_by = None

            class items:
                @staticmethod
                def all():
                    return [MockItem()]

        msg = service.build_lab_order(MockLabOrder())
        segments = msg.split("\r")

        assert len(segments) >= 4
        assert segments[0].startswith("MSH|")
        assert segments[1].startswith("PID|")
        assert segments[2].startswith("PV1|")
        assert segments[3].startswith("ORC|")
        assert any(s.startswith("OBR|") for s in segments)

    @pytest.mark.django_db
    def test_build_pharmacy_order_message(self, sample_patient):
        """Should build complete ORM message for pharmacy order."""
        service = ORMService()

        class MockDrug:
            name = "Amoxicillin 500mg"
            hpt_code = "HPT001"

        class MockPrescriptionItem:
            drug = MockDrug()
            dosage = "500mg"
            quantity = 21
            route = "PO"

        class MockPrescription:
            pk = 200
            patient = sample_patient
            encounter = None
            status = "ACTIVE"
            ordered_by = None

            class items:
                @staticmethod
                def all():
                    return [MockPrescriptionItem()]

        msg = service.build_pharmacy_order(MockPrescription())
        segments = msg.split("\r")

        assert len(segments) >= 4
        assert segments[0].startswith("MSH|")
        assert segments[1].startswith("PID|")
        assert any(s.startswith("RXO|") for s in segments)
        # Should contain drug name
        rxo = [s for s in segments if s.startswith("RXO|")][0]
        assert "Amoxicillin" in rxo


class TestORUParser:
    """Tests for HL7 v2.5.1 ORU^R01 message parsing."""

    SAMPLE_ORU = (
        "MSH|^~\\&|EXTERNAL_LIS|LAB_FACILITY|VITORA_HMIS|VITORA|20260701120000||ORU^R01|MSG001|P|2.5.1\r"
        "PID|1|123|MRN-20260101-0001||Doe^John||19900515|M\r"
        "OBR|1|ORD001|FIL001|718-7^Hemoglobin^LN|||20260701100000\r"
        "OBX|1|NM|718-7^Hemoglobin^LN||14.5|g/dL|12.0-17.5|N||F\r"
        "OBX|2|NM|789-8^Erythrocytes^LN||4.8|10*12/L|4.5-5.5|N||F\r"
    )

    def test_parse_msh_segment(self):
        """Should extract MSH fields correctly."""
        parser = ORUParser()
        result = parser.parse(self.SAMPLE_ORU)

        assert result.sending_application == "EXTERNAL_LIS"
        assert result.sending_facility == "LAB_FACILITY"
        assert result.message_id == "MSG001"
        assert result.message_datetime == "20260701120000"

    def test_parse_pid_segment(self):
        """Should extract patient identification."""
        parser = ORUParser()
        result = parser.parse(self.SAMPLE_ORU)

        assert result.patient_id == "123"
        assert result.patient_mrn == "MRN-20260101-0001"
        assert result.patient_name_family == "Doe"
        assert result.patient_name_given == "John"
        assert result.patient_dob == "19900515"
        assert result.patient_gender == "M"

    def test_parse_obr_segment(self):
        """Should extract observation request data."""
        parser = ORUParser()
        result = parser.parse(self.SAMPLE_ORU)

        assert len(result.order_results) == 1
        order = result.order_results[0]
        assert order.placer_order_number == "ORD001"
        assert order.filler_order_number == "FIL001"
        assert order.universal_service_code == "718-7"
        assert order.universal_service_text == "Hemoglobin"
        assert order.universal_service_system == "LN"

    def test_parse_obx_segments(self):
        """Should extract observation results."""
        parser = ORUParser()
        result = parser.parse(self.SAMPLE_ORU)

        order = result.order_results[0]
        assert len(order.observations) == 2

        # First OBX
        obs1 = order.observations[0]
        assert obs1.set_id == 1
        assert obs1.value_type == "NM"
        assert obs1.identifier_code == "718-7"
        assert obs1.identifier_text == "Hemoglobin"
        assert obs1.identifier_system == "LN"
        assert obs1.value == "14.5"
        assert obs1.units == "g/dL"
        assert obs1.reference_range == "12.0-17.5"
        assert obs1.abnormal_flag == "N"

        # Second OBX
        obs2 = order.observations[1]
        assert obs2.set_id == 2
        assert obs2.identifier_code == "789-8"
        assert obs2.value == "4.8"

    def test_parse_invalid_message_type(self):
        """Should reject non-ORU messages."""
        parser = ORUParser()
        invalid_msg = (
            "MSH|^~\\&|APP|FAC|APP|FAC|20260701||ADT^A01|MSG|P|2.5.1\rPID|1|123|||Doe^John\r"
        )
        with pytest.raises(ValueError, match="Expected ORU\\^R01"):
            parser.parse(invalid_msg)

    def test_parse_handles_line_endings(self):
        """Should handle \\n line endings as well as \\r."""
        parser = ORUParser()
        msg_with_newlines = self.SAMPLE_ORU.replace("\r", "\n")
        result = parser.parse(msg_with_newlines)
        assert result.message_id == "MSG001"
        assert len(result.order_results) == 1

    @pytest.mark.django_db
    def test_match_patient_by_mrn(self, sample_patient):
        """Should match patient by MRN."""
        parser = ORUParser()
        parsed = ParsedORUMessage(patient_mrn=sample_patient.mrn)
        matched = parser.match_patient(parsed)
        assert matched is not None
        assert matched.pk == sample_patient.pk

    @pytest.mark.django_db
    def test_match_patient_not_found(self):
        """Should return None when patient not found."""
        parser = ORUParser()
        parsed = ParsedORUMessage(patient_mrn="MRN-NONEXISTENT")
        matched = parser.match_patient(parsed)
        assert matched is None
