# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Billing serializers facility automation for Vitora HMIS.

What this file is for:
- Implement serializers facility automation logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from rest_framework import serializers

from hmis.apps.billing.models import BillingAutomationRule


class FacilityBillingConfigSerializer(serializers.ModelSerializer):
    """Serializer for FacilityBillingConfig model.

    M-Pesa API secrets (consumer_key, consumer_secret, passkey) are
    intentionally EXCLUDED — they are KMS-encrypted and never returned
    in API responses.
    """

    facility_name = serializers.CharField(source="facility.name", read_only=True)
    facility_mfl_code = serializers.CharField(source="facility.mfl_code", read_only=True)

    # Computed properties
    is_sha_accredited = serializers.BooleanField(read_only=True)
    is_sha_contract_active = serializers.BooleanField(read_only=True)
    sha_accreditation_days_remaining = serializers.IntegerField(read_only=True)
    sha_contract_days_remaining = serializers.IntegerField(read_only=True)
    has_mpesa_credentials = serializers.BooleanField(read_only=True)
    has_sha_credentials = serializers.BooleanField(read_only=True)
    automation_rules = serializers.SerializerMethodField()

    def get_automation_rules(self, obj):
        rules = obj.automation_rules.all().order_by("name")
        return BillingAutomationRuleSerializer(rules, many=True).data

    class Meta:
        from hmis.apps.billing.models import FacilityBillingConfig

        model = FacilityBillingConfig
        fields = [
            "id",
            "facility",
            "facility_name",
            "facility_mfl_code",
            # Billing defaults
            "default_payment_type",
            "default_due_days",
            "auto_finalize_on_checkout",
            "tax_rate",
            # SHA accreditation
            "sha_accreditation_status",
            "sha_accreditation_date",
            "sha_accreditation_expiry",
            "is_sha_accredited",
            "sha_accreditation_days_remaining",
            # SHA contract
            "sha_contract_number",
            "sha_contract_start",
            "sha_contract_end",
            "sha_service_level",
            "sha_max_claim_amount",
            "hide_capitation_interventions",
            "is_sha_contract_active",
            "sha_contract_days_remaining",
            # Fee schedule
            "fee_schedule_name",
            "fee_schedule_override",
            # Collection accounts
            "mpesa_paybill",
            "mpesa_account_ref",
            "bank_name",
            "bank_account_number",
            "bank_branch",
            # M-Pesa (non-secret only — secrets are write-only)
            "mpesa_shortcode",
            "mpesa_callback_url",
            "mpesa_environment",
            "mpesa_initiator_name",
            "has_mpesa_credentials",
            # SHA/DHA ILM (non-secret only — secrets are write-only)
            "sha_agent_code",
            "sha_facility_fr_code",
            "sha_api_environment",
            "sha_encrypted_pin",
            "has_sha_credentials",
            "automation_rules",
            # Timestamps
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "has_mpesa_credentials",
            "has_sha_credentials",
        ]


class FacilityBillingConfigCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating FacilityBillingConfig.

    M-Pesa secrets are accepted as write-only fields and stored via
    KMS-encrypted property setters on the model.
    """

    # Write-only secret fields — accepted on POST/PATCH, never returned
    mpesa_consumer_key = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=""
    )
    mpesa_consumer_secret = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=""
    )
    mpesa_passkey = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=""
    )
    # SHA/DHA ILM write-only secret fields
    mpesa_security_credential = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=""
    )

    sha_consumer_key = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=""
    )
    sha_client_id = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=""
    )
    sha_client_secret = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=""
    )
    sha_username = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=""
    )
    sha_password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=""
    )
    automation_rules = serializers.ListSerializer(
        child=serializers.DictField(), required=False, write_only=True
    )

    class Meta:
        from hmis.apps.billing.models import FacilityBillingConfig

        model = FacilityBillingConfig
        fields = [
            "facility",
            "default_payment_type",
            "default_due_days",
            "auto_finalize_on_checkout",
            "tax_rate",
            "sha_accreditation_status",
            "sha_accreditation_date",
            "sha_accreditation_expiry",
            "sha_contract_number",
            "sha_contract_start",
            "sha_contract_end",
            "sha_service_level",
            "sha_max_claim_amount",
            "hide_capitation_interventions",
            "fee_schedule_name",
            "fee_schedule_override",
            "mpesa_paybill",
            "mpesa_account_ref",
            "bank_name",
            "bank_account_number",
            "bank_branch",
            # M-Pesa API credentials (write-only — goes through KMS)
            "mpesa_consumer_key",
            "mpesa_consumer_secret",
            "mpesa_passkey",
            "mpesa_initiator_name",
            "mpesa_security_credential",
            "mpesa_shortcode",
            "mpesa_callback_url",
            "mpesa_environment",
            # SHA/DHA ILM API credentials (write-only — goes through KMS)
            "sha_consumer_key",
            "sha_client_id",
            "sha_client_secret",
            "sha_username",
            "sha_password",
            "sha_agent_code",
            "sha_facility_fr_code",
            "sha_encrypted_pin",
            "sha_api_environment",
            "automation_rules",
        ]

    def _upsert_automation_rules(self, instance, rules_data: list[dict]) -> None:
        keep_ids: set[int] = set()
        for raw in rules_data:
            rule_id = raw.get("id")
            payload = {
                "name": raw.get("name", "").strip(),
                "is_active": bool(raw.get("is_active", True)),
                "trigger": raw.get("trigger", BillingAutomationRule.Trigger.ENCOUNTER_CREATED),
                "recurrence": raw.get("recurrence", BillingAutomationRule.Recurrence.ONCE),
                "repeat_every_days": int(raw.get("repeat_every_days", 1) or 1),
                "service_id": raw.get("service"),
                "item_type": raw.get("item_type", "service"),
                "quantity": raw.get("quantity", "1.00"),
                "unit_price_override": raw.get("unit_price_override"),
                "description_template": raw.get("description_template", ""),
                "encounter_types": raw.get("encounter_types", []),
            }

            if rule_id:
                rule = instance.automation_rules.filter(pk=rule_id).first()
                if not rule:
                    continue
                for field, value in payload.items():
                    setattr(rule, field, value)
                rule.full_clean()
                rule.save()
                keep_ids.add(rule.id)
                continue

            rule = BillingAutomationRule.objects.create(
                billing_config=instance,
                **payload,
            )
            keep_ids.add(rule.id)

        if rules_data is not None:
            instance.automation_rules.exclude(id__in=keep_ids).delete()

    def create(self, validated_data):
        automation_rules = validated_data.pop("automation_rules", [])
        # Pop secrets and set via KMS property setters
        mpesa_secrets = {
            k: validated_data.pop(k, "")
            for k in (
                "mpesa_consumer_key",
                "mpesa_consumer_secret",
                "mpesa_passkey",
                "mpesa_security_credential",
            )
        }
        sha_secrets = {
            k: validated_data.pop(k, "")
            for k in (
                "sha_consumer_key",
                "sha_client_id",
                "sha_client_secret",
                "sha_username",
                "sha_password",
            )
        }
        instance = super().create(validated_data)

        update_fields = []
        for attr, value in mpesa_secrets.items():
            if value:
                setattr(instance, attr, value)
                update_fields.append(f"{attr}_encrypted")
        for attr, value in sha_secrets.items():
            if value:
                setattr(instance, attr, value)
                update_fields.append(f"{attr}_encrypted")
        if update_fields:
            instance.save(update_fields=update_fields)
        if automation_rules:
            self._upsert_automation_rules(instance, automation_rules)
        return instance

    def update(self, instance, validated_data):
        automation_rules = validated_data.pop("automation_rules", None)
        # Pop secrets and set via KMS property setters
        mpesa_secrets = {
            k: validated_data.pop(k, "")
            for k in (
                "mpesa_consumer_key",
                "mpesa_consumer_secret",
                "mpesa_passkey",
                "mpesa_security_credential",
            )
        }
        sha_secrets = {
            k: validated_data.pop(k, "")
            for k in (
                "sha_consumer_key",
                "sha_client_id",
                "sha_client_secret",
                "sha_username",
                "sha_password",
            )
        }
        instance = super().update(instance, validated_data)
        changed = []
        for attr, value in mpesa_secrets.items():
            if value:
                setattr(instance, attr, value)
                changed.append(f"{attr}_encrypted")
        for attr, value in sha_secrets.items():
            if value:
                setattr(instance, attr, value)
                changed.append(f"{attr}_encrypted")
        if changed:
            instance.save(update_fields=changed)
        if automation_rules is not None:
            self._upsert_automation_rules(instance, automation_rules)
        return instance


class BillingAutomationRuleSerializer(serializers.ModelSerializer):
    service_code = serializers.CharField(source="service.code", read_only=True)
    service_name = serializers.CharField(source="service.name", read_only=True)

    class Meta:
        model = BillingAutomationRule
        fields = [
            "id",
            "name",
            "is_active",
            "trigger",
            "recurrence",
            "repeat_every_days",
            "service",
            "service_code",
            "service_name",
            "item_type",
            "quantity",
            "unit_price_override",
            "description_template",
            "encounter_types",
            "created_at",
            "updated_at",
        ]


class SHAContractSummarySerializer(serializers.Serializer):
    """Read-only serializer for SHA contract tracking across facilities."""

    facility_id = serializers.IntegerField()
    facility_name = serializers.CharField()
    facility_mfl_code = serializers.CharField()
    sha_accreditation_status = serializers.CharField()
    sha_accreditation_expiry = serializers.DateField(allow_null=True)
    sha_contract_number = serializers.CharField()
    sha_contract_start = serializers.DateField(allow_null=True)
    sha_contract_end = serializers.DateField(allow_null=True)
    sha_service_level = serializers.CharField()
    is_sha_accredited = serializers.BooleanField()
    is_sha_contract_active = serializers.BooleanField()
    sha_accreditation_days_remaining = serializers.IntegerField(allow_null=True)
    sha_contract_days_remaining = serializers.IntegerField(allow_null=True)


# ===========================================================================
# Accounts Payable: Supplier Bills & Payments
# ===========================================================================
