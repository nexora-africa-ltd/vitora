# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
FHIR R4 Search Views for Vitora HMIS.

Implements FHIR R4 search endpoints returning Bundle (type=searchset).

Endpoints:
    GET /fhir/Patient?name=&identifier=&birthdate=&gender=
    GET /fhir/Observation?patient=&code=&date=&category=
    GET /fhir/Condition?patient=&code=&clinical-status=
    GET /fhir/MedicationStatement?patient=&status=
    GET /fhir/Encounter?patient=&date=&class=&status=
    GET /fhir/DiagnosticReport?patient=&code=&date=&status=

Reference: https://hl7.org/fhir/R4/search.html
"""

import logging
import re
from datetime import date
from urllib.parse import urlencode

from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.fhir.views import FHIR_RENDERER_CLASSES
from hmis.apps.core.permissions import ReadRequiresModelPermission

logger = logging.getLogger(__name__)

# FHIR date prefix regex: optional prefix (eq|ne|gt|lt|ge|le|sa|eb|ap) + ISO date
DATE_PREFIX_RE = re.compile(r"^(eq|ne|gt|lt|ge|le|sa|eb|ap)?(\d{4}(?:-\d{2}(?:-\d{2})?)?)$")


class FHIRSearchMixin:
    """
    Mixin providing common FHIR search utilities.

    Features:
        - Date prefix parsing (eq, ne, gt, lt, ge, le)
        - Pagination with Bundle next/prev links
        - Consistent Bundle response building
    """

    def parse_count_offset(self, request) -> tuple[int, int]:
        """Parse _count and _offset from query params with defaults."""
        count = min(int(request.query_params.get("_count", 20)), 100)
        offset = max(int(request.query_params.get("_offset", 0)), 0)
        return count, offset

    def parse_date_param(self, value: str) -> tuple[str, date | None]:
        """
        Parse a FHIR date search parameter with optional prefix.

        Args:
            value: Date string, optionally prefixed (e.g. "ge2020-01-01", "2020-01-01")

        Returns:
            Tuple of (prefix, parsed_date). Prefix defaults to "eq".
            Returns ("eq", None) if parsing fails.
        """
        if not value:
            return "eq", None

        match = DATE_PREFIX_RE.match(value)
        if not match:
            return "eq", None

        prefix = match.group(1) or "eq"
        date_str = match.group(2)

        try:
            parsed = date.fromisoformat(date_str)
            return prefix, parsed
        except (ValueError, TypeError):
            return "eq", None

    def apply_date_filter(self, queryset, field: str, value: str):
        """
        Apply a FHIR date prefix filter to a queryset.

        Supports: eq, ne, gt, lt, ge, le (sa→gt, eb→lt, ap→eq).
        """
        prefix, parsed_date = self.parse_date_param(value)
        if not parsed_date:
            return queryset

        lookup_map = {
            "eq": "",
            "ne": "__ne",  # handled specially
            "gt": "__gt",
            "lt": "__lt",
            "ge": "__gte",
            "le": "__lte",
            "sa": "__gt",
            "eb": "__lt",
            "ap": "",  # approximate = exact for date precision
        }

        if prefix == "ne":
            return queryset.exclude(**{field: parsed_date})

        suffix = lookup_map.get(prefix, "")
        return queryset.filter(**{f"{field}{suffix}": parsed_date})

    def build_bundle(self, entries: list, total: int, request, count: int, offset: int) -> dict:
        """Build a FHIR Bundle of type searchset with pagination links."""
        base_url = request.build_absolute_uri(request.path)
        params = dict(request.query_params)
        # Remove pagination params for link building
        params.pop("_count", None)
        params.pop("_offset", None)

        links = [{"relation": "self", "url": request.build_absolute_uri()}]

        # Next link
        if offset + count < total:
            next_params = {**{k: v[0] if isinstance(v, list) else v for k, v in params.items()}}
            next_params["_count"] = str(count)
            next_params["_offset"] = str(offset + count)
            links.append({"relation": "next", "url": f"{base_url}?{urlencode(next_params)}"})

        # Previous link
        if offset > 0:
            prev_offset = max(0, offset - count)
            prev_params = {**{k: v[0] if isinstance(v, list) else v for k, v in params.items()}}
            prev_params["_count"] = str(count)
            prev_params["_offset"] = str(prev_offset)
            links.append({"relation": "previous", "url": f"{base_url}?{urlencode(prev_params)}"})

        return {
            "resourceType": "Bundle",
            "type": "searchset",
            "total": total,
            "link": links,
            "entry": [{"fullUrl": entry.get("id", ""), "resource": entry} for entry in entries],
        }


class FHIRSearchAPIView(FHIRSearchMixin, APIView):
    """Base class for FHIR search endpoints (authenticated)."""

    permission_classes = [IsAuthenticated, ReadRequiresModelPermission]
    renderer_classes = FHIR_RENDERER_CLASSES


class FHIRPatientSearchView(FHIRSearchAPIView):
    """
    FHIR Patient search.

    Supports search parameters:
        - _id: Patient ID
        - identifier: MRN or national ID
        - name: First or last name (contains)
        - birthdate: Date of birth (supports prefixes: eq, ge, le, gt, lt)
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

        # birthdate (with prefix support)
        birthdate = request.query_params.get("birthdate")
        if birthdate:
            queryset = self.apply_date_filter(queryset, "date_of_birth", birthdate)

        # gender
        gender = request.query_params.get("gender")
        if gender:
            gender_map = {"male": "M", "female": "F", "other": "O"}
            mapped = gender_map.get(gender.lower(), gender.upper())
            queryset = queryset.filter(gender=mapped)

        # Pagination
        count, offset = self.parse_count_offset(request)

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

        return Response(self.build_bundle(entries, total, request, count, offset))


class FHIRObservationSearchView(FHIRSearchAPIView):
    """
    FHIR Observation search.

    Supports search parameters:
        - patient: Patient ID
        - code: LOINC code
        - date: Observation date (supports prefixes: eq, ge, le, gt, lt)
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

        count, offset = self.parse_count_offset(request)

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
                lab_qs = self.apply_date_filter(lab_qs, "verified_at__date", obs_date)

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
                enc_qs = self.apply_date_filter(enc_qs, "encounter_date", obs_date)

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

        return Response(self.build_bundle(entries, len(entries), request, count, offset))


class FHIRConditionSearchView(FHIRSearchAPIView):
    """
    FHIR Condition search.

    Supports search parameters:
        - patient: Patient ID
        - code: ICD-10 code
        - clinical-status: active | resolved
        - onset-date: Onset date (supports prefixes)
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
            queryset = queryset.filter(Q(icd10_code__code__iexact=code) | Q(snomed_code=code))

        clinical_status = request.query_params.get("clinical-status")
        if clinical_status:
            # Map to certainty field since Diagnosis doesn't have is_active
            if clinical_status == "active":
                queryset = queryset.filter(certainty__in=["confirmed", "provisional", "suspected"])
            elif clinical_status == "resolved":
                queryset = queryset.filter(certainty="ruled_out")

        onset_date = request.query_params.get("onset-date")
        if onset_date:
            queryset = self.apply_date_filter(queryset, "created_at__date", onset_date)

        count, offset = self.parse_count_offset(request)

        total = queryset.count()
        diagnoses = queryset[offset : offset + count]

        entries = []
        for dx in diagnoses:
            certainty = getattr(dx, "certainty", "confirmed")
            clinical = "active" if certainty != "ruled_out" else "resolved"

            resource = {
                "resourceType": "Condition",
                "id": str(dx.pk),
                "clinicalStatus": {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                            "code": clinical,
                        }
                    ]
                },
                "verificationStatus": {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                            "code": certainty if certainty else "confirmed",
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

        return Response(self.build_bundle(entries, total, request, count, offset))


class FHIRMedicationStatementSearchView(FHIRSearchAPIView):
    """
    FHIR MedicationStatement search.

    Supports search parameters:
        - patient: Patient ID
        - status: active | completed | stopped
        - effective: Date prescribed (supports prefixes)
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
                "active": ["ACTIVE", "ORDERED", "PENDING"],
                "completed": ["DISPENSED", "COMPLETED"],
                "stopped": ["CANCELLED"],
            }
            statuses = status_map.get(status_param.lower(), [status_param.upper()])
            queryset = queryset.filter(status__in=statuses)

        effective = request.query_params.get("effective")
        if effective:
            queryset = self.apply_date_filter(queryset, "prescribed_at__date", effective)

        count, offset = self.parse_count_offset(request)

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

        return Response(self.build_bundle(entries, total, request, count, offset))


class FHIREncounterSearchView(FHIRSearchAPIView):
    """
    FHIR Encounter search.

    Supports search parameters:
        - patient: Patient ID
        - date: Encounter date (supports prefixes: eq, ge, le, gt, lt)
        - class: AMB | IMP | EMER
        - status: in-progress | finished | cancelled
        - _count / _offset: Pagination
    """

    def get(self, request):
        from hmis.apps.encounters.models import Encounter

        queryset = Encounter.objects.select_related("patient")

        patient_id = request.query_params.get("patient")
        if patient_id:
            queryset = queryset.filter(patient_id=patient_id)

        enc_date = request.query_params.get("date")
        if enc_date:
            queryset = self.apply_date_filter(queryset, "encounter_date", enc_date)

        enc_class = request.query_params.get("class")
        if enc_class:
            class_map = {"AMB": "OPD", "IMP": "IPD", "EMER": "EMERGENCY"}
            mapped = class_map.get(enc_class.upper(), enc_class.upper())
            queryset = queryset.filter(encounter_type=mapped)

        enc_status = request.query_params.get("status")
        if enc_status:
            status_map = {
                "in-progress": ["IN_PROGRESS", "ACTIVE"],
                "finished": ["COMPLETED", "DISCHARGED"],
                "cancelled": ["CANCELLED"],
                "planned": ["SCHEDULED"],
            }
            statuses = status_map.get(enc_status.lower(), [enc_status.upper()])
            queryset = queryset.filter(status__in=statuses)

        count, offset = self.parse_count_offset(request)

        total = queryset.count()
        encounters = queryset.order_by("-encounter_date")[offset : offset + count]

        entries = []
        for enc in encounters:
            type_to_class = {"OPD": "AMB", "IPD": "IMP", "EMERGENCY": "EMER"}
            fhir_class = type_to_class.get(enc.encounter_type, "AMB")

            # Map local status to FHIR status
            local_status = getattr(enc, "status", "IN_PROGRESS")
            fhir_status = "in-progress"
            if local_status in ("COMPLETED", "DISCHARGED"):
                fhir_status = "finished"
            elif local_status == "CANCELLED":
                fhir_status = "cancelled"

            resource = {
                "resourceType": "Encounter",
                "id": str(enc.pk),
                "status": fhir_status,
                "class": {
                    "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                    "code": fhir_class,
                },
                "subject": {"reference": f"Patient/{enc.patient_id}"},
                "period": {
                    "start": enc.encounter_date.isoformat() if enc.encounter_date else None,
                },
                "reasonCode": [{"text": enc.chief_complaint}] if enc.chief_complaint else [],
            }
            entries.append(resource)

        return Response(self.build_bundle(entries, total, request, count, offset))


class FHIRDiagnosticReportSearchView(FHIRSearchAPIView):
    """
    FHIR DiagnosticReport search.

    Supports search parameters:
        - patient: Patient ID
        - code: LOINC code of the report
        - date: Report date (supports prefixes)
        - status: registered | partial | preliminary | final
        - _count / _offset: Pagination
    """

    def get(self, request):
        from hmis.apps.laboratory.models import DiagnosticReport

        queryset = DiagnosticReport.objects.select_related("lab_order__patient", "lab_order")

        patient_id = request.query_params.get("patient")
        if patient_id:
            queryset = queryset.filter(lab_order__patient_id=patient_id)

        code = request.query_params.get("code")
        if code:
            queryset = queryset.filter(lab_order__items__test__loinc_code=code).distinct()

        report_date = request.query_params.get("date")
        if report_date:
            queryset = self.apply_date_filter(queryset, "issued_at__date", report_date)

        status_param = request.query_params.get("status")
        if status_param:
            # Map FHIR status to local status
            status_map = {
                "registered": ["DRAFT"],
                "partial": ["PARTIAL"],
                "preliminary": ["PRELIMINARY"],
                "final": ["FINAL", "RELEASED"],
                "amended": ["AMENDED"],
                "cancelled": ["CANCELLED"],
            }
            statuses = status_map.get(status_param.lower(), [status_param.upper()])
            queryset = queryset.filter(status__in=statuses)

        count, offset = self.parse_count_offset(request)

        total = queryset.count()
        reports = queryset.order_by("-issued_at")[offset : offset + count]

        entries = []
        for report in reports:
            # Map local status to FHIR
            local_status = getattr(report, "status", "FINAL")
            fhir_status = "final"
            status_reverse_map = {
                "DRAFT": "registered",
                "PARTIAL": "partial",
                "PRELIMINARY": "preliminary",
                "FINAL": "final",
                "RELEASED": "final",
                "AMENDED": "amended",
                "CANCELLED": "cancelled",
            }
            fhir_status = status_reverse_map.get(local_status, "final")

            resource = {
                "resourceType": "DiagnosticReport",
                "id": str(report.pk),
                "status": fhir_status,
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": getattr(report, "report_number", "") or "",
                            "display": getattr(report, "conclusion", "")[:100] or "",
                        }
                    ]
                },
                "subject": {
                    "reference": f"Patient/{report.lab_order.patient_id}"
                    if report.lab_order
                    else None
                },
                "issued": report.issued_at.isoformat()
                if hasattr(report, "issued_at") and report.issued_at
                else None,
                "conclusion": getattr(report, "conclusion", "") or "",
            }
            entries.append(resource)

        return Response(self.build_bundle(entries, total, request, count, offset))
