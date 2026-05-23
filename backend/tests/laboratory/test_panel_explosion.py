"""
Tests for lab panel explosion — ordering a panel test creates component items.
"""

import pytest  # type: ignore
from rest_framework import status


@pytest.fixture
def panel_test_catalog(db, sample_facility, sample_organization):
    """Create a panel test with components for testing."""
    from hmis.apps.laboratory.models import TestCatalog

    # Create the panel
    cbc = TestCatalog.objects.create(
        code="CBC_TEST",
        name="Complete Blood Count",
        short_name="CBC",
        category="HEMATOLOGY",
        specimen_type="BLOOD",
        result_type="PANEL",
        is_panel=True,
        cost=800.00,
        available_in_house=True,
        is_active=True,
        facility=sample_facility,
        organization=sample_organization,
    )

    # Create component tests
    wbc = TestCatalog.objects.create(
        code="WBC_TEST",
        name="White Blood Cell Count",
        short_name="WBC",
        category="HEMATOLOGY",
        specimen_type="BLOOD",
        result_type="NUMERIC",
        result_unit="x10^9/L",
        normal_range_male="4.0-11.0",
        normal_range_female="4.0-11.0",
        cost=0.00,
        available_in_house=True,
        is_active=True,
        facility=sample_facility,
        organization=sample_organization,
    )

    hgb = TestCatalog.objects.create(
        code="HGB_TEST",
        name="Hemoglobin",
        short_name="Hb",
        category="HEMATOLOGY",
        specimen_type="BLOOD",
        result_type="NUMERIC",
        result_unit="g/dL",
        normal_range_male="13.0-17.0",
        normal_range_female="12.0-15.0",
        cost=0.00,
        available_in_house=True,
        is_active=True,
        facility=sample_facility,
        organization=sample_organization,
    )

    plt = TestCatalog.objects.create(
        code="PLT_TEST",
        name="Platelet Count",
        short_name="PLT",
        category="HEMATOLOGY",
        specimen_type="BLOOD",
        result_type="NUMERIC",
        result_unit="x10^9/L",
        normal_range_male="150-400",
        normal_range_female="150-400",
        cost=0.00,
        available_in_house=True,
        is_active=True,
        facility=sample_facility,
        organization=sample_organization,
    )

    # Link components to panel
    cbc.panel_components.add(wbc, hgb, plt)

    return cbc


@pytest.fixture
def standalone_test_catalog(db, sample_facility, sample_organization):
    """Create a standalone (non-panel) test."""
    from hmis.apps.laboratory.models import TestCatalog

    return TestCatalog.objects.create(
        code="RBS_TEST",
        name="Random Blood Sugar",
        short_name="RBS",
        category="CHEMISTRY",
        specimen_type="BLOOD",
        result_type="NUMERIC",
        result_unit="mmol/L",
        normal_range_male="3.9-7.8",
        normal_range_female="3.9-7.8",
        cost=150.00,
        available_in_house=True,
        is_active=True,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def auth_client(authenticated_client, sample_facility, sample_organization):
    """Authenticated client with facility context."""
    authenticated_client.defaults["HTTP_X_FACILITY_ID"] = str(sample_facility.id)
    return authenticated_client


@pytest.mark.django_db
class TestPanelExplosion:
    """Tests for panel test expansion on order creation."""

    def test_ordering_panel_creates_component_items(
        self, auth_client, sample_encounter, panel_test_catalog
    ):
        """Ordering a panel test should create items for each component."""
        order_data = {
            "patient": sample_encounter.patient.id,
            "encounter": sample_encounter.id,
            "priority": "ROUTINE",
            "items": [{"test_code": "CBC_TEST"}],
        }

        response = auth_client.post("/api/lab/orders/", order_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        items = response.data["items"]
        # 1 parent panel item + 3 component items = 4 total
        assert len(items) == 4

        # Verify parent item is the panel
        parent_items = [i for i in items if i["is_panel"] is True]
        assert len(parent_items) == 1
        assert parent_items[0]["test_code"] == "CBC_TEST"
        assert parent_items[0]["panel_parent"] is None

        # Verify component items point to parent
        parent_id = parent_items[0]["id"]
        child_items = [i for i in items if i["panel_parent"] == parent_id]
        assert len(child_items) == 3
        child_codes = sorted([i["test_code"] for i in child_items])
        assert child_codes == ["HGB_TEST", "PLT_TEST", "WBC_TEST"]

    def test_ordering_standalone_test_creates_single_item(
        self, auth_client, sample_encounter, standalone_test_catalog
    ):
        """Ordering a non-panel test creates exactly 1 item."""
        order_data = {
            "patient": sample_encounter.patient.id,
            "encounter": sample_encounter.id,
            "priority": "ROUTINE",
            "items": [{"test_code": "RBS_TEST"}],
        }

        response = auth_client.post("/api/lab/orders/", order_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        items = response.data["items"]
        assert len(items) == 1
        assert items[0]["test_code"] == "RBS_TEST"
        assert items[0]["is_panel"] is False
        assert items[0]["panel_parent"] is None

    def test_panel_and_standalone_in_same_order(
        self, auth_client, sample_encounter, panel_test_catalog, standalone_test_catalog
    ):
        """Ordering both a panel and standalone creates correct items."""
        order_data = {
            "patient": sample_encounter.patient.id,
            "encounter": sample_encounter.id,
            "priority": "ROUTINE",
            "items": [
                {"test_code": "CBC_TEST"},
                {"test_code": "RBS_TEST"},
            ],
        }

        response = auth_client.post("/api/lab/orders/", order_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        items = response.data["items"]
        # 1 panel parent + 3 components + 1 standalone = 5
        assert len(items) == 5

    def test_panel_component_items_have_correct_result_type(
        self, auth_client, sample_encounter, panel_test_catalog
    ):
        """Component items should have NUMERIC result_type (not PANEL)."""
        order_data = {
            "patient": sample_encounter.patient.id,
            "encounter": sample_encounter.id,
            "items": [{"test_code": "CBC_TEST"}],
        }

        response = auth_client.post("/api/lab/orders/", order_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        items = response.data["items"]
        child_items = [i for i in items if i["panel_parent"] is not None]
        for child in child_items:
            assert child["result_type"] == "NUMERIC"

    def test_panel_parent_item_not_resultable(
        self, auth_client, sample_encounter, panel_test_catalog, test_user
    ):
        """Panel parent items should not have results entered (result_type=PANEL)."""
        order_data = {
            "patient": sample_encounter.patient.id,
            "encounter": sample_encounter.id,
            "items": [{"test_code": "CBC_TEST"}],
        }

        response = auth_client.post("/api/lab/orders/", order_data, format="json")
        assert response.status_code == status.HTTP_201_CREATED

        items = response.data["items"]
        parent_item = next(i for i in items if i["is_panel"] is True)
        assert parent_item["result_type"] == "PANEL"

    def test_inactive_components_not_expanded(
        self, auth_client, sample_encounter, panel_test_catalog
    ):
        """Inactive component tests should not be expanded."""
        from hmis.apps.laboratory.models import TestCatalog

        # Deactivate one component
        TestCatalog.objects.filter(code="WBC_TEST").update(is_active=False)

        order_data = {
            "patient": sample_encounter.patient.id,
            "encounter": sample_encounter.id,
            "items": [{"test_code": "CBC_TEST"}],
        }

        response = auth_client.post("/api/lab/orders/", order_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        items = response.data["items"]
        # 1 parent + 2 active components = 3
        assert len(items) == 3

    def test_panel_total_cost_includes_panel_price(
        self, auth_client, sample_encounter, panel_test_catalog
    ):
        """Total cost should include the panel's cost (components cost 0)."""
        order_data = {
            "patient": sample_encounter.patient.id,
            "encounter": sample_encounter.id,
            "items": [{"test_code": "CBC_TEST"}],
        }

        response = auth_client.post("/api/lab/orders/", order_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        # Panel cost is 800, components are 0 each
        assert response.data["total_cost"] == 800.0

    def test_panel_children_cascade_delete_with_parent(
        self,
        db,
        sample_encounter,
        panel_test_catalog,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """Deleting a panel parent item should cascade-delete child items."""
        from hmis.apps.laboratory.models import LabOrder, LabOrderItem

        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            order_type="IN_HOUSE",
            status="ORDERED",
            facility=sample_facility,
            organization=sample_organization,
        )

        parent = LabOrderItem.objects.create(
            lab_order=order,
            test=panel_test_catalog,
            unit_cost=800.00,
        )

        # Create child items
        for component in panel_test_catalog.panel_components.all():
            LabOrderItem.objects.create(
                lab_order=order,
                test=component,
                unit_cost=0.00,
                panel_parent=parent,
            )

        assert order.items.count() == 4
        parent.delete()
        # Children should be cascade-deleted
        assert order.items.count() == 0
