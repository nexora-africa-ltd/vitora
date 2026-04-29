"""
URL configuration for SHA (Social Health Authority) billing endpoints.

Provides routes for SHA Members, Tariffs, Claims, and related operations.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from hmis.apps.billing.sha_ilm_lifecycle_views import (
    IlmDischargeOtpView,
    IlmDischargeView,
    IlmEmergencyDoctorAddView,
    IlmEmergencyDoctorRemoveView,
    IlmFileUploadView,
    IlmFileUrlView,
    IlmNextOfKinView,
    IlmOtpWhitelistCallbackView,
    IlmOtpWhitelistRequestView,
    IlmPomsfBalancesView,
    IlmVisitOtpView,
    SHAOtpRequestListView,
    SHAOtpWhitelistListView,
    SHAUploadListView,
)
from hmis.apps.billing.sha_ilm_preauth_views import (
    IlmDoctorConsentView,
    IlmEmergencyOpenView,
    IlmEmergencyProtocolApplyView,
    IlmEmergencyProtocolsListView,
    IlmEmtCreateView,
    IlmPreauthCancelView,
    IlmPreauthCreateView,
    IlmPreauthFetchView,
    IlmPreauthRemoveDiagnosisView,
    IlmPreauthRemoveDoctorView,
    SHAEmergencyClaimListView,
    SHAPreauthListView,
)
from hmis.apps.billing.sha_ilm_prescription_views import (
    IlmPrescriptionCreateView,
    IlmPrescriptionDispenseView,
    IlmPrescriptionPreviewView,
    IlmPrescriptionRemoveDoctorView,
    SHADhaPrescriptionListView,
)
from hmis.apps.billing.sha_ilm_registry_views import (
    IlmBenefitInterventionsView,
    IlmBenefitsView,
    IlmEligibilityView,
    IlmFacilitySearchView,
    IlmPatientLookupView,
    IlmProfessionalSearchView,
    IlmSubBenefitsView,
    IlmUtilizationView,
    PatientContactListCreateView,
)
from hmis.apps.billing.sha_views import (
    ClientRegistryView,
    ConsentDetailView,
    ConsentSendOTPView,
    ConsentValidateOTPView,
    EligibilityCheckView,
    FacilitySearchView,
    PractitionerSearchView,
    PreauthPendingListView,
    PreauthStatusView,
    PreauthSubmitView,
    SHAClaimViewSet,
    SHAMemberViewSet,
    SHATariffViewSet,
    SHAValidateView,
    SHAWebhookView,
    StartVisitView,
    TerminologySearchView,
)

app_name = "sha"

router = DefaultRouter()
router.register(r"members", SHAMemberViewSet, basename="member")
router.register(r"tariffs", SHATariffViewSet, basename="tariff")
router.register(r"claims", SHAClaimViewSet, basename="claim")

urlpatterns = [
    path("", include(router.urls)),
    # Terminology endpoints
    path(
        "terminology/<str:terminology_type>/",
        TerminologySearchView.as_view(),
        name="terminology-search",
    ),
    # Client Registry endpoints
    path("client-registry/fetch/", ClientRegistryView.as_view(), name="client-registry-fetch"),
    path(
        "client-registry/register/", ClientRegistryView.as_view(), name="client-registry-register"
    ),
    # Facility and Practitioner validation
    path("facility/validate/", FacilitySearchView.as_view(), name="facility-validate"),
    path("practitioner/validate/", PractitionerSearchView.as_view(), name="practitioner-validate"),
    # Eligibility check
    path("eligibility/check/", EligibilityCheckView.as_view(), name="eligibility-check"),
    # Consent (DHA HIE User Journey compliance)
    path("consent/send-otp/", ConsentSendOTPView.as_view(), name="consent-send-otp"),
    path("consent/validate-otp/", ConsentValidateOTPView.as_view(), name="consent-validate-otp"),
    path("consent/start-visit/", StartVisitView.as_view(), name="consent-start-visit"),
    path("consent/<int:pk>/", ConsentDetailView.as_view(), name="consent-detail"),
    # Pre-authorization (DHA HIE User Journey compliance)
    path("preauth/submit/", PreauthSubmitView.as_view(), name="preauth-submit"),
    path("preauth/<int:pk>/status/", PreauthStatusView.as_view(), name="preauth-status"),
    path("preauth/pending/", PreauthPendingListView.as_view(), name="preauth-pending"),
    # DHA Integration Endpoints (Callback/Webhook URLs)
    # Register these with DHA when setting up integration:
    # - Callback URL: https://your-domain/api/sha/webhook/
    # - Validate URL: https://your-domain/api/sha/validate/
    path("webhook/", SHAWebhookView.as_view(), name="sha-webhook"),
    path("callback/", SHAWebhookView.as_view(), name="sha-callback"),  # Alias for webhook
    path("validate/", SHAValidateView.as_view(), name="sha-validate"),
    # ----- DHA HIE Middleware (ILM) — Phase 2 pre-visit registries -----
    path(
        "ilm/registries/facility-search/",
        IlmFacilitySearchView.as_view(),
        name="ilm-facility-search",
    ),
    path(
        "ilm/registries/patient-lookup/",
        IlmPatientLookupView.as_view(),
        name="ilm-patient-lookup",
    ),
    path(
        "ilm/registries/professional-search/",
        IlmProfessionalSearchView.as_view(),
        name="ilm-professional-search",
    ),
    path("ilm/eligibility/", IlmEligibilityView.as_view(), name="ilm-eligibility"),
    path("ilm/benefits/", IlmBenefitsView.as_view(), name="ilm-benefits"),
    path("ilm/sub-benefits/", IlmSubBenefitsView.as_view(), name="ilm-sub-benefits"),
    path(
        "ilm/benefit-interventions/",
        IlmBenefitInterventionsView.as_view(),
        name="ilm-benefit-interventions",
    ),
    path("ilm/utilization/", IlmUtilizationView.as_view(), name="ilm-utilization"),
    path(
        "ilm/patient-contacts/",
        PatientContactListCreateView.as_view(),
        name="ilm-patient-contacts",
    ),
    # ----- DHA HIE Middleware (ILM) — Phase 3 preauth & emergency -----
    path("ilm/preauth/", IlmPreauthFetchView.as_view(), name="ilm-preauth-fetch"),
    path("ilm/preauth/create/", IlmPreauthCreateView.as_view(), name="ilm-preauth-create"),
    path("ilm/preauth/cancel/", IlmPreauthCancelView.as_view(), name="ilm-preauth-cancel"),
    path(
        "ilm/preauth/diagnoses/<str:icd_code>/",
        IlmPreauthRemoveDiagnosisView.as_view(),
        name="ilm-preauth-remove-diagnosis",
    ),
    path(
        "ilm/preauth/doctors/",
        IlmPreauthRemoveDoctorView.as_view(),
        name="ilm-preauth-remove-doctor",
    ),
    path(
        "ilm/preauth/doctor-consent/",
        IlmDoctorConsentView.as_view(),
        name="ilm-doctor-consent",
    ),
    path("ilm/preauth/local/", SHAPreauthListView.as_view(), name="ilm-preauth-local"),
    path("ilm/emergency/", IlmEmergencyOpenView.as_view(), name="ilm-emergency-open"),
    path(
        "ilm/emergency/protocols/",
        IlmEmergencyProtocolsListView.as_view(),
        name="ilm-emergency-protocols",
    ),
    path(
        "ilm/emergency/protocols/apply/",
        IlmEmergencyProtocolApplyView.as_view(),
        name="ilm-emergency-protocols-apply",
    ),
    path("ilm/emt/", IlmEmtCreateView.as_view(), name="ilm-emt-create"),
    path(
        "ilm/emergency/local/",
        SHAEmergencyClaimListView.as_view(),
        name="ilm-emergency-local",
    ),
    # ----- DHA HIE Middleware (ILM) — Phase 4 lifecycle polish -----
    path("ilm/lifecycle/visit-otp/", IlmVisitOtpView.as_view(), name="ilm-visit-otp"),
    path(
        "ilm/lifecycle/discharge-otp/",
        IlmDischargeOtpView.as_view(),
        name="ilm-discharge-otp",
    ),
    path("ilm/lifecycle/discharge/", IlmDischargeView.as_view(), name="ilm-discharge"),
    path(
        "ilm/lifecycle/otp-whitelist/",
        IlmOtpWhitelistRequestView.as_view(),
        name="ilm-otp-whitelist-request",
    ),
    path(
        "ilm/lifecycle/otp-whitelist/callback/",
        IlmOtpWhitelistCallbackView.as_view(),
        name="ilm-otp-whitelist-callback",
    ),
    path(
        "ilm/lifecycle/otp-whitelist/local/",
        SHAOtpWhitelistListView.as_view(),
        name="ilm-otp-whitelist-local",
    ),
    path(
        "ilm/lifecycle/otp/local/",
        SHAOtpRequestListView.as_view(),
        name="ilm-otp-local",
    ),
    path(
        "ilm/lifecycle/next-of-kin/",
        IlmNextOfKinView.as_view(),
        name="ilm-next-of-kin",
    ),
    path(
        "ilm/lifecycle/emergency-doctors/",
        IlmEmergencyDoctorAddView.as_view(),
        name="ilm-emergency-doctor-add",
    ),
    path(
        "ilm/lifecycle/emergency-doctors/remove/",
        IlmEmergencyDoctorRemoveView.as_view(),
        name="ilm-emergency-doctor-remove",
    ),
    path(
        "ilm/lifecycle/pomsf-balances/",
        IlmPomsfBalancesView.as_view(),
        name="ilm-pomsf-balances",
    ),
    path("ilm/uploads/", IlmFileUploadView.as_view(), name="ilm-uploads-create"),
    path(
        "ilm/uploads/local/",
        SHAUploadListView.as_view(),
        name="ilm-uploads-local",
    ),
    path(
        "ilm/uploads/<str:file_id>/",
        IlmFileUrlView.as_view(),
        name="ilm-uploads-url",
    ),
    # ----- DHA HIE Middleware (ILM) — Phase 5 ePrescriptions -----
    path(
        "ilm/prescriptions/preview/",
        IlmPrescriptionPreviewView.as_view(),
        name="ilm-prescription-preview",
    ),
    path(
        "ilm/prescriptions/",
        IlmPrescriptionCreateView.as_view(),
        name="ilm-prescription-create",
    ),
    path(
        "ilm/prescriptions/dispenses/",
        IlmPrescriptionDispenseView.as_view(),
        name="ilm-prescription-dispense",
    ),
    path(
        "ilm/prescriptions/doctors/",
        IlmPrescriptionRemoveDoctorView.as_view(),
        name="ilm-prescription-remove-doctor",
    ),
    path(
        "ilm/prescriptions/local/",
        SHADhaPrescriptionListView.as_view(),
        name="ilm-prescriptions-local",
    ),
]
