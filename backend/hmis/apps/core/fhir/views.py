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
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


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


class FHIRPatientView(APIView):
    """
    FHIR Patient resource endpoint.

    GET /fhir/Patient/{id} - Returns Patient resource in FHIR R4 format.
    """

    permission_classes = [IsAuthenticated]

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
                    "value": staff.employee_id
                    if hasattr(staff, "employee_id") and staff.employee_id
                    else str(staff.id),
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
                                "code": staff.primary_role.code
                                if hasattr(staff.primary_role, "code")
                                else str(staff.primary_role.id),
                                "display": staff.primary_role.name
                                if hasattr(staff.primary_role, "name")
                                else str(staff.primary_role),
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
        base_url = get_base_url(request)

        fhir_resource = {
            "resourceType": "Observation",
            "id": str(lab_result.id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(
                    lab_result.created_at if hasattr(lab_result, "created_at") else datetime.now()
                ),
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
                        "code": lab_result.lab_order.test_type.loinc_code
                        if hasattr(lab_result.lab_order.test_type, "loinc_code")
                        else "unknown",
                        "display": lab_result.lab_order.test_type.name
                        if lab_result.lab_order.test_type
                        else "Lab Test",
                    }
                ],
                "text": lab_result.lab_order.test_type.name
                if lab_result.lab_order.test_type
                else "Lab Test",
            },
            "subject": {"reference": f"Patient/{lab_result.lab_order.patient.id}"},
            "effectiveDateTime": format_date(
                lab_result.result_date if hasattr(lab_result, "result_date") else datetime.now()
            ),
            "valueString": str(lab_result.value) if hasattr(lab_result, "value") else "",
        }

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
        base_url = get_base_url(request)

        # Map diagnosis type to category
        category_map = {
            "PRIMARY": {"code": "encounter-diagnosis", "display": "Encounter Diagnosis"},
            "SECONDARY": {"code": "encounter-diagnosis", "display": "Encounter Diagnosis"},
            "CHRONIC": {"code": "problem-list-item", "display": "Problem List Item"},
        }
        category = category_map.get(
            diagnosis.diagnosis_type,
            {"code": "encounter-diagnosis", "display": "Encounter Diagnosis"},
        )

        fhir_resource = {
            "resourceType": "Condition",
            "id": str(diagnosis.id),
            "meta": {"versionId": "1", "lastUpdated": format_date(datetime.now())},
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
                            "code": category["code"],
                            "display": category["display"],
                        }
                    ]
                }
            ],
            "code": {
                "coding": [
                    {
                        "system": "http://hl7.org/fhir/sid/icd-10",
                        "code": diagnosis.icd10_code.code if diagnosis.icd10_code else "unknown",
                        "display": diagnosis.icd10_code.description
                        if diagnosis.icd10_code
                        else (diagnosis.notes or "Unknown"),
                    }
                ],
                "text": diagnosis.icd10_code.description
                if diagnosis.icd10_code
                else (diagnosis.notes or "Unknown"),
            },
            "subject": {"reference": f"Patient/{diagnosis.encounter.patient.id}"},
            "encounter": {"reference": f"Encounter/{diagnosis.encounter.id}"},
            "recordedDate": format_date(diagnosis.encounter.encounter_date),
        }

        return fhir_resource


class FHIRCompositionView(APIView):
    """
    FHIR Composition resource endpoint.

    GET /fhir/Composition/{id} - Returns Composition resource in FHIR R4 format.

    Used for IPS document structure.
    """

    permission_classes = [IsAuthenticated]

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
        self, patient, request, allergies=None, medication_items=None, treatment_plans=None
    ) -> dict:
        """
        Create an IPS Composition for a patient.

        Args:
            patient: Patient instance
            request: HTTP request for URL generation
            allergies: Optional list of Allergy instances
            medication_items: Optional list of PrescriptionItem instances
            treatment_plans: Optional list of TreatmentPlan instances

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

        # Build sections list
        sections = [allergy_section, medication_section, problem_section]

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

        fhir_resource = {
            "resourceType": "Composition",
            "id": str(patient.id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(datetime.now()),
                "profile": ["http://hl7.org/fhir/uv/ips/StructureDefinition/Composition-uv-ips"],
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
            "date": format_date(datetime.now()),
            "author": [{"reference": "Organization/1", "display": "Vitora HMIS"}],
            "title": f"International Patient Summary for {patient.first_name} {patient.last_name}",
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

        # Add recorder if available
        if allergy.recorded_by:
            fhir_resource["recorder"] = {
                "reference": f"Practitioner/{allergy.recorded_by.id}",
                "display": allergy.recorded_by.get_full_name() or allergy.recorded_by.username,
            }

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
        "PENDING": "active",
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
            "identifier": [
                {
                    "system": f"{base_url}/identifier/prescription-item",
                    "value": f"{prescription.prescription_number}-{item.id}",
                }
            ],
            "status": fhir_status,
            "medicationCodeableConcept": {
                "coding": [
                    {
                        "system": f"{base_url}/CodeSystem/drug",
                        "code": drug.code,
                        "display": drug.generic_name,
                    }
                ],
                "text": f"{drug.generic_name} {drug.strength} {drug.form}",
            },
            "subject": {"reference": f"Patient/{prescription.patient.id}"},
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
            fhir_resource["dosage"][0]["route"] = {
                "coding": [
                    {
                        "system": "http://snomed.info/sct",
                        "display": item.route,
                    }
                ],
                "text": item.route,
            }

        # Add instructions as patientInstruction
        if item.instructions:
            fhir_resource["dosage"][0]["patientInstruction"] = item.instructions

        # Add prescriber
        if prescription.prescribed_by:
            fhir_resource["informationSource"] = {
                "reference": f"Practitioner/{prescription.prescribed_by.id}",
                "display": prescription.prescribed_by.get_full_name()
                or prescription.prescribed_by.username,
            }

        # Add encounter context if available
        if prescription.encounter:
            fhir_resource["context"] = {
                "reference": f"Encounter/{prescription.encounter.id}",
            }

        # Add KEML code if available (Kenya Essential Medicines List)
        if drug.keml_code:
            fhir_resource["medicationCodeableConcept"]["coding"].append(
                {
                    "system": "urn:kenya:keml",
                    "code": drug.keml_code,
                    "display": drug.generic_name,
                }
            )

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
        # Return placeholder - devices may not be tracked in the system
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

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Generate an IPS (International Patient Summary) Bundle for a patient",
    )
    def get(self, request, pk: int) -> Response:
        """Generate IPS Bundle for a patient."""
        from hmis.apps.encounters.models import Diagnosis, TreatmentPlan
        from hmis.apps.patients.models import Allergy, Patient
        from hmis.apps.pharmacy.models import Prescription

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

        # Build IPS Bundle
        ips_bundle = self._build_ips_bundle(
            patient, diagnoses, allergies, prescriptions, treatment_plans, request
        )

        return Response(ips_bundle, status=status.HTTP_200_OK)

    def _build_ips_bundle(
        self, patient, diagnoses, allergies, prescriptions, treatment_plans, request
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

        # Build composition with all section references
        composition_view = FHIRCompositionView()
        fhir_composition = composition_view._to_fhir_composition(
            patient,
            request,
            allergies=allergies,
            medication_items=all_items,
            treatment_plans=treatment_plans,
        )

        # Update composition with condition references
        if condition_entries:
            problem_section = next(
                (s for s in fhir_composition["section"] if s["title"] == "Problem List"), None
            )
            if problem_section:
                problem_section.pop("emptyReason", None)
                problem_section["entry"] = [{"reference": f"Condition/{d.id}"} for d in diagnoses]

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
            + condition_entries
            + allergy_entries
            + medication_entries
            + care_plan_entries,
        }

        return ips_bundle
