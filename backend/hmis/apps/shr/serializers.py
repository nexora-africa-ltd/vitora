# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""DRF serializers for DHA Shared Health Record consent operations."""

from rest_framework import serializers

from hmis.apps.shr.models import SHRConsentVisit


class SHRConsentVisitSerializer(serializers.ModelSerializer):
    """Read-only local SHR visit state without exposing the bearer token."""

    class Meta:
        model = SHRConsentVisit
        fields = [
            "id",
            "patient",
            "encounter",
            "consent_id",
            "visit_id",
            "visit_type",
            "request_kind",
            "status",
            "otp_record",
            "requested_by",
            "practitioner_id",
            "representative_cr_id",
            "representative_relationship",
            "patient_capable",
            "emergency",
            "incapacity_reason",
            "start_date",
            "end_date",
            "approved_at",
            "closed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class SHRConsentRequestSerializer(serializers.Serializer):
    """Validate standard, emergency, and representative SHR consent requests."""

    patient_id = serializers.IntegerField()
    encounter_id = serializers.IntegerField(required=False)
    requested_by = serializers.CharField(max_length=200)
    visit_type = serializers.ChoiceField(choices=SHRConsentVisit.VisitType.choices)
    request_kind = serializers.ChoiceField(
        choices=SHRConsentVisit.RequestKind.choices, default=SHRConsentVisit.RequestKind.STANDARD
    )
    practitioner_id = serializers.CharField(max_length=100, required=False, allow_blank=True)
    emergency = serializers.BooleanField(default=False)
    patient_capable = serializers.BooleanField(default=True)
    incapacity_reason = serializers.CharField(required=False, allow_blank=True)
    representative_cr_id = serializers.CharField(required=False, allow_blank=True)
    representative_relationship = serializers.ChoiceField(
        choices=["Healthcare Proxy", "Sibling", "Principal", "Other"],
        required=False,
        allow_blank=True,
    )
    start_date = serializers.DateField(required=False)

    def validate(self, attrs):
        emergency = attrs["emergency"]
        patient_capable = attrs["patient_capable"]
        representative_cr_id = attrs.get("representative_cr_id", "")
        relationship = attrs.get("representative_relationship", "")
        reason = attrs.get("incapacity_reason", "")
        if emergency and not reason:
            raise serializers.ValidationError(
                {"incapacity_reason": "Required for emergency consent."}
            )
        if not patient_capable and not representative_cr_id:
            raise serializers.ValidationError(
                {"representative_cr_id": "Required when patient cannot consent."}
            )
        if representative_cr_id and not relationship:
            raise serializers.ValidationError(
                {"representative_relationship": "Required with a representative CR ID."}
            )
        return attrs


class SHROTPVerificationSerializer(serializers.Serializer):
    """Validate an SHR consent decision and OTP challenge response."""

    otp = serializers.CharField(required=False, allow_blank=True)
    otp_record = serializers.CharField(required=False, allow_blank=True)
    consent_decision = serializers.ChoiceField(
        choices=["Approve", "Reject", "1", "0"], required=False
    )
    rejection_reason = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        decision = attrs.get("consent_decision", "Approve")
        if str(decision) in {"Reject", "0"} and not attrs.get("rejection_reason"):
            raise serializers.ValidationError(
                {"rejection_reason": "Required when consent is rejected."}
            )
        if str(decision) not in {"Reject", "0"} and (
            not attrs.get("otp") or not attrs.get("otp_record")
        ):
            raise serializers.ValidationError("otp and otp_record are required for approval.")
        return attrs


class SHRCloseVisitSerializer(serializers.Serializer):
    """Validate immediate closure for an incapable patient."""

    patient_incapable = serializers.BooleanField(default=False)
    incapacity_reason = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs["patient_incapable"] and not attrs.get("incapacity_reason"):
            raise serializers.ValidationError(
                {"incapacity_reason": "Required when patient is incapable."}
            )
        return attrs
