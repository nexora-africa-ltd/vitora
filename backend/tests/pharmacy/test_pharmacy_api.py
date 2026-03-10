"""
API tests for Pharmacy module.

Following TDD approach: Write tests FIRST, then verify API implementation.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


@pytest.fixture
def api_client():
    """Unauthenticated API client."""
    return APIClient()


@pytest.fixture
def authenticated_client(api_client, test_user):
    """Authenticated API client."""
    api_client.force_authenticate(user=test_user)
    return api_client


@pytest.fixture
def test_user():
    """Create test user."""
    return User.objects.create_user(
        username="testuser", password="password123", email="test@example.com"
    )


@pytest.fixture
def sample_drug_data():
    """Sample drug data for API tests."""
    return {
        "code": "API001",
        "generic_name": "Test Drug API",
        "strength": "100mg",
        "form": "TABLET",
        "category": "OTHER",
        "unit": "tablet",
    }


# ============================================================================
# Drug API Tests (6 tests)
# ============================================================================


@pytest.mark.django_db
class TestDrugAPI:
    """Tests for Drug API endpoints."""

    def test_list_drugs_requires_auth(self, api_client):
        """Listing drugs should require authentication."""
        response = api_client.get("/api/pharmacy/drugs/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_drugs_authenticated(self, authenticated_client):
        """Authenticated users can list drugs."""
        from hmis.apps.pharmacy.models import Drug

        Drug.objects.create(
            code="LIST001",
            generic_name="List Test Drug",
            strength="50mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        response = authenticated_client.get("/api/pharmacy/drugs/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

    def test_get_drug_detail(self, authenticated_client):
        """Getting drug details should work."""
        from hmis.apps.pharmacy.models import Drug

        drug = Drug.objects.create(
            code="DETAIL001",
            generic_name="Detail Test Drug",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        response = authenticated_client.get(f"/api/pharmacy/drugs/{drug.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["code"] == "DETAIL001"
        assert "display_name" in response.data
        assert "current_stock" in response.data

    def test_create_drug(self, authenticated_client, sample_drug_data):
        """Creating a drug should work."""
        response = authenticated_client.post("/api/pharmacy/drugs/", sample_drug_data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["code"] == "API001"

    def test_search_drugs(self, authenticated_client):
        """Searching drugs by name should work."""
        from hmis.apps.pharmacy.models import Drug

        Drug.objects.create(
            code="SEARCH001",
            generic_name="Paracetamol",
            strength="500mg",
            form="TABLET",
            categories=["ANALGESIC"],
            unit="tablet",
        )
        Drug.objects.create(
            code="SEARCH002",
            generic_name="Ibuprofen",
            strength="400mg",
            form="TABLET",
            categories=["ANALGESIC"],
            unit="tablet",
        )

        response = authenticated_client.get("/api/pharmacy/drugs/?search=Paracetamol")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["generic_name"] == "Paracetamol"

    def test_filter_drugs_by_category(self, authenticated_client):
        """Filtering drugs by category should work."""
        from hmis.apps.pharmacy.models import Drug

        Drug.objects.create(
            code="FILTER001",
            generic_name="Antibiotic Drug",
            strength="250mg",
            form="CAPSULE",
            categories=["ANTIBIOTIC"],
            unit="capsule",
        )
        Drug.objects.create(
            code="FILTER002",
            generic_name="Analgesic Drug",
            strength="500mg",
            form="TABLET",
            categories=["ANALGESIC"],
            unit="tablet",
        )

        response = authenticated_client.get("/api/pharmacy/drugs/?category=ANTIBIOTIC")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["category"] == "ANTIBIOTIC"


# =========================================================================
# Drug Category Registry API Tests
# =========================================================================


@pytest.mark.django_db
class TestDrugCategoryAPI:
    """Tests for Drug category registry endpoints."""

    def test_list_drug_categories_requires_auth(self, api_client):
        response = api_client.get("/api/pharmacy/drug-categories/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_drug_categories_authenticated(self, authenticated_client):
        response = authenticated_client.get("/api/pharmacy/drug-categories/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

        # Expect the default seeded category to exist
        codes = {item["code"] for item in response.data["results"]}
        assert "OTHER" in codes

    def test_create_drug_category_and_use_for_drug(self, authenticated_client):
        # Create new category
        category_resp = authenticated_client.post(
            "/api/pharmacy/drug-categories/",
            {"name": "Herbal Medicine"},
        )
        assert category_resp.status_code == status.HTTP_201_CREATED
        assert category_resp.data["code"] == "HERBAL_MEDICINE"

        # Use it for a new drug
        drug_resp = authenticated_client.post(
            "/api/pharmacy/drugs/",
            {
                "code": "HERB001",
                "generic_name": "Herbal Drug",
                "strength": "10mg",
                "form": "TABLET",
                "categories": ["HERBAL_MEDICINE"],
                "unit": "tablet",
            },
        )
        assert drug_resp.status_code == status.HTTP_201_CREATED
        assert drug_resp.data["code"] == "HERB001"
        assert drug_resp.data["categories"] == ["HERBAL_MEDICINE"]


# ============================================================================
# Stock API Tests (4 tests)
# ============================================================================


@pytest.mark.django_db
class TestStockAPI:
    """Tests for Stock Batch API endpoints."""

    def test_list_stock_batches(self, authenticated_client, test_user):
        """Listing stock batches should work."""
        from hmis.apps.pharmacy.models import Drug, StockBatch

        drug = Drug.objects.create(
            code="STOCK001",
            generic_name="Stock Test Drug",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        StockBatch.objects.create(
            drug=drug,
            batch_number="BATCH001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=test_user,
        )

        response = authenticated_client.get("/api/pharmacy/stock/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

    def test_get_stock_by_drug(self, authenticated_client, test_user):
        """Getting stock for specific drug should work."""
        from hmis.apps.pharmacy.models import Drug, StockBatch

        drug = Drug.objects.create(
            code="STOCK002",
            generic_name="Stock Test Drug 2",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        StockBatch.objects.create(
            drug=drug,
            batch_number="BATCH002",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=test_user,
        )

        response = authenticated_client.get(f"/api/pharmacy/stock/by_drug/?drug_id={drug.id}")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1

    def test_receive_new_stock(self, authenticated_client, test_user):
        """Receiving new stock should work."""
        from hmis.apps.pharmacy.models import Drug

        drug = Drug.objects.create(
            code="STOCK003",
            generic_name="Stock Test Drug 3",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        data = {
            "drug": drug.id,
            "batch_number": "BATCH003",
            "quantity_received": 500,
            "quantity_available": 500,
            "expiry_date": (date.today() + timedelta(days=365)).isoformat(),
            "received_date": date.today().isoformat(),
            "cost_price": "5.00",
            "selling_price": "10.00",
        }

        response = authenticated_client.post("/api/pharmacy/stock/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["batch_number"] == "BATCH003"

    def test_stock_batch_includes_computed_fields(self, authenticated_client, test_user):
        """Stock batch should include computed fields."""
        from hmis.apps.pharmacy.models import Drug, StockBatch

        drug = Drug.objects.create(
            code="STOCK004",
            generic_name="Stock Test Drug 4",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="BATCH004",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=30),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=test_user,
        )

        response = authenticated_client.get(f"/api/pharmacy/stock/{batch.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert "days_until_expiry" in response.data
        assert "is_expired_status" in response.data
        assert "drug_name" in response.data


# ============================================================================
# Prescription API Tests (6 tests)
# ============================================================================


@pytest.mark.django_db
class TestPrescriptionAPI:
    """Tests for Prescription API endpoints."""

    def test_list_prescriptions(self, authenticated_client, test_user):
        """Listing prescriptions should work."""
        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Prescription

        county = County.objects.create(code=50, name="API County")
        sub_county = SubCounty.objects.create(county=county, name="API SubCounty")

        patient = Patient.objects.create(
            first_name="API",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
        )

        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Test",
        )

        Prescription.objects.create(
            encounter=encounter,
            patient=patient,
            prescribed_by=test_user,
            valid_until=date.today() + timedelta(days=30),
        )

        response = authenticated_client.get("/api/pharmacy/prescriptions/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

    def test_create_prescription(self, authenticated_client, test_user):
        """Creating a prescription should work."""
        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        county = County.objects.create(code=51, name="API County 2")
        sub_county = SubCounty.objects.create(county=county, name="API SubCounty 2")

        patient = Patient.objects.create(
            first_name="API",
            last_name="Patient 2",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
        )

        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Test",
        )

        data = {
            "encounter": encounter.id,
            "patient": patient.id,
            "valid_until": (date.today() + timedelta(days=30)).isoformat(),
            "clinical_notes": "Test prescription",
        }

        response = authenticated_client.post("/api/pharmacy/prescriptions/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "PENDING"

    def test_create_prescription_with_items(self, authenticated_client, test_user):
        """Creating a prescription with nested items should work."""
        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Drug

        county = County.objects.create(code=99, name="API County Nested")
        sub_county = SubCounty.objects.create(county=county, name="API SubCounty Nested")

        patient = Patient.objects.create(
            first_name="API",
            last_name="Patient Nested",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
        )

        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Test with items",
        )

        drug = Drug.objects.create(
            code="NESTED001",
            generic_name="Nested Test Drug",
            strength="500mg",
            form="TABLET",
            categories=["ANALGESIC"],
            unit="tablet",
        )

        data = {
            "encounter": encounter.id,
            "patient": patient.id,
            "valid_until": (date.today() + timedelta(days=30)).isoformat(),
            "clinical_notes": "Test prescription with items",
            "items": [
                {
                    "drug": drug.id,
                    "quantity_prescribed": 30,  # Test frontend field name
                    "dosage": "500mg (1 tablet)",
                    "frequency": "TDS",
                    "duration": "10 days",
                    "route": "PO",
                    "instructions": "Take after meals",
                    "is_substitutable": True,
                },
            ],
        }

        response = authenticated_client.post(
            "/api/pharmacy/prescriptions/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "PENDING"
        assert "items" in response.data
        assert len(response.data["items"]) == 1
        assert response.data["items"][0]["drug_name"] == "Nested Test Drug"
        assert response.data["items"][0]["quantity"] == 30
        assert response.data["items"][0]["dosage"] == "500mg (1 tablet)"

    def test_get_prescription_detail(self, authenticated_client, test_user):
        """Getting prescription details should include items."""
        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Drug, Prescription, PrescriptionItem

        county = County.objects.create(code=52, name="API County 3")
        sub_county = SubCounty.objects.create(county=county, name="API SubCounty 3")

        patient = Patient.objects.create(
            first_name="API",
            last_name="Patient 3",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
        )

        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Test",
        )

        prescription = Prescription.objects.create(
            encounter=encounter,
            patient=patient,
            prescribed_by=test_user,
            valid_until=date.today() + timedelta(days=30),
        )

        drug = Drug.objects.create(
            code="PRES001",
            generic_name="Prescription Drug",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        PrescriptionItem.objects.create(
            prescription=prescription,
            drug=drug,
            quantity=30,
            dosage="1 tablet",
            frequency="3 times daily",
            duration="10 days",
        )

        response = authenticated_client.get(f"/api/pharmacy/prescriptions/{prescription.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert "items" in response.data
        assert len(response.data["items"]) == 1

    def test_cancel_prescription(self, authenticated_client, test_user):
        """Cancelling a prescription should work."""
        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Prescription

        county = County.objects.create(code=53, name="API County 4")
        sub_county = SubCounty.objects.create(county=county, name="API SubCounty 4")

        patient = Patient.objects.create(
            first_name="API",
            last_name="Patient 4",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
        )

        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Test",
        )

        prescription = Prescription.objects.create(
            encounter=encounter,
            patient=patient,
            prescribed_by=test_user,
            valid_until=date.today() + timedelta(days=30),
        )

        response = authenticated_client.post(
            f"/api/pharmacy/prescriptions/{prescription.id}/cancel/",
            {"reason": "Patient no longer needs medication"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

    def test_get_prescriptions_by_patient(self, authenticated_client, test_user):
        """Getting prescriptions by patient should work."""
        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Prescription

        county = County.objects.create(code=54, name="API County 5")
        sub_county = SubCounty.objects.create(county=county, name="API SubCounty 5")

        patient = Patient.objects.create(
            first_name="API",
            last_name="Patient 5",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
        )

        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Test",
        )

        Prescription.objects.create(
            encounter=encounter,
            patient=patient,
            prescribed_by=test_user,
            valid_until=date.today() + timedelta(days=30),
        )

        response = authenticated_client.get(
            f"/api/pharmacy/prescriptions/by_patient/?patient_id={patient.id}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1

    def test_prescription_includes_computed_fields(self, authenticated_client, test_user):
        """Prescription should include computed fields."""
        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Prescription

        county = County.objects.create(code=55, name="API County 6")
        sub_county = SubCounty.objects.create(county=county, name="API SubCounty 6")

        patient = Patient.objects.create(
            first_name="API",
            last_name="Patient 6",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
        )

        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Test",
        )

        prescription = Prescription.objects.create(
            encounter=encounter,
            patient=patient,
            prescribed_by=test_user,
            valid_until=date.today() + timedelta(days=30),
        )

        response = authenticated_client.get(f"/api/pharmacy/prescriptions/{prescription.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert "patient_name" in response.data
        assert "prescriber_name" in response.data
        assert "is_valid_prescription" in response.data


# ============================================================================
# Dispensing API Tests (6 tests)
# ============================================================================


@pytest.mark.django_db
class TestDispensingAPI:
    """Tests for Dispensing API endpoints."""

    def test_list_dispensings(self, authenticated_client, test_user):
        """Listing dispensings should work."""
        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Dispensing, Drug, StockBatch

        county = County.objects.create(code=60, name="Disp County")
        sub_county = SubCounty.objects.create(county=county, name="Disp SubCounty")

        patient = Patient.objects.create(
            first_name="Disp",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
        )

        drug = Drug.objects.create(
            code="DISP001",
            generic_name="Disp Drug",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="DISPBATCH001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=test_user,
        )

        Dispensing.objects.create(
            patient=patient,
            drug=drug,
            batch=batch,
            quantity_dispensed=30,
            unit_price=Decimal("10.00"),
            total_price=Decimal("300.00"),
            dispensed_by=test_user,
        )

        response = authenticated_client.get("/api/pharmacy/dispensings/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

    def test_dispense_using_fefo(self, authenticated_client, test_user):
        """Dispensing using FEFO should work."""
        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Drug, StockBatch

        county = County.objects.create(code=61, name="Disp County 2")
        sub_county = SubCounty.objects.create(county=county, name="Disp SubCounty 2")

        patient = Patient.objects.create(
            first_name="Disp",
            last_name="Patient 2",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
        )

        drug = Drug.objects.create(
            code="DISP002",
            generic_name="Disp Drug 2",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        StockBatch.objects.create(
            drug=drug,
            batch_number="DISPBATCH002",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=test_user,
        )

        data = {
            "drug_id": drug.id,
            "quantity": 30,
            "patient_id": patient.id,
        }

        response = authenticated_client.post("/api/pharmacy/dispensings/dispense/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert len(response.data) >= 1
        assert response.data[0]["quantity_dispensed"] == 30

    def test_dispense_admission_linked_prescription_reduces_stock(
        self, authenticated_client, sample_admission, test_user
    ):
        """Admission-linked prescription dispensing should reduce stock and update status."""
        from hmis.apps.pharmacy.models import Drug, Prescription, PrescriptionItem, StockBatch

        drug = Drug.objects.create(
            code="ADMDISP001",
            generic_name="Admission Dispense Drug",
            strength="250mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="ADMBATCH001",
            quantity_received=100,
            quantity_available=100,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("4.00"),
            selling_price=Decimal("8.00"),
            received_by=test_user,
        )

        prescription = Prescription.objects.create(
            patient=sample_admission.patient,
            encounter=sample_admission.ipd_encounter,
            admission=sample_admission,
            prescribed_by=test_user,
            valid_until=date.today() + timedelta(days=30),
        )
        prescription_item = PrescriptionItem.objects.create(
            prescription=prescription,
            drug=drug,
            quantity=10,
            dosage="1 tablet",
            frequency="BID",
            duration="5 days",
            route="PO",
            instructions="Take after meals",
        )

        response = authenticated_client.post(
            "/api/pharmacy/dispensings/dispense/",
            {
                "drug_id": drug.id,
                "quantity": 10,
                "patient_id": sample_admission.patient.id,
                "prescription_item_id": prescription_item.id,
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert len(response.data) == 1
        assert response.data[0]["quantity_dispensed"] == 10

        batch.refresh_from_db()
        prescription_item.refresh_from_db()
        prescription.refresh_from_db()

        assert batch.quantity_available == 90
        assert prescription_item.quantity_dispensed == 10
        assert prescription.status == "DISPENSED"

    def test_dispense_insufficient_stock(self, authenticated_client, test_user):
        """Dispensing with insufficient stock should fail."""
        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Drug, StockBatch

        county = County.objects.create(code=62, name="Disp County 3")
        sub_county = SubCounty.objects.create(county=county, name="Disp SubCounty 3")

        patient = Patient.objects.create(
            first_name="Disp",
            last_name="Patient 3",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
        )

        drug = Drug.objects.create(
            code="DISP003",
            generic_name="Disp Drug 3",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        StockBatch.objects.create(
            drug=drug,
            batch_number="DISPBATCH003",
            quantity_received=10,
            quantity_available=10,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=test_user,
        )

        data = {
            "drug_id": drug.id,
            "quantity": 100,  # More than available
            "patient_id": patient.id,
        }

        response = authenticated_client.post("/api/pharmacy/dispensings/dispense/", data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Insufficient stock" in response.data["error"]

    def test_process_return(self, authenticated_client, test_user):
        """Processing a return should work."""
        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Dispensing, Drug, StockBatch

        county = County.objects.create(code=63, name="Disp County 4")
        sub_county = SubCounty.objects.create(county=county, name="Disp SubCounty 4")

        patient = Patient.objects.create(
            first_name="Disp",
            last_name="Patient 4",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
        )

        drug = Drug.objects.create(
            code="DISP004",
            generic_name="Disp Drug 4",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="DISPBATCH004",
            quantity_received=1000,
            quantity_available=970,
            quantity_dispensed=30,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=test_user,
        )

        dispensing = Dispensing.objects.create(
            patient=patient,
            drug=drug,
            batch=batch,
            quantity_dispensed=30,
            unit_price=Decimal("10.00"),
            total_price=Decimal("300.00"),
            dispensed_by=test_user,
        )

        data = {
            "quantity": 10,
            "reason": "Adverse reaction",
        }

        response = authenticated_client.post(
            f"/api/pharmacy/dispensings/{dispensing.id}/return_stock/", data
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["quantity_returned"] == 10

    def test_verify_controlled_drug(self, authenticated_client, test_user):
        """Verifying a controlled drug dispensing should work."""
        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Dispensing, Drug, StockBatch

        county = County.objects.create(code=64, name="Disp County 5")
        sub_county = SubCounty.objects.create(county=county, name="Disp SubCounty 5")

        patient = Patient.objects.create(
            first_name="Disp",
            last_name="Patient 5",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
        )

        drug = Drug.objects.create(
            code="DISP005",
            generic_name="Controlled Drug",
            strength="10mg",
            form="INJECTION",
            categories=["CONTROLLED"],
            unit="vial",
            schedule="CD",
            is_controlled=True,
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="DISPBATCH005",
            quantity_received=100,
            quantity_available=95,
            quantity_dispensed=5,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("50.00"),
            selling_price=Decimal("100.00"),
            received_by=test_user,
        )

        # Create another user for verification
        verifier = User.objects.create_user(
            username="verifier", password="password123", email="verifier@example.com"
        )

        dispensing = Dispensing.objects.create(
            patient=patient,
            drug=drug,
            batch=batch,
            quantity_dispensed=5,
            unit_price=Decimal("100.00"),
            total_price=Decimal("500.00"),
            dispensed_by=test_user,
        )

        # Use verifier client
        verifier_client = APIClient()
        verifier_client.force_authenticate(user=verifier)

        response = verifier_client.post(f"/api/pharmacy/dispensings/{dispensing.id}/verify/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["verified_by"] == verifier.id

    def test_dispensing_includes_computed_fields(self, authenticated_client, test_user):
        """Dispensing should include computed fields."""
        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Dispensing, Drug, StockBatch

        county = County.objects.create(code=65, name="Disp County 6")
        sub_county = SubCounty.objects.create(county=county, name="Disp SubCounty 6")

        patient = Patient.objects.create(
            first_name="Disp",
            last_name="Patient 6",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
        )

        drug = Drug.objects.create(
            code="DISP006",
            generic_name="Disp Drug 6",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="DISPBATCH006",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=test_user,
        )

        dispensing = Dispensing.objects.create(
            patient=patient,
            drug=drug,
            batch=batch,
            quantity_dispensed=30,
            unit_price=Decimal("10.00"),
            total_price=Decimal("300.00"),
            dispensed_by=test_user,
        )

        response = authenticated_client.get(f"/api/pharmacy/dispensings/{dispensing.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert "patient_name" in response.data
        assert "drug_name" in response.data
        assert "dispensed_by_name" in response.data
        assert "batch_number" in response.data
