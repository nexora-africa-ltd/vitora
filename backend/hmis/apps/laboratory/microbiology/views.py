"""Views for L4 Microbiology module."""

import csv
import io

from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin, resolve_request_tenant

from .models import Antibiogram, Antibiotic, AntibioticSensitivity, CultureResult, Organism
from .serializers import (
    AntibiogramGenerateSerializer,
    AntibiogramSerializer,
    AntibioticCreateSerializer,
    AntibioticSensitivityCreateSerializer,
    AntibioticSensitivitySerializer,
    AntibioticSerializer,
    CultureIncubateSerializer,
    CultureReadingSerializer,
    CultureReportSerializer,
    CultureResultCreateSerializer,
    CultureResultSerializer,
    OrganismCreateSerializer,
    OrganismSerializer,
    WHONETExportSerializer,
)


class OrganismViewSet(viewsets.ModelViewSet):
    """CRUD for organism master list (global, not facility-scoped)."""

    queryset = Organism.objects.all()
    serializer_class = OrganismSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["gram_stain", "organism_type", "is_active"]
    search_fields = ["name", "code", "genus", "species"]

    def get_serializer_class(self):
        if self.action == "create":
            return OrganismCreateSerializer
        return OrganismSerializer


class AntibioticViewSet(viewsets.ModelViewSet):
    """CRUD for antibiotic master list (global, not facility-scoped)."""

    queryset = Antibiotic.objects.all()
    serializer_class = AntibioticSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["antibiotic_class", "is_active"]
    search_fields = ["name", "code", "antibiotic_class"]

    def get_serializer_class(self):
        if self.action == "create":
            return AntibioticCreateSerializer
        return AntibioticSerializer


class CultureResultViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD + workflow actions for culture results."""

    queryset = CultureResult.objects.select_related(
        "lab_result__order_item__lab_order__patient",
        "specimen",
        "organism",
        "inoculated_by",
        "read_by",
    ).prefetch_related("sensitivities__antibiotic")
    serializer_class = CultureResultSerializer
    permission_classes = [IsAuthenticated]
    tenant_scope = "facility"
    filterset_fields = ["status", "organism", "is_significant"]
    search_fields = ["organism__name", "lab_result__order_item__lab_order__order_number"]

    def get_serializer_class(self):
        if self.action == "create":
            return CultureResultCreateSerializer
        if self.action == "incubate":
            return CultureIncubateSerializer
        if self.action == "read_culture":
            return CultureReadingSerializer
        if self.action in ("report_preliminary", "report_final"):
            return CultureReportSerializer
        return CultureResultSerializer

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    @action(detail=True, methods=["post"])
    def incubate(self, request, pk=None):
        """Transition to INCUBATING status."""
        culture = self.get_object()
        if culture.status != CultureResult.CultureStatus.INOCULATED:
            return Response(
                {"error": "Can only incubate from INOCULATED status"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = CultureIncubateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        culture.start_incubation(
            user=request.user,
            temperature=serializer.validated_data.get("temperature"),
            atmosphere=serializer.validated_data.get("atmosphere"),
            hours=serializer.validated_data.get("hours"),
        )
        return Response(CultureResultSerializer(culture).data)

    @action(detail=True, methods=["post"], url_path="read")
    def read_culture(self, request, pk=None):
        """Transition to READING and record observations."""
        culture = self.get_object()
        if culture.status not in (
            CultureResult.CultureStatus.INCUBATING,
            CultureResult.CultureStatus.READING,
        ):
            return Response(
                {"error": "Can only read from INCUBATING or READING status"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = CultureReadingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        culture.start_reading(user=request.user)

        # Apply reading data
        if data.get("colony_count"):
            culture.colony_count = data["colony_count"]
        if data.get("morphology"):
            culture.morphology = data["morphology"]
        if data.get("gram_stain_result"):
            culture.gram_stain_result = data["gram_stain_result"]
        if data.get("microscopy_notes"):
            culture.microscopy_notes = data["microscopy_notes"]
        if data.get("organism"):
            culture.organism = data["organism"]
        if data.get("identification_method"):
            culture.identification_method = data["identification_method"]
        culture.is_significant = data.get("is_significant", True)
        culture.save()

        return Response(CultureResultSerializer(culture).data)

    @action(detail=True, methods=["post"], url_path="no-growth")
    def no_growth(self, request, pk=None):
        """Mark culture as no growth."""
        culture = self.get_object()
        if culture.status in (
            CultureResult.CultureStatus.FINAL,
            CultureResult.CultureStatus.CANCELLED,
        ):
            return Response(
                {"error": "Cannot mark completed culture as no growth"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        culture.mark_no_growth(user=request.user)
        return Response(CultureResultSerializer(culture).data)

    @action(detail=True, methods=["post"], url_path="report-preliminary")
    def report_preliminary(self, request, pk=None):
        """Submit preliminary report."""
        culture = self.get_object()
        if culture.status not in (
            CultureResult.CultureStatus.READING,
            CultureResult.CultureStatus.PRELIMINARY,
        ):
            return Response(
                {"error": "Can only submit preliminary report from READING status"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = CultureReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data.get("clinical_notes"):
            culture.clinical_notes = serializer.validated_data["clinical_notes"]
            culture.save(update_fields=["clinical_notes"])
        culture.report_preliminary(serializer.validated_data.get("report_text", ""))
        return Response(CultureResultSerializer(culture).data)

    @action(detail=True, methods=["post"], url_path="report-final")
    def report_final(self, request, pk=None):
        """Submit final report."""
        culture = self.get_object()
        if culture.status not in (
            CultureResult.CultureStatus.READING,
            CultureResult.CultureStatus.PRELIMINARY,
        ):
            return Response(
                {"error": "Can only finalize from READING or PRELIMINARY status"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = CultureReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data.get("clinical_notes"):
            culture.clinical_notes = serializer.validated_data["clinical_notes"]
            culture.save(update_fields=["clinical_notes"])
        culture.report_final(serializer.validated_data.get("report_text", ""))
        return Response(CultureResultSerializer(culture).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel the culture."""
        culture = self.get_object()
        if culture.is_complete:
            return Response(
                {"error": "Cannot cancel a completed culture"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        culture.cancel()
        return Response(CultureResultSerializer(culture).data)

    @action(detail=True, methods=["get", "post"], url_path="sensitivities")
    def sensitivities(self, request, pk=None):
        """List or add sensitivities for a culture."""
        culture = self.get_object()
        if request.method == "GET":
            qs = culture.sensitivities.select_related("antibiotic", "tested_by")
            serializer = AntibioticSensitivitySerializer(qs, many=True)
            return Response(serializer.data)

        # POST - add sensitivity
        serializer = AntibioticSensitivityCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(
            culture=culture,
            facility=culture.facility,
            organization=culture.organization,
            tested_by=request.user,
        )
        # Re-serialize with full data
        full = AntibioticSensitivitySerializer(
            AntibioticSensitivity.objects.select_related("antibiotic", "tested_by").get(
                pk=serializer.instance.pk
            )
        )
        return Response(full.data, status=status.HTTP_201_CREATED)


class AntibioticSensitivityViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """Direct CRUD for sensitivities (alternative to nested under culture)."""

    queryset = AntibioticSensitivity.objects.select_related("culture", "antibiotic", "tested_by")
    serializer_class = AntibioticSensitivitySerializer
    permission_classes = [IsAuthenticated]
    tenant_scope = "facility"
    filterset_fields = ["culture", "antibiotic", "interpretation", "test_method"]

    def get_serializer_class(self):
        if self.action == "create":
            return AntibioticSensitivityCreateSerializer
        return AntibioticSensitivitySerializer

    def perform_create(self, serializer):
        culture = serializer.validated_data.get("culture") or CultureResult.objects.get(
            pk=self.request.data.get("culture")
        )
        serializer.save(
            facility=culture.facility,
            organization=culture.organization,
            tested_by=self.request.user,
        )


class AntibiogramViewSet(TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    """Read-only access to cumulative antibiogram data."""

    queryset = Antibiogram.objects.select_related("organism", "antibiotic")
    serializer_class = AntibiogramSerializer
    permission_classes = [IsAuthenticated]
    tenant_scope = "facility"
    filterset_fields = ["year", "organism", "antibiotic"]

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """Generate/refresh antibiogram for a given year."""
        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if not facility:
            return Response(
                {"error": "Facility context required"}, status=status.HTTP_400_BAD_REQUEST
            )

        serializer = AntibiogramGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        year = serializer.validated_data["year"]

        results = Antibiogram.generate_for_facility(facility, year)
        return Response(
            {"generated": len(results), "year": year},
            status=status.HTTP_200_OK,
        )


class WHONETExportView(APIView):
    """Export susceptibility data in WHONET-compatible CSV format."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if not facility:
            return Response(
                {"error": "Facility context required"}, status=status.HTTP_400_BAD_REQUEST
            )

        serializer = WHONETExportSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        year = serializer.validated_data["year"]
        organism_filter = serializer.validated_data.get("organism")

        queryset = AntibioticSensitivity.objects.filter(
            culture__facility=facility,
            culture__status=CultureResult.CultureStatus.FINAL,
            culture__is_significant=True,
            culture__created_at__year=year,
        ).select_related(
            "culture__organism",
            "culture__specimen",
            "culture__lab_result__order_item__lab_order__patient",
            "antibiotic",
        )
        if organism_filter:
            queryset = queryset.filter(culture__organism=organism_filter)

        # Generate WHONET CSV
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                "PATIENT_ID",
                "SPEC_DATE",
                "SPEC_TYPE",
                "ORGANISM",
                "ORG_CODE",
                "ANTIBIOTIC",
                "AB_CODE",
                "ZONE_DIAMETER",
                "MIC",
                "INTERPRETATION",
                "METHOD",
                "BREAKPOINT",
            ]
        )

        for sens in queryset.iterator():
            culture = sens.culture
            patient_id = ""
            try:
                patient_id = culture.lab_result.order_item.lab_order.patient.mrn
            except (AttributeError, TypeError):
                pass

            writer.writerow(
                [
                    patient_id,
                    culture.created_at.strftime("%Y-%m-%d") if culture.created_at else "",
                    culture.specimen.specimen_type if culture.specimen else "",
                    culture.organism.name if culture.organism else "",
                    culture.organism.code if culture.organism else "",
                    sens.antibiotic.name,
                    sens.antibiotic.code,
                    str(sens.zone_diameter) if sens.zone_diameter else "",
                    str(sens.mic) if sens.mic else "",
                    sens.interpretation,
                    sens.get_test_method_display(),
                    sens.breakpoint_standard,
                ]
            )

        response = HttpResponse(output.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = (
            f'attachment; filename="whonet_export_{facility.pk}_{year}.csv"'
        )
        return response
