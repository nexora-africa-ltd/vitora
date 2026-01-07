"""
Tests for SHA API Endpoints.

Following TDD principles, these tests are written BEFORE the implementation.
They define the expected behavior of the SHA API endpoints as specified in
Sprint 2.1-2.2 deliverables.

API Test Coverage (30 tests):
- Authentication required on all endpoints
- Permission checks per endpoint
- Pagination and filtering for list endpoints
- Search functionality for members and tariffs
- Error responses (400, 401, 403, 404)
- SHA member registration with patient linkage
- Eligibility verification API call (mocked)
- Claim creation from encounter
- Claim item CRUD operations
- Attachment upload with validation
- Claim validation endpoint
- Claim submission workflow
- Appeal creation from rejected claim
- Dashboard statistics aggregation
- Export functionality (CSV, Excel)
- Offline sync compatibility
"""

from datetime import date, timedelta
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch, MagicMock

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


# =============================================================================
# Fixtures for SHA API Tests
# =============================================================================


@pytest.fixture
def api_client():
    """Unauthenticated API client."""
    return APIClient()


@pytest.fixture
def test_user(db):
    """Create a test user."""
    return User.objects.create_user(
        username='testuser',
        email='test@example.com',
        password='testpass123',
    )


@pytest.fixture
def authenticated_client(test_user):
    """Authenticated API client."""
    client = APIClient()
    client.force_authenticate(user=test_user)
    return client


@pytest.fixture
def user_with_sha_permissions(db):
    """User with all SHA-related permissions."""
    user = User.objects.create_user(
        username='sha_user',
        email='sha@example.com',
        password='testpass123',
    )
    # Add SHA permissions
    permissions = Permission.objects.filter(
        codename__in=[
            'view_shamember', 'add_shamember', 'change_shamember',
            'view_shatariff',
            'view_shaclaim', 'add_shaclaim', 'change_shaclaim',
            'submit_sha_claim', 'appeal_sha_claim',
            'verify_sha_eligibility',
        ]
    )
    user.user_permissions.add(*permissions)
    return user


@pytest.fixture
def sha_client(user_with_sha_permissions):
    """Authenticated client with SHA permissions."""
    client = APIClient()
    client.force_authenticate(user=user_with_sha_permissions)
    return client


@pytest.fixture
def sample_sha_member(db, sample_patient, test_user):
    """Create a sample SHA member for testing."""
    from hmis.apps.billing.models import SHAMember

    return SHAMember.objects.create(
        patient=sample_patient,
        sha_number='SHA-1234567890',
        national_id='12345678',
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        coverage_start_date=date.today() - timedelta(days=365),
        coverage_end_date=date.today() + timedelta(days=365),
        created_by=test_user,
    )


@pytest.fixture
def sample_sha_tariff(db):
    """Create a sample SHA tariff for testing."""
    from hmis.apps.billing.models import SHATariff

    return SHATariff.objects.create(
        code='SHA-CONS-001',
        name='General Consultation',
        description='Standard outpatient consultation',
        category=SHATariff.TariffCategory.CONSULTATION,
        sha_amount=Decimal('500.00'),
        facility_level=SHATariff.TariffLevel.LEVEL_3,
        effective_date=date.today() - timedelta(days=30),
        is_active=True,
        max_quantity_per_claim=1,
    )


@pytest.fixture
def sample_sha_claim(db, sample_sha_member, sample_encounter, test_user):
    """Create a sample SHA claim for testing."""
    from hmis.apps.billing.models import SHAClaim

    return SHAClaim.objects.create(
        patient=sample_sha_member.patient,
        sha_member=sample_sha_member,
        encounter=sample_encounter,
        claim_type=SHAClaim.ClaimType.OUTPATIENT,
        status=SHAClaim.ClaimStatus.DRAFT,
        service_date=date.today(),
        primary_diagnosis_code='J06.9',
        primary_diagnosis_description='Acute upper respiratory infection',
        claimed_amount=Decimal('0.00'),
        facility_code='TEST-001',
        facility_level='L3',
        created_by=test_user,
    )


@pytest.fixture
def sample_claim_with_items(db, sample_sha_claim, sample_sha_tariff, test_user):
    """Create a claim with items and attachments ready for submission."""
    from hmis.apps.billing.models import SHAClaimItem, SHAClaimAttachment

    # Add claim item
    SHAClaimItem.objects.create(
        claim=sample_sha_claim,
        tariff=sample_sha_tariff,
        description='General Consultation',
        service_date=date.today(),
        quantity=Decimal('1.00'),
        unit_price=sample_sha_tariff.sha_amount,
    )

    # Add required attachments
    test_file = SimpleUploadedFile(
        name='clinical_notes.pdf',
        content=b'%PDF-1.4 test content',
        content_type='application/pdf',
    )
    SHAClaimAttachment.objects.create(
        claim=sample_sha_claim,
        attachment_type='clinical_notes',
        name='Clinical Notes',
        file=test_file,
        file_size=len(b'%PDF-1.4 test content'),
        mime_type='application/pdf',
        checksum='abc123',
        original_filename='clinical_notes.pdf',
        uploaded_by=test_user,
    )

    test_file2 = SimpleUploadedFile(
        name='invoice.pdf',
        content=b'%PDF-1.4 invoice content',
        content_type='application/pdf',
    )
    SHAClaimAttachment.objects.create(
        claim=sample_sha_claim,
        attachment_type='invoice',
        name='Invoice',
        file=test_file2,
        file_size=len(b'%PDF-1.4 invoice content'),
        mime_type='application/pdf',
        checksum='def456',
        original_filename='invoice.pdf',
        uploaded_by=test_user,
    )

    # Refresh to get updated claimed_amount
    sample_sha_claim.refresh_from_db()
    return sample_sha_claim


@pytest.fixture
def multiple_sha_members(db, test_user):
    """Create multiple SHA members for pagination testing."""
    from hmis.apps.billing.models import SHAMember
    from hmis.apps.patients.models import Patient
    from hmis.apps.core.models import County, SubCounty

    county = County.objects.first() or County.objects.create(code=1, name='Test County')
    sub_county = SubCounty.objects.filter(county=county).first() or SubCounty.objects.create(
        county=county, name='Test SubCounty'
    )

    members = []
    for i in range(15):
        patient = Patient.objects.create(
            first_name=f'Patient{i}',
            last_name='Test',
            date_of_birth=date(1990, 1, 1),
            gender='M',
            county=county,
            sub_county=sub_county,
            registered_by=test_user,
        )
        member = SHAMember.objects.create(
            patient=patient,
            sha_number=f'SHA-{1000000000 + i}',
            national_id=f'{10000000 + i}',
            membership_type=SHAMember.MembershipType.PRINCIPAL,
            status=SHAMember.MembershipStatus.ACTIVE,
            created_by=test_user,
        )
        members.append(member)
    return members


@pytest.fixture
def multiple_sha_claims(db, sample_sha_member, sample_encounter, test_user):
    """Create multiple SHA claims for pagination testing."""
    from hmis.apps.billing.models import SHAClaim

    claims = []
    for i in range(15):
        claim = SHAClaim.objects.create(
            patient=sample_sha_member.patient,
            sha_member=sample_sha_member,
            encounter=sample_encounter,
            claim_type=SHAClaim.ClaimType.OUTPATIENT,
            status=SHAClaim.ClaimStatus.DRAFT,
            service_date=date.today() - timedelta(days=i),
            primary_diagnosis_code='J06.9',
            primary_diagnosis_description='Test diagnosis',
            claimed_amount=Decimal('500.00') * (i + 1),
            facility_code='TEST-001',
            facility_level='L3',
            created_by=test_user,
        )
        claims.append(claim)
    return claims


# =============================================================================
# Test Class: Authentication Required on All Endpoints
# =============================================================================


@pytest.mark.django_db
class TestSHAAPIAuthentication:
    """Test that all SHA endpoints require authentication."""

    # =========================================================================
    # SHA Member Endpoints Authentication
    # =========================================================================
    def test_list_sha_members_requires_auth(self, api_client):
        """Should reject unauthenticated request to list SHA members."""
        response = api_client.get('/api/sha/members/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_sha_member_requires_auth(self, api_client):
        """Should reject unauthenticated request to create SHA member."""
        response = api_client.post('/api/sha/members/', {})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_sha_member_requires_auth(self, api_client, sample_sha_member):
        """Should reject unauthenticated request to get SHA member detail."""
        response = api_client.get(f'/api/sha/members/{sample_sha_member.id}/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_update_sha_member_requires_auth(self, api_client, sample_sha_member):
        """Should reject unauthenticated request to update SHA member."""
        response = api_client.patch(f'/api/sha/members/{sample_sha_member.id}/', {})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_verify_eligibility_requires_auth(self, api_client, sample_sha_member):
        """Should reject unauthenticated request to verify eligibility."""
        response = api_client.post(f'/api/sha/members/{sample_sha_member.id}/verify/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_search_sha_members_requires_auth(self, api_client):
        """Should reject unauthenticated request to search SHA members."""
        response = api_client.get('/api/sha/members/search/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    # =========================================================================
    # SHA Tariff Endpoints Authentication
    # =========================================================================
    def test_list_sha_tariffs_requires_auth(self, api_client):
        """Should reject unauthenticated request to list SHA tariffs."""
        response = api_client.get('/api/sha/tariffs/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_sha_tariff_requires_auth(self, api_client, sample_sha_tariff):
        """Should reject unauthenticated request to get SHA tariff detail."""
        response = api_client.get(f'/api/sha/tariffs/{sample_sha_tariff.id}/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_search_sha_tariffs_requires_auth(self, api_client):
        """Should reject unauthenticated request to search SHA tariffs."""
        response = api_client.get('/api/sha/tariffs/search/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_tariffs_by_category_requires_auth(self, api_client):
        """Should reject unauthenticated request to get tariffs by category."""
        response = api_client.get('/api/sha/tariffs/by-category/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    # =========================================================================
    # SHA Claim Endpoints Authentication
    # =========================================================================
    def test_list_sha_claims_requires_auth(self, api_client):
        """Should reject unauthenticated request to list SHA claims."""
        response = api_client.get('/api/sha/claims/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_sha_claim_requires_auth(self, api_client):
        """Should reject unauthenticated request to create SHA claim."""
        response = api_client.post('/api/sha/claims/', {})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_sha_claim_requires_auth(self, api_client, sample_sha_claim):
        """Should reject unauthenticated request to get SHA claim detail."""
        response = api_client.get(f'/api/sha/claims/{sample_sha_claim.id}/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_validate_claim_requires_auth(self, api_client, sample_sha_claim):
        """Should reject unauthenticated request to validate claim."""
        response = api_client.post(f'/api/sha/claims/{sample_sha_claim.id}/validate/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_submit_claim_requires_auth(self, api_client, sample_sha_claim):
        """Should reject unauthenticated request to submit claim."""
        response = api_client.post(f'/api/sha/claims/{sample_sha_claim.id}/submit/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_appeal_claim_requires_auth(self, api_client, sample_sha_claim):
        """Should reject unauthenticated request to appeal claim."""
        response = api_client.post(f'/api/sha/claims/{sample_sha_claim.id}/appeal/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_claim_dashboard_requires_auth(self, api_client):
        """Should reject unauthenticated request to claims dashboard."""
        response = api_client.get('/api/sha/claims/dashboard/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_export_claims_requires_auth(self, api_client):
        """Should reject unauthenticated request to export claims."""
        response = api_client.get('/api/sha/claims/export/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# Test Class: Permission Checks Per Endpoint
# =============================================================================


@pytest.mark.django_db
class TestSHAAPIPermissions:
    """Test that endpoints enforce correct permissions."""

    def test_list_members_requires_view_permission(self, authenticated_client):
        """Should require view_shamember permission to list members."""
        response = authenticated_client.get('/api/sha/members/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_list_members_allowed_with_permission(self, sha_client):
        """Should allow listing members with correct permission."""
        response = sha_client.get('/api/sha/members/')
        assert response.status_code == status.HTTP_200_OK

    def test_create_member_requires_add_permission(self, authenticated_client, sample_patient):
        """Should require add_shamember permission to create member."""
        data = {
            'patient': sample_patient.id,
            'sha_number': 'SHA-9999999999',
            'national_id': '99999999',
            'membership_type': 'principal',
        }
        response = authenticated_client.post('/api/sha/members/', data)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_submit_claim_requires_submit_permission(
        self, authenticated_client, sample_claim_with_items
    ):
        """Should require submit_sha_claim permission to submit."""
        response = authenticated_client.post(
            f'/api/sha/claims/{sample_claim_with_items.id}/submit/'
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_submit_claim_allowed_with_permission(self, sha_client, sample_claim_with_items):
        """Should allow submitting claim with correct permission."""
        # Make member eligible
        sample_claim_with_items.sha_member.status = 'active'
        sample_claim_with_items.sha_member.coverage_end_date = date.today() + timedelta(days=30)
        sample_claim_with_items.sha_member.save()

        response = sha_client.post(f'/api/sha/claims/{sample_claim_with_items.id}/submit/')
        # Should succeed or return validation error (not permission error)
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST]

    def test_appeal_claim_requires_appeal_permission(
        self, authenticated_client, sample_sha_claim
    ):
        """Should require appeal_sha_claim permission to appeal."""
        response = authenticated_client.post(f'/api/sha/claims/{sample_sha_claim.id}/appeal/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_verify_eligibility_requires_permission(
        self, authenticated_client, sample_sha_member
    ):
        """Should require verify_sha_eligibility permission."""
        response = authenticated_client.post(f'/api/sha/members/{sample_sha_member.id}/verify/')
        assert response.status_code == status.HTTP_403_FORBIDDEN


# =============================================================================
# Test Class: Pagination and Filtering for List Endpoints
# =============================================================================


@pytest.mark.django_db
class TestSHAAPIPagination:
    """Test pagination and filtering for list endpoints."""

    def test_members_list_paginated(self, sha_client, multiple_sha_members):
        """Should return paginated SHA members list."""
        response = sha_client.get('/api/sha/members/')

        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data
        assert 'count' in response.data
        assert 'next' in response.data
        assert 'previous' in response.data
        assert response.data['count'] >= 15

    def test_members_list_default_page_size(self, sha_client, multiple_sha_members):
        """Should use default page size for members list."""
        response = sha_client.get('/api/sha/members/')

        assert response.status_code == status.HTTP_200_OK
        # Default page size should be 10 or configured value
        assert len(response.data['results']) <= 20

    def test_members_list_custom_page_size(self, sha_client, multiple_sha_members):
        """Should respect custom page size parameter."""
        response = sha_client.get('/api/sha/members/?page_size=5')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) <= 5

    def test_members_filter_by_status(self, sha_client, multiple_sha_members):
        """Should filter members by status."""
        response = sha_client.get('/api/sha/members/?status=active')

        assert response.status_code == status.HTTP_200_OK
        for member in response.data['results']:
            assert member['status'] == 'active'

    def test_claims_list_paginated(self, sha_client, multiple_sha_claims):
        """Should return paginated SHA claims list."""
        response = sha_client.get('/api/sha/claims/')

        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data
        assert 'count' in response.data
        assert response.data['count'] >= 15

    def test_claims_filter_by_status(self, sha_client, multiple_sha_claims):
        """Should filter claims by status."""
        response = sha_client.get('/api/sha/claims/?status=draft')

        assert response.status_code == status.HTTP_200_OK
        for claim in response.data['results']:
            assert claim['status'] == 'draft'

    def test_claims_filter_by_date_range(self, sha_client, multiple_sha_claims):
        """Should filter claims by service date range."""
        start_date = (date.today() - timedelta(days=7)).isoformat()
        end_date = date.today().isoformat()

        response = sha_client.get(
            f'/api/sha/claims/?service_date_from={start_date}&service_date_to={end_date}'
        )

        assert response.status_code == status.HTTP_200_OK

    def test_claims_filter_by_claim_type(self, sha_client, multiple_sha_claims):
        """Should filter claims by claim type."""
        response = sha_client.get('/api/sha/claims/?claim_type=outpatient')

        assert response.status_code == status.HTTP_200_OK
        for claim in response.data['results']:
            assert claim['claim_type'] == 'outpatient'

    def test_tariffs_filter_by_category(self, sha_client, sample_sha_tariff):
        """Should filter tariffs by category."""
        response = sha_client.get('/api/sha/tariffs/?category=consultation')

        assert response.status_code == status.HTTP_200_OK

    def test_tariffs_filter_by_facility_level(self, sha_client, sample_sha_tariff):
        """Should filter tariffs by facility level."""
        response = sha_client.get('/api/sha/tariffs/?facility_level=L3')

        assert response.status_code == status.HTTP_200_OK


# =============================================================================
# Test Class: Search Functionality
# =============================================================================


@pytest.mark.django_db
class TestSHAAPISearch:
    """Test search functionality for members and tariffs."""

    def test_search_members_by_sha_number(self, sha_client, sample_sha_member):
        """Should search members by SHA number."""
        response = sha_client.get(f'/api/sha/members/search/?sha_number={sample_sha_member.sha_number}')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) >= 1
        assert response.data['results'][0]['sha_number'] == sample_sha_member.sha_number

    def test_search_members_by_national_id(self, sha_client, sample_sha_member):
        """Should search members by national ID."""
        response = sha_client.get(f'/api/sha/members/search/?national_id={sample_sha_member.national_id}')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) >= 1

    def test_search_members_by_patient_name(self, sha_client, sample_sha_member):
        """Should search members by patient name."""
        patient_name = sample_sha_member.patient.first_name
        response = sha_client.get(f'/api/sha/members/search/?patient_name={patient_name}')

        assert response.status_code == status.HTTP_200_OK

    def test_search_tariffs_by_code(self, sha_client, sample_sha_tariff):
        """Should search tariffs by code."""
        response = sha_client.get(f'/api/sha/tariffs/search/?code={sample_sha_tariff.code}')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) >= 1

    def test_search_tariffs_by_name(self, sha_client, sample_sha_tariff):
        """Should search tariffs by name."""
        response = sha_client.get('/api/sha/tariffs/search/?q=Consultation')

        assert response.status_code == status.HTTP_200_OK

    def test_search_returns_empty_for_no_match(self, sha_client):
        """Should return empty results for non-matching search."""
        response = sha_client.get('/api/sha/members/search/?sha_number=SHA-NONEXISTENT')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 0


# =============================================================================
# Test Class: Error Responses (400, 401, 403, 404)
# =============================================================================


@pytest.mark.django_db
class TestSHAAPIErrorResponses:
    """Test appropriate error responses."""

    def test_404_for_nonexistent_member(self, sha_client):
        """Should return 404 for nonexistent SHA member."""
        response = sha_client.get('/api/sha/members/99999/')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_404_for_nonexistent_tariff(self, sha_client):
        """Should return 404 for nonexistent SHA tariff."""
        response = sha_client.get('/api/sha/tariffs/99999/')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_404_for_nonexistent_claim(self, sha_client):
        """Should return 404 for nonexistent SHA claim."""
        response = sha_client.get('/api/sha/claims/99999/')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_400_for_invalid_member_data(self, sha_client, sample_patient):
        """Should return 400 for invalid member creation data."""
        data = {
            'patient': sample_patient.id,
            'sha_number': 'INVALID',  # Should start with SHA-
            'national_id': '12345678',
        }
        response = sha_client.post('/api/sha/members/', data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'sha_number' in response.data

    def test_400_for_missing_required_fields(self, sha_client):
        """Should return 400 for missing required fields."""
        response = sha_client.post('/api/sha/members/', {})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_400_for_duplicate_sha_number(self, sha_client, sample_sha_member, sample_patient):
        """Should return 400 for duplicate SHA number."""
        # Create another patient for the new member
        from hmis.apps.patients.models import Patient
        from hmis.apps.core.models import County, SubCounty

        county = County.objects.first()
        sub_county = SubCounty.objects.filter(county=county).first()

        new_patient = Patient.objects.create(
            first_name='Another',
            last_name='Patient',
            date_of_birth=date(1990, 1, 1),
            gender='F',
            county=county,
            sub_county=sub_county,
            registered_by=sha_client.handler._force_user,
        )

        data = {
            'patient': new_patient.id,
            'sha_number': sample_sha_member.sha_number,  # Duplicate
            'national_id': '87654321',
            'membership_type': 'principal',
        }
        response = sha_client.post('/api/sha/members/', data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# Test Class: SHA Member Registration with Patient Linkage
# =============================================================================


@pytest.mark.django_db
class TestSHAMemberRegistration:
    """Test SHA member registration with patient linkage."""

    def test_create_sha_member_success(self, sha_client, sample_patient):
        """Should create SHA member linked to patient."""
        data = {
            'patient': sample_patient.id,
            'sha_number': 'SHA-9876543210',
            'national_id': '87654321',
            'membership_type': 'principal',
        }
        response = sha_client.post('/api/sha/members/', data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['sha_number'] == 'SHA-9876543210'
        assert response.data['patient'] == sample_patient.id
        assert response.data['status'] == 'pending_verification'

    def test_create_dependent_member(self, sha_client, sample_patient, sample_sha_member):
        """Should create dependent member with principal reference."""
        # Create another patient for dependent
        from hmis.apps.patients.models import Patient
        from hmis.apps.core.models import County, SubCounty

        county = County.objects.first()
        sub_county = SubCounty.objects.filter(county=county).first()

        dependent_patient = Patient.objects.create(
            first_name='Dependent',
            last_name='Member',
            date_of_birth=date(2010, 1, 1),
            gender='M',
            county=county,
            sub_county=sub_county,
            registered_by=sha_client.handler._force_user,
        )

        data = {
            'patient': dependent_patient.id,
            'sha_number': 'SHA-DEP-0000001',
            'national_id': '',  # Dependents may not have national ID
            'membership_type': 'child',
            'principal_sha_number': sample_sha_member.sha_number,
        }
        response = sha_client.post('/api/sha/members/', data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['membership_type'] == 'child'

    def test_member_includes_patient_details(self, sha_client, sample_sha_member):
        """Should include patient details in member response."""
        response = sha_client.get(f'/api/sha/members/{sample_sha_member.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert 'patient' in response.data
        # Patient details should be nested or accessible
        assert 'patient_name' in response.data or isinstance(response.data['patient'], dict)


# =============================================================================
# Test Class: Eligibility Verification API (Mocked)
# =============================================================================


@pytest.mark.django_db
class TestEligibilityVerificationAPI:
    """Test eligibility verification endpoint with mocked SHA API."""

    @patch('hmis.apps.billing.services.sha_eligibility.SHAEligibilityService.check_eligibility')
    def test_verify_eligibility_success(self, mock_check, sha_client, sample_sha_member):
        """Should verify eligibility and return result."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        # Mock the eligibility check result
        mock_result = MagicMock(spec=SHAEligibilityCheck)
        mock_result.is_eligible = True
        mock_result.result = 'eligible'
        mock_result.eligible_until = date.today() + timedelta(days=365)
        mock_result.benefit_balance = Decimal('50000.00')
        mock_check.return_value = mock_result

        response = sha_client.post(f'/api/sha/members/{sample_sha_member.id}/verify/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['is_eligible'] is True

    @patch('hmis.apps.billing.services.sha_eligibility.SHAEligibilityService.check_eligibility')
    def test_verify_eligibility_ineligible(self, mock_check, sha_client, sample_sha_member):
        """Should return ineligible status when member not eligible."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        mock_result = MagicMock(spec=SHAEligibilityCheck)
        mock_result.is_eligible = False
        mock_result.result = 'ineligible'
        mock_result.ineligibility_reason = 'Coverage expired'
        mock_check.return_value = mock_result

        response = sha_client.post(f'/api/sha/members/{sample_sha_member.id}/verify/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['is_eligible'] is False

    @patch('hmis.apps.billing.services.sha_eligibility.SHAEligibilityService.check_eligibility')
    def test_verify_eligibility_api_error(self, mock_check, sha_client, sample_sha_member):
        """Should handle SHA API errors gracefully."""
        from hmis.apps.billing.models import SHAEligibilityCheck

        mock_result = MagicMock(spec=SHAEligibilityCheck)
        mock_result.result = 'error'
        mock_result.error_code = 'API_TIMEOUT'
        mock_result.error_message = 'Connection timeout'
        mock_check.return_value = mock_result

        response = sha_client.post(f'/api/sha/members/{sample_sha_member.id}/verify/')

        assert response.status_code in [status.HTTP_200_OK, status.HTTP_503_SERVICE_UNAVAILABLE]


# =============================================================================
# Test Class: Claim Creation from Encounter
# =============================================================================


@pytest.mark.django_db
class TestClaimCreation:
    """Test claim creation from encounter."""

    def test_create_claim_from_encounter(self, sha_client, sample_sha_member, sample_encounter):
        """Should create claim from encounter."""
        data = {
            'patient': sample_sha_member.patient.id,
            'sha_member': sample_sha_member.id,
            'encounter': sample_encounter.id,
            'claim_type': 'outpatient',
            'service_date': date.today().isoformat(),
            'primary_diagnosis_code': 'J06.9',
            'primary_diagnosis_description': 'Acute upper respiratory infection',
            'facility_code': 'TEST-001',
            'facility_level': 'L3',
        }
        response = sha_client.post('/api/sha/claims/', data)

        assert response.status_code == status.HTTP_201_CREATED
        assert 'claim_number' in response.data
        assert response.data['claim_number'].startswith('CLM-')
        assert response.data['status'] == 'draft'

    def test_create_claim_auto_generates_claim_number(
        self, sha_client, sample_sha_member, sample_encounter
    ):
        """Should auto-generate unique claim number."""
        data = {
            'patient': sample_sha_member.patient.id,
            'sha_member': sample_sha_member.id,
            'encounter': sample_encounter.id,
            'claim_type': 'outpatient',
            'service_date': date.today().isoformat(),
            'primary_diagnosis_code': 'J06.9',
            'primary_diagnosis_description': 'Test',
            'facility_code': 'TEST-001',
            'facility_level': 'L3',
        }

        response1 = sha_client.post('/api/sha/claims/', data)
        response2 = sha_client.post('/api/sha/claims/', data)

        assert response1.status_code == status.HTTP_201_CREATED
        assert response2.status_code == status.HTTP_201_CREATED
        assert response1.data['claim_number'] != response2.data['claim_number']

    def test_create_inpatient_claim_requires_admission_date(
        self, sha_client, sample_sha_member, sample_encounter
    ):
        """Should require admission date for inpatient claims."""
        data = {
            'patient': sample_sha_member.patient.id,
            'sha_member': sample_sha_member.id,
            'encounter': sample_encounter.id,
            'claim_type': 'inpatient',
            'service_date': date.today().isoformat(),
            'primary_diagnosis_code': 'J06.9',
            'primary_diagnosis_description': 'Test',
            'facility_code': 'TEST-001',
            'facility_level': 'L3',
            # Missing admission_date
        }
        response = sha_client.post('/api/sha/claims/', data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'admission_date' in str(response.data).lower()


# =============================================================================
# Test Class: Claim Item CRUD Operations
# =============================================================================


@pytest.mark.django_db
class TestClaimItemCRUD:
    """Test claim item CRUD operations."""

    def test_list_claim_items(self, sha_client, sample_claim_with_items):
        """Should list items for a claim."""
        response = sha_client.get(f'/api/sha/claims/{sample_claim_with_items.id}/items/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_add_claim_item(self, sha_client, sample_sha_claim, sample_sha_tariff):
        """Should add item to claim."""
        data = {
            'tariff': sample_sha_tariff.id,
            'description': 'Test Service',
            'service_date': date.today().isoformat(),
            'quantity': '1.00',
            'unit_price': str(sample_sha_tariff.sha_amount),
        }
        response = sha_client.post(
            f'/api/sha/claims/{sample_sha_claim.id}/items/',
            data,
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['description'] == 'Test Service'

    def test_add_item_updates_claim_total(self, sha_client, sample_sha_claim, sample_sha_tariff):
        """Should update claim total when item is added."""
        initial_amount = sample_sha_claim.claimed_amount

        data = {
            'tariff': sample_sha_tariff.id,
            'description': 'Test Service',
            'service_date': date.today().isoformat(),
            'quantity': '1.00',
            'unit_price': '500.00',
        }
        response = sha_client.post(
            f'/api/sha/claims/{sample_sha_claim.id}/items/',
            data,
        )

        assert response.status_code == status.HTTP_201_CREATED

        # Check claim total was updated
        sample_sha_claim.refresh_from_db()
        assert sample_sha_claim.claimed_amount > initial_amount

    def test_reject_item_exceeding_tariff_max_quantity(
        self, sha_client, sample_sha_claim, sample_sha_tariff
    ):
        """Should reject item quantity exceeding tariff maximum."""
        # Tariff has max_quantity_per_claim = 1
        data = {
            'tariff': sample_sha_tariff.id,
            'description': 'Test Service',
            'service_date': date.today().isoformat(),
            'quantity': '10.00',  # Exceeds max
            'unit_price': '500.00',
        }
        response = sha_client.post(
            f'/api/sha/claims/{sample_sha_claim.id}/items/',
            data,
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'quantity' in str(response.data).lower()


# =============================================================================
# Test Class: Attachment Upload with Validation
# =============================================================================


@pytest.mark.django_db
class TestAttachmentUpload:
    """Test attachment upload with validation."""

    def test_list_claim_attachments(self, sha_client, sample_claim_with_items):
        """Should list attachments for a claim."""
        response = sha_client.get(f'/api/sha/claims/{sample_claim_with_items.id}/attachments/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 2  # Should have clinical_notes and invoice

    def test_upload_pdf_attachment(self, sha_client, sample_sha_claim):
        """Should upload PDF attachment successfully."""
        pdf_content = b'%PDF-1.4 test pdf content'
        file = SimpleUploadedFile(
            name='test_document.pdf',
            content=pdf_content,
            content_type='application/pdf',
        )

        response = sha_client.post(
            f'/api/sha/claims/{sample_sha_claim.id}/attachments/',
            {
                'attachment_type': 'clinical_notes',
                'name': 'Clinical Notes',
                'file': file,
            },
            format='multipart',
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['attachment_type'] == 'clinical_notes'

    def test_upload_jpeg_attachment(self, sha_client, sample_sha_claim):
        """Should upload JPEG image attachment successfully."""
        # Minimal JPEG header
        jpeg_content = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00' + b'\x00' * 100
        file = SimpleUploadedFile(
            name='scan.jpg',
            content=jpeg_content,
            content_type='image/jpeg',
        )

        response = sha_client.post(
            f'/api/sha/claims/{sample_sha_claim.id}/attachments/',
            {
                'attachment_type': 'id_copy',
                'name': 'ID Copy',
                'file': file,
            },
            format='multipart',
        )

        assert response.status_code == status.HTTP_201_CREATED

    def test_reject_invalid_file_type(self, sha_client, sample_sha_claim):
        """Should reject invalid file types."""
        file = SimpleUploadedFile(
            name='document.exe',
            content=b'MZ executable content',
            content_type='application/x-msdownload',
        )

        response = sha_client.post(
            f'/api/sha/claims/{sample_sha_claim.id}/attachments/',
            {
                'attachment_type': 'other',
                'name': 'Bad File',
                'file': file,
            },
            format='multipart',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_reject_oversized_file(self, sha_client, sample_sha_claim):
        """Should reject files larger than 10MB."""
        # Create file larger than 10MB
        large_content = b'x' * (11 * 1024 * 1024)
        file = SimpleUploadedFile(
            name='large_file.pdf',
            content=large_content,
            content_type='application/pdf',
        )

        response = sha_client.post(
            f'/api/sha/claims/{sample_sha_claim.id}/attachments/',
            {
                'attachment_type': 'other',
                'name': 'Large File',
                'file': file,
            },
            format='multipart',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# Test Class: Claim Validation Endpoint
# =============================================================================


@pytest.mark.django_db
class TestClaimValidation:
    """Test claim validation endpoint."""

    def test_validate_valid_claim(self, sha_client, sample_claim_with_items):
        """Should validate a claim ready for submission."""
        # Ensure member is eligible
        sample_claim_with_items.sha_member.status = 'active'
        sample_claim_with_items.sha_member.coverage_end_date = date.today() + timedelta(days=30)
        sample_claim_with_items.sha_member.save()

        response = sha_client.post(f'/api/sha/claims/{sample_claim_with_items.id}/validate/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['is_valid'] is True
        assert len(response.data.get('errors', [])) == 0

    def test_validate_claim_without_items(self, sha_client, sample_sha_claim):
        """Should fail validation for claim without items."""
        response = sha_client.post(f'/api/sha/claims/{sample_sha_claim.id}/validate/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['is_valid'] is False
        assert any('item' in e.lower() for e in response.data['errors'])

    def test_validate_claim_with_ineligible_member(self, sha_client, sample_claim_with_items):
        """Should fail validation for ineligible member."""
        # Make member ineligible
        sample_claim_with_items.sha_member.status = 'expired'
        sample_claim_with_items.sha_member.save()

        response = sha_client.post(f'/api/sha/claims/{sample_claim_with_items.id}/validate/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['is_valid'] is False
        assert any('eligible' in e.lower() for e in response.data['errors'])


# =============================================================================
# Test Class: Claim Submission Workflow
# =============================================================================


@pytest.mark.django_db
class TestClaimSubmission:
    """Test claim submission workflow."""

    @patch('hmis.apps.billing.services.sha_claims.SHAClaimsService._submit_to_sha_api')
    @patch('hmis.apps.billing.services.sha_claims.ConnectivityChecker')
    def test_submit_valid_claim(self, mock_connectivity, mock_submit_api, sha_client, sample_claim_with_items):
        """Should submit a valid claim."""
        # Mock connectivity as online
        mock_connectivity_instance = MagicMock()
        mock_connectivity_instance.check.return_value = True
        mock_connectivity.return_value = mock_connectivity_instance

        # Mock successful SHA API submission
        mock_submit_api.return_value = {
            'success': True,
            'sha_reference': 'SHA-REF-12345',
            'message': 'Claim submitted successfully',
        }

        # Ensure member is eligible
        sample_claim_with_items.sha_member.status = 'active'
        sample_claim_with_items.sha_member.coverage_end_date = date.today() + timedelta(days=30)
        sample_claim_with_items.sha_member.save()

        response = sha_client.post(f'/api/sha/claims/{sample_claim_with_items.id}/submit/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == 'submitted'
        assert 'submitted_at' in response.data

    @patch('hmis.apps.billing.services.sha_claims.SHAClaimsService._submit_to_sha_api')
    @patch('hmis.apps.billing.services.sha_claims.ConnectivityChecker')
    def test_submit_updates_timestamps(self, mock_connectivity, mock_submit_api, sha_client, sample_claim_with_items):
        """Should update submission timestamps."""
        # Mock connectivity as online
        mock_connectivity_instance = MagicMock()
        mock_connectivity_instance.check.return_value = True
        mock_connectivity.return_value = mock_connectivity_instance

        # Mock successful SHA API submission
        mock_submit_api.return_value = {
            'success': True,
            'sha_reference': 'SHA-REF-12345',
            'message': 'Claim submitted successfully',
        }

        # Ensure member is eligible
        sample_claim_with_items.sha_member.status = 'active'
        sample_claim_with_items.sha_member.coverage_end_date = date.today() + timedelta(days=30)
        sample_claim_with_items.sha_member.save()

        response = sha_client.post(f'/api/sha/claims/{sample_claim_with_items.id}/submit/')

        assert response.status_code == status.HTTP_200_OK

        sample_claim_with_items.refresh_from_db()
        assert sample_claim_with_items.submitted_at is not None
        assert sample_claim_with_items.submitted_by is not None

    def test_cannot_submit_invalid_claim(self, sha_client, sample_sha_claim):
        """Should reject submission of invalid claim."""
        # Claim has no items
        response = sha_client.post(f'/api/sha/claims/{sample_sha_claim.id}/submit/')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_cannot_submit_already_submitted_claim(self, sha_client, sample_claim_with_items):
        """Should reject re-submission of already submitted claim."""
        from hmis.apps.billing.models import SHAClaim

        # Mark as already submitted
        sample_claim_with_items.status = SHAClaim.ClaimStatus.SUBMITTED
        sample_claim_with_items.save()

        response = sha_client.post(f'/api/sha/claims/{sample_claim_with_items.id}/submit/')

        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# Test Class: Appeal Creation from Rejected Claim
# =============================================================================


@pytest.mark.django_db
class TestClaimAppeal:
    """Test appeal creation from rejected claim."""

    def test_create_appeal_from_rejected_claim(self, sha_client, sample_claim_with_items):
        """Should create appeal from rejected claim."""
        from hmis.apps.billing.models import SHAClaim

        # Mark claim as rejected
        sample_claim_with_items.status = SHAClaim.ClaimStatus.REJECTED
        sample_claim_with_items.rejection_reason = 'Missing documentation'
        sample_claim_with_items.save()

        response = sha_client.post(
            f'/api/sha/claims/{sample_claim_with_items.id}/appeal/',
            {'reason': 'Documentation has been provided'},
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['version'] == 2
        assert response.data['parent_claim'] == sample_claim_with_items.id

    def test_appeal_copies_claim_items(self, sha_client, sample_claim_with_items):
        """Should copy items to appeal claim."""
        from hmis.apps.billing.models import SHAClaim

        original_item_count = sample_claim_with_items.items.count()

        # Mark claim as rejected
        sample_claim_with_items.status = SHAClaim.ClaimStatus.REJECTED
        sample_claim_with_items.save()

        response = sha_client.post(
            f'/api/sha/claims/{sample_claim_with_items.id}/appeal/',
            {'reason': 'Appeal reason'},
        )

        assert response.status_code == status.HTTP_201_CREATED

        # Check new claim has same number of items
        new_claim = SHAClaim.objects.get(id=response.data['id'])
        assert new_claim.items.count() == original_item_count

    def test_cannot_appeal_non_rejected_claim(self, sha_client, sample_sha_claim):
        """Should reject appeal of non-rejected/non-partially-approved claim."""
        response = sha_client.post(
            f'/api/sha/claims/{sample_sha_claim.id}/appeal/',
            {'reason': 'Appeal reason'},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_appeal_partially_approved_claim(self, sha_client, sample_claim_with_items):
        """Should allow appeal of partially approved claim."""
        from hmis.apps.billing.models import SHAClaim

        sample_claim_with_items.status = SHAClaim.ClaimStatus.PARTIALLY_APPROVED
        sample_claim_with_items.save()

        response = sha_client.post(
            f'/api/sha/claims/{sample_claim_with_items.id}/appeal/',
            {'reason': 'Appeal for full approval'},
        )

        assert response.status_code == status.HTTP_201_CREATED


# =============================================================================
# Test Class: Dashboard Statistics Aggregation
# =============================================================================


@pytest.mark.django_db
class TestClaimsDashboard:
    """Test claims dashboard statistics aggregation."""

    def test_dashboard_returns_statistics(self, sha_client, multiple_sha_claims):
        """Should return dashboard statistics."""
        response = sha_client.get('/api/sha/claims/dashboard/')

        assert response.status_code == status.HTTP_200_OK
        assert 'total_claims' in response.data
        assert 'total_claimed_amount' in response.data
        assert 'claims_by_status' in response.data

    def test_dashboard_status_breakdown(self, sha_client, multiple_sha_claims):
        """Should include claims count by status."""
        response = sha_client.get('/api/sha/claims/dashboard/')

        assert response.status_code == status.HTTP_200_OK
        assert 'claims_by_status' in response.data
        assert isinstance(response.data['claims_by_status'], dict)

    def test_dashboard_claim_type_breakdown(self, sha_client, multiple_sha_claims):
        """Should include claims count by type."""
        response = sha_client.get('/api/sha/claims/dashboard/')

        assert response.status_code == status.HTTP_200_OK
        assert 'claims_by_type' in response.data

    def test_dashboard_date_filter(self, sha_client, multiple_sha_claims):
        """Should filter dashboard by date range."""
        start_date = (date.today() - timedelta(days=7)).isoformat()
        end_date = date.today().isoformat()

        response = sha_client.get(
            f'/api/sha/claims/dashboard/?from_date={start_date}&to_date={end_date}'
        )

        assert response.status_code == status.HTTP_200_OK


# =============================================================================
# Test Class: Export Functionality (CSV, Excel)
# =============================================================================


@pytest.mark.django_db
class TestClaimsExport:
    """Test claims export functionality."""

    def test_export_claims_csv(self, sha_client, multiple_sha_claims):
        """Should export claims as CSV."""
        response = sha_client.get('/api/sha/claims/export/?format=csv')

        assert response.status_code == status.HTTP_200_OK
        assert response['Content-Type'] == 'text/csv'
        assert 'attachment' in response.get('Content-Disposition', '')

    def test_export_claims_excel(self, sha_client, multiple_sha_claims):
        """Should export claims as Excel."""
        response = sha_client.get('/api/sha/claims/export/?format=xlsx')

        assert response.status_code == status.HTTP_200_OK
        assert 'spreadsheet' in response['Content-Type'] or 'excel' in response['Content-Type'].lower()

    def test_export_with_date_filter(self, sha_client, multiple_sha_claims):
        """Should filter exports by date range."""
        start_date = (date.today() - timedelta(days=30)).isoformat()
        end_date = date.today().isoformat()

        response = sha_client.get(
            f'/api/sha/claims/export/?format=csv&from_date={start_date}&to_date={end_date}'
        )

        assert response.status_code == status.HTTP_200_OK

    def test_export_with_status_filter(self, sha_client, multiple_sha_claims):
        """Should filter exports by status."""
        response = sha_client.get('/api/sha/claims/export/?format=csv&status=draft')

        assert response.status_code == status.HTTP_200_OK


# =============================================================================
# Test Class: Offline Sync Compatibility
# =============================================================================


@pytest.mark.django_db
class TestOfflineSyncCompatibility:
    """Test offline sync compatibility for SHA endpoints."""

    def test_claims_include_sync_metadata(self, sha_client, sample_sha_claim):
        """Should include sync-related metadata in responses."""
        response = sha_client.get(f'/api/sha/claims/{sample_sha_claim.id}/')

        assert response.status_code == status.HTTP_200_OK
        # Should include timestamps for sync
        assert 'created_at' in response.data
        assert 'updated_at' in response.data

    def test_members_include_sync_metadata(self, sha_client, sample_sha_member):
        """Should include sync-related metadata for members."""
        response = sha_client.get(f'/api/sha/members/{sample_sha_member.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert 'created_at' in response.data or 'updated_at' in response.data

    def test_tariffs_include_effective_dates(self, sha_client, sample_sha_tariff):
        """Should include effective dates for tariff sync."""
        response = sha_client.get(f'/api/sha/tariffs/{sample_sha_tariff.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert 'effective_date' in response.data
        assert 'is_active' in response.data

    def test_list_supports_modified_since_filter(self, sha_client, multiple_sha_claims):
        """Should support filtering by modification date for incremental sync."""
        modified_since = (date.today() - timedelta(days=1)).isoformat()

        response = sha_client.get(f'/api/sha/claims/?modified_since={modified_since}')

        assert response.status_code == status.HTTP_200_OK


# =============================================================================
# Test Class: Offline Claim Queuing
# =============================================================================


@pytest.mark.django_db
class TestOfflineClaimQueuing:
    """Test offline claim queuing functionality."""

    def test_claim_queued_when_offline(self, sha_client, sample_claim_with_items):
        """Should queue claim for submission when offline."""
        # sample_claim_with_items is already validated
        sample_sha_claim = sample_claim_with_items
        sample_sha_claim.status = 'validated'
        sample_sha_claim.save()
        
        # Mock connectivity checker to return offline
        with patch('hmis.apps.billing.services.sha_claims.ConnectivityChecker') as MockChecker:
            mock_instance = MagicMock()
            mock_instance.check.return_value = False  # Offline
            MockChecker.return_value = mock_instance
            
            response = sha_client.post(f'/api/sha/claims/{sample_sha_claim.id}/submit/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data.get('status') == 'queued'
        assert 'queue_entry_id' in response.data
        assert response.data.get('claim_number') == sample_sha_claim.claim_number
        
        # Verify claim status updated
        sample_sha_claim.refresh_from_db()
        assert sample_sha_claim.status == 'pending_submission'
        assert sample_sha_claim.submission_response.get('queued') is True

    def test_claim_submitted_when_online(self, sha_client, sample_claim_with_items):
        """Should submit claim directly when online."""
        sample_sha_claim = sample_claim_with_items
        sample_sha_claim.status = 'validated'
        sample_sha_claim.save()
        
        # Mock connectivity checker to return online
        with patch('hmis.apps.billing.services.sha_claims.ConnectivityChecker') as MockChecker, \
             patch('hmis.apps.billing.services.sha_claims.SHAClaimsService._submit_to_sha_api') as mock_submit:
            mock_instance = MagicMock()
            mock_instance.check.return_value = True  # Online
            MockChecker.return_value = mock_instance
            
            mock_submit.return_value = {
                'claim_reference': 'SHA-REF-12345',
                'status': 'received',
            }
            
            response = sha_client.post(f'/api/sha/claims/{sample_sha_claim.id}/submit/')
        
        assert response.status_code == status.HTTP_200_OK
        # Should NOT be queued - submitted directly
        assert response.data.get('status') != 'queued'
        
        # Verify claim submitted
        sample_sha_claim.refresh_from_db()
        assert sample_sha_claim.status == 'submitted'

    def test_force_online_fails_when_offline(self, sha_client, sample_claim_with_items):
        """Should fail with force_online=True when offline."""
        sample_sha_claim = sample_claim_with_items
        sample_sha_claim.status = 'validated'
        sample_sha_claim.save()
        
        # Mock connectivity checker to return offline
        with patch('hmis.apps.billing.services.sha_claims.ConnectivityChecker') as MockChecker:
            mock_instance = MagicMock()
            mock_instance.check.return_value = False  # Offline
            MockChecker.return_value = mock_instance
            
            response = sha_client.post(
                f'/api/sha/claims/{sample_sha_claim.id}/submit/',
                {'force_online': True}
            )
        
        # Should fail since we're offline and force_online=True
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_sync_queue_entry_created_on_offline_submission(
        self, sha_client, sample_claim_with_items
    ):
        """Should create SyncQueue entry when claim queued offline."""
        from hmis.apps.core.models import SyncQueue
        
        sample_sha_claim = sample_claim_with_items
        sample_sha_claim.status = 'validated'
        sample_sha_claim.save()
        
        initial_queue_count = SyncQueue.objects.filter(
            model_name='SHAClaimSubmission'
        ).count()
        
        with patch('hmis.apps.billing.services.sha_claims.ConnectivityChecker') as MockChecker:
            mock_instance = MagicMock()
            mock_instance.check.return_value = False  # Offline
            MockChecker.return_value = mock_instance
            
            sha_client.post(f'/api/sha/claims/{sample_sha_claim.id}/submit/')
        
        final_queue_count = SyncQueue.objects.filter(
            model_name='SHAClaimSubmission'
        ).count()
        
        assert final_queue_count == initial_queue_count + 1
        
        # Verify queue entry data
        queue_entry = SyncQueue.objects.filter(
            model_name='SHAClaimSubmission'
        ).latest('created_at')
        
        assert queue_entry.status == 'PENDING'
        assert queue_entry.data.get('claim_id') == sample_sha_claim.id

    def test_network_error_triggers_offline_queue(
        self, sha_client, sample_claim_with_items
    ):
        """Should queue claim when network error occurs during submission."""
        import requests
        
        sample_sha_claim = sample_claim_with_items
        sample_sha_claim.status = 'validated'
        sample_sha_claim.save()
        
        # Mock connectivity as online but submission fails with network error
        with patch('hmis.apps.billing.services.sha_claims.ConnectivityChecker') as MockChecker, \
             patch('hmis.apps.billing.services.sha_claims.SHAClaimsService._submit_to_sha_api') as mock_submit:
            mock_instance = MagicMock()
            mock_instance.check.return_value = True  # Online
            MockChecker.return_value = mock_instance
            
            # Simulate network error
            mock_submit.side_effect = requests.exceptions.ConnectionError("Network unreachable")
            
            response = sha_client.post(f'/api/sha/claims/{sample_sha_claim.id}/submit/')
        
        # Should be queued instead of failing
        assert response.status_code == status.HTTP_200_OK
        assert response.data.get('status') == 'queued'


@pytest.mark.django_db
class TestProcessQueuedClaims:
    """Test processing of queued claims when connectivity is restored."""

    def test_process_queued_claims_success(
        self, sha_client, sample_claim_with_items, user_with_sha_permissions
    ):
        """Should process queued claims when connectivity restored."""
        from hmis.apps.core.models import SyncQueue
        from hmis.apps.billing.services.sha_claims import SHAClaimsService
        
        sample_sha_claim = sample_claim_with_items
        sample_sha_claim.status = 'validated'
        sample_sha_claim.save()
        
        # First, queue the claim by simulating offline
        with patch('hmis.apps.billing.services.sha_claims.ConnectivityChecker') as MockChecker:
            mock_instance = MagicMock()
            mock_instance.check.return_value = False
            MockChecker.return_value = mock_instance
            
            sha_client.post(f'/api/sha/claims/{sample_sha_claim.id}/submit/')
        
        # Verify claim is queued
        sample_sha_claim.refresh_from_db()
        assert sample_sha_claim.status == 'pending_submission'
        
        # Now process queued claims (simulating connectivity restored)
        with patch.object(
            SHAClaimsService, '_submit_to_sha_api'
        ) as mock_submit, \
             patch('hmis.apps.billing.services.sha_claims.ConnectivityChecker') as MockChecker:
            mock_instance = MagicMock()
            mock_instance.check.return_value = True  # Back online
            MockChecker.return_value = mock_instance
            
            mock_submit.return_value = {
                'claim_reference': 'SHA-QUEUED-REF',
                'status': 'received',
            }
            
            service = SHAClaimsService()
            results = service.process_queued_claims()
        
        assert results['processed'] >= 1
        assert results['succeeded'] >= 1
        
        # Verify claim is now submitted
        sample_sha_claim.refresh_from_db()
        assert sample_sha_claim.status == 'submitted'
        assert sample_sha_claim.sha_claim_reference == 'SHA-QUEUED-REF'

    def test_process_queued_claims_marks_entry_synced(
        self, sha_client, sample_claim_with_items
    ):
        """Should mark queue entry as SYNCED after successful submission."""
        from hmis.apps.core.models import SyncQueue
        from hmis.apps.billing.services.sha_claims import SHAClaimsService
        
        sample_sha_claim = sample_claim_with_items
        sample_sha_claim.status = 'validated'
        sample_sha_claim.save()
        
        # Queue the claim
        with patch('hmis.apps.billing.services.sha_claims.ConnectivityChecker') as MockChecker:
            mock_instance = MagicMock()
            mock_instance.check.return_value = False
            MockChecker.return_value = mock_instance
            
            response = sha_client.post(f'/api/sha/claims/{sample_sha_claim.id}/submit/')
        
        queue_entry_id = response.data['queue_entry_id']
        
        # Process queued claims
        with patch.object(
            SHAClaimsService, '_submit_to_sha_api'
        ) as mock_submit, \
             patch('hmis.apps.billing.services.sha_claims.ConnectivityChecker') as MockChecker:
            mock_instance = MagicMock()
            mock_instance.check.return_value = True
            MockChecker.return_value = mock_instance
            
            mock_submit.return_value = {'claim_reference': 'REF', 'status': 'received'}
            
            SHAClaimsService().process_queued_claims()
        
        # Verify queue entry status
        queue_entry = SyncQueue.objects.get(id=queue_entry_id)
        assert queue_entry.status == 'SYNCED'
        assert queue_entry.synced_at is not None

    def test_process_failed_claim_increments_retry(
        self, sha_client, sample_claim_with_items
    ):
        """Should increment retry count on failed processing."""
        from hmis.apps.core.models import SyncQueue
        from hmis.apps.billing.services.sha_claims import SHAClaimsService
        
        sample_sha_claim = sample_claim_with_items
        sample_sha_claim.status = 'validated'
        sample_sha_claim.save()
        
        # Queue the claim
        with patch('hmis.apps.billing.services.sha_claims.ConnectivityChecker') as MockChecker:
            mock_instance = MagicMock()
            mock_instance.check.return_value = False
            MockChecker.return_value = mock_instance
            
            response = sha_client.post(f'/api/sha/claims/{sample_sha_claim.id}/submit/')
        
        queue_entry_id = response.data['queue_entry_id']
        
        # Process with failure
        with patch.object(
            SHAClaimsService, 'submit_claim'
        ) as mock_submit, \
             patch('hmis.apps.billing.services.sha_claims.ConnectivityChecker') as MockChecker:
            mock_submit.side_effect = Exception("API Error")
            
            SHAClaimsService().process_queued_claims()
        
        # Verify retry count incremented
        queue_entry = SyncQueue.objects.get(id=queue_entry_id)
        assert queue_entry.retry_count == 1
        assert queue_entry.status == 'PENDING'  # Still pending for retry


# =============================================================================
# Test Class: Tariff Endpoints
# =============================================================================


@pytest.mark.django_db
class TestTariffEndpoints:
    """Test SHA Tariff endpoints."""

    def test_list_tariffs(self, sha_client, sample_sha_tariff):
        """Should list all tariffs."""
        response = sha_client.get('/api/sha/tariffs/')

        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data

    def test_get_tariff_detail(self, sha_client, sample_sha_tariff):
        """Should get tariff detail."""
        response = sha_client.get(f'/api/sha/tariffs/{sample_sha_tariff.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['code'] == sample_sha_tariff.code
        assert response.data['name'] == sample_sha_tariff.name

    def test_tariffs_by_category_endpoint(self, sha_client, sample_sha_tariff):
        """Should return tariffs grouped by category."""
        response = sha_client.get('/api/sha/tariffs/by-category/')

        assert response.status_code == status.HTTP_200_OK
        # Should return categories with their tariffs
        assert isinstance(response.data, (list, dict))
