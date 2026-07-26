"""Tests for DHA/local document type mapping helpers."""

from hmis.apps.billing.document_types import (
    dha_document_type_to_local_attachment_type,
    local_to_dha_document_type,
)


def test_local_medical_report_maps_to_dha_medical_report():
    assert local_to_dha_document_type("medical_report") == "MEDICAL_REPORT"


def test_dha_medical_report_maps_to_local_medical_report():
    assert dha_document_type_to_local_attachment_type("MEDICAL_REPORT") == "medical_report"


def test_dha_aliases_map_to_local_attachment_types():
    assert dha_document_type_to_local_attachment_type("SURGICAL_NOTES") == "operative_notes"
    assert dha_document_type_to_local_attachment_type("LAB_REPORT") == "lab_report"


def test_unknown_dha_type_falls_back_to_normalized_local_form():
    assert dha_document_type_to_local_attachment_type("CUSTOM_NOTE") == "custom_note"
