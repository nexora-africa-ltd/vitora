"""
TDD Tests for Dashboard Revenue Breakdown API.

Following Red-Green-Refactor cycle:
1. RED: Write these failing tests first
2. GREEN: Implement minimal code to pass
3. REFACTOR: Clean up while keeping tests green

Tests for GET /api/core/dashboard/revenue-breakdown/

Provides revenue breakdown by department/category for dashboard charts.
Data retention: 90 days maximum.
"""

import pytest  # type: ignore
from datetime import date, timedelta
from decimal import Decimal
from django.utils import timezone
from rest_framework import status

# API endpoint
REVENUE_BREAKDOWN_URL = "/api/core/dashboard/revenue-breakdown/"


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def service_category(db):
    """Create a service category for testing."""
    from hmis.apps.billing.models import ServiceCategory
    
    return ServiceCategory.objects.create(
        name="Consultation",
        code="CONS",
        description="Consultation services",
    )


@pytest.fixture
def lab_category(db):
    """Create a lab service category for testing."""
    from hmis.apps.billing.models import ServiceCategory
    
    return ServiceCategory.objects.create(
        name="Laboratory",
        code="LAB",
        description="Lab services",
    )


@pytest.fixture
def pharmacy_category(db):
    """Create a pharmacy service category for testing."""
    from hmis.apps.billing.models import ServiceCategory
    
    return ServiceCategory.objects.create(
        name="Pharmacy",
        code="PHARM",
        description="Pharmacy services",
    )


@pytest.fixture
def consultation_service(db, service_category, test_user):
    """Create a consultation service for testing."""
    from hmis.apps.billing.models import Service
    
    return Service.objects.create(
        category=service_category,
        code="CONS-001",
        name="General Consultation",
        unit_price=Decimal("500.00"),
        created_by=test_user,
    )


@pytest.fixture
def lab_service(db, lab_category, test_user):
    """Create a lab service for testing."""
    from hmis.apps.billing.models import Service
    
    return Service.objects.create(
        category=lab_category,
        code="LAB-001",
        name="Complete Blood Count",
        unit_price=Decimal("800.00"),
        created_by=test_user,
    )


@pytest.fixture
def pharmacy_service(db, pharmacy_category, test_user):
    """Create a pharmacy service for testing."""
    from hmis.apps.billing.models import Service
    
    return Service.objects.create(
        category=pharmacy_category,
        code="PHARM-001",
        name="Paracetamol 500mg",
        unit_price=Decimal("50.00"),
        created_by=test_user,
    )


@pytest.fixture
def sample_invoice(db, sample_patient, test_user):
    """Create a sample invoice for testing."""
    from hmis.apps.billing.models import Invoice
    
    invoice = Invoice.objects.create(
        patient=sample_patient,
        status=Invoice.Status.PENDING,
        invoice_date=date.today(),
        due_date=date.today() + timedelta(days=30),
        created_by=test_user,
    )
    return invoice


def create_invoice_with_payment(patient, user, service, quantity, payment_date, payment_status="completed"):
    """Helper to create invoice with items and payment."""
    from hmis.apps.billing.models import Invoice, InvoiceItem, Payment
    
    # Create invoice
    invoice = Invoice.objects.create(
        patient=patient,
        status=Invoice.Status.PENDING,
        invoice_date=payment_date.date() if hasattr(payment_date, 'date') else payment_date,
        due_date=(payment_date.date() if hasattr(payment_date, 'date') else payment_date) + timedelta(days=30),
        created_by=user,
    )
    
    # Add item
    line_total = service.unit_price * quantity
    InvoiceItem.objects.create(
        invoice=invoice,
        item_type=InvoiceItem.ItemType.SERVICE,
        service=service,
        description=service.name,
        quantity=quantity,
        unit_price=service.unit_price,
        line_total=line_total,
    )
    
    # Calculate totals
    invoice.subtotal = line_total
    invoice.total_amount = line_total
    invoice.balance_due = line_total
    invoice.save()
    
    # Create payment
    payment = Payment.objects.create(
        invoice=invoice,
        method=Payment.Method.CASH,
        amount=line_total,
        status=payment_status,
        payment_date=payment_date if hasattr(payment_date, 'hour') else timezone.make_aware(
            timezone.datetime.combine(payment_date, timezone.datetime.min.time())
        ),
        received_by=user,
    )
    
    if payment_status == "completed":
        invoice.amount_paid = line_total
        invoice.balance_due = Decimal("0.00")
        invoice.status = Invoice.Status.PAID
        invoice.save()
    
    return invoice, payment


# =============================================================================
# Authentication Tests
# =============================================================================


@pytest.mark.django_db
class TestRevenueBreakdownAuthentication:
    """Test authentication requirements for revenue breakdown endpoint."""

    def test_revenue_breakdown_requires_authentication(self, api_client):
        """Should return 401 when not authenticated."""
        response = api_client.get(REVENUE_BREAKDOWN_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_revenue_breakdown_accessible_when_authenticated(self, authenticated_client):
        """Should return 200 when authenticated with valid params."""
        today = date.today()
        params = {
            "start_date": (today - timedelta(days=7)).isoformat(),
            "end_date": today.isoformat(),
        }
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        assert response.status_code == status.HTTP_200_OK


# =============================================================================
# Parameter Validation Tests
# =============================================================================


@pytest.mark.django_db
class TestRevenueBreakdownValidation:
    """Test parameter validation for revenue breakdown endpoint."""

    def test_requires_start_date(self, authenticated_client):
        """Should return 400 when start_date is missing."""
        params = {"end_date": date.today().isoformat()}
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "start_date" in response.data.get("error", "").lower()

    def test_requires_end_date(self, authenticated_client):
        """Should return 400 when end_date is missing."""
        params = {"start_date": date.today().isoformat()}
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "end_date" in response.data.get("error", "").lower()

    def test_rejects_invalid_date_format(self, authenticated_client):
        """Should return 400 for invalid date format."""
        params = {"start_date": "2026/01/01", "end_date": "2026-01-07"}
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_rejects_start_date_after_end_date(self, authenticated_client):
        """Should return 400 when start_date is after end_date."""
        today = date.today()
        params = {
            "start_date": today.isoformat(),
            "end_date": (today - timedelta(days=7)).isoformat(),
        }
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "start_date" in response.data.get("error", "").lower()

    def test_rejects_date_range_exceeding_90_days(self, authenticated_client):
        """Should return 400 when date range exceeds 90 days."""
        today = date.today()
        params = {
            "start_date": (today - timedelta(days=100)).isoformat(),
            "end_date": today.isoformat(),
        }
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "90" in response.data.get("error", "")

    def test_accepts_valid_group_by_values(self, authenticated_client):
        """Should accept valid group_by values."""
        today = date.today()
        base_params = {
            "start_date": (today - timedelta(days=7)).isoformat(),
            "end_date": today.isoformat(),
        }
        
        for group_by in ["category", "item_type", "payment_method"]:
            params = {**base_params, "group_by": group_by}
            response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
            assert response.status_code == status.HTTP_200_OK, f"Failed for group_by={group_by}"

    def test_rejects_invalid_group_by(self, authenticated_client):
        """Should return 400 for invalid group_by value."""
        today = date.today()
        params = {
            "start_date": (today - timedelta(days=7)).isoformat(),
            "end_date": today.isoformat(),
            "group_by": "invalid_value",
        }
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# Response Structure Tests
# =============================================================================


@pytest.mark.django_db
class TestRevenueBreakdownResponseStructure:
    """Test response structure for revenue breakdown endpoint."""

    def test_response_contains_date_range(self, authenticated_client):
        """Should return date_range in response."""
        today = date.today()
        start = (today - timedelta(days=7)).isoformat()
        end = today.isoformat()
        
        params = {"start_date": start, "end_date": end}
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        assert response.status_code == status.HTTP_200_OK
        assert "date_range" in response.data
        assert response.data["date_range"]["start"] == start
        assert response.data["date_range"]["end"] == end

    def test_response_contains_total_revenue(self, authenticated_client):
        """Should return total_revenue in response."""
        today = date.today()
        params = {
            "start_date": (today - timedelta(days=7)).isoformat(),
            "end_date": today.isoformat(),
        }
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        assert response.status_code == status.HTTP_200_OK
        assert "total_revenue" in response.data
        assert isinstance(response.data["total_revenue"], (int, float))

    def test_response_contains_currency(self, authenticated_client):
        """Should return currency in response."""
        today = date.today()
        params = {
            "start_date": (today - timedelta(days=7)).isoformat(),
            "end_date": today.isoformat(),
        }
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        assert response.status_code == status.HTTP_200_OK
        assert "currency" in response.data
        assert response.data["currency"] == "KES"

    def test_response_contains_breakdown_array(self, authenticated_client):
        """Should return breakdown array in response."""
        today = date.today()
        params = {
            "start_date": (today - timedelta(days=7)).isoformat(),
            "end_date": today.isoformat(),
        }
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        assert response.status_code == status.HTTP_200_OK
        assert "breakdown" in response.data
        assert isinstance(response.data["breakdown"], list)

    def test_breakdown_item_structure(
        self, authenticated_client, sample_patient, test_user, consultation_service
    ):
        """Should return breakdown items with required fields."""
        today = date.today()
        
        # Create payment
        create_invoice_with_payment(
            patient=sample_patient,
            user=test_user,
            service=consultation_service,
            quantity=Decimal("1"),
            payment_date=timezone.now(),
        )
        
        params = {
            "start_date": (today - timedelta(days=1)).isoformat(),
            "end_date": today.isoformat(),
            "refresh": "true",
        }
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["breakdown"]) > 0
        
        item = response.data["breakdown"][0]
        assert "name" in item
        assert "amount" in item
        assert "percentage" in item
        assert "transaction_count" in item


# =============================================================================
# Data Accuracy Tests
# =============================================================================


@pytest.mark.django_db
class TestRevenueBreakdownDataAccuracy:
    """Test data accuracy for revenue breakdown endpoint."""

    def test_aggregates_revenue_by_category(
        self, authenticated_client, sample_patient, test_user, 
        consultation_service, lab_service
    ):
        """Should correctly aggregate revenue by service category."""
        today = date.today()
        
        # Create consultation payment (500 x 2 = 1000)
        create_invoice_with_payment(
            patient=sample_patient,
            user=test_user,
            service=consultation_service,
            quantity=Decimal("2"),
            payment_date=timezone.now(),
        )
        
        # Create lab payment (800 x 1 = 800)
        create_invoice_with_payment(
            patient=sample_patient,
            user=test_user,
            service=lab_service,
            quantity=Decimal("1"),
            payment_date=timezone.now(),
        )
        
        params = {
            "start_date": (today - timedelta(days=1)).isoformat(),
            "end_date": today.isoformat(),
            "group_by": "category",
            "refresh": "true",
        }
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_revenue"] == 1800.0
        
        breakdown = {item["name"]: item for item in response.data["breakdown"]}
        assert "Consultation" in breakdown
        assert breakdown["Consultation"]["amount"] == 1000.0
        assert "Laboratory" in breakdown
        assert breakdown["Laboratory"]["amount"] == 800.0

    def test_calculates_percentages_correctly(
        self, authenticated_client, sample_patient, test_user,
        consultation_service, lab_service
    ):
        """Should calculate percentages correctly."""
        today = date.today()
        
        # 1000 consultation + 1000 lab = 2000 total (50% each)
        create_invoice_with_payment(
            patient=sample_patient,
            user=test_user,
            service=consultation_service,
            quantity=Decimal("2"),  # 500 x 2 = 1000
            payment_date=timezone.now(),
        )
        
        # Create another lab service with price 1000
        from hmis.apps.billing.models import Service
        lab_service_2 = Service.objects.create(
            category=lab_service.category,
            code="LAB-002",
            name="Urinalysis",
            unit_price=Decimal("1000.00"),
            created_by=test_user,
        )
        
        create_invoice_with_payment(
            patient=sample_patient,
            user=test_user,
            service=lab_service_2,
            quantity=Decimal("1"),  # 1000 x 1 = 1000
            payment_date=timezone.now(),
        )
        
        params = {
            "start_date": (today - timedelta(days=1)).isoformat(),
            "end_date": today.isoformat(),
            "group_by": "category",
            "refresh": "true",
        }
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        assert response.status_code == status.HTTP_200_OK
        
        breakdown = {item["name"]: item for item in response.data["breakdown"]}
        # Each should be 50%
        assert breakdown["Consultation"]["percentage"] == 50.0
        assert breakdown["Laboratory"]["percentage"] == 50.0

    def test_counts_transactions_correctly(
        self, authenticated_client, sample_patient, test_user, consultation_service
    ):
        """Should count transactions correctly."""
        today = date.today()
        
        # Create 3 separate payments for consultation
        for _ in range(3):
            create_invoice_with_payment(
                patient=sample_patient,
                user=test_user,
                service=consultation_service,
                quantity=Decimal("1"),
                payment_date=timezone.now(),
            )
        
        params = {
            "start_date": (today - timedelta(days=1)).isoformat(),
            "end_date": today.isoformat(),
            "group_by": "category",
            "refresh": "true",
        }
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        assert response.status_code == status.HTTP_200_OK
        
        breakdown = {item["name"]: item for item in response.data["breakdown"]}
        assert breakdown["Consultation"]["transaction_count"] == 3

    def test_filters_by_date_range(
        self, authenticated_client, sample_patient, test_user, consultation_service
    ):
        """Should only include payments within date range."""
        today = date.today()
        yesterday = today - timedelta(days=1)
        three_days_ago = today - timedelta(days=3)
        
        # Create payment from 3 days ago (outside range)
        create_invoice_with_payment(
            patient=sample_patient,
            user=test_user,
            service=consultation_service,
            quantity=Decimal("1"),
            payment_date=timezone.make_aware(
                timezone.datetime.combine(three_days_ago, timezone.datetime.min.time())
            ),
        )
        
        # Create payment from today (inside range)
        create_invoice_with_payment(
            patient=sample_patient,
            user=test_user,
            service=consultation_service,
            quantity=Decimal("2"),  # Different amount to distinguish
            payment_date=timezone.now(),
        )
        
        # Query for yesterday to today only
        params = {
            "start_date": yesterday.isoformat(),
            "end_date": today.isoformat(),
            "group_by": "category",
            "refresh": "true",
        }
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        assert response.status_code == status.HTTP_200_OK
        # Should only include today's payment (500 x 2 = 1000)
        assert response.data["total_revenue"] == 1000.0

    def test_only_includes_completed_payments(
        self, authenticated_client, sample_patient, test_user, consultation_service
    ):
        """Should only include completed payments in revenue."""
        today = date.today()
        
        # Create completed payment
        create_invoice_with_payment(
            patient=sample_patient,
            user=test_user,
            service=consultation_service,
            quantity=Decimal("1"),
            payment_date=timezone.now(),
            payment_status="completed",
        )
        
        # Create pending payment
        create_invoice_with_payment(
            patient=sample_patient,
            user=test_user,
            service=consultation_service,
            quantity=Decimal("2"),
            payment_date=timezone.now(),
            payment_status="pending",
        )
        
        params = {
            "start_date": (today - timedelta(days=1)).isoformat(),
            "end_date": today.isoformat(),
            "refresh": "true",
        }
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        assert response.status_code == status.HTTP_200_OK
        # Should only include completed payment (500 x 1 = 500)
        assert response.data["total_revenue"] == 500.0


# =============================================================================
# Group By Tests
# =============================================================================


@pytest.mark.django_db
class TestRevenueBreakdownGroupBy:
    """Test group_by options for revenue breakdown endpoint."""

    def test_group_by_category_default(
        self, authenticated_client, sample_patient, test_user, consultation_service
    ):
        """Should group by category by default."""
        today = date.today()
        
        create_invoice_with_payment(
            patient=sample_patient,
            user=test_user,
            service=consultation_service,
            quantity=Decimal("1"),
            payment_date=timezone.now(),
        )
        
        params = {
            "start_date": (today - timedelta(days=1)).isoformat(),
            "end_date": today.isoformat(),
            "refresh": "true",
        }
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        assert response.status_code == status.HTTP_200_OK
        # Default should be category
        item = response.data["breakdown"][0]
        assert item["name"] == "Consultation"

    def test_group_by_item_type(
        self, authenticated_client, sample_patient, test_user, consultation_service
    ):
        """Should group by item type when specified."""
        today = date.today()
        
        create_invoice_with_payment(
            patient=sample_patient,
            user=test_user,
            service=consultation_service,
            quantity=Decimal("1"),
            payment_date=timezone.now(),
        )
        
        params = {
            "start_date": (today - timedelta(days=1)).isoformat(),
            "end_date": today.isoformat(),
            "group_by": "item_type",
            "refresh": "true",
        }
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        assert response.status_code == status.HTTP_200_OK
        item = response.data["breakdown"][0]
        # Should be grouped by item type (service, pharmacy, lab, etc.)
        assert item["name"].lower() in ["service", "pharmacy", "lab", "consumable", "other"]

    def test_group_by_payment_method(
        self, authenticated_client, sample_patient, test_user, consultation_service
    ):
        """Should group by payment method when specified."""
        today = date.today()
        
        create_invoice_with_payment(
            patient=sample_patient,
            user=test_user,
            service=consultation_service,
            quantity=Decimal("1"),
            payment_date=timezone.now(),
        )
        
        params = {
            "start_date": (today - timedelta(days=1)).isoformat(),
            "end_date": today.isoformat(),
            "group_by": "payment_method",
            "refresh": "true",
        }
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        assert response.status_code == status.HTTP_200_OK
        item = response.data["breakdown"][0]
        # Should be grouped by payment method
        assert item["name"].lower() in ["cash", "mpesa", "card", "bank_transfer", "insurance", "corporate", "cheque"]


# =============================================================================
# Edge Cases
# =============================================================================


@pytest.mark.django_db
class TestRevenueBreakdownEdgeCases:
    """Test edge cases for revenue breakdown endpoint."""

    def test_returns_empty_breakdown_when_no_data(self, authenticated_client):
        """Should return empty breakdown when no payments exist."""
        today = date.today()
        params = {
            "start_date": (today - timedelta(days=7)).isoformat(),
            "end_date": today.isoformat(),
        }
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_revenue"] == 0
        assert response.data["breakdown"] == []

    def test_handles_zero_total_gracefully(self, authenticated_client):
        """Should handle zero total without division errors."""
        today = date.today()
        params = {
            "start_date": (today - timedelta(days=7)).isoformat(),
            "end_date": today.isoformat(),
        }
        response = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        assert response.status_code == status.HTTP_200_OK
        # Should not raise division by zero
        assert response.data["total_revenue"] == 0


# =============================================================================
# Caching Tests
# =============================================================================


@pytest.mark.django_db
class TestRevenueBreakdownCaching:
    """Test Redis caching for revenue breakdown endpoint."""

    def test_response_is_cached(self, authenticated_client):
        """Should cache response and return cached data on subsequent requests."""
        today = date.today()
        params = {
            "start_date": (today - timedelta(days=7)).isoformat(),
            "end_date": today.isoformat(),
        }
        
        # First request
        response1 = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        assert response1.status_code == status.HTTP_200_OK
        
        # Second request should be cached
        response2 = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        assert response2.status_code == status.HTTP_200_OK
        assert response1.data == response2.data

    def test_refresh_bypasses_cache(
        self, authenticated_client, sample_patient, test_user, consultation_service
    ):
        """Should bypass cache when refresh=true."""
        today = date.today()
        params = {
            "start_date": (today - timedelta(days=7)).isoformat(),
            "end_date": today.isoformat(),
        }
        
        # First request (empty)
        response1 = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        assert response1.data["total_revenue"] == 0
        
        # Create payment
        create_invoice_with_payment(
            patient=sample_patient,
            user=test_user,
            service=consultation_service,
            quantity=Decimal("1"),
            payment_date=timezone.now(),
        )
        
        # Request with refresh
        params["refresh"] = "true"
        response2 = authenticated_client.get(REVENUE_BREAKDOWN_URL, params)
        
        # Should have new data
        assert response2.data["total_revenue"] == 500.0
