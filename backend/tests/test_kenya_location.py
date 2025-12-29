"""
Tests for Kenya Location Hierarchy - Sprint 0.7

Following TDD principles: Write tests FIRST, then implement.
Item c) Kenya Location Hierarchy: County → Sub-county → Ward → Village/Estate

Requirements:
- County and Sub-county are mandatory
- Ward is optional
- Village/Estate is optional (free text)
- Searchable dropdowns with type-ahead
"""

import pytest
from django.core.exceptions import ValidationError


@pytest.mark.django_db
class TestLocationModels:
    """Test suite for Kenya location models."""

    def test_county_model_exists(self):
        """Test that County model exists."""
        from hmis.apps.core.models import County

        assert County is not None

    def test_sub_county_model_exists(self):
        """Test that SubCounty model exists."""
        from hmis.apps.core.models import SubCounty

        assert SubCounty is not None

    def test_ward_model_exists(self):
        """Test that Ward model exists."""
        from hmis.apps.core.models import Ward

        assert Ward is not None

    def test_create_county(self):
        """Test creating a county."""
        from hmis.apps.core.models import County

        county = County.objects.create(code=1, name="Mombasa")

        assert county.id is not None
        assert county.code == 1
        assert county.name == "Mombasa"

    def test_create_sub_county(self):
        """Test creating a sub-county linked to county."""
        from hmis.apps.core.models import County, SubCounty

        county = County.objects.create(code=1, name="Mombasa")
        sub_county = SubCounty.objects.create(county=county, name="Changamwe")

        assert sub_county.id is not None
        assert sub_county.county == county
        assert sub_county.name == "Changamwe"

    def test_create_ward(self):
        """Test creating a ward linked to sub-county."""
        from hmis.apps.core.models import County, SubCounty, Ward

        county = County.objects.create(code=1, name="Mombasa")
        sub_county = SubCounty.objects.create(county=county, name="Changamwe")
        ward = Ward.objects.create(sub_county=sub_county, name="Port Reitz")

        assert ward.id is not None
        assert ward.sub_county == sub_county
        assert ward.name == "Port Reitz"

    def test_county_str_representation(self):
        """Test county string representation."""
        from hmis.apps.core.models import County

        county = County.objects.create(code=47, name="Nairobi")

        assert str(county) == "Nairobi"

    def test_sub_county_str_representation(self):
        """Test sub-county string representation."""
        from hmis.apps.core.models import County, SubCounty

        county = County.objects.create(code=47, name="Nairobi")
        sub_county = SubCounty.objects.create(county=county, name="Westlands")

        assert str(sub_county) == "Westlands, Nairobi"

    def test_ward_str_representation(self):
        """Test ward string representation."""
        from hmis.apps.core.models import County, SubCounty, Ward

        county = County.objects.create(code=47, name="Nairobi")
        sub_county = SubCounty.objects.create(county=county, name="Westlands")
        ward = Ward.objects.create(sub_county=sub_county, name="Parklands")

        assert str(ward) == "Parklands, Westlands"

    def test_county_has_sub_counties_relation(self):
        """Test county has sub_counties related name."""
        from hmis.apps.core.models import County, SubCounty

        county = County.objects.create(code=1, name="Mombasa")
        SubCounty.objects.create(county=county, name="Changamwe")
        SubCounty.objects.create(county=county, name="Jomvu")

        assert county.sub_counties.count() == 2

    def test_sub_county_has_wards_relation(self):
        """Test sub-county has wards related name."""
        from hmis.apps.core.models import County, SubCounty, Ward

        county = County.objects.create(code=1, name="Mombasa")
        sub_county = SubCounty.objects.create(county=county, name="Changamwe")
        Ward.objects.create(sub_county=sub_county, name="Port Reitz")
        Ward.objects.create(sub_county=sub_county, name="Kipevu")

        assert sub_county.wards.count() == 2


@pytest.mark.django_db
class TestPatientLocationFields:
    """Test suite for patient location fields."""

    def test_patient_has_county_field(self):
        """Test Patient model has county field."""
        from hmis.apps.patients.models import Patient

        assert hasattr(Patient, "county")

    def test_patient_has_sub_county_field(self):
        """Test Patient model has sub_county field."""
        from hmis.apps.patients.models import Patient

        assert hasattr(Patient, "sub_county")

    def test_patient_has_ward_field(self):
        """Test Patient model has ward field (optional)."""
        from hmis.apps.patients.models import Patient

        assert hasattr(Patient, "ward")

    def test_patient_has_village_field(self):
        """Test Patient model has village field (free text, optional)."""
        from hmis.apps.patients.models import Patient

        assert hasattr(Patient, "village")

    def test_create_patient_with_location(self, test_user):
        """Test creating patient with full location."""
        from hmis.apps.core.models import County, SubCounty, Ward
        from hmis.apps.patients.models import Patient

        county = County.objects.create(code=1, name="Mombasa")
        sub_county = SubCounty.objects.create(county=county, name="Changamwe")
        ward = Ward.objects.create(sub_county=sub_county, name="Port Reitz")

        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            ward=ward,
            village="Mikindani Estate",
        )

        assert patient.county == county
        assert patient.sub_county == sub_county
        assert patient.ward == ward
        assert patient.village == "Mikindani Estate"

    def test_county_and_sub_county_required(self, test_user):
        """Test that county and sub_county are required."""
        from hmis.apps.patients.models import Patient

        patient = Patient(
            first_name="Test",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            county=None,
            sub_county=None,
        )

        with pytest.raises(ValidationError) as exc_info:
            patient.full_clean()

        errors = str(exc_info.value)
        assert "county" in errors or "sub_county" in errors

    def test_ward_is_optional(self, test_user):
        """Test that ward is optional."""
        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient

        county = County.objects.create(code=1, name="Mombasa")
        sub_county = SubCounty.objects.create(county=county, name="Changamwe")

        patient = Patient(
            first_name="Test",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            ward=None,  # Optional
        )
        patient.full_clean()  # Should not raise

    def test_village_is_optional(self, test_user):
        """Test that village is optional."""
        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient

        county = County.objects.create(code=1, name="Mombasa")
        sub_county = SubCounty.objects.create(county=county, name="Changamwe")

        patient = Patient(
            first_name="Test",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            village="",  # Optional
        )
        patient.full_clean()  # Should not raise


@pytest.mark.django_db
class TestLocationAPI:
    """Test suite for location API endpoints."""

    def test_list_counties(self, authenticated_client):
        """Test listing all counties."""
        from hmis.apps.core.models import County

        County.objects.create(code=1, name="Mombasa")
        County.objects.create(code=2, name="Kwale")

        response = authenticated_client.get("/api/locations/counties/")

        assert response.status_code == 200
        assert len(response.data) >= 2

    def test_list_sub_counties_by_county(self, authenticated_client):
        """Test listing sub-counties filtered by county."""
        from hmis.apps.core.models import County, SubCounty

        county = County.objects.create(code=1, name="Mombasa")
        SubCounty.objects.create(county=county, name="Changamwe")
        SubCounty.objects.create(county=county, name="Jomvu")

        response = authenticated_client.get(
            f"/api/locations/sub-counties/?county={county.id}"
        )

        assert response.status_code == 200
        assert len(response.data) == 2

    def test_list_wards_by_sub_county(self, authenticated_client):
        """Test listing wards filtered by sub-county."""
        from hmis.apps.core.models import County, SubCounty, Ward

        county = County.objects.create(code=1, name="Mombasa")
        sub_county = SubCounty.objects.create(county=county, name="Changamwe")
        Ward.objects.create(sub_county=sub_county, name="Port Reitz")
        Ward.objects.create(sub_county=sub_county, name="Kipevu")

        response = authenticated_client.get(
            f"/api/locations/wards/?sub_county={sub_county.id}"
        )

        assert response.status_code == 200
        assert len(response.data) == 2

    def test_search_counties(self, authenticated_client):
        """Test searching counties by name."""
        from hmis.apps.core.models import County

        County.objects.create(code=1, name="Mombasa")
        County.objects.create(code=47, name="Nairobi")

        response = authenticated_client.get("/api/locations/counties/?search=Nai")

        assert response.status_code == 200
        assert len(response.data) == 1
        assert response.data[0]["name"] == "Nairobi"

    def test_patient_location_in_response(self, authenticated_client):
        """Test patient location info in API response."""
        from hmis.apps.core.models import County, SubCounty, Ward
        from hmis.apps.patients.models import Patient

        county = County.objects.create(code=1, name="Mombasa")
        sub_county = SubCounty.objects.create(county=county, name="Changamwe")
        ward = Ward.objects.create(sub_county=sub_county, name="Port Reitz")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            ward=ward,
            village="Test Village",
        )

        response = authenticated_client.get(f"/api/patients/{patient.id}/")

        assert response.status_code == 200
        assert response.data["county"] == county.id
        assert response.data["county_name"] == "Mombasa"
        assert response.data["sub_county"] == sub_county.id
        assert response.data["sub_county_name"] == "Changamwe"
        assert response.data["ward"] == ward.id
        assert response.data["ward_name"] == "Port Reitz"
        assert response.data["village"] == "Test Village"

    def test_create_patient_with_location_via_api(self, authenticated_client):
        """Test creating patient with location via API."""
        from hmis.apps.core.models import County, SubCounty

        county = County.objects.create(code=1, name="Mombasa")
        sub_county = SubCounty.objects.create(county=county, name="Changamwe")

        data = {
            "first_name": "API",
            "last_name": "Patient",
            "date_of_birth": "1990-01-01",
            "gender": "M",
            "county": county.id,
            "sub_county": sub_county.id,
            "village": "Test Estate",
        }

        response = authenticated_client.post("/api/patients/", data, format="json")

        assert response.status_code == 201
        assert response.data["county"] == county.id
        assert response.data["sub_county"] == sub_county.id
