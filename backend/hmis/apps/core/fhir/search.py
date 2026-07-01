# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
FHIR R4 Search Views for Vitora HMIS.

Implements FHIR R4 search endpoints returning Bundle (type=searchset).

Endpoints:
    GET /fhir/Patient?name=&identifier=&birthdate=&gender=
    GET /fhir/Observation?patient=&code=&date=&category=
    GET /fhir/Condition?patient=&code=&clinical-status=
    GET /fhir/MedicationStatement?patient=&status=

Reference: https://hl7.org/fhir/R4/search.html
"""

import contextlib
import logging
from datetime import date

from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.fhir.views import FHIR_RENDERER_CLASSES

logger = logging.getLogger(__name__)


class FHIRSearchAPIView(APIView):
    """Base class for FHIR search endpoints (authenticated)."""

    permission_classes = [IsAuthenticated]
    renderer_classes = FHIR_RENDERER_CLASSES

    def build_bundle(self, entries: list, total: int, request) -> dict:
        """Build a FHIR Bundle of type searchset."""
        return {
            "resourceType": "Bundle",
            "type": "searchset",
            "total": total,
            "link": [
                {
                    "relation": "self",
                    "url": request.build_absolute_uri(),
                }
            ],
            "entry": [{"fullUrl": entry.get("id", ""), "resource": entry} for entry in entries],
        }


class FHIRPatientSearchView(FHIRSearchAPIView):
    """
    FHIR Patient search.

    Supports search parameters:
        - _id: Patient ID
        - identifier: MRN or national ID
        - name: First or last name (contains)
        - birthdate: Date of birth (exact or prefix)
        - gender: male | female | other
        - _count: Page size (default 20, max 100)
        - _offset: Pagination offset
    """

    def get(self, request):
        from hmis.apps.patients.models import Patient

        queryset = Patient.objects.select_related("county", "sub_county", "ward")

        # _id
        _id = request.query_params.get("_id")
        if _id:
            queryset = queryset.filter(pk=_id)

        # identifier (MRN or national_id)
        identifier = request.query_params.get("identifier")
        if identifier:
            queryset = queryset.filter(
                Q(mrn__iexact=identifier) | Q(identification_number__icontains=identifier)
            )

        # name (first or last)
        name = request.query_params.get("name")
        if name:
            queryset = queryset.filter(Q(first_name__icontains=name) | Q(last_name__icontains=name))

        # birthdate
        birthdate = request.query_params.get("birthdate")
        if birthdate:
            try:
                bd = date.fromisoformat(birthdate)
                queryset = queryset.filter(date_of_birth=bd)
            except (ValueError, TypeError):
                pass

        # gender
        gender = request.query_params.get("gender")
        if gender:
            gender_map = {"male": "M", "female": "F", "other": "O"}
            mapped = gender_map.get(gender.lower(), gender.upper())
            queryset = queryset.filter(gender=mapped)

        # Pagination
        count = min(int(request.query_params.get("_count", 20)), 100)
        offset = int(request.query_params.get("_offset", 0))

        total = queryset.count()
        patients = queryset[offset : offset + count]

        entries = []
        for p in patients:
            gender_display_map = {"M": "male", "F": "female", "O": "other"}
            resource = {
                "resourceType": "Patient",
                "id": str(p.pk),
                "identifier": [
                    {
                        "system": "urn:vitora:mrn",
                        "value": p.mrn,
                    }
                ],
                "name": [
                    {
                        "use": "official",
                        "family": p.last_name,
                        "given": [p.first_name],
                    }
                ],
                "gender": gender_display_map.get(p.gender, "unknown"),
                "birthDate": p.date_of_birth.isoformat() if p.date_of_birth else None,
            }
            if p.county:
                resource["address"] = [
                    {
                        "state": p.county.name if p.county else None,
                        "district": p.sub_county.name if p.sub_county else None,
                    }
                ]
            entries.append(resource)

        return Response(self.build_bundle(entries, total, request))


class FHIRObservationSearchView(FHIRSearchAPIView):
    """
    FHIR Observation search.

    Supports search parameters:
        - patient: Patient ID
        - code: LOINC code
        - date: Observation date
        - category: vital-signs | laboratory | social-history
        - _count / _offset: Pagination
    """

    def get(self, request):
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.laboratory.models import LabResult

        entries = []
        patient_id = request.query_params.get("patient")
        code = request.query_params.get("code")
        category = request.query_params.get("category")
        obs_date = request.query_params.get("date")

        count = min(int(request.query_params.get("_count", 20)), 100)
        offset = int(request.query_params.get("_offset", 0))

        # Lab results as Observations
        if category in (None, "laboratory"):
            lab_qs = LabResult.objects.select_related(
                "order_item__test", "order_item__lab_order__patient"
            )
            if patient_id:
                lab_qs = lab_qs.filter(order_item__lab_order__patient_id=patient_id)
            if code:
                lab_qs = lab_qs.filter(order_item__test__loinc_code=code)
            if obs_date:
                with contextlib.suppress(ValueError, TypeError):
                    lab_qs = lab_qs.filter(verified_at__date=date.fromisoformat(obs_date))

            for result in lab_qs[offset : offset + count]:
                loinc = ""
                display = ""
                if hasattr(result, "order_item") and result.order_item:
                    catalog = getattr(result.order_item, "test", None)
                    if catalog:
                        loinc = getattr(catalog, "loinc_code", "") or ""
                        display = getattr(catalog, "name", "") or ""

                resource = {
                    "resourceType": "Observation",
                    "id": f"lab-{result.pk}",
                    "status": "final",
                    "category": [
                        {
                            "coding": [
                                {
                                    "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                                    "code": "laboratory",
                                }
                            ]
                        }
                    ],
                    "code": {
                        "coding": [
                            {
                                "system": "http://loinc.org",
                                "code": loinc,
                                "display": display,
                            }
                        ]
                    },
                    "valueString": str(result.value) if hasattr(result, "value") else "",
                }
                entries.append(resource)

        # Vitals as Observations
        if category in (None, "vital-signs"):
            enc_qs = Encounter.objects.all()
            if patient_id:
                enc_qs = enc_qs.filter(patient_id=patient_id)
            if obs_date:
                with contextlib.suppress(ValueError, TypeError):
                    enc_qs = enc_qs.filter(encounter_date=date.fromisoformat(obs_date))

            vital_codes = {
                "spo2": ("59408-5", "Oxygen saturation"),
                "pulse": ("8867-4", "Heart rate"),
                "temperature": ("8310-5", "Body temperature"),
                "respiratory_rate": ("9279-1", "Respiratory rate"),
                "weight": ("29463-7", "Body weight"),
                "height": ("8302-2", "Body height"),
            }

            if code:
                vital_codes = {k: v for k, v in vital_codes.items() if v[0] == code}

            for enc in enc_qs[offset : offset + count]:
                for field, (loinc_code, display) in vital_codes.items():
                    value = getattr(enc, field, None)
                    if value is not None:
                        resource = {
                            "resourceType": "Observation",
                            "id": f"vital-{enc.pk}-{field}",
                            "status": "final",
                            "category": [
                                {
                                    "coding": [
                                        {
                                            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                                            "code": "vital-signs",
                                        }
                                    ]
                                }
                            ],
                            "code": {
                                "coding": [
                                    {
                                        "system": "http://loinc.org",
                                        "code": loinc_code,
                                        "display": display,
                                    }
                                ]
                            },
                            "effectiveDateTime": enc.encounter_date.isoformat()
                            if enc.encounter_date
                            else None,
                            "valueQuantity": {"value": float(value)},
                            "subject": {"reference": f"Patient/{enc.patient_id}"},
                        }
                        entries.append(resource)

        return Response(self.build_bundle(entries, len(entries), request))


class FHIRConditionSearchView(FHIRSearchAPIView):
    """
    FHIR Condition search.

    Supports search parameters:
        - patient: Patient ID
        - code: ICD-10 code
        - clinical-status: active | resolved
        - _count / _offset: Pagination
    """

    def get(self, request):
        from hmis.apps.encounters.models import Diagnosis

        queryset = Diagnosis.objects.select_related("encounter__patient", "icd10_code")

        patient_id = request.query_params.get("patient")
        if patient_id:
            queryset = queryset.filter(encounter__patient_id=patient_id)

        code = request.query_params.get("code")
        if code:
            queryset = queryset.filter(icd10_code__code__iexact=code)

        clinical_status = request.query_params.get("clinical-status")
        if clinical_status:
            if clinical_status == "active":
                queryset = queryset.filter(is_active=True)
            elif clinical_status == "resolved":
                queryset = queryset.filter(is_active=False)

        count = min(int(request.query_params.get("_count", 20)), 100)
        offset = int(request.query_params.get("_offset", 0))

        total = queryset.count()
        diagnoses = queryset[offset : offset + count]

        entries = []
        for dx in diagnoses:
            resource = {
                "resourceType": "Condition",
                "id": str(dx.pk),
                "clinicalStatus": {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                            "code": "active" if getattr(dx, "is_active", True) else "resolved",
                        }
                    ]
                },
                "code": {
                    "coding": [],
                    "text": getattr(dx, "free_text_diagnosis", "") or "",
                },
                "subject": {
                    "reference": f"Patient/{dx.encounter.patient_id}" if dx.encounter else None
                },
            }
            if dx.icd10_code:
                resource["code"]["coding"].append(
                    {
                        "system": "http://hl7.org/fhir/sid/icd-10",
                        "code": dx.icd10_code.code,
                        "display": dx.icd10_code.description
                        if hasattr(dx.icd10_code, "description")
                        else str(dx.icd10_code),
                    }
                )
            if getattr(dx, "snomed_code", None):
                resource["code"]["coding"].append(
                    {
                        "system": "http://snomed.info/sct",
                        "code": dx.snomed_code,
                        "display": getattr(dx, "snomed_display", ""),
                    }
                )
            entries.append(resource)

        return Response(self.build_bundle(entries, total, request))


class FHIRMedicationStatementSearchView(FHIRSearchAPIView):
    """
    FHIR MedicationStatement search.

    Supports search parameters:
        - patient: Patient ID
        - status: active | completed | stopped
        - _count / _offset: Pagination
    """

    def get(self, request):
        from hmis.apps.pharmacy.models import Prescription

        queryset = Prescription.objects.select_related("patient")

        patient_id = request.query_params.get("patient")
        if patient_id:
            queryset = queryset.filter(patient_id=patient_id)

        status_param = request.query_params.get("status")
        if status_param:
            status_map = {
                "active": ["ACTIVE", "ORDERED"],
                "completed": ["DISPENSED", "COMPLETED"],
                "stopped": ["CANCELLED"],
            }
            statuses = status_map.get(status_param.lower(), [status_param.upper()])
            queryset = queryset.filter(status__in=statuses)

        count = min(int(request.query_params.get("_count", 20)), 100)
        offset = int(request.query_params.get("_offset", 0))

        total = queryset.count()
        prescriptions = queryset[offset : offset + count]

        entries = []
        for rx in prescriptions:
            fhir_status = "active"
            rx_status = getattr(rx, "status", "")
            if rx_status in ("DISPENSED", "COMPLETED"):
                fhir_status = "completed"
            elif rx_status == "CANCELLED":
                fhir_status = "stopped"

            resource = {
                "resourceType": "MedicationStatement",
                "id": str(rx.pk),
                "status": fhir_status,
                "subject": {"reference": f"Patient/{rx.patient_id}"},
                "dateAsserted": rx.created_at.isoformat()
                if hasattr(rx, "created_at") and rx.created_at
                else None,
            }
            entries.append(resource)

        return Response(self.build_bundle(entries, total, request))
