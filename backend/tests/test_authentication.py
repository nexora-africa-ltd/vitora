"""
Tests for JWT-based authentication system.

Following TDD approach: Write tests FIRST, then implement.
Sprint 0.4: Security Baseline
"""


import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status

User = get_user_model()


# ============================================================================
# Test Fixtures
# ============================================================================


# Note: Using fixtures from conftest.py (test_user, api_client, authenticated_client)


@pytest.fixture
def staff_user(db):
    """Create a staff user."""
    return User.objects.create_user(
        username="staffuser",
        email="staff@example.com",
        password="staffpassword123",
        first_name="Staff",
        last_name="User",
        is_staff=True,
    )


@pytest.fixture
def admin_user(db):
    """Create an admin user."""
    return User.objects.create_superuser(
        username="adminuser",
        email="admin@example.com",
        password="adminpassword123",
        first_name="Admin",
        last_name="User",
    )


# ============================================================================
# Token Obtain Tests
# ============================================================================


@pytest.mark.django_db
class TestTokenObtain:
    """Tests for obtaining JWT tokens."""

    def test_obtain_token_with_valid_credentials(self, api_client, test_user):
        """
        Test that a user can obtain JWT tokens with valid credentials.

        GIVEN a registered user with valid credentials
        WHEN the user submits username and password to the token endpoint
        THEN they should receive access and refresh tokens
        """
        url = reverse("token_obtain_pair")
        data = {"username": "testuser", "password": "testpassword123"}

        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert "access" in response.data
        assert "refresh" in response.data
        assert len(response.data["access"]) > 0
        assert len(response.data["refresh"]) > 0

    def test_obtain_token_with_invalid_password(self, api_client, test_user):
        """
        Test that token is not issued for invalid password.

        GIVEN a registered user
        WHEN the user submits wrong password
        THEN they should receive 401 Unauthorized
        """
        url = reverse("token_obtain_pair")
        data = {"username": "testuser", "password": "wrongpassword"}

        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert "access" not in response.data

    def test_obtain_token_with_nonexistent_user(self, api_client, db):
        """
        Test that token is not issued for non-existent user.

        GIVEN a non-existent username
        WHEN attempting to obtain tokens
        THEN should receive 401 Unauthorized
        """
        url = reverse("token_obtain_pair")
        data = {"username": "nonexistent", "password": "somepassword"}

        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_obtain_token_with_inactive_user(self, api_client, db):
        """
        Test that token is not issued for inactive users.

        GIVEN an inactive user account
        WHEN attempting to obtain tokens
        THEN should receive 401 Unauthorized
        """
        inactive_user = User.objects.create_user(
            username="inactiveuser",
            password="password123",
            is_active=False,
        )
        url = reverse("token_obtain_pair")
        data = {"username": "inactiveuser", "password": "password123"}

        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================================================
# Token Refresh Tests
# ============================================================================


@pytest.mark.django_db
class TestTokenRefresh:
    """Tests for refreshing JWT tokens."""

    def test_refresh_token_successfully(self, api_client, test_user):
        """
        Test that access token can be refreshed with valid refresh token.

        GIVEN a valid refresh token
        WHEN submitting to the refresh endpoint
        THEN should receive a new access token
        """
        # First obtain tokens
        obtain_url = reverse("token_obtain_pair")
        data = {"username": "testuser", "password": "testpassword123"}
        response = api_client.post(obtain_url, data, format="json")
        refresh_token = response.data["refresh"]

        # Now refresh
        refresh_url = reverse("token_refresh")
        response = api_client.post(refresh_url, {"refresh": refresh_token}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert "access" in response.data

    def test_refresh_token_with_invalid_token(self, api_client, db):
        """
        Test that refresh fails with invalid token.

        GIVEN an invalid refresh token
        WHEN attempting to refresh
        THEN should receive 401 Unauthorized
        """
        refresh_url = reverse("token_refresh")
        response = api_client.post(refresh_url, {"refresh": "invalidtoken"}, format="json")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================================================
# Token Verification Tests
# ============================================================================


@pytest.mark.django_db
class TestTokenVerify:
    """Tests for verifying JWT tokens."""

    def test_verify_valid_token(self, api_client, test_user):
        """
        Test that a valid token can be verified.

        GIVEN a valid access token
        WHEN submitting to the verify endpoint
        THEN should receive 200 OK
        """
        # First obtain tokens
        obtain_url = reverse("token_obtain_pair")
        data = {"username": "testuser", "password": "testpassword123"}
        response = api_client.post(obtain_url, data, format="json")
        access_token = response.data["access"]

        # Now verify
        verify_url = reverse("token_verify")
        response = api_client.post(verify_url, {"token": access_token}, format="json")

        assert response.status_code == status.HTTP_200_OK

    def test_verify_invalid_token(self, api_client, db):
        """
        Test that an invalid token fails verification.

        GIVEN an invalid access token
        WHEN submitting to the verify endpoint
        THEN should receive 401 Unauthorized
        """
        verify_url = reverse("token_verify")
        response = api_client.post(verify_url, {"token": "invalidtoken"}, format="json")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================================================
# Authentication Required Tests
# ============================================================================


@pytest.mark.django_db
class TestAuthenticationRequired:
    """Tests for endpoints requiring authentication."""

    def test_access_protected_endpoint_without_token(self, api_client, db):
        """
        Test that protected endpoints reject unauthenticated requests.

        GIVEN no authentication token
        WHEN accessing a protected endpoint
        THEN should receive 401 Unauthorized
        """
        url = reverse("patient-list")
        response = api_client.get(url)

        # This test will fail until we enable authentication on endpoints
        # Initially returns 200 because AllowAny is set
        # After implementing security, should return 401
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_access_protected_endpoint_with_valid_token(self, api_client, test_user):
        """
        Test that authenticated requests can access protected endpoints.

        GIVEN a valid access token
        WHEN accessing a protected endpoint
        THEN should receive 200 OK
        """
        # Obtain token
        obtain_url = reverse("token_obtain_pair")
        data = {"username": "testuser", "password": "testpassword123"}
        response = api_client.post(obtain_url, data, format="json")
        access_token = response.data["access"]

        # Access protected endpoint with token
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        url = reverse("patient-list")
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK

    def test_access_with_expired_token(self, api_client, test_user, settings):
        """
        Test that expired tokens are rejected.

        GIVEN an expired access token
        WHEN accessing a protected endpoint
        THEN should receive 401 Unauthorized

        Note: This test requires token to expire, which may need special handling
        """
        # This test is documented for implementation but may need mocking
        # for actual token expiry testing
        pass


# ============================================================================
# User Session Tests
# ============================================================================


@pytest.mark.django_db
class TestUserSession:
    """Tests for user session management."""

    def test_token_contains_user_info(self, api_client, test_user):
        """
        Test that token payload contains user information.

        GIVEN a valid user
        WHEN obtaining a token
        THEN the token should contain user_id claim
        """
        import jwt

        obtain_url = reverse("token_obtain_pair")
        data = {"username": "testuser", "password": "testpassword123"}
        response = api_client.post(obtain_url, data, format="json")

        # Decode token without verification to check claims
        access_token = response.data["access"]
        # The token contains user_id by default in simplejwt
        decoded = jwt.decode(access_token, options={"verify_signature": False})

        assert "user_id" in decoded
        # JWT stores user_id as string, so convert to int for comparison
        assert int(decoded["user_id"]) == test_user.id

    def test_user_can_have_multiple_sessions(self, api_client, test_user):
        """
        Test that a user can have multiple valid sessions.

        GIVEN a valid user
        WHEN obtaining tokens multiple times
        THEN all tokens should be valid
        """
        obtain_url = reverse("token_obtain_pair")
        data = {"username": "testuser", "password": "testpassword123"}

        # Obtain first token
        response1 = api_client.post(obtain_url, data, format="json")
        token1 = response1.data["access"]

        # Obtain second token
        response2 = api_client.post(obtain_url, data, format="json")
        token2 = response2.data["access"]

        # Both tokens should be different but valid
        assert token1 != token2

        # Verify both tokens work
        verify_url = reverse("token_verify")
        assert api_client.post(verify_url, {"token": token1}).status_code == status.HTTP_200_OK
        assert api_client.post(verify_url, {"token": token2}).status_code == status.HTTP_200_OK


# ============================================================================
# Password Security Tests
# ============================================================================


@pytest.mark.django_db
class TestPasswordSecurity:
    """Tests for password security requirements."""

    def test_password_is_hashed(self, db):
        """
        Test that user passwords are properly hashed.

        GIVEN a user with a password
        WHEN checking the stored password
        THEN it should be hashed, not plaintext
        """
        user = User.objects.create_user(
            username="hashtest",
            password="plaintextpassword",
        )

        # Password should not be stored as plaintext
        assert user.password != "plaintextpassword"
        # Accept various hashers (md5 in tests, pbkdf2/argon2 in production)
        assert (
            user.password.startswith("pbkdf2_sha256$")
            or user.password.startswith("argon2")
            or user.password.startswith("md5$")  # Test environment uses MD5 for speed
        )

    def test_password_check_works(self, test_user):
        """
        Test that password checking works correctly.

        GIVEN a user with a known password
        WHEN checking the password
        THEN correct password should return True, wrong should return False
        """
        assert test_user.check_password("testpassword123") is True
        assert test_user.check_password("wrongpassword") is False


# ============================================================================
# Security Headers Tests
# ============================================================================


@pytest.mark.django_db
class TestSecurityHeaders:
    """Tests for security headers in responses."""

    def test_response_has_security_headers(self, api_client, test_user):
        """
        Test that API responses include security headers.

        GIVEN an authenticated request
        WHEN receiving a response
        THEN response should include security headers
        """
        api_client.force_authenticate(user=test_user)
        url = reverse("patient-list")
        response = api_client.get(url)

        # These headers are set in Django settings
        # X-Frame-Options should be DENY
        assert response.get("X-Frame-Options") == "DENY"
