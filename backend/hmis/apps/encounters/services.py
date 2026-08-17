# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Services for encounters app.

Includes:
- encounter state machine transitions,
- patient-called notifications,
- vitals-derived clinical flag suggestion generation.
"""

from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.utils import timezone

from hmis.apps.core.models import AuditLog
from hmis.apps.core.services.notification_service import notify_user


class EncounterStateMachine:
    """
    Service for managing encounter state transitions.

    Validates transitions, updates encounter status, creates state
    history audit records, and logs to audit log.

    Sprint 2 - Phase 2A
    """

    @staticmethod
    def transition(
        encounter,
        to_status: str,
        user,
        reason: str = "",
        ip_address: str | None = None,
    ) -> dict:
        """
        Transition an encounter to a new status.

        Args:
            encounter: The Encounter instance
            to_status: Target status
            user: User performing the transition
            reason: Optional reason for the transition
            ip_address: Optional IP address for audit

        Returns:
            dict with transition details

        Raises:
            ValidationError: If the transition is not valid
        """
        from hmis.apps.encounters.models import EncounterStateHistory

        from_status = encounter.status

        # Check terminal states
        if not encounter.VALID_TRANSITIONS.get(from_status):
            raise ValidationError(
                f"Encounter is in terminal state '{from_status}'. No transitions allowed."
            )

        # Validate transition
        if not encounter.is_valid_transition(to_status):
            valid_targets = encounter.VALID_TRANSITIONS.get(from_status, set())
            raise ValidationError(
                f"Invalid transition from '{from_status}' to '{to_status}'. "
                f"Valid transitions: {', '.join(sorted(valid_targets)) or 'none'}."
            )

        # Special handling for CLOSED
        if to_status == "CLOSED":
            encounter.finalized_by = user
            encounter.finalized_at = timezone.now()

        # Update status
        encounter.status = to_status
        update_fields = ["status", "updated_at"]
        if to_status == "CLOSED":
            update_fields.extend(["finalized_by", "finalized_at"])
        encounter.save(update_fields=update_fields)

        # Create state history entry
        EncounterStateHistory.objects.create(
            encounter=encounter,
            from_status=from_status,
            to_status=to_status,
            changed_by=user,
            reason=reason,
        )

        # Create audit log
        AuditLog.log(
            action="encounter_transition",
            user=user,
            resource_type="Encounter",
            resource_id=encounter.id,
            ip_address=ip_address,
            user_agent="",
            patient_id=encounter.patient_id,
            details={
                "from_status": from_status,
                "to_status": to_status,
                "reason": reason,
                "encounter_type": encounter.encounter_type,
            },
        )

        return {
            "id": encounter.id,
            "status": to_status,
            "previous_status": from_status,
            "transitioned_at": timezone.now().isoformat(),
            "transitioned_by": user.username,
        }


def create_patient_called_notification(encounter, called_by):
    """
    Create a notification when a patient is called for consultation.

    Args:
        encounter: The Encounter instance being called
        called_by: The User who called the patient

    Returns:
        Notification: The created notification instance
    """
    patient = encounter.patient
    patient_name = f"{patient.first_name} {patient.last_name}"
    patient_mrn = patient.mrn

    # Create notification for staff in waiting room / reception
    # For now, we create one for the calling user (can be expanded)
    notification = notify_user(
        user=called_by,
        notification_type="patient_called",
        priority="high",
        title=f"Patient Called: {patient_name}",
        message=f"Patient {patient_name} (MRN: {patient_mrn}) has been called for consultation.",
        related_model="Encounter",
        related_id=encounter.id,
        action_url=f"/encounters/{encounter.id}",
    )

    if notification is None:
        raise ValueError("Failed to create patient-called notification")

    return notification


def broadcast_patient_called_notification(encounter, called_by, target_users=None):
    """
    Broadcast patient called notification to multiple users.

    Args:
        encounter: The Encounter instance being called
        called_by: The User who called the patient
        target_users: Optional list of users to notify. If None, defaults to
                      users with waiting room view permission.

    Returns:
        list[Notification]: List of created notifications
    """
    from django.contrib.auth import get_user_model

    get_user_model()  # Validates the model is available

    patient = encounter.patient
    patient_name = f"{patient.first_name} {patient.last_name}"
    patient_mrn = patient.mrn

    # If no target users specified, find users with appropriate permissions
    if target_users is None:
        # For now, notify the caller. In production, could check for:
        # - Users with 'view_waiting_room' permission
        # - Users in 'reception' group
        # - Users assigned to the same department
        target_users = [called_by]

    notifications = []
    for user in target_users:
        notification = notify_user(
            user=user,
            notification_type="patient_called",
            priority="high",
            title=f"Patient Called: {patient_name}",
            message=f"Patient {patient_name} (MRN: {patient_mrn}) has been called for consultation by {called_by.get_full_name() or called_by.username}.",
            related_model="Encounter",
            related_id=encounter.id,
            action_url=f"/encounters/{encounter.id}",
        )
        if notification is not None:
            notifications.append(notification)

    return notifications


class VitalFlagSuggestionService:
    """Generate and upsert vitals-derived clinician review suggestions."""

    RULE_VERSION = "1.0"

    ICD_MAP: dict[str, dict[str, str]] = {
        "HYPOXIA": {"icd10": "R09.02", "icd11": "MD71", "title": "Hypoxemia"},
        "HYPERTENSION_STAGE2": {
            "icd10": "I10",
            "icd11": "BA00",
            "title": "Essential (primary) hypertension",
        },
        "HYPERTENSIVE_CRISIS": {
            "icd10": "I16.9",
            "icd11": "BA00",
            "title": "Hypertensive urgency/emergency",
        },
        "BMI_UNDERWEIGHT": {"icd10": "R63.6", "icd11": "5B50", "title": "Underweight"},
        "BMI_OBESITY": {"icd10": "E66.9", "icd11": "5B81", "title": "Obesity"},
        "MALNUTRITION_SAM": {
            "icd10": "E43",
            "icd11": "5B54",
            "title": "Severe protein-energy malnutrition",
        },
        "MALNUTRITION_MAM": {
            "icd10": "E44.1",
            "icd11": "5B55",
            "title": "Moderate protein-energy malnutrition",
        },
    }

    @classmethod
    def detect_from_encounter(cls, encounter) -> list:
        """Evaluate encounter vitals and upsert relevant suggestions."""
        suggestions = []
        patient = getattr(encounter, "patient", None)
        if patient is None:
            return suggestions

        spo2 = float(encounter.spo2) if encounter.spo2 is not None else None
        systolic = encounter.get_systolic_bp() if hasattr(encounter, "get_systolic_bp") else None
        diastolic = encounter.get_diastolic_bp() if hasattr(encounter, "get_diastolic_bp") else None

        if spo2 is not None and spo2 < 95:
            flag_key = "HYPOXIA"
            severity = "CRITICAL" if spo2 < 90 else "WARNING"
            suggestions.append(
                cls._upsert_suggestion(
                    patient=patient,
                    encounter=encounter,
                    triage_assessment=None,
                    source_type="ENCOUNTER",
                    flag_key=flag_key,
                    clinical_domain="RESPIRATORY",
                    severity=severity,
                    evidence={"spo2": spo2, "threshold": "<95%"},
                    rule_id="vitals.spo2.hypoxia",
                )
            )

        if systolic is not None and diastolic is not None:
            if systolic >= 180 or diastolic >= 120:
                suggestions.append(
                    cls._upsert_suggestion(
                        patient=patient,
                        encounter=encounter,
                        triage_assessment=None,
                        source_type="ENCOUNTER",
                        flag_key="HYPERTENSIVE_CRISIS",
                        clinical_domain="CARDIOVASCULAR",
                        severity="CRITICAL",
                        evidence={
                            "systolic_bp": systolic,
                            "diastolic_bp": diastolic,
                            "threshold": ">=180/120",
                        },
                        rule_id="vitals.bp.hypertensive_crisis",
                    )
                )
            elif systolic >= 140 or diastolic >= 90:
                suggestions.append(
                    cls._upsert_suggestion(
                        patient=patient,
                        encounter=encounter,
                        triage_assessment=None,
                        source_type="ENCOUNTER",
                        flag_key="HYPERTENSION_STAGE2",
                        clinical_domain="CARDIOVASCULAR",
                        severity="WARNING",
                        evidence={
                            "systolic_bp": systolic,
                            "diastolic_bp": diastolic,
                            "threshold": ">=140/90",
                        },
                        rule_id="vitals.bp.hypertension_stage2",
                    )
                )

        bmi = cls._calculate_bmi(
            getattr(encounter, "weight", None), getattr(encounter, "height", None)
        )
        if bmi is not None and cls._is_adult(patient):
            if bmi < 18.5:
                suggestions.append(
                    cls._upsert_suggestion(
                        patient=patient,
                        encounter=encounter,
                        triage_assessment=None,
                        source_type="ENCOUNTER",
                        flag_key="BMI_UNDERWEIGHT",
                        clinical_domain="NUTRITION",
                        severity="WARNING",
                        evidence={
                            "bmi": bmi,
                            "weight_kg": float(encounter.weight),
                            "height_cm": float(encounter.height),
                        },
                        rule_id="vitals.bmi.underweight",
                    )
                )
            elif bmi >= 30:
                suggestions.append(
                    cls._upsert_suggestion(
                        patient=patient,
                        encounter=encounter,
                        triage_assessment=None,
                        source_type="ENCOUNTER",
                        flag_key="BMI_OBESITY",
                        clinical_domain="NUTRITION",
                        severity="WARNING",
                        evidence={
                            "bmi": bmi,
                            "weight_kg": float(encounter.weight),
                            "height_cm": float(encounter.height),
                        },
                        rule_id="vitals.bmi.obesity",
                    )
                )

        return [s for s in suggestions if s is not None]

    @classmethod
    def detect_from_triage(cls, triage_assessment) -> list:
        """Evaluate triage-derived nutritional flags and upsert suggestions."""
        encounter = getattr(triage_assessment, "encounter", None)
        patient = getattr(encounter, "patient", None) if encounter else None
        if patient is None:
            return []

        suggestions = []
        muac = getattr(triage_assessment, "muac_cm", None)
        if muac is not None:
            muac_value = float(muac)
            if muac_value < 11.5:
                suggestions.append(
                    cls._upsert_suggestion(
                        patient=patient,
                        encounter=encounter,
                        triage_assessment=triage_assessment,
                        source_type="TRIAGE",
                        flag_key="MALNUTRITION_SAM",
                        clinical_domain="NUTRITION",
                        severity="CRITICAL",
                        evidence={"muac_cm": muac_value, "threshold": "<11.5"},
                        rule_id="triage.muac.sam",
                    )
                )
            elif muac_value < 12.5:
                suggestions.append(
                    cls._upsert_suggestion(
                        patient=patient,
                        encounter=encounter,
                        triage_assessment=triage_assessment,
                        source_type="TRIAGE",
                        flag_key="MALNUTRITION_MAM",
                        clinical_domain="NUTRITION",
                        severity="WARNING",
                        evidence={"muac_cm": muac_value, "threshold": "11.5-12.4"},
                        rule_id="triage.muac.mam",
                    )
                )

        return [s for s in suggestions if s is not None]

    @classmethod
    def _upsert_suggestion(
        cls,
        *,
        patient,
        encounter,
        triage_assessment,
        source_type: str,
        flag_key: str,
        clinical_domain: str,
        severity: str,
        evidence: dict,
        rule_id: str,
    ):
        from hmis.apps.encounters.models import (
            ICD10Code,
            VitalFlagSuggestion,
            VitalFlagSuggestionAction,
        )

        mapping = cls.ICD_MAP.get(flag_key, {})
        icd10_obj = None
        icd10_code = mapping.get("icd10", "")
        if icd10_code:
            icd10_obj = ICD10Code.objects.filter(code__iexact=icd10_code).first()

        open_qs = VitalFlagSuggestion.objects.filter(
            patient=patient,
            encounter=encounter,
            flag_key=flag_key,
            status__in=VitalFlagSuggestion.OPEN_STATUSES,
        ).order_by("-id")
        suggestion = open_qs.first()

        mapping_status = (
            VitalFlagSuggestion.MappingStatus.AUTO_MAPPED
            if (icd10_obj or mapping.get("icd11"))
            else VitalFlagSuggestion.MappingStatus.UNMAPPED
        )

        if suggestion:
            suggestion.severity = severity
            suggestion.evidence_json = evidence
            suggestion.rule_id = rule_id
            suggestion.rule_version = cls.RULE_VERSION
            suggestion.triage_assessment = triage_assessment or suggestion.triage_assessment
            suggestion.mapping_status = mapping_status
            suggestion.suggested_icd10 = icd10_obj
            suggestion.suggested_icd11_code = mapping.get("icd11", "")
            suggestion.suggested_icd11_title = mapping.get("title", "")
            suggestion.save(
                update_fields=[
                    "severity",
                    "evidence_json",
                    "rule_id",
                    "rule_version",
                    "triage_assessment",
                    "mapping_status",
                    "suggested_icd10",
                    "suggested_icd11_code",
                    "suggested_icd11_title",
                    "updated_at",
                ]
            )
            return suggestion

        suggestion = VitalFlagSuggestion.objects.create(
            patient=patient,
            encounter=encounter,
            triage_assessment=triage_assessment,
            source_type=source_type,
            flag_key=flag_key,
            clinical_domain=clinical_domain,
            severity=severity,
            status=VitalFlagSuggestion.Status.NEW,
            rule_id=rule_id,
            rule_version=cls.RULE_VERSION,
            evidence_json=evidence,
            mapping_status=mapping_status,
            suggested_icd10=icd10_obj,
            suggested_icd11_code=mapping.get("icd11", ""),
            suggested_icd11_title=mapping.get("title", ""),
        )

        VitalFlagSuggestionAction.objects.create(
            suggestion=suggestion,
            action_type=VitalFlagSuggestionAction.ActionType.DETECTED,
            from_status="",
            to_status=VitalFlagSuggestion.Status.NEW,
            payload_json={
                "rule_id": rule_id,
                "rule_version": cls.RULE_VERSION,
                "evidence": evidence,
            },
        )
        return suggestion

    @staticmethod
    def _calculate_bmi(weight_kg: Decimal | None, height_cm: Decimal | None) -> float | None:
        if weight_kg is None or height_cm is None:
            return None
        try:
            w = float(weight_kg)
            h_m = float(height_cm) / 100.0
            if w <= 0 or h_m <= 0:
                return None
            return round(w / (h_m * h_m), 2)
        except (TypeError, ValueError, ZeroDivisionError):
            return None

    @staticmethod
    def _is_adult(patient) -> bool:
        dob = getattr(patient, "date_of_birth", None)
        if dob is None:
            return False
        if isinstance(dob, str):
            try:
                dob = date.fromisoformat(dob)
            except ValueError:
                return False
        today = timezone.localdate()
        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        return age >= 18
