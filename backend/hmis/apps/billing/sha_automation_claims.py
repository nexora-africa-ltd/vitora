# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: F405
"""Billing sha automation claims for Vitora HMIS.

What this file is for:
- Implement sha automation claims logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.billing.sha_automation_shared import *  # noqa: F403
from hmis.apps.billing.sha_automation_shared import (
    _resolve_fr_code,
    _sha_automation_handled_exceptions,
)


class SHAClaimAutomationClaimsMixin:
    @classmethod
    def auto_trigger_consent(cls, patient_id: int, facility_id: int) -> dict:
        """
        Automatically send OTP consent when a SHA-eligible patient is queued.

        Called by the clinic queue signal when a patient is added to the queue.
        Only triggers if the patient has active SHA membership and no valid
        consent token from today.

        Returns:
            Dict with status: 'sent', 'already_valid', 'not_eligible', or 'error'
        """
        from hmis.apps.billing.models import ConsentToken, SHAMember
        from hmis.apps.billing.services.sha_consent import SHAConsentService

        try:
            from hmis.apps.core.models import Facility

            facility = Facility.objects.filter(pk=facility_id).first()
            if not facility:
                return {"status": "error", "reason": f"Facility {facility_id} not found"}

            # Check SHA membership
            sha_member = SHAMember.objects.filter(
                patient_id=patient_id,
                status=SHAMember.MembershipStatus.ACTIVE,
            ).first()

            if not sha_member:
                return {"status": "not_eligible", "reason": "No active SHA membership"}

            # Check if consent already sent or validated today (avoid duplicate OTP)
            today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
            existing_consent = ConsentToken.objects.filter(
                sha_member=sha_member,
                created_at__gte=today_start,
                status__in=[
                    ConsentToken.ConsentStatus.PENDING,
                    ConsentToken.ConsentStatus.VALIDATED,
                ],
            ).first()

            if existing_consent:
                status_label = (
                    "already_valid"
                    if existing_consent.status == ConsentToken.ConsentStatus.VALIDATED
                    else "already_sent"
                )
                return {
                    "status": status_label,
                    "reason": f"Consent token already {existing_consent.status} today",
                }

            # Auto-send OTP
            service = SHAConsentService(facility=facility)
            # Resolve DHA FR code for the agent payload
            agent_code = _resolve_fr_code(facility) or facility.mfl_code or ""
            result = service.send_otp(
                sha_member=sha_member,
                facility_code=agent_code,
                user=None,
                facility=facility,
            )

            from hmis.apps.core.events import BillingEvents, publish_event

            publish_event(
                event_type=BillingEvents.CONSENT_OTP_SENT,
                aggregate_type="SHAConsentToken",
                aggregate_id=sha_member.pk,
                payload={
                    "patient_id": patient_id,
                    "trigger": "auto_queue_checkin",
                    "facility_id": facility_id,
                },
                facility_id=facility_id,
            )

            return {"status": "sent", "result": result}

        except _sha_automation_handled_exceptions() as e:
            logger.warning(
                "Auto-consent trigger failed for patient %s: %s",
                patient_id,
                str(e),
            )
            return {"status": "error", "reason": str(e)}

    # -------------------------------------------------------------------------
    # 2. Auto-start visit on encounter creation
    # -------------------------------------------------------------------------

    @classmethod
    def auto_start_visit(cls, encounter_id: int) -> dict:
        """
        Automatically start a DHA visit when a SHA-eligible encounter is created.

        Requires valid consent token. If no consent, queues for retry.
        For OTP consent, auto-start is not possible (OTP code is not stored);
        the user must start the visit manually via the StartVisitView.

        Returns:
            Dict with status: 'started', 'no_consent', 'not_eligible',
            'already_started', 'needs_manual_start', 'error'
        """
        from hmis.apps.billing.models import ConsentToken, SHAClaim, SHAMember
        from hmis.apps.billing.services.ilm_claim_service import IlmClaimService
        from hmis.apps.encounters.models import Encounter

        try:
            encounter = Encounter.objects.select_related("patient", "facility").get(pk=encounter_id)

            # Check if this encounter already has a claim with visit started
            existing_claim = SHAClaim.objects.filter(
                encounter=encounter,
                dha_visit_started_at__isnull=False,
            ).exists()

            if existing_claim:
                return {"status": "already_started"}

            # Check SHA membership
            sha_member = SHAMember.objects.filter(
                patient=encounter.patient,
                status=SHAMember.MembershipStatus.ACTIVE,
            ).first()

            if not sha_member:
                return {"status": "not_eligible", "reason": "No active SHA membership"}

            # Find valid consent token
            today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
            consent_token = ConsentToken.objects.filter(
                sha_member=sha_member,
                created_at__gte=today_start,
                status=ConsentToken.ConsentStatus.VALIDATED,
            ).first()

            if not consent_token:
                return {"status": "no_consent", "reason": "No valid consent token"}

            # Find or create the SHA claim for this encounter
            claim = SHAClaim.objects.filter(encounter=encounter).first()
            if not claim:
                return {"status": "no_claim", "reason": "No SHA claim for encounter"}

            # Auto-start only works for biometric consent (auth_guid is stored).
            # OTP code is not stored on ConsentToken for security — the user
            # must start the visit manually via StartVisitView.
            if not consent_token.auth_guid:
                return {
                    "status": "needs_manual_start",
                    "reason": "OTP consent requires manual visit start via StartVisitView",
                }

            # Start the visit
            facility = encounter.facility
            service = IlmClaimService(facility=facility)

            # Derive intervention codes from encounter clinical data,
            # falling back to codes sent with the OTP request
            from hmis.apps.billing.services.ilm_claim_service import StartVisitParams

            suggestions = cls.suggest_interventions_for_encounter(encounter_id)
            codes = [s["code"] for s in suggestions] or (consent_token.intervention_codes or [])

            service_type = "INPATIENT" if encounter.encounter_type == "IPD" else "OUTPATIENT"
            params = StartVisitParams(
                otp="",
                auth_guid=consent_token.auth_guid,
                patient_id=consent_token.identification_number,
                intervention_codes=codes,
                service_type=service_type,
            )

            result = service.start_visit(
                claim=claim,
                params=params,
                user=None,
            )

            if result and result.status_code < 400:
                claim.dha_visit_started_at = timezone.now()
                claim.save(update_fields=["dha_visit_started_at", "updated_at"])

                from hmis.apps.core.events import BillingEvents, publish_event

                publish_event(
                    event_type=BillingEvents.DHA_CLAIM_VISIT_STARTED,
                    aggregate_type="SHAClaim",
                    aggregate_id=claim.pk,
                    payload={
                        "claim_number": claim.claim_number,
                        "encounter_id": encounter_id,
                        "trigger": "auto_encounter_created",
                    },
                    facility_id=getattr(facility, "id", None),
                )

                return {"status": "started", "claim_id": claim.pk}

            return {"status": "error", "reason": "DHA visit start returned failure"}

        except _sha_automation_handled_exceptions() as e:
            logger.exception("Auto-start visit failed for encounter %s", encounter_id)
            return {"status": "error", "reason": str(e)}

    # -------------------------------------------------------------------------
    # 3. Auto-populate interventions from clinical actions
    # -------------------------------------------------------------------------

    @classmethod
    def suggest_interventions_for_encounter(cls, encounter_id: int) -> list[dict]:
        """
        Suggest SHA interventions based on clinical actions recorded on an encounter.

        Maps lab orders, prescriptions, and procedures to SHA intervention codes
        using the SHATariff catalog.

        NOTE: This performs LOCAL matching only (fast, offline-capable). It does NOT
        call DHA to verify entitlement or check utilization caps. The frontend
        should call `ilmBenefitInterventions` and `ilmUtilization` to verify that
        the patient is entitled to a suggested intervention before attaching it.
        Each suggestion includes a `needs_entitlement_check: true` flag to signal
        this to the frontend.

        Returns:
            List of suggested interventions with codes, names, and source references.
        """
        from hmis.apps.billing.models import SHAClaim, SHAClaimIntervention
        from hmis.apps.encounters.models import Encounter

        try:
            encounter = Encounter.objects.get(pk=encounter_id)
            suggestions = []

            # Get the claim for this encounter
            claim = SHAClaim.objects.filter(encounter=encounter).first()
            if not claim:
                return []

            # Already-attached intervention codes (avoid duplicates)
            existing_codes = set(
                SHAClaimIntervention.objects.filter(claim=claim).values_list(
                    "intervention_code", flat=True
                )
            )

            # --- Lab orders → SHA lab interventions ---
            lab_orders = encounter.lab_orders.all() if hasattr(encounter, "lab_orders") else []
            for order in lab_orders:
                matched = cls._match_intervention(
                    order.test_name if hasattr(order, "test_name") else str(order),
                    category="laboratory",
                )
                for intervention in matched:
                    if intervention["code"] not in existing_codes:
                        suggestions.append(
                            {
                                **intervention,
                                "source": "lab_order",
                                "source_id": order.pk,
                                "source_name": getattr(order, "test_name", str(order)),
                                "needs_entitlement_check": True,
                            }
                        )

            # --- Prescriptions → SHA pharmacy interventions ---
            prescriptions = (
                encounter.prescriptions.all() if hasattr(encounter, "prescriptions") else []
            )
            for rx in prescriptions:
                matched = cls._match_intervention(
                    rx.medication_name if hasattr(rx, "medication_name") else str(rx),
                    category="pharmacy",
                )
                for intervention in matched:
                    if intervention["code"] not in existing_codes:
                        suggestions.append(
                            {
                                **intervention,
                                "source": "prescription",
                                "source_id": rx.pk,
                                "source_name": getattr(rx, "medication_name", str(rx)),
                                "needs_entitlement_check": True,
                            }
                        )

            # --- Diagnoses → SHA consultation/management interventions ---
            diagnoses = encounter.diagnoses.all() if hasattr(encounter, "diagnoses") else []
            for dx in diagnoses:
                matched = cls._match_intervention(
                    dx.description if hasattr(dx, "description") else str(dx),
                    category="consultation",
                )
                for intervention in matched:
                    if intervention["code"] not in existing_codes:
                        suggestions.append(
                            {
                                **intervention,
                                "source": "diagnosis",
                                "source_id": dx.pk,
                                "source_name": getattr(dx, "description", str(dx)),
                                "needs_entitlement_check": True,
                            }
                        )

            return suggestions

        except _sha_automation_handled_exceptions() as e:
            logger.warning("Intervention suggestion failed for encounter %s: %s", encounter_id, e)
            return []

    @classmethod
    def _match_intervention(cls, search_term: str, category: str = "") -> list[dict]:
        """
        Match a clinical term to SHA tariff codes using keyword search.

        Uses the local SHATariff catalog (refreshed weekly from OCL).
        """
        from hmis.apps.billing.models import SHATariff

        if not search_term:
            return []

        queryset = SHATariff.objects.filter(is_active=True)

        # Category-based filtering
        if category == "laboratory":
            queryset = queryset.filter(category=SHATariff.TariffCategory.LABORATORY)
        elif category == "pharmacy":
            queryset = queryset.filter(category=SHATariff.TariffCategory.PHARMACY)
        elif category == "consultation":
            queryset = queryset.filter(category=SHATariff.TariffCategory.CONSULTATION)

        # Keyword search
        keywords = search_term.split()[:3]  # Use first 3 words
        q_filter = Q()
        for keyword in keywords:
            if len(keyword) > 2:  # Skip short words
                q_filter |= Q(name__icontains=keyword)

        if q_filter:
            queryset = queryset.filter(q_filter)

        results = []
        for tariff in queryset[:5]:  # Max 5 suggestions per term
            results.append(
                {
                    "code": tariff.code,
                    "name": tariff.name,
                    "tariff": str(tariff.amount) if hasattr(tariff, "amount") else None,
                    "benefit_package": tariff.category,
                }
            )

        return results

    @classmethod
    def auto_attach_interventions(cls, claim_id: int, interventions: list[dict]) -> dict:
        """
        Attach suggested interventions to a claim automatically.

        Only attaches if the claim is still in DRAFT status.

        Args:
            claim_id: SHAClaim primary key
            interventions: List of intervention dicts from suggest_interventions_for_encounter

        Returns:
            Dict with 'attached' count and 'skipped' count.
        """
        from hmis.apps.billing.models import SHAClaim, SHAClaimIntervention

        try:
            claim = SHAClaim.objects.get(pk=claim_id)
            if claim.status != SHAClaim.ClaimStatus.DRAFT:
                return {"attached": 0, "skipped": len(interventions), "reason": "not_draft"}

            attached = 0
            skipped = 0

            for intervention in interventions:
                # Check if already exists
                exists = SHAClaimIntervention.objects.filter(
                    claim=claim,
                    intervention_code=intervention["code"],
                ).exists()

                if exists:
                    skipped += 1
                    continue

                from hmis.apps.billing.services.intervention_fallback import (
                    get_local_intervention_claim_defaults,
                )

                facility_level = getattr(
                    getattr(claim, "facility", None), "level", None
                ) or getattr(
                    claim,
                    "facility_level",
                    None,
                )
                defaults = get_local_intervention_claim_defaults(
                    intervention["code"],
                    facility_level=facility_level,
                )
                override_tariff = (
                    Decimal(intervention["tariff"]) if intervention.get("tariff") else None
                )
                create_values = {
                    **defaults,
                    "intervention_name": intervention.get("name", "")
                    or defaults.get("intervention_name", ""),
                    "tariff_amount": override_tariff
                    if override_tariff is not None
                    else defaults.get("tariff_amount"),
                }
                SHAClaimIntervention.objects.create(
                    claim=claim,
                    intervention_code=intervention["code"],
                    **create_values,
                )
                attached += 1

            return {"attached": attached, "skipped": skipped}

        except _sha_automation_handled_exceptions() as e:
            logger.exception("Auto-attach interventions failed for claim %s", claim_id)
            return {"attached": 0, "skipped": 0, "error": str(e)}

    # -------------------------------------------------------------------------
    # 4. Auto-attach digital documents
    # -------------------------------------------------------------------------
