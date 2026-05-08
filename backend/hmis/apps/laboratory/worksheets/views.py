"""Views for Worksheets & Label Generation."""

from django.http import HttpResponse
from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.laboratory.permissions import LaboratoryModuleRequired, LISWorksheetPermission

from .models import LabelPrintJob, LabelTemplate, Worksheet, WorksheetTemplate
from .serializers import (
    LabelGenerateSerializer,
    LabelPrintJobDetailSerializer,
    LabelPrintJobListSerializer,
    LabelTemplateCreateSerializer,
    LabelTemplateSerializer,
    WorksheetDetailSerializer,
    WorksheetGenerateSerializer,
    WorksheetListSerializer,
    WorksheetTemplateCreateSerializer,
    WorksheetTemplateDetailSerializer,
    WorksheetTemplateListSerializer,
)
from .services import export_worksheet_csv, generate_labels, generate_worksheet

# =============================================================================
# Worksheet Template ViewSet
# =============================================================================


class WorksheetTemplateFilter(filters.FilterSet):
    is_active = filters.BooleanFilter()
    group_by = filters.ChoiceFilter(choices=WorksheetTemplate.GroupBy.choices)
    section_filter = filters.CharFilter(lookup_expr="iexact")

    class Meta:
        model = WorksheetTemplate
        fields = ["is_active", "group_by", "section_filter"]


class WorksheetTemplateViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for worksheet templates."""

    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISWorksheetPermission]
    filterset_class = WorksheetTemplateFilter
    tenant_scope = "facility"
    queryset = WorksheetTemplate.objects.select_related("instrument")

    def get_serializer_class(self):
        if self.action == "create":
            return WorksheetTemplateCreateSerializer
        if self.action == "list":
            return WorksheetTemplateListSerializer
        return WorksheetTemplateDetailSerializer

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    @action(detail=False, methods=["post"])
    def seed_defaults(self, request):
        """Seed default worksheet templates for the current facility."""
        self._resolve_tenant_context()
        facility = request.facility

        DEFAULTS = [
            {
                "name": "Hematology Worklist",
                "description": "Daily worklist for CBC, coagulation, and ESR specimens grouped by section.",
                "group_by": "SECTION",
                "section_filter": "HEMATOLOGY",
                "max_specimens_per_page": 30,
                "default_export_format": "PDF",
                "include_qc_slots": True,
                "columns": [
                    "specimen_barcode",
                    "patient_name",
                    "test_name",
                    "priority",
                    "collection_time",
                ],
            },
            {
                "name": "Chemistry/Biochemistry Worklist",
                "description": "Batch worklist for chemistry analyzer runs (LFT, RFT, lipids, glucose).",
                "group_by": "ANALYZER",
                "section_filter": "BIOCHEMISTRY",
                "max_specimens_per_page": 40,
                "default_export_format": "PDF",
                "include_qc_slots": True,
                "columns": ["specimen_barcode", "patient_name", "test_name", "priority"],
            },
            {
                "name": "Microbiology Worklist",
                "description": "Culture and sensitivity worklist grouped by specimen type.",
                "group_by": "SPECIMEN_TYPE",
                "section_filter": "MICROBIOLOGY",
                "max_specimens_per_page": 20,
                "default_export_format": "PDF",
                "include_qc_slots": False,
                "columns": [
                    "specimen_barcode",
                    "patient_name",
                    "test_name",
                    "specimen_type",
                    "priority",
                ],
            },
            {
                "name": "Immunology/Serology Worklist",
                "description": "Worklist for immunoassay tests (HIV, Hepatitis, thyroid, hormones).",
                "group_by": "SECTION",
                "section_filter": "IMMUNOLOGY",
                "max_specimens_per_page": 25,
                "default_export_format": "PDF",
                "include_qc_slots": True,
                "columns": ["specimen_barcode", "patient_name", "test_name", "priority"],
            },
            {
                "name": "Urgent/STAT Worklist",
                "description": "Priority worklist for urgent specimens across all sections.",
                "group_by": "PRIORITY",
                "section_filter": "",
                "max_specimens_per_page": 20,
                "default_export_format": "PDF",
                "include_qc_slots": False,
                "columns": [
                    "specimen_barcode",
                    "patient_name",
                    "test_name",
                    "section",
                    "priority",
                    "collection_time",
                ],
            },
            {
                "name": "Parasitology Worklist",
                "description": "Microscopy worklist for malaria, stool O/C, urinalysis.",
                "group_by": "SECTION",
                "section_filter": "PARASITOLOGY",
                "max_specimens_per_page": 25,
                "default_export_format": "PDF",
                "include_qc_slots": False,
                "columns": ["specimen_barcode", "patient_name", "test_name", "specimen_type"],
            },
        ]

        created = 0
        for tmpl_data in DEFAULTS:
            _, was_created = WorksheetTemplate.objects.get_or_create(
                facility=facility,
                name=tmpl_data["name"],
                defaults={
                    "organization": facility.organization,
                    **tmpl_data,
                },
            )
            if was_created:
                created += 1

        return Response(
            {
                "created": created,
                "total": len(DEFAULTS),
                "message": f"Seeded {created} template(s).",
            },
            status=status.HTTP_201_CREATED if created > 0 else status.HTTP_200_OK,
        )


# =============================================================================
# Worksheet ViewSet
# =============================================================================


class WorksheetFilter(filters.FilterSet):
    status = filters.ChoiceFilter(choices=Worksheet.Status.choices)
    date_from = filters.DateFilter(field_name="generated_at", lookup_expr="date__gte")
    date_to = filters.DateFilter(field_name="generated_at", lookup_expr="date__lte")

    class Meta:
        model = Worksheet
        fields = ["status", "date_from", "date_to"]


class WorksheetViewSet(TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    """View generated worksheets."""

    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISWorksheetPermission]
    filterset_class = WorksheetFilter
    tenant_scope = "facility"
    queryset = Worksheet.objects.select_related("template", "generated_by")

    def get_serializer_class(self):
        if self.action == "retrieve":
            return WorksheetDetailSerializer
        return WorksheetListSerializer

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """Generate a new worksheet from pending specimens."""
        serializer = WorksheetGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        self._resolve_tenant_context()
        facility = request.facility

        worksheet = generate_worksheet(
            facility=facility,
            user=request.user,
            **serializer.validated_data,
        )

        return Response(
            WorksheetDetailSerializer(worksheet).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def mark_printed(self, request, pk=None):
        """Mark a worksheet as printed."""
        worksheet = self.get_object()
        worksheet.mark_printed()
        return Response(WorksheetListSerializer(worksheet).data)

    @action(detail=True, methods=["get"])
    def export_csv(self, request, pk=None):
        """Export worksheet as CSV download."""
        worksheet = self.get_object()
        csv_content = export_worksheet_csv(worksheet)

        response = HttpResponse(csv_content, content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{worksheet.worksheet_number}.csv"'
        return response


# =============================================================================
# Label Template ViewSet
# =============================================================================


class LabelTemplateFilter(filters.FilterSet):
    label_type = filters.ChoiceFilter(choices=LabelTemplate.LabelType.choices)
    label_format = filters.ChoiceFilter(choices=LabelTemplate.LabelFormat.choices)
    is_active = filters.BooleanFilter()

    class Meta:
        model = LabelTemplate
        fields = ["label_type", "label_format", "is_active"]


class LabelTemplateViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for label templates."""

    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISWorksheetPermission]
    filterset_class = LabelTemplateFilter
    tenant_scope = "facility"
    queryset = LabelTemplate.objects.all()

    def get_serializer_class(self):
        if self.action == "create":
            return LabelTemplateCreateSerializer
        return LabelTemplateSerializer

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())


# =============================================================================
# Label Print Job ViewSet
# =============================================================================


class LabelPrintJobFilter(filters.FilterSet):
    status = filters.ChoiceFilter(choices=LabelPrintJob.Status.choices)
    date_from = filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    date_to = filters.DateFilter(field_name="created_at", lookup_expr="date__lte")

    class Meta:
        model = LabelPrintJob
        fields = ["status", "date_from", "date_to"]


class LabelPrintJobViewSet(TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    """View and manage label print jobs."""

    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISWorksheetPermission]
    filterset_class = LabelPrintJobFilter
    tenant_scope = "facility"
    queryset = LabelPrintJob.objects.select_related("template", "generated_by")

    def get_serializer_class(self):
        if self.action == "retrieve":
            return LabelPrintJobDetailSerializer
        return LabelPrintJobListSerializer

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """Generate labels for a batch of specimens."""
        serializer = LabelGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        self._resolve_tenant_context()
        facility = request.facility

        template = LabelTemplate.objects.filter(
            pk=serializer.validated_data["template_id"],
            facility=facility,
        ).first()

        if not template:
            return Response(
                {"error": "Label template not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        job = generate_labels(
            facility=facility,
            user=request.user,
            template=template,
            specimen_ids=serializer.validated_data["specimen_ids"],
            copies=serializer.validated_data.get("copies", 1),
        )

        return Response(
            LabelPrintJobDetailSerializer(job).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def mark_printed(self, request, pk=None):
        """Mark a label job as printed."""
        job = self.get_object()
        job.mark_printed()
        return Response(LabelPrintJobListSerializer(job).data)
