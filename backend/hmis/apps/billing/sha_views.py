"""
What this file is for: compatibility shim that re-exports SHA billing views and helpers.
How to use: keep importing from `hmis.apps.billing.sha_views` while implementations live in split modules.
Supported inputs/args: import-time symbol re-exports for DRF views, serializers, and legacy patch targets.
"""

from hmis.apps.billing.services.client_registry import ClientRegistryService
from hmis.apps.billing.services.icd11_local import ICD11LocalService
from hmis.apps.billing.services.intervention_fallback import (
    get_local_intervention,
    search_local_interventions,
)
from hmis.apps.billing.services.terminology import TerminologyService
from hmis.apps.billing.sha_views_claims import (
    SHAClaimViewSet,
    _build_attachment_sync_status,
    _collect_unresolved_claim_lines,
    _extract_dha_invoice_number,
    _extract_preview_claim_reference,
    _infer_tariff_category_from_code,
    _normalize_attachment_name,
    _parse_money,
    _stringify_error,
    _to_dha_document_type,
    _to_dha_document_type_for_claim,
    _to_local_attachment_type,
)
from hmis.apps.billing.sha_views_consent_visit import (
    BeneficiaryContactsView,
    BiometricAuthorizeStatusView,
    BiometricAuthorizeView,
    BiometricCancelView,
    ConsentAdmissionConflictView,
    ConsentDetailView,
    ConsentLatestView,
    ConsentSendOTPView,
    ConsentValidateOTPView,
    SHASchemaMixin,
    SHASchemaSerializer,
    StartVisitView,
    _persist_consent_interventions,
)
from hmis.apps.billing.sha_views_eligibility import DirectEligibilityCheckView, EligibilityCheckView
from hmis.apps.billing.sha_views_members import SHAMemberViewSet, SHAPagination, SHATariffViewSet
from hmis.apps.billing.sha_views_preauth_remittance import (
    CapitationValidateDirectView,
    CapitationValidationView,
    PreauthPendingListView,
    PreauthStatusView,
    PreauthSubmitView,
    SHARemittanceViewSet,
)
from hmis.apps.billing.sha_views_utility import (
    ClientRegistryView,
    FacilitySearchView,
    PractitionerSearchView,
    SHAHealthCheckView,
    SHAValidateView,
    SHAWebhookView,
    TerminologySearchView,
)

__all__ = [
    "BeneficiaryContactsView",
    "BiometricAuthorizeStatusView",
    "BiometricAuthorizeView",
    "BiometricCancelView",
    "CapitationValidateDirectView",
    "CapitationValidationView",
    "ClientRegistryService",
    "ClientRegistryView",
    "ConsentAdmissionConflictView",
    "ConsentDetailView",
    "ConsentLatestView",
    "ConsentSendOTPView",
    "ConsentValidateOTPView",
    "DirectEligibilityCheckView",
    "EligibilityCheckView",
    "FacilitySearchView",
    "ICD11LocalService",
    "PractitionerSearchView",
    "PreauthPendingListView",
    "PreauthStatusView",
    "PreauthSubmitView",
    "SHAClaimViewSet",
    "SHAHealthCheckView",
    "SHAMemberViewSet",
    "SHAPagination",
    "SHARemittanceViewSet",
    "SHASchemaMixin",
    "SHASchemaSerializer",
    "SHATariffViewSet",
    "SHAValidateView",
    "SHAWebhookView",
    "StartVisitView",
    "TerminologySearchView",
    "TerminologyService",
    "_build_attachment_sync_status",
    "_collect_unresolved_claim_lines",
    "_extract_dha_invoice_number",
    "_extract_preview_claim_reference",
    "_infer_tariff_category_from_code",
    "_normalize_attachment_name",
    "_parse_money",
    "_persist_consent_interventions",
    "_stringify_error",
    "_to_dha_document_type",
    "_to_dha_document_type_for_claim",
    "_to_local_attachment_type",
    "get_local_intervention",
    "search_local_interventions",
]
