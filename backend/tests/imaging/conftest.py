"""Test fixtures for the imaging module."""

import pytest


@pytest.fixture(autouse=True)
def _enable_imaging_module(db, request):
    """Ensure the sample facility has imaging + imaging_standalone enabled.

    Standalone imaging ViewSets are gated by ``ImagingModuleRequired`` and
    ``ImagingStandaloneRequired``. Enable both flags so tests pass.
    """
    if "sample_facility" not in request.fixturenames:
        return
    facility = request.getfixturevalue("sample_facility")
    update_fields = []
    if not facility.has_imaging:
        facility.has_imaging = True
        update_fields.append("has_imaging")
    if not facility.has_imaging_standalone:
        facility.has_imaging_standalone = True
        update_fields.append("has_imaging_standalone")
    if update_fields:
        facility.save(update_fields=update_fields)
