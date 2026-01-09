"""
Tests for Service and ServiceCategory models.

Tests follow the deliverables spec requirements (§1, lines 78-156).
Total: 10 tests as specified.
"""

from decimal import Decimal

import pytest # type: ignore
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from hmis.apps.billing.models import Service, ServiceCategory


@pytest.mark.django_db
class TestServiceCategory:
    """Test ServiceCategory model."""

    def test_service_category_creation(self):
        """Test basic service category creation."""
        category = ServiceCategory.objects.create(
            name='Consultation',
            code='CONS',
            description='Doctor consultation services',
            display_order=1
        )

        assert category.name == 'Consultation'
        assert category.code == 'CONS'
        assert category.is_active is True
        assert str(category) == 'Consultation'

    def test_service_category_code_uniqueness(self):
        """Test that category codes must be unique."""
        ServiceCategory.objects.create(
            name='Consultation',
            code='CONS'
        )

        with pytest.raises(IntegrityError):
            ServiceCategory.objects.create(
                name='Consultation Services',
                code='CONS'  # Duplicate code
            )


@pytest.mark.django_db
class TestService:
    """Test Service model following deliverables spec requirements."""

    def test_service_creation_with_required_fields(self, service_category, billing_user):
        """Test service created with category, code, name, price."""
        service = Service.objects.create(
            category=service_category,
            code='CONS-GEN',
            name='General Consultation',
            unit_price=Decimal('500.00'),
            created_by=billing_user
        )

        assert service.category == service_category
        assert service.code == 'CONS-GEN'
        assert service.name == 'General Consultation'
        assert service.unit_price == Decimal('500.00')
        assert service.currency == 'KES'
        assert service.is_active is True
        assert str(service) == 'CONS-GEN - General Consultation'

    def test_service_code_uniqueness(self, service_category, billing_user):
        """Test that duplicate service codes are rejected."""
        Service.objects.create(
            category=service_category,
            code='CONS-GEN',
            name='General Consultation',
            unit_price=Decimal('500.00'),
            created_by=billing_user
        )

        with pytest.raises((IntegrityError, ValidationError)):
            Service.objects.create(
                category=service_category,
                code='CONS-GEN',  # Duplicate code
                name='Another Consultation',
                unit_price=Decimal('600.00'),
                created_by=billing_user
            )

    def test_service_category_linkage(self, service_category, billing_user):
        """Test service must belong to a category."""
        service = Service.objects.create(
            category=service_category,
            code='CONS-GEN',
            name='General Consultation',
            unit_price=Decimal('500.00'),
            created_by=billing_user
        )

        assert service.category == service_category
        assert service in service_category.services.all()

    def test_service_price_positive(self, service_category, billing_user):
        """Test price must be greater than 0."""
        with pytest.raises(ValidationError):
            service = Service(
                category=service_category,
                code='CONS-GEN',
                name='General Consultation',
                unit_price=Decimal('0.00'),  # Invalid: zero price
                created_by=billing_user
            )
            service.save()

        # Also test negative price
        with pytest.raises(ValidationError):
            service = Service(
                category=service_category,
                code='CONS-NEG',
                name='Negative Price Service',
                unit_price=Decimal('-100.00'),  # Invalid: negative price
                created_by=billing_user
            )
            service.save()

    def test_sha_code_format(self, service_category, billing_user):
        """Test SHA code follows expected format."""
        service = Service.objects.create(
            category=service_category,
            code='CONS-GEN',
            name='General Consultation',
            unit_price=Decimal('500.00'),
            sha_code='SHA-CONS-001',
            created_by=billing_user
        )

        assert service.sha_code == 'SHA-CONS-001'
        assert service.sha_code.startswith('SHA-')

    def test_service_display_name(self, service_category, billing_user):
        """Test display name formatted as 'Category - Name'."""
        service = Service.objects.create(
            category=service_category,
            code='CONS-GEN',
            name='General Consultation',
            unit_price=Decimal('500.00'),
            created_by=billing_user
        )

        expected_display_name = f"{service_category.name} - {service.name}"
        assert service.get_display_name() == expected_display_name
        assert service.get_display_name() == 'Consultation - General Consultation'

    def test_calculate_line_total(self, consultation_service):
        """Test line total calculation: quantity × unit_price."""
        quantity = Decimal('2.00')
        expected_total = consultation_service.unit_price * quantity

        calculated_total = consultation_service.calculate_line_total(quantity)

        assert calculated_total == expected_total
        assert calculated_total == Decimal('1000.00')  # 500 × 2

    def test_inactive_service_not_available(self, consultation_service):
        """Test is_available() returns False for inactive services."""
        # Active service should be available
        assert consultation_service.is_active is True
        assert consultation_service.is_available() is True

        # Deactivate service
        consultation_service.is_active = False
        consultation_service.save()

        # Should not be available
        assert consultation_service.is_available() is False

    def test_service_search_by_name(self, service_category, billing_user):
        """Test search functionality by name."""
        Service.objects.create(
            category=service_category,
            code='CONS-GEN',
            name='General Consultation',
            unit_price=Decimal('500.00'),
            created_by=billing_user
        )
        Service.objects.create(
            category=service_category,
            code='CONS-SPEC',
            name='Specialist Consultation',
            unit_price=Decimal('1500.00'),
            created_by=billing_user
        )

        # Search by name
        results = Service.objects.filter(name__icontains='General')
        assert results.count() == 1
        assert results.first().code == 'CONS-GEN'

        # Search with partial match
        results = Service.objects.filter(name__icontains='Consultation')
        assert results.count() == 2

    def test_service_search_by_code(self, service_category, billing_user):
        """Test search by service code."""
        Service.objects.create(
            category=service_category,
            code='CONS-GEN',
            name='General Consultation',
            unit_price=Decimal('500.00'),
            created_by=billing_user
        )
        Service.objects.create(
            category=service_category,
            code='LAB-CBC',
            name='Complete Blood Count',
            unit_price=Decimal('800.00'),
            created_by=billing_user
        )

        # Search by exact code
        service = Service.objects.get(code='CONS-GEN')
        assert service.name == 'General Consultation'

        # Search with partial code match
        results = Service.objects.filter(code__istartswith='CONS')
        assert results.count() == 1

        results = Service.objects.filter(code__icontains='LAB')
        assert results.count() == 1
        assert results.first().name == 'Complete Blood Count'
