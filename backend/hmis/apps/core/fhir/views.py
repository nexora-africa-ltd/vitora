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

from django.http import Http404
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
    
    def get(self, request, pk: int) -> Response:
        """Get a Patient resource by ID."""
        from hmis.apps.patients.models import Patient
        
        try:
            patient = Patient.objects.select_related(
                'county', 'sub_county', 'ward'
            ).get(pk=pk)
        except Patient.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [{
                        "severity": "error",
                        "code": "not-found",
                        "diagnostics": f"Patient with ID {pk} not found"
                    }]
                },
                status=status.HTTP_404_NOT_FOUND
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
                    "coding": [{
                        "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
                        "code": "MR",
                        "display": "Medical Record Number"
                    }]
                },
                "system": f"{base_url}/identifier/mrn",
                "value": patient.mrn
            }
        ]
        
        # Add national ID if present
        if patient.national_id:
            identifiers.append({
                "use": "official",
                "type": {
                    "coding": [{
                        "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
                        "code": "NI",
                        "display": "National Identifier"
                    }]
                },
                "system": "urn:kenya:national-id",
                "value": patient.national_id
            })
        
        # Add SHA CR number if present
        if hasattr(patient, 'sha_cr_number') and patient.sha_cr_number:
            identifiers.append({
                "use": "official",
                "type": {
                    "coding": [{
                        "system": "urn:sha:identifier-type",
                        "code": "CR",
                        "display": "Client Registry Number"
                    }]
                },
                "system": "urn:sha:client-registry",
                "value": patient.sha_cr_number
            })
        
        # Build name
        name = [{
            "use": "official",
            "family": patient.last_name,
            "given": [patient.first_name]
        }]
        if hasattr(patient, 'middle_name') and patient.middle_name:
            name[0]["given"].append(patient.middle_name)
        
        # Build telecom
        telecom = []
        if patient.phone_number:
            telecom.append({
                "system": "phone",
                "value": patient.phone_number,
                "use": "mobile"
            })
        if hasattr(patient, 'email') and patient.email:
            telecom.append({
                "system": "email",
                "value": patient.email,
                "use": "home"
            })
        
        # Build address
        address = []
        if patient.county or patient.sub_county or patient.ward:
            addr = {
                "use": "home",
                "type": "physical"
            }
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
        gender_map = {
            'M': 'male',
            'F': 'female',
            'O': 'other'
        }
        
        fhir_resource = {
            "resourceType": "Patient",
            "id": str(patient.id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(patient.updated_at if hasattr(patient, 'updated_at') else datetime.now())
            },
            "identifier": identifiers,
            "active": True,
            "name": name,
            "gender": gender_map.get(patient.gender, 'unknown'),
            "birthDate": format_date(patient.date_of_birth)
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
    
    def get(self, request, pk: int) -> Response:
        """Get a Practitioner resource by ID."""
        from hmis.apps.core.models import StaffProfile
        
        try:
            staff = StaffProfile.objects.select_related('user', 'primary_department', 'primary_role').get(pk=pk)
        except StaffProfile.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [{
                        "severity": "error",
                        "code": "not-found",
                        "diagnostics": f"Practitioner with ID {pk} not found"
                    }]
                },
                status=status.HTTP_404_NOT_FOUND
            )
        
        fhir_practitioner = self._to_fhir_practitioner(staff, request)
        return Response(fhir_practitioner, status=status.HTTP_200_OK)
    
    def _to_fhir_practitioner(self, staff, request) -> dict:
        """Convert Django StaffProfile to FHIR Practitioner resource."""
        base_url = get_base_url(request)
        
        fhir_resource = {
            "resourceType": "Practitioner",
            "id": str(staff.id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(datetime.now())
            },
            "identifier": [{
                "use": "official",
                "system": f"{base_url}/identifier/staff",
                "value": staff.employee_id if hasattr(staff, 'employee_id') and staff.employee_id else str(staff.id)
            }],
            "active": staff.user.is_active if staff.user else True,
            "name": [{
                "use": "official",
                "family": staff.user.last_name if staff.user else "",
                "given": [staff.user.first_name] if staff.user else []
            }]
        }
        
        # Add qualification if available
        if hasattr(staff, 'primary_role') and staff.primary_role:
            fhir_resource["qualification"] = [{
                "code": {
                    "coding": [{
                        "system": f"{base_url}/CodeSystem/staff-role",
                        "code": staff.primary_role.code if hasattr(staff.primary_role, 'code') else str(staff.primary_role.id),
                        "display": staff.primary_role.name if hasattr(staff.primary_role, 'name') else str(staff.primary_role)
                    }]
                }
            }]
        
        return fhir_resource


class FHIROrganizationView(APIView):
    """
    FHIR Organization resource endpoint.
    
    GET /fhir/Organization/{id} - Returns Organization resource in FHIR R4 format.
    """
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request, pk: int) -> Response:
        """Get an Organization resource by ID."""
        from hmis.apps.clinics.models import Clinic
        
        try:
            clinic = Clinic.objects.get(pk=pk)
        except Clinic.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [{
                        "severity": "error",
                        "code": "not-found",
                        "diagnostics": f"Organization with ID {pk} not found"
                    }]
                },
                status=status.HTTP_404_NOT_FOUND
            )
        
        fhir_organization = self._to_fhir_organization(clinic, request)
        return Response(fhir_organization, status=status.HTTP_200_OK)
    
    def _to_fhir_organization(self, clinic, request) -> dict:
        """Convert Django Clinic to FHIR Organization resource."""
        base_url = get_base_url(request)
        
        identifiers = [{
            "use": "official",
            "system": f"{base_url}/identifier/clinic",
            "value": str(clinic.id)
        }]
        
        # Add MFL code if present
        if hasattr(clinic, 'mfl_code') and clinic.mfl_code:
            identifiers.append({
                "use": "official",
                "system": "urn:kenya:mfl",
                "value": clinic.mfl_code
            })
        
        fhir_resource = {
            "resourceType": "Organization",
            "id": str(clinic.id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(datetime.now())
            },
            "identifier": identifiers,
            "active": clinic.is_active if hasattr(clinic, 'is_active') else True,
            "type": [{
                "coding": [{
                    "system": "http://terminology.hl7.org/CodeSystem/organization-type",
                    "code": "prov",
                    "display": "Healthcare Provider"
                }]
            }],
            "name": clinic.name
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
    
    def get(self, request, pk: int) -> Response:
        """Get an Observation resource by ID."""
        # Check lab results first
        from hmis.apps.laboratory.models import LabResult
        
        try:
            lab_result = LabResult.objects.select_related(
                'order_item__lab_order__patient',
            ).get(pk=pk)
            return Response(
                self._lab_result_to_fhir(lab_result, request),
                status=status.HTTP_200_OK
            )
        except LabResult.DoesNotExist:
            pass
        
        # Check for vitals in encounters
        from hmis.apps.encounters.models import Encounter
        
        try:
            encounter = Encounter.objects.select_related('patient').get(pk=pk)
            # Return first vital sign as observation
            return Response(
                self._encounter_vitals_to_fhir(encounter, request),
                status=status.HTTP_200_OK
            )
        except Encounter.DoesNotExist:
            pass
        
        return Response(
            {
                "resourceType": "OperationOutcome",
                "issue": [{
                    "severity": "error",
                    "code": "not-found",
                    "diagnostics": f"Observation with ID {pk} not found"
                }]
            },
            status=status.HTTP_404_NOT_FOUND
        )
    
    def _lab_result_to_fhir(self, lab_result, request) -> dict:
        """Convert LabResult to FHIR Observation."""
        base_url = get_base_url(request)
        
        fhir_resource = {
            "resourceType": "Observation",
            "id": str(lab_result.id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(lab_result.created_at if hasattr(lab_result, 'created_at') else datetime.now())
            },
            "status": "final",
            "category": [{
                "coding": [{
                    "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                    "code": "laboratory",
                    "display": "Laboratory"
                }]
            }],
            "code": {
                "coding": [{
                    "system": "http://loinc.org",
                    "code": lab_result.lab_order.test_type.loinc_code if hasattr(lab_result.lab_order.test_type, 'loinc_code') else "unknown",
                    "display": lab_result.lab_order.test_type.name if lab_result.lab_order.test_type else "Lab Test"
                }],
                "text": lab_result.lab_order.test_type.name if lab_result.lab_order.test_type else "Lab Test"
            },
            "subject": {
                "reference": f"Patient/{lab_result.lab_order.patient.id}"
            },
            "effectiveDateTime": format_date(lab_result.result_date if hasattr(lab_result, 'result_date') else datetime.now()),
            "valueString": str(lab_result.value) if hasattr(lab_result, 'value') else ""
        }
        
        return fhir_resource
    
    def _encounter_vitals_to_fhir(self, encounter, request) -> dict:
        """Convert Encounter vitals to FHIR Observation."""
        base_url = get_base_url(request)
        
        # Create a vital signs observation from encounter
        components = []
        
        if encounter.temperature:
            components.append({
                "code": {
                    "coding": [{
                        "system": "http://loinc.org",
                        "code": "8310-5",
                        "display": "Body temperature"
                    }]
                },
                "valueQuantity": {
                    "value": float(encounter.temperature),
                    "unit": "°C",
                    "system": "http://unitsofmeasure.org",
                    "code": "Cel"
                }
            })
        
        if encounter.pulse:
            components.append({
                "code": {
                    "coding": [{
                        "system": "http://loinc.org",
                        "code": "8867-4",
                        "display": "Heart rate"
                    }]
                },
                "valueQuantity": {
                    "value": encounter.pulse,
                    "unit": "beats/minute",
                    "system": "http://unitsofmeasure.org",
                    "code": "/min"
                }
            })
        
        if encounter.spo2:
            components.append({
                "code": {
                    "coding": [{
                        "system": "http://loinc.org",
                        "code": "2708-6",
                        "display": "Oxygen saturation"
                    }]
                },
                "valueQuantity": {
                    "value": float(encounter.spo2),
                    "unit": "%",
                    "system": "http://unitsofmeasure.org",
                    "code": "%"
                }
            })
        
        fhir_resource = {
            "resourceType": "Observation",
            "id": str(encounter.id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(encounter.updated_at if hasattr(encounter, 'updated_at') else datetime.now())
            },
            "status": "final",
            "category": [{
                "coding": [{
                    "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                    "code": "vital-signs",
                    "display": "Vital Signs"
                }]
            }],
            "code": {
                "coding": [{
                    "system": "http://loinc.org",
                    "code": "85353-1",
                    "display": "Vital signs, weight, height, head circumference, oxygen saturation and BMI panel"
                }],
                "text": "Vital Signs Panel"
            },
            "subject": {
                "reference": f"Patient/{encounter.patient.id}"
            },
            "effectiveDateTime": format_date(encounter.encounter_date),
            "component": components
        }
        
        return fhir_resource


class FHIRConditionView(APIView):
    """
    FHIR Condition resource endpoint.
    
    GET /fhir/Condition/{id} - Returns Condition resource in FHIR R4 format.
    """
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request, pk: int) -> Response:
        """Get a Condition resource by ID."""
        from hmis.apps.encounters.models import Diagnosis
        
        try:
            diagnosis = Diagnosis.objects.select_related(
                'encounter__patient',
                'icd10_code'
            ).get(pk=pk)
        except Diagnosis.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [{
                        "severity": "error",
                        "code": "not-found",
                        "diagnostics": f"Condition with ID {pk} not found"
                    }]
                },
                status=status.HTTP_404_NOT_FOUND
            )
        
        fhir_condition = self._to_fhir_condition(diagnosis, request)
        return Response(fhir_condition, status=status.HTTP_200_OK)
    
    def _to_fhir_condition(self, diagnosis, request) -> dict:
        """Convert Django Diagnosis to FHIR Condition resource."""
        base_url = get_base_url(request)
        
        # Map diagnosis type to category
        category_map = {
            'PRIMARY': {'code': 'encounter-diagnosis', 'display': 'Encounter Diagnosis'},
            'SECONDARY': {'code': 'encounter-diagnosis', 'display': 'Encounter Diagnosis'},
            'CHRONIC': {'code': 'problem-list-item', 'display': 'Problem List Item'}
        }
        category = category_map.get(diagnosis.diagnosis_type, {'code': 'encounter-diagnosis', 'display': 'Encounter Diagnosis'})
        
        fhir_resource = {
            "resourceType": "Condition",
            "id": str(diagnosis.id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(datetime.now())
            },
            "clinicalStatus": {
                "coding": [{
                    "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                    "code": "active",
                    "display": "Active"
                }]
            },
            "verificationStatus": {
                "coding": [{
                    "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                    "code": "confirmed",
                    "display": "Confirmed"
                }]
            },
            "category": [{
                "coding": [{
                    "system": "http://terminology.hl7.org/CodeSystem/condition-category",
                    "code": category['code'],
                    "display": category['display']
                }]
            }],
            "code": {
                "coding": [{
                    "system": "http://hl7.org/fhir/sid/icd-10",
                    "code": diagnosis.icd10_code.code if diagnosis.icd10_code else "unknown",
                    "display": diagnosis.icd10_code.description if diagnosis.icd10_code else (diagnosis.notes or "Unknown")
                }],
                "text": diagnosis.icd10_code.description if diagnosis.icd10_code else (diagnosis.notes or "Unknown")
            },
            "subject": {
                "reference": f"Patient/{diagnosis.encounter.patient.id}"
            },
            "encounter": {
                "reference": f"Encounter/{diagnosis.encounter.id}"
            },
            "recordedDate": format_date(diagnosis.encounter.encounter_date)
        }
        
        return fhir_resource


class FHIRCompositionView(APIView):
    """
    FHIR Composition resource endpoint.
    
    GET /fhir/Composition/{id} - Returns Composition resource in FHIR R4 format.
    
    Used for IPS document structure.
    """
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request, pk: int) -> Response:
        """Get a Composition resource by ID (using patient ID as proxy)."""
        from hmis.apps.patients.models import Patient
        
        try:
            patient = Patient.objects.get(pk=pk)
        except Patient.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [{
                        "severity": "error",
                        "code": "not-found",
                        "diagnostics": f"Composition with ID {pk} not found"
                    }]
                },
                status=status.HTTP_404_NOT_FOUND
            )
        
        fhir_composition = self._to_fhir_composition(patient, request)
        return Response(fhir_composition, status=status.HTTP_200_OK)
    
    def _to_fhir_composition(self, patient, request) -> dict:
        """Create an IPS Composition for a patient."""
        base_url = get_base_url(request)
        
        fhir_resource = {
            "resourceType": "Composition",
            "id": str(patient.id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(datetime.now()),
                "profile": ["http://hl7.org/fhir/uv/ips/StructureDefinition/Composition-uv-ips"]
            },
            "status": "final",
            "type": {
                "coding": [{
                    "system": "http://loinc.org",
                    "code": "60591-5",
                    "display": "Patient summary Document"
                }]
            },
            "subject": {
                "reference": f"Patient/{patient.id}"
            },
            "date": format_date(datetime.now()),
            "author": [{
                "reference": "Organization/1",
                "display": "Vitora HMIS"
            }],
            "title": f"International Patient Summary for {patient.first_name} {patient.last_name}",
            "section": [
                {
                    "title": "Allergies and Intolerances",
                    "code": {
                        "coding": [{
                            "system": "http://loinc.org",
                            "code": "48765-2",
                            "display": "Allergies and adverse reactions Document"
                        }]
                    },
                    "text": {
                        "status": "generated",
                        "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">No known allergies</div>"
                    },
                    "emptyReason": {
                        "coding": [{
                            "system": "http://terminology.hl7.org/CodeSystem/list-empty-reason",
                            "code": "unavailable",
                            "display": "Unavailable"
                        }]
                    }
                },
                {
                    "title": "Medication Summary",
                    "code": {
                        "coding": [{
                            "system": "http://loinc.org",
                            "code": "10160-0",
                            "display": "History of Medication use Narrative"
                        }]
                    },
                    "text": {
                        "status": "generated",
                        "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">No current medications</div>"
                    },
                    "emptyReason": {
                        "coding": [{
                            "system": "http://terminology.hl7.org/CodeSystem/list-empty-reason",
                            "code": "unavailable",
                            "display": "Unavailable"
                        }]
                    }
                },
                {
                    "title": "Problem List",
                    "code": {
                        "coding": [{
                            "system": "http://loinc.org",
                            "code": "11450-4",
                            "display": "Problem list - Reported"
                        }]
                    },
                    "text": {
                        "status": "generated",
                        "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">No known problems</div>"
                    },
                    "emptyReason": {
                        "coding": [{
                            "system": "http://terminology.hl7.org/CodeSystem/list-empty-reason",
                            "code": "unavailable",
                            "display": "Unavailable"
                        }]
                    }
                }
            ]
        }
        
        return fhir_resource


class FHIRAllergyIntoleranceView(APIView):
    """
    FHIR AllergyIntolerance resource endpoint.
    
    GET /fhir/AllergyIntolerance/{id} - Returns AllergyIntolerance in FHIR R4 format.
    """
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request, pk: int) -> Response:
        """Get an AllergyIntolerance resource by ID."""
        # For now, return a placeholder since allergies may be stored differently
        return Response(
            {
                "resourceType": "OperationOutcome",
                "issue": [{
                    "severity": "error",
                    "code": "not-found",
                    "diagnostics": f"AllergyIntolerance with ID {pk} not found"
                }]
            },
            status=status.HTTP_404_NOT_FOUND
        )


class FHIRMedicationStatementView(APIView):
    """
    FHIR MedicationStatement resource endpoint.
    
    GET /fhir/MedicationStatement/{id} - Returns MedicationStatement in FHIR R4 format.
    """
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request, pk: int) -> Response:
        """Get a MedicationStatement resource by ID."""
        from hmis.apps.pharmacy.models import Prescription
        
        try:
            prescription = Prescription.objects.select_related(
                'patient',
                'encounter'
            ).get(pk=pk)
        except Prescription.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [{
                        "severity": "error",
                        "code": "not-found",
                        "diagnostics": f"MedicationStatement with ID {pk} not found"
                    }]
                },
                status=status.HTTP_404_NOT_FOUND
            )
        
        fhir_resource = self._to_fhir_medication_statement(prescription, request)
        return Response(fhir_resource, status=status.HTTP_200_OK)
    
    def _to_fhir_medication_statement(self, prescription, request) -> dict:
        """Convert Django Prescription to FHIR MedicationStatement."""
        base_url = get_base_url(request)
        
        fhir_resource = {
            "resourceType": "MedicationStatement",
            "id": str(prescription.id),
            "meta": {
                "versionId": "1",
                "lastUpdated": format_date(prescription.updated_at if hasattr(prescription, 'updated_at') else datetime.now())
            },
            "status": "active" if prescription.status == "ACTIVE" else "completed",
            "subject": {
                "reference": f"Patient/{prescription.patient.id}"
            },
            "effectiveDateTime": format_date(prescription.created_at if hasattr(prescription, 'created_at') else datetime.now()),
            "dateAsserted": format_date(prescription.created_at if hasattr(prescription, 'created_at') else datetime.now())
        }
        
        return fhir_resource


class FHIRDeviceView(APIView):
    """
    FHIR Device resource endpoint.
    
    GET /fhir/Device/{id} - Returns Device resource in FHIR R4 format.
    """
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request, pk: int) -> Response:
        """Get a Device resource by ID."""
        # Return placeholder - devices may not be tracked in the system
        return Response(
            {
                "resourceType": "OperationOutcome",
                "issue": [{
                    "severity": "error",
                    "code": "not-found",
                    "diagnostics": f"Device with ID {pk} not found"
                }]
            },
            status=status.HTTP_404_NOT_FOUND
        )


class FHIRPatientSummaryView(APIView):
    """
    IPS (International Patient Summary) endpoint.
    
    GET /fhir/Patient/{id}/$summary - Returns IPS Bundle for a patient.
    
    Reference: http://hl7.org/fhir/uv/ips/
    """
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request, pk: int) -> Response:
        """Generate IPS Bundle for a patient."""
        from hmis.apps.patients.models import Patient
        from hmis.apps.encounters.models import Diagnosis
        
        try:
            patient = Patient.objects.select_related(
                'county', 'sub_county', 'ward'
            ).get(pk=pk)
        except Patient.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [{
                        "severity": "error",
                        "code": "not-found",
                        "diagnostics": f"Patient with ID {pk} not found"
                    }]
                },
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Get patient's conditions
        diagnoses = Diagnosis.objects.filter(
            encounter__patient=patient
        ).select_related('icd10_code', 'encounter')[:10]
        
        # Build IPS Bundle
        ips_bundle = self._build_ips_bundle(patient, diagnoses, request)
        
        return Response(ips_bundle, status=status.HTTP_200_OK)
    
    def _build_ips_bundle(self, patient, diagnoses, request) -> dict:
        """Build an IPS Bundle for the patient."""
        base_url = get_base_url(request)
        
        # Get FHIR representations
        patient_view = FHIRPatientView()
        fhir_patient = patient_view._to_fhir_patient(patient, request)
        
        composition_view = FHIRCompositionView()
        fhir_composition = composition_view._to_fhir_composition(patient, request)
        
        # Build condition entries
        condition_entries = []
        for diagnosis in diagnoses:
            condition_view = FHIRConditionView()
            fhir_condition = condition_view._to_fhir_condition(diagnosis, request)
            condition_entries.append({
                "fullUrl": f"{base_url}/Condition/{diagnosis.id}",
                "resource": fhir_condition
            })
        
        # Update composition with condition references
        if condition_entries:
            problem_section = next(
                (s for s in fhir_composition["section"] if s["title"] == "Problem List"),
                None
            )
            if problem_section:
                problem_section.pop("emptyReason", None)
                problem_section["entry"] = [
                    {"reference": f"Condition/{d.id}"} for d in diagnoses
                ]
        
        # Build the IPS Bundle
        ips_bundle = {
            "resourceType": "Bundle",
            "id": f"ips-{patient.id}",
            "meta": {
                "lastUpdated": format_date(datetime.now()),
                "profile": ["http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips"]
            },
            "identifier": {
                "system": f"{base_url}/identifier/ips-bundle",
                "value": f"ips-{patient.mrn}"
            },
            "type": "document",
            "timestamp": format_date(datetime.now()),
            "entry": [
                {
                    "fullUrl": f"{base_url}/Composition/{patient.id}",
                    "resource": fhir_composition
                },
                {
                    "fullUrl": f"{base_url}/Patient/{patient.id}",
                    "resource": fhir_patient
                }
            ] + condition_entries
        }
        
        return ips_bundle
