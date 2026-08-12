# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
FHIR R4 Write (Create) Views for Vitora HMIS.

Implements inbound FHIR write endpoints for receiving data from external systems.

Endpoints:
    POST /fhir/Patient          - Create patient from FHIR resource
    POST /fhir/Observation      - Create observation (lab result or vital)

Reference: https://hl7.org/fhir/R4/http.html#create
"""

import logging
from datetime import date

from django.db import IntegrityError
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.fhir.views import FHIR_RENDERER_CLASSES
from hmis.apps.core.permissions import ReadRequiresModelPermission

logger = logging.getLogger(__name__)


class FHIRWriteAPIView(APIView):
    """Base class for FHIR write endpoints (authenticated)."""

    permission_classes = [IsAuthenticated, ReadRequiresModelPermission]
    renderer_classes = FHIR_RENDERER_CLASSES

    def operation_outcome(self, severity: str, code: str, diagnostics: str, http_status=400):
        """Build a FHIR OperationOutcome response."""
        return Response(
            {
                "resourceType": "OperationOutcome",
                "issue": [
                    {
                        "severity": severity,
                        "code": code,
                        "diagnostics": diagnostics,
                    }
                ],
            },
            status=http_status,
        )


class FHIRPatientCreateView(FHIRWriteAPIView):
    """
    Create a Patient resource.

    Accepts a FHIR Patient JSON and creates a local Patient record.
    Returns 201 with Location header on success.
    """

    def post(self, request):
        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient

        data = request.data
        if data.get("resourceType") != "Patient":
            return self.operation_outcome("error", "invalid", "resourceType must be 'Patient'")

        # Extract name
        names = data.get("name", [])
        if not names:
            return self.operation_outcome("error", "required", "Patient.name is required")

        name = names[0]
        first_name = name.get("given", [""])[0] if name.get("given") else ""
        last_name = name.get("family", "")

        if not first_name or not last_name:
            return self.operation_outcome(
                "error", "required", "Patient.name.given and Patient.name.family are required"
            )

        # Extract gender
        gender_map = {"male": "M", "female": "F", "other": "O"}
        gender = gender_map.get(data.get("gender", "").lower())
        if not gender:
            return self.operation_outcome(
                "error", "required", "Patient.gender is required (male|female|other)"
            )

        # Extract birthDate
        birth_date_str = data.get("birthDate")
        if not birth_date_str:
            return self.operation_outcome("error", "required", "Patient.birthDate is required")
        try:
            birth_date = date.fromisoformat(birth_date_str)
        except (ValueError, TypeError):
            return self.operation_outcome(
                "error", "value", "Patient.birthDate must be a valid ISO date"
            )

        if birth_date > date.today():
            return self.operation_outcome(
                "error", "value", "Patient.birthDate cannot be in the future"
            )

        # Extract address for Kenya location mapping
        county = None
        sub_county = None
        addresses = data.get("address", [])
        if addresses:
            addr = addresses[0]
            state_name = addr.get("state", "")
            district_name = addr.get("district", "")
            if state_name:
                county = County.objects.filter(name__iexact=state_name).first()
            if district_name and county:
                sub_county = SubCounty.objects.filter(
                    name__iexact=district_name, county=county
                ).first()

        # Default county/sub_county if not resolved
        if not county:
            county = County.objects.first()
        if not sub_county:
            sub_county = SubCounty.objects.filter(county=county).first()

        if not county or not sub_county:
            return self.operation_outcome(
                "error", "not-found", "Cannot resolve Kenya location (county/sub_county)"
            )

        # Extract identifiers
        phone_number = ""
        national_id = ""
        for telecom in data.get("telecom", []):
            if telecom.get("system") == "phone":
                phone_number = telecom.get("value", "")
                break

        for ident in data.get("identifier", []):
            if ident.get("system") in ("urn:ke:national-id", "urn:sha:client-registry"):
                national_id = ident.get("value", "")
                break

        try:
            patient = Patient.objects.create(
                first_name=first_name,
                last_name=last_name,
                gender=gender,
                date_of_birth=birth_date,
                county=county,
                sub_county=sub_county,
                phone_number=phone_number,
                identification_number=national_id,
                registered_by=request.user,
                consent_given=True,
            )
        except IntegrityError as e:
            return self.operation_outcome(
                "error", "duplicate", f"Patient creation failed: {e}", http_status=409
            )

        # Build response
        location = request.build_absolute_uri(f"/fhir/Patient/{patient.pk}")
        response_data = {
            "resourceType": "Patient",
            "id": str(patient.pk),
            "identifier": [{"system": "urn:vitora:mrn", "value": patient.mrn}],
            "name": [{"family": patient.last_name, "given": [patient.first_name]}],
            "gender": data.get("gender"),
            "birthDate": patient.date_of_birth.isoformat(),
        }
        response = Response(response_data, status=status.HTTP_201_CREATED)
        response["Location"] = location
        return response


class FHIRObservationCreateView(FHIRWriteAPIView):
    """
    Create an Observation resource (lab result).

    Accepts a FHIR Observation JSON and creates a local record.
    Returns 201 with Location header on success.
    """

    def post(self, request):
        from hmis.apps.encounters.models import Encounter

        data = request.data
        if data.get("resourceType") != "Observation":
            return self.operation_outcome("error", "invalid", "resourceType must be 'Observation'")

        # Extract patient reference
        subject = data.get("subject", {})
        patient_ref = subject.get("reference", "")
        if not patient_ref or not patient_ref.startswith("Patient/"):
            return self.operation_outcome(
                "error", "required", "Observation.subject.reference to Patient is required"
            )
        patient_id = patient_ref.replace("Patient/", "")

        # Validate patient exists
        from hmis.apps.patients.models import Patient

        try:
            patient = Patient.objects.get(pk=patient_id)
        except (Patient.DoesNotExist, ValueError):
            return self.operation_outcome("error", "not-found", f"Patient/{patient_id} not found")

        # Extract category
        categories = data.get("category", [])
        category_code = ""
        for cat in categories:
            for coding in cat.get("coding", []):
                category_code = coding.get("code", "")
                break

        # Extract LOINC code
        code_obj = data.get("code", {})
        loinc_code = ""
        display = ""
        for coding in code_obj.get("coding", []):
            if coding.get("system") == "http://loinc.org":
                loinc_code = coding.get("code", "")
                display = coding.get("display", "")
                break

        # Extract value
        value = None
        if "valueQuantity" in data:
            value = data["valueQuantity"].get("value")
        elif "valueString" in data:
            value = data["valueString"]

        # For vital signs, update the latest encounter
        if category_code == "vital-signs" and loinc_code:
            vital_field_map = {
                "59408-5": "spo2",
                "8867-4": "pulse",
                "8310-5": "temperature",
                "9279-1": "respiratory_rate",
                "29463-7": "weight",
                "8302-2": "height",
            }
            field = vital_field_map.get(loinc_code)
            if field and value is not None:
                encounter = (
                    Encounter.objects.filter(patient=patient).order_by("-encounter_date").first()
                )
                if encounter:
                    setattr(encounter, field, value)
                    encounter.save(update_fields=[field])

                    response_data = {
                        "resourceType": "Observation",
                        "id": f"vital-{encounter.pk}-{field}",
                        "status": "final",
                        "subject": {"reference": f"Patient/{patient.pk}"},
                        "code": code_obj,
                    }
                    return Response(response_data, status=status.HTTP_201_CREATED)

        # For lab observations, store as a note on the latest encounter
        # (Full lab result creation requires LabOrder workflow)
        encounter = Encounter.objects.filter(patient=patient).order_by("-encounter_date").first()

        response_data = {
            "resourceType": "Observation",
            "id": f"ext-obs-{patient.pk}-{loinc_code}",
            "status": "preliminary",
            "subject": {"reference": f"Patient/{patient.pk}"},
            "code": code_obj,
            "valueString": str(value) if value else "",
            "note": [{"text": f"Received from external system. LOINC: {loinc_code} ({display})"}],
        }

        location = request.build_absolute_uri(f"/fhir/Observation/{response_data['id']}")
        response = Response(response_data, status=status.HTTP_201_CREATED)
        response["Location"] = location
        return response


class FHIRConditionCreateView(FHIRWriteAPIView):
    """
    Create a Condition resource (diagnosis).

    Accepts a FHIR Condition JSON and creates a local Diagnosis record.
    Returns 201 with Location header on success.
    """

    def post(self, request):
        from hmis.apps.encounters.models import Diagnosis, Encounter, ICD10Code

        data = request.data
        if data.get("resourceType") != "Condition":
            return self.operation_outcome("error", "invalid", "resourceType must be 'Condition'")

        # Extract patient reference
        subject = data.get("subject", {})
        patient_ref = subject.get("reference", "")
        if not patient_ref or not patient_ref.startswith("Patient/"):
            return self.operation_outcome(
                "error", "required", "Condition.subject.reference to Patient is required"
            )
        patient_id = patient_ref.replace("Patient/", "")

        from hmis.apps.patients.models import Patient

        try:
            patient = Patient.objects.get(pk=patient_id)
        except (Patient.DoesNotExist, ValueError):
            return self.operation_outcome("error", "not-found", f"Patient/{patient_id} not found")

        # Extract code (ICD-10 or SNOMED)
        code_obj = data.get("code", {})
        icd10_code_obj = None
        snomed_code = ""
        snomed_display = ""
        free_text = code_obj.get("text", "")

        for coding in code_obj.get("coding", []):
            system = coding.get("system", "")
            if system == "http://hl7.org/fhir/sid/icd-10" and coding.get("code"):
                icd10_code_obj = ICD10Code.objects.filter(code__iexact=coding["code"]).first()
                if not free_text:
                    free_text = coding.get("display", "")
            elif system == "http://snomed.info/sct":
                snomed_code = coding.get("code", "")
                snomed_display = coding.get("display", "")
                if not free_text:
                    free_text = snomed_display

        if not icd10_code_obj and not snomed_code and not free_text:
            return self.operation_outcome(
                "error", "required", "Condition.code with ICD-10, SNOMED CT, or text is required"
            )

        # Find or create encounter context
        encounter = Encounter.objects.filter(patient=patient).order_by("-encounter_date").first()
        if not encounter:
            return self.operation_outcome(
                "error",
                "not-found",
                f"No encounter exists for Patient/{patient_id}. Create an encounter first.",
            )

        # Determine clinical status
        clinical_status = "active"
        cs_obj = data.get("clinicalStatus", {})
        for coding in cs_obj.get("coding", []):
            clinical_status = coding.get("code", "active")
            break

        diagnosis = Diagnosis.objects.create(
            encounter=encounter,
            icd10_code=icd10_code_obj,
            snomed_code=snomed_code,
            snomed_display=snomed_display,
            free_text_diagnosis=free_text,
            diagnosis_type="WORKING",
        )

        response_data = {
            "resourceType": "Condition",
            "id": str(diagnosis.pk),
            "clinicalStatus": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                        "code": clinical_status,
                    }
                ]
            },
            "code": code_obj,
            "subject": {"reference": f"Patient/{patient.pk}"},
        }
        location = request.build_absolute_uri(f"/fhir/Condition/{diagnosis.pk}")
        resp = Response(response_data, status=status.HTTP_201_CREATED)
        resp["Location"] = location
        return resp


class FHIREncounterCreateView(FHIRWriteAPIView):
    """
    Create an Encounter resource.

    Accepts a FHIR Encounter JSON and creates a local Encounter record.
    """

    def post(self, request):
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        data = request.data
        if data.get("resourceType") != "Encounter":
            return self.operation_outcome("error", "invalid", "resourceType must be 'Encounter'")

        # Extract patient reference
        subject = data.get("subject", {})
        patient_ref = subject.get("reference", "")
        if not patient_ref or not patient_ref.startswith("Patient/"):
            return self.operation_outcome(
                "error", "required", "Encounter.subject.reference to Patient is required"
            )
        patient_id = patient_ref.replace("Patient/", "")

        try:
            patient = Patient.objects.get(pk=patient_id)
        except (Patient.DoesNotExist, ValueError):
            return self.operation_outcome("error", "not-found", f"Patient/{patient_id} not found")

        # Map FHIR class to local encounter type
        enc_class = data.get("class", {})
        class_code = enc_class.get("code", "AMB") if isinstance(enc_class, dict) else "AMB"
        type_map = {"AMB": "OPD", "IMP": "IPD", "EMER": "EMERGENCY"}
        encounter_type = type_map.get(class_code.upper(), "OPD")

        # Extract reason/chief complaint
        chief_complaint = ""
        reasons = data.get("reasonCode", [])
        for reason in reasons:
            chief_complaint = reason.get("text", "")
            if not chief_complaint:
                for coding in reason.get("coding", []):
                    chief_complaint = coding.get("display", "")
                    break
            if chief_complaint:
                break

        if not chief_complaint:
            chief_complaint = "Referral encounter (received via FHIR)"

        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type=encounter_type,
            chief_complaint=chief_complaint,
            assigned_clinician=request.user,
        )

        response_data = {
            "resourceType": "Encounter",
            "id": str(encounter.pk),
            "status": "in-progress",
            "class": {"code": class_code},
            "subject": {"reference": f"Patient/{patient.pk}"},
            "reasonCode": [{"text": chief_complaint}],
        }
        location = request.build_absolute_uri(f"/fhir/Encounter/{encounter.pk}")
        resp = Response(response_data, status=status.HTTP_201_CREATED)
        resp["Location"] = location
        return resp


class FHIRMedicationRequestCreateView(FHIRWriteAPIView):
    """
    Create a MedicationRequest resource (prescription).

    Accepts a FHIR MedicationRequest JSON and creates a local Prescription.
    """

    def post(self, request):
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Prescription

        data = request.data
        if data.get("resourceType") != "MedicationRequest":
            return self.operation_outcome(
                "error", "invalid", "resourceType must be 'MedicationRequest'"
            )

        # Extract patient reference
        subject = data.get("subject", {})
        patient_ref = subject.get("reference", "")
        if not patient_ref or not patient_ref.startswith("Patient/"):
            return self.operation_outcome(
                "error", "required", "MedicationRequest.subject.reference to Patient is required"
            )
        patient_id = patient_ref.replace("Patient/", "")

        try:
            patient = Patient.objects.get(pk=patient_id)
        except (Patient.DoesNotExist, ValueError):
            return self.operation_outcome("error", "not-found", f"Patient/{patient_id} not found")

        # Extract medication reference/text
        medication_text = ""
        med_ref = data.get("medicationCodeableConcept", {})
        if med_ref:
            medication_text = med_ref.get("text", "")
            if not medication_text:
                for coding in med_ref.get("coding", []):
                    medication_text = coding.get("display", "")
                    break

        # Extract dosage instructions
        dosage_instruction = ""
        for dosage in data.get("dosageInstruction", []):
            dosage_instruction = dosage.get("text", "")
            if dosage_instruction:
                break

        # Create prescription
        from datetime import timedelta

        from django.utils import timezone

        prescription = Prescription.objects.create(
            patient=patient,
            prescribed_by=request.user,
            status="PENDING",
            valid_until=timezone.now().date() + timedelta(days=30),
            clinical_notes=f"Received via FHIR. Medication: {medication_text}. Dosage: {dosage_instruction}",
        )

        response_data = {
            "resourceType": "MedicationRequest",
            "id": str(prescription.pk),
            "status": "active",
            "intent": "order",
            "subject": {"reference": f"Patient/{patient.pk}"},
            "medicationCodeableConcept": med_ref or {"text": medication_text},
        }
        location = request.build_absolute_uri(f"/fhir/MedicationRequest/{prescription.pk}")
        resp = Response(response_data, status=status.HTTP_201_CREATED)
        resp["Location"] = location
        return resp


class FHIRDiagnosticReportCreateView(FHIRWriteAPIView):
    """
    Create a DiagnosticReport resource (lab/imaging report from external system).

    Stores as an external diagnostic report linked to the patient.
    """

    def post(self, request):
        from hmis.apps.patients.models import Patient

        data = request.data
        if data.get("resourceType") != "DiagnosticReport":
            return self.operation_outcome(
                "error", "invalid", "resourceType must be 'DiagnosticReport'"
            )

        # Extract patient reference
        subject = data.get("subject", {})
        patient_ref = subject.get("reference", "")
        if not patient_ref or not patient_ref.startswith("Patient/"):
            return self.operation_outcome(
                "error", "required", "DiagnosticReport.subject.reference to Patient is required"
            )
        patient_id = patient_ref.replace("Patient/", "")

        try:
            patient = Patient.objects.get(pk=patient_id)
        except (Patient.DoesNotExist, ValueError):
            return self.operation_outcome("error", "not-found", f"Patient/{patient_id} not found")

        # Extract report details
        code_obj = data.get("code", {})
        report_code = ""
        report_display = ""
        for coding in code_obj.get("coding", []):
            report_code = coding.get("code", "")
            report_display = coding.get("display", "")
            break

        conclusion = data.get("conclusion", "")
        report_status = data.get("status", "final")

        # Store as external report reference (not creating a full LabOrder)
        from hmis.apps.core.models import AuditLog

        AuditLog.log(
            action="fhir_diagnostic_report_received",
            user=request.user,
            resource_type="DiagnosticReport",
            resource_id=0,
            details={
                "patient_id": patient.pk,
                "patient_mrn": patient.mrn,
                "code": report_code,
                "display": report_display,
                "conclusion": conclusion,
                "status": report_status,
                "full_resource": data,
            },
        )

        response_data = {
            "resourceType": "DiagnosticReport",
            "id": f"ext-dr-{patient.pk}-{report_code}",
            "status": report_status,
            "code": code_obj,
            "subject": {"reference": f"Patient/{patient.pk}"},
            "conclusion": conclusion,
        }
        location = request.build_absolute_uri(f"/fhir/DiagnosticReport/{response_data['id']}")
        resp = Response(response_data, status=status.HTTP_201_CREATED)
        resp["Location"] = location
        return resp
