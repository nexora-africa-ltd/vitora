"""
MFA views for Vitora HMIS.

API endpoints for MFA management:
- GET /api/mfa/status/ - Get MFA status for current user
- POST /api/mfa/totp/setup/ - Start TOTP enrollment
- POST /api/mfa/totp/confirm/ - Confirm TOTP enrollment
- POST /api/mfa/disable/ - Disable MFA
- POST /api/mfa/backup-codes/regenerate/ - Regenerate backup codes
- POST /api/mfa/verify/ - Verify MFA during login
"""

import base64
import io
from datetime import UTC

import qrcode
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from hmis.apps.core.mfa.models import BackupCode, MFAToken, UserTOTPDevice
from hmis.apps.core.mfa.serializers import (
    BackupCodesRegenerateSerializer,
    BackupCodesResponseSerializer,
    MFADisableSerializer,
    MFAStatusSerializer,
    MFAVerifySerializer,
    TOTPConfirmResponseSerializer,
    TOTPConfirmSerializer,
    TOTPSetupSerializer,
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
    """Verify MFA during login flow."""

    permission_classes = [AllowAny]

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

        user = mfa_token.user
        verified = False

        # Try TOTP verification
        if totp_token:
            device = UserTOTPDevice.objects.filter(user=user, confirmed=True).first()
            if device and device.verify_token(totp_token):
                verified = True
            else:
                # Audit failed attempt
                AuditLog.log(
                    action="mfa_verification_failed",
                    user=user,
                    resource_type="UserTOTPDevice",
                    resource_id=device.id if device else 0,
                    ip_address=get_client_ip(request),
                    details={"method": "totp"},
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
        role = None
        if hasattr(user, "staff_profile") and user.staff_profile:
            role = (
                user.staff_profile.primary_role.code
                if user.staff_profile.primary_role
                else None
            )
        elif user.groups.exists():
            # Fall back to first Django group as role
            role = user.groups.first().name.upper().replace(" ", "_")

        # Superusers get ADMIN role
        if user.is_superuser:
            role = "ADMIN"

        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "is_staff": user.is_staff,
                    "is_superuser": user.is_superuser,
                    "role": role,
                    "permissions": list(user.get_all_permissions()),
                },
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
            mfa_device = UserTOTPDevice.objects.filter(
                user=user, confirmed=True
            ).order_by("confirmed_at").first()

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
