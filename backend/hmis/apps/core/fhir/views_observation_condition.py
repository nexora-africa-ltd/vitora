# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, F401, F841
"""Core views observation condition for Vitora HMIS.

What this file is for:
- Implement views observation condition logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
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


class FHIRObservationView(PublicFHIRReadAPIView):
    """
    FHIR Observation resource endpoint.

    GET /fhir/Observation/{id} - Returns Observation resource in FHIR R4 format.

    This endpoint serves various observation types:
    - Vital signs from encounters
    - Lab results
    - Social history observations
    """

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a FHIR R4 Observation resource by ID",
    )
    def get(self, request, pk) -> Response:
        """Get an Observation resource by ID (integer PK or UUID fhir_id)."""
        from hmis.apps.encounters.models import PregnancyObservation, SocialHistoryObservation
        from hmis.apps.imaging.models import DICOMStudy

        # UUID-keyed observations (social history, pregnancy)
        try:
            social_history_observation = SocialHistoryObservation.objects.select_related(
                "patient", "encounter"
            ).get(fhir_id=pk)
            return Response(
                self._social_history_to_fhir(social_history_observation, request),
                status=status.HTTP_200_OK,
            )
        except (SocialHistoryObservation.DoesNotExist, ValueError):
            pass

        try:
            pregnancy_observation = PregnancyObservation.objects.select_related(
                "patient", "encounter", "mch_registration", "delivery"
            ).get(fhir_id=pk)
            return Response(
                self._pregnancy_observation_to_fhir(pregnancy_observation, request),
                status=status.HTTP_200_OK,
            )
        except (PregnancyObservation.DoesNotExist, ValueError):
            pass

        # Integer-keyed observations — guard against non-numeric pk
        try:
            int_pk = int(pk)
        except (ValueError, TypeError):
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"Observation with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            study = DICOMStudy.objects.prefetch_related("reports").get(pk=int_pk)
            return Response(
                self._radiology_study_to_fhir(study, request),
                status=status.HTTP_200_OK,
            )
        except DICOMStudy.DoesNotExist:
            pass

        # Check lab results
        from hmis.apps.laboratory.models import LabResult

        try:
            lab_result = LabResult.objects.select_related(
                "order_item__lab_order__patient",
            ).get(pk=int_pk)
            return Response(
                self._lab_result_to_fhir(lab_result, request), status=status.HTTP_200_OK
            )
        except LabResult.DoesNotExist:
            pass

        # Check for vitals in encounters
        from hmis.apps.encounters.models import Encounter

        try:
            encounter = Encounter.objects.select_related("patient").get(pk=int_pk)
            # Return first vital sign as observation
            return Response(
                self._encounter_vitals_to_fhir(encounter, request), status=status.HTTP_200_OK
            )
        except Encounter.DoesNotExist:
            pass

        return Response(
            {
                "resourceType": "OperationOutcome",
                "issue": [
                    {
                        "severity": "error",
                        "code": "not-found",
                        "diagnostics": f"Observation with ID {pk} not found",
                    }
                ],
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    def _lab_result_to_fhir(self, lab_result, request) -> dict:
        """Convert LabResult to FHIR Observation."""
        order_item = lab_result.order_item
        lab_order = order_item.lab_order
        test = order_item.test

        value_field = {}
        if lab_result.numeric_value is not None:
            numeric_unit = lab_result.result_unit or test.result_unit or ""
            quantity: dict = {
                "value": float(lab_result.numeric_value),
                "system": "http://unitsofmeasure.org",
            }
            if numeric_unit:
                quantity["unit"] = numeric_unit
                quantity["code"] = numeric_unit
            value_field = {"valueQuantity": quantity}
        elif lab_result.text_value:
            value_field = {"valueString": lab_result.text_value}
        elif lab_result.option_value:
            value_field = {"valueString": lab_result.option_value}

        canonical_display = CANONICAL_LOINC_DISPLAYS.get(test.loinc_code or "", test.name)
        performer_reference = None
        if lab_order.ordered_by_id:
            performer_reference = {"reference": f"Practitioner/{lab_order.ordered_by_id}"}
        else:
            performer_reference = {"reference": "Organization/vitora-hmis"}

        fhir_resource = {
            "resourceType": "Observation",
            "id": str(lab_result.id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(lab_result.updated_at),
                "profile": [
                    "http://hl7.org/fhir/uv/ips/StructureDefinition/Observation-results-laboratory-uv-ips",
                    "http://hl7.org/fhir/uv/ips/StructureDefinition/Observation-results-uv-ips",
                ],
            },
            "status": "final",
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                            "code": "laboratory",
                            "display": "Laboratory",
                        }
                    ]
                }
            ],
            "code": {
                "coding": [
                    {
                        "system": "http://loinc.org",
                        "code": test.loinc_code or "unknown",
                        "display": canonical_display,
                    }
                ],
                "text": canonical_display,
            },
            "subject": {"reference": f"Patient/{lab_order.patient.id}"},
            "effectiveDateTime": format_date(lab_result.verified_at or lab_result.entered_at),
            "performer": [performer_reference],
        }

        if lab_order.encounter_id:
            fhir_resource["encounter"] = {"reference": f"Encounter/{lab_order.encounter_id}"}

        if lab_result.reference_range_text:
            fhir_resource["referenceRange"] = [{"text": lab_result.reference_range_text}]

        if lab_result.result_flag:
            interpretation = OBSERVATION_INTERPRETATION_MAP.get(lab_result.result_flag)
            if interpretation:
                fhir_resource["interpretation"] = [
                    {
                        "coding": [interpretation],
                        "text": lab_result.get_result_flag_display(),
                    }
                ]
            else:
                fhir_resource["interpretation"] = [{"text": lab_result.get_result_flag_display()}]

        if lab_result.specimen_id:
            fhir_resource["specimen"] = {"reference": f"Specimen/{lab_result.specimen_id}"}

        fhir_resource.update(value_field)
        # Build display value for narrative
        if "valueQuantity" in value_field:
            q = value_field["valueQuantity"]
            result_display = f"{q['value']:g} {q.get('unit', '')}".strip()
        else:
            result_display = fhir_resource.get("valueString", "Not recorded")
        fhir_resource["text"] = build_generated_narrative(
            "Observation",
            [
                f"Test: {canonical_display}",
                f"Result: {result_display}",
            ],
        )

        return fhir_resource

    def _radiology_study_to_fhir(self, study, request) -> dict:
        """Convert a DICOM study to a radiology-style Observation for Inferno read tests."""
        series_descriptions = [
            series.series_description
            for series in study.series_set.all()
            if series.series_description
        ]
        report = study.reports.first() if hasattr(study, "reports") else None
        value_text = (
            getattr(report, "impression", "")
            or getattr(report, "findings", "")
            or "; ".join(series_descriptions)
            or "Radiology study available"
        )
        code_text = series_descriptions[0] if series_descriptions else "Radiology study result"
        performer_reference = (
            {"reference": f"Practitioner/{report.reported_by_id}"}
            if report and getattr(report, "reported_by_id", None)
            else {"reference": "Organization/vitora-hmis"}
        )

        return {
            "resourceType": "Observation",
            "id": str(study.id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(getattr(study, "updated_at", None) or datetime.now()),
                "profile": [
                    "http://hl7.org/fhir/uv/ips/StructureDefinition/Observation-results-radiology-uv-ips"
                ],
            },
            "text": build_generated_narrative(
                "Observation",
                [
                    f"Procedure: {code_text}",
                    f"Conclusion: {value_text}",
                ],
            ),
            "status": "final",
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                            "code": "imaging",
                            "display": "Imaging",
                        }
                    ]
                }
            ],
            "code": {"text": code_text},
            "subject": {"reference": f"Patient/{study.patient_id}"},
            "effectiveDateTime": format_date(
                datetime.combine(study.study_date, study.study_time or datetime.min.time())
            ),
            "performer": [performer_reference],
            "partOf": [{"reference": f"ImagingStudy/{study.id}"}],
            "valueString": value_text,
        }

    def _social_history_to_fhir(self, observation, request) -> dict:
        """Convert a dedicated social-history observation to FHIR Observation."""
        code_map = {
            "ALCOHOL_USE": {
                "code": "74013-4",
                "display": "Alcoholic drinks per day",
                "text": "Alcohol use",
            },
            "TOBACCO_USE": {
                "code": "72166-2",
                "display": "Tobacco smoking status",
                "text": "Tobacco use",
            },
            "OCCUPATION": {
                "code": "11341-5",
                "display": "History of Occupation",
                "text": "Occupation",
            },
            "LIFESTYLE": {
                "code": "86198-2",
                "display": "Social history narrative",
                "text": "Lifestyle",
            },
        }
        alcohol_quantity_map = {
            "CURRENT": 1,
            "FORMER": 0,
            "NEVER": 0,
            "UNKNOWN": 0,
        }
        alcohol_status_text = {
            "CURRENT": "Current alcohol use",
            "FORMER": "Former use",
            "NEVER": "No alcohol use",
            "UNKNOWN": "Alcohol use unknown",
        }
        generic_status_text = {
            "CURRENT": "Current use",
            "FORMER": "Former use",
            "NEVER": "Never used",
            "UNKNOWN": "Unknown",
        }
        code = code_map[observation.observation_type]
        status_text = (
            alcohol_status_text
            if observation.observation_type == "ALCOHOL_USE"
            else generic_status_text
        )

        fhir_resource = {
            "resourceType": "Observation",
            "id": str(observation.fhir_id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(observation.updated_at),
                "profile": [
                    "http://hl7.org/fhir/uv/ips/StructureDefinition/Observation-alcoholuse-uv-ips"
                    if observation.observation_type == "ALCOHOL_USE"
                    else "http://hl7.org/fhir/uv/ips/StructureDefinition/Observation-tobaccouse-uv-ips"
                ],
            },
            "status": "final",
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                            "code": "social-history",
                            "display": "Social History",
                        }
                    ]
                }
            ],
            "code": {
                "coding": [
                    {
                        "system": "http://loinc.org",
                        "code": code["code"],
                        "display": code["display"],
                    }
                ],
                "text": code["text"],
            },
            "subject": {"reference": f"Patient/{observation.patient_id}"},
            "effectiveDateTime": format_date(observation.effective_date),
            "text": build_generated_narrative(
                "Observation",
                [
                    f"Type: {code['text']}",
                    status_text.get(observation.status, observation.status),
                ],
            ),
            "performer": [{"reference": "Organization/vitora-hmis"}],
        }

        if observation.observation_type == "ALCOHOL_USE":
            fhir_resource["valueQuantity"] = {
                "value": alcohol_quantity_map.get(observation.status, 0),
                "unit": "/d",
                "system": "http://unitsofmeasure.org",
                "code": "/d",
            }
        else:
            fhir_resource["valueCodeableConcept"] = {
                "text": status_text.get(observation.status, observation.status),
            }

        if observation.encounter_id:
            fhir_resource["encounter"] = {"reference": f"Encounter/{observation.encounter_id}"}

        if observation.value_text:
            fhir_resource["note"] = [{"text": observation.value_text}]

        return fhir_resource

    def _pregnancy_observation_to_fhir(self, observation, request) -> dict:
        """Convert a dedicated pregnancy observation to FHIR Observation."""
        code_map = {
            "PREGNANCY_STATUS": {
                "system": "http://loinc.org",
                "code": "82810-3",
                "display": "Pregnancy status",
                "text": "Pregnancy status",
            },
            "PREGNANCY_EXPECTED_DELIVERY_DATE": {
                "system": "http://loinc.org",
                "code": "11778-8",
                "display": "Delivery date Estimated",
                "text": "Estimated delivery date",
            },
        }
        pregnancy_outcome_code_map = {
            "LIVE_BIRTH": {
                "system": "http://loinc.org",
                "code": "11636-8",
                "display": "[#] Births.live",
                "text": "Live birth",
            },
            "STILLBIRTH": {
                "system": "http://loinc.org",
                "code": "11638-4",
                "display": "[#] Births.still living",
                "text": "Stillbirth",
            },
            "MISCARRIAGE": {
                "system": "http://loinc.org",
                "code": "11614-5",
                "display": "[#] Abortions.spontaneous",
                "text": "Miscarriage",
            },
            "ABORTION": {
                "system": "http://loinc.org",
                "code": "11613-7",
                "display": "[#] Abortions.induced",
                "text": "Abortion",
            },
            "ECTOPIC": {
                "system": "http://loinc.org",
                "code": "33065-4",
                "display": "[#] Ectopic pregnancy",
                "text": "Ectopic pregnancy",
            },
        }
        value_text = {
            "PREGNANT": "Pregnant",
            "POSTPARTUM": "Postpartum",
            "NOT_PREGNANT": "Not pregnant",
            "UNKNOWN": "Unknown",
            "LIVE_BIRTH": "Live birth",
            "STILLBIRTH": "Stillbirth",
            "MISCARRIAGE": "Miscarriage",
            "ABORTION": "Abortion",
            "ECTOPIC": "Ectopic pregnancy",
        }
        code = (
            pregnancy_outcome_code_map.get(
                observation.status_value, pregnancy_outcome_code_map["LIVE_BIRTH"]
            )
            if observation.observation_type == "PREGNANCY_OUTCOME"
            else code_map[observation.observation_type]
        )

        fhir_resource = {
            "resourceType": "Observation",
            "id": str(observation.fhir_id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(observation.updated_at),
                "profile": [
                    {
                        "PREGNANCY_STATUS": "http://hl7.org/fhir/uv/ips/StructureDefinition/Observation-pregnancy-status-uv-ips",
                        "PREGNANCY_EXPECTED_DELIVERY_DATE": "http://hl7.org/fhir/uv/ips/StructureDefinition/Observation-pregnancy-edd-uv-ips",
                        "PREGNANCY_OUTCOME": "http://hl7.org/fhir/uv/ips/StructureDefinition/Observation-pregnancy-outcome-uv-ips",
                    }[observation.observation_type]
                ],
            },
            "status": "final",
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                            "code": "survey",
                            "display": "Survey",
                        }
                    ]
                }
            ],
            "code": {
                "coding": [
                    {
                        "system": code["system"],
                        "code": code["code"],
                        "display": code["display"],
                    }
                ],
                "text": code["text"],
            },
            "subject": {"reference": f"Patient/{observation.patient_id}"},
            "effectiveDateTime": format_date(observation.effective_date),
            "text": build_generated_narrative(
                "Observation",
                [
                    f"Type: {code['text']}",
                    value_text.get(
                        observation.status_value, observation.status_value or "Recorded"
                    ),
                ],
            ),
            "performer": [{"reference": "Organization/vitora-hmis"}],
        }

        if observation.encounter_id:
            fhir_resource["encounter"] = {"reference": f"Encounter/{observation.encounter_id}"}

        if observation.observation_type == "PREGNANCY_EXPECTED_DELIVERY_DATE":
            fhir_resource["valueDateTime"] = format_date(observation.value_date)
        elif observation.observation_type == "PREGNANCY_OUTCOME":
            fhir_resource["valueQuantity"] = {
                "value": 1,
                "unit": "1",
                "system": "http://unitsofmeasure.org",
                "code": "{#}",
            }
        else:
            fhir_resource["valueCodeableConcept"] = {
                "text": value_text.get(observation.status_value, observation.status_value),
            }

        if observation.notes:
            fhir_resource["note"] = [{"text": observation.notes}]

        return fhir_resource

    def _encounter_vitals_to_fhir(self, encounter, request) -> dict:
        """Convert Encounter vitals to FHIR Observation."""
        base_url = get_base_url(request)

        # Create a vital signs observation from encounter
        components = []

        if encounter.temperature:
            components.append(
                {
                    "code": {
                        "coding": [
                            {
                                "system": "http://loinc.org",
                                "code": "8310-5",
                                "display": "Body temperature",
                            }
                        ]
                    },
                    "valueQuantity": {
                        "value": float(encounter.temperature),
                        "unit": "°C",
                        "system": "http://unitsofmeasure.org",
                        "code": "Cel",
                    },
                }
            )

        if encounter.pulse:
            components.append(
                {
                    "code": {
                        "coding": [
                            {
                                "system": "http://loinc.org",
                                "code": "8867-4",
                                "display": "Heart rate",
                            }
                        ]
                    },
                    "valueQuantity": {
                        "value": encounter.pulse,
                        "unit": "beats/minute",
                        "system": "http://unitsofmeasure.org",
                        "code": "/min",
                    },
                }
            )

        if encounter.spo2:
            components.append(
                {
                    "code": {
                        "coding": [
                            {
                                "system": "http://loinc.org",
                                "code": "2708-6",
                                "display": "Oxygen saturation",
                            }
                        ]
                    },
                    "valueQuantity": {
                        "value": float(encounter.spo2),
                        "unit": "%",
                        "system": "http://unitsofmeasure.org",
                        "code": "%",
                    },
                }
            )

        fhir_resource = {
            "resourceType": "Observation",
            "id": str(encounter.id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(
                    encounter.updated_at if hasattr(encounter, "updated_at") else datetime.now()
                ),
            },
            "status": "final",
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                            "code": "vital-signs",
                            "display": "Vital Signs",
                        }
                    ]
                }
            ],
            "code": {
                "coding": [
                    {
                        "system": "http://loinc.org",
                        "code": "85353-1",
                        "display": "Vital signs, weight, height, head circumference, oxygen saturation and BMI panel",
                    }
                ],
                "text": "Vital Signs Panel",
            },
            "subject": {"reference": f"Patient/{encounter.patient.id}"},
            "effectiveDateTime": format_date(encounter.encounter_date),
            "component": components,
        }

        return fhir_resource


class FHIRConditionView(PublicFHIRReadAPIView):
    """
    FHIR Condition resource endpoint.

    GET /fhir/Condition/{id} - Returns Condition resource in FHIR R4 format.
    """

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a FHIR R4 Condition resource by ID",
    )
    def get(self, request, pk: int) -> Response:
        """Get a Condition resource by ID."""
        from hmis.apps.encounters.models import Diagnosis

        try:
            diagnosis = Diagnosis.objects.select_related("encounter__patient", "icd10_code").get(
                pk=pk
            )
        except Diagnosis.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"Condition with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        fhir_condition = self._to_fhir_condition(diagnosis, request)
        return Response(fhir_condition, status=status.HTTP_200_OK)

    def _to_fhir_condition(self, diagnosis, request) -> dict:
        """Convert Django Diagnosis to FHIR Condition resource."""
        codeable_concept = self._build_condition_code(diagnosis)
        condition_text = codeable_concept.get("text", "Condition")
        fhir_resource = {
            "resourceType": "Condition",
            "id": str(diagnosis.id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(datetime.now()),
                "profile": ["http://hl7.org/fhir/uv/ips/StructureDefinition/Condition-uv-ips"],
            },
            "clinicalStatus": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                        "code": "active",
                        "display": "Active",
                    }
                ]
            },
            "verificationStatus": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                        "code": "confirmed",
                        "display": "Confirmed",
                    }
                ]
            },
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/condition-category",
                            "code": "problem-list-item",
                            "display": "Problem List Item",
                        }
                    ],
                    "text": "Problem",
                }
            ],
            "code": codeable_concept,
            "subject": {
                "reference": f"Patient/{diagnosis.encounter.patient.id}",
                "display": f"{diagnosis.encounter.patient.first_name} {diagnosis.encounter.patient.last_name}",
            },
            "recordedDate": format_date(diagnosis.encounter.encounter_date),
            "onsetDateTime": format_date(diagnosis.encounter.encounter_date),
            "text": {
                "status": "generated",
                "div": (
                    '<div xmlns="http://www.w3.org/1999/xhtml">'
                    f"<p><b>Condition</b>: {condition_text}</p>"
                    "<p><b>Status</b>: Active</p>"
                    "</div>"
                ),
            },
        }

        return fhir_resource

    def _build_condition_code(self, diagnosis) -> dict:
        """Build FHIR CodeableConcept with ICD-10, ICD-11, and SNOMED CT coding."""
        codings = []

        # ICD-10 coding
        if diagnosis.icd10_code:
            canonical_display = CANONICAL_ICD10_DISPLAYS.get(
                diagnosis.icd10_code.code,
                diagnosis.icd10_code.description,
            )
            codings.append(
                {
                    "system": "http://hl7.org/fhir/sid/icd-10",
                    "code": diagnosis.icd10_code.code,
                    "display": canonical_display,
                }
            )

        # ICD-11 coding
        if getattr(diagnosis, "icd11_code", ""):
            codings.append(
                {
                    "system": "http://id.who.int/icd/release/11/mms",
                    "code": diagnosis.icd11_code,
                    "display": diagnosis.icd11_display or diagnosis.icd11_code,
                }
            )

        # SNOMED CT coding
        if getattr(diagnosis, "snomed_code", ""):
            codings.append(
                {
                    "system": "http://snomed.info/sct",
                    "code": diagnosis.snomed_code,
                    "display": diagnosis.snomed_display or diagnosis.snomed_code,
                }
            )

        # Fallback if no coded diagnosis
        if not codings:
            codings.append(
                {
                    "system": "http://hl7.org/fhir/sid/icd-10",
                    "code": "unknown",
                    "display": diagnosis.free_text_diagnosis or diagnosis.notes or "Unknown",
                }
            )

        # Determine display text
        text = (
            CANONICAL_ICD10_DISPLAYS.get(
                diagnosis.icd10_code.code,
                diagnosis.icd10_code.description,
            )
            if diagnosis.icd10_code
            else (
                diagnosis.icd11_display
                or diagnosis.snomed_display
                or diagnosis.free_text_diagnosis
                or diagnosis.notes
                or "Unknown"
            )
        )

        return {"coding": codings, "text": text}
