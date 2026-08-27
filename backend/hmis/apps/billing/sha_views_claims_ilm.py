"""
What this file is for: composed ILM mixin built from focused SHA claim ILM concern modules.
How to use: imported by `hmis.apps.billing.sha_views_claims` to provide all ILM endpoints on SHAClaimViewSet.
Supported inputs/args: DRF ILM action payloads delegated to focused mixins.
"""

from hmis.apps.billing.sha_views_claims_ilm_attachments import SHAClaimILMAttachmentsMixin
from hmis.apps.billing.sha_views_claims_ilm_core import SHAClaimILMCoreMixin
from hmis.apps.billing.sha_views_claims_ilm_diagnoses_lines import SHAClaimILMDiagnosesLinesMixin
from hmis.apps.billing.sha_views_claims_ilm_interventions import SHAClaimILMInterventionsMixin
from hmis.apps.billing.sha_views_claims_ilm_preview_submit import SHAClaimILMPreviewSubmitMixin


class SHAClaimILMMixin(
    SHAClaimILMPreviewSubmitMixin,
    SHAClaimILMAttachmentsMixin,
    SHAClaimILMDiagnosesLinesMixin,
    SHAClaimILMInterventionsMixin,
    SHAClaimILMCoreMixin,
):
    """Aggregate ILM mixin for SHAClaimViewSet."""
