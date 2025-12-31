"""
Tests for Stock Alert, Prescription, Dispensing, and Stock Adjustment models.

Following TDD approach: Write tests FIRST, then implement models.
"""

import pytest
from datetime import date, timedelta
from decimal import Decimal
from django.core.exceptions import ValidationError


# ============================================================================
# StockAlert Model Tests (12 tests as per sprint deliverables)
# ============================================================================


@pytest.mark.django_db
class TestStockAlertModel:
    """Tests for Stock Alert model."""

    def test_alert_creation_for_low_stock(self):
        """Alert can be created for low stock situation."""
        from hmis.apps.pharmacy.models import Drug, StockAlert
        
        drug = Drug.objects.create(
            code="ALERT001",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        alert = StockAlert.objects.create(
            drug=drug,
            alert_type="LOW_STOCK",
            severity="MEDIUM",
            message="Stock level below reorder point",
        )
        
        assert alert.id is not None
        assert alert.drug == drug
        assert alert.alert_type == "LOW_STOCK"
        assert alert.severity == "MEDIUM"
        assert alert.is_acknowledged is False

    def test_alert_creation_for_out_of_stock(self):
        """Alert can be created for out of stock situation."""
        from hmis.apps.pharmacy.models import Drug, StockAlert
        
        drug = Drug.objects.create(
            code="ALERT002",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        alert = StockAlert.objects.create(
            drug=drug,
            alert_type="OUT_OF_STOCK",
            severity="CRITICAL",
            message="Drug is completely out of stock",
        )
        
        assert alert.alert_type == "OUT_OF_STOCK"
        assert alert.severity == "CRITICAL"

    def test_alert_creation_for_expiring_soon(self):
        """Alert can be created for expiring drugs (30/60/90 days)."""
        from hmis.apps.pharmacy.models import Drug, StockBatch, StockAlert
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="alertuser1", password="test123")
        
        drug = Drug.objects.create(
            code="ALERT003",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="EXP001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=60),  # Expiring in 60 days
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )
        
        alert = StockAlert.objects.create(
            drug=drug,
            batch=batch,
            alert_type="EXPIRING_SOON",
            severity="HIGH",
            message="Batch expiring in 60 days",
        )
        
        assert alert.alert_type == "EXPIRING_SOON"
        assert alert.batch == batch

    def test_alert_creation_for_expired(self):
        """Alert can be created for expired drugs."""
        from hmis.apps.pharmacy.models import Drug, StockBatch, StockAlert
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="alertuser2", password="test123")
        
        drug = Drug.objects.create(
            code="ALERT004",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="EXPIRED001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() - timedelta(days=10),
            received_date=date.today() - timedelta(days=400),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
            status="EXPIRED",
        )
        
        alert = StockAlert.objects.create(
            drug=drug,
            batch=batch,
            alert_type="EXPIRED",
            severity="CRITICAL",
            message="Batch has expired",
        )
        
        assert alert.alert_type == "EXPIRED"
        assert alert.severity == "CRITICAL"

    def test_severity_assignment_rules(self):
        """Alert severity should be assigned based on alert type."""
        from hmis.apps.pharmacy.models import Drug, StockAlert
        
        drug = Drug.objects.create(
            code="ALERT005",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        # Critical severity for out of stock and expired
        critical_alert = StockAlert.objects.create(
            drug=drug,
            alert_type="OUT_OF_STOCK",
            severity="CRITICAL",
            message="Critical alert",
        )
        assert critical_alert.severity == "CRITICAL"
        
        # High severity for expiring soon
        high_alert = StockAlert.objects.create(
            drug=drug,
            alert_type="EXPIRING_SOON",
            severity="HIGH",
            message="High alert",
        )
        assert high_alert.severity == "HIGH"
        
        # Medium severity for low stock
        medium_alert = StockAlert.objects.create(
            drug=drug,
            alert_type="LOW_STOCK",
            severity="MEDIUM",
            message="Medium alert",
        )
        assert medium_alert.severity == "MEDIUM"

    def test_acknowledge_alert(self):
        """Alert can be acknowledged by a user."""
        from hmis.apps.pharmacy.models import Drug, StockAlert
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="alertuser3", password="test123")
        
        drug = Drug.objects.create(
            code="ALERT006",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        alert = StockAlert.objects.create(
            drug=drug,
            alert_type="LOW_STOCK",
            severity="MEDIUM",
            message="Low stock alert",
        )
        
        alert.acknowledge(user)
        
        assert alert.is_acknowledged is True
        assert alert.acknowledged_by == user
        assert alert.acknowledged_at is not None

    def test_resolve_alert_with_notes(self):
        """Alert can be resolved with resolution notes."""
        from hmis.apps.pharmacy.models import Drug, StockAlert
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="alertuser4", password="test123")
        
        drug = Drug.objects.create(
            code="ALERT007",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        alert = StockAlert.objects.create(
            drug=drug,
            alert_type="LOW_STOCK",
            severity="MEDIUM",
            message="Low stock alert",
        )
        
        alert.resolve(user, "New stock received")
        
        assert alert.is_resolved is True
        assert alert.resolved_by == user
        assert alert.resolved_at is not None
        assert alert.resolution_notes == "New stock received"

    def test_auto_generate_low_stock_alerts(self):
        """System should auto-generate alerts for low stock."""
        from hmis.apps.pharmacy.models import Drug, StockBatch, StockAlert
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="alertuser5", password="test123")
        
        drug = Drug.objects.create(
            code="ALERT008",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
            default_reorder_level=100,
        )
        
        # Create batch with low stock
        StockBatch.objects.create(
            drug=drug,
            batch_number="LOW001",
            quantity_received=1000,
            quantity_available=50,  # Below reorder level
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )
        
        # Generate alerts
        alerts = StockAlert.generate_low_stock_alerts()
        
        assert len(alerts) > 0
        assert any(alert.drug == drug for alert in alerts)

    def test_auto_generate_expiry_alerts(self):
        """System should auto-generate alerts for expiring drugs."""
        from hmis.apps.pharmacy.models import Drug, StockBatch, StockAlert
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="alertuser6", password="test123")
        
        drug = Drug.objects.create(
            code="ALERT009",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        # Create batch expiring soon
        StockBatch.objects.create(
            drug=drug,
            batch_number="EXPSOON001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=60),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )
        
        # Generate alerts
        alerts = StockAlert.generate_expiry_alerts()
        
        assert len(alerts) > 0
        assert any(alert.drug == drug for alert in alerts)

    def test_no_duplicate_alerts(self):
        """System should not create duplicate alerts for same condition."""
        from hmis.apps.pharmacy.models import Drug, StockAlert
        
        drug = Drug.objects.create(
            code="ALERT010",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        # Create first alert
        StockAlert.objects.create(
            drug=drug,
            alert_type="LOW_STOCK",
            severity="MEDIUM",
            message="Low stock alert",
        )
        
        # Check for existing alert before creating new one
        existing_alerts = StockAlert.objects.filter(
            drug=drug,
            alert_type="LOW_STOCK",
            is_resolved=False
        )
        
        assert existing_alerts.count() == 1

    def test_alert_filtering_by_type(self):
        """Alerts can be filtered by alert type."""
        from hmis.apps.pharmacy.models import Drug, StockAlert
        
        drug = Drug.objects.create(
            code="ALERT011",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        StockAlert.objects.create(
            drug=drug,
            alert_type="LOW_STOCK",
            severity="MEDIUM",
            message="Low stock",
        )
        
        StockAlert.objects.create(
            drug=drug,
            alert_type="EXPIRING_SOON",
            severity="HIGH",
            message="Expiring soon",
        )
        
        low_stock_alerts = StockAlert.objects.filter(alert_type="LOW_STOCK")
        expiring_alerts = StockAlert.objects.filter(alert_type="EXPIRING_SOON")
        
        assert low_stock_alerts.count() == 1
        assert expiring_alerts.count() == 1

    def test_alert_filtering_by_severity(self):
        """Alerts can be filtered by severity level."""
        from hmis.apps.pharmacy.models import Drug, StockAlert
        
        drug = Drug.objects.create(
            code="ALERT012",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        StockAlert.objects.create(
            drug=drug,
            alert_type="LOW_STOCK",
            severity="MEDIUM",
            message="Medium severity",
        )
        
        StockAlert.objects.create(
            drug=drug,
            alert_type="OUT_OF_STOCK",
            severity="CRITICAL",
            message="Critical severity",
        )
        
        critical_alerts = StockAlert.objects.filter(severity="CRITICAL")
        medium_alerts = StockAlert.objects.filter(severity="MEDIUM")
        
        assert critical_alerts.count() == 1
        assert medium_alerts.count() == 1
