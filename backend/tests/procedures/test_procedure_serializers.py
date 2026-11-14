"""Tests for procedure serializers: validation, computed fields."""

import hashlib

import pytest  # type: ignore
from rest_framework.test import APIRequestFactory

from hmis.apps.procedures.models import ProcedureOrder
from hmis.apps.procedures.serializers import (
    ProcedureCancelSerializer,
    ProcedureCatalogListSerializer,
    ProcedureCompleteSerializer,
    ProcedureOrderCreateSerializer,
    ProcedureOrderDetailSerializer,
    ProcedureOrderListSerializer,
    ProcedureScheduleSerializer,
)


class TestProcedureCatalogListSerializer:
    """Tests for ProcedureCatalogListSerializer."""

    def test_fields(self, procedure_catalog_entry):
        serializer = ProcedureCatalogListSerializer(procedure_catalog_entry)
        data = serializer.data
        assert data["code"] == "PROC-WC-001"
        assert data["name"] == "Wound Dressing (Simple)"
        assert data["category"] == "WOUND_CARE"
        assert data["risk_level"] == "LOW"
        assert "base_fee" in data
        assert "is_active" in data

    def test_compact_fields_only(self, procedure_catalog_entry):
        serializer = ProcedureCatalogListSerializer(procedure_catalog_entry)
        data = serializer.data
        # Should not include verbose fields
        assert "consent_template" not in data
        assert "pre_procedure_instructions" not in data


class TestProcedureOrderListSerializer:
    """Tests for ProcedureOrderListSerializer."""

    def test_computed_fields(self, procedure_order):
        serializer = ProcedureOrderListSerializer(procedure_order)
        data = serializer.data
        assert data["procedure_name"] == "Wound Dressing (Simple)"
        assert data["patient_name"] == "Jane Smith"
        assert data["is_overdue"] is False
        assert data["order_number"].startswith("PROC-")

    def test_all_list_fields_present(self, procedure_order):
        serializer = ProcedureOrderListSerializer(procedure_order)
        data = serializer.data
        expected_fields = {
            "id",
            "order_number",
            "procedure",
            "procedure_name",
            "patient",
            "patient_name",
            "status",
            "priority",
            "scheduled_date",
            "scheduled_time",
            "is_overdue",
            "ordered_at",
            "scheduled_clinic",
            "scheduled_clinic_name",
        }
        assert set(data.keys()) == expected_fields


class TestProcedureOrderCreateSerializer:
    """Tests for ProcedureOrderCreateSerializer."""

    def test_valid_data(self, procedure_order_data):
        serializer = ProcedureOrderCreateSerializer(data=procedure_order_data)
        assert serializer.is_valid(), serializer.errors

    def test_missing_required_fields(self):
        serializer = ProcedureOrderCreateSerializer(data={})
        assert not serializer.is_valid()
        assert "procedure" in serializer.errors
        assert "patient" in serializer.errors
        assert "indication" in serializer.errors

    def test_optional_fields(self, procedure_order_data):
        # Should accept without optional fields
        serializer = ProcedureOrderCreateSerializer(data=procedure_order_data)
        assert serializer.is_valid(), serializer.errors


class TestProcedureOrderDetailSerializer:
    """Tests for ProcedureOrderDetailSerializer."""

    def test_nested_procedure(self, procedure_order):
        serializer = ProcedureOrderDetailSerializer(procedure_order)
        data = serializer.data
        assert isinstance(data["procedure"], dict)
        assert data["procedure"]["code"] == "PROC-WC-001"

    def test_consent_null_when_absent(self, procedure_order):
        serializer = ProcedureOrderDetailSerializer(procedure_order)
        data = serializer.data
        assert data["consent"] is None

    def test_log_null_when_absent(self, procedure_order):
        serializer = ProcedureOrderDetailSerializer(procedure_order)
        data = serializer.data
        assert data["log"] is None


class TestActionSerializers:
    """Tests for workflow action serializers."""

    def test_schedule_valid(self):
        data = {"scheduled_date": "2026-04-15"}
        serializer = ProcedureScheduleSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_schedule_requires_date(self):
        serializer = ProcedureScheduleSerializer(data={})
        assert not serializer.is_valid()
        assert "scheduled_date" in serializer.errors

    def test_cancel_requires_reason(self):
        serializer = ProcedureCancelSerializer(data={})
        assert not serializer.is_valid()
        assert "reason" in serializer.errors

    def test_complete_defaults(self):
        serializer = ProcedureCompleteSerializer(data={})
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["status"] == "COMPLETED"

    def test_complete_invalid_status(self):
        serializer = ProcedureCompleteSerializer(data={"status": "INVALID"})
        assert not serializer.is_valid()
        assert "status" in serializer.errors


@pytest.mark.django_db
def test_catalog_serializer_verifies_ichi_selection_and_records_provenance(
    mocker, sample_facility, sample_organization
):
    """An ICHI code selected for a procedure is verified and attributed server-side."""
    from hmis.apps.billing.services.terminology_models import ICHICode
    from hmis.apps.procedures.serializers import ProcedureCatalogDetailSerializer

    mocker.patch(
        "hmis.apps.procedures.serializers.TerminologyService.get_ichi",
        return_value=ICHICode(code="MZJ.01", title="Wound debridement"),
    )
    serializer = ProcedureCatalogDetailSerializer(
        data={
            "code": "PROC-ICHI-001",
            "name": "Wound debridement",
            "category": "THERAPEUTIC",
            "body_system": "INTEGUMENTARY",
            "risk_level": "LOW",
            "facility": sample_facility.id,
            "organization": sample_organization.id,
            "ichi_code": "MZJ.01",
        }
    )

    assert serializer.is_valid(), serializer.errors
    procedure = serializer.save()

    assert procedure.ichi_system == "http://id.who.int/ichi"
    assert procedure.ichi_owner == "WHO"
    assert procedure.ichi_source == "ICHI"
    assert (
        procedure.ichi_checksum
        == hashlib.sha256(b"http://id.who.int/ichi|MZJ.01|Wound debridement").hexdigest()
    )


@pytest.mark.django_db
def test_catalog_serializer_updates_linked_internal_code_with_ichi(mocker, procedure_catalog_entry):
    """A seeded code follows ICHI changes until an administrator customizes it."""
    from hmis.apps.billing.services.terminology_models import ICHICode
    from hmis.apps.procedures.serializers import ProcedureCatalogDetailSerializer

    procedure_catalog_entry.code = "OLD-ICHI"
    procedure_catalog_entry.ichi_code = "OLD-ICHI"
    procedure_catalog_entry.code_follows_ichi = True
    procedure_catalog_entry.save(update_fields=["code", "ichi_code", "code_follows_ichi"])
    mocker.patch(
        "hmis.apps.procedures.serializers.TerminologyService.get_ichi",
        return_value=ICHICode(code="NEW-ICHI", title="Updated procedure"),
    )

    serializer = ProcedureCatalogDetailSerializer(
        procedure_catalog_entry,
        data={"ichi_code": "NEW-ICHI"},
        partial=True,
    )

    assert serializer.is_valid(), serializer.errors
    updated = serializer.save()
    assert updated.code == "NEW-ICHI"
    assert updated.code_follows_ichi is True

    custom_code = ProcedureCatalogDetailSerializer(
        updated,
        data={"code": "FACILITY-PROC-001"},
        partial=True,
    )
    assert custom_code.is_valid(), custom_code.errors
    customized = custom_code.save()
    assert customized.code_follows_ichi is False

    mocker.patch(
        "hmis.apps.procedures.serializers.TerminologyService.get_ichi",
        return_value=ICHICode(code="LATEST-ICHI", title="Latest procedure"),
    )
    serializer = ProcedureCatalogDetailSerializer(
        customized,
        data={"ichi_code": "LATEST-ICHI"},
        partial=True,
    )
    assert serializer.is_valid(), serializer.errors
    updated = serializer.save()
    assert updated.code == "FACILITY-PROC-001"
    assert updated.code_follows_ichi is False


@pytest.mark.django_db
def test_catalog_serializer_keeps_cpt_as_manual_crosswalk(sample_facility, sample_organization):
    """CPT remains user-supplied and does not trigger an external terminology lookup."""
    from hmis.apps.procedures.serializers import ProcedureCatalogDetailSerializer

    serializer = ProcedureCatalogDetailSerializer(
        data={
            "code": "PROC-CPT-001",
            "name": "Licensed CPT crosswalk",
            "category": "THERAPEUTIC",
            "body_system": "INTEGUMENTARY",
            "risk_level": "LOW",
            "facility": sample_facility.id,
            "organization": sample_organization.id,
            "cpt_code": "12001",
        }
    )

    assert serializer.is_valid(), serializer.errors
    assert serializer.save().cpt_code == "12001"
