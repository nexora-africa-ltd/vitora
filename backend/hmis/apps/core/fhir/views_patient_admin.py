# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: FHIR patient, practitioner, organization, and practitioner-role read endpoints.
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


class FHIRPatientView(PublicFHIRReadAPIView):
    """
    FHIR Patient resource endpoint.

    GET /fhir/Patient/{id} - Returns Patient resource in FHIR R4 format.
    """

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a FHIR R4 Patient resource by ID",
    )
    def get(self, request, pk: int) -> Response:
        """Get a Patient resource by ID."""
        from hmis.apps.patients.models import Patient

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

        fhir_patient = self._to_fhir_patient(patient, request)
        return Response(fhir_patient, status=status.HTTP_200_OK)

    def _to_fhir_patient(self, patient, request) -> dict:
        """Convert Django Patient model to FHIR Patient resource."""
        base_url = get_base_url(request)

        # Build identifiers
        identifiers = [
            {
                "use": "official",
                "type": {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
                            "code": "MR",
                            "display": "Medical Record Number",
                        }
                    ]
                },
                "system": f"{base_url}/identifier/mrn",
                "value": patient.mrn,
            }
        ]

        # Add national ID if present
        if patient.national_id:
            identifiers.append(
                {
                    "use": "official",
                    "type": {
                        "coding": [
                            {
                                "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
                                "code": "NI",
                                "display": "National Identifier",
                            }
                        ]
                    },
                    "system": "urn:kenya:national-id",
                    "value": patient.national_id,
                }
            )

        # Add SHA CR number if present
        if hasattr(patient, "sha_cr_number") and patient.sha_cr_number:
            identifiers.append(
                {
                    "use": "official",
                    "type": {
                        "coding": [
                            {
                                "system": "urn:sha:identifier-type",
                                "code": "CR",
                                "display": "Client Registry Number",
                            }
                        ]
                    },
                    "system": "urn:sha:client-registry",
                    "value": patient.sha_cr_number,
                }
            )

        # Build name
        name = [{"use": "official", "family": patient.last_name, "given": [patient.first_name]}]
        if hasattr(patient, "middle_name") and patient.middle_name:
            name[0]["given"].append(patient.middle_name)

        # Build telecom
        telecom = []
        if patient.phone_number:
            telecom.append({"system": "phone", "value": patient.phone_number, "use": "mobile"})
        if hasattr(patient, "email") and patient.email:
            telecom.append({"system": "email", "value": patient.email, "use": "home"})

        # Build address
        address = []
        if patient.county or patient.sub_county or patient.ward:
            addr = {"use": "home", "type": "physical"}
            line = []
            if patient.ward:
                line.append(patient.ward.name)
            if patient.sub_county:
                addr["district"] = patient.sub_county.name
            if patient.county:
                addr["state"] = patient.county.name
            addr["country"] = "Kenya"
            if line:
                addr["line"] = line
            address.append(addr)

        # Map gender
        gender_map = {"M": "male", "F": "female", "O": "other"}

        fhir_resource = {
            "resourceType": "Patient",
            "id": str(patient.id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(
                    patient.updated_at if hasattr(patient, "updated_at") else datetime.now()
                ),
            },
            "text": {
                "status": "generated",
                "div": (
                    '<div xmlns="http://www.w3.org/1999/xhtml">'
                    f"<p><b>Patient</b>: {patient.first_name} {patient.last_name}</p>"
                    "</div>"
                ),
            },
            "identifier": identifiers,
            "active": True,
            "name": name,
            "gender": gender_map.get(patient.gender, "unknown"),
            "birthDate": format_date(patient.date_of_birth),
        }

        if telecom:
            fhir_resource["telecom"] = telecom
        if address:
            fhir_resource["address"] = address

        # Add emergency contact if present (via EmergencyContact model, not direct field)
        # Emergency contacts are in a separate model, skip for now

        return fhir_resource


class FHIRPractitionerView(PublicFHIRReadAPIView):
    """
    FHIR Practitioner resource endpoint.

    GET /fhir/Practitioner/{id} - Returns Practitioner resource in FHIR R4 format.
    """

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a FHIR R4 Practitioner resource by ID",
    )
    def get(self, request, pk: int) -> Response:
        """Get a Practitioner resource by ID."""
        from hmis.apps.core.models import StaffProfile

        try:
            staff = StaffProfile.objects.select_related(
                "user", "primary_department", "primary_role"
            ).get(pk=pk)
        except StaffProfile.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"Practitioner with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        fhir_practitioner = self._to_fhir_practitioner(staff, request)
        return Response(fhir_practitioner, status=status.HTTP_200_OK)

    def _to_fhir_practitioner(self, staff, request) -> dict:
        """Convert Django StaffProfile to FHIR Practitioner resource."""
        base_url = get_base_url(request)

        fhir_resource = {
            "resourceType": "Practitioner",
            "id": str(staff.id),
            "meta": {"versionId": "1", "lastUpdated": format_date(datetime.now())},
            "identifier": [
                {
                    "use": "official",
                    "system": f"{base_url}/identifier/staff",
                    "value": (
                        staff.employee_id
                        if hasattr(staff, "employee_id") and staff.employee_id
                        else str(staff.id)
                    ),
                }
            ],
            "active": staff.user.is_active if staff.user else True,
            "name": [
                {
                    "use": "official",
                    "family": staff.user.last_name if staff.user else "",
                    "given": [staff.user.first_name] if staff.user else [],
                }
            ],
        }

        # Add qualification if available
        if hasattr(staff, "primary_role") and staff.primary_role:
            fhir_resource["qualification"] = [
                {
                    "code": {
                        "coding": [
                            {
                                "system": f"{base_url}/CodeSystem/staff-role",
                                "code": (
                                    staff.primary_role.code
                                    if hasattr(staff.primary_role, "code")
                                    else str(staff.primary_role.id)
                                ),
                                "display": (
                                    staff.primary_role.name
                                    if hasattr(staff.primary_role, "name")
                                    else str(staff.primary_role)
                                ),
                            }
                        ]
                    }
                }
            ]

        return fhir_resource


class FHIROrganizationView(PublicFHIRReadAPIView):
    """
    FHIR Organization resource endpoint.

    GET /fhir/Organization/{id} - Returns Organization resource in FHIR R4 format.
    """

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a FHIR R4 Organization resource by ID",
    )
    def get(self, request, pk: int) -> Response:
        """Get an Organization resource by ID."""
        from hmis.apps.clinics.models import Clinic

        try:
            clinic = Clinic.objects.get(pk=pk)
        except Clinic.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"Organization with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        fhir_organization = self._to_fhir_organization(clinic, request)
        return Response(fhir_organization, status=status.HTTP_200_OK)

    def _to_fhir_organization(self, clinic, request) -> dict:
        """Convert Django Clinic to FHIR Organization resource."""
        base_url = get_base_url(request)

        identifiers = [
            {"use": "official", "system": f"{base_url}/identifier/clinic", "value": str(clinic.id)}
        ]

        # Add MFL code if present
        if hasattr(clinic, "mfl_code") and clinic.mfl_code:
            identifiers.append(
                {"use": "official", "system": "urn:kenya:mfl", "value": clinic.mfl_code}
            )

        fhir_resource = {
            "resourceType": "Organization",
            "id": str(clinic.id),
            "meta": {"versionId": "1", "lastUpdated": format_date(datetime.now())},
            "identifier": identifiers,
            "active": clinic.is_active if hasattr(clinic, "is_active") else True,
            "type": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/organization-type",
                            "code": "prov",
                            "display": "Healthcare Provider",
                        }
                    ]
                }
            ],
            "name": clinic.name,
        }

        return fhir_resource


class FHIRPractitionerRoleView(PublicFHIRReadAPIView):
    """FHIR PractitionerRole resource endpoint."""

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a FHIR R4 PractitionerRole resource by ID",
    )
    def get(self, request, pk: int) -> Response:
        """Get a PractitionerRole resource by ID."""
        from hmis.apps.core.models import StaffProfile

        try:
            staff = StaffProfile.objects.select_related("primary_role").get(pk=pk)
        except StaffProfile.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"PractitionerRole with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(self._to_fhir_practitioner_role(staff), status=status.HTTP_200_OK)

    def _to_fhir_practitioner_role(self, staff) -> dict:
        """Convert Django StaffProfile to FHIR PractitionerRole resource."""
        return {
            "resourceType": "PractitionerRole",
            "id": str(staff.id),
            "active": staff.user.is_active if staff.user else True,
            "practitioner": {"reference": f"Practitioner/{staff.id}"},
            "code": [
                {
                    "coding": [
                        {
                            "system": "urn:vitora:role",
                            "code": staff.primary_role.code,
                            "display": staff.primary_role.name,
                        }
                    ],
                    "text": staff.primary_role.name,
                }
            ],
        }
