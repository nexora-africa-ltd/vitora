"""Test fixtures for the laboratory module."""

from datetime import date

import pytest


@pytest.fixture
def sample_role(db):
    """Override the global ``sample_role`` so lab tests authenticate as
    LAB_SCIENTIST instead of DOCTOR.

    Lab ViewSets are now gated by role-based permissions
    (``LISCollectSamplePermission`` etc.); the default DOCTOR role would
    fail those checks. Tests verifying RBAC denial can create a different
    role inline.
    """
    from hmis.apps.core.models import Role

    role, _ = Role.objects.get_or_create(
        code="LAB_SCIENTIST",
        defaults={
            "name": "Laboratory Scientist",
            "hierarchy_level": 5,
            "is_active": True,
        },
    )
    return role


@pytest.fixture(autouse=True)
def _enable_laboratory_module(db, request):
    """Ensure the sample facility has the laboratory module enabled.

    The laboratory ViewSets are gated by ``LaboratoryModuleRequired``, which
    requires ``facility.has_laboratory=True``. Most existing tests assume a
    fully-functional lab; flip the flag so they keep passing.
    """
    if "sample_facility" not in request.fixturenames:
        return
    sample_facility = request.getfixturevalue("sample_facility")
    if not (sample_facility.has_laboratory or sample_facility.has_lis_standalone):
        sample_facility.has_laboratory = True
        sample_facility.save(update_fields=["has_laboratory"])


@pytest.fixture(autouse=True)
def _grant_lab_scientist_role(db, request):
    """Grant ``test_user`` the ``LAB_SCIENTIST`` role for laboratory tests.

    The new lab RBAC permissions
    (``LISCollectSamplePermission``, ``LISEnterResultsPermission``,
    ``LISVerifyResultsPermission``, ``LISReleaseResultsPermission`` …) gate
    by role code. Existing tests authenticate as the generic ``test_user``;
    rather than refactor every test, we assign LAB_SCIENTIST (the highest-
    privilege bench role) so they continue to exercise success paths. New
    tests that need to verify denial can override the role inline.

    We only run when the test actually uses ``test_user`` / ``authenticated_client``
    / ``test_staff_profile`` to avoid forcing user creation in tests that
    instantiate their own ``testuser`` (which would clash with the global
    fixture's username).
    """
    triggers = {"test_user", "authenticated_client", "test_staff_profile"}
    if not triggers.intersection(request.fixturenames):
        return None

    from hmis.apps.core.models import Department, Role, StaffProfile

    test_user = request.getfixturevalue("test_user")
    sample_organization = request.getfixturevalue("sample_organization")
    sample_facility = request.getfixturevalue("sample_facility")

    role, _ = Role.objects.get_or_create(
        code="LAB_SCIENTIST",
        defaults={
            "name": "Laboratory Scientist",
            "hierarchy_level": 5,
            "is_active": True,
        },
    )

    # If the test requested ``test_staff_profile`` directly, that fixture has
    # already created the profile — just promote its role to LAB_SCIENTIST.
    if "test_staff_profile" in request.fixturenames:
        profile = request.getfixturevalue("test_staff_profile")
        profile.primary_role = role
        profile.save(update_fields=["primary_role"])
        return profile

    dept, _ = Department.objects.get_or_create(
        code="LAB",
        defaults={"name": "Laboratory", "is_active": True},
    )
    profile, created = StaffProfile.objects.get_or_create(
        user=test_user,
        defaults={
            "employee_id": f"LAB-{test_user.pk}",
            "organization": sample_organization,
            "primary_facility": sample_facility,
            "primary_department": dept,
            "primary_role": role,
            "date_joined": date.today(),
        },
    )
    if not created:
        profile.primary_role = role
        if not profile.primary_facility_id:
            profile.primary_facility = sample_facility
        if not profile.organization_id:
            profile.organization = sample_organization
        profile.save(update_fields=["primary_role", "primary_facility", "organization"])
    return profile
