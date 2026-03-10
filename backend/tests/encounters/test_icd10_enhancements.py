"""
Tests for ICD-10 Code model enhancements - Sprint 1.1-1.2.

Tests cover:
1. is_billable field
2. short_description field
3. long_description field
4. Filtering billable vs non-billable codes
"""

import pytest  # type: ignore

pytestmark = pytest.mark.django_db


# ============================================================================
# ICD-10 Code Enhancements Tests
# ============================================================================


@pytest.mark.unit
class TestICD10CodeEnhancements:
    """Test ICD10Code model enhancements."""

    def test_icd10_has_is_billable_field(self, db):
        """Test ICD10Code has is_billable field."""
        from hmis.apps.encounters.models import ICD10Code

        code = ICD10Code.objects.create(
            code="D50.0",
            description="Iron deficiency anemia secondary to blood loss",
            category="Diseases of the blood",
            chapter=3,
            is_billable=True,
        )
        assert hasattr(code, "is_billable")
        assert code.is_billable is True

    def test_is_billable_defaults_to_true(self, db):
        """Test is_billable defaults to True."""
        from hmis.apps.encounters.models import ICD10Code

        code = ICD10Code.objects.create(
            code="E10.9",
            description="Type 1 diabetes mellitus without complications",
            category="Endocrine diseases",
            chapter=4,
        )
        assert code.is_billable is True

    def test_is_billable_can_be_false(self, db):
        """Test is_billable can be set to False (non-terminal codes)."""
        from hmis.apps.encounters.models import ICD10Code

        code = ICD10Code.objects.create(
            code="E10",
            description="Type 1 diabetes mellitus (category)",
            category="Endocrine diseases",
            chapter=4,
            is_billable=False,
        )
        assert code.is_billable is False

    def test_icd10_has_short_description(self, db):
        """Test ICD10Code has short_description field."""
        from hmis.apps.encounters.models import ICD10Code

        code = ICD10Code.objects.create(
            code="F32.0",
            short_description="Major depressive disorder, single episode, mild",
            description="Major depressive disorder, single episode, mild",
            category="Mental disorders",
            chapter=5,
        )
        assert hasattr(code, "short_description")

    def test_icd10_has_long_description(self, db):
        """Test ICD10Code has long_description field."""
        from hmis.apps.encounters.models import ICD10Code

        long_desc = (
            "Major depressive disorder, single episode, mild. "
            "A mood disorder characterized by a depressed mood or loss of interest "
            "in activities, lasting for at least two weeks."
        )
        code = ICD10Code.objects.create(
            code="F32.1",
            short_description="Major depressive disorder, moderate",
            description="Major depressive disorder, single episode, moderate",
            long_description=long_desc,
            category="Mental disorders",
            chapter=5,
        )
        assert hasattr(code, "long_description")
        assert code.long_description == long_desc

    def test_long_description_can_be_blank(self, db):
        """Test long_description can be blank."""
        from hmis.apps.encounters.models import ICD10Code

        code = ICD10Code.objects.create(
            code="G40.0",
            short_description="Localization-related epilepsy",
            description="Localization-related (focal) epilepsy",
            category="Diseases of the nervous system",
            chapter=6,
        )
        assert code.long_description == ""

    def test_filter_billable_codes(self, db):
        """Test filtering billable vs non-billable codes."""
        from hmis.apps.encounters.models import ICD10Code

        ICD10Code.objects.create(
            code="H10",
            description="Conjunctivitis (category)",
            category="Eye diseases",
            chapter=7,
            is_billable=False,
        )
        ICD10Code.objects.create(
            code="H10.0",
            description="Mucopurulent conjunctivitis",
            category="Eye diseases",
            chapter=7,
            is_billable=True,
        )
        ICD10Code.objects.create(
            code="H10.1",
            description="Acute atopic conjunctivitis",
            category="Eye diseases",
            chapter=7,
            is_billable=True,
        )

        billable = ICD10Code.objects.filter(is_billable=True)
        non_billable = ICD10Code.objects.filter(is_billable=False)

        assert billable.count() == 2
        assert non_billable.count() == 1
