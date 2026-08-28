# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: E402, F401
"""Core views summary bundle for Vitora HMIS.

What this file is for:
- Implement views summary bundle logic for the core domain.

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

from hmis.apps.core.fhir.views_clinical_resources import (
    FHIRCarePlanView,
    FHIRDiagnosticReportView,
    FHIRImagingStudyView,
    FHIRImmunizationView,
    FHIRMediaView,
    FHIRProcedureView,
    FHIRSpecimenView,
)
from hmis.apps.core.fhir.views_composition_medication import (
    FHIRAllergyIntoleranceView,
    FHIRCompositionView,
    FHIRMedicationStatementView,
)
from hmis.apps.core.fhir.views_observation_condition import FHIRConditionView, FHIRObservationView
from hmis.apps.core.fhir.views_patient_admin import FHIRPatientView


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


class FHIRPatientSummaryView(FHIRSchemaMixin, APIView):
    """
    IPS (International Patient Summary) endpoint.

    GET /fhir/Patient/{id}/$summary - Returns IPS Bundle for a patient.

    Reference: http://hl7.org/fhir/uv/ips/

    This endpoint generates a comprehensive IPS bundle that includes:
    - Patient resource
    - Composition (document structure)
    - Condition resources (diagnoses)
    - AllergyIntolerance resources
    - MedicationStatement resources (from active prescriptions)
    - CarePlan resources (from treatment plans)
    """

    permission_classes = [AllowAny]
    renderer_classes = FHIR_RENDERER_CLASSES

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Generate an IPS (International Patient Summary) Bundle for a patient",
    )
    def get(self, request, pk: int) -> Response:
        """Generate IPS Bundle for a patient."""
        from hmis.apps.encounters.models import (
            Diagnosis,
            PregnancyObservation,
            SocialHistoryObservation,
            TreatmentPlan,
        )
        from hmis.apps.imaging.models import DICOMInstance, DICOMStudy
        from hmis.apps.immunizations.models import ImmunizationRecord
        from hmis.apps.laboratory.models import DiagnosticReport, LabResult, Specimen
        from hmis.apps.patients.models import Allergy, Patient
        from hmis.apps.pharmacy.models import Prescription
        from hmis.apps.procedures.models import ProcedureOrder

        try:
            patient = Patient.objects.select_related("county", "sub_county", "ward").get(pk=pk)
        except Patient.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"Patient with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        # Get patient's conditions
        diagnoses = Diagnosis.objects.filter(encounter__patient=patient).select_related(
            "icd10_code", "encounter"
        )[:10]

        # Get patient's active allergies
        allergies = Allergy.get_active_allergies_for_patient(patient.id).select_related(
            "recorded_by"
        )[:20]

        # Get patient prescriptions that represent actual medication use.
        prescriptions = (
            Prescription.objects.filter(
                patient=patient,
                status__in=["PARTIAL", "DISPENSED"],
            )
            .select_related("patient", "prescribed_by", "encounter")
            .prefetch_related("items__drug")
            .order_by("-prescribed_at")[:10]
        )

        # Get patient's active treatment plans
        treatment_plans = (
            TreatmentPlan.objects.filter(
                encounter__patient=patient,
                status__in=["ACTIVE", "DRAFT"],
            )
            .select_related("encounter__patient", "created_by", "approved_by")
            .order_by("-created_at")[:5]
        )

        social_history_observations = []
        pregnancy_observations = []
        lab_results = []
        diagnostic_reports = []
        specimens = []
        immunizations = []
        procedures = []
        imaging_studies = []
        media_items = []

        social_history_observations = SocialHistoryObservation.objects.filter(
            patient=patient
        ).select_related("encounter")[:10]

        pregnancy_observations = PregnancyObservation.objects.filter(
            patient=patient
        ).select_related("encounter", "mch_registration", "delivery")[:10]

        lab_results = LabResult.objects.filter(
            order_item__lab_order__patient=patient
        ).select_related(
            "order_item__lab_order__patient",
            "order_item__test",
            "specimen",
        )[:20]

        diagnostic_reports = DiagnosticReport.objects.filter(
            lab_order__patient=patient
        ).select_related("lab_order__patient")[:10]

        specimen_ids = set(
            Specimen.objects.filter(lab_order__patient=patient).values_list("id", flat=True)[:20]
        )
        for report in diagnostic_reports:
            for order_item in report.lab_order.items.select_related("result").all():
                if hasattr(order_item, "result") and order_item.result.specimen_id:
                    specimen_ids.add(order_item.result.specimen_id)
        specimens = Specimen.objects.filter(id__in=specimen_ids)

        immunizations = ImmunizationRecord.objects.filter(patient=patient).select_related(
            "vaccine"
        )[:10]

        procedures = ProcedureOrder.objects.filter(patient=patient).select_related("procedure")[:10]

        imaging_studies = DICOMStudy.objects.filter(patient=patient).prefetch_related(
            "series_set__instances"
        )[:10]
        media_items = DICOMInstance.objects.filter(series__study__patient=patient).select_related(
            "series__study__patient"
        )[:10]

        # Build IPS Bundle
        ips_bundle = self._build_ips_bundle(
            patient,
            diagnoses,
            allergies,
            prescriptions,
            treatment_plans,
            lab_results,
            social_history_observations,
            pregnancy_observations,
            diagnostic_reports,
            specimens,
            immunizations,
            procedures,
            imaging_studies,
            media_items,
            request,
        )

        return Response(ips_bundle, status=status.HTTP_200_OK)

    def post(self, request, pk: int) -> Response:
        """Allow operation-style POST invocation for Patient/$summary."""
        return self.get(request, pk)

    def _build_ips_bundle(
        self,
        patient,
        diagnoses,
        allergies,
        prescriptions,
        treatment_plans,
        lab_results,
        social_history_observations,
        pregnancy_observations,
        diagnostic_reports,
        specimens,
        immunizations,
        procedures,
        imaging_studies,
        media_items,
        request,
    ) -> dict:
        """
        Build an IPS Bundle for the patient.

        Args:
            patient: Patient instance
            diagnoses: QuerySet of Diagnosis
            allergies: QuerySet of Allergy
            prescriptions: QuerySet of Prescription with items
            treatment_plans: QuerySet of TreatmentPlan
            request: HTTP request for URL generation

        Returns:
            dict: FHIR R4 IPS Bundle
        """
        base_url = get_base_url(request)

        # Get FHIR representations
        patient_view = FHIRPatientView()
        fhir_patient = patient_view._to_fhir_patient(patient, request)

        # Build condition entries
        condition_entries = []
        for diagnosis in diagnoses:
            condition_view = FHIRConditionView()
            fhir_condition = condition_view._to_fhir_condition(diagnosis, request)
            condition_entries.append(
                {"fullUrl": f"{base_url}/Condition/{diagnosis.id}", "resource": fhir_condition}
            )

        # Build allergy entries
        allergy_entries = []
        allergy_view = FHIRAllergyIntoleranceView()
        for allergy in allergies:
            fhir_allergy = allergy_view._to_fhir_allergy_intolerance(allergy, request)
            allergy_entries.append(
                {"fullUrl": f"{base_url}/AllergyIntolerance/{allergy.id}", "resource": fhir_allergy}
            )

        # Build medication statement entries from prescription items
        medication_entries = []
        medication_statement_view = FHIRMedicationStatementView()
        all_items = []
        for prescription in prescriptions:
            for item in prescription.items.filter(is_cancelled=False):
                fhir_med = medication_statement_view._to_fhir_medication_statement(item, request)
                medication_entries.append(
                    {
                        "fullUrl": f"{base_url}/MedicationStatement/{item.id}",
                        "resource": fhir_med,
                    }
                )
                all_items.append(item)

        # Build care plan entries from treatment plans
        care_plan_entries = []
        care_plan_view = FHIRCarePlanView()
        for plan in treatment_plans:
            fhir_plan = care_plan_view._to_fhir_care_plan(plan, request)
            care_plan_entries.append(
                {"fullUrl": f"{base_url}/CarePlan/{plan.id}", "resource": fhir_plan}
            )

        observation_entries = []
        observation_view = FHIRObservationView()
        for lab_result in lab_results:
            observation_entries.append(
                {
                    "fullUrl": f"{base_url}/Observation/{lab_result.id}",
                    "resource": observation_view._lab_result_to_fhir(lab_result, request),
                }
            )
        for observation in social_history_observations:
            observation_entries.append(
                {
                    "fullUrl": f"{base_url}/Observation/{observation.fhir_id}",
                    "resource": observation_view._social_history_to_fhir(observation, request),
                }
            )
        for observation in pregnancy_observations:
            observation_entries.append(
                {
                    "fullUrl": f"{base_url}/Observation/{observation.fhir_id}",
                    "resource": observation_view._pregnancy_observation_to_fhir(
                        observation, request
                    ),
                }
            )

        specimen_entries = []
        specimen_view = FHIRSpecimenView()
        for specimen in specimens:
            specimen_entries.append(
                {
                    "fullUrl": f"{base_url}/Specimen/{specimen.id}",
                    "resource": specimen_view._to_fhir_specimen(specimen),
                }
            )

        diagnostic_report_entries = []
        diagnostic_report_view = FHIRDiagnosticReportView()
        for report in diagnostic_reports:
            diagnostic_report_entries.append(
                {
                    "fullUrl": f"{base_url}/DiagnosticReport/{report.id}",
                    "resource": diagnostic_report_view._to_fhir_diagnostic_report(report),
                }
            )

        immunization_entries = []
        immunization_view = FHIRImmunizationView()
        for immunization in immunizations:
            immunization_entries.append(
                {
                    "fullUrl": f"{base_url}/Immunization/{immunization.id}",
                    "resource": immunization_view._to_fhir_immunization(immunization),
                }
            )

        procedure_entries = []
        procedure_view = FHIRProcedureView()
        for procedure in procedures:
            procedure_entries.append(
                {
                    "fullUrl": f"{base_url}/Procedure/{procedure.id}",
                    "resource": procedure_view._to_fhir_procedure(procedure),
                }
            )

        imaging_study_entries = []
        imaging_study_view = FHIRImagingStudyView()
        for study in imaging_studies:
            imaging_study_entries.append(
                {
                    "fullUrl": f"{base_url}/ImagingStudy/{study.id}",
                    "resource": imaging_study_view._to_fhir_imaging_study(study),
                }
            )

        media_entries = []
        media_view = FHIRMediaView()
        for media in media_items:
            media_entries.append(
                {
                    "fullUrl": f"{base_url}/Media/{media.id}",
                    "resource": media_view._to_fhir_media(media),
                }
            )

        resolved_author_organization = resolve_ips_author_organization(
            patient,
            diagnoses=diagnoses,
            prescriptions=prescriptions,
            treatment_plans=treatment_plans,
        )

        # Build composition with all section references
        composition_view = FHIRCompositionView()
        fhir_composition = composition_view._to_fhir_composition(
            patient,
            request,
            allergies=allergies,
            medication_items=all_items,
            treatment_plans=treatment_plans,
            lab_results=lab_results,
            diagnostic_reports=diagnostic_reports,
            specimens=specimens,
            immunizations=immunizations,
            procedures=procedures,
            imaging_studies=imaging_studies,
            media_items=media_items,
            social_history_observations=social_history_observations,
            pregnancy_observations=pregnancy_observations,
            author_organization=resolved_author_organization,
        )

        # Update composition with condition references
        if condition_entries:
            problem_section = next(
                (s for s in fhir_composition["section"] if s["title"] == "Problem List"), None
            )
            if problem_section:
                problem_section.pop("emptyReason", None)
                problem_section["entry"] = [{"reference": f"Condition/{d.id}"} for d in diagnoses]
                problem_items = [
                    diagnosis.icd10_code.description
                    if diagnosis.icd10_code
                    else diagnosis.free_text_diagnosis or diagnosis.notes or "Unknown"
                    for diagnosis in diagnoses
                ]
                problem_section["text"] = {
                    "status": "generated",
                    "div": '<div xmlns="http://www.w3.org/1999/xhtml"><ul>'
                    + "".join(f"<li>{item}</li>" for item in problem_items)
                    + "</ul></div>",
                }

        organization_entries = []
        if resolved_author_organization:
            organization_entries.append(
                {
                    "fullUrl": f"{base_url}/Organization/{resolved_author_organization.id}",
                    "resource": build_fhir_organization_resource(
                        resolved_author_organization, request
                    ),
                }
            )
        else:
            fallback_organization = build_fallback_ips_organization_resource(request)
            organization_entries.append(
                {
                    "fullUrl": f"{base_url}/Organization/{fallback_organization['id']}",
                    "resource": fallback_organization,
                }
            )

        # Build the IPS Bundle
        ips_bundle = {
            "resourceType": "Bundle",
            "id": f"ips-{patient.id}",
            "meta": {
                "lastUpdated": format_date(datetime.now()),
                "profile": ["http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips"],
            },
            "identifier": {
                "system": f"{base_url}/identifier/ips-bundle",
                "value": f"ips-{patient.mrn}",
            },
            "type": "document",
            "timestamp": format_date(datetime.now()),
            "entry": [
                {"fullUrl": f"{base_url}/Composition/{patient.id}", "resource": fhir_composition},
                {"fullUrl": f"{base_url}/Patient/{patient.id}", "resource": fhir_patient},
            ]
            + organization_entries
            + condition_entries
            + allergy_entries
            + medication_entries
            + care_plan_entries
            + observation_entries
            + specimen_entries
            + diagnostic_report_entries
            + immunization_entries
            + procedure_entries
            + imaging_study_entries
            + media_entries,
        }

        return ips_bundle


class FHIRBundleView(FHIRPatientSummaryView):
    """Resolve persisted IPS bundle IDs back to the generated patient bundle."""

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a persisted IPS Bundle resource by bundle ID",
    )
    def get(self, request, pk: str) -> Response:
        """Serve the patient-backed IPS bundle for Inferno Bundle profile reads."""
        if not pk.startswith("ips-"):
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"Bundle with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        patient_id = pk.removeprefix("ips-")
        if not patient_id.isdigit():
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"Bundle with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return super().get(request, int(patient_id))


class FHIRCompositionDocumentView(FHIRPatientSummaryView):
    """FHIR Composition $document operation endpoint."""

    permission_classes = [AllowAny]

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Execute the FHIR Composition $document operation by ID",
    )
    def get(self, request, pk: int) -> Response:
        """Execute Composition/$document using the patient-backed composition ID."""
        return super().get(request, pk)

    def post(self, request, pk: int) -> Response:
        """Allow operation-style POST invocation for Composition/$document."""
        return self.get(request, pk)
