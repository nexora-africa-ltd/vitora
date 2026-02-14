"""
Tests for ExternalCodeMapping model.

Phase T0: External Code Mapping
TDD Focus: Test external code resolution for LIS/SHA/NHIF integrations

These tests validate that external system codes can be properly mapped
to internal Vitora entities and resolved during data import/sync.
"""

import pytest  # type: ignore
from django.contrib.contenttypes.models import ContentType


@pytest.mark.unit
class TestExternalCodeMappingModel:
    """Tests for the ExternalCodeMapping model."""

    @pytest.mark.django_db
    def test_create_mapping(self, sample_county):
        """ExternalCodeMapping entries can be created."""
        from hmis.apps.core.models import ExternalCodeMapping

        content_type = ContentType.objects.get_for_model(sample_county)

        mapping = ExternalCodeMapping.objects.create(
            code_system="LIS_ACME",
            external_code="001",
            external_display="Mombasa (ACME)",
            content_type=content_type,
            object_id=sample_county.pk,
        )

        assert mapping.id is not None
        assert mapping.code_system == "LIS_ACME"
        assert mapping.external_code == "001"
        assert mapping.external_display == "Mombasa (ACME)"
        assert mapping.is_active is True
        assert mapping.relationship == "EQUIVALENT"

    @pytest.mark.django_db
    def test_mapping_has_timestamps(self, sample_county):
        """ExternalCodeMapping entries should have timestamps."""
        from django.utils import timezone

        from hmis.apps.core.models import ExternalCodeMapping

        content_type = ContentType.objects.get_for_model(sample_county)

        before = timezone.now()
        mapping = ExternalCodeMapping.objects.create(
            code_system="LIS_ACME",
            external_code="001",
            content_type=content_type,
            object_id=sample_county.pk,
        )
        after = timezone.now()

        assert mapping.created_at is not None
        assert mapping.updated_at is not None
        assert before <= mapping.created_at <= after

    @pytest.mark.django_db
    def test_mapping_relationship_choices(self, sample_county):
        """ExternalCodeMapping should accept valid relationship types."""
        from hmis.apps.core.models import ExternalCodeMapping

        content_type = ContentType.objects.get_for_model(sample_county)
        valid_relationships = ["EQUIVALENT", "BROADER", "NARROWER", "RELATED"]

        for i, rel in enumerate(valid_relationships):
            mapping = ExternalCodeMapping.objects.create(
                code_system=f"TEST_SYS_{i}",
                external_code=f"00{i}",
                content_type=content_type,
                object_id=sample_county.pk,
                relationship=rel,
            )
            assert mapping.relationship == rel

    @pytest.mark.django_db
    def test_unique_constraint_code_system_external_code(self, sample_county):
        """Each code_system + external_code pair must be unique."""
        from django.db import IntegrityError

        from hmis.apps.core.models import ExternalCodeMapping

        content_type = ContentType.objects.get_for_model(sample_county)

        ExternalCodeMapping.objects.create(
            code_system="LIS_ACME",
            external_code="001",
            content_type=content_type,
            object_id=sample_county.pk,
        )

        with pytest.raises(IntegrityError):
            ExternalCodeMapping.objects.create(
                code_system="LIS_ACME",
                external_code="001",
                content_type=content_type,
                object_id=sample_county.pk,
            )

    @pytest.mark.django_db
    def test_str_representation(self, sample_county):
        """ExternalCodeMapping should have a string representation."""
        from hmis.apps.core.models import ExternalCodeMapping

        content_type = ContentType.objects.get_for_model(sample_county)

        mapping = ExternalCodeMapping.objects.create(
            code_system="LIS_ACME",
            external_code="001",
            content_type=content_type,
            object_id=sample_county.pk,
        )

        str_repr = str(mapping)
        assert "LIS_ACME" in str_repr
        assert "001" in str_repr


@pytest.mark.unit
class TestExternalCodeMappingResolve:
    """Tests for the resolve class methods."""

    @pytest.mark.django_db
    def test_resolve_returns_mapped_object(self, sample_county):
        """resolve() returns the internal object when mapping exists."""
        from hmis.apps.core.models import ExternalCodeMapping

        content_type = ContentType.objects.get_for_model(sample_county)

        ExternalCodeMapping.objects.create(
            code_system="LIS_ACME",
            external_code="MSA_001",
            content_type=content_type,
            object_id=sample_county.pk,
        )

        result = ExternalCodeMapping.resolve("LIS_ACME", "MSA_001")

        assert result is not None
        assert result.pk == sample_county.pk
        assert result.name == sample_county.name

    @pytest.mark.django_db
    def test_resolve_returns_none_for_unmapped_code(self):
        """resolve() returns None when no mapping exists."""
        from hmis.apps.core.models import ExternalCodeMapping

        result = ExternalCodeMapping.resolve("LIS_ACME", "NONEXISTENT_CODE")

        assert result is None

    @pytest.mark.django_db
    def test_resolve_ignores_inactive_mappings(self, sample_county):
        """resolve() ignores inactive mappings."""
        from hmis.apps.core.models import ExternalCodeMapping

        content_type = ContentType.objects.get_for_model(sample_county)

        ExternalCodeMapping.objects.create(
            code_system="LIS_ACME",
            external_code="MSA_001",
            content_type=content_type,
            object_id=sample_county.pk,
            is_active=False,
        )

        result = ExternalCodeMapping.resolve("LIS_ACME", "MSA_001")

        assert result is None

    @pytest.mark.django_db
    def test_resolve_or_raise_returns_mapped_object(self, sample_county):
        """resolve_or_raise() returns the internal object when mapping exists."""
        from hmis.apps.core.models import ExternalCodeMapping

        content_type = ContentType.objects.get_for_model(sample_county)

        ExternalCodeMapping.objects.create(
            code_system="LIS_ACME",
            external_code="MSA_001",
            content_type=content_type,
            object_id=sample_county.pk,
        )

        result = ExternalCodeMapping.resolve_or_raise("LIS_ACME", "MSA_001")

        assert result is not None
        assert result.pk == sample_county.pk

    @pytest.mark.django_db
    def test_resolve_or_raise_raises_for_unmapped_code(self):
        """resolve_or_raise() raises DoesNotExist when no mapping exists."""
        from hmis.apps.core.models import ExternalCodeMapping

        with pytest.raises(ExternalCodeMapping.DoesNotExist):
            ExternalCodeMapping.resolve_or_raise("LIS_ACME", "NONEXISTENT_CODE")

    @pytest.mark.django_db
    def test_resolve_or_raise_raises_for_inactive_mapping(self, sample_county):
        """resolve_or_raise() raises DoesNotExist for inactive mappings."""
        from hmis.apps.core.models import ExternalCodeMapping

        content_type = ContentType.objects.get_for_model(sample_county)

        ExternalCodeMapping.objects.create(
            code_system="LIS_ACME",
            external_code="MSA_001",
            content_type=content_type,
            object_id=sample_county.pk,
            is_active=False,
        )

        with pytest.raises(ExternalCodeMapping.DoesNotExist):
            ExternalCodeMapping.resolve_or_raise("LIS_ACME", "MSA_001")


@pytest.mark.unit
class TestExternalCodeMappingReverseMapping:
    """Tests for reverse mapping lookups (internal object → external code)."""

    @pytest.mark.django_db
    def test_get_mappings_for_object(self, sample_county):
        """get_mappings_for_object() returns all active mappings for an object."""
        from hmis.apps.core.models import ExternalCodeMapping

        content_type = ContentType.objects.get_for_model(sample_county)

        # Create multiple mappings for the same object
        ExternalCodeMapping.objects.create(
            code_system="LIS_ACME",
            external_code="MSA_001",
            content_type=content_type,
            object_id=sample_county.pk,
        )
        ExternalCodeMapping.objects.create(
            code_system="SHA_TARIFF",
            external_code="SHA_MSA",
            content_type=content_type,
            object_id=sample_county.pk,
        )
        # Inactive mapping should not be included
        ExternalCodeMapping.objects.create(
            code_system="OLD_SYSTEM",
            external_code="OLD_001",
            content_type=content_type,
            object_id=sample_county.pk,
            is_active=False,
        )

        mappings = ExternalCodeMapping.get_mappings_for_object(sample_county)

        assert mappings.count() == 2
        code_systems = [m.code_system for m in mappings]
        assert "LIS_ACME" in code_systems
        assert "SHA_TARIFF" in code_systems
        assert "OLD_SYSTEM" not in code_systems

    @pytest.mark.django_db
    def test_get_external_code_returns_code(self, sample_county):
        """get_external_code() returns the external code for a code system."""
        from hmis.apps.core.models import ExternalCodeMapping

        content_type = ContentType.objects.get_for_model(sample_county)

        ExternalCodeMapping.objects.create(
            code_system="SHA_TARIFF",
            external_code="SHA_MSA_2025",
            content_type=content_type,
            object_id=sample_county.pk,
        )

        result = ExternalCodeMapping.get_external_code(sample_county, "SHA_TARIFF")

        assert result == "SHA_MSA_2025"

    @pytest.mark.django_db
    def test_get_external_code_returns_none_for_unmapped(self, sample_county):
        """get_external_code() returns None when no mapping exists."""
        from hmis.apps.core.models import ExternalCodeMapping

        result = ExternalCodeMapping.get_external_code(sample_county, "UNMAPPED_SYSTEM")

        assert result is None

    @pytest.mark.django_db
    def test_get_external_code_returns_none_for_inactive(self, sample_county):
        """get_external_code() returns None for inactive mappings."""
        from hmis.apps.core.models import ExternalCodeMapping

        content_type = ContentType.objects.get_for_model(sample_county)

        ExternalCodeMapping.objects.create(
            code_system="SHA_TARIFF",
            external_code="SHA_MSA_2025",
            content_type=content_type,
            object_id=sample_county.pk,
            is_active=False,
        )

        result = ExternalCodeMapping.get_external_code(sample_county, "SHA_TARIFF")

        assert result is None


@pytest.mark.unit
class TestExternalCodeMappingWithDifferentModels:
    """Tests that ExternalCodeMapping works with different model types."""

    @pytest.mark.django_db
    def test_mapping_with_icd10_code(self, sample_icd10_code):
        """ExternalCodeMapping works with ICD10Code model."""
        from hmis.apps.core.models import ExternalCodeMapping

        content_type = ContentType.objects.get_for_model(sample_icd10_code)

        mapping = ExternalCodeMapping.objects.create(
            code_system="KHIS_DIAGNOSIS",
            external_code="KHIS_A00",
            external_display="Cholera (KHIS)",
            content_type=content_type,
            object_id=sample_icd10_code.pk,
        )

        resolved = ExternalCodeMapping.resolve("KHIS_DIAGNOSIS", "KHIS_A00")

        assert resolved is not None
        assert resolved.pk == sample_icd10_code.pk

    @pytest.mark.django_db
    def test_mapping_with_test_catalog(self, sample_test_catalog):
        """ExternalCodeMapping works with TestCatalog model."""
        from hmis.apps.core.models import ExternalCodeMapping

        content_type = ContentType.objects.get_for_model(sample_test_catalog)

        mapping = ExternalCodeMapping.objects.create(
            code_system="LIS_VENDOR",
            external_code="CBC_001",
            external_display="Complete Blood Count",
            content_type=content_type,
            object_id=sample_test_catalog.pk,
        )

        resolved = ExternalCodeMapping.resolve("LIS_VENDOR", "CBC_001")

        assert resolved is not None
        assert resolved.pk == sample_test_catalog.pk


@pytest.mark.unit
class TestExternalCodeMappingIntegrationScenarios:
    """Integration-style tests for real-world usage patterns."""

    @pytest.mark.django_db
    def test_lis_result_import_scenario(self, sample_test_catalog):
        """Simulate LIS result import: resolve external test code."""
        from hmis.apps.core.models import ExternalCodeMapping

        content_type = ContentType.objects.get_for_model(sample_test_catalog)

        # Setup: facility maps LIS codes to Vitora TestCatalog
        ExternalCodeMapping.objects.create(
            code_system="LIS_ACME",
            external_code="12345",
            external_display="Hemoglobin (ACME)",
            content_type=content_type,
            object_id=sample_test_catalog.pk,
            notes="Mapped during ACME LIS integration",
        )

        # Simulate: HL7 ORU message arrives with code "12345"
        lis_code = "12345"
        lis_system = "LIS_ACME"

        test = ExternalCodeMapping.resolve(lis_system, lis_code)

        # Result: test is resolved to our TestCatalog item
        assert test is not None
        assert test.pk == sample_test_catalog.pk

    @pytest.mark.django_db
    def test_sha_claim_export_scenario(self, sample_icd10_code):
        """Simulate SHA claim export: get SHA tariff code for diagnosis."""
        from hmis.apps.core.models import ExternalCodeMapping

        content_type = ContentType.objects.get_for_model(sample_icd10_code)

        # Setup: facility maps ICD-10 codes to SHA tariff codes
        ExternalCodeMapping.objects.create(
            code_system="SHA_TARIFF_2025",
            external_code="SHA_A00_2025",
            external_display="Cholera (SHA Tariff)",
            content_type=content_type,
            object_id=sample_icd10_code.pk,
        )

        # Simulate: building SHA claim bundle, need SHA code
        sha_code = ExternalCodeMapping.get_external_code(
            sample_icd10_code, "SHA_TARIFF_2025"
        )

        # Result: SHA tariff code is returned
        assert sha_code == "SHA_A00_2025"

    @pytest.mark.django_db
    def test_unmapped_code_graceful_handling(self):
        """Unmapped codes should be handled gracefully."""
        from hmis.apps.core.models import ExternalCodeMapping

        # Simulate: HL7 message arrives with unknown code
        unknown_code = "UNKNOWN_999"
        lis_system = "LIS_ACME"

        test = ExternalCodeMapping.resolve(lis_system, unknown_code)

        # Result: None returned, caller can log/queue for review
        assert test is None
