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


@pytest.fixture(autouse=True)
def _grant_dicom_read_perms(db, request):
    """Grant DICOM read permissions to test users used in imaging tests."""
    from django.contrib.auth.models import Permission

    perm_study = Permission.objects.get(codename="view_dicomstudy")
    perm_instance = Permission.objects.get(codename="view_dicominstance")

    for fixture_name in ("test_user", "another_user"):
        if fixture_name in request.fixturenames:
            user = request.getfixturevalue(fixture_name)
            user.user_permissions.add(perm_study, perm_instance)
