"""
Authentication & onboarding views for Vitora HMIS.

Provides:
- Staff invitation management (create, list, resend, revoke, accept)
- Password reset (request, confirm)
- Change password (authenticated, for must_change_password flow)
- Invitation public lookup (pre-accept)
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from django_ratelimit.decorators import ratelimit
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from .models import (
    AuditLog,
    PasswordResetToken,
    StaffInvitation,
    StaffProfile,
)
from .serializers import (
    ChangePasswordSerializer,
    InvitationAcceptSerializer,
    InvitationPublicSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    StaffInvitationCreateSerializer,
    StaffInvitationSerializer,
)
from .services.email_service import (
    send_invitation_email,
    send_password_reset_email,
    send_welcome_email,
)

logger = logging.getLogger(__name__)
User = get_user_model()


def _get_client_ip(request) -> str | None:
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


# ============================================================================
# Staff Invitation ViewSet (Admin)
# ============================================================================


class StaffInvitationViewSet(viewsets.ModelViewSet):
    """
    Admin-only CRUD for staff invitations.

    list   — view all invitations (filterable by status, organization)
    create — send a new invitation email
    resend — re-send the invitation email (resets expiry)
    revoke — cancel a pending invitation
    """

    queryset = (
        StaffInvitation.objects.select_related(
            "organization", "facility", "role", "department", "invited_by"
        )
        .prefetch_related("secondary_roles", "secondary_departments")
        .all()
    )
    serializer_class = StaffInvitationSerializer
    permission_classes = [IsAdminUser]

    def get_serializer_class(self):
        if self.action == "create":
            return StaffInvitationCreateSerializer
        return StaffInvitationSerializer

    def create(self, request, *args, **kwargs):
        """Create invitation and send email."""
        serializer = StaffInvitationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        secondary_roles = data.pop("secondary_roles", [])
        secondary_departments = data.pop("secondary_departments", [])

        invitation = StaffInvitation(**data)
        invitation.invited_by = request.user
        invitation.save()

        if secondary_roles:
            invitation.secondary_roles.set(secondary_roles)
        if secondary_departments:
            invitation.secondary_departments.set(secondary_departments)

        # Send email
        invited_by_name = request.user.get_full_name() or request.user.username
        send_invitation_email(
            to_email=invitation.email,
            token=str(invitation.token),
            invited_by_name=invited_by_name,
            organization_name=invitation.organization.name,
            role_name=invitation.role.name if invitation.role else "",
            department_name=invitation.department.name if invitation.department else "",
            expires_hours=invitation.expires_hours,
        )
        invitation.last_sent_at = timezone.now()
        invitation.send_count = 1
        invitation.save(update_fields=["last_sent_at", "send_count"])

        AuditLog.log(
            action="invitation_created",
            user=request.user,
            resource_type="StaffInvitation",
            resource_id=invitation.id,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={"email": invitation.email},
        )

        read_serializer = StaffInvitationSerializer(invitation)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def resend(self, request, pk=None):
        """Resend the invitation email and reset expiry."""
        invitation = self.get_object()
        if invitation.status != StaffInvitation.InvitationStatus.PENDING:
            return Response(
                {"error": "Can only resend pending invitations."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Reset expiry
        hours = min(invitation.expires_hours, 720)
        invitation.expires_at = timezone.now() + timedelta(hours=hours)
        invitation.last_sent_at = timezone.now()
        invitation.send_count += 1
        invitation.save(update_fields=["expires_at", "last_sent_at", "send_count", "updated_at"])

        invited_by_name = request.user.get_full_name() or request.user.username
        send_invitation_email(
            to_email=invitation.email,
            token=str(invitation.token),
            invited_by_name=invited_by_name,
            organization_name=invitation.organization.name,
            role_name=invitation.role.name if invitation.role else "",
            department_name=invitation.department.name if invitation.department else "",
            expires_hours=invitation.expires_hours,
        )

        return Response(StaffInvitationSerializer(invitation).data)

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        """Revoke a pending invitation."""
        invitation = self.get_object()
        if invitation.status != StaffInvitation.InvitationStatus.PENDING:
            return Response(
                {"error": "Can only revoke pending invitations."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        invitation.revoke(user=request.user)

        AuditLog.log(
            action="invitation_revoked",
            user=request.user,
            resource_type="StaffInvitation",
            resource_id=invitation.id,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={"email": invitation.email},
        )

        return Response(StaffInvitationSerializer(invitation).data)


# ============================================================================
# Public Invitation Endpoints (No Auth)
# ============================================================================


@api_view(["GET"])
@permission_classes([AllowAny])
def invitation_lookup(request, token):
    """
    Public endpoint to look up invitation details before accepting.

    Returns non-sensitive info so the accept form can pre-fill organization/role context.
    """
    try:
        invitation = StaffInvitation.objects.select_related(
            "organization", "role", "department"
        ).get(token=token)
    except StaffInvitation.DoesNotExist:
        return Response(
            {"error": "Invitation not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    return Response(InvitationPublicSerializer(invitation).data)


@api_view(["POST"])
@permission_classes([AllowAny])
def invitation_accept(request):
    """
    Public endpoint to accept an invitation and create a user account.

    Rate limited to 10 attempts per minute per IP.
    """
    serializer = InvitationAcceptSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    data = serializer.validated_data
    token = data["token"]

    try:
        invitation = StaffInvitation.objects.select_related(
            "organization", "facility", "role", "department"
        ).prefetch_related(
            "secondary_roles", "secondary_departments"
        ).get(token=token)
    except StaffInvitation.DoesNotExist:
        return Response(
            {"error": "Invitation not found or has been revoked."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if not invitation.is_usable:
        error_msg = "Invitation has expired." if invitation.is_expired else "Invitation is no longer valid."
        return Response({"error": error_msg}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        # Create user
        user = User.objects.create_user(
            username=data["username"],
            email=invitation.email,
            first_name=data["first_name"],
            last_name=data["last_name"],
            password=data["password"],
        )

        # Create staff profile
        profile_kwargs = {
            "user": user,
            "organization": invitation.organization,
            "date_joined": date.today(),
            "must_change_password": False,  # User set their own password
        }
        if invitation.facility:
            profile_kwargs["primary_facility"] = invitation.facility
        if invitation.role:
            profile_kwargs["primary_role"] = invitation.role
        if invitation.department:
            profile_kwargs["primary_department"] = invitation.department
        if invitation.employee_id:
            profile_kwargs["employee_id"] = invitation.employee_id
        else:
            # Auto-generate employee_id
            import secrets

            profile_kwargs["employee_id"] = f"VH-{date.today().year}-{secrets.token_hex(3).upper()}"
        if invitation.job_title:
            profile_kwargs["job_title"] = invitation.job_title
        if data.get("phone_number"):
            profile_kwargs["phone_number"] = data["phone_number"]

        staff_profile = StaffProfile.objects.create(**profile_kwargs)

        # Assign secondary roles/departments
        secondary_roles = list(invitation.secondary_roles.all())
        if secondary_roles:
            staff_profile.secondary_roles.set(secondary_roles)
        secondary_departments = list(invitation.secondary_departments.all())
        if secondary_departments:
            staff_profile.secondary_departments.set(secondary_departments)

        # Mark invitation as accepted
        invitation.mark_accepted(user)

    AuditLog.log(
        action="invitation_accepted",
        user=user,
        resource_type="StaffInvitation",
        resource_id=invitation.id,
        ip_address=_get_client_ip(request),
        user_agent=request.META.get("HTTP_USER_AGENT", ""),
        details={
            "email": invitation.email,
            "username": user.username,
        },
    )

    return Response(
        {
            "message": "Account created successfully. You can now log in.",
            "username": user.username,
        },
        status=status.HTTP_201_CREATED,
    )


# ============================================================================
# Password Reset (Public)
# ============================================================================


@api_view(["POST"])
@permission_classes([AllowAny])
def password_reset_request(request):
    """
    Request a password reset email.

    Always returns 200 to prevent email enumeration, regardless of
    whether the email exists in the system.

    Rate limited to 5 requests per minute per IP.
    """
    serializer = PasswordResetRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    email = serializer.validated_data["email"].lower()
    user = User.objects.filter(email__iexact=email).first()

    if user:
        # Invalidate any existing unused tokens
        PasswordResetToken.objects.filter(user=user, used=False).update(used=True)

        # Create new token
        reset_token = PasswordResetToken(user=user)
        reset_token.save()

        send_password_reset_email(
            to_email=email,
            token=str(reset_token.token),
            full_name=user.get_full_name() or user.username,
        )

        AuditLog.log(
            action="password_reset_requested",
            user=user,
            resource_type="User",
            resource_id=user.id,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={},
        )

    # Always return success to prevent email enumeration
    return Response(
        {"message": "If an account with that email exists, a reset link has been sent."},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def password_reset_confirm(request):
    """
    Confirm a password reset with a token and set a new password.

    Rate limited to 10 attempts per minute per IP.
    """
    serializer = PasswordResetConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    data = serializer.validated_data
    try:
        reset_token = PasswordResetToken.objects.select_related("user").get(
            token=data["token"]
        )
    except PasswordResetToken.DoesNotExist:
        return Response(
            {"error": "Invalid or expired reset link."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not reset_token.is_valid:
        return Response(
            {"error": "This reset link has expired or already been used."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = reset_token.user
    user.set_password(data["new_password"])
    user.save(update_fields=["password"])

    # Clear must_change_password if set
    if hasattr(user, "staff_profile") and user.staff_profile.must_change_password:
        user.staff_profile.must_change_password = False
        user.staff_profile.save(update_fields=["must_change_password"])

    reset_token.consume()

    AuditLog.log(
        action="password_reset_confirmed",
        user=user,
        resource_type="User",
        resource_id=user.id,
        ip_address=_get_client_ip(request),
        user_agent=request.META.get("HTTP_USER_AGENT", ""),
        details={},
    )

    return Response(
        {"message": "Password has been reset successfully. You can now log in."},
        status=status.HTTP_200_OK,
    )


# ============================================================================
# Change Password (Authenticated)
# ============================================================================


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password(request):
    """
    Change password for the authenticated user.

    If user has must_change_password=True, current_password is not required.
    Otherwise, current_password must be provided and correct.
    """
    serializer = ChangePasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    user = request.user
    data = serializer.validated_data

    # Check if must_change_password is set
    is_forced = (
        hasattr(user, "staff_profile") and user.staff_profile.must_change_password
    )

    if not is_forced:
        # Normal password change — require current password
        current_password = data.get("current_password")
        if not current_password:
            return Response(
                {"current_password": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not user.check_password(current_password):
            return Response(
                {"current_password": ["Current password is incorrect."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

    user.set_password(data["new_password"])
    user.save(update_fields=["password"])

    # Clear the forced flag
    if is_forced:
        user.staff_profile.must_change_password = False
        user.staff_profile.save(update_fields=["must_change_password"])

    AuditLog.log(
        action="password_changed",
        user=user,
        resource_type="User",
        resource_id=user.id,
        ip_address=_get_client_ip(request),
        user_agent=request.META.get("HTTP_USER_AGENT", ""),
        details={"forced": is_forced},
    )

    return Response(
        {"message": "Password changed successfully."},
        status=status.HTTP_200_OK,
    )
