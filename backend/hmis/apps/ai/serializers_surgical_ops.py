# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Ai serializers surgical ops for Vitora HMIS.

What this file is for:
- Implement serializers surgical ops logic for the ai domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from rest_framework import serializers

from hmis.apps.ai.serializers_docs_cds_stored import StoredAIResultSerializer


class SurgicalPreOpAssessRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/surgical/pre-op/assess/."""

    surgery_case_id = serializers.IntegerField(
        help_text="Link result to this surgery case for persistence.",
    )
    procedure_key = serializers.CharField(required=False, allow_blank=True, max_length=100)
    age = serializers.IntegerField(min_value=0, max_value=120)
    sex = serializers.ChoiceField(choices=["male", "female"])
    asa_class = serializers.ChoiceField(choices=["I", "II", "III", "IV", "V", "VI"])
    urgency = serializers.ChoiceField(
        choices=["elective", "urgent", "emergency"],
        required=False,
        default="elective",
    )
    high_risk_surgery = serializers.BooleanField(required=False, default=False)
    ischemic_heart_disease = serializers.BooleanField(required=False, default=False)
    congestive_heart_failure = serializers.BooleanField(required=False, default=False)
    cerebrovascular_disease = serializers.BooleanField(required=False, default=False)
    insulin_dependent_diabetes = serializers.BooleanField(required=False, default=False)
    creatinine_above_2 = serializers.BooleanField(required=False, default=False)
    caprini_factors = serializers.ListField(
        child=serializers.CharField(max_length=100),
        required=False,
        default=list,
    )
    mallampati_class = serializers.ChoiceField(
        choices=["I", "II", "III", "IV"],
        required=False,
        allow_null=True,
    )
    facility_level = serializers.CharField(required=False, allow_blank=True, max_length=10)
    include_fhir = serializers.BooleanField(required=False, default=False)


class SurgicalChecklistStartRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/surgical/checklist/start/."""

    surgery_case_id = serializers.IntegerField(
        help_text="Link checklist session to this surgery case.",
    )
    procedure_key = serializers.CharField(max_length=100)
    patient_id = serializers.CharField(max_length=100)


class SurgicalChecklistAdvanceRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/surgical/checklist/{session_id}/advance/."""

    checked_items = serializers.ListField(
        child=serializers.CharField(max_length=20),
        required=False,
        default=list,
    )
    notes = serializers.DictField(required=False, default=dict)
    checked_by = serializers.CharField(required=False, allow_blank=True, max_length=200)


class SurgicalPostOpCarePlanRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/surgical/post-op/care-plan/."""

    surgery_case_id = serializers.IntegerField(
        help_text="Link result to this surgery case for persistence.",
    )
    procedure_key = serializers.CharField(max_length=100)
    estimated_blood_loss_ml = serializers.IntegerField(required=False, min_value=0)
    lowest_heart_rate = serializers.IntegerField(required=False, min_value=0)
    lowest_map = serializers.IntegerField(required=False, min_value=0)
    findings = serializers.CharField(required=False, allow_blank=True, max_length=5000)
    complications_intraop = serializers.ListField(
        child=serializers.CharField(max_length=500),
        required=False,
        default=list,
    )
    drain_placed = serializers.BooleanField(required=False, default=False)
    stoma_formed = serializers.BooleanField(required=False, default=False)
    caprini_score = serializers.IntegerField(required=False, min_value=0)
    include_fhir = serializers.BooleanField(required=False, default=False)


class SurgicalPreOpAssessResponseSerializer(serializers.Serializer):
    """Response from POST /api/ai/surgical/pre-op/assess/."""

    risk_scores = serializers.DictField()
    procedure_template = serializers.DictField(required=False, allow_null=True)
    facility_capable = serializers.BooleanField(required=False, allow_null=True)
    facility_alert = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    cds_alerts = serializers.ListField(child=serializers.DictField(), required=False)
    fhir_risk_assessment = serializers.DictField(required=False, allow_null=True)
    stored_id = serializers.CharField(required=False)
    mode = serializers.CharField(required=False)
    error = serializers.CharField(required=False, allow_null=True)


class SurgicalChecklistSessionResponseSerializer(serializers.Serializer):
    """Response from surgical checklist start/advance/status endpoints."""

    session = serializers.DictField(required=False)
    progress = serializers.DictField(required=False)
    message = serializers.CharField(required=False, allow_blank=True)
    phase_complete = serializers.BooleanField(required=False)
    unchecked_critical_items = serializers.ListField(
        child=serializers.CharField(),
        required=False,
    )
    stored_id = serializers.CharField(required=False)
    tibabot_session_id = serializers.CharField(required=False)
    mode = serializers.CharField(required=False)
    error = serializers.CharField(required=False, allow_null=True)


class SurgicalPostOpCarePlanResponseSerializer(serializers.Serializer):
    """Response from POST /api/ai/surgical/post-op/care-plan/."""

    procedure_key = serializers.CharField()
    procedure_name = serializers.CharField(required=False, allow_blank=True)
    surgical_apgar = serializers.DictField(required=False, allow_null=True)
    monitoring = serializers.CharField(required=False, allow_blank=True)
    medications = serializers.ListField(child=serializers.CharField(), required=False)
    activity = serializers.CharField(required=False, allow_blank=True)
    nutrition = serializers.CharField(required=False, allow_blank=True)
    wound_care = serializers.CharField(required=False, allow_blank=True)
    complications_to_watch = serializers.ListField(child=serializers.DictField(), required=False)
    discharge_criteria = serializers.ListField(child=serializers.CharField(), required=False)
    follow_up = serializers.DictField(required=False, allow_null=True)
    cds_alerts = serializers.ListField(child=serializers.DictField(), required=False)
    fhir_care_plan = serializers.DictField(required=False, allow_null=True)
    stored_id = serializers.CharField(required=False)
    mode = serializers.CharField(required=False)
    error = serializers.CharField(required=False, allow_null=True)


class SurgicalProcedureListResponseSerializer(serializers.Serializer):
    """Response from GET /api/ai/surgical/procedures/."""

    procedures = serializers.ListField(child=serializers.DictField(), required=False)
    results = serializers.ListField(child=serializers.DictField(), required=False)
    error = serializers.CharField(required=False, allow_null=True)


class SurgicalProcedureDetailResponseSerializer(serializers.Serializer):
    """Response from GET /api/ai/surgical/procedures/{key}/."""

    key = serializers.CharField(required=False)
    name = serializers.CharField(required=False)
    display_name = serializers.CharField(required=False)
    specialty = serializers.CharField(required=False)
    min_facility_level = serializers.CharField(required=False)
    urgency_categories = serializers.ListField(child=serializers.CharField(), required=False)
    icd10_code = serializers.CharField(required=False, allow_blank=True)
    error = serializers.CharField(required=False, allow_null=True)


class StoredSurgicalPreOpAssessSerializer(StoredAIResultSerializer):
    """Persisted surgical pre-op assessment for GET endpoint."""

    surgery_case_id = serializers.IntegerField(read_only=True)
    overall_risk_level = serializers.CharField(read_only=True)
    facility_capable = serializers.BooleanField(read_only=True)


class StoredSurgicalChecklistSessionSerializer(StoredAIResultSerializer):
    """Persisted surgical checklist advisory session for GET endpoint."""

    surgery_case_id = serializers.IntegerField(read_only=True)
    tibabot_session_id = serializers.CharField(read_only=True)
    current_phase = serializers.CharField(read_only=True)
    percent_complete = serializers.FloatField(read_only=True)
    phase_complete = serializers.BooleanField(read_only=True)


class StoredSurgicalPostOpCarePlanSerializer(StoredAIResultSerializer):
    """Persisted surgical post-op care plan for GET endpoint."""

    surgery_case_id = serializers.IntegerField(read_only=True)
    procedure_key = serializers.CharField(read_only=True)
    surgical_apgar_score = serializers.IntegerField(read_only=True)
    risk_level = serializers.CharField(read_only=True)


# =============================================================================
# Phase 7 — Investigation Suggestions
# =============================================================================


class InvestigationSuggestRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/investigations/suggest/."""

    chief_complaint = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=1000,
        help_text="Chief complaint or reason for visit.",
    )
    diagnoses = serializers.ListField(
        child=serializers.CharField(max_length=500),
        required=False,
        default=list,
        help_text="Working/confirmed diagnoses (free text or ICD-10 descriptions).",
    )
    symptoms = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False,
        default=list,
        help_text="Current symptoms.",
    )
    existing_orders = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False,
        default=list,
        help_text="Investigations already ordered (excluded from suggestions).",
    )
    existing_results = serializers.DictField(
        required=False,
        default=dict,
        help_text="Lab results already available (test → value).",
    )
    patient_age = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=0,
        max_value=120,
        help_text="Patient age in years.",
    )
    patient_sex = serializers.ChoiceField(
        choices=["M", "F"],
        required=False,
        allow_null=True,
        help_text="Patient sex (M or F).",
    )
    is_pregnant = serializers.BooleanField(
        required=False,
        default=False,
        help_text="Whether patient is pregnant.",
    )
    facility_level = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=5,
        help_text="Kenya facility level (H1–H5).",
    )
    region = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=50,
        help_text="Geographic region for protocol rules (e.g. 'lake_endemic').",
    )
    include_fhir = serializers.BooleanField(
        required=False,
        default=False,
        help_text="Include draft FHIR R4 ServiceRequest resources in response.",
    )
    max_suggestions = serializers.IntegerField(
        required=False,
        default=15,
        min_value=1,
        max_value=50,
        help_text="Maximum number of suggestions to return.",
    )
    encounter_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="Link result to this encounter for persistence.",
    )


class StoredInvestigationSuggestSerializer(StoredAIResultSerializer):
    """Persisted investigation suggestion result for GET endpoint."""

    encounter_id = serializers.IntegerField(allow_null=True, read_only=True)
    matched_conditions = serializers.ListField(child=serializers.CharField(), read_only=True)
    suggestion_count = serializers.IntegerField(read_only=True)


# =============================================================================
# AI Advisory → Order link
# =============================================================================


class AIAdvisoryOrderLinkSerializer(serializers.Serializer):
    """Read serializer for advisory-order links."""

    id = serializers.IntegerField(read_only=True)
    ai_result_id = serializers.UUIDField(read_only=True)
    suggestion_category = serializers.CharField(read_only=True)
    suggestion_index = serializers.IntegerField(read_only=True)
    suggestion_text = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    lab_order_id = serializers.IntegerField(allow_null=True, read_only=True)
    imaging_order_id = serializers.IntegerField(allow_null=True, read_only=True)
    prescription_id = serializers.IntegerField(allow_null=True, read_only=True)
    actioned_by = serializers.IntegerField(allow_null=True, source="actioned_by_id", read_only=True)
    actioned_at = serializers.DateTimeField(allow_null=True, read_only=True)
    created_at = serializers.DateTimeField(read_only=True)

    # Denormalised order number for display
    order_number = serializers.SerializerMethodField()

    def get_order_number(self, obj: "AIAdvisoryOrderLink") -> str | None:  # type: ignore[name-defined]  # noqa: F821
        if obj.lab_order_id:
            return getattr(obj.lab_order, "order_number", None)
        if obj.imaging_order_id:
            return getattr(obj.imaging_order, "order_number", None)
        if obj.prescription_id:
            return getattr(obj.prescription, "prescription_number", None)
        return None


class AIAdvisoryOrderLinkActionSerializer(serializers.Serializer):
    """Write serializer for actioning a suggestion (order / decline / N/A)."""

    status = serializers.ChoiceField(choices=["ORDERED", "DECLINED", "NOT_APPLICABLE"])
    lab_order_id = serializers.IntegerField(required=False, allow_null=True)
    imaging_order_id = serializers.IntegerField(required=False, allow_null=True)
    prescription_id = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs: dict) -> dict:
        if attrs["status"] == "ORDERED":
            order_count = sum(
                1
                for key in ("lab_order_id", "imaging_order_id", "prescription_id")
                if attrs.get(key)
            )
            if order_count != 1:
                raise serializers.ValidationError(
                    "Exactly one of lab_order_id, imaging_order_id, or prescription_id "
                    "is required when status is ORDERED."
                )
        return attrs


class AIAdvisoryBulkSeedSerializer(serializers.Serializer):
    """Seed suggestion rows from an AI result's result_data."""

    ai_result_id = serializers.UUIDField()
    ai_result_type = serializers.ChoiceField(
        choices=[
            "pre_op_assessment",
            "post_op_care_plan",
        ],
        help_text="Which AI result model to reference.",
    )


# =============================================================================
# Proactive Insights
# =============================================================================


class ProactiveInsightVitalsSerializer(serializers.Serializer):
    """Vitals for proactive insight evaluation."""

    spo2 = serializers.FloatField(required=False, allow_null=True)
    pulse = serializers.IntegerField(required=False, allow_null=True)
    temperature = serializers.FloatField(required=False, allow_null=True)
    respiratory_rate = serializers.IntegerField(required=False, allow_null=True)
    systolic_bp = serializers.IntegerField(required=False, allow_null=True)
    diastolic_bp = serializers.IntegerField(required=False, allow_null=True)


class ProactiveInsightPatientContextSerializer(serializers.Serializer):
    """Patient context for proactive insights."""

    patient_age = serializers.IntegerField(required=False, allow_null=True)
    patient_sex = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    allergies = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    comorbidities = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    current_medications = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )


class ProactiveInsightEncounterContextSerializer(serializers.Serializer):
    """Encounter context for proactive insights."""

    chief_complaint = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=2000
    )
    vitals = ProactiveInsightVitalsSerializer(required=False, default=dict)
    diagnoses = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    clinical_notes = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=5000
    )


class ProactiveInsightsRequestSerializer(serializers.Serializer):
    """Request for POST /api/ai/clinical/proactive-insights/"""

    patient_context = ProactiveInsightPatientContextSerializer(required=True)
    encounter_context = ProactiveInsightEncounterContextSerializer(required=True)
    context_hash = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=32,
        help_text="Hash of previous context. If unchanged, server returns cached results.",
    )
    include_llm = serializers.BooleanField(
        required=False,
        default=True,
        help_text="Whether to include Tier 3 LLM insights. Set false for faster responses.",
    )


class ProactiveInsightItemSerializer(serializers.Serializer):
    """A single proactive insight."""

    id = serializers.CharField()
    tier = serializers.IntegerField(min_value=1, max_value=3)
    severity = serializers.ChoiceField(choices=["critical", "warning", "info"])
    title = serializers.CharField()
    message = serializers.CharField()
    category = serializers.CharField()
    confidence = serializers.FloatField(min_value=0.0, max_value=1.0)
    source = serializers.CharField()
    references = serializers.ListField(child=serializers.CharField(), required=False, default=list)


class ProactiveInsightTierCountsSerializer(serializers.Serializer):
    """Tier breakdown counts."""

    tier1 = serializers.IntegerField()
    tier2 = serializers.IntegerField()
    tier3 = serializers.IntegerField()


class ProactiveInsightsResponseSerializer(serializers.Serializer):
    """Response for POST /api/ai/clinical/proactive-insights/"""

    insights = ProactiveInsightItemSerializer(many=True)
    context_hash = serializers.CharField()
    tier_counts = ProactiveInsightTierCountsSerializer()
    total = serializers.IntegerField()


# =============================================================================
# Webhook serializers
# =============================================================================

_WEBHOOK_EVENT_CHOICES = [
    "clinical_assist_completed",
    "clinical_chat_completed",
    "document_generated",
    "patient_created",
    "screening_completed",
    "alert_triggered",
]


class WebhookRegisterRequestSerializer(serializers.Serializer):
    """Request for POST /api/ai/webhooks/ — register a new webhook subscription."""

    url = serializers.URLField(help_text="Your webhook receiver endpoint URL.")
    events = serializers.ListField(
        child=serializers.ChoiceField(choices=_WEBHOOK_EVENT_CHOICES),
        help_text="List of TibaBot events to subscribe to.",
    )
    secret = serializers.CharField(
        max_length=200,
        help_text="Shared secret for HMAC-SHA256 payload verification.",
    )


class WebhookUpdateRequestSerializer(serializers.Serializer):
    """Request for PUT /api/ai/webhooks/{id}/ — update a webhook subscription."""

    url = serializers.URLField(required=False, help_text="Updated receiver URL.")
    events = serializers.ListField(
        child=serializers.ChoiceField(choices=_WEBHOOK_EVENT_CHOICES),
        required=False,
        help_text="Updated event list.",
    )
    secret = serializers.CharField(
        max_length=200,
        required=False,
        help_text="Updated shared secret.",
    )


class WebhookDeliverySerializer(serializers.Serializer):
    """A single webhook delivery attempt."""

    id = serializers.CharField()
    status = serializers.CharField()
    status_code = serializers.IntegerField(required=False, default=0)
    attempted_at = serializers.CharField(required=False, allow_blank=True, default="")
    response_body = serializers.CharField(required=False, allow_blank=True, default="")


class WebhookItemSerializer(serializers.Serializer):
    """A registered webhook subscription."""

    id = serializers.CharField()
    url = serializers.CharField()
    events = serializers.ListField(child=serializers.CharField())
    is_active = serializers.BooleanField(default=True)
    created_at = serializers.CharField(required=False, allow_blank=True, default="")


class WebhookListResponseSerializer(serializers.Serializer):
    """Response for GET /api/ai/webhooks/"""

    webhooks = WebhookItemSerializer(many=True)


class WebhookDeliveryListResponseSerializer(serializers.Serializer):
    """Response for GET /api/ai/webhooks/{id}/deliveries/"""

    deliveries = WebhookDeliverySerializer(many=True)


# =============================================================================
# Facility Knowledge Base serializers
# =============================================================================


class FacilityKBDocumentSerializer(serializers.Serializer):
    """A document in the facility knowledge base."""

    id = serializers.CharField()
    filename = serializers.CharField()
    size_bytes = serializers.IntegerField(required=False, default=0)
    uploaded_at = serializers.CharField(required=False, allow_blank=True, default="")
    status = serializers.CharField(required=False, allow_blank=True, default="processed")


class FacilityKBInfoResponseSerializer(serializers.Serializer):
    """Response for GET /api/ai/facility/knowledge-base/"""

    facility_name = serializers.CharField(required=False, allow_blank=True, default="")
    document_count = serializers.IntegerField(required=False, default=0)
    documents = FacilityKBDocumentSerializer(many=True, required=False, default=list)
    total_size_bytes = serializers.IntegerField(required=False, default=0)


class FacilityKBSearchResultSerializer(serializers.Serializer):
    """A single search result from facility KB search."""

    id = serializers.CharField()
    filename = serializers.CharField()
    snippet = serializers.CharField(required=False, allow_blank=True, default="")
    score = serializers.FloatField(required=False, default=0.0)


class FacilityKBSearchResponseSerializer(serializers.Serializer):
    """Response for GET /api/ai/facility/knowledge-base/search/"""

    results = FacilityKBSearchResultSerializer(many=True)
    query = serializers.CharField(required=False, allow_blank=True, default="")
    total = serializers.IntegerField(required=False, default=0)


class FacilityKBUploadResponseSerializer(serializers.Serializer):
    """Response for POST /api/ai/facility/knowledge-base/documents/"""

    id = serializers.CharField()
    filename = serializers.CharField()
    status = serializers.CharField(required=False, allow_blank=True, default="processing")
    size_bytes = serializers.IntegerField(required=False, default=0)


class FacilityKBDocumentDeleteResponseSerializer(serializers.Serializer):
    """Response for DELETE /api/ai/facility/knowledge-base/documents/{id}/"""

    status = serializers.CharField(default="deleted")
    message = serializers.CharField(required=False, allow_blank=True, default="")
