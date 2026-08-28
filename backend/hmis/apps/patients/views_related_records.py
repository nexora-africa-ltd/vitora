# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002
"""Patients views related records for Vitora HMIS.

What this file is for:
- Implement views related records logic for the patients domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import NestedTenantScopeMixin, ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import (
    ReadRequiresModelPermission,
    WriteRequiresRolePermission,
    get_client_ip,
)
from hmis.apps.patients.views_patient import *  # noqa: F403

from .models import Allergy, DeathRecord, EmergencyContact, Patient
from .serializers import (
    AllergyListSerializer,
    AllergySerializer,
    DeathRecordCertifySerializer,
    DeathRecordCreateSerializer,
    DeathRecordDetailSerializer,
    DeathRecordListSerializer,
    DeathRecordReleaseBodySerializer,
    DeathRecordVoidSerializer,
    EmergencyContactSerializer,
)


class EmergencyContactViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for EmergencyContact model.

    Provides CRUD operations for emergency contacts nested under patients.
    URL pattern: /api/patients/{patient_id}/emergency-contacts/
    """

    serializer_class = EmergencyContactSerializer
    queryset = EmergencyContact.objects.all()
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    tenant_facility_chain = "patient__registered_at_facility"
    tenant_org_chain = "patient__organization"

    def get_queryset(self):
        """Get emergency contacts for a specific patient, scoped by tenant."""
        qs = super().get_queryset()
        patient_id = self.kwargs.get("patient_pk")
        return qs.filter(patient_id=patient_id)

    def get_patient(self):
        """Get the patient from URL kwargs."""
        patient_id = self.kwargs.get("patient_pk")
        return get_object_or_404(Patient, pk=patient_id)

    def create(self, request, *args, **kwargs):
        """Create an emergency contact for the patient."""
        patient = self.get_patient()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(patient=patient)

        # Log the action
        AuditLog.log(
            action="emergency_contact_create",
            user=request.user,
            resource_type="EmergencyContact",
            resource_id=serializer.instance.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=patient.id,
            details={
                "patient_mrn": patient.mrn,
                "contact_name": serializer.instance.full_name,
            },
        )

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        """Delete an emergency contact with audit logging."""
        instance = self.get_object()
        patient = instance.patient
        contact_name = instance.full_name

        response = super().destroy(request, *args, **kwargs)

        # Log the deletion
        AuditLog.log(
            action="emergency_contact_delete",
            user=request.user,
            resource_type="EmergencyContact",
            resource_id=instance.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=patient.id,
            details={
                "patient_mrn": patient.mrn,
                "contact_name": contact_name,
            },
        )

        return response


class AllergyViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for Allergy model.

    Provides CRUD operations for patient allergies with:
    - Automatic audit logging
    - Filtering by patient, substance type, severity, status
    - Drug-allergy interaction checking
    - Nested under patient or standalone access

    URL patterns:
    - /api/patients/{patient_id}/allergies/  (nested)
    - /api/allergies/  (standalone)
    """

    tenant_scope = "organization"  # Allergies are org-scoped (shared medical history)

    serializer_class = AllergySerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["patient", "substance_type", "severity", "status", "verification_status"]
    search_fields = ["substance", "substance_code", "notes"]
    ordering_fields = ["created_at", "severity", "onset_date"]
    ordering = ["-severity", "-created_at"]

    def get_queryset(self):
        """Get allergies, optionally filtered by patient."""
        patient_pk = self.kwargs.get("patient_pk")
        if patient_pk:
            return Allergy.objects.filter(patient_id=patient_pk).select_related(
                "patient", "drug", "recorded_by", "source_encounter"
            )
        return Allergy.objects.select_related(
            "patient", "drug", "recorded_by", "source_encounter"
        ).all()

    def get_patient(self):
        """Get the patient from URL kwargs (for nested routes)."""
        patient_pk = self.kwargs.get("patient_pk")
        if patient_pk:
            return get_object_or_404(Patient, pk=patient_pk)
        return None

    def get_serializer_class(self):
        """Use list serializer for list actions."""
        if self.action == "list":
            return AllergyListSerializer
        return AllergySerializer

    def get_serializer(self, *args, **kwargs):
        """Override to pass nested patient context."""
        serializer_class = self.get_serializer_class()
        kwargs.setdefault("context", self.get_serializer_context())

        # For nested routes, exclude patient from required fields validation
        patient_pk = self.kwargs.get("patient_pk")
        if patient_pk and self.action == "create":
            # Pass patient context for validation
            kwargs["context"]["nested_patient_pk"] = patient_pk

        return serializer_class(*args, **kwargs)

    def create(self, request, *args, **kwargs):
        """Create an allergy record with audit logging."""
        # Get patient from nested route first
        patient = self.get_patient()

        # Prepare data with patient if from nested route
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        if patient:
            data["patient"] = patient.id

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)

        # If still no patient, check request data
        if not patient:
            patient_id = data.get("patient")
            if patient_id:
                patient = get_object_or_404(Patient, pk=patient_id)
            else:
                return Response(
                    {"patient": "Patient is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Save with recorded_by set to current user
        allergy = serializer.save(patient=patient, recorded_by=request.user)

        # Log the creation
        AuditLog.log(
            action="allergy_create",
            user=request.user,
            resource_type="Allergy",
            resource_id=allergy.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=patient.id,
            details={
                "patient_mrn": patient.mrn,
                "substance": allergy.substance,
                "severity": allergy.severity,
            },
        )

        # Return full serializer for response
        response_serializer = AllergySerializer(allergy)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, *args, **kwargs):
        """Retrieve an allergy with audit logging."""
        response = super().retrieve(request, *args, **kwargs)

        allergy = self.get_object()
        AuditLog.log(
            action="allergy_view",
            user=request.user,
            resource_type="Allergy",
            resource_id=allergy.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=allergy.patient.id,
            details={
                "patient_mrn": allergy.patient.mrn,
                "substance": allergy.substance,
            },
        )

        return response

    def update(self, request, *args, **kwargs):
        """Update an allergy with audit logging."""
        allergy = self.get_object()
        old_data = AllergySerializer(allergy).data

        response = super().update(request, *args, **kwargs)

        if response.status_code == 200:
            new_data = response.data
            changes = {
                k: {"old": old_data.get(k), "new": new_data.get(k)}
                for k in new_data
                if old_data.get(k) != new_data.get(k)
            }

            AuditLog.log(
                action="allergy_update",
                user=request.user,
                resource_type="Allergy",
                resource_id=allergy.id,
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                patient_id=allergy.patient.id,
                details={
                    "patient_mrn": allergy.patient.mrn,
                    "substance": allergy.substance,
                    "changes": changes,
                },
            )

        return response

    def destroy(self, request, *args, **kwargs):
        """Delete an allergy with audit logging."""
        allergy = self.get_object()
        allergy_id = allergy.id
        patient_id = allergy.patient.id
        patient_mrn = allergy.patient.mrn
        substance = allergy.substance

        response = super().destroy(request, *args, **kwargs)

        if response.status_code == 204:
            AuditLog.log(
                action="allergy_delete",
                user=request.user,
                resource_type="Allergy",
                resource_id=allergy_id,
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                patient_id=patient_id,
                details={
                    "patient_mrn": patient_mrn,
                    "substance": substance,
                },
            )

        return response

    @action(detail=False, methods=["get"], url_path="lookup")
    def substance_lookup(self, request):
        """
        Look up allergy substances from available sources.

        Query Parameters:
            q: Search query (minimum 2 characters)
            type: Filter by substance type (medication, food, environmental, biological)

        Returns:
            List of matching substances with codes where available.
        """
        from hmis.apps.pharmacy.models import Drug

        query = request.query_params.get("q", "").strip()
        substance_type = request.query_params.get("type", "medication")

        if len(query) < 2:
            return Response(
                {"error": "Query must be at least 2 characters"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        results = []

        if substance_type == "medication":
            # Search drugs from pharmacy
            drugs = Drug.objects.filter(
                is_active=True,
                generic_name__icontains=query,
            )[:20]

            for drug in drugs:
                results.append(
                    {
                        "substance": drug.generic_name,
                        "code": drug.code,
                        "code_system": "local_drug_code",
                        "drug_id": drug.id,
                        "type": "medication",
                        "display": f"{drug.generic_name} ({drug.strength})",
                    }
                )

            # Also search brand names (using Python search to avoid SQLite JSON limitations)
            existing_drug_ids = {r.get("drug_id") for r in results}
            all_drugs = Drug.objects.filter(is_active=True).exclude(brand_names=[])[:100]

            for drug in all_drugs:
                if drug.id in existing_drug_ids:
                    continue
                # Check if query matches any brand name
                brand_matches = [
                    bn for bn in (drug.brand_names or []) if query.lower() in bn.lower()
                ]
                if brand_matches:
                    results.append(
                        {
                            "substance": drug.generic_name,
                            "code": drug.code,
                            "code_system": "local_drug_code",
                            "drug_id": drug.id,
                            "type": "medication",
                            "display": f"{drug.generic_name} ({', '.join(drug.brand_names[:2])})",
                        }
                    )
                    if len(results) >= 30:
                        break

        else:
            # For non-medication allergies, provide common allergens
            common_allergens = {
                "food": [
                    "Peanuts",
                    "Tree nuts",
                    "Milk",
                    "Eggs",
                    "Wheat",
                    "Soy",
                    "Fish",
                    "Shellfish",
                    "Sesame",
                    "Corn",
                    "Gluten",
                ],
                "environmental": [
                    "Dust mites",
                    "Pollen",
                    "Mold",
                    "Pet dander",
                    "Latex",
                    "Insect stings",
                    "Cockroach",
                    "Grass",
                    "Ragweed",
                ],
                "biological": [
                    "Blood products",
                    "Vaccines",
                    "Insulin",
                    "Latex",
                    "Contrast media",
                    "Antisera",
                ],
            }

            allergens = common_allergens.get(substance_type, [])
            filtered = [a for a in allergens if query.lower() in a.lower()]

            for allergen in filtered[:20]:
                results.append(
                    {
                        "substance": allergen,
                        "code": "",
                        "code_system": "",
                        "drug_id": None,
                        "type": substance_type,
                        "display": allergen,
                    }
                )

        return Response(results)

    @action(detail=False, methods=["get"], url_path="hpt-substance-search")
    def hpt_substance_search(self, request):
        """
        Search DHA HPT active components for allergy substance recording.

        Returns active pharmaceutical ingredients with ATC codes from the
        DHA Terminology API, enabling coded allergy substance entry.

        GET /api/allergies/hpt-substance-search/?q=Metformin
        """
        from hmis.apps.billing.services.terminology import TerminologyError, TerminologyService

        query = request.query_params.get("q", "").strip()
        if len(query) < 2:
            return Response(
                {"error": "Query must be at least 2 characters"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        exact_match = request.query_params.get("exact_match", "").lower() == "true"

        try:
            service = TerminologyService()
            results = service.search_active_components(query, exact_match=exact_match)
            return Response(
                {
                    "count": len(results),
                    "results": [
                        {
                            "component_id": r.component_id,
                            "name": r.name,
                            "atc_code": r.atc_code,
                            "atc_codes": r.atc_codes,
                            "substance_code": r.atc_code or "",
                            "substance_code_system": (
                                "http://www.whocc.no/atc" if r.atc_code else ""
                            ),
                        }
                        for r in results
                    ],
                }
            )
        except TerminologyError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

    @action(detail=False, methods=["post"], url_path="check-interactions")
    def check_drug_interactions(self, request):
        """
        Check if a patient has allergies to specified drugs.

        Request Body:
            patient_id: Patient ID (required)
            drug_ids: List of drug IDs to check (optional)
            drug_names: List of drug names to check (optional)

        Returns:
            List of matching allergies with severity warnings.
        """
        patient_id = request.data.get("patient_id")
        drug_ids = request.data.get("drug_ids", [])
        drug_names = request.data.get("drug_names", [])

        if not patient_id:
            return Response(
                {"error": "patient_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not drug_ids and not drug_names:
            return Response(
                {"error": "Either drug_ids or drug_names must be provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        interactions = []

        # Check by drug ID
        for drug_id in drug_ids:
            allergies = Allergy.check_drug_allergy(patient_id, drug_id)
            for allergy in allergies:
                interactions.append(
                    {
                        "allergy_id": allergy.id,
                        "substance": allergy.substance,
                        "severity": allergy.severity,
                        "severity_display": allergy.get_severity_display(),
                        "reaction_type": allergy.reaction_type,
                        "is_high_risk": allergy.is_high_risk,
                        "drug_id": drug_id,
                        "warning": f"Patient is allergic to {allergy.substance} ({allergy.get_severity_display()} severity)",
                    }
                )

        # Check by drug name
        for drug_name in drug_names:
            allergies = Allergy.check_drug_name_allergy(patient_id, drug_name)
            for allergy in allergies:
                # Avoid duplicates
                if allergy.id not in [i["allergy_id"] for i in interactions]:
                    interactions.append(
                        {
                            "allergy_id": allergy.id,
                            "substance": allergy.substance,
                            "severity": allergy.severity,
                            "severity_display": allergy.get_severity_display(),
                            "reaction_type": allergy.reaction_type,
                            "is_high_risk": allergy.is_high_risk,
                            "drug_name": drug_name,
                            "warning": f"Patient is allergic to {allergy.substance} ({allergy.get_severity_display()} severity)",
                        }
                    )

        # Sort by severity (life_threatening > severe > moderate > mild)
        severity_order = {"life_threatening": 0, "severe": 1, "moderate": 2, "mild": 3}
        interactions.sort(key=lambda x: severity_order.get(x["severity"], 4))

        return Response(
            {
                "patient_id": patient_id,
                "has_interactions": len(interactions) > 0,
                "has_high_risk": any(i["is_high_risk"] for i in interactions),
                "interactions": interactions,
            }
        )


class DeathRecordViewSet(ReadOnCreateMixin, NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for Death Records (Last Office / Morgue management).

    Provides CRUD + workflow actions:
    - certify: Certify a death record
    - release_body: Release body to family
    - report_to_civil_registry: Mark as reported to CRVS
    - void: Void a record entered in error
    """

    queryset = DeathRecord.objects.select_related(
        "patient",
        "recorded_by",
        "certified_by",
        "voided_by",
        "primary_cause_icd10",
        "antecedent_cause_icd10",
        "underlying_cause_icd10",
        "admission",
        "encounter",
    ).all()
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "body_status", "manner_of_death", "place_of_death", "patient"]
    search_fields = [
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "death_certificate_number",
        "morgue_compartment",
    ]
    ordering_fields = ["date_of_death", "created_at", "status"]
    ordering = ["-date_of_death"]
    tenant_facility_chain = "patient__registered_at_facility"

    def get_permissions(self):
        from .permissions import CanCertifyDeath, CanReleaseBody, CanVoidDeathRecord

        permissions = [IsAuthenticated()]
        if self.action == "certify":
            permissions.append(CanCertifyDeath())
        elif self.action == "release_body":
            permissions.append(CanReleaseBody())
        elif self.action == "void":
            permissions.append(CanVoidDeathRecord())
        return permissions

    tenant_org_chain = "patient__organization"

    def get_serializer_class(self):
        if self.action == "create":
            return DeathRecordCreateSerializer
        if self.action == "list":
            return DeathRecordListSerializer
        if self.action == "certify":
            return DeathRecordCertifySerializer
        if self.action == "release_body":
            return DeathRecordReleaseBodySerializer
        if self.action == "void":
            return DeathRecordVoidSerializer
        return DeathRecordDetailSerializer

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)
        # Audit log
        record = serializer.instance
        AuditLog.log(
            action="death_record_create",
            user=self.request.user,
            resource_type="DeathRecord",
            resource_id=record.id,
            ip_address=get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            patient_id=record.patient_id,
            details={
                "patient_mrn": record.patient.mrn,
                "date_of_death": str(record.date_of_death),
                "manner_of_death": record.manner_of_death,
            },
        )

    @action(detail=True, methods=["post"])
    def certify(self, request, pk=None):
        """Certify a death record."""
        record = self.get_object()
        if record.is_voided:
            return Response(
                {"error": "Cannot certify a voided record."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if record.is_certified:
            return Response(
                {"error": "This record is already certified."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = DeathRecordCertifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record.certify(
            user=request.user,
            certificate_number=serializer.validated_data.get("certificate_number", ""),
        )
        AuditLog.log(
            action="death_record_certify",
            user=request.user,
            resource_type="DeathRecord",
            resource_id=record.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=record.patient_id,
            details={"patient_mrn": record.patient.mrn},
        )
        return Response(DeathRecordDetailSerializer(record).data)

    @action(detail=True, methods=["post"], url_path="release-body")
    def release_body(self, request, pk=None):
        """Release body to family."""
        record = self.get_object()
        if record.is_voided:
            return Response(
                {"error": "Cannot release body from a voided record."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if record.is_released:
            return Response(
                {"error": "Body has already been released."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not record.is_certified:
            return Response(
                {"error": "Death must be certified before body can be released."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = DeathRecordReleaseBodySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record.release_body(
            released_to=serializer.validated_data["released_to"],
            id_number=serializer.validated_data.get("id_number", ""),
            relationship=serializer.validated_data.get("relationship", ""),
            burial_permit=serializer.validated_data.get("burial_permit_number", ""),
        )
        AuditLog.log(
            action="death_record_release_body",
            user=request.user,
            resource_type="DeathRecord",
            resource_id=record.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=record.patient_id,
            details={
                "patient_mrn": record.patient.mrn,
                "released_to": serializer.validated_data["released_to"],
            },
        )
        return Response(DeathRecordDetailSerializer(record).data)

    @action(detail=True, methods=["post"], url_path="report-to-civil-registry")
    def report_to_civil_registry(self, request, pk=None):
        """Mark death as reported to civil registry."""
        record = self.get_object()
        if record.is_voided:
            return Response(
                {"error": "Cannot report a voided record."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not record.is_certified:
            return Response(
                {"error": "Death must be certified before reporting to civil registry."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        record.report_to_civil_registry()
        AuditLog.log(
            action="death_record_report_civil_registry",
            user=request.user,
            resource_type="DeathRecord",
            resource_id=record.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=record.patient_id,
            details={"patient_mrn": record.patient.mrn},
        )
        return Response(DeathRecordDetailSerializer(record).data)

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        """Void a death record (entered in error)."""
        record = self.get_object()
        if record.is_voided:
            return Response(
                {"error": "Record is already voided."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if record.is_released:
            return Response(
                {"error": "Cannot void a record after body has been released."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = DeathRecordVoidSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record.void(user=request.user, reason=serializer.validated_data["reason"])
        AuditLog.log(
            action="death_record_void",
            user=request.user,
            resource_type="DeathRecord",
            resource_id=record.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=record.patient_id,
            details={
                "patient_mrn": record.patient.mrn,
                "reason": serializer.validated_data["reason"],
            },
        )
        return Response(DeathRecordDetailSerializer(record).data)
