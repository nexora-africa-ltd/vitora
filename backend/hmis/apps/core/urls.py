"""
URL configuration for core app.
"""

from django.urls import include, path
from rest_framework import routers

from .auth_views import (
    OrgJoinRequestViewSet,
    StaffInvitationViewSet,
    accept_cross_org,
    change_password,
    decline_invitation,
    invitation_accept,
    invitation_lookup,
    onboarding_status,
    org_signup,
    password_reset_confirm,
    password_reset_request,
    setup_check,
    setup_initialize,
    verify_email,
)
from .dashboard_views import (
    activity_feed,
    dashboard_stats,
    patient_volume_history,
    revenue_breakdown,
)
from .history_views import EncounterHistoryView, PatientHistoryView
from .views import (
    AuditLogViewSet,
    CertificateViewSet,
    DepartmentViewSet,
    DocumentSignatureViewSet,
    FacilityViewSet,
    FeatureFlagViewSet,
    FrontendEventViewSet,
    NotificationViewSet,
    OrgMembershipViewSet,
    RoleViewSet,
    StaffProfileViewSet,
    generate_case_number_view,
    generate_prc_number_view,
    verify_document,
)

router = routers.DefaultRouter()
router.register(r"auditlogs", AuditLogViewSet, basename="auditlog")
router.register(r"events", FrontendEventViewSet, basename="frontendevent")
router.register(r"departments", DepartmentViewSet, basename="department")
router.register(r"roles", RoleViewSet, basename="role")
router.register(r"staff", StaffProfileViewSet, basename="staffprofile")
router.register(r"org-memberships", OrgMembershipViewSet, basename="orgmembership")
router.register(r"notifications", NotificationViewSet, basename="notification")
router.register(r"features", FeatureFlagViewSet, basename="featureflag")
router.register(r"facilities", FacilityViewSet, basename="facility")
router.register(r"certificates", CertificateViewSet, basename="certificate")
router.register(r"signatures", DocumentSignatureViewSet, basename="documentsignature")
router.register(r"invitations", StaffInvitationViewSet, basename="staffinvitation")
router.register(r"join-requests", OrgJoinRequestViewSet, basename="orgjoinrequest")

urlpatterns = [
    # Dashboard statistics
    path("dashboard/stats/", dashboard_stats, name="dashboard-stats"),
    path("dashboard/patient-volume/", patient_volume_history, name="dashboard-patient-volume"),
    path("dashboard/revenue-breakdown/", revenue_breakdown, name="dashboard-revenue-breakdown"),
    path("dashboard/activity-feed/", activity_feed, name="dashboard-activity-feed"),
    # Case number generation endpoints
    path("generate/prc-number/", generate_prc_number_view, name="generate-prc-number"),
    path("generate/case-number/", generate_case_number_view, name="generate-case-number"),
    # Public document verification (no auth required)
    path("verify/", verify_document, name="verify-document"),
    # Emergency access (break-glass)
    path("emergency-access/", include("hmis.apps.core.emergency_access.urls")),
    # History API endpoints (DHA Compliance - Audit Trail)
    path(
        "history/patients/<int:patient_id>/", PatientHistoryView.as_view(), name="patient-history"
    ),
    path(
        "history/encounters/<int:encounter_id>/",
        EncounterHistoryView.as_view(),
        name="encounter-history",
    ),
    # --- Auth / Onboarding (public endpoints) ---
    path("invitations/<uuid:token>/", invitation_lookup, name="invitation-lookup"),
    path("invitations/accept/", invitation_accept, name="invitation-accept"),
    path("invitations/accept-cross-org/", accept_cross_org, name="invitation-accept-cross-org"),
    path("invitations/<int:pk>/decline/", decline_invitation, name="invitation-decline"),
    path("auth/password-reset/request/", password_reset_request, name="password-reset-request"),
    path("auth/password-reset/confirm/", password_reset_confirm, name="password-reset-confirm"),
    path("auth/change-password/", change_password, name="change-password"),
    # --- Self-service signup ---
    path("auth/signup/", org_signup, name="org-signup"),
    path("auth/verify-email/", verify_email, name="verify-email"),
    # --- Setup wizard (first-run, feature-flagged) ---
    path("setup/check/", setup_check, name="setup-check"),
    path("setup/initialize/", setup_initialize, name="setup-initialize"),
    # --- Onboarding checklist (authenticated) ---
    path("onboarding/status/", onboarding_status, name="onboarding-status"),
] + router.urls
