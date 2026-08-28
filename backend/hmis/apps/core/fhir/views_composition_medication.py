# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Core views composition medication for Vitora HMIS.

What this file is for:
- Implement views composition medication logic for the core domain.

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


class FHIRCompositionView(APIView):
    """
    FHIR Composition resource endpoint.

    GET /fhir/Composition/{id} - Returns Composition resource in FHIR R4 format.

    Used for IPS document structure.
    """

    permission_classes = [AllowAny]
    renderer_classes = FHIR_RENDERER_CLASSES

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a FHIR R4 Composition resource by ID",
    )
    def get(self, request, pk: int) -> Response:
        """Get a Composition resource by ID (using patient ID as proxy)."""
        from hmis.apps.patients.models import Patient

        try:
            patient = Patient.objects.get(pk=pk)
        except Patient.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"Composition with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        fhir_composition = self._to_fhir_composition(patient, request)
        return Response(fhir_composition, status=status.HTTP_200_OK)

    def _to_fhir_composition(
        self,
        patient,
        request,
        allergies=None,
        medication_items=None,
        treatment_plans=None,
        lab_results=None,
        diagnostic_reports=None,
        specimens=None,
        immunizations=None,
        procedures=None,
        imaging_studies=None,
        media_items=None,
        social_history_observations=None,
        pregnancy_observations=None,
        author_organization=None,
    ) -> dict:
        """
        Create an IPS Composition for a patient.

        Args:
            patient: Patient instance
            request: HTTP request for URL generation
            allergies: Optional list of Allergy instances
            medication_items: Optional list of PrescriptionItem instances
            treatment_plans: Optional list of TreatmentPlan instances
            author_organization: Optional Organization for author/custodian references
        Returns:
            dict: FHIR R4 Composition resource
        """
        base_url = get_base_url(request)
        # Build allergy section
        if allergies and len(allergies) > 0:
            allergy_html = '<div xmlns="http://www.w3.org/1999/xhtml"><ul>'
            for allergy in allergies:
                allergy_html += f"<li>{allergy.substance} - {allergy.get_severity_display()}</li>"
            allergy_html += "</ul></div>"
            allergy_section = {
                "title": "Allergies and Intolerances",
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "48765-2",
                            "display": "Allergies and adverse reactions Document",
                        }
                    ]
                },
                "text": {
                    "status": "generated",
                    "div": allergy_html,
                },
                "entry": [{"reference": f"AllergyIntolerance/{a.id}"} for a in allergies],
            }
        else:
            allergy_section = {
                "title": "Allergies and Intolerances",
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "48765-2",
                            "display": "Allergies and adverse reactions Document",
                        }
                    ]
                },
                "text": {
                    "status": "generated",
                    "div": '<div xmlns="http://www.w3.org/1999/xhtml">No known allergies</div>',
                },
                "emptyReason": {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/list-empty-reason",
                            "code": "unavailable",
                            "display": "Unavailable",
                        }
                    ]
                },
            }

        # Build medication section
        if medication_items and len(medication_items) > 0:
            med_html = '<div xmlns="http://www.w3.org/1999/xhtml"><ul>'
            for item in medication_items:
                drug_name = item.drug.generic_name if hasattr(item, "drug") else "Unknown"
                dosage = getattr(item, "dosage", "")
                frequency = getattr(item, "frequency", "")
                med_html += f"<li>{drug_name} - {dosage} {frequency}</li>"
            med_html += "</ul></div>"
            medication_section = {
                "title": "Medication Summary",
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "10160-0",
                            "display": "History of Medication use Narrative",
                        }
                    ]
                },
                "text": {
                    "status": "generated",
                    "div": med_html,
                },
                "entry": [
                    {"reference": f"MedicationStatement/{item.id}"} for item in medication_items
                ],
            }
        else:
            medication_section = {
                "title": "Medication Summary",
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "10160-0",
                            "display": "History of Medication use Narrative",
                        }
                    ]
                },
                "text": {
                    "status": "generated",
                    "div": '<div xmlns="http://www.w3.org/1999/xhtml">No current medications</div>',
                },
                "emptyReason": {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/list-empty-reason",
                            "code": "unavailable",
                            "display": "Unavailable",
                        }
                    ]
                },
            }

        # Build problem list section (empty by default, populated by IPS generator)
        problem_section = {
            "title": "Problem List",
            "code": {
                "coding": [
                    {
                        "system": "http://loinc.org",
                        "code": "11450-4",
                        "display": "Problem list - Reported",
                    }
                ]
            },
            "text": {
                "status": "generated",
                "div": '<div xmlns="http://www.w3.org/1999/xhtml">No known problems</div>',
            },
            "emptyReason": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/list-empty-reason",
                        "code": "unavailable",
                        "display": "Unavailable",
                    }
                ]
            },
        }

        if lab_results or diagnostic_reports or specimens or imaging_studies or media_items:
            diagnostic_results_entries = []
            if lab_results:
                diagnostic_results_entries.extend(
                    [{"reference": f"Observation/{result.id}"} for result in lab_results]
                )
            if diagnostic_reports:
                diagnostic_results_entries.extend(
                    [
                        {"reference": f"DiagnosticReport/{report.id}"}
                        for report in diagnostic_reports
                    ]
                )
            if specimens:
                diagnostic_results_entries.extend(
                    [{"reference": f"Specimen/{specimen.id}"} for specimen in specimens]
                )
            if imaging_studies:
                diagnostic_results_entries.extend(
                    [{"reference": f"ImagingStudy/{study.id}"} for study in imaging_studies]
                )
            if media_items:
                diagnostic_results_entries.extend(
                    [{"reference": f"Media/{media.id}"} for media in media_items]
                )
            diagnostic_results_section = {
                "title": "Diagnostic Results",
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "30954-2",
                            "display": "Relevant diagnostic tests/laboratory data note",
                        }
                    ]
                },
                "text": {
                    "status": "generated",
                    "div": '<div xmlns="http://www.w3.org/1999/xhtml">Diagnostic reports, specimens, and imaging summaries</div>',
                },
                "entry": diagnostic_results_entries,
            }
        else:
            diagnostic_results_section = None

        if social_history_observations:
            social_history_section = {
                "title": "Social History",
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "29762-2",
                            "display": "Social history note",
                        }
                    ]
                },
                "text": {
                    "status": "generated",
                    "div": '<div xmlns="http://www.w3.org/1999/xhtml">Social history observations</div>',
                },
                "entry": [
                    {"reference": f"Observation/{observation.fhir_id}"}
                    for observation in social_history_observations
                ],
            }
        else:
            social_history_section = None

        if pregnancy_observations:
            pregnancy_section = {
                "title": "History of Pregnancy",
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "10162-6",
                            "display": "History of pregnancies Narrative",
                        }
                    ]
                },
                "text": {
                    "status": "generated",
                    "div": '<div xmlns="http://www.w3.org/1999/xhtml">Pregnancy-related observations</div>',
                },
                "entry": [
                    {"reference": f"Observation/{observation.fhir_id}"}
                    for observation in pregnancy_observations
                ],
            }
        else:
            pregnancy_section = None

        if immunizations:
            immunization_section = {
                "title": "History of Immunizations",
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "11369-6",
                            "display": "History of Immunization note",
                        }
                    ]
                },
                "text": {
                    "status": "generated",
                    "div": '<div xmlns="http://www.w3.org/1999/xhtml">Immunization history</div>',
                },
                "entry": [
                    {"reference": f"Immunization/{immunization.id}"}
                    for immunization in immunizations
                ],
            }
        else:
            immunization_section = None

        if procedures:
            procedure_section = {
                "title": "Procedure History",
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "47519-4",
                            "display": "History of Procedures Document",
                        }
                    ]
                },
                "text": {
                    "status": "generated",
                    "div": '<div xmlns="http://www.w3.org/1999/xhtml">Procedure history</div>',
                },
                "entry": [{"reference": f"Procedure/{procedure.id}"} for procedure in procedures],
            }
        else:
            procedure_section = None

        # Build sections list
        sections = [allergy_section, medication_section, problem_section]

        for extra_section in [
            diagnostic_results_section,
            social_history_section,
            pregnancy_section,
            immunization_section,
            procedure_section,
        ]:
            if extra_section:
                sections.append(extra_section)

        # Build plan of care section (for treatment plans)
        if treatment_plans and len(treatment_plans) > 0:
            care_html = '<div xmlns="http://www.w3.org/1999/xhtml"><ul>'
            for plan in treatment_plans:
                encounter_type = (
                    plan.encounter.encounter_type if hasattr(plan, "encounter") else "Visit"
                )
                status_display = (
                    plan.get_status_display()
                    if hasattr(plan, "get_status_display")
                    else plan.status
                )
                summary = f"Treatment Plan ({encounter_type}) - {status_display}"
                if plan.follow_up_date:
                    summary += f" - Follow-up: {plan.follow_up_date}"
                care_html += f"<li>{summary}</li>"
            care_html += "</ul></div>"
            care_section = {
                "title": "Plan of Care",
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "18776-5",
                            "display": "Plan of care note",
                        }
                    ]
                },
                "text": {
                    "status": "generated",
                    "div": care_html,
                },
                "entry": [{"reference": f"CarePlan/{plan.id}"} for plan in treatment_plans],
            }
            sections.append(care_section)

        resolved_author_org = author_organization or resolve_ips_author_organization(patient)
        author_reference = (
            f"Organization/{resolved_author_org.id}"
            if resolved_author_org
            else "Organization/vitora-hmis"
        )
        author_display = resolved_author_org.name if resolved_author_org else "Vitora HMIS"
        composed_at = datetime.now()

        fhir_resource = {
            "resourceType": "Composition",
            "id": str(patient.id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(composed_at),
                "profile": ["http://hl7.org/fhir/uv/ips/StructureDefinition/Composition-uv-ips"],
            },
            "text": {
                "status": "generated",
                "div": (
                    '<div xmlns="http://www.w3.org/1999/xhtml">'
                    f"<p><b>IPS Composition</b> for {patient.first_name} {patient.last_name}</p>"
                    "</div>"
                ),
            },
            "identifier": {
                "system": f"{base_url}/identifier/ips-composition",
                "value": f"ips-composition-{patient.id}",
            },
            "status": "final",
            "type": {
                "coding": [
                    {
                        "system": "http://loinc.org",
                        "code": "60591-5",
                        "display": "Patient summary Document",
                    }
                ]
            },
            "subject": {"reference": f"Patient/{patient.id}"},
            "date": format_date(composed_at),
            "author": [
                {
                    "reference": author_reference,
                    "display": author_display,
                }
            ],
            "title": f"International Patient Summary for {patient.first_name} {patient.last_name}",
            "confidentiality": "N",
            "attester": [
                {
                    "mode": "legal",
                    "time": format_date(composed_at),
                    "party": {"reference": author_reference, "display": author_display},
                }
            ],
            "custodian": {"reference": author_reference, "display": author_display},
            "event": [
                {
                    "code": [
                        {
                            "coding": [
                                {
                                    "system": "http://terminology.hl7.org/CodeSystem/v3-ActClass",
                                    "code": "PCPR",
                                    "display": "care provision",
                                }
                            ]
                        }
                    ],
                    "period": {"end": format_date(composed_at)},
                }
            ],
            "section": sections,
        }

        return fhir_resource


class FHIRAllergyIntoleranceView(PublicFHIRReadAPIView):
    """
    FHIR AllergyIntolerance resource endpoint.

    GET /fhir/AllergyIntolerance/{id} - Returns AllergyIntolerance in FHIR R4 format.
    """

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a FHIR R4 AllergyIntolerance resource by ID",
    )
    def get(self, request, pk: int) -> Response:
        """Get an AllergyIntolerance resource by ID."""
        from hmis.apps.patients.models import Allergy

        try:
            allergy = Allergy.objects.select_related("patient", "recorded_by").get(pk=pk)
        except Allergy.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"AllergyIntolerance with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        fhir_resource = self._to_fhir_allergy_intolerance(allergy, request)
        return Response(fhir_resource, status=status.HTTP_200_OK)

    def _to_fhir_allergy_intolerance(self, allergy, request) -> dict:
        """Convert Django Allergy model to FHIR AllergyIntolerance resource."""
        base_url = get_base_url(request)

        # Map clinical status
        clinical_status_map = {
            "active": ("active", "Active"),
            "inactive": ("inactive", "Inactive"),
            "resolved": ("resolved", "Resolved"),
        }
        clinical_status = clinical_status_map.get(allergy.status, ("active", "Active"))

        # Map verification status
        verification_status_map = {
            "unconfirmed": ("unconfirmed", "Unconfirmed"),
            "presumed": ("presumed", "Presumed"),
            "confirmed": ("confirmed", "Confirmed"),
            "refuted": ("refuted", "Refuted"),
            "entered_in_error": ("entered-in-error", "Entered in Error"),
        }
        verification_status = verification_status_map.get(
            allergy.verification_status, ("unconfirmed", "Unconfirmed")
        )

        # Map category
        category_map = {
            "medication": "medication",
            "food": "food",
            "environmental": "environment",
            "biological": "biologic",
            "other": "medication",  # Default to medication for "other"
        }
        category = category_map.get(allergy.substance_type, "medication")

        # Map criticality
        criticality_map = {
            "low": "low",
            "high": "high",
            "unable_to_assess": "unable-to-assess",
        }
        criticality = criticality_map.get(allergy.criticality, "unable-to-assess")

        # Build FHIR resource
        fhir_resource = {
            "resourceType": "AllergyIntolerance",
            "id": str(allergy.id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(allergy.updated_at),
                "profile": ["http://hl7.org/fhir/StructureDefinition/AllergyIntolerance"],
            },
            "text": {
                "status": "generated",
                "div": (
                    '<div xmlns="http://www.w3.org/1999/xhtml">'
                    f"<p><b>Allergy</b>: {allergy.substance}</p>"
                    f"<p><b>Criticality</b>: {criticality}</p>"
                    "</div>"
                ),
            },
            "clinicalStatus": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
                        "code": clinical_status[0],
                        "display": clinical_status[1],
                    }
                ]
            },
            "verificationStatus": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
                        "code": verification_status[0],
                        "display": verification_status[1],
                    }
                ]
            },
            "type": "allergy",  # Assume true allergy (vs intolerance)
            "category": [category],
            "criticality": criticality,
            "patient": {
                "reference": f"Patient/{allergy.patient.id}",
                "display": allergy.patient.full_name,
            },
            "recordedDate": format_date(allergy.created_at),
        }

        # Add code for the allergen
        code = {"text": allergy.substance}
        if allergy.substance_code and allergy.substance_code_system:
            code["coding"] = [
                {
                    "system": allergy.substance_code_system,
                    "code": allergy.substance_code,
                    "display": allergy.substance,
                }
            ]
        fhir_resource["code"] = code

        # Add onset date if available
        if allergy.onset_date:
            fhir_resource["onsetDateTime"] = format_date(allergy.onset_date)

        # Add last occurrence if available
        if allergy.last_occurrence:
            fhir_resource["lastOccurrence"] = format_date(allergy.last_occurrence)

        # Add reaction details
        if allergy.reaction_type != "other" or allergy.reaction_description:
            reaction = {
                "severity": self._map_severity(allergy.severity),
            }

            # Map reaction type to SNOMED manifestation
            manifestation_map = {
                "anaphylaxis": ("39579001", "Anaphylaxis"),
                "angioedema": ("41291007", "Angioedema"),
                "bronchospasm": ("4386001", "Bronchospasm"),
                "cardiac_arrhythmia": ("698247007", "Cardiac arrhythmia"),
                "diarrhea": ("62315008", "Diarrhea"),
                "dyspnea": ("267036007", "Dyspnea"),
                "hives": ("126485001", "Urticaria"),
                "hypotension": ("45007003", "Hypotension"),
                "itching": ("418363000", "Itching"),
                "nausea": ("422587007", "Nausea"),
                "rash": ("271807003", "Rash"),
                "swelling": ("65124004", "Swelling"),
                "vomiting": ("422400008", "Vomiting"),
            }

            if allergy.reaction_type in manifestation_map:
                snomed = manifestation_map[allergy.reaction_type]
                reaction["manifestation"] = [
                    {
                        "coding": [
                            {
                                "system": "http://snomed.info/sct",
                                "code": snomed[0],
                                "display": snomed[1],
                            }
                        ]
                    }
                ]
            elif allergy.reaction_description:
                reaction["manifestation"] = [{"text": allergy.reaction_description}]

            # Add description if available
            if allergy.reaction_description:
                reaction["description"] = allergy.reaction_description

            fhir_resource["reaction"] = [reaction]

        # Add notes if available
        if allergy.notes:
            fhir_resource["note"] = [{"text": allergy.notes}]

        return fhir_resource

    def _map_severity(self, severity: str) -> str:
        """Map internal severity to FHIR severity."""
        severity_map = {
            "mild": "mild",
            "moderate": "moderate",
            "severe": "severe",
            "life_threatening": "severe",  # FHIR only has mild/moderate/severe
        }
        return severity_map.get(severity, "moderate")


class FHIRMedicationStatementView(APIView):
    """
    FHIR MedicationStatement resource endpoint.

    GET /fhir/MedicationStatement/{id} - Returns MedicationStatement in FHIR R4 format.

    Maps Django Prescription + PrescriptionItem to FHIR MedicationStatement resource.
    Each PrescriptionItem generates a separate MedicationStatement for IPS compliance.
    """

    permission_classes = [AllowAny]
    renderer_classes = FHIR_RENDERER_CLASSES

    # Status mapping from Django to FHIR MedicationStatement status
    STATUS_MAP = {
        "PENDING": "intended",
        "PARTIAL": "active",
        "DISPENSED": "completed",
        "CANCELLED": "stopped",
        "EXPIRED": "stopped",
    }

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a FHIR R4 MedicationStatement resource by ID",
    )
    def get(self, request, pk: int) -> Response:
        """Get a MedicationStatement resource by ID."""
        from hmis.apps.pharmacy.models import PrescriptionItem

        try:
            item = PrescriptionItem.objects.select_related(
                "prescription__patient",
                "prescription__prescribed_by",
                "prescription__encounter",
                "drug",
            ).get(pk=pk)
        except PrescriptionItem.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"MedicationStatement with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        fhir_resource = self._to_fhir_medication_statement(item, request)
        return Response(fhir_resource, status=status.HTTP_200_OK)

    def _to_fhir_medication_statement(self, item, request) -> dict:
        """
        Convert Django PrescriptionItem to FHIR MedicationStatement.

        Args:
            item: PrescriptionItem instance
            request: HTTP request for URL generation

        Returns:
            dict: FHIR R4 MedicationStatement resource
        """
        base_url = get_base_url(request)
        prescription = item.prescription
        drug = item.drug

        # Map status
        fhir_status = self.STATUS_MAP.get(prescription.status, "active")
        if item.is_cancelled:
            fhir_status = "stopped"

        medication_text = f"{drug.generic_name} {drug.strength} {drug.form}"
        fhir_resource = {
            "resourceType": "MedicationStatement",
            "id": str(item.id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(item.updated_at),
                "profile": [
                    "http://hl7.org/fhir/uv/ips/StructureDefinition/MedicationStatement-uv-ips"
                ],
            },
            "text": {
                "status": "generated",
                "div": (
                    '<div xmlns="http://www.w3.org/1999/xhtml">'
                    f"<p><b>MedicationStatement</b>: {medication_text}</p>"
                    f"<p><b>Status</b>: {fhir_status}</p>"
                    f"<p><b>Instructions</b>: {item.dosage} {item.frequency} for {item.duration}</p>"
                    "</div>"
                ),
            },
            "identifier": [
                {
                    "system": f"{base_url}/identifier/prescription-item",
                    "value": f"{prescription.prescription_number}-{item.id}",
                }
            ],
            "status": fhir_status,
            "medicationCodeableConcept": {
                "text": medication_text,
            },
            "subject": {
                "reference": f"Patient/{prescription.patient.id}",
                "display": f"{prescription.patient.first_name} {prescription.patient.last_name}",
            },
            "effectivePeriod": {
                "start": format_date(prescription.prescribed_at),
            },
            "dateAsserted": format_date(prescription.prescribed_at),
            "dosage": [
                {
                    "text": f"{item.dosage} {item.frequency} for {item.duration}",
                    "timing": {
                        "code": {
                            "text": item.frequency,
                        }
                    },
                }
            ],
        }

        fhir_resource["text"] = build_generated_narrative(
            "MedicationStatement",
            [
                medication_text,
                f"Status: {fhir_status}",
            ],
        )

        # Add route if available
        if item.route:
            route_map = {
                "oral": {
                    "system": "http://snomed.info/sct",
                    "code": "26643006",
                    "display": "Oral route",
                },
                "po": {
                    "system": "http://snomed.info/sct",
                    "code": "26643006",
                    "display": "Oral route",
                },
                "iv": {
                    "system": "http://snomed.info/sct",
                    "code": "47625008",
                    "display": "Intravenous route",
                },
                "im": {
                    "system": "http://snomed.info/sct",
                    "code": "78421000",
                    "display": "Intramuscular route",
                },
                "id": {
                    "system": "http://snomed.info/sct",
                    "code": "372464004",
                    "display": "Intradermal route",
                },
                "sc": {
                    "system": "http://snomed.info/sct",
                    "code": "34206005",
                    "display": "Subcutaneous route",
                },
                "subcutaneous": {
                    "system": "http://snomed.info/sct",
                    "code": "34206005",
                    "display": "Subcutaneous route",
                },
            }
            route_coding = route_map.get(item.route.strip().lower())
            fhir_resource["dosage"][0]["route"] = (
                {"coding": [route_coding], "text": item.route}
                if route_coding
                else {"text": item.route}
            )

        # Add instructions as patientInstruction
        if item.instructions:
            fhir_resource["dosage"][0]["patientInstruction"] = item.instructions

        return fhir_resource

    def _to_fhir_medication_statement_from_prescription(self, prescription, request) -> list[dict]:
        """
        Convert all items in a Prescription to FHIR MedicationStatement resources.

        Used by IPS Bundle generation to include all medications.

        Args:
            prescription: Prescription instance with prefetched items
            request: HTTP request for URL generation

        Returns:
            list: List of FHIR R4 MedicationStatement resources
        """
        statements = []
        for item in prescription.items.filter(is_cancelled=False):
            statements.append(self._to_fhir_medication_statement(item, request))
        return statements
