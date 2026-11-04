# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for selected DHA terminology cache, bindings, and normalized lookup.

Run with: poetry run pytest tests/core/test_terminology_bindings.py -q
Inputs: authenticated API clients, mocked DHA Clinical Concepts responses, and Django model fixtures.
"""

from unittest.mock import Mock

from hmis.apps.billing.services.terminology import TerminologyConcept
from hmis.apps.core.models import TerminologyBinding, TerminologyConceptCache


def test_selected_concept_is_cached_and_bound_to_local_record(sample_drug, test_user):
    """A selected concept creates a compact cache record and local provenance binding."""
    concept = TerminologyConcept(
        code="PH7813",
        display="Paracetamol",
        owner="MOH-PPB",
        source="HPT",
        system="https://ilm-dev.dha.go.ke/ocl/orgs/MOH-PPB/sources/HPT/",
        raw_data={"code": "PH7813", "display": "Paracetamol"},
    )

    binding = TerminologyBinding.record(
        sample_drug,
        concept=concept,
        terminology_key="hpt",
        field_name="hpt_code",
        user=test_user,
    )

    assert TerminologyConceptCache.objects.count() == 1
    assert binding.concept.code == "PH7813"
    assert binding.content_object == sample_drug


def test_selected_binding_publishes_domain_event(sample_drug, test_user, mocker):
    """Selected terminology is visible to event-driven audit and sync consumers."""
    publish_event = mocker.patch("hmis.apps.core.signals.publish_event")
    concept = TerminologyConcept(
        code="PH7813",
        display="Paracetamol",
        owner="MOH-PPB",
        source="HPT",
        system="https://ilm-dev.dha.go.ke/ocl/orgs/MOH-PPB/sources/HPT/",
    )

    TerminologyBinding.record(
        sample_drug,
        concept=concept,
        terminology_key="hpt",
        field_name="hpt_code",
        user=test_user,
    )

    publish_event.assert_called_once()


def test_normalized_lookup_accepts_only_controlled_registry_keys(authenticated_client, mocker):
    """The generic endpoint keeps upstream owner/source selection server-controlled."""
    response = Mock()
    response.raise_for_status.return_value = None
    response.json.return_value = {"results": [{"code": "PH7813", "display": "Paracetamol"}]}
    mocker.patch(
        "hmis.apps.billing.services.terminology_core.requests.get",
        return_value=response,
    )

    result = authenticated_client.get("/api/terminology/lookup/hpt/?q=Paracetamol")

    assert result.status_code == 200
    assert result.data["source"]["owner"] == "MOH-PPB"
    assert result.data["results"][0]["code"] == "PH7813"
    assert result.data["results"][0]["retrieved_at"] is not None


def test_normalized_lookup_rejects_unapproved_source(authenticated_client):
    """Clients cannot turn the lookup endpoint into an arbitrary upstream proxy."""
    result = authenticated_client.get("/api/terminology/lookup/untrusted/?q=anything")

    assert result.status_code == 400


def test_fhir_medication_emits_hpt_coding(sample_drug):
    """FHIR Medication exports DHA HPT coding rather than only Vitora's local code."""
    from hmis.apps.core.fhir.views_clinical_resources import FHIRMedicationView

    sample_drug.hpt_code = "PH7813"
    sample_drug.hpt_system = "https://ilm-dev.dha.go.ke/ocl/orgs/MOH-PPB/sources/HPT/"
    sample_drug.hpt_display = "Paracetamol"
    sample_drug.save(update_fields=["hpt_code", "hpt_system", "hpt_display"])

    resource = FHIRMedicationView()._to_fhir_medication(sample_drug)

    assert {coding["code"] for coding in resource["code"]["coding"]} >= {"PH7813"}


def test_terminology_health_reports_selected_cache(authenticated_client):
    """Operations can monitor cache freshness without triggering an upstream call."""
    TerminologyConceptCache.objects.create(
        terminology_key="hpt",
        code="PH7813",
        display="Paracetamol",
        owner="MOH-PPB",
        source="HPT",
        system="https://ilm-dev.dha.go.ke/ocl/orgs/MOH-PPB/sources/HPT/",
    )

    result = authenticated_client.get("/api/terminology/health/")

    assert result.status_code == 200
    hpt = next(item for item in result.data["sources"] if item["key"] == "hpt")
    assert hpt["cached_count"] == 1
