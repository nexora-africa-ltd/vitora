"""Test fixtures for the pharmacy module."""

import pytest


@pytest.fixture(autouse=True)
def _enable_pharmacy_module(db, request):
    """Ensure the sample facility has pharmacy + pharmacy_standalone enabled.

    Standalone pharmacy ViewSets are gated by ``PharmacyModuleRequired`` and
    ``PharmacyStandaloneRequired``. Most pharmacy tests assume a fully-
    functional pharmacy module; enable both flags so they continue to pass.
    """
    if "sample_facility" not in request.fixturenames:
        return
    facility = request.getfixturevalue("sample_facility")
    update_fields = []
    if not facility.has_pharmacy:
        facility.has_pharmacy = True
        update_fields.append("has_pharmacy")
    if not facility.has_pharmacy_standalone:
        facility.has_pharmacy_standalone = True
        update_fields.append("has_pharmacy_standalone")
    if update_fields:
        facility.save(update_fields=update_fields)
