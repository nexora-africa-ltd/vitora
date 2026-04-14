"""
Celery tasks for asynchronous HIE (Health Information Exchange) operations.

Tasks:
- lookup_and_register_patient_in_cr: Look up patient in Client Registry,
  register if not found.
"""

import logging

from celery import shared_task
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def lookup_and_register_patient_in_cr(self, patient_id: int) -> dict:
    """
    Look up a patient in the Kenya Client Registry and register if not found.

    This task is fired asynchronously after patient creation to avoid
    blocking the registration workflow (offline-first principle).

    Args:
        patient_id: ID of the Patient to sync with CR

    Returns:
        dict with action taken: 'matched', 'registered', 'skipped', or 'error'
    """
    from hmis.apps.patients.models import Patient

    try:
        patient = Patient.objects.get(pk=patient_id)
    except Patient.DoesNotExist:
        logger.warning("Patient %s not found for CR sync", patient_id)
        return {"action": "error", "detail": "Patient not found"}

    # Skip if already synced
    if patient.cr_number:
        logger.info("Patient %s already has CR number %s", patient.mrn, patient.cr_number)
        return {"action": "skipped", "cr_number": patient.cr_number}

    # Check settings
    if not getattr(settings, "HIE_AUTO_CR_LOOKUP", True):
        return {"action": "skipped", "detail": "HIE_AUTO_CR_LOOKUP disabled"}

    try:
        from hmis.apps.billing.services.client_registry import ClientRegistryService

        cr_service = ClientRegistryService()

        # Step 1: Try to find existing CR record
        client = None
        national_id = getattr(patient, "national_id", None)
        if national_id:
            client = cr_service.fetch_client(national_id=national_id)

        if client:
            # Found — store CR number
            Patient.objects.filter(pk=patient_id).update(
                cr_number=client.client_number,
                cr_synced_at=timezone.now(),
            )
            logger.info("Matched patient %s to CR %s", patient.mrn, client.client_number)
            return {"action": "matched", "cr_number": client.client_number}

        # Step 2: Register new patient in CR if enabled
        if not getattr(settings, "HIE_AUTO_CR_REGISTER", True):
            return {"action": "skipped", "detail": "HIE_AUTO_CR_REGISTER disabled"}

        cr_client = cr_service.register_client(
            first_name=patient.first_name,
            last_name=patient.last_name,
            date_of_birth=str(patient.date_of_birth),
            gender={"M": "Male", "F": "Female", "O": "Other"}.get(patient.gender, "Other"),
            national_id=national_id or "",
            phone_number=getattr(patient, "phone_number", "") or "",
        )

        if cr_client and cr_client.client_number:
            Patient.objects.filter(pk=patient_id).update(
                cr_number=cr_client.client_number,
                cr_synced_at=timezone.now(),
            )
            logger.info(
                "Registered patient %s in CR as %s",
                patient.mrn,
                cr_client.client_number,
            )
            return {"action": "registered", "cr_number": cr_client.client_number}

        return {"action": "error", "detail": "Registration returned no CR number"}

    except Exception as exc:
        logger.warning("CR sync failed for patient %s: %s", patient_id, exc, exc_info=True)
        raise self.retry(exc=exc)
