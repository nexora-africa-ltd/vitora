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
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.fhir.tenant import (
    fhir_facility_create_tenant_kwargs,
    fhir_patient_create_tenant_kwargs,
    scope_fhir_queryset,
)
from hmis.apps.core.fhir.views import FHIR_RENDERER_CLASSES, FHIRSchemaMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.oauth.permissions import (
    SMARTPatientAccessPermission,
    SMARTScopePermission,
    is_patient_context_allowed,
)
from hmis.apps.core.permissions import (
    FHIRAccessPermission,
    ReadRequiresModelPermission,
    get_client_ip,
)

logger = logging.getLogger(__name__)


class FHIRWriteAPIView(FHIRSchemaMixin, APIView):
    """Base class for FHIR write endpoints (authenticated)."""

    permission_classes = [
        IsAuthenticated,
        SMARTScopePermission,
        SMARTPatientAccessPermission,
        FHIRAccessPermission,
        ReadRequiresModelPermission,
    ]
    renderer_classes = FHIR_RENDERER_CLASSES

    def initial(self, request, *args, **kwargs):
        """Reject patient-scoped writes that target another patient or no patient."""
        super().initial(request, *args, **kwargs)
        access_token = getattr(request, "access_token", None)
        scopes = (getattr(access_token, "scope", "") or "").split()
        patient_only = (
            access_token
            and any(scope.startswith("patient/") for scope in scopes)
            and not any(scope.startswith(("user/", "system/")) for scope in scopes)
        )
        if not patient_only:
            return

        reference = (
            request.data.get("subject", {}).get("reference")
            or request.data.get("patient", {}).get("reference")
            or ""
        )
        if not reference.startswith("Patient/"):
            raise PermissionDenied(
                "Patient-scoped SMART writes require the launch patient reference."
            )
        if not is_patient_context_allowed(request, reference.removeprefix("Patient/")):
            raise PermissionDenied("Access denied to patient data outside your authorized context.")

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
                **fhir_patient_create_tenant_kwargs(request),
            )
        except IntegrityError as e:
            return self.operation_outcome(
                "error", "duplicate", f"Patient creation failed: {e}", http_status=409
            )

        AuditLog.log(
            action="patient_create",
            user=request.user,
            resource_type="Patient",
            resource_id=patient.id,
            patient_id=patient.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={
                "source": "fhir",
                "patient_mrn": patient.mrn,
                "registered_by": request.user.username,
            },
            request=request,
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
            patient = scope_fhir_queryset(request, Patient.objects).get(pk=patient_id)
        except (Patient.DoesNotExist, ValueError):
            return self.operation_outcome("error", "not-found", f"Patient/{patient_id} not found")
        try:
            tenant_kwargs = fhir_facility_create_tenant_kwargs(request)
        except PermissionDenied:
            return self.operation_outcome(
                "error",
                "forbidden",
                "FHIR Observation writes require a facility-bound tenant context",
                403,
            )

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

        if category_code == "laboratory":
            from hmis.apps.laboratory.models import LabOrder, LabOrderItem, LabResult, TestCatalog

            if not loinc_code:
                return self.operation_outcome(
                    "error", "required", "Laboratory Observation.code requires a LOINC coding"
                )
            if value is None:
                return self.operation_outcome(
                    "error",
                    "required",
                    "Laboratory Observation requires valueQuantity or valueString",
                )
            encounter_ref = data.get("encounter", {}).get("reference", "")
            try:
                if encounter_ref.startswith("Encounter/"):
                    encounter = scope_fhir_queryset(request, Encounter.objects).get(
                        pk=encounter_ref.removeprefix("Encounter/"),
                        patient=patient,
                        facility=tenant_kwargs["facility"],
                    )
                else:
                    encounter = (
                        scope_fhir_queryset(request, Encounter.objects)
                        .filter(patient=patient, facility=tenant_kwargs["facility"])
                        .order_by("-encounter_date")
                        .first()
                    )
            except (Encounter.DoesNotExist, ValueError):
                encounter = None
            if not encounter:
                return self.operation_outcome(
                    "error",
                    "not-found",
                    "A facility-scoped Encounter is required for laboratory Observation",
                )
            test = TestCatalog.objects.filter(
                facility=tenant_kwargs["facility"], loinc_code=loinc_code, is_active=True
            ).first()
            if not test:
                return self.operation_outcome(
                    "error",
                    "not-found",
                    f"No active facility test catalog mapping exists for LOINC {loinc_code}",
                )
            quantity = data.get("valueQuantity", {})
            numeric_value = None
            if "valueQuantity" in data:
                try:
                    numeric_value = Decimal(str(value))
                except (InvalidOperation, TypeError, ValueError):
                    return self.operation_outcome(
                        "error", "value", "Observation.valueQuantity.value must be numeric"
                    )
            interpretation_code = next(
                (
                    coding.get("code", "")
                    for item in data.get("interpretation", [])
                    for coding in item.get("coding", [])
                    if coding.get("code")
                ),
                "",
            )
            flag_map = {
                "N": "NORMAL",
                "L": "LOW",
                "H": "HIGH",
                "LL": "CRITICAL_LOW",
                "HH": "CRITICAL_HIGH",
                "A": "ABNORMAL",
                "POS": "POSITIVE",
                "NEG": "NEGATIVE",
            }
            order = LabOrder.objects.create(
                patient=patient,
                billing_patient=patient,
                encounter=encounter,
                ordered_by=request.user,
                status="COMPLETED",
                order_type="EXTERNAL",
                external_lab="FHIR external system",
                clinical_notes="Received via facility-scoped FHIR semantic exchange.",
                bill_patient=False,
                **tenant_kwargs,
            )
            item = LabOrderItem.objects.create(
                lab_order=order, test=test, status="COMPLETED", unit_cost=test.cost
            )
            result = LabResult.objects.create(
                order_item=item,
                numeric_value=numeric_value,
                text_value="" if numeric_value is not None else str(value),
                result_unit=quantity.get("unit", "") or test.result_unit,
                reference_range_text=(
                    data.get("referenceRange", [{}])[0].get("text", "")
                    if data.get("referenceRange")
                    else ""
                ),
                result_flag=flag_map.get(interpretation_code, ""),
                is_critical_result=flag_map.get(interpretation_code, "").startswith("CRITICAL_"),
                entered_by=request.user,
                verification_status="VERIFIED",
                verified_by=request.user,
                result_loinc_code=loinc_code,
                result_loinc_system="http://loinc.org",
                is_external_result=True,
            )
            from hmis.apps.core.fhir.views_observation_condition import FHIRObservationView

            response = Response(
                FHIRObservationView()._lab_result_to_fhir(result, request),
                status=status.HTTP_201_CREATED,
            )
            response["Location"] = request.build_absolute_uri(f"/fhir/Observation/{result.pk}")
            return response

        # For non-laboratory Observations, retain the lightweight external-note response.
        encounter = (
            scope_fhir_queryset(request, Encounter.objects)
            .filter(patient=patient, facility=tenant_kwargs["facility"])
            .order_by("-encounter_date")
            .first()
        )

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
            patient = scope_fhir_queryset(request, Patient.objects).get(pk=patient_id)
        except (Patient.DoesNotExist, ValueError):
            return self.operation_outcome("error", "not-found", f"Patient/{patient_id} not found")
        try:
            tenant_kwargs = fhir_facility_create_tenant_kwargs(request)
        except PermissionDenied:
            return self.operation_outcome(
                "error",
                "forbidden",
                "FHIR Condition writes require a facility-bound tenant context",
                403,
            )

        # Extract code (ICD-10 or SNOMED)
        code_obj = data.get("code", {})
        icd10_code_obj = None
        icd11_code = ""
        icd11_display = ""
        snomed_code = ""
        snomed_display = ""
        free_text = code_obj.get("text", "")

        for coding in code_obj.get("coding", []):
            system = coding.get("system", "")
            if system == "http://hl7.org/fhir/sid/icd-10" and coding.get("code"):
                icd10_code_obj = ICD10Code.objects.filter(code__iexact=coding["code"]).first()
                if not free_text:
                    free_text = coding.get("display", "")
            elif system == "http://id.who.int/icd/release/11/mms" and coding.get("code"):
                icd11_code = coding["code"]
                icd11_display = coding.get("display", "")
                if not free_text:
                    free_text = icd11_display
            elif system == "http://snomed.info/sct":
                snomed_code = coding.get("code", "")
                snomed_display = coding.get("display", "")
                if not free_text:
                    free_text = snomed_display

        if not icd10_code_obj and not icd11_code and not snomed_code and not free_text:
            return self.operation_outcome(
                "error",
                "required",
                "Condition.code with ICD-10, ICD-11, SNOMED CT, or text is required",
            )

        # Find or create encounter context
        encounter = (
            scope_fhir_queryset(request, Encounter.objects)
            .filter(patient=patient, facility=tenant_kwargs["facility"])
            .order_by("-encounter_date")
            .first()
        )
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
            icd11_code=icd11_code,
            icd11_display=icd11_display,
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


class FHIRProcedureCreateView(FHIRWriteAPIView):
    """Create a facility-scoped ProcedureOrder from a coded FHIR Procedure."""

    def post(self, request):
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.procedures.models import ProcedureCatalog, ProcedureOrder

        data = request.data
        if data.get("resourceType") != "Procedure":
            return self.operation_outcome("error", "invalid", "resourceType must be 'Procedure'")

        patient_ref = data.get("subject", {}).get("reference", "")
        if not patient_ref.startswith("Patient/"):
            return self.operation_outcome(
                "error", "required", "Procedure.subject.reference to Patient is required"
            )
        try:
            patient = scope_fhir_queryset(request, Patient.objects).get(
                pk=patient_ref.removeprefix("Patient/")
            )
            tenant_kwargs = fhir_facility_create_tenant_kwargs(request)
        except (Patient.DoesNotExist, ValueError):
            return self.operation_outcome("error", "not-found", f"{patient_ref} not found")

        encounter_ref = data.get("encounter", {}).get("reference", "")
        if not encounter_ref.startswith("Encounter/"):
            return self.operation_outcome(
                "error", "required", "Procedure.encounter.reference to Encounter is required"
            )
        try:
            encounter = scope_fhir_queryset(request, Encounter.objects).get(
                pk=encounter_ref.removeprefix("Encounter/"),
                patient=patient,
                facility=tenant_kwargs["facility"],
            )
        except (Encounter.DoesNotExist, ValueError):
            return self.operation_outcome("error", "not-found", f"{encounter_ref} not found")

        procedure_code = ""
        coding_system = ""
        for coding in data.get("code", {}).get("coding", []):
            if coding.get("code"):
                procedure_code = coding["code"]
                coding_system = coding.get("system", "")
                break
        if not procedure_code:
            return self.operation_outcome("error", "required", "Procedure.code.coding is required")

        catalog_qs = ProcedureCatalog.objects.filter(
            facility=tenant_kwargs["facility"], is_active=True
        )
        if coding_system == "http://id.who.int/ichi":
            catalog = catalog_qs.filter(ichi_code=procedure_code).first()
        elif coding_system == "http://www.ama-assn.org/go/cpt":
            catalog = catalog_qs.filter(cpt_code=procedure_code).first()
        elif coding_system == "http://www.cms.gov/Medicare/Coding/ICD10":
            catalog = catalog_qs.filter(icd10_pcs_code=procedure_code).first()
        else:
            catalog = catalog_qs.filter(code=procedure_code).first()
        if not catalog:
            return self.operation_outcome(
                "error",
                "not-found",
                "No active facility procedure catalog mapping exists for Procedure.code",
            )

        reason_codes = data.get("reasonCode", [])
        indication = next((item.get("text", "") for item in reason_codes if item.get("text")), "")
        order = ProcedureOrder.objects.create(
            procedure=catalog,
            patient=patient,
            encounter=encounter,
            indication=indication or "Received from external FHIR system",
            ordered_by=request.user,
            status=(
                ProcedureOrder.Status.COMPLETED
                if data.get("status") == "completed"
                else ProcedureOrder.Status.ORDERED
            ),
            **tenant_kwargs,
        )
        from hmis.apps.core.fhir.views_clinical_resources import FHIRProcedureView

        response = Response(
            FHIRProcedureView()._to_fhir_procedure(order), status=status.HTTP_201_CREATED
        )
        response["Location"] = request.build_absolute_uri(f"/fhir/Procedure/{order.pk}")
        return response


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
            patient = scope_fhir_queryset(request, Patient.objects).get(pk=patient_id)
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
            **fhir_facility_create_tenant_kwargs(request),
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
            patient = scope_fhir_queryset(request, Patient.objects).get(pk=patient_id)
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
            **fhir_facility_create_tenant_kwargs(request),
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
            patient = scope_fhir_queryset(request, Patient.objects).get(pk=patient_id)
        except (Patient.DoesNotExist, ValueError):
            return self.operation_outcome("error", "not-found", f"Patient/{patient_id} not found")

        # Extract report details
        code_obj = data.get("code", {})
        if not isinstance(code_obj, dict) or not code_obj:
            return self.operation_outcome(
                "error",
                "required",
                "DiagnosticReport.code is required",
            )
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
