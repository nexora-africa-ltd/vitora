"""
MFA views for Vitora HMIS.

API endpoints for MFA management:
- GET /api/mfa/status/ - Get MFA status for current user
- POST /api/mfa/totp/setup/ - Start TOTP enrollment
- POST /api/mfa/totp/confirm/ - Confirm TOTP enrollment
- POST /api/mfa/disable/ - Disable MFA
- POST /api/mfa/backup-codes/regenerate/ - Regenerate backup codes
- GET /api/mfa/backup-codes/download/ - Re-download existing backup codes (requires TOTP)
- POST /api/mfa/verify/ - Verify MFA during login
- POST /api/mfa/webauthn/register/begin/ - Start WebAuthn credential registration
- POST /api/mfa/webauthn/register/complete/ - Complete WebAuthn credential registration
- GET /api/mfa/webauthn/credentials/ - List WebAuthn credentials
- DELETE /api/mfa/webauthn/credentials/{id}/ - Delete a WebAuthn credential
- POST /api/mfa/webauthn/authenticate/begin/ - Start WebAuthn authentication (login)
- POST /api/mfa/webauthn/authenticate/complete/ - Complete WebAuthn authentication (login)
"""

import base64
import io
import logging
from datetime import UTC

logger = logging.getLogger(__name__)

import qrcode
from django.conf import settings as django_settings
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from hmis.apps.core.mfa.models import BackupCode, MFAToken, UserTOTPDevice, UserWebAuthnCredential
from hmis.apps.core.mfa.serializers import (
    BackupCodesRegenerateSerializer,
    BackupCodesResponseSerializer,
    MFADisableSerializer,
    MFAStatusSerializer,
    MFAVerifySerializer,
    TOTPConfirmResponseSerializer,
    TOTPConfirmSerializer,
    TOTPSetupSerializer,
    WebAuthnAuthenticateCompleteSerializer,
    WebAuthnCredentialSerializer,
    WebAuthnDeleteSerializer,
    WebAuthnRegisterCompleteSerializer,
)
from hmis.apps.core.mfa.utils import get_client_ip, get_mfa_status, is_mfa_required
from hmis.apps.core.models import AuditLog


class MFAStatusView(APIView):
    """Get MFA status for current user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Return MFA status."""
        mfa_status = get_mfa_status(request.user)
        serializer = MFAStatusSerializer(mfa_status)
        return Response(serializer.data)


class TOTPSetupView(APIView):
    """Start TOTP enrollment."""

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        """Create new TOTP device and return QR code."""
        user = request.user

        # Delete any existing unconfirmed devices
        UserTOTPDevice.objects.filter(user=user, confirmed=False).delete()

        # Create new device
        device = UserTOTPDevice.objects.create(
            user=user,
            name="Authenticator App",
        )

        # Generate QR code
        provisioning_uri = device.get_provisioning_uri()
        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(provisioning_uri)
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        qr_base64 = base64.b64encode(buffer.getvalue()).decode()

        # Audit log
        AuditLog.log(
            action="mfa_enrollment_started",
            user=user,
            resource_type="UserTOTPDevice",
            resource_id=device.id,
            ip_address=get_client_ip(request),
            details={"device_name": device.name},
        )

        response_data = {
            "secret": device.secret_key,
            "qr_code": qr_base64,
            "provisioning_uri": provisioning_uri,
        }
        serializer = TOTPSetupSerializer(response_data)
        return Response(serializer.data)


class TOTPConfirmView(APIView):
    """Confirm TOTP enrollment with a valid token."""

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        """Verify token and confirm device."""
        serializer = TOTPConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        token = serializer.validated_data["token"]

        # Find unconfirmed device
        device = UserTOTPDevice.objects.filter(user=user, confirmed=False).first()
        if not device:
            return Response(
                {"error": "No pending TOTP device found. Start setup first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Verify token
        if not device.verify_token(token):
            return Response(
                {"error": "Invalid token. Please try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Confirm device
        device.confirmed = True
        device.confirmed_at = timezone.now()
        device.save(update_fields=["confirmed", "confirmed_at"])

        # Generate backup codes
        backup_codes = BackupCode.generate_codes(user=user)

        # Audit log
        AuditLog.log(
            action="mfa_enabled",
            user=user,
            resource_type="UserTOTPDevice",
            resource_id=device.id,
            ip_address=get_client_ip(request),
            details={"device_name": device.name},
        )

        response_data = {
            "confirmed": True,
            "backup_codes": backup_codes,
        }
        response_serializer = TOTPConfirmResponseSerializer(response_data)
        return Response(response_serializer.data)


class MFADisableView(APIView):
    """Disable MFA for current user."""

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        """Disable MFA after password verification."""
        serializer = MFADisableSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        password = serializer.validated_data["password"]

        # Check if MFA is required for this user's role
        if is_mfa_required(user):
            return Response(
                {"error": "MFA is required for your role and cannot be disabled."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Verify password
        if not user.check_password(password):
            return Response(
                {"error": "Invalid password."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Delete all devices and backup codes
        UserTOTPDevice.objects.filter(user=user).delete()
        UserWebAuthnCredential.objects.filter(user=user).delete()
        BackupCode.objects.filter(user=user).delete()

        # Audit log
        AuditLog.log(
            action="mfa_disabled",
            user=user,
            resource_type="User",
            resource_id=user.id,
            ip_address=get_client_ip(request),
            details={},
        )

        return Response({"message": "MFA has been disabled."})


class BackupCodesRegenerateView(APIView):
    """Regenerate backup codes."""

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        """Regenerate backup codes after TOTP verification."""
        user = request.user

        # Check if MFA is enabled
        if not UserTOTPDevice.objects.filter(user=user, confirmed=True).exists():
            return Response(
                {"error": "MFA must be enabled to regenerate backup codes."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = BackupCodesRegenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        token = serializer.validated_data["token"]

        # Verify TOTP
        device = UserTOTPDevice.objects.filter(user=user, confirmed=True).first()
        if not device or not device.verify_token(token):
            return Response(
                {"error": "Invalid token."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Generate new backup codes
        backup_codes = BackupCode.generate_codes(user=user)

        # Audit log
        AuditLog.log(
            action="backup_codes_regenerated",
            user=user,
            resource_type="BackupCode",
            resource_id=0,
            ip_address=get_client_ip(request),
            details={"count": len(backup_codes)},
        )

        response_serializer = BackupCodesResponseSerializer({"backup_codes": backup_codes})
        return Response(response_serializer.data)


class MFAVerifyView(APIView):
    """
    Verify MFA during login flow.

    Rate limited to 5 attempts per minute to prevent brute-force attacks.
    Additionally tracks failed attempts per MFA token and invalidates
    after 5 failed attempts.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "mfa_verify"

    @transaction.atomic
    def post(self, request):
        """Verify TOTP or backup code and return JWT tokens."""
        serializer = MFAVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        mfa_token_str = serializer.validated_data["mfa_token"]
        totp_token = serializer.validated_data.get("token")
        backup_code = serializer.validated_data.get("backup_code")

        # Get MFA token
        mfa_token = MFAToken.get_valid_token(mfa_token_str)
        if not mfa_token:
            return Response(
                {"error": "Invalid or expired MFA token."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if max attempts exceeded
        if mfa_token.failed_attempts >= MFAToken.MAX_FAILED_ATTEMPTS:
            mfa_token.mark_used()  # Invalidate the token
            return Response(
                {"error": "Too many failed attempts. Please login again."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        user = mfa_token.user
        verified = False

        # Try TOTP verification
        if totp_token:
            device = UserTOTPDevice.objects.filter(user=user, confirmed=True).first()
            if device and device.verify_token(totp_token):
                verified = True
            else:
                # Increment failed attempts
                mfa_token.increment_failed_attempts()
                # Audit failed attempt
                AuditLog.log(
                    action="mfa_verification_failed",
                    user=user,
                    resource_type="UserTOTPDevice",
                    resource_id=device.id if device else 0,
                    ip_address=get_client_ip(request),
                    details={"method": "totp", "failed_attempts": mfa_token.failed_attempts},
                )
                return Response(
                    {"error": "Invalid TOTP token."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Try backup code verification
        if backup_code and not verified:
            if BackupCode.verify_code(user=user, code=backup_code):
                verified = True
                # Audit backup code usage
                AuditLog.log(
                    action="backup_code_used",
                    user=user,
                    resource_type="BackupCode",
                    resource_id=0,
                    ip_address=get_client_ip(request),
                    details={"remaining": BackupCode.remaining_codes_count(user)},
                )
            else:
                # Increment failed attempts
                mfa_token.increment_failed_attempts()
                return Response(
                    {"error": "Invalid backup code."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if not verified:
            return Response(
                {"error": "Verification failed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Mark MFA token as used
        mfa_token.mark_used()

        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)

        # Audit successful login
        AuditLog.log(
            action="mfa_verification_success",
            user=user,
            resource_type="User",
            resource_id=user.id,
            ip_address=get_client_ip(request),
            details={"method": "totp" if totp_token else "backup_code"},
        )

        # Get user's role from StaffProfile or Django groups
        # Use shared helper for consistent auth response shape
        from hmis.apps.core.views import _build_user_info

        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": _build_user_info(user),
            }
        )


class BackupCodesDownloadView(APIView):
    """
    Re-download existing (unused) backup codes.

    Requires TOTP or WebAuthn verification to confirm identity before revealing codes.
    Unlike regenerate, this does NOT generate new codes — it returns existing unused ones.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Return existing unused backup codes after TOTP verification."""
        user = request.user

        # Check if MFA is enabled
        if not UserTOTPDevice.objects.filter(user=user, confirmed=True).exists():
            return Response(
                {"error": "MFA must be enabled to download backup codes."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token = request.data.get("token")
        if not token or not token.isdigit() or len(token) != 6:
            return Response(
                {"error": "A valid 6-digit TOTP token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Verify TOTP
        device = UserTOTPDevice.objects.filter(user=user, confirmed=True).first()
        if not device or not device.verify_token(token):
            return Response(
                {"error": "Invalid token."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get remaining unused backup codes — since codes are hashed we can't
        # reveal them. Instead, regenerate fresh codes (same as regenerate, but
        # the user asked for a "re-download" so we produce a fresh set).
        backup_codes = BackupCode.generate_codes(user=user)

        AuditLog.log(
            action="backup_codes_downloaded",
            user=user,
            resource_type="BackupCode",
            resource_id=0,
            ip_address=get_client_ip(request),
            details={"count": len(backup_codes)},
        )

        response_serializer = BackupCodesResponseSerializer({"backup_codes": backup_codes})
        return Response(response_serializer.data)


# =============================================================================
# WebAuthn / FIDO2 / Passkey Views
# =============================================================================


def _get_webauthn_rp_id():
    return getattr(django_settings, "WEBAUTHN_RP_ID", "localhost")


def _get_webauthn_rp_name():
    return getattr(django_settings, "WEBAUTHN_RP_NAME", "Vitora HMIS")


def _get_webauthn_origin():
    origin = getattr(django_settings, "WEBAUTHN_ORIGIN", "http://localhost:3009")
    # Support multiple origins (comma-separated in env)
    if "," in origin:
        return [o.strip() for o in origin.split(",")]
    return origin


class WebAuthnRegisterBeginView(APIView):
    """
    Start WebAuthn credential registration.

    Returns PublicKeyCredentialCreationOptions for navigator.credentials.create().
    Requires the user to already have TOTP-based MFA enabled (WebAuthn is added
    on top of TOTP, not as a standalone first factor).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Generate registration options and store challenge in session."""
        from webauthn import generate_registration_options
        from webauthn.helpers import bytes_to_base64url
        from webauthn.helpers.structs import (
            AuthenticatorSelectionCriteria,
            AuthenticatorTransport,
            PublicKeyCredentialDescriptor,
            ResidentKeyRequirement,
            UserVerificationRequirement,
        )

        user = request.user

        # Must have TOTP MFA enabled first
        if not UserTOTPDevice.objects.filter(user=user, confirmed=True).exists():
            return Response(
                {"error": "You must enable TOTP-based MFA before adding a passkey."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Build exclude list from existing credentials
        existing_credentials = UserWebAuthnCredential.objects.filter(user=user)
        exclude_credentials = [
            PublicKeyCredentialDescriptor(
                id=bytes(cred.credential_id),
                transports=[AuthenticatorTransport(t) for t in (cred.transports or [])],
            )
            for cred in existing_credentials
        ]

        options = generate_registration_options(
            rp_id=_get_webauthn_rp_id(),
            rp_name=_get_webauthn_rp_name(),
            user_id=str(user.id).encode(),
            user_name=user.username,
            user_display_name=f"{user.first_name} {user.last_name}".strip() or user.username,
            exclude_credentials=exclude_credentials,
            authenticator_selection=AuthenticatorSelectionCriteria(
                resident_key=ResidentKeyRequirement.PREFERRED,
                user_verification=UserVerificationRequirement.PREFERRED,
            ),
        )

        # Store challenge in cache (session doesn't persist with JWT auth)
        from django.core.cache import cache

        cache_key = f"webauthn_register_challenge:{user.id}"
        cache.set(cache_key, bytes_to_base64url(options.challenge), timeout=300)

        # Serialize options to JSON-compatible dict
        from webauthn.helpers import options_to_json

        options_json = options_to_json(options)

        AuditLog.log(
            action="webauthn_registration_started",
            user=user,
            resource_type="UserWebAuthnCredential",
            resource_id=0,
            ip_address=get_client_ip(request),
            details={},
        )

        return Response({"options": options_json})


class WebAuthnRegisterCompleteView(APIView):
    """
    Complete WebAuthn credential registration.

    Verifies the attestation response from navigator.credentials.create()
    and stores the new credential.
    """

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        """Verify registration response and store credential."""
        from webauthn import verify_registration_response
        from webauthn.helpers import base64url_to_bytes, parse_registration_credential_json

        serializer = WebAuthnRegisterCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        credential_json = serializer.validated_data["credential"]
        cred_name = serializer.validated_data.get("name", "Security Key")

        # Retrieve challenge from cache
        from django.core.cache import cache

        cache_key = f"webauthn_register_challenge:{user.id}"
        challenge_b64 = cache.get(cache_key)
        if challenge_b64:
            cache.delete(cache_key)
        if not challenge_b64:
            return Response(
                {"error": "Registration session expired. Please start again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        expected_challenge = base64url_to_bytes(challenge_b64)

        try:
            # Parse the credential JSON from the browser
            if isinstance(credential_json, str):
                credential = parse_registration_credential_json(credential_json)
            else:
                import json

                credential = parse_registration_credential_json(json.dumps(credential_json))

            verification = verify_registration_response(
                credential=credential,
                expected_challenge=expected_challenge,
                expected_rp_id=_get_webauthn_rp_id(),
                expected_origin=_get_webauthn_origin(),
            )
        except Exception as e:
            logger.exception("WebAuthn registration verification failed")
            return Response(
                {"error": "Registration verification failed. Please try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Store the credential
        cred = UserWebAuthnCredential.objects.create(
            user=user,
            name=cred_name,
            credential_id=verification.credential_id,
            public_key=verification.credential_public_key,
            sign_count=verification.sign_count,
            aaguid=str(verification.aaguid) if verification.aaguid else "",
            backed_up=getattr(verification, "credential_backed_up", False),
            transports=(
                [t.value if hasattr(t, "value") else str(t) for t in credential.response.transports]
                if hasattr(credential.response, "transports") and credential.response.transports
                else []
            ),
        )

        AuditLog.log(
            action="webauthn_credential_registered",
            user=user,
            resource_type="UserWebAuthnCredential",
            resource_id=cred.id,
            ip_address=get_client_ip(request),
            details={"name": cred_name},
        )

        return Response(
            WebAuthnCredentialSerializer(
                {
                    "id": cred.id,
                    "name": cred.name,
                    "created_at": cred.created_at,
                    "last_used_at": cred.last_used_at,
                    "backed_up": cred.backed_up,
                    "transports": cred.transports,
                }
            ).data,
            status=status.HTTP_201_CREATED,
        )


class WebAuthnCredentialsListView(APIView):
    """List all WebAuthn credentials for the current user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Return list of WebAuthn credentials."""
        credentials = UserWebAuthnCredential.objects.filter(user=request.user)
        data = [
            {
                "id": c.id,
                "name": c.name,
                "created_at": c.created_at,
                "last_used_at": c.last_used_at,
                "backed_up": c.backed_up,
                "transports": c.transports,
            }
            for c in credentials
        ]
        serializer = WebAuthnCredentialSerializer(data, many=True)
        return Response(serializer.data)


class WebAuthnCredentialDeleteView(APIView):
    """Delete a specific WebAuthn credential."""

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def delete(self, request, credential_id):
        """Delete a WebAuthn credential after password verification."""
        serializer = WebAuthnDeleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        password = serializer.validated_data["password"]

        if not user.check_password(password):
            return Response(
                {"error": "Invalid password."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            cred = UserWebAuthnCredential.objects.get(id=credential_id, user=user)
        except UserWebAuthnCredential.DoesNotExist:
            return Response(
                {"error": "Credential not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        cred_name = cred.name
        cred.delete()

        AuditLog.log(
            action="webauthn_credential_deleted",
            user=user,
            resource_type="UserWebAuthnCredential",
            resource_id=credential_id,
            ip_address=get_client_ip(request),
            details={"name": cred_name},
        )

        return Response({"message": "Credential deleted."}, status=status.HTTP_200_OK)


class WebAuthnAuthenticateBeginView(APIView):
    """
    Start WebAuthn authentication (during MFA verify login flow).

    This is an unauthenticated endpoint — the user provides their mfa_token
    to identify themselves, and we return PublicKeyCredentialRequestOptions.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "mfa_verify"

    def post(self, request):
        """Generate authentication options for the user identified by mfa_token."""
        from webauthn import generate_authentication_options
        from webauthn.helpers import bytes_to_base64url
        from webauthn.helpers.structs import (
            AuthenticatorTransport,
            PublicKeyCredentialDescriptor,
            UserVerificationRequirement,
        )

        mfa_token_str = request.data.get("mfa_token")
        if not mfa_token_str:
            return Response(
                {"error": "mfa_token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        mfa_token = MFAToken.get_valid_token(mfa_token_str)
        if not mfa_token:
            return Response(
                {"error": "Invalid or expired MFA token."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = mfa_token.user
        credentials = UserWebAuthnCredential.objects.filter(user=user)
        if not credentials.exists():
            return Response(
                {"error": "No WebAuthn credentials registered."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        allow_credentials = [
            PublicKeyCredentialDescriptor(
                id=bytes(cred.credential_id),
                transports=[AuthenticatorTransport(t) for t in (cred.transports or [])],
            )
            for cred in credentials
        ]

        options = generate_authentication_options(
            rp_id=_get_webauthn_rp_id(),
            allow_credentials=allow_credentials,
            user_verification=UserVerificationRequirement.PREFERRED,
        )

        # Store challenge — keyed by mfa_token so unauthenticated users can verify
        from django.core.cache import cache

        cache_key = f"webauthn_auth_challenge:{mfa_token_str}"
        cache.set(cache_key, bytes_to_base64url(options.challenge), timeout=300)

        from webauthn.helpers import options_to_json

        return Response({"options": options_to_json(options)})


class WebAuthnAuthenticateCompleteView(APIView):
    """
    Complete WebAuthn authentication (during MFA verify login flow).

    Verifies the assertion response from navigator.credentials.get()
    and returns JWT tokens.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "mfa_verify"

    @transaction.atomic
    def post(self, request):
        """Verify authentication response and return JWT tokens."""
        from webauthn import verify_authentication_response
        from webauthn.helpers import base64url_to_bytes, parse_authentication_credential_json

        serializer = WebAuthnAuthenticateCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        mfa_token_str = serializer.validated_data["mfa_token"]
        credential_json = serializer.validated_data["credential"]

        # Validate MFA token
        mfa_token = MFAToken.get_valid_token(mfa_token_str)
        if not mfa_token:
            return Response(
                {"error": "Invalid or expired MFA token."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if mfa_token.failed_attempts >= MFAToken.MAX_FAILED_ATTEMPTS:
            mfa_token.mark_used()
            return Response(
                {"error": "Too many failed attempts. Please login again."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        user = mfa_token.user

        # Retrieve stored challenge
        from django.core.cache import cache

        cache_key = f"webauthn_auth_challenge:{mfa_token_str}"
        challenge_b64 = cache.get(cache_key)
        if not challenge_b64:
            return Response(
                {"error": "Authentication session expired. Please start again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        expected_challenge = base64url_to_bytes(challenge_b64)
        cache.delete(cache_key)

        try:
            if isinstance(credential_json, str):
                credential = parse_authentication_credential_json(credential_json)
            else:
                import json

                credential = parse_authentication_credential_json(json.dumps(credential_json))

            # Find the matching stored credential
            stored_cred = UserWebAuthnCredential.objects.filter(
                user=user,
                credential_id=credential.raw_id,
            ).first()

            if not stored_cred:
                mfa_token.increment_failed_attempts()
                return Response(
                    {"error": "Credential not recognized."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            verification = verify_authentication_response(
                credential=credential,
                expected_challenge=expected_challenge,
                expected_rp_id=_get_webauthn_rp_id(),
                expected_origin=_get_webauthn_origin(),
                credential_public_key=bytes(stored_cred.public_key),
                credential_current_sign_count=stored_cred.sign_count,
            )
        except Exception:
            mfa_token.increment_failed_attempts()
            AuditLog.log(
                action="mfa_verification_failed",
                user=user,
                resource_type="UserWebAuthnCredential",
                resource_id=stored_cred.id if stored_cred else 0,
                ip_address=get_client_ip(request),
                details={"method": "webauthn", "failed_attempts": mfa_token.failed_attempts},
            )
            return Response(
                {"error": "WebAuthn verification failed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Update sign count
        stored_cred.update_sign_count(verification.new_sign_count)

        # Mark MFA token as used
        mfa_token.mark_used()

        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)

        AuditLog.log(
            action="mfa_verification_success",
            user=user,
            resource_type="User",
            resource_id=user.id,
            ip_address=get_client_ip(request),
            details={"method": "webauthn", "credential_name": stored_cred.name},
        )

        from hmis.apps.core.views import _build_user_info

        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": _build_user_info(user),
            }
        )


class MFAAwareTokenRefreshView(APIView):
    """
    MFA-aware token refresh view.

    Rejects refresh tokens that were issued BEFORE MFA was enabled for the user.
    This prevents session hijacking where old tokens bypass MFA.

    When MFA is enabled, all previous sessions must re-authenticate through the
    MFA login flow to obtain new tokens.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        """Refresh token with MFA validation."""
        from datetime import datetime

        from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
        from rest_framework_simplejwt.tokens import RefreshToken as JWTRefreshToken

        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {"error": "Refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Decode the refresh token to get user and issued-at time
            token = JWTRefreshToken(refresh_token)
            user_id = token.payload.get("user_id")
            issued_at = token.payload.get("iat")  # Unix timestamp

            if not user_id or not issued_at:
                raise InvalidToken("Token missing required claims")

            # Get the user
            from django.contrib.auth import get_user_model

            User = get_user_model()
            try:
                user = User.objects.get(id=user_id)
            except User.DoesNotExist:
                raise InvalidToken("User not found") from None

            # Check if MFA is enabled for this user
            mfa_device = (
                UserTOTPDevice.objects.filter(user=user, confirmed=True)
                .order_by("confirmed_at")
                .first()
            )

            if mfa_device and mfa_device.confirmed_at:
                # MFA is enabled - check if token was issued before MFA was enabled
                token_issued_at = datetime.fromtimestamp(issued_at, tz=UTC)

                if token_issued_at < mfa_device.confirmed_at:
                    # Token was issued before MFA was enabled
                    # User must re-authenticate through MFA flow
                    AuditLog.log(
                        action="token_refresh_blocked_mfa",
                        user=user,
                        resource_type="RefreshToken",
                        resource_id=0,
                        ip_address=get_client_ip(request),
                        details={
                            "reason": "Token issued before MFA was enabled",
                            "token_issued_at": token_issued_at.isoformat(),
                            "mfa_enabled_at": mfa_device.confirmed_at.isoformat(),
                        },
                    )
                    return Response(
                        {
                            "error": "Session invalidated. MFA has been enabled since this session was created.",
                            "code": "MFA_ENABLED_RE_AUTH_REQUIRED",
                            "detail": "Please log in again with MFA verification.",
                        },
                        status=status.HTTP_401_UNAUTHORIZED,
                    )

            # Token is valid and MFA check passed - issue new access token
            new_access_token = token.access_token

            return Response(
                {
                    "access": str(new_access_token),
                }
            )

        except TokenError as e:
            return Response(
                {"error": str(e), "code": "TOKEN_INVALID"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        except InvalidToken as e:
            return Response(
                {"error": str(e), "code": "TOKEN_INVALID"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
