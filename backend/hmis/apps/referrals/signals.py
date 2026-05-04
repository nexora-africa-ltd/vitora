"""
Django signals for the referrals module.

Handles:
- Clinic queue integration: Auto-route patients when referral is accepted
- Allied health order creation: Auto-create module-specific records
- Admission recommendation: Auto-create when admission referral is accepted
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.referrals.models import ClinicalReferral

logger = logging.getLogger(__name__)


def _build_referral_disposition_note(referral: ClinicalReferral) -> str:
    """Return a concise encounter note describing the referral handoff."""
    return f"Referral {referral.referral_number} to {referral.target_service}: {referral.reason}"


@receiver(post_save, sender=ClinicalReferral)
def mark_source_encounter_referred(sender, instance, created, **kwargs):
    """Mark the originating OPD encounter as referred when a referral is created."""
    if not created:
        return

    encounter = instance.encounter
    if not encounter or encounter.encounter_type != "OPD":
        return

    if encounter.status in ("CLOSED", "CANCELLED"):
        return

    disposition_note = _build_referral_disposition_note(instance)
    existing_notes = (encounter.disposition_notes or "").strip()
    if disposition_note in existing_notes:
        return

    encounter.disposition = "REFERRED"
    encounter.disposition_notes = (
        f"{existing_notes}\n{disposition_note}" if existing_notes else disposition_note
    )
    encounter.save(update_fields=["disposition", "disposition_notes", "updated_at"])

    # Notify target department staff about incoming referral
    _notify_referral_created(instance)


@receiver(post_save, sender=ClinicalReferral)
def handle_referral_accepted(sender, instance, created, **kwargs):
    """
    When a referral is accepted, create the appropriate downstream records.

    For ALLIED_HEALTH referrals:
        - Creates the module-specific order/referral (PhysiotherapyOrder, etc.)
        - The module's own signals then handle clinic queue routing

    For SPECIALTY_CLINIC referrals:
        - Creates a ClinicVisit in the appropriate clinic queue

    For ADMISSION referrals:
        - Creates an AdmissionRecommendation in the inpatient module
    """
    if created:
        return  # Skip on initial creation

    if instance.status != "ACCEPTED":
        return  # Only process accepted referrals

    # Skip if already linked to a downstream record
    if instance.linked_object_id:
        return

    # Notify referring clinician that referral was accepted
    _notify_referral_accepted(instance)

    # Route based on referral type
    if instance.is_allied_health:
        _create_allied_health_order(instance)
    elif instance.is_admission:
        _create_admission_recommendation(instance)
    else:
        # Specialty clinic or external — route to clinic queue
        _create_clinic_visit(instance)


def _create_allied_health_order(referral):
    """Create the appropriate allied health module order from a referral."""
    service = referral.target_service
    try:
        if service == "PHYSIOTHERAPY":
            _create_physio_order(referral)
        elif service == "NUTRITION":
            _create_nutrition_consultation(referral)
        elif service == "OCCUPATIONAL_THERAPY":
            _create_ot_order(referral)
        elif service == "COUNSELLING":
            _create_counselling_referral(referral)
        elif service == "SOCIAL_WORK":
            _create_sw_referral(referral)
        else:
            logger.warning(f"Unknown allied health service: {service}")
    except ImportError:
        logger.warning(f"Module for {service} not available. Skipping order creation.")
    except Exception as e:
        logger.error(
            f"Error creating allied health order for referral {referral.referral_number}: {e}"
        )


def _create_physio_order(referral):
    """Create a PhysiotherapyOrder from a referral."""
    from hmis.apps.physiotherapy.models import PhysiotherapyOrder

    order = PhysiotherapyOrder.objects.create(
        patient=referral.patient,
        encounter=referral.encounter,
        ordered_by=referral.referred_by,
        priority=_map_priority(referral.priority),
        clinical_notes=_build_clinical_notes(referral),
        status="PENDING",
    )

    referral.linked_module = "physiotherapy"
    referral.linked_model = "PhysiotherapyOrder"
    referral.linked_object_id = order.id
    referral.save(update_fields=["linked_module", "linked_model", "linked_object_id"])

    logger.info(
        f"Created PhysiotherapyOrder {order.order_number} from referral {referral.referral_number}"
    )


def _create_nutrition_consultation(referral):
    """Create a NutritionConsultation from a referral."""
    from hmis.apps.nutrition.models import NutritionConsultation

    # Map referral reason to nutrition reason choices
    consultation = NutritionConsultation.objects.create(
        patient=referral.patient,
        encounter=referral.encounter,
        referred_by=referral.referred_by,
        referral_reason="OTHER",
        clinical_notes=_build_clinical_notes(referral),
        priority=_map_priority(referral.priority),
        status="PENDING",
    )

    referral.linked_module = "nutrition"
    referral.linked_model = "NutritionConsultation"
    referral.linked_object_id = consultation.id
    referral.save(update_fields=["linked_module", "linked_model", "linked_object_id"])

    logger.info(
        f"Created NutritionConsultation {consultation.consultation_number} "
        f"from referral {referral.referral_number}"
    )


def _create_ot_order(referral):
    """Create an OccupationalTherapyOrder from a referral."""
    from hmis.apps.occupational_therapy.models import OccupationalTherapyOrder

    order = OccupationalTherapyOrder.objects.create(
        patient=referral.patient,
        encounter=referral.encounter,
        ordered_by=referral.referred_by,
        priority=_map_priority(referral.priority),
        clinical_notes=_build_clinical_notes(referral),
        status="PENDING",
    )

    referral.linked_module = "occupational_therapy"
    referral.linked_model = "OccupationalTherapyOrder"
    referral.linked_object_id = order.id
    referral.save(update_fields=["linked_module", "linked_model", "linked_object_id"])

    logger.info(f"Created OT Order {order.order_number} from referral {referral.referral_number}")


def _create_counselling_referral(referral):
    """Create a CounsellingReferral from a referral."""
    from hmis.apps.counselling.models import CounsellingReferral

    cr = CounsellingReferral.objects.create(
        patient=referral.patient,
        encounter=referral.encounter,
        referred_by=referral.referred_by,
        referral_reason="OTHER",
        presenting_problem=referral.reason,
        clinical_notes=_build_clinical_notes(referral),
        urgency=referral.priority,
        status="PENDING",
    )

    referral.linked_module = "counselling"
    referral.linked_model = "CounsellingReferral"
    referral.linked_object_id = cr.id
    referral.save(update_fields=["linked_module", "linked_model", "linked_object_id"])

    logger.info(
        f"Created CounsellingReferral {cr.referral_number} from referral {referral.referral_number}"
    )


def _create_sw_referral(referral):
    """Create a SocialWorkReferral from a referral."""
    from hmis.apps.social_work.models import SocialWorkReferral

    swr = SocialWorkReferral.objects.create(
        patient=referral.patient,
        encounter=referral.encounter,
        referred_by=referral.referred_by,
        referral_reason="OTHER",
        presenting_problem=referral.reason,
        urgency=referral.priority,
        is_sensitive=referral.is_sensitive,
        status="PENDING",
    )

    referral.linked_module = "social_work"
    referral.linked_model = "SocialWorkReferral"
    referral.linked_object_id = swr.id
    referral.save(update_fields=["linked_module", "linked_model", "linked_object_id"])

    logger.info(
        f"Created SocialWorkReferral {swr.referral_number} from referral {referral.referral_number}"
    )


def _create_admission_recommendation(referral):
    """Create an AdmissionRecommendation from an admission referral."""
    try:
        from hmis.apps.inpatient.models import AdmissionRecommendation

        # Check if recommendation already exists for this encounter
        if hasattr(referral.encounter, "admission_recommendation"):
            logger.info(
                f"AdmissionRecommendation already exists for encounter "
                f"{referral.encounter.id}. Skipping."
            )
            return

        rec = AdmissionRecommendation.objects.create(
            encounter=referral.encounter,
            recommended_by=referral.referred_by,
            reason=referral.reason,
            provisional_diagnosis=referral.provisional_diagnosis or "",
            provisional_diagnosis_text=referral.provisional_diagnosis_text,
            urgency=referral.priority,
            preferred_ward_type=referral.preferred_ward_type or "",
            status="PENDING",
        )

        referral.linked_module = "inpatient"
        referral.linked_model = "AdmissionRecommendation"
        referral.linked_object_id = rec.id
        referral.save(update_fields=["linked_module", "linked_model", "linked_object_id"])

        logger.info(
            f"Created AdmissionRecommendation {rec.id} from referral {referral.referral_number}"
        )

    except ImportError:
        logger.warning("Inpatient module not available. Skipping admission recommendation.")
    except Exception as e:
        logger.error(f"Error creating admission recommendation: {e}")


def _create_clinic_visit(referral):
    """Create a ClinicVisit for specialty clinic routing."""
    try:
        from hmis.apps.clinics.models import Clinic, ClinicVisit

        # Skip if already has a clinic visit
        if referral.clinic_visit:
            return

        clinic_type = referral.get_clinic_type()
        if not clinic_type:
            logger.info(
                f"No clinic type mapping for service {referral.target_service}. "
                f"Skipping queue routing."
            )
            return

        clinic = None
        if referral.destination_clinic_id:
            clinic = Clinic.objects.filter(
                pk=referral.destination_clinic_id,
                status="ACTIVE",
            ).first()

        if not clinic:
            clinic = (
                Clinic.objects.filter(
                    clinic_type=clinic_type,
                    status="ACTIVE",
                )
                .order_by("name", "id")
                .first()
            )

        if not clinic:
            logger.warning(
                f"No active {clinic_type} clinic found. "
                f"Skipping queue routing for referral {referral.referral_number}."
            )
            return

        session = clinic.get_current_session()

        # Map priority
        priority_map = {
            "ROUTINE": "STANDARD",
            "URGENT": "URGENT",
            "EMERGENCY": "EMERGENCY",
        }

        visit = ClinicVisit.objects.create(
            session=session,
            patient=referral.patient,
            visit_type="REFERRAL",
            source="REFERRAL",
            priority=priority_map.get(referral.priority, "STANDARD"),
            referral_reason=f"{referral.get_target_service_display()}: {referral.reason[:200]}",
            queue_number=session.visits.count() + 1,
        )

        referral.clinic_visit = visit
        referral.save(update_fields=["clinic_visit"])

        logger.info(
            f"Created ClinicVisit {visit.id} for referral {referral.referral_number} "
            f"in clinic {clinic.name}"
        )

    except ImportError:
        logger.warning("Clinics module not available. Skipping queue routing.")
    except Exception as e:
        logger.error(f"Error creating clinic visit for referral: {e}")


def _build_clinical_notes(referral):
    """Build clinical notes string from referral context."""
    parts = [f"Referral Reason: {referral.reason}"]

    if referral.clinical_notes:
        parts.append(f"Clinical Notes: {referral.clinical_notes}")

    if referral.relevant_diagnoses:
        dx_list = ", ".join(
            f"{d.get('code', '')} - {d.get('description', '')}" for d in referral.relevant_diagnoses
        )
        if dx_list:
            parts.append(f"Diagnoses: {dx_list}")

    if referral.relevant_vitals:
        vitals_list = ", ".join(f"{k}: {v}" for k, v in referral.relevant_vitals.items())
        if vitals_list:
            parts.append(f"Vitals: {vitals_list}")

    return "\n".join(parts)


def _map_priority(referral_priority):
    """Map referral priority to module-specific priority."""
    # Most modules use the same choices
    return referral_priority


# ---------------------------------------------------------------------------
# Notification helpers
# ---------------------------------------------------------------------------


def _notify_referral_created(instance):
    """Notify staff in the target department about an incoming referral."""
    try:
        from django.contrib.auth import get_user_model

        from hmis.apps.core.services.notification_service import notify_users

        User = get_user_model()

        facility_id = getattr(instance, "facility_id", None)
        if not facility_id:
            return

        # Try to find staff in the target department/service
        target_service = instance.target_service or ""
        patient = getattr(instance.encounter, "patient", None) if instance.encounter else None
        patient_name = f"{patient.first_name} {patient.last_name}" if patient else "a patient"

        # Find staff associated with target department
        target_dept = getattr(instance, "target_department", None)
        if target_dept:
            staff = User.objects.filter(
                staff_profile__facilities__id=facility_id,
                staff_profile__department=target_dept,
                is_active=True,
            ).distinct()
        else:
            # Fallback: notify all clinicians in facility
            staff = User.objects.filter(
                staff_profile__facilities__id=facility_id,
                staff_profile__primary_role__code__in=[
                    "DOCTOR",
                    "CLINICAL_OFFICER",
                    "CLINICAL_SENIOR",
                ],
                is_active=True,
            ).distinct()[:10]  # Limit to avoid spam

        if not staff:
            return

        priority = "high" if instance.priority in ("URGENT", "EMERGENCY") else "normal"
        notify_users(
            users=staff,
            notification_type="referral_received",
            priority=priority,
            title=f"Referral Received: {target_service}",
            message=f"New referral for {patient_name} to {target_service}.",
            related_model="ClinicalReferral",
            related_id=instance.id,
            action_url=f"/referrals/{instance.id}",
        )
    except Exception:
        logger.exception("Failed to notify referral created for %s", instance.id)


def _notify_referral_accepted(instance):
    """Notify referring clinician that their referral was accepted."""
    try:
        from hmis.apps.core.services.notification_service import notify_user

        # Notify the referring clinician
        referred_by = getattr(instance, "referred_by", None)
        if not referred_by:
            return

        patient = getattr(instance.encounter, "patient", None) if instance.encounter else None
        patient_name = f"{patient.first_name} {patient.last_name}" if patient else "a patient"

        notify_user(
            user=referred_by,
            notification_type="referral_status_update",
            priority="normal",
            title="Referral Accepted",
            message=f"Your referral for {patient_name} to {instance.target_service} has been accepted.",
            related_model="ClinicalReferral",
            related_id=instance.id,
            action_url=f"/referrals/{instance.id}",
        )
    except Exception:
        logger.exception("Failed to notify referral accepted for %s", instance.id)
