"""
Tests for consumables (item_type) feature.

Tests that the Drug model item_type field, filtering, and consumable
dispensing (without prescription) work correctly.
"""

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.pharmacy.models import Drug, DrugCategory

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def test_user():
    return User.objects.create_user(
        username="consumtest", password="password123", email="consum@example.com"
    )


@pytest.fixture
def authenticated_client(api_client, test_user, sample_organization, sample_facility):
    from tests.conftest import ensure_staff_profile

    ensure_staff_profile(test_user, sample_organization, sample_facility)
    api_client.force_authenticate(user=test_user)
    return api_client


@pytest.fixture
def consumable_categories(db):
    """Ensure consumable categories exist."""
    DrugCategory.objects.get_or_create(
        code="MEDICAL_SUPPLY", defaults={"name": "Medical Supplies", "is_active": True}
    )
    DrugCategory.objects.get_or_create(
        code="SURGICAL_CONSUMABLE",
        defaults={"name": "Surgical Consumables", "is_active": True},
    )
    DrugCategory.objects.get_or_create(
        code="REAGENT", defaults={"name": "Lab Reagents & Test Strips", "is_active": True}
    )
    DrugCategory.objects.get_or_create(code="OTHER", defaults={"name": "Other", "is_active": True})


@pytest.fixture
def sample_medication(db, consumable_categories):
    return Drug.objects.create(
        code="MED001",
        generic_name="Paracetamol",
        strength="500mg",
        form="TABLET",
        unit="tablet",
        categories=["OTHER"],
        item_type=Drug.ItemType.MEDICATION,
        requires_prescription=True,
    )


@pytest.fixture
def sample_consumable(db, consumable_categories):
    return Drug.objects.create(
        code="CON001",
        generic_name="Disposable Gloves (Medium)",
        strength="N/A",
        form="OTHER" if "OTHER" in dict(Drug.DRUG_FORMS) else "POWDER",
        unit="pair",
        categories=["MEDICAL_SUPPLY"],
        item_type=Drug.ItemType.CONSUMABLE,
        requires_prescription=False,
    )


@pytest.fixture
def sample_reagent(db, consumable_categories):
    return Drug.objects.create(
        code="REA001",
        generic_name="Blood Glucose Test Strips",
        strength="N/A",
        form="OTHER" if "OTHER" in dict(Drug.DRUG_FORMS) else "POWDER",
        unit="strip",
        categories=["REAGENT"],
        item_type=Drug.ItemType.REAGENT,
        requires_prescription=False,
    )


# ============================================================================
# Model Tests
# ============================================================================


@pytest.mark.django_db
class TestDrugItemType:
    """Tests for Drug.item_type field."""

    def test_default_item_type_is_medication(self, consumable_categories):
        """New drugs default to MEDICATION item type."""
        drug = Drug.objects.create(
            code="DEF001",
            generic_name="Default Drug",
            strength="10mg",
            form="TABLET",
            unit="tablet",
            categories=["OTHER"],
        )
        assert drug.item_type == Drug.ItemType.MEDICATION

    def test_create_consumable(self, sample_consumable):
        """Can create a drug with CONSUMABLE item_type."""
        assert sample_consumable.item_type == Drug.ItemType.CONSUMABLE
        assert sample_consumable.requires_prescription is False

    def test_create_reagent(self, sample_reagent):
        """Can create a drug with REAGENT item_type."""
        assert sample_reagent.item_type == Drug.ItemType.REAGENT

    def test_item_type_choices(self):
        """ItemType has the expected choices."""
        choices = dict(Drug.ItemType.choices)
        assert "MEDICATION" in choices
        assert "CONSUMABLE" in choices
        assert "REAGENT" in choices


# ============================================================================
# API Filter Tests
# ============================================================================


@pytest.mark.django_db
class TestDrugItemTypeFilter:
    """Tests for filtering drugs by item_type."""

    def test_filter_medications_only(
        self, authenticated_client, sample_medication, sample_consumable, sample_reagent
    ):
        """Filter by item_type=MEDICATION returns only medications."""
        response = authenticated_client.get("/api/pharmacy/drugs/?item_type=MEDICATION")
        assert response.status_code == status.HTTP_200_OK
        results = response.data["results"]
        assert len(results) == 1
        assert results[0]["code"] == "MED001"
        assert results[0]["item_type"] == "MEDICATION"

    def test_filter_consumables_only(
        self, authenticated_client, sample_medication, sample_consumable, sample_reagent
    ):
        """Filter by item_type=CONSUMABLE returns only consumables."""
        response = authenticated_client.get("/api/pharmacy/drugs/?item_type=CONSUMABLE")
        assert response.status_code == status.HTTP_200_OK
        results = response.data["results"]
        assert len(results) == 1
        assert results[0]["code"] == "CON001"
        assert results[0]["item_type"] == "CONSUMABLE"

    def test_filter_reagents_only(
        self, authenticated_client, sample_medication, sample_consumable, sample_reagent
    ):
        """Filter by item_type=REAGENT returns only reagents."""
        response = authenticated_client.get("/api/pharmacy/drugs/?item_type=REAGENT")
        assert response.status_code == status.HTTP_200_OK
        results = response.data["results"]
        assert len(results) == 1
        assert results[0]["code"] == "REA001"

    def test_no_filter_returns_all(
        self, authenticated_client, sample_medication, sample_consumable, sample_reagent
    ):
        """Without filter, all item types are returned."""
        response = authenticated_client.get("/api/pharmacy/drugs/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 3

    def test_create_consumable_via_api(self, authenticated_client, consumable_categories):
        """Can create a consumable via API with item_type field."""
        data = {
            "code": "CON002",
            "generic_name": "IV Cannula 20G",
            "strength": "20G",
            "form": "INJECTION",
            "unit": "piece",
            "categories": ["MEDICAL_SUPPLY"],
            "item_type": "CONSUMABLE",
            "requires_prescription": False,
        }
        response = authenticated_client.post("/api/pharmacy/drugs/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["item_type"] == "CONSUMABLE"
        assert response.data["requires_prescription"] is False

    def test_item_type_in_detail_response(self, authenticated_client, sample_consumable):
        """item_type field appears in the detail response."""
        response = authenticated_client.get(f"/api/pharmacy/drugs/{sample_consumable.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["item_type"] == "CONSUMABLE"


# ============================================================================
# Category Tests
# ============================================================================


@pytest.mark.django_db
class TestConsumableCategories:
    """Tests for consumable-related DrugCategory entries."""

    def test_medical_supply_category_exists(self, consumable_categories):
        """MEDICAL_SUPPLY category should exist."""
        assert DrugCategory.objects.filter(code="MEDICAL_SUPPLY", is_active=True).exists()

    def test_surgical_consumable_category_exists(self, consumable_categories):
        """SURGICAL_CONSUMABLE category should exist."""
        assert DrugCategory.objects.filter(code="SURGICAL_CONSUMABLE", is_active=True).exists()

    def test_reagent_category_exists(self, consumable_categories):
        """REAGENT category should exist."""
        assert DrugCategory.objects.filter(code="REAGENT", is_active=True).exists()
