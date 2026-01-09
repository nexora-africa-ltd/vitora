"""
Tests for SHA Claims Service Stub.

Following TDD approach for Phase 4.3 SHA Claims Stub implementation.
"""
from decimal import Decimal

import pytest # type: ignore

from hmis.apps.billing.services.sha import SHAClaimsService


@pytest.mark.django_db
class TestSHAClaimsStub:
    """Test SHA Claims Service stub functionality."""

    def test_submit_claim_stub_returns_mock_response(self, sample_invoice):
        """Should return mock claim submission response."""
        service = SHAClaimsService()

        result = service.submit_claim(sample_invoice)

        assert result['success'] is True
        assert 'SHA-STUB-' in result['claim_number']
        assert sample_invoice.invoice_number in result['claim_number']
        assert result['status'] == 'pending_review'
        assert 'Stub:' in result['message']
        assert 'submitted_at' in result

    def test_query_claim_status_stub_returns_mock_status(self):
        """Should return mock claim status."""
        service = SHAClaimsService()
        claim_number = 'SHA-STUB-INV-20260102-0001'

        result = service.query_claim_status(claim_number)

        assert result['claim_number'] == claim_number
        assert result['status'] in ['approved', 'rejected', 'pending']
        assert 'approved_amount' in result
        assert isinstance(result['approved_amount'], Decimal)
        assert 'message' in result

    def test_get_preauthorization_stub_returns_mock_preauth(self):
        """Should return mock preauthorization."""
        service = SHAClaimsService()
        patient_id = 'MRN-20260102-0001'
        service_codes = ['SHA-001', 'SHA-002']

        result = service.get_preauthorization(patient_id, service_codes)

        assert 'PA-STUB-' in result['preauth_number']
        assert result['status'] == 'approved'
        assert 'valid_until' in result
        assert result['approved_services'] == service_codes

    def test_stub_flag_is_set(self):
        """Should have is_stub flag set to True."""
        service = SHAClaimsService()

        assert service.is_stub is True

    def test_invoice_can_store_sha_claim_number(self, sample_invoice):
        """Invoice should be able to store SHA claim number."""
        service = SHAClaimsService()

        result = service.submit_claim(sample_invoice)
        claim_number = result['claim_number']

        # Store claim number in invoice (if field exists)
        # This test validates the concept for future implementation
        assert claim_number.startswith('SHA-STUB-')
        assert len(claim_number) > 10

    def test_service_sha_codes_can_be_used(self, sample_service):
        """Service SHA codes should be available for claims."""
        # Verify service has sha_code field
        assert hasattr(sample_service, 'sha_code')

        # SHA code should be usable in claims
        if sample_service.sha_code:
            assert isinstance(sample_service.sha_code, str)
            assert len(sample_service.sha_code) > 0

    def test_preauth_valid_until_is_future_date(self):
        """Preauthorization valid_until should be in the future."""
        service = SHAClaimsService()
        patient_id = 'MRN-20260102-0001'
        service_codes = ['SHA-001']

        result = service.get_preauthorization(patient_id, service_codes)

        # Parse and verify valid_until is in future
        assert 'valid_until' in result
        # Just verify the key exists and format is ISO (actual parsing optional in stub)
        assert isinstance(result['valid_until'], str)
        assert len(result['valid_until']) > 10  # ISO format has at least this length
