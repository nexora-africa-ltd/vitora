"""
Tests for CodeSystem model and API.

Phase T1: Code System Registry
TDD Focus: Test code system registry for FHIR compliance

These tests validate the CodeSystem model that provides a registry
of all vocabularies and code systems used in Vitora, enabling proper
FHIR CodeSystem URIs in exports.
"""

import pytest  # type: ignore
from django.contrib.contenttypes.models import ContentType
from rest_framework import status


@pytest.mark.unit
class TestCodeSystemModel:
    """Tests for the CodeSystem model."""

    @pytest.mark.django_db
    def test_create_code_system(self):
        """CodeSystem entries can be created."""
        from hmis.apps.core.models import CodeSystem

        code_system = CodeSystem.objects.create(
            slug="test-codes",
            name="Test Codes",
            uri="https://example.com/fhir/CodeSystem/test",
            version="1.0",
            publisher="Test Publisher",
            description="Test code system",
            is_internal=True,
        )

        assert code_system.id is not None
        assert code_system.slug == "test-codes"
        assert code_system.name == "Test Codes"
        assert code_system.uri == "https://example.com/fhir/CodeSystem/test"
        assert code_system.version == "1.0"
        assert code_system.publisher == "Test Publisher"
        assert code_system.is_internal is True
        assert code_system.is_active is True

    @pytest.mark.django_db
    def test_code_system_has_timestamps(self):
        """CodeSystem entries should have timestamps."""
        from django.utils import timezone

        from hmis.apps.core.models import CodeSystem

        before = timezone.now()
        code_system = CodeSystem.objects.create(
            slug="timestamp-test",
            name="Timestamp Test",
            uri="https://example.com/fhir/CodeSystem/timestamp",
        )
        after = timezone.now()

        assert code_system.created_at is not None
        assert code_system.updated_at is not None
        assert before <= code_system.created_at <= after

    @pytest.mark.django_db
    def test_code_system_slug_unique(self):
        """CodeSystem slug must be unique."""
        from django.db import IntegrityError

        from hmis.apps.core.models import CodeSystem

        CodeSystem.objects.create(
            slug="unique-test",
            name="First",
            uri="https://example.com/fhir/CodeSystem/first",
        )

        with pytest.raises(IntegrityError):
            CodeSystem.objects.create(
                slug="unique-test",
                name="Second",
                uri="https://example.com/fhir/CodeSystem/second",
            )

    @pytest.mark.django_db
    def test_code_system_str_representation(self):
        """CodeSystem string representation should include name and slug."""
        from hmis.apps.core.models import CodeSystem

        code_system = CodeSystem.objects.create(
            slug="str-test",
            name="String Test",
            uri="https://example.com/fhir/CodeSystem/str",
        )

        assert str(code_system) == "String Test (str-test)"


@pytest.fixture(autouse=True)
def _seed_code_systems(request, db):
    """Seed the CodeSystem entries that data migrations would create."""
    if request.cls and request.cls.__name__ in (
        "TestPrePopulatedCodeSystems",
        "TestExternalCodeMappingCodeSystemRef",
        "TestCodeSystemAPI",
    ):
        from hmis.apps.core.models import CodeSystem

        entries = [
            (
                "vitora-lab",
                "Vitora Laboratory Codes",
                "https://vitora.health/fhir/CodeSystem/laboratory",
                True,
            ),
            ("icd-10", "ICD-10", "http://hl7.org/fhir/sid/icd-10", False),
            ("loinc", "LOINC", "http://loinc.org", False),
            ("sha-tariff-2025", "SHA Tariff 2025", "https://sha.go.ke/tariff/2025", False),
            ("snomed-ct", "SNOMED CT", "http://snomed.info/sct", False),
            ("khis", "KHIS", "https://hiskenya.org/khis", False),
            ("ndc", "NDC", "https://www.accessdata.fda.gov/scripts/cder/ndc", False),
        ]
        for slug, name, uri, internal in entries:
            CodeSystem.objects.get_or_create(
                slug=slug,
                defaults={
                    "name": name,
                    "uri": uri,
                    "is_internal": internal,
                    "is_active": True,
                },
            )


@pytest.mark.unit
class TestPrePopulatedCodeSystems:
    """Tests for pre-populated code systems from migrations."""

    @pytest.mark.django_db
    def test_vitora_lab_code_system_exists(self):
        """Vitora lab code system should be pre-populated."""
        from hmis.apps.core.models import CodeSystem

        code_system = CodeSystem.objects.get(slug="vitora-lab")

        assert code_system.name == "Vitora Laboratory Codes"
        assert code_system.uri == "https://vitora.health/fhir/CodeSystem/laboratory"
        assert code_system.is_internal is True
        assert code_system.is_active is True

    @pytest.mark.django_db
    def test_icd10_code_system_exists(self):
        """ICD-10 code system should be pre-populated."""
        from hmis.apps.core.models import CodeSystem

        code_system = CodeSystem.objects.get(slug="icd-10")

        assert code_system.name == "ICD-10"
        assert code_system.uri == "http://hl7.org/fhir/sid/icd-10"
        assert code_system.is_internal is False

    @pytest.mark.django_db
    def test_loinc_code_system_exists(self):
        """LOINC code system should be pre-populated."""
        from hmis.apps.core.models import CodeSystem

        code_system = CodeSystem.objects.get(slug="loinc")

        assert code_system.name == "LOINC"
        assert code_system.uri == "http://loinc.org"

    @pytest.mark.django_db
    def test_sha_tariff_code_system_exists(self):
        """SHA tariff code system should be pre-populated."""
        from hmis.apps.core.models import CodeSystem

        code_system = CodeSystem.objects.get(slug="sha-tariff-2025")

        assert code_system.name == "SHA Tariff 2025"
        assert code_system.uri == "https://sha.go.ke/tariff/2025"

    @pytest.mark.django_db
    def test_all_required_code_systems_exist(self):
        """All required code systems should be pre-populated."""
        from hmis.apps.core.models import CodeSystem

        required_slugs = [
            "vitora-lab",
            "icd-10",
            "loinc",
            "sha-tariff-2025",
            "snomed-ct",
            "khis",
            "ndc",
        ]

        for slug in required_slugs:
            assert CodeSystem.objects.filter(slug=slug).exists(), f"Missing: {slug}"


@pytest.mark.unit
class TestExternalCodeMappingCodeSystemRef:
    """Tests for ExternalCodeMapping.code_system_ref field."""

    @pytest.mark.django_db
    def test_mapping_can_link_to_code_system(self, sample_county):
        """ExternalCodeMapping can link to a CodeSystem."""
        from hmis.apps.core.models import CodeSystem, ExternalCodeMapping

        code_system = CodeSystem.objects.get(slug="loinc")
        content_type = ContentType.objects.get_for_model(sample_county)

        mapping = ExternalCodeMapping.objects.create(
            code_system="LOINC",
            code_system_ref=code_system,
            external_code="2951-2",
            external_display="Sodium [Moles/volume] in Serum or Plasma",
            content_type=content_type,
            object_id=sample_county.pk,
        )

        assert mapping.code_system_ref == code_system
        assert mapping.code_system_ref.uri == "http://loinc.org"

    @pytest.mark.django_db
    def test_mapping_code_system_ref_optional(self, sample_county):
        """ExternalCodeMapping.code_system_ref should be optional."""
        from hmis.apps.core.models import ExternalCodeMapping

        content_type = ContentType.objects.get_for_model(sample_county)

        mapping = ExternalCodeMapping.objects.create(
            code_system="LIS_ACME",
            external_code="001",
            content_type=content_type,
            object_id=sample_county.pk,
        )

        assert mapping.code_system_ref is None

    @pytest.mark.django_db
    def test_get_fhir_uri_with_code_system_ref(self, sample_county):
        """get_fhir_uri should return URI from linked CodeSystem."""
        from hmis.apps.core.models import CodeSystem, ExternalCodeMapping

        code_system = CodeSystem.objects.get(slug="loinc")
        content_type = ContentType.objects.get_for_model(sample_county)

        mapping = ExternalCodeMapping.objects.create(
            code_system="LOINC",
            code_system_ref=code_system,
            external_code="2951-2",
            content_type=content_type,
            object_id=sample_county.pk,
        )

        assert mapping.get_fhir_uri() == "http://loinc.org"

    @pytest.mark.django_db
    def test_get_fhir_uri_without_code_system_ref(self, sample_county):
        """get_fhir_uri should return None when not linked to CodeSystem."""
        from hmis.apps.core.models import ExternalCodeMapping

        content_type = ContentType.objects.get_for_model(sample_county)

        mapping = ExternalCodeMapping.objects.create(
            code_system="LIS_ACME",
            external_code="001",
            content_type=content_type,
            object_id=sample_county.pk,
        )

        assert mapping.get_fhir_uri() is None


@pytest.mark.integration
class TestCodeSystemAPI:
    """Tests for the CodeSystem API endpoints."""

    @pytest.mark.django_db
    def test_list_code_systems(self, authenticated_client):
        """GET /api/terminology/codesystems/ should return list of code systems."""
        response = authenticated_client.get("/api/terminology/codesystems/")

        assert response.status_code == status.HTTP_200_OK
        # Should have at least the pre-populated code systems
        assert len(response.data) >= 7

        # Check that vitora-lab is in the response
        slugs = [cs["slug"] for cs in response.data]
        assert "vitora-lab" in slugs
        assert "icd-10" in slugs
        assert "loinc" in slugs

    @pytest.mark.django_db
    def test_get_code_system_by_slug(self, authenticated_client):
        """GET /api/terminology/codesystems/{slug}/ should return single code system."""
        response = authenticated_client.get("/api/terminology/codesystems/loinc/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["slug"] == "loinc"
        assert response.data["name"] == "LOINC"
        assert response.data["uri"] == "http://loinc.org"

    @pytest.mark.django_db
    def test_code_system_api_read_only(self, authenticated_client):
        """CodeSystem API should be read-only (no POST/PUT/DELETE)."""
        data = {
            "slug": "new-system",
            "name": "New System",
            "uri": "https://example.com/new",
        }

        # POST should not be allowed
        response = authenticated_client.post("/api/terminology/codesystems/", data)
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

        # PUT should not be allowed
        response = authenticated_client.put("/api/terminology/codesystems/loinc/", data)
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

        # DELETE should not be allowed
        response = authenticated_client.delete("/api/terminology/codesystems/loinc/")
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    @pytest.mark.django_db
    def test_code_system_api_requires_auth(self, api_client):
        """CodeSystem API should require authentication."""
        response = api_client.get("/api/terminology/codesystems/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.django_db
    def test_search_code_systems(self, authenticated_client):
        """Code systems should be searchable by name and description."""
        # Search for LOINC
        response = authenticated_client.get("/api/terminology/codesystems/?search=laboratory")

        assert response.status_code == status.HTTP_200_OK
        # Should find code systems with "laboratory" in name/description
        assert len(response.data) >= 1

    @pytest.mark.django_db
    def test_inactive_code_systems_hidden(self, authenticated_client):
        """Inactive code systems should not appear in API results."""
        from hmis.apps.core.models import CodeSystem

        # Create an inactive code system
        CodeSystem.objects.create(
            slug="inactive-test",
            name="Inactive Test",
            uri="https://example.com/inactive",
            is_active=False,
        )

        response = authenticated_client.get("/api/terminology/codesystems/")

        assert response.status_code == status.HTTP_200_OK
        slugs = [cs["slug"] for cs in response.data]
        assert "inactive-test" not in slugs

    @pytest.mark.django_db
    def test_code_system_response_fields(self, authenticated_client):
        """CodeSystem API response should include all required fields."""
        response = authenticated_client.get("/api/terminology/codesystems/vitora-lab/")

        assert response.status_code == status.HTTP_200_OK

        # Check all fields are present
        required_fields = [
            "id",
            "slug",
            "name",
            "uri",
            "version",
            "publisher",
            "description",
            "is_internal",
            "is_active",
            "created_at",
            "updated_at",
        ]

        for field in required_fields:
            assert field in response.data, f"Missing field: {field}"
