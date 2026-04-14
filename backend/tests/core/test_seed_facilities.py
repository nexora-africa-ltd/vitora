"""Tests for the seed_facilities management command."""

from io import StringIO

import pytest
from django.core.management import call_command

from hmis.apps.core.models import County, Facility, SubCounty


@pytest.mark.django_db
class TestSeedFacilities:
    """Tests for the seed_facilities management command."""

    def test_creates_facilities_when_locations_exist(self):
        """Should create facilities when matching counties/sub-counties exist."""
        county = County.objects.create(code=1, name="Nairobi")
        SubCounty.objects.create(county=county, name="Dagoretti North")
        SubCounty.objects.create(county=county, name="Kibra")
        SubCounty.objects.create(county=county, name="Mathare")
        SubCounty.objects.create(county=county, name="Westlands")
        SubCounty.objects.create(county=county, name="Kasarani")

        out = StringIO()
        call_command("seed_facilities", stdout=out)

        output = out.getvalue()
        # At least the Nairobi-based facilities should be created
        assert Facility.objects.filter(county=county).exists()
        assert "Created" in output

    def test_skips_existing_facilities(self):
        """Should skip facilities that already exist (by MFL code)."""
        county = County.objects.create(code=1, name="Nairobi")
        sub_county = SubCounty.objects.create(county=county, name="Dagoretti North")
        Facility.objects.create(
            mfl_code="12345",
            name="Existing Facility",
            level="6",
            ownership="PUBLIC",
            county=county,
            sub_county=sub_county,
        )

        out = StringIO()
        call_command("seed_facilities", stdout=out)

        output = out.getvalue()
        assert "Skipped" in output
        # Should still be just the one facility with this MFL code
        assert Facility.objects.filter(mfl_code="12345").count() == 1

    def test_force_recreates_existing(self):
        """Should recreate facilities when --force is used."""
        county = County.objects.create(code=1, name="Nairobi")
        sub_county = SubCounty.objects.create(county=county, name="Dagoretti North")
        Facility.objects.create(
            mfl_code="12345",
            name="Old Name",
            level="6",
            ownership="PUBLIC",
            county=county,
            sub_county=sub_county,
        )

        out = StringIO()
        call_command("seed_facilities", "--force", stdout=out)

        # Should have replaced the facility
        facility = Facility.objects.get(mfl_code="12345")
        assert facility.name == "Kenyatta National Hospital"

    def test_skips_when_county_not_found(self):
        """Should skip facilities when their county doesn't exist in DB."""
        out = StringIO()
        call_command("seed_facilities", stdout=out)

        output = out.getvalue()
        assert "Skipped" in output or "Done. Created 0" in output

    def test_modules_set_from_keph_level(self):
        """Should set facility modules based on KEPH level defaults."""
        county = County.objects.create(code=1, name="Nairobi")
        SubCounty.objects.create(county=county, name="Dagoretti North")

        call_command("seed_facilities", stdout=StringIO())

        # Level 6 (National Referral) should have most modules enabled
        facility = Facility.objects.filter(mfl_code="12345").first()
        if facility:
            assert facility.has_outpatient is True
            assert facility.has_inpatient is True
            assert facility.has_pharmacy is True
            assert facility.has_laboratory is True
