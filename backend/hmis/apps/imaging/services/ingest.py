"""
Shared DICOM ingest service.

Used by both the HTTP upload view and the C-STORE SCP listener to persist
a parsed DICOM file into the PACS, create/refresh the Study/Series/Instance
rows, and auto-resolve imaging equipment from DICOM tags.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from django.conf import settings

from hmis.apps.imaging.services.dicom import DICOMParsingService
from hmis.apps.imaging.services.equipment import resolve_equipment_from_metadata
from hmis.apps.imaging.services.pacs import PACSStorageService

logger = logging.getLogger(__name__)


def persist_dicom_instance(
    tmp_path: str,
    *,
    patient,
    imaging_order=None,
    source: str = "UPLOAD",
    uploaded_by=None,
    calling_ae_title: str = "",
    facility=None,
    organization=None,
    move: bool = True,
) -> dict[str, Any]:
    """
    Persist a single DICOM instance into the PACS and database.

    Returns a dict with `study`, `series`, `instance`, `created_instance`,
    `created_study`, `metadata`, and `stored_path`.
    """
    from hmis.apps.imaging.models import DICOMInstance, DICOMSeries, DICOMStudy

    metadata = DICOMParsingService.parse_file(tmp_path)
    pacs = PACSStorageService(base_path=str(settings.MEDIA_ROOT))

    m_study_uid = metadata["study_instance_uid"]
    m_series_uid = metadata["series_instance_uid"]
    m_sop_uid = metadata["sop_instance_uid"]

    stored_path = pacs.store_file(
        tmp_path,
        m_study_uid,
        m_series_uid,
        sop_uid=m_sop_uid,
        move=move,
    )

    study, created_study = DICOMStudy.objects.get_or_create(
        study_instance_uid=m_study_uid,
        defaults={
            "patient": patient,
            "imaging_order": imaging_order,
            "study_date": metadata.get("study_date") or datetime.now().date(),
            "study_time": metadata.get("study_time"),
            "study_description": metadata.get("study_description", ""),
            "accession_number": metadata.get("accession_number", ""),
            "referring_physician_name": metadata.get("referring_physician_name", ""),
            "modality": metadata.get("modality", ""),
            "institution_name": metadata.get("institution_name", ""),
            "station_name": metadata.get("station_name", ""),
            "manufacturer": metadata.get("manufacturer", ""),
            "manufacturer_model_name": metadata.get("manufacturer_model_name", ""),
            "device_serial_number": metadata.get("device_serial_number", ""),
            "source": source,
            "calling_ae_title": calling_ae_title or "",
            "uploaded_by": uploaded_by,
        },
    )

    # Auto-resolve equipment on first contact
    if created_study and study.equipment_id is None and facility:
        equipment = resolve_equipment_from_metadata(
            metadata,
            facility=facility,
            organization=organization,
        )
        if equipment:
            study.equipment = equipment
            study.save(update_fields=["equipment"])

    series, _ = DICOMSeries.objects.get_or_create(
        series_instance_uid=m_series_uid,
        defaults={
            "study": study,
            "series_number": metadata.get("series_number"),
            "series_description": metadata.get("series_description", ""),
            "modality": metadata.get("modality", ""),
            "body_part_examined": metadata.get("body_part_examined", ""),
        },
    )

    instance, created_instance = DICOMInstance.objects.get_or_create(
        sop_instance_uid=m_sop_uid,
        defaults={
            "series": series,
            "sop_class_uid": metadata.get("sop_class_uid", ""),
            "instance_number": metadata.get("instance_number"),
            "file_path": stored_path,
            "file_size": metadata.get("file_size", 0),
            "transfer_syntax_uid": metadata.get("transfer_syntax_uid", ""),
            "rows": metadata.get("rows"),
            "columns": metadata.get("columns"),
            "bits_allocated": metadata.get("bits_allocated"),
            "photometric_interpretation": metadata.get("photometric_interpretation", ""),
        },
    )

    return {
        "study": study,
        "series": series,
        "instance": instance,
        "created_study": created_study,
        "created_instance": created_instance,
        "metadata": metadata,
        "stored_path": stored_path,
    }
