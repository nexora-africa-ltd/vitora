"""
DICOM C-STORE SCP listener management command.

Starts a pynetdicom AE that listens for incoming C-STORE associations from
modality workstations or PACS routers, persists received instances via the
shared ingest service, and publishes ``imaging.instance.received`` events
over the existing WebSocket layer.

Settings:
    DICOM_SCP_AE_TITLE       (default "VITORA")
    DICOM_SCP_PORT           (default 11112)
    DICOM_SCP_BIND_HOST      (default "0.0.0.0")
    DICOM_SCP_ALLOWED_PEERS  (list of allowed calling AET; empty = allow all)

Usage:
    python manage.py dicom_scp_listener
    python manage.py dicom_scp_listener --port 11113 --ae-title VITORA-DEV
"""

from __future__ import annotations

import contextlib
import logging
import os
import tempfile

from django.conf import settings
from django.core.management.base import BaseCommand

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Run the DICOM C-STORE SCP listener for incoming PACS pushes."

    def add_arguments(self, parser):
        parser.add_argument("--ae-title", type=str, default=None)
        parser.add_argument("--port", type=int, default=None)
        parser.add_argument("--bind", type=str, default=None)

    def handle(self, *args, **options):
        try:
            from pynetdicom import AE, ALL_TRANSFER_SYNTAXES, AllStoragePresentationContexts, evt
        except ImportError:
            self.stderr.write("pynetdicom is not installed. Run: poetry add pynetdicom")
            return

        ae_title = options["ae_title"] or getattr(settings, "DICOM_SCP_AE_TITLE", "VITORA")
        port = options["port"] or int(getattr(settings, "DICOM_SCP_PORT", 11112))
        bind = options["bind"] or getattr(settings, "DICOM_SCP_BIND_HOST", "0.0.0.0")  # noqa: S104
        allowed_peers = set(getattr(settings, "DICOM_SCP_ALLOWED_PEERS", []) or [])

        ae = AE(ae_title=ae_title)

        # Accept all storage SOP classes with all transfer syntaxes
        for context in AllStoragePresentationContexts:
            ae.add_supported_context(context.abstract_syntax, ALL_TRANSFER_SYNTAXES)

        def handle_store(event):
            calling_aet = event.assoc.requestor.ae_title.strip() if event.assoc else ""
            if allowed_peers and calling_aet not in allowed_peers:
                logger.warning("C-STORE rejected from non-allow-listed peer: %s", calling_aet)
                return 0xA700  # Refused: Out of resources

            try:
                return _persist_cstore_instance(event, calling_aet)
            except Exception:
                logger.exception("C-STORE handler failed for instance from %s", calling_aet)
                return 0xC000  # Cannot understand

        handlers = [(evt.EVT_C_STORE, handle_store)]

        self.stdout.write(
            self.style.SUCCESS(
                f"DICOM SCP listening on {bind}:{port} as AE={ae_title} "
                f"(allowed peers: {sorted(allowed_peers) or 'ALL'})"
            )
        )
        ae.start_server((bind, port), evt_handlers=handlers, block=True)


def _persist_cstore_instance(event, calling_aet: str) -> int:
    """Handle one C-STORE instance — write to temp, ingest, publish event."""
    from hmis.apps.core.events import publish_event
    from hmis.apps.core.events.types import ImagingEvents
    from hmis.apps.imaging.services.ingest import persist_dicom_instance
    from hmis.apps.patients.models import Patient

    ds = event.dataset
    ds.file_meta = event.file_meta

    # Match patient by PatientID (MRN) from DICOM tag
    dicom_patient_id = str(getattr(ds, "PatientID", "")).strip()
    patient = None
    if dicom_patient_id:
        patient = (
            Patient.objects.filter(mrn=dicom_patient_id).first()
            or Patient.objects.filter(national_id=dicom_patient_id).first()
        )
    if patient is None:
        logger.warning(
            "C-STORE from %s rejected: no patient match for PatientID=%r",
            calling_aet,
            dicom_patient_id,
        )
        return 0xA900  # Dataset does not match SOP Class

    # Resolve facility from patient
    facility = getattr(patient, "facility", None)
    organization = getattr(patient, "organization", None)

    # Write to temp file (pynetdicom gives us a Dataset, we need a .dcm on disk)
    with tempfile.NamedTemporaryFile(suffix=".dcm", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        ds.save_as(tmp_path, write_like_original=False)

        result = persist_dicom_instance(
            tmp_path,
            patient=patient,
            source="CSTORE",
            calling_ae_title=calling_aet,
            facility=facility,
            organization=organization,
            move=True,
        )

        # Broadcast realtime event
        study = result["study"]
        instance = result["instance"]
        try:
            publish_event(
                event_type=ImagingEvents.INSTANCE_RECEIVED,
                aggregate_type="DICOMInstance",
                aggregate_id=instance.id,
                payload={
                    "study_instance_uid": study.study_instance_uid,
                    "sop_instance_uid": instance.sop_instance_uid,
                    "patient_id": patient.id,
                    "patient_mrn": patient.mrn,
                    "modality": study.modality,
                    "calling_ae_title": calling_aet,
                    "equipment_id": study.equipment_id,
                    "created_study": result["created_study"],
                },
                facility_id=getattr(study, "facility_id", None),
            )
        except Exception:
            logger.exception("Failed to publish INSTANCE_RECEIVED event")

        return 0x0000  # Success
    finally:
        if os.path.exists(tmp_path):
            with contextlib.suppress(OSError):
                os.unlink(tmp_path)
