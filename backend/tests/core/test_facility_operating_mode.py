"""
Tests for Facility.operating_mode cascade.

Covers:
  * Enum exposes all five modes.
  * FULL_HMIS leaves flags untouched.
  * Each standalone mode disables clinical workflow modules and enables
    the relevant standalone bundle + billing + inventory.
  * Switching operating_mode on an existing facility re-applies the cascade.
  * The serializer exposes ``operating_mode`` on list/detail/create.
  * The API PATCH endpoint triggers the cascade end-to-end.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from hmis.apps.core.models import Facility

CLINICAL_FLAGS = (
    "has_inpatient",
    "has_emergency",
    "has_triage",
    "has_maternity",
    "has_theatre",
    "has_dialysis",
    "has_icu",
    "has_mortuary",
    "has_blood_bank",
    "has_allied_health",
    "has_scheduling",
    "has_surveillance",
    "has_immunizations",
    "has_outpatient",
)


@pytest.fixture
def facility_kwargs(sample_organization, sample_county, sample_sub_county):
    """Shared kwargs for creating facilities in this test module."""
    return {
        "organization": sample_organization,
        "county": sample_county,
        "sub_county": sample_sub_county,
        "level": Facility.FacilityLevel.LEVEL_3,
        "ownership": Facility.OwnershipType.PRIVATE,
    }


class TestOperatingModeEnum:
    def test_enum_has_all_five_modes(self):
        values = {choice.value for choice in Facility.OperatingMode}
        assert values == {
            "FULL_HMIS",
            "STANDALONE_LAB",
            "STANDALONE_PHARMACY",
            "STANDALONE_IMAGING",
            "STANDALONE_DIAGNOSTIC",
        }


class TestStandaloneCascade:
    """Verify cascade behaviour for each operating_mode."""

    @pytest.mark.django_db
    def test_full_hmis_does_not_alter_flags(self, facility_kwargs):
        f = Facility.objects.create(
            name="Demo Hospital",
            mfl_code="OPM-FULL-001",
            operating_mode=Facility.OperatingMode.FULL_HMIS,
            **facility_kwargs,
        )
        # FULL_HMIS keeps the model/level defaults — at least one clinical flag
        # should remain enabled (outpatient defaults to True for level 3).
        assert f.has_outpatient is True
        assert f.operating_mode == Facility.OperatingMode.FULL_HMIS

    @pytest.mark.django_db
    def test_standalone_lab_disables_clinical_enables_lab(self, facility_kwargs):
        f = Facility.objects.create(
            name="Standalone Lab",
            mfl_code="OPM-LAB-001",
            operating_mode=Facility.OperatingMode.STANDALONE_LAB,
            **facility_kwargs,
        )
        for flag in CLINICAL_FLAGS:
            assert getattr(f, flag) is False, f"{flag} should be False in STANDALONE_LAB"
        assert f.has_laboratory is True
        assert f.has_lis_standalone is True
        assert f.has_billing is True
        assert f.has_inventory is True

    @pytest.mark.django_db
    def test_standalone_pharmacy_enables_pharmacy_stack(self, facility_kwargs):
        f = Facility.objects.create(
            name="Standalone Pharm",
            mfl_code="OPM-PHARM-001",
            operating_mode=Facility.OperatingMode.STANDALONE_PHARMACY,
            **facility_kwargs,
        )
        for flag in CLINICAL_FLAGS:
            assert getattr(f, flag) is False
        assert f.has_pharmacy is True
        assert f.has_pharmacy_standalone is True
        assert f.has_billing is True
        assert f.has_inventory is True

    @pytest.mark.django_db
    def test_standalone_imaging_enables_imaging_stack(self, facility_kwargs):
        f = Facility.objects.create(
            name="Standalone Imaging",
            mfl_code="OPM-IMG-001",
            operating_mode=Facility.OperatingMode.STANDALONE_IMAGING,
            **facility_kwargs,
        )
        for flag in CLINICAL_FLAGS:
            assert getattr(f, flag) is False
        assert f.has_imaging is True
        assert f.has_imaging_standalone is True
        assert f.has_billing is True
        assert f.has_inventory is True

    @pytest.mark.django_db
    def test_standalone_diagnostic_enables_lab_and_imaging(self, facility_kwargs):
        f = Facility.objects.create(
            name="Diagnostic Centre",
            mfl_code="OPM-DIAG-001",
            operating_mode=Facility.OperatingMode.STANDALONE_DIAGNOSTIC,
            **facility_kwargs,
        )
        for flag in CLINICAL_FLAGS:
            assert getattr(f, flag) is False
        assert f.has_laboratory is True
        assert f.has_imaging is True
        assert f.has_lis_standalone is True
        assert f.has_imaging_standalone is True
        assert f.has_billing is True
        assert f.has_inventory is True


class TestModeSwitching:
    """Switching operating_mode on an existing facility re-applies the cascade."""

    @pytest.mark.django_db
    def test_switch_full_to_standalone_lab_disables_clinical(self, facility_kwargs):
        f = Facility.objects.create(
            name="Switcher",
            mfl_code="OPM-SWITCH-001",
            operating_mode=Facility.OperatingMode.FULL_HMIS,
            **facility_kwargs,
        )
        assert f.has_outpatient is True  # baseline

        f.operating_mode = Facility.OperatingMode.STANDALONE_LAB
        f.save()

        f.refresh_from_db()
        assert f.has_outpatient is False
        assert f.has_inpatient is False
        assert f.has_triage is False
        assert f.has_laboratory is True
        assert f.has_lis_standalone is True

    @pytest.mark.django_db
    def test_switch_between_standalone_modes_reapplies(self, facility_kwargs):
        f = Facility.objects.create(
            name="Switcher",
            mfl_code="OPM-SWITCH-002",
            operating_mode=Facility.OperatingMode.STANDALONE_LAB,
            **facility_kwargs,
        )
        assert f.has_lis_standalone is True
        assert f.has_pharmacy_standalone is False

        f.operating_mode = Facility.OperatingMode.STANDALONE_PHARMACY
        f.save()
        f.refresh_from_db()

        # The cascade does not turn the previous-mode standalone flag off
        # (lab/pharmacy standalones live on independent boolean columns),
        # but it must turn the new-mode flags ON.
        assert f.has_pharmacy is True
        assert f.has_pharmacy_standalone is True

    @pytest.mark.django_db
    def test_switching_back_to_full_does_not_restore_flags(self, facility_kwargs):
        """FULL_HMIS is documented as NOT restoring flags — admin re-enables."""
        f = Facility.objects.create(
            name="Round-tripper",
            mfl_code="OPM-RT-001",
            operating_mode=Facility.OperatingMode.STANDALONE_LAB,
            **facility_kwargs,
        )
        assert f.has_outpatient is False

        f.operating_mode = Facility.OperatingMode.FULL_HMIS
        f.save()
        f.refresh_from_db()

        # FULL_HMIS leaves flags as-is — outpatient stays disabled until
        # an admin flips it back manually.
        assert f.has_outpatient is False


class TestOperatingModeSerializer:
    """The field must be exposed via list/detail/create serializers."""

    @pytest.mark.django_db
    def test_list_serializer_includes_operating_mode(self, facility_kwargs):
        from hmis.apps.core.serializers import FacilityListSerializer

        f = Facility.objects.create(
            name="Listed",
            mfl_code="OPM-LIST-001",
            operating_mode=Facility.OperatingMode.STANDALONE_LAB,
            **facility_kwargs,
        )
        data = FacilityListSerializer(f).data
        assert data["operating_mode"] == "STANDALONE_LAB"

    @pytest.mark.django_db
    def test_detail_serializer_includes_operating_mode(self, facility_kwargs):
        from hmis.apps.core.serializers import FacilityDetailSerializer

        f = Facility.objects.create(
            name="Detail",
            mfl_code="OPM-DET-001",
            operating_mode=Facility.OperatingMode.STANDALONE_DIAGNOSTIC,
            **facility_kwargs,
        )
        data = FacilityDetailSerializer(f).data
        assert data["operating_mode"] == "STANDALONE_DIAGNOSTIC"


class TestOperatingModeAPI:
    """End-to-end: PATCH /api/core/facilities/{id}/ triggers the cascade."""

    @pytest.mark.django_db
    def test_patch_operating_mode_triggers_cascade(self, facility_kwargs, db):
        # FacilityViewSet write ops require an admin user.
        from django.contrib.auth import get_user_model

        User = get_user_model()
        admin = User.objects.create_superuser(
            username="opm-admin",
            email="opm-admin@example.com",
            password="x",
        )

        f = Facility.objects.create(
            name="Patcher",
            mfl_code="OPM-PATCH-001",
            operating_mode=Facility.OperatingMode.FULL_HMIS,
            **facility_kwargs,
        )

        client = APIClient()
        client.force_authenticate(user=admin)
        resp = client.patch(
            f"/api/core/facilities/{f.id}/",
            {"operating_mode": "STANDALONE_LAB"},
            format="json",
        )

        assert resp.status_code == 200, resp.content
        assert resp.data["operating_mode"] == "STANDALONE_LAB"

        f.refresh_from_db()
        assert f.has_inpatient is False
        assert f.has_outpatient is False
        assert f.has_laboratory is True
        assert f.has_lis_standalone is True
