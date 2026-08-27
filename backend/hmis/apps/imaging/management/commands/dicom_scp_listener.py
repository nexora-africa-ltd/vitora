# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
DICOM C-STORE SCP listener management command.

Starts a pynetdicom AE that listens for incoming C-STORE associations from
modality workstations or PACS routers, persists received instances via the
shared ingest service, and publishes ``imaging.instance.received`` events
over the existing WebSocket layer.

Settings:
    ImagingIntegrationSettings (preferred, from /imaging/settings)
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


def _normalize_allowed_peers(value: str | list[str] | tuple[str, ...] | None) -> set[str]:
    if not value:
        return set()
    if isinstance(value, (list, tuple)):
        candidates = value
    else:
        candidates = value.split(",")
    return {str(v).strip().upper() for v in candidates if str(v).strip()}


def _load_listener_profile_from_db(ae_title_hint: str | None = None):
    """
    Load preferred listener profile from ImagingIntegrationSettings.

    Selection strategy:
    - If ae_title_hint is provided, match an enabled row by AE title.
    - Else if exactly one enabled row exists, use it.
    - Else if multiple enabled rows exist, treat as ambiguous and return None.
    """
    from hmis.apps.imaging.models import ImagingIntegrationSettings

    enabled = ImagingIntegrationSettings.objects.filter(listener_enabled=True)
    if ae_title_hint:
        match = enabled.filter(ae_title__iexact=ae_title_hint).first()
        if match:
            return match
        return None

    count = enabled.count()
    if count == 1:
        return enabled.first()
    if count > 1:
        logger.warning(
            "Multiple enabled ImagingIntegrationSettings rows found; falling back to environment defaults. "
            "Pass --ae-title to target one profile explicitly."
        )
    return None


def resolve_listener_config(options: dict) -> tuple[str, int, str, set[str]]:
    """Resolve listener config with precedence: CLI > DB profile > env defaults."""
    env_ae_title = getattr(settings, "DICOM_SCP_AE_TITLE", "VITORA")
    env_port = int(getattr(settings, "DICOM_SCP_PORT", 11112))
    env_bind = getattr(settings, "DICOM_SCP_BIND_HOST", "0.0.0.0")  # noqa: S104
    env_allowed_peers = _normalize_allowed_peers(
        getattr(settings, "DICOM_SCP_ALLOWED_PEERS", []) or []
    )

    db_profile = _load_listener_profile_from_db(options.get("ae_title"))

    ae_title = options.get("ae_title") or (getattr(db_profile, "ae_title", None) or env_ae_title)
    port = options.get("port") or (getattr(db_profile, "port", None) or env_port)
    bind = options.get("bind") or (getattr(db_profile, "bind_host", None) or env_bind)
    allowed_peers = (
        _normalize_allowed_peers(getattr(db_profile, "allowed_peers", ""))
        if db_profile
        else env_allowed_peers
    )
    return str(ae_title), int(port), str(bind), allowed_peers


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

        ae_title, port, bind, allowed_peers = resolve_listener_config(options)

        ae = AE(ae_title=ae_title)

        # Accept all storage SOP classes with all transfer syntaxes
        for context in AllStoragePresentationContexts:
            ae.add_supported_context(context.abstract_syntax, ALL_TRANSFER_SYNTAXES)

        def handle_store(event):
            calling_aet = event.assoc.requestor.ae_title.strip() if event.assoc else ""
            if allowed_peers and calling_aet.upper() not in allowed_peers:
                logger.warning("C-STORE rejected from non-allow-listed peer: %s", calling_aet)
                return 0xA700  # Refused: Out of resources

            try:
                return _persist_cstore_instance(event, calling_aet)
            except (
                AttributeError,
                TypeError,
                ValueError,
                RuntimeError,
                OSError,
                AssertionError,
                ImportError,
            ):
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
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ):
            logger.exception("Failed to publish INSTANCE_RECEIVED event")

        return 0x0000  # Success
    finally:
        if os.path.exists(tmp_path):
            with contextlib.suppress(OSError):
                os.unlink(tmp_path)
