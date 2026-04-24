"""
FHIR R4 Resource Views for Vitora HMIS.

This module implements FHIR R4 compliant API endpoints for core resources
required for IPS (International Patient Summary) testing.

Endpoints:
    GET /fhir/Patient/{id}           - Read patient resource
    GET /fhir/Patient/{id}/$summary  - Generate IPS Bundle
    GET /fhir/Practitioner/{id}      - Read practitioner resource
    GET /fhir/Organization/{id}      - Read organization resource
    GET /fhir/Observation/{id}       - Read observation resource
    GET /fhir/Condition/{id}         - Read condition resource
    GET /fhir/Composition/{id}       - Read composition resource
    GET /fhir/AllergyIntolerance/{id} - Read allergy resource
    GET /fhir/MedicationStatement/{id} - Read medication statement
    GET /fhir/Device/{id}            - Read device resource

Reference: https://hl7.org/fhir/R4/
"""

import logging
from datetime import date, datetime

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

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

CANONICAL_ICD10_DISPLAYS = {
    "I10": "Essential (primary) hypertension",
    "J06.9": "Acute upper respiratory infection, unspecified",
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


class FHIRPatientView(APIView):
    """
    FHIR Patient resource endpoint.

    GET /fhir/Patient/{id} - Returns Patient resource in FHIR R4 format.
    """

    permission_classes = [IsAuthenticated]
    renderer_classes = FHIR_RENDERER_CLASSES

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


class FHIRPractitionerView(APIView):
    """
    FHIR Practitioner resource endpoint.

    GET /fhir/Practitioner/{id} - Returns Practitioner resource in FHIR R4 format.
    """

    permission_classes = [IsAuthenticated]

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


class FHIROrganizationView(APIView):
    """
    FHIR Organization resource endpoint.

    GET /fhir/Organization/{id} - Returns Organization resource in FHIR R4 format.
    """

    permission_classes = [IsAuthenticated]

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


class FHIRPractitionerRoleView(APIView):
    """FHIR PractitionerRole resource endpoint."""

    permission_classes = [IsAuthenticated]

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


class FHIRObservationView(APIView):
    """
    FHIR Observation resource endpoint.

    GET /fhir/Observation/{id} - Returns Observation resource in FHIR R4 format.

    This endpoint serves various observation types:
    - Vital signs from encounters
    - Lab results
    - Social history observations
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a FHIR R4 Observation resource by ID",
    )
    def get(self, request, pk: int) -> Response:
        """Get an Observation resource by ID."""
        from hmis.apps.encounters.models import PregnancyObservation, SocialHistoryObservation

        try:
            social_history_observation = SocialHistoryObservation.objects.select_related(
                "patient", "encounter"
            ).get(fhir_id=pk)
            return Response(
                self._social_history_to_fhir(social_history_observation, request),
                status=status.HTTP_200_OK,
            )
        except SocialHistoryObservation.DoesNotExist:
            pass

        try:
            pregnancy_observation = PregnancyObservation.objects.select_related(
                "patient", "encounter", "mch_registration", "delivery"
            ).get(fhir_id=pk)
            return Response(
                self._pregnancy_observation_to_fhir(pregnancy_observation, request),
                status=status.HTTP_200_OK,
            )
        except PregnancyObservation.DoesNotExist:
            pass

        # Check lab results first
        from hmis.apps.laboratory.models import LabResult

        try:
            lab_result = LabResult.objects.select_related(
                "order_item__lab_order__patient",
            ).get(pk=pk)
            return Response(
                self._lab_result_to_fhir(lab_result, request), status=status.HTTP_200_OK
            )
        except LabResult.DoesNotExist:
            pass

        # Check for vitals in encounters
        from hmis.apps.encounters.models import Encounter

        try:
            encounter = Encounter.objects.select_related("patient").get(pk=pk)
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
            value_field = {
                "valueQuantity": {
                    "value": float(lab_result.numeric_value),
                    "unit": lab_result.result_unit or test.result_unit,
                    "system": "http://unitsofmeasure.org",
                    "code": lab_result.result_unit or test.result_unit,
                }
            }
        elif lab_result.text_value:
            value_field = {"valueString": lab_result.text_value}
        elif lab_result.option_value:
            value_field = {"valueString": lab_result.option_value}

        fhir_resource = {
            "resourceType": "Observation",
            "id": str(lab_result.id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(lab_result.updated_at),
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
                        "display": test.name,
                    }
                ],
                "text": test.name,
            },
            "subject": {"reference": f"Patient/{lab_order.patient.id}"},
            "effectiveDateTime": format_date(lab_result.verified_at or lab_result.entered_at),
        }

        if lab_order.encounter_id:
            fhir_resource["encounter"] = {"reference": f"Encounter/{lab_order.encounter_id}"}

        if lab_result.reference_range_text:
            fhir_resource["referenceRange"] = [{"text": lab_result.reference_range_text}]

        if lab_result.result_flag:
            fhir_resource["interpretation"] = [
                {
                    "text": lab_result.get_result_flag_display(),
                }
            ]

        if lab_result.specimen_id:
            fhir_resource["specimen"] = {"reference": f"Specimen/{lab_result.specimen_id}"}

        fhir_resource.update(value_field)

        return fhir_resource

    def _social_history_to_fhir(self, observation, request) -> dict:
        """Convert a dedicated social-history observation to FHIR Observation."""
        code_map = {
            "ALCOHOL_USE": {
                "code": "74013-4",
                "display": "Alcohol use",
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
        status_text = {
            "CURRENT": "Current use",
            "FORMER": "Former use",
            "NEVER": "Never used",
            "UNKNOWN": "Unknown",
        }
        code = code_map[observation.observation_type]

        fhir_resource = {
            "resourceType": "Observation",
            "id": str(observation.fhir_id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(observation.updated_at),
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
            "valueCodeableConcept": {
                "text": status_text.get(observation.status, observation.status),
            },
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
            "PREGNANCY_OUTCOME": {
                "system": "http://loinc.org",
                "code": "11636-8",
                "display": "Birth outcome",
                "text": "Pregnancy outcome",
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
        code = code_map[observation.observation_type]

        fhir_resource = {
            "resourceType": "Observation",
            "id": str(observation.fhir_id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(observation.updated_at),
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
        }

        if observation.encounter_id:
            fhir_resource["encounter"] = {"reference": f"Encounter/{observation.encounter_id}"}

        if observation.observation_type == "PREGNANCY_EXPECTED_DELIVERY_DATE":
            fhir_resource["valueDateTime"] = format_date(observation.value_date)
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


class FHIRConditionView(APIView):
    """
    FHIR Condition resource endpoint.

    GET /fhir/Condition/{id} - Returns Condition resource in FHIR R4 format.
    """

    permission_classes = [IsAuthenticated]

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
                            "display": "Relevant diagnostic tests/laboratory data Narrative",
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
                            "display": "Social history Narrative",
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
                            "display": "History of Immunization Narrative",
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


class FHIRAllergyIntoleranceView(APIView):
    """
    FHIR AllergyIntolerance resource endpoint.

    GET /fhir/AllergyIntolerance/{id} - Returns AllergyIntolerance in FHIR R4 format.
    """

    permission_classes = [IsAuthenticated]

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

    permission_classes = [IsAuthenticated]

    # Status mapping from Django to FHIR MedicationStatement status
    STATUS_MAP = {
        "PENDING": "completed",
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


class FHIRDeviceView(APIView):
    """
    FHIR Device resource endpoint.

    GET /fhir/Device/{id} - Returns Device resource in FHIR R4 format.
    """

    permission_classes = [IsAuthenticated]

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


class FHIRDeviceUseStatementView(APIView):
    """FHIR DeviceUseStatement resource endpoint."""

    permission_classes = [IsAuthenticated]

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


class FHIRMedicationView(APIView):
    """FHIR Medication resource endpoint."""

    permission_classes = [IsAuthenticated]

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


class FHIRSpecimenView(APIView):
    """FHIR Specimen resource endpoint."""

    permission_classes = [IsAuthenticated]

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
        fhir_resource = {
            "resourceType": "Specimen",
            "id": str(specimen.id),
            "identifier": [{"value": specimen.barcode}],
            "status": specimen.status.lower(),
            "type": {"text": specimen.get_specimen_type_display()},
            "subject": {"reference": f"Patient/{specimen.lab_order.patient_id}"},
        }
        if specimen.collected_at or specimen.collection_site:
            fhir_resource["collection"] = {
                "collectedDateTime": format_date(specimen.collected_at),
                "bodySite": {"text": specimen.collection_site},
            }
        if specimen.received_at:
            fhir_resource["receivedTime"] = format_date(specimen.received_at)
        return fhir_resource


class FHIRDiagnosticReportView(APIView):
    """FHIR DiagnosticReport resource endpoint."""

    permission_classes = [IsAuthenticated]

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
            "status": self.STATUS_MAP.get(report.status, "unknown"),
            "code": {"text": "Laboratory Diagnostic Report"},
            "subject": {"reference": f"Patient/{report.lab_order.patient_id}"},
            "effectiveDateTime": format_date(report.issued_at or report.created_at),
            "issued": format_date(report.issued_at or report.created_at),
            "result": results,
        }
        if specimens:
            fhir_resource["specimen"] = specimens
        if report.conclusion:
            fhir_resource["conclusion"] = report.conclusion
        return fhir_resource


class FHIRImmunizationView(APIView):
    """FHIR Immunization resource endpoint."""

    permission_classes = [IsAuthenticated]

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


class FHIRProcedureView(APIView):
    """FHIR Procedure resource endpoint."""

    permission_classes = [IsAuthenticated]

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


class FHIRImagingStudyView(APIView):
    """FHIR ImagingStudy resource endpoint."""

    permission_classes = [IsAuthenticated]

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


class FHIRMediaView(APIView):
    """FHIR Media resource endpoint."""

    permission_classes = [IsAuthenticated]

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

    permission_classes = [IsAuthenticated]

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


class FHIRPatientSummaryView(APIView):
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

        # Get patient's active/pending prescriptions with items
        prescriptions = (
            Prescription.objects.filter(
                patient=patient,
                status__in=["PENDING", "PARTIAL", "DISPENSED"],
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
