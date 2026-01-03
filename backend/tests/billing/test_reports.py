"""
Tests for Billing Reports Service.

Following TDD approach - tests written first based on deliverables spec § 10 (lines 930-1014).
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from hmis.apps.billing.models import Invoice, InvoiceItem, Payment
from hmis.apps.billing.reports import BillingReportService


@pytest.mark.django_db
class TestBillingReportService:
    """Tests for BillingReportService report generation."""

    def test_daily_collection_report(self, sample_invoice, sample_invoice_item, test_user):
        """Test daily collection report shows correct totals for a date."""
        # Arrange
        service = BillingReportService()
        report_date = date.today()

        # Ensure invoice has items and totals calculated
        sample_invoice.calculate_totals()

        # Create a payment for half the amount
        payment = Payment.objects.create(
            invoice=sample_invoice,
            amount=Decimal('250.00'),
            method=Payment.Method.CASH,
            status=Payment.Status.COMPLETED,
            received_by=test_user,
            payment_date=timezone.now()
        )

        # Act
        report = service.daily_collection_report(report_date)

        # Assert
        assert report is not None
        assert 'total_collections' in report
        assert report['total_collections'] >= Decimal('250.00')
        assert 'invoice_count' in report
        assert report['invoice_count'] >= 1
        assert 'by_payment_method' in report
        assert 'outstanding_balance' in report

    def test_daily_collection_by_method(self, sample_invoice, sample_invoice_item, test_user):
        """Test daily collection report breakdown by payment type."""
        # Arrange
        service = BillingReportService()
        report_date = date.today()

        sample_invoice.calculate_totals()

        # Create payments with different methods
        Payment.objects.create(
            invoice=sample_invoice,
            amount=Decimal('300.00'),
            method=Payment.Method.CASH,
            status=Payment.Status.COMPLETED,
            received_by=test_user,
            payment_date=timezone.now()
        )
        Payment.objects.create(
            invoice=sample_invoice,
            amount=Decimal('200.00'),
            method=Payment.Method.MPESA,
            status=Payment.Status.COMPLETED,
            received_by=test_user,
            payment_date=timezone.now(),
            mpesa_receipt_number='TEST123'
        )

        # Act
        report = service.daily_collection_report(report_date)

        # Assert
        assert 'by_payment_method' in report
        assert Payment.Method.CASH in report['by_payment_method']
        assert report['by_payment_method'][Payment.Method.CASH] == Decimal('300.00')
        assert Payment.Method.MPESA in report['by_payment_method']
        assert report['by_payment_method'][Payment.Method.MPESA] == Decimal('200.00')

    def test_revenue_summary_date_range(self, sample_invoice, sample_invoice_item, test_user):
        """Test revenue summary sums correctly for a period."""
        # Arrange
        service = BillingReportService()
        start_date = date.today() - timedelta(days=7)
        end_date = date.today()

        sample_invoice.calculate_totals()
        Payment.objects.create(
            invoice=sample_invoice,
            amount=Decimal('250.00'),
            method=Payment.Method.CASH,
            status=Payment.Status.COMPLETED,
            received_by=test_user,
            payment_date=timezone.now()
        )

        # Act
        report = service.revenue_summary(start_date, end_date)

        # Assert
        assert report is not None
        assert 'total_revenue' in report
        assert report['total_revenue'] >= Decimal('250.00')  # Matches the payment amount
        assert 'by_category' in report
        assert 'by_payment_method' in report

    def test_revenue_by_category(self, sample_service, sample_invoice, test_user):
        """Test revenue summary grouped by service category."""
        # Arrange
        service = BillingReportService()
        start_date = date.today() - timedelta(days=7)
        end_date = date.today()

        # Create invoice with item
        item = InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=sample_service,
            description=f"{sample_service.name} - Test",
            quantity=2,
            unit_price=sample_service.unit_price
        )
        sample_invoice.calculate_totals()

        Payment.objects.create(
            invoice=sample_invoice,
            amount=sample_invoice.total_amount,
            method=Payment.Method.CASH,
            status=Payment.Status.COMPLETED,
            received_by=test_user,
            payment_date=timezone.now()
        )

        # Act
        report = service.revenue_summary(start_date, end_date)

        # Assert
        assert 'by_category' in report
        assert len(report['by_category']) > 0
        # Check that category revenue is tracked
        for category_data in report['by_category'].values():
            assert 'revenue' in category_data
            assert 'count' in category_data

    def test_outstanding_balances_list(self, sample_invoice, sample_invoice_item):
        """Test outstanding balances report lists unpaid invoices."""
        # Arrange
        service = BillingReportService()
        sample_invoice.calculate_totals()
        sample_invoice.status = Invoice.Status.PENDING
        sample_invoice.save()

        # Act
        report = service.outstanding_balances()

        # Assert
        assert isinstance(report, list)
        assert len(report) > 0
        # Check structure of outstanding balance items
        for item in report:
            assert 'invoice_number' in item
            assert 'patient_name' in item
            assert 'total_amount' in item
            assert 'balance' in item
            assert 'days_overdue' in item

    def test_outstanding_balances_days_overdue(self, sample_invoice, sample_invoice_item):
        """Test outstanding balances report calculates correct aging."""
        # Arrange
        service = BillingReportService()
        sample_invoice.calculate_totals()
        sample_invoice.status = Invoice.Status.PENDING
        # Set both invoice date and due date in the past to satisfy validation
        past_invoice_date = date.today() - timedelta(days=30)
        sample_invoice.invoice_date = past_invoice_date
        sample_invoice.due_date = past_invoice_date + timedelta(days=15)  # Due 15 days after invoice
        sample_invoice.save()

        # Act
        report = service.outstanding_balances()

        # Assert
        assert len(report) > 0
        overdue_invoice = next((item for item in report if item['invoice_number'] == sample_invoice.invoice_number), None)
        assert overdue_invoice is not None
        assert overdue_invoice['days_overdue'] >= 15

    def test_service_utilization_count(self, sample_service, sample_invoice, test_user):
        """Test service utilization report shows service usage count."""
        # Arrange
        service = BillingReportService()
        start_date = date.today() - timedelta(days=7)
        end_date = date.today()

        # Create multiple invoice items for the same service
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=sample_service,
            description=f"{sample_service.name} - Test 1",
            quantity=1,
            unit_price=sample_service.unit_price
        )
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=sample_service,
            description=f"{sample_service.name} - Test 2",
            quantity=1,
            unit_price=sample_service.unit_price
        )

        # Act
        report = service.service_utilization(start_date, end_date)

        # Assert
        assert 'services' in report
        assert len(report['services']) > 0
        for service_data in report['services']:
            assert 'service_name' in service_data
            assert 'count' in service_data
            assert service_data['count'] > 0

    def test_service_utilization_revenue(self, sample_service, sample_invoice, test_user):
        """Test service utilization report shows revenue per service."""
        # Arrange
        service = BillingReportService()
        start_date = date.today() - timedelta(days=7)
        end_date = date.today()

        # Create invoice items
        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=sample_service,
            description=f"{sample_service.name} - Test",
            quantity=2,
            unit_price=sample_service.unit_price
        )
        sample_invoice.calculate_totals()

        Payment.objects.create(
            invoice=sample_invoice,
            amount=sample_invoice.total_amount,
            method=Payment.Method.CASH,
            status=Payment.Status.COMPLETED,
            received_by=test_user,
            payment_date=timezone.now()
        )

        # Act
        report = service.service_utilization(start_date, end_date)

        # Assert
        assert 'services' in report
        for service_data in report['services']:
            assert 'revenue' in service_data
            assert service_data['revenue'] >= Decimal('0')

    def test_payment_method_analysis(self, sample_invoice, sample_invoice_item, test_user):
        """Test payment method breakdown report."""
        # Arrange
        service = BillingReportService()
        start_date = date.today() - timedelta(days=7)
        end_date = date.today()

        sample_invoice.calculate_totals()

        # Create payments with different methods
        Payment.objects.create(
            invoice=sample_invoice,
            amount=Decimal('300.00'),
            method=Payment.Method.CASH,
            status=Payment.Status.COMPLETED,
            received_by=test_user,
            payment_date=timezone.now()
        )
        Payment.objects.create(
            invoice=sample_invoice,
            amount=Decimal('200.00'),
            method=Payment.Method.MPESA,
            status=Payment.Status.COMPLETED,
            received_by=test_user,
            payment_date=timezone.now(),
            mpesa_receipt_number='TEST123'
        )

        # Act
        report = service.payment_method_analysis(start_date, end_date)

        # Assert
        assert 'by_method' in report
        assert 'average_transaction' in report
        assert Payment.Method.CASH in report['by_method']
        assert Payment.Method.MPESA in report['by_method']

    def test_mpesa_success_rate(self, sample_invoice, sample_invoice_item, test_user):
        """Test M-Pesa success rate calculation in payment method analysis."""
        # Arrange
        service = BillingReportService()
        start_date = date.today() - timedelta(days=7)
        end_date = date.today()

        sample_invoice.calculate_totals()

        # Create successful M-Pesa payment
        Payment.objects.create(
            invoice=sample_invoice,
            amount=Decimal('200.00'),
            method=Payment.Method.MPESA,
            status=Payment.Status.COMPLETED,
            received_by=test_user,
            payment_date=timezone.now(),
            mpesa_receipt_number='SUCCESS123'
        )

        # Create failed M-Pesa payment
        Payment.objects.create(
            invoice=sample_invoice,
            amount=Decimal('150.00'),
            method=Payment.Method.MPESA,
            status=Payment.Status.FAILED,
            received_by=test_user,
            payment_date=timezone.now()
        )

        # Act
        report = service.payment_method_analysis(start_date, end_date)

        # Assert
        assert 'mpesa_metrics' in report
        assert 'success_rate' in report['mpesa_metrics']
        assert 'total_transactions' in report['mpesa_metrics']
        assert 'successful_transactions' in report['mpesa_metrics']
        # Success rate should be 50% (1 success out of 2 total)
        assert report['mpesa_metrics']['success_rate'] == 50.0
