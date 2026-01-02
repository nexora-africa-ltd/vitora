"""
Billing Reports Service.

Generates financial reports for billing module.
Based on deliverables spec § 10 (lines 930-1014).
"""
from datetime import date, timedelta
from decimal import Decimal
from typing import Dict, List, Any
from django.db.models import Sum, Count, Q, Avg
from django.utils import timezone

from .models import Invoice, InvoiceItem, Payment, Service, ServiceCategory


class BillingReportService:
    """Generate billing and financial reports."""
    
    def daily_collection_report(self, date: date) -> Dict[str, Any]:
        """
        Daily cash collection report.
        
        Returns:
            - Total collections by payment method
            - Invoice count
            - Top services billed
            - Outstanding balances
        """
        # Get payments for the specified date
        payments = Payment.objects.filter(
            payment_date__date=date,
            status=Payment.Status.COMPLETED
        )
        
        # Calculate total collections
        total_collections = payments.aggregate(total=Sum('amount'))['total'] or Decimal('0')
        
        # Breakdown by payment method
        by_payment_method = {}
        for method_choice in Payment.Method.choices:
            method = method_choice[0]
            method_total = payments.filter(method=method).aggregate(total=Sum('amount'))['total'] or Decimal('0')
            if method_total > 0:
                by_payment_method[method] = method_total
        
        # Count invoices with payments on this date
        invoice_ids = payments.values_list('invoice_id', flat=True).distinct()
        invoice_count = len(invoice_ids)
        
        # Top services billed (based on invoice items for invoices paid today)
        top_services = InvoiceItem.objects.filter(
            invoice_id__in=invoice_ids
        ).values('service__name').annotate(
            total_revenue=Sum('line_total'),
            count=Count('id')
        ).order_by('-total_revenue')[:5]
        
        # Outstanding balances (invoices not fully paid)
        outstanding = Invoice.objects.filter(
            Q(status=Invoice.Status.PENDING) | Q(status=Invoice.Status.PARTIAL) | Q(status=Invoice.Status.OVERDUE)
        ).aggregate(total=Sum('balance'))['total'] or Decimal('0')
        
        return {
            'date': date,
            'total_collections': total_collections,
            'by_payment_method': by_payment_method,
            'invoice_count': invoice_count,
            'top_services': list(top_services),
            'outstanding_balance': outstanding
        }
    
    def revenue_summary(self, start_date: date, end_date: date) -> Dict[str, Any]:
        """
        Revenue summary for date range.
        
        Returns:
            - Total revenue
            - Revenue by category
            - Revenue by payment method
            - Comparison to previous period
        """
        # Get completed payments in date range
        payments = Payment.objects.filter(
            payment_date__date__gte=start_date,
            payment_date__date__lte=end_date,
            status=Payment.Status.COMPLETED
        )
        
        # Total revenue
        total_revenue = payments.aggregate(total=Sum('amount'))['total'] or Decimal('0')
        
        # Revenue by payment method
        by_payment_method = {}
        for method_choice in Payment.Method.choices:
            method = method_choice[0]
            method_total = payments.filter(method=method).aggregate(total=Sum('amount'))['total'] or Decimal('0')
            if method_total > 0:
                by_payment_method[method] = method_total
        
        # Revenue by service category
        invoice_ids = payments.values_list('invoice_id', flat=True)
        by_category = {}
        
        # Get all invoice items for paid invoices in this period
        items = InvoiceItem.objects.filter(
            invoice_id__in=invoice_ids,
            service__isnull=False
        ).select_related('service__category')
        
        for item in items:
            if item.service and item.service.category:
                category_name = item.service.category.name
                if category_name not in by_category:
                    by_category[category_name] = {
                        'revenue': Decimal('0'),
                        'count': 0
                    }
                by_category[category_name]['revenue'] += item.line_total
                by_category[category_name]['count'] += 1
        
        # Previous period comparison
        period_length = (end_date - start_date).days + 1
        prev_start = start_date - timedelta(days=period_length)
        prev_end = start_date - timedelta(days=1)
        
        prev_payments = Payment.objects.filter(
            payment_date__date__gte=prev_start,
            payment_date__date__lte=prev_end,
            status=Payment.Status.COMPLETED
        )
        prev_revenue = prev_payments.aggregate(total=Sum('amount'))['total'] or Decimal('0')
        
        # Calculate percentage change
        if prev_revenue > 0:
            change_percent = float((total_revenue - prev_revenue) / prev_revenue * 100)
        else:
            change_percent = 100.0 if total_revenue > 0 else 0.0
        
        return {
            'period': {
                'start': start_date,
                'end': end_date
            },
            'total_revenue': total_revenue,
            'by_payment_method': by_payment_method,
            'by_category': by_category,
            'previous_period': {
                'revenue': prev_revenue,
                'change_percent': round(change_percent, 2)
            }
        }
    
    def outstanding_balances(self) -> List[Dict[str, Any]]:
        """
        List of invoices with outstanding balances.
        
        Returns:
            - Invoice details
            - Patient info
            - Days overdue
            - Total outstanding
        """
        # Get all invoices that are not fully paid or cancelled
        outstanding_invoices = Invoice.objects.filter(
            Q(status=Invoice.Status.PENDING) | 
            Q(status=Invoice.Status.PARTIAL) | 
            Q(status=Invoice.Status.OVERDUE)
        ).filter(balance__gt=0).select_related('patient')
        
        result = []
        today = date.today()
        
        for invoice in outstanding_invoices:
            # Calculate days overdue
            if invoice.due_date and invoice.due_date < today:
                days_overdue = (today - invoice.due_date).days
            else:
                days_overdue = 0
            
            result.append({
                'invoice_number': invoice.invoice_number,
                'patient_name': f"{invoice.patient.first_name} {invoice.patient.last_name}",
                'patient_mrn': invoice.patient.mrn,
                'invoice_date': invoice.invoice_date,
                'due_date': invoice.due_date,
                'total_amount': invoice.total_amount,
                'paid_amount': invoice.paid_amount,
                'balance': invoice.balance,
                'days_overdue': days_overdue,
                'status': invoice.status
            })
        
        # Sort by days overdue (most overdue first)
        result.sort(key=lambda x: x['days_overdue'], reverse=True)
        
        return result
    
    def service_utilization(self, start_date: date, end_date: date) -> Dict[str, Any]:
        """
        Service utilization report.
        
        Returns:
            - Service count
            - Revenue per service
            - Trend analysis
        """
        # Get invoice items in date range
        items = InvoiceItem.objects.filter(
            invoice__invoice_date__gte=start_date,
            invoice__invoice_date__lte=end_date,
            service__isnull=False
        ).select_related('service', 'invoice')
        
        # Aggregate by service
        service_data = {}
        
        for item in items:
            service_name = item.service.name
            if service_name not in service_data:
                service_data[service_name] = {
                    'service_name': service_name,
                    'service_code': item.service.code,
                    'count': 0,
                    'quantity': 0,
                    'revenue': Decimal('0')
                }
            
            service_data[service_name]['count'] += 1
            service_data[service_name]['quantity'] += item.quantity
            service_data[service_name]['revenue'] += item.line_total
        
        # Convert to list and sort by revenue
        services = list(service_data.values())
        services.sort(key=lambda x: x['revenue'], reverse=True)
        
        # Calculate totals
        total_services = len(services)
        total_revenue = sum(s['revenue'] for s in services)
        
        return {
            'period': {
                'start': start_date,
                'end': end_date
            },
            'total_services': total_services,
            'total_revenue': total_revenue,
            'services': services
        }
    
    def payment_method_analysis(self, start_date: date, end_date: date) -> Dict[str, Any]:
        """
        Payment method breakdown.
        
        Returns:
            - Collections by method
            - M-Pesa success rate
            - Average transaction value
        """
        # Get all payments in date range (both completed and failed for M-Pesa analysis)
        all_payments = Payment.objects.filter(
            payment_date__date__gte=start_date,
            payment_date__date__lte=end_date
        )
        
        # Get completed payments only for revenue
        completed_payments = all_payments.filter(status=Payment.Status.COMPLETED)
        
        # Collections by method
        by_method = {}
        for method_choice in Payment.Method.choices:
            method = method_choice[0]
            method_data = completed_payments.filter(method=method).aggregate(
                total=Sum('amount'),
                count=Count('id'),
                avg=Avg('amount')
            )
            
            if method_data['total']:
                by_method[method] = {
                    'total': method_data['total'],
                    'count': method_data['count'],
                    'average': method_data['avg']
                }
        
        # Overall average transaction
        avg_transaction = completed_payments.aggregate(avg=Avg('amount'))['avg'] or Decimal('0')
        
        # M-Pesa specific metrics
        mpesa_payments = all_payments.filter(method=Payment.Method.MPESA)
        mpesa_total = mpesa_payments.count()
        mpesa_successful = mpesa_payments.filter(status=Payment.Status.COMPLETED).count()
        mpesa_failed = mpesa_payments.filter(status=Payment.Status.FAILED).count()
        
        if mpesa_total > 0:
            mpesa_success_rate = round((mpesa_successful / mpesa_total) * 100, 2)
        else:
            mpesa_success_rate = 0.0
        
        mpesa_metrics = {
            'total_transactions': mpesa_total,
            'successful_transactions': mpesa_successful,
            'failed_transactions': mpesa_failed,
            'success_rate': mpesa_success_rate
        }
        
        return {
            'period': {
                'start': start_date,
                'end': end_date
            },
            'by_method': by_method,
            'average_transaction': avg_transaction,
            'mpesa_metrics': mpesa_metrics
        }
