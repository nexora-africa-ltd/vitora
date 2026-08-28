# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: FHIR device, device-use, medication, specimen, diagnostic report, immunization, procedure, imaging study, media, and care-plan endpoints.
How to use: imported by `hmis.apps.core.fhir.views` compatibility module for FHIR endpoint wiring.
Supported inputs/args: Django REST Framework API view classes/helpers for FHIR R4 resources.
"""

import logging
from datetime import date, datetime

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.permissions import ReadRequiresModelPermission, WriteRequiresRolePermission

logger = logging.getLogger(__name__)


class FHIRJSONRenderer(JSONRenderer):
    """Renderer for the canonical FHIR JSON media type."""

    media_type = "application/fhir+json"
    format = "fhir+json"


class FHIRAltJSONRenderer(JSONRenderer):
    """Renderer for alternate FHIR JSON media types used by some clients."""

    media_type = "application/json+fhir"
    format = "json+fhir"


FHIR_RENDERER_CLASSES = [FHIRJSONRenderer, FHIRAltJSONRenderer, JSONRenderer]


class FHIRSchemaSerializer(serializers.Serializer):
    """Named fallback serializer used only for OpenAPI introspection."""

    payload = serializers.JSONField(required=False)


class FHIRSchemaMixin:
    """Provide default serializer hooks for APIView OpenAPI introspection."""

    serializer_class = FHIRSchemaSerializer

    def get_serializer_class(self):
        return getattr(self, "serializer_class", FHIRSchemaSerializer)

    def get_serializer(self, *args, **kwargs):
        serializer_class = self.get_serializer_class()
        kwargs.setdefault("context", self.get_serializer_context())
        return serializer_class(*args, **kwargs)

    def get_serializer_context(self):
        return {"request": getattr(self, "request", None), "view": self}


class PublicFHIRReadAPIView(FHIRSchemaMixin, APIView):
    """Shared Inferno-friendly config for unauthenticated FHIR read endpoints."""

    permission_classes = [AllowAny]
    renderer_classes = FHIR_RENDERER_CLASSES


CANONICAL_ICD10_DISPLAYS = {
    "I10": "Essential (primary) hypertension",
    "J06.9": "Acute upper respiratory infection, unspecified",
}

CANONICAL_LOINC_DISPLAYS = {
    "718-7": "Hemoglobin [Mass/volume] in Blood",
    "74013-4": "Alcoholic drinks per day",
    "11636-8": "[#] Births.live",
    "11613-7": "[#] Abortions.induced",
    "11614-5": "[#] Abortions.spontaneous",
    "11638-4": "[#] Births.still living",
    "33065-4": "[#] Ectopic pregnancy",
}

OBSERVATION_INTERPRETATION_MAP = {
    "NORMAL": {
        "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
        "code": "N",
        "display": "Normal",
    },
    "LOW": {
        "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
        "code": "L",
        "display": "Low",
    },
    "HIGH": {
        "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
        "code": "H",
        "display": "High",
    },
    "CRITICAL_LOW": {
        "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
        "code": "LL",
        "display": "Critical low",
    },
    "CRITICAL_HIGH": {
        "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
        "code": "HH",
        "display": "Critical high",
    },
    "ABNORMAL": {
        "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
        "code": "A",
        "display": "Abnormal",
    },
    "POSITIVE": {
        "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
        "code": "POS",
        "display": "Positive",
    },
    "NEGATIVE": {
        "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
        "code": "NEG",
        "display": "Negative",
    },
}


def build_generated_narrative(title: str, lines: list[str]) -> dict:
    """Build a simple generated XHTML narrative block."""
    rendered_lines = "".join(f"<p>{line}</p>" for line in lines if line)
    return {
        "status": "generated",
        "div": (
            f'<div xmlns="http://www.w3.org/1999/xhtml"><p><b>{title}</b></p>{rendered_lines}</div>'
        ),
    }


def format_date(d) -> str | None:
    """Format date to FHIR format."""
    if isinstance(d, datetime):
        return d.strftime("%Y-%m-%dT%H:%M:%S+00:00")
    if isinstance(d, date):
        return d.strftime("%Y-%m-%d")
    return None


def get_base_url(request) -> str:
    """Get the base URL for FHIR resource references."""
    return f"{request.scheme}://{request.get_host()}/fhir"


def build_fhir_organization_resource(organization, request) -> dict:
    """Convert a tenant Organization to a FHIR Organization resource."""
    base_url = get_base_url(request)
    fhir_resource = {
        "resourceType": "Organization",
        "id": str(organization.id),
        "meta": {
            "versionId": "1",
            "lastUpdated": format_date(getattr(organization, "updated_at", datetime.now())),
        },
        "text": {
            "status": "generated",
            "div": (
                '<div xmlns="http://www.w3.org/1999/xhtml">'
                f"<p><b>Organization</b>: {organization.name}</p>"
                "</div>"
            ),
        },
        "identifier": [
            {
                "use": "official",
                "system": f"{base_url}/identifier/organization",
                "value": organization.slug or str(organization.id),
            }
        ],
        "active": organization.is_active,
        "name": organization.name,
    }

    telecom = []
    if organization.contact_phone:
        telecom.append({"system": "phone", "value": organization.contact_phone, "use": "work"})
    if organization.contact_email:
        telecom.append({"system": "email", "value": organization.contact_email, "use": "work"})
    if telecom:
        fhir_resource["telecom"] = telecom

    if organization.address:
        fhir_resource["address"] = [
            {
                "use": "work",
                "type": "both",
                "text": organization.address,
                "country": "Kenya",
            }
        ]

    return fhir_resource


def build_fallback_ips_organization_resource(request) -> dict:
    """Build a stable fallback Organization for IPS author/custodian references."""
    base_url = get_base_url(request)
    return {
        "resourceType": "Organization",
        "id": "vitora-hmis",
        "meta": {
            "versionId": "1",
            "lastUpdated": format_date(datetime.now()),
        },
        "identifier": [
            {
                "use": "official",
                "system": f"{base_url}/identifier/organization",
                "value": "vitora-hmis",
            }
        ],
        "active": True,
        "name": "Vitora HMIS",
        "text": {
            "status": "generated",
            "div": (
                '<div xmlns="http://www.w3.org/1999/xhtml">'
                "<p><b>Organization</b>: Vitora HMIS</p>"
                "</div>"
            ),
        },
    }


def resolve_ips_author_organization(
    patient, diagnoses=None, prescriptions=None, treatment_plans=None
):
    """Resolve the best available organization for IPS author/custodian references."""
    if getattr(patient, "organization", None):
        return patient.organization

    registered_facility = getattr(patient, "registered_at_facility", None)
    if registered_facility and getattr(registered_facility, "organization", None):
        return registered_facility.organization

    for diagnosis in diagnoses or []:
        encounter = getattr(diagnosis, "encounter", None)
        if encounter and getattr(encounter, "organization", None):
            return encounter.organization

    for prescription in prescriptions or []:
        if getattr(prescription, "organization", None):
            return prescription.organization
        encounter = getattr(prescription, "encounter", None)
        if encounter and getattr(encounter, "organization", None):
            return encounter.organization

    for treatment_plan in treatment_plans or []:
        encounter = getattr(treatment_plan, "encounter", None)
        if encounter and getattr(encounter, "organization", None):
            return encounter.organization

    return None


class FHIRDeviceView(PublicFHIRReadAPIView):
    """
    FHIR Device resource endpoint.

    GET /fhir/Device/{id} - Returns Device resource in FHIR R4 format.
    """

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a FHIR R4 Device resource by ID",
    )
    def get(self, request, pk: int) -> Response:
        """Get a Device resource by ID."""
        from hmis.apps.theatre.models import TheatreConsumable

        try:
            implant = TheatreConsumable.objects.select_related(
                "surgery_case__patient",
                "item",
            ).get(pk=pk, is_implant=True)
        except TheatreConsumable.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"Device with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(self._to_fhir_device(implant), status=status.HTTP_200_OK)

    def _to_fhir_device(self, implant) -> dict:
        """Convert an implant-backed theatre consumable to FHIR Device."""
        item_name = getattr(implant.item, "generic_name", str(implant.item))
        identifiers = []
        if implant.implant_serial_number:
            identifiers.append(
                {
                    "system": "urn:vitora:implant-serial",
                    "value": implant.implant_serial_number,
                }
            )
        if implant.lot_number:
            identifiers.append({"system": "urn:vitora:implant-lot", "value": implant.lot_number})

        fhir_resource = {
            "resourceType": "Device",
            "id": str(implant.id),
            "status": "active",
            "patient": {"reference": f"Patient/{implant.surgery_case.patient_id}"},
            "type": {
                "coding": [
                    {
                        "system": "urn:vitora:drug",
                        "code": implant.item.code,
                        "display": item_name,
                    }
                ],
                "text": item_name,
            },
            "serialNumber": implant.implant_serial_number,
            "lotNumber": implant.lot_number,
        }
        if identifiers:
            fhir_resource["identifier"] = identifiers
        return fhir_resource


class FHIRDeviceUseStatementView(PublicFHIRReadAPIView):
    """FHIR DeviceUseStatement resource endpoint."""

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a FHIR R4 DeviceUseStatement resource by ID",
    )
    def get(self, request, pk: int) -> Response:
        """Get a DeviceUseStatement resource by ID."""
        from hmis.apps.theatre.models import TheatreConsumable

        try:
            implant = TheatreConsumable.objects.select_related(
                "surgery_case__patient",
                "item",
            ).get(pk=pk, is_implant=True)
        except TheatreConsumable.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"DeviceUseStatement with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(self._to_fhir_device_use_statement(implant), status=status.HTTP_200_OK)

    def _to_fhir_device_use_statement(self, implant) -> dict:
        """Convert an implant-backed theatre consumable to FHIR DeviceUseStatement."""
        item_name = getattr(implant.item, "generic_name", str(implant.item))
        statement = {
            "resourceType": "DeviceUseStatement",
            "id": str(implant.id),
            "status": "active",
            "subject": {"reference": f"Patient/{implant.surgery_case.patient_id}"},
            "device": {
                "reference": f"Device/{implant.id}",
                "display": item_name,
            },
            "timingDateTime": format_date(implant.added_at),
            "source": {"reference": f"Practitioner/{implant.added_by_id}"},
            "reasonCode": [{"text": implant.surgery_case.diagnosis}],
            "note": [
                {
                    "text": f"Implant used during surgery case {implant.surgery_case.case_number}",
                }
            ],
        }
        if implant.implant_serial_number:
            statement["note"].append(
                {"text": f"Implant serial number: {implant.implant_serial_number}"}
            )
        return statement


class FHIRMedicationView(PublicFHIRReadAPIView):
    """FHIR Medication resource endpoint."""

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a FHIR R4 Medication resource by ID",
    )
    def get(self, request, pk: int) -> Response:
        """Get a Medication resource by ID."""
        from hmis.apps.pharmacy.models import Drug

        try:
            drug = Drug.objects.get(pk=pk)
        except Drug.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"Medication with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(self._to_fhir_medication(drug), status=status.HTTP_200_OK)

    def _to_fhir_medication(self, drug) -> dict:
        """Convert Django Drug to FHIR Medication resource."""
        coding = [
            {
                "system": "urn:vitora:drug",
                "code": drug.code,
                "display": drug.generic_name,
            }
        ]
        if drug.keml_code:
            coding.append(
                {
                    "system": "urn:kenya:keml",
                    "code": drug.keml_code,
                    "display": drug.generic_name,
                }
            )

        return {
            "resourceType": "Medication",
            "id": str(drug.id),
            "status": "active" if drug.is_active else "inactive",
            "code": {
                "coding": coding,
                "text": f"{drug.generic_name} {drug.strength} {drug.form}",
            },
            "doseForm": {"text": drug.get_form_display()},
        }


class FHIRSpecimenView(PublicFHIRReadAPIView):
    """FHIR Specimen resource endpoint."""

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a FHIR R4 Specimen resource by ID",
    )
    def get(self, request, pk: int) -> Response:
        """Get a Specimen resource by ID."""
        from hmis.apps.laboratory.models import Specimen

        try:
            specimen = Specimen.objects.select_related("lab_order__patient").get(pk=pk)
        except Specimen.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"Specimen with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(self._to_fhir_specimen(specimen), status=status.HTTP_200_OK)

    def _to_fhir_specimen(self, specimen) -> dict:
        """Convert Django Specimen to FHIR Specimen resource."""
        status_map = {
            "PENDING": "available",
            "COLLECTED": "available",
            "RECEIVED": "available",
            "PROCESSING": "available",
            "STORED": "available",
            "REJECTED": "unsatisfactory",
            "DISPOSED": "unavailable",
        }
        fhir_resource = {
            "resourceType": "Specimen",
            "id": str(specimen.id),
            "meta": {"profile": ["http://hl7.org/fhir/uv/ips/StructureDefinition/Specimen-uv-ips"]},
            "identifier": [{"value": specimen.barcode}],
            "status": status_map.get(specimen.status, "available"),
            "type": {"text": specimen.get_specimen_type_display()},
            "subject": {"reference": f"Patient/{specimen.lab_order.patient_id}"},
            "text": build_generated_narrative(
                "Specimen",
                [
                    f"Barcode: {specimen.barcode}",
                    f"Type: {specimen.get_specimen_type_display()}",
                ],
            ),
        }
        if specimen.collected_at or specimen.collection_site:
            fhir_resource["collection"] = {
                "collectedDateTime": format_date(specimen.collected_at),
                "bodySite": {"text": specimen.collection_site},
            }
        if specimen.received_at:
            fhir_resource["receivedTime"] = format_date(specimen.received_at)
        return fhir_resource


class FHIRDiagnosticReportView(PublicFHIRReadAPIView):
    """FHIR DiagnosticReport resource endpoint."""

    STATUS_MAP = {
        "DRAFT": "registered",
        "PRELIMINARY": "preliminary",
        "FINAL": "final",
        "AMENDED": "amended",
        "CANCELLED": "cancelled",
    }

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a FHIR R4 DiagnosticReport resource by ID",
    )
    def get(self, request, pk: int) -> Response:
        """Get a DiagnosticReport resource by ID."""
        from hmis.apps.laboratory.models import DiagnosticReport

        try:
            report = DiagnosticReport.objects.select_related("lab_order__patient").get(pk=pk)
        except DiagnosticReport.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"DiagnosticReport with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(self._to_fhir_diagnostic_report(report), status=status.HTTP_200_OK)

    def _to_fhir_diagnostic_report(self, report) -> dict:
        """Convert Django DiagnosticReport to FHIR DiagnosticReport resource."""
        results = []
        specimens = []
        for order_item in report.lab_order.items.select_related("result").all():
            if hasattr(order_item, "result"):
                results.append({"reference": f"Observation/{order_item.result.id}"})
                if order_item.result.specimen_id:
                    specimens.append({"reference": f"Specimen/{order_item.result.specimen_id}"})

        fhir_resource = {
            "resourceType": "DiagnosticReport",
            "id": str(report.id),
            "meta": {
                "profile": [
                    "http://hl7.org/fhir/uv/ips/StructureDefinition/DiagnosticReport-uv-ips"
                ]
            },
            "status": self.STATUS_MAP.get(report.status, "unknown"),
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/v2-0074",
                            "code": "LAB",
                            "display": "Laboratory",
                        }
                    ],
                    "text": "Laboratory",
                }
            ],
            "code": {"text": "Laboratory Diagnostic Report"},
            "subject": {"reference": f"Patient/{report.lab_order.patient_id}"},
            "effectiveDateTime": format_date(report.issued_at or report.created_at),
            "issued": format_date(report.issued_at or report.created_at),
            "result": results,
            "performer": [{"reference": f"Practitioner/{report.issued_by_id}"}],
            "text": build_generated_narrative(
                "DiagnosticReport",
                [report.conclusion or "Laboratory diagnostic report"],
            ),
        }
        if specimens:
            fhir_resource["specimen"] = specimens
        if report.conclusion:
            fhir_resource["conclusion"] = report.conclusion
        return fhir_resource


class FHIRImmunizationView(PublicFHIRReadAPIView):
    """FHIR Immunization resource endpoint."""

    STATUS_MAP = {
        "SCHEDULED": "completed",
        "ADMINISTERED": "completed",
        "MISSED": "not-done",
        "CONTRAINDICATED": "not-done",
        "DEFERRED": "not-done",
    }

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a FHIR R4 Immunization resource by ID",
    )
    def get(self, request, pk: int) -> Response:
        """Get an Immunization resource by ID."""
        from hmis.apps.immunizations.models import ImmunizationRecord

        try:
            record = ImmunizationRecord.objects.select_related("patient", "vaccine").get(pk=pk)
        except ImmunizationRecord.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"Immunization with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(self._to_fhir_immunization(record), status=status.HTTP_200_OK)

    def _to_fhir_immunization(self, record) -> dict:
        """Convert Django ImmunizationRecord to FHIR Immunization resource."""
        fhir_resource = {
            "resourceType": "Immunization",
            "id": str(record.id),
            "status": self.STATUS_MAP.get(record.status, "completed"),
            "vaccineCode": {
                "coding": [{"system": "urn:vitora:vaccine", "code": record.vaccine.code}],
                "text": record.vaccine.name,
            },
            "patient": {"reference": f"Patient/{record.patient_id}"},
            "occurrenceDateTime": format_date(record.administered_date or record.scheduled_date),
            "protocolApplied": [{"doseNumberPositiveInt": record.dose_number}],
        }
        if record.batch_number or record.lot_number:
            fhir_resource["lotNumber"] = record.batch_number or record.lot_number
        if record.site:
            fhir_resource["site"] = {"text": record.get_site_display()}
        return fhir_resource


class FHIRProcedureView(PublicFHIRReadAPIView):
    """FHIR Procedure resource endpoint."""

    STATUS_MAP = {
        "ORDERED": "preparation",
        "CONSENT_PENDING": "preparation",
        "SCHEDULED": "preparation",
        "READY": "preparation",
        "IN_PROGRESS": "in-progress",
        "COMPLETED": "completed",
        "CANCELLED": "stopped",
    }

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a FHIR R4 Procedure resource by ID",
    )
    def get(self, request, pk: int) -> Response:
        """Get a Procedure resource by ID."""
        from hmis.apps.procedures.models import ProcedureOrder

        try:
            order = ProcedureOrder.objects.select_related("patient", "procedure").get(pk=pk)
        except ProcedureOrder.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"Procedure with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(self._to_fhir_procedure(order), status=status.HTTP_200_OK)

    def _to_fhir_procedure(self, order) -> dict:
        """Convert Django ProcedureOrder to FHIR Procedure resource."""
        fhir_resource = {
            "resourceType": "Procedure",
            "id": str(order.id),
            "status": self.STATUS_MAP.get(order.status, "unknown"),
            "code": {
                "coding": [
                    {
                        "system": "urn:vitora:procedure",
                        "code": order.procedure.code,
                        "display": order.procedure.name,
                    }
                ],
                "text": order.procedure.name,
            },
            "subject": {"reference": f"Patient/{order.patient_id}"},
            "performedDateTime": format_date(order.scheduled_date or order.ordered_at),
            "reasonCode": [{"text": order.indication}],
        }
        if order.body_site:
            fhir_resource["bodySite"] = [{"text": order.body_site}]
        return fhir_resource


class FHIRImagingStudyView(PublicFHIRReadAPIView):
    """FHIR ImagingStudy resource endpoint."""

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a FHIR R4 ImagingStudy resource by ID",
    )
    def get(self, request, pk: int) -> Response:
        """Get an ImagingStudy resource by ID."""
        from hmis.apps.imaging.models import DICOMStudy

        try:
            study = DICOMStudy.objects.prefetch_related("series_set__instances").get(pk=pk)
        except DICOMStudy.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"ImagingStudy with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(self._to_fhir_imaging_study(study), status=status.HTTP_200_OK)

    def _to_fhir_imaging_study(self, study) -> dict:
        """Convert Django DICOMStudy to FHIR ImagingStudy resource."""
        return {
            "resourceType": "ImagingStudy",
            "id": str(study.id),
            "identifier": [{"value": study.accession_number or study.study_instance_uid}],
            "status": "available",
            "subject": {"reference": f"Patient/{study.patient_id}"},
            "started": format_date(
                datetime.combine(study.study_date, study.study_time or datetime.min.time())
            ),
            "numberOfSeries": study.number_of_series,
            "numberOfInstances": study.number_of_instances,
            "series": [
                {
                    "uid": series.series_instance_uid,
                    "number": series.series_number,
                    "modality": {"code": series.modality},
                    "description": series.series_description,
                    "numberOfInstances": series.number_of_instances,
                    "instance": [
                        {
                            "uid": instance.sop_instance_uid,
                            "number": instance.instance_number,
                            "sopClass": {"code": instance.sop_class_uid},
                        }
                        for instance in series.instances.all()
                    ],
                }
                for series in study.series_set.all()
            ],
        }


class FHIRMediaView(PublicFHIRReadAPIView):
    """FHIR Media resource endpoint."""

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a FHIR R4 Media resource by ID",
    )
    def get(self, request, pk: int) -> Response:
        """Get a Media resource by ID."""
        from hmis.apps.imaging.models import DICOMInstance

        try:
            instance = DICOMInstance.objects.select_related("series__study__patient").get(pk=pk)
        except DICOMInstance.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"Media with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(self._to_fhir_media(instance), status=status.HTTP_200_OK)

    def _to_fhir_media(self, instance) -> dict:
        """Convert Django DICOMInstance to FHIR Media resource."""
        patient_id = instance.series.study.patient_id
        return {
            "resourceType": "Media",
            "id": str(instance.id),
            "status": "completed",
            "subject": {"reference": f"Patient/{patient_id}"},
            "modality": {"text": instance.series.modality},
            "content": {
                "contentType": "application/dicom",
                "url": instance.file_path,
                "size": instance.file_size,
                "title": instance.sop_instance_uid,
            },
            "createdDateTime": format_date(instance.created_at),
        }


class FHIRCarePlanView(APIView):
    """
    FHIR CarePlan resource endpoint.

    GET /fhir/CarePlan/{id} - Returns CarePlan resource in FHIR R4 format.

    Maps Django TreatmentPlan to FHIR CarePlan resource for IPS Plan of Care section.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    # Status mapping from Django to FHIR CarePlan status
    STATUS_MAP = {
        "DRAFT": "draft",
        "ACTIVE": "active",
        "COMPLETED": "completed",
        "CANCELLED": "revoked",
    }

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a FHIR R4 CarePlan resource by ID",
    )
    def get(self, request, pk: int) -> Response:
        """Get a CarePlan resource by ID."""
        from hmis.apps.encounters.models import TreatmentPlan

        try:
            treatment_plan = TreatmentPlan.objects.select_related(
                "encounter__patient", "created_by", "approved_by"
            ).get(pk=pk)
        except TreatmentPlan.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"CarePlan with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        fhir_resource = self._to_fhir_care_plan(treatment_plan, request)
        return Response(fhir_resource, status=status.HTTP_200_OK)

    def _to_fhir_care_plan(self, treatment_plan, request) -> dict:
        """
        Convert Django TreatmentPlan to FHIR CarePlan.

        Args:
            treatment_plan: TreatmentPlan instance
            request: HTTP request for URL generation

        Returns:
            dict: FHIR R4 CarePlan resource
        """
        base_url = get_base_url(request)
        patient = treatment_plan.encounter.patient

        fhir_resource = {
            "resourceType": "CarePlan",
            "id": str(treatment_plan.id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(treatment_plan.updated_at),
            },
            "status": self.STATUS_MAP.get(treatment_plan.status, "active"),
            "intent": "plan",
            "title": f"Treatment Plan - {treatment_plan.encounter.encounter_type}",
            "subject": {
                "reference": f"Patient/{patient.id}",
                "display": f"{patient.first_name} {patient.last_name}",
            },
            "period": {
                "start": format_date(treatment_plan.created_at),
            },
            "created": format_date(treatment_plan.created_at),
        }

        # Add encounter context
        fhir_resource["encounter"] = {
            "reference": f"Encounter/{treatment_plan.encounter.id}",
        }

        # Add author (created_by)
        if treatment_plan.created_by:
            fhir_resource["author"] = {
                "reference": f"Practitioner/{treatment_plan.created_by.id}",
                "display": treatment_plan.created_by.get_full_name()
                or treatment_plan.created_by.username,
            }

        # Add contributor (approved_by) if different from author
        if treatment_plan.approved_by and treatment_plan.approved_by != treatment_plan.created_by:
            fhir_resource["contributor"] = [
                {
                    "reference": f"Practitioner/{treatment_plan.approved_by.id}",
                    "display": treatment_plan.approved_by.get_full_name()
                    or treatment_plan.approved_by.username,
                }
            ]

        # Build description from clinical notes and instructions
        description_parts = []
        if treatment_plan.clinical_notes:
            description_parts.append(f"Clinical Notes: {treatment_plan.clinical_notes}")
        if treatment_plan.follow_up_instructions:
            description_parts.append(f"Follow-up: {treatment_plan.follow_up_instructions}")
        if description_parts:
            fhir_resource["description"] = "\n\n".join(description_parts)

        # Add activities
        activities = []

        # Diet recommendations as activity
        if treatment_plan.diet_recommendations:
            activities.append(
                {
                    "detail": {
                        "kind": "ServiceRequest",
                        "code": {
                            "coding": [
                                {
                                    "system": "http://snomed.info/sct",
                                    "code": "182922004",
                                    "display": "Dietary regime",
                                }
                            ],
                            "text": "Diet Recommendations",
                        },
                        "status": "in-progress",
                        "description": treatment_plan.diet_recommendations,
                    }
                }
            )

        # Activity restrictions as activity
        if treatment_plan.activity_restrictions:
            activities.append(
                {
                    "detail": {
                        "kind": "ServiceRequest",
                        "code": {
                            "coding": [
                                {
                                    "system": "http://snomed.info/sct",
                                    "code": "183301007",
                                    "display": "Physical activity restriction",
                                }
                            ],
                            "text": "Activity Restrictions",
                        },
                        "status": "in-progress",
                        "description": treatment_plan.activity_restrictions,
                    }
                }
            )

        # Referral as activity
        if treatment_plan.referral_needed and treatment_plan.referral_specialty:
            referral_desc = treatment_plan.referral_specialty
            if treatment_plan.referral_notes:
                referral_desc += f": {treatment_plan.referral_notes}"
            activities.append(
                {
                    "detail": {
                        "kind": "ServiceRequest",
                        "code": {
                            "coding": [
                                {
                                    "system": "http://snomed.info/sct",
                                    "code": "3457005",
                                    "display": "Patient referral",
                                }
                            ],
                            "text": f"Referral to {treatment_plan.referral_specialty}",
                        },
                        "status": "scheduled",
                        "description": referral_desc,
                    }
                }
            )

        # Follow-up appointment as activity
        if treatment_plan.follow_up_date:
            activities.append(
                {
                    "detail": {
                        "kind": "Appointment",
                        "code": {
                            "coding": [
                                {
                                    "system": "http://snomed.info/sct",
                                    "code": "390906007",
                                    "display": "Follow-up appointment",
                                }
                            ],
                            "text": "Follow-up Appointment",
                        },
                        "status": "scheduled",
                        "scheduledPeriod": {
                            "start": format_date(treatment_plan.follow_up_date),
                        },
                        "description": treatment_plan.follow_up_instructions
                        or "Scheduled follow-up",
                    }
                }
            )

        if activities:
            fhir_resource["activity"] = activities

        # Add note with full clinical notes
        if treatment_plan.clinical_notes:
            fhir_resource["note"] = [
                {
                    "text": treatment_plan.clinical_notes,
                    "time": format_date(treatment_plan.created_at),
                }
            ]
            if treatment_plan.created_by:
                fhir_resource["note"][0]["authorReference"] = {
                    "reference": f"Practitioner/{treatment_plan.created_by.id}",
                }

        return fhir_resource
