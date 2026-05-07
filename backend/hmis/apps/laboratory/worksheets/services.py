"""
Worksheet generation and label printing services.
"""

import csv
import io
import logging
from datetime import date

logger = logging.getLogger(__name__)


def generate_worksheet(facility, user, **kwargs):
    """
    Generate a worksheet with pending specimens/tests.

    Args:
        facility: Facility to scope the worksheet
        user: User generating the worksheet
        **kwargs: Filters (section_filter, instrument_id, priority_filter, date_from, date_to,
                  template_id, title, export_format)

    Returns:
        Worksheet instance with items populated
    """
    from hmis.apps.laboratory.models import LabOrderItem

    from .models import Worksheet, WorksheetItem, WorksheetTemplate

    template = None
    template_id = kwargs.get("template_id")
    if template_id:
        template = WorksheetTemplate.objects.filter(pk=template_id, facility=facility).first()

    # Build queryset of pending order items
    qs = (
        LabOrderItem.objects.filter(
            lab_order__facility=facility,
            status__in=["PENDING", "ORDERED", "SPECIMEN_COLLECTED", "IN_PROGRESS"],
        )
        .select_related("test", "lab_order__patient")
        .prefetch_related("specimens")
        .order_by("lab_order__priority", "lab_order__ordered_at")
    )

    section_filter = kwargs.get("section_filter") or (template.section_filter if template else "")
    if section_filter:
        qs = qs.filter(test__category=section_filter)

    instrument_id = kwargs.get("instrument_id") or (template.instrument_id if template else None)
    if instrument_id:
        qs = qs.filter(test__code__in=_get_instrument_test_codes(instrument_id))

    priority_filter = kwargs.get("priority_filter")
    if priority_filter:
        qs = qs.filter(lab_order__priority=priority_filter)

    date_from = kwargs.get("date_from")
    if date_from:
        qs = qs.filter(lab_order__ordered_at__date__gte=date_from)

    date_to = kwargs.get("date_to")
    if date_to:
        qs = qs.filter(lab_order__ordered_at__date__lte=date_to)

    title = kwargs.get("title") or _build_title(section_filter, template)
    export_format = kwargs.get("export_format", "PDF")

    worksheet = Worksheet.objects.create(
        facility=facility,
        organization=facility.organization,
        template=template,
        title=title,
        export_format=export_format,
        generated_by=user,
        specimen_count=qs.count(),
    )

    items = []
    for pos, order_item in enumerate(qs, start=1):
        specimen = order_item.specimens.first()
        items.append(
            WorksheetItem(
                worksheet=worksheet,
                order_item=order_item,
                specimen=specimen,
                position=pos,
                facility=facility,
                organization=facility.organization,
            )
        )

    if items:
        WorksheetItem.objects.bulk_create(items)

    return worksheet


def export_worksheet_csv(worksheet):
    """
    Export a worksheet as CSV.

    Returns:
        str: CSV content
    """
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(
        [
            "Position",
            "Specimen Barcode",
            "Patient MRN",
            "Patient Name",
            "Test Code",
            "Test Name",
            "Priority",
            "Ordered At",
        ]
    )

    items = worksheet.items.select_related(
        "order_item__test",
        "order_item__lab_order__patient",
        "specimen",
    ).order_by("position")

    for item in items:
        order_item = item.order_item
        lab_order = order_item.lab_order
        patient = lab_order.patient
        specimen = item.specimen

        writer.writerow(
            [
                item.position,
                specimen.barcode if specimen else "",
                patient.mrn,
                f"{patient.first_name} {patient.last_name}",
                order_item.test.code,
                order_item.test.name,
                lab_order.priority,
                lab_order.ordered_at.strftime("%Y-%m-%d %H:%M"),
            ]
        )

    return output.getvalue()


def generate_labels(facility, user, template, specimen_ids, copies=1):
    """
    Generate barcode labels for a batch of specimens.

    Args:
        facility: Facility
        user: User generating labels
        template: LabelTemplate instance
        specimen_ids: List of specimen IDs
        copies: Number of copies per label

    Returns:
        LabelPrintJob instance
    """
    from hmis.apps.laboratory.models import Specimen

    from .models import LabelPrintJob, LabelPrintJobItem

    specimens = (
        Specimen.objects.filter(
            id__in=specimen_ids,
            lab_order__facility=facility,
        )
        .select_related(
            "lab_order__patient",
        )
        .prefetch_related("lab_order__items__test")
    )

    job = LabelPrintJob.objects.create(
        facility=facility,
        organization=facility.organization,
        template=template,
        generated_by=user,
    )

    items = []
    label_output_parts = []

    for specimen in specimens:
        patient = specimen.lab_order.patient
        order_items = specimen.lab_order.items.all()
        test_names = ", ".join(oi.test.name for oi in order_items)

        label_data = {
            "barcode": specimen.barcode,
            "patient_name": f"{patient.first_name} {patient.last_name}",
            "mrn": patient.mrn,
            "test_name": test_names,
            "collected_at": (
                specimen.collected_at.strftime("%Y-%m-%d %H:%M") if specimen.collected_at else ""
            ),
            "specimen_type": specimen.specimen_type if hasattr(specimen, "specimen_type") else "",
        }

        items.append(
            LabelPrintJobItem(
                print_job=job,
                specimen=specimen,
                order_item=order_items.first(),
                copies=copies,
                label_data=label_data,
                facility=facility,
                organization=facility.organization,
            )
        )

        if template.label_format == "ZPL" and template.zpl_template:
            for _ in range(copies):
                label_output_parts.append(_render_zpl(template.zpl_template, label_data))

    if items:
        LabelPrintJobItem.objects.bulk_create(items)

    output = "\n".join(label_output_parts) if label_output_parts else ""
    job.mark_generated(output=output, count=len(items) * copies)

    return job


def _render_zpl(template_str, data):
    """Render a ZPL template with data placeholders."""
    try:
        return template_str.format(**data)
    except (KeyError, ValueError) as e:
        logger.warning("ZPL render error: %s", e)
        return template_str


def _get_instrument_test_codes(instrument_id):
    """Get test codes mapped to an instrument."""
    from hmis.apps.laboratory.analyzers.models import InstrumentChannel

    channels = InstrumentChannel.objects.filter(
        instrument_id=instrument_id,
        is_active=True,
    )
    test_codes = set()
    for channel in channels:
        mapping = channel.config.get("test_mapping", {})
        test_codes.update(mapping.values())
    return list(test_codes) if test_codes else ["__none__"]


def _build_title(section_filter, template):
    """Build a worksheet title."""
    if template:
        return f"{template.name} - {date.today().isoformat()}"
    if section_filter:
        return f"{section_filter} Worklist - {date.today().isoformat()}"
    return f"Lab Worksheet - {date.today().isoformat()}"
