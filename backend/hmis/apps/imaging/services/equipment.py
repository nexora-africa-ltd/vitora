"""
Equipment resolution service.

Matches DICOM-tag identity (manufacturer/model/serial or AE title/station name)
to an `ImagingEquipment` row, auto-creating a placeholder record on first contact.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def resolve_equipment(
    *,
    facility,
    organization=None,
    modality: str,
    station_name: str = "",
    manufacturer: str = "",
    manufacturer_model_name: str = "",
    device_serial_number: str = "",
    ae_title: str = "",
    software_versions: str = "",
):
    """
    Find or auto-create an ImagingEquipment row matching the supplied identity.

    Match priority:
    1. (manufacturer, model_name, serial_number) exact triple, scoped by facility
    2. ae_title (if non-empty), scoped by facility
    3. station_name (if non-empty), scoped by facility

    If no match is found and at least one identifier is present, a new
    ImagingEquipment is auto-created with `auto_registered=True`.

    Args:
        facility: Facility instance (required for scoping)
        organization: Organization instance (optional; used by FacilityScopedModel)
        modality: Internal Vitora modality code (CT/MRI/XR/etc.)
        station_name, manufacturer, manufacturer_model_name, device_serial_number,
        ae_title, software_versions: DICOM tag values

    Returns:
        ImagingEquipment instance, or None if facility is missing or no identifiers
        are provided.
    """
    from hmis.apps.imaging.models import ImagingEquipment

    if facility is None:
        return None

    has_identity = any(
        [
            device_serial_number,
            manufacturer_model_name,
            ae_title,
            station_name,
        ]
    )
    if not has_identity:
        return None

    qs = ImagingEquipment.objects.filter(facility=facility)

    # Tier 1: manufacturer + model + serial
    if manufacturer and manufacturer_model_name and device_serial_number:
        match = qs.filter(
            manufacturer__iexact=manufacturer,
            model_name__iexact=manufacturer_model_name,
            serial_number__iexact=device_serial_number,
        ).first()
        if match:
            return _refresh(match, software_versions=software_versions)

    # Tier 2: serial alone (often unique within a facility)
    if device_serial_number:
        match = qs.filter(serial_number__iexact=device_serial_number).first()
        if match:
            return _refresh(match, software_versions=software_versions)

    # Tier 3: AE title
    if ae_title:
        match = qs.filter(ae_title__iexact=ae_title).first()
        if match:
            return _refresh(match, software_versions=software_versions)

    # Tier 4: station name
    if station_name:
        match = qs.filter(station_name__iexact=station_name).first()
        if match:
            return _refresh(match, software_versions=software_versions)

    # Auto-register a placeholder
    name_parts = [p for p in [manufacturer, manufacturer_model_name] if p]
    if not name_parts:
        name_parts = [p for p in [ae_title, station_name] if p]
    display_name = " ".join(name_parts) or f"Auto-registered {modality}"
    if device_serial_number:
        display_name = f"{display_name} ({device_serial_number})"

    equipment = ImagingEquipment.objects.create(
        facility=facility,
        organization=organization,
        name=display_name[:200],
        modality=modality,
        ae_title=ae_title or "",
        station_name=station_name or "",
        manufacturer=manufacturer or "",
        model_name=manufacturer_model_name or "",
        serial_number=device_serial_number or "",
        software_versions=software_versions or "",
        auto_registered=True,
    )
    logger.info(
        "Auto-registered ImagingEquipment id=%s for facility=%s modality=%s",
        equipment.pk,
        getattr(facility, "pk", None),
        modality,
    )
    return equipment


def _refresh(equipment, *, software_versions: str = ""):
    """Update mutable metadata on an existing equipment row (e.g., software version)."""
    if software_versions and equipment.software_versions != software_versions:
        equipment.software_versions = software_versions
        equipment.save(update_fields=["software_versions", "updated_at"])
    return equipment


def resolve_equipment_from_metadata(
    metadata: dict,
    *,
    facility,
    organization=None,
) -> object | None:
    """
    Convenience wrapper that takes a DICOMParsingService metadata dict.
    """
    return resolve_equipment(
        facility=facility,
        organization=organization,
        modality=metadata.get("modality", "OTHER"),
        station_name=metadata.get("station_name", ""),
        manufacturer=metadata.get("manufacturer", ""),
        manufacturer_model_name=metadata.get("manufacturer_model_name", ""),
        device_serial_number=metadata.get("device_serial_number", ""),
        ae_title=metadata.get("calling_ae_title", ""),
        software_versions=metadata.get("software_versions", ""),
    )
