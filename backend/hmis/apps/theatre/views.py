"""
Theatre module ViewSets.

All ViewSets follow codebase conventions:
- TenantScopedViewMixin for facility/org scoping
- ReadOnCreateMixin for returning detail serializer on 201
- get_serializer_class() routing per action
- Thin views: validate input then delegate to model methods
"""

from datetime import timedelta

from django.http import HttpResponse
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.billing.agent import BillingAgentService
from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import get_client_ip
from hmis.apps.pharmacy.services import InsufficientStockError

from .filters import OperatingTheatreFilter, SurgeryCaseFilter
from .models import (
    AnesthesiaRecord,
    OperatingTheatre,
    OperativeNote,
    PACURecord,
    SurgeryCase,
    SurgicalTeamMember,
    TheatreConsumable,
    WHOSafetyChecklist,
)
from .permissions import CanDocumentSurgery, CanManageTheatre, CanManageTheatreSettings
from .serializers import (
    AnesthesiaRecordCreateSerializer,
    AnesthesiaRecordSerializer,
    CaseCancelSerializer,
    CasePostponeSerializer,
    CaseScheduleSerializer,
    IntraOpVitalReadingCreateSerializer,
    IntraOpVitalReadingSerializer,
    OperatingTheatreCreateSerializer,
    OperatingTheatreDetailSerializer,
    OperatingTheatreListSerializer,
    OperativeNoteCreateSerializer,
    OperativeNoteSerializer,
    PACUDischargeSerializer,
    PACURecordCreateSerializer,
    PACURecordSerializer,
    PACURecordUpdateSerializer,
    PACUVitalReadingCreateSerializer,
    PACUVitalReadingSerializer,
    SurgeryCaseCreateSerializer,
    SurgeryCaseDetailSerializer,
    SurgeryCaseListSerializer,
    SurgicalTeamMemberCreateSerializer,
    SurgicalTeamMemberSerializer,
    TheatreConsumableCreateSerializer,
    TheatreConsumableSerializer,
    WHOSafetyChecklistSerializer,
    WHOSignInSerializer,
    WHOSignOutSerializer,
    WHOTimeOutSerializer,
)
from .services.consumables import create_theatre_consumable, restore_theatre_consumable_stock
from .services.pdf_exports import generate_operative_note_pdf, generate_pacu_summary_pdf
from .services.reports import build_theatre_report_summary
from .services.scheduling import get_available_slots, get_case_scheduling_context

# ─── Helpers ──────────────────────────────────────────────────────────────


def _audit(request, action_name: str, resource_type: str, resource_id, **extra):
    """Shortcut for audit logging."""
    AuditLog.log(
        action=action_name,
        user=request.user,
        resource_type=resource_type,
        resource_id=resource_id,
        ip_address=get_client_ip(request),
        user_agent=request.META.get("HTTP_USER_AGENT", ""),
        details=extra,
    )


# ═══════════════════════════════════════════════════════════════════════════
#  1. OperatingTheatreViewSet
# ═══════════════════════════════════════════════════════════════════════════


class OperatingTheatreViewSet(TenantScopedViewMixin, ReadOnCreateMixin, viewsets.ModelViewSet):
    queryset = OperatingTheatre.objects.select_related("scheduling_resource")
    permission_classes = [IsAuthenticated, CanManageTheatreSettings]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = OperatingTheatreFilter
    search_fields = ["code", "name"]
    ordering_fields = ["code", "name", "theatre_type"]

    def get_serializer_class(self):
        if self.action == "list":
            return OperatingTheatreListSerializer
        if self.action == "create":
            return OperatingTheatreCreateSerializer
        return OperatingTheatreDetailSerializer

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    @action(detail=True, methods=["get"])
    def availability(self, request, pk=None):
        """Return available time slots for a date."""
        theatre = self.get_object()
        date_str = request.query_params.get("date")
        if not date_str:
            return Response(
                {"error": "date query parameter is required (YYYY-MM-DD)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from datetime import datetime

        try:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        slots = get_available_slots(theatre, target_date)
        return Response(
            {
                "date": date_str,
                "theatre_id": theatre.id,
                "theatre_name": theatre.name,
                "scheduling_resource": theatre.scheduling_resource_id,
                "integration_source": slots[0]["source"]
                if slots
                else (
                    "scheduling_resource"
                    if theatre.scheduling_resource_id
                    and theatre.scheduling_resource.get_schedules().exists()
                    else "theatre_hours"
                ),
                "has_resource_schedule": bool(
                    theatre.scheduling_resource_id
                    and theatre.scheduling_resource.get_schedules().exists()
                ),
                "slot_duration_minutes": theatre.slot_duration_minutes,
                "slots": slots,
            }
        )


# ═══════════════════════════════════════════════════════════════════════════
#  2. SurgeryCaseViewSet
# ═══════════════════════════════════════════════════════════════════════════


class SurgeryCaseViewSet(TenantScopedViewMixin, ReadOnCreateMixin, viewsets.ModelViewSet):
    queryset = SurgeryCase.objects.select_related(
        "patient",
        "theatre",
        "theatre__scheduling_resource",
        "primary_procedure",
        "requesting_doctor",
    ).prefetch_related("team_members__staff_member")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = SurgeryCaseFilter
    search_fields = [
        "case_number",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
    ]
    ordering_fields = [
        "scheduled_date",
        "scheduled_start_time",
        "status",
        "priority",
        "requested_at",
    ]
    lookup_field = "case_number"

    MANAGE_THEATRE_ACTIONS = {
        "create",
        "update",
        "partial_update",
        "destroy",
        "schedule",
        "start_pre_op",
        "enter_theatre",
        "start_surgery",
        "end_surgery",
        "enter_pacu",
        "discharge",
        "cancel",
        "postpone",
        "add_team_member",
        "remove_team_member",
        "who_sign_in",
        "who_time_out",
        "who_sign_out",
        "create_anesthesia",
        "update_anesthesia",
        "add_intraop_vital",
        "add_consumable",
        "remove_consumable",
        "create_pacu",
        "update_pacu",
        "add_pacu_vital",
        "discharge_pacu",
        "pacu_pdf",
    }

    DOCUMENT_SURGERY_ACTIONS = {
        "create_operative_note",
        "update_operative_note",
        "sign_operative_note",
        "operative_note_pdf",
    }

    def get_permissions(self):
        permissions = [IsAuthenticated()]
        if self.action in self.DOCUMENT_SURGERY_ACTIONS:
            permissions.append(CanDocumentSurgery())
        elif self.action in self.MANAGE_THEATRE_ACTIONS:
            permissions.append(CanManageTheatre())
        return permissions

    def get_serializer_class(self):
        if self.action == "list":
            return SurgeryCaseListSerializer
        if self.action == "create":
            return SurgeryCaseCreateSerializer
        if self.action == "schedule":
            return CaseScheduleSerializer
        if self.action == "cancel":
            return CaseCancelSerializer
        if self.action == "postpone":
            return CasePostponeSerializer
        # Team actions
        if self.action == "add_team_member":
            return SurgicalTeamMemberCreateSerializer
        # WHO checklist actions
        if self.action == "who_sign_in":
            return WHOSignInSerializer
        if self.action == "who_time_out":
            return WHOTimeOutSerializer
        if self.action == "who_sign_out":
            return WHOSignOutSerializer
        # Anesthesia
        if self.action == "create_anesthesia":
            return AnesthesiaRecordCreateSerializer
        if self.action == "add_intraop_vital":
            return IntraOpVitalReadingCreateSerializer
        # Operative note
        if self.action == "create_operative_note":
            return OperativeNoteCreateSerializer
        # Consumables
        if self.action == "add_consumable":
            return TheatreConsumableCreateSerializer
        # PACU
        if self.action == "create_pacu":
            return PACURecordCreateSerializer
        if self.action == "update_pacu":
            return PACURecordUpdateSerializer
        if self.action == "add_pacu_vital":
            return PACUVitalReadingCreateSerializer
        if self.action == "discharge_pacu":
            return PACUDischargeSerializer
        return SurgeryCaseDetailSerializer

    def perform_create(self, serializer):
        serializer.save(
            requesting_doctor=self.request.user,
            **self.get_tenant_save_kwargs(),
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        detail = SurgeryCaseDetailSerializer(serializer.instance)
        _audit(
            request,
            "surgery_case_create",
            "SurgeryCase",
            serializer.instance.pk,
            case_number=serializer.instance.case_number,
        )
        return Response(detail.data, status=status.HTTP_201_CREATED)

    # ── Workflow Actions ──────────────────────────────────────────────

    @action(detail=True, methods=["post"])
    def schedule(self, request, **kwargs):
        case = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        # Update optional scheduling fields
        if "theatre" in data:
            case.theatre_id = data["theatre"]
        if "scheduled_date" in data:
            case.scheduled_date = data["scheduled_date"]
        if "scheduled_start_time" in data:
            case.scheduled_start_time = data["scheduled_start_time"]
        if "estimated_duration_minutes" in data:
            case.estimated_duration_minutes = data["estimated_duration_minutes"]
        try:
            case.schedule(user=request.user)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        _audit(
            request, "surgery_case_schedule", "SurgeryCase", case.pk, case_number=case.case_number
        )
        return Response(SurgeryCaseDetailSerializer(case).data)

    @action(detail=True, methods=["post"], url_path="start-pre-op")
    def start_pre_op(self, request, **kwargs):
        case = self.get_object()
        try:
            case.start_pre_op(user=request.user)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        _audit(request, "surgery_case_pre_op", "SurgeryCase", case.pk, case_number=case.case_number)
        return Response(SurgeryCaseDetailSerializer(case).data)

    @action(detail=True, methods=["post"], url_path="enter-theatre")
    def enter_theatre(self, request, **kwargs):
        case = self.get_object()
        try:
            case.enter_theatre(user=request.user)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        _audit(
            request,
            "surgery_case_enter_theatre",
            "SurgeryCase",
            case.pk,
            case_number=case.case_number,
        )
        return Response(SurgeryCaseDetailSerializer(case).data)

    @action(detail=True, methods=["post"], url_path="start-surgery")
    def start_surgery(self, request, **kwargs):
        case = self.get_object()
        try:
            case.start_surgery(user=request.user)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        _audit(
            request,
            "surgery_case_start_surgery",
            "SurgeryCase",
            case.pk,
            case_number=case.case_number,
        )
        return Response(SurgeryCaseDetailSerializer(case).data)

    @action(detail=True, methods=["post"], url_path="end-surgery")
    def end_surgery(self, request, **kwargs):
        case = self.get_object()
        try:
            case.end_surgery(user=request.user)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        _audit(
            request,
            "surgery_case_end_surgery",
            "SurgeryCase",
            case.pk,
            case_number=case.case_number,
        )
        return Response(SurgeryCaseDetailSerializer(case).data)

    @action(detail=True, methods=["post"], url_path="enter-pacu")
    def enter_pacu(self, request, **kwargs):
        case = self.get_object()
        try:
            # IN_SURGERY → IN_PACU via end_surgery() which maps to IN_PACU transition
            if case.status == SurgeryCase.CaseStatus.IN_SURGERY:
                case.end_surgery(user=request.user)
            else:
                case.transition_to(SurgeryCase.CaseStatus.IN_PACU, user=request.user)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        _audit(
            request, "surgery_case_enter_pacu", "SurgeryCase", case.pk, case_number=case.case_number
        )
        return Response(SurgeryCaseDetailSerializer(case).data)

    @action(detail=True, methods=["post"])
    def discharge(self, request, **kwargs):
        case = self.get_object()
        try:
            case.discharge(user=request.user)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        _audit(
            request, "surgery_case_discharge", "SurgeryCase", case.pk, case_number=case.case_number
        )
        return Response(SurgeryCaseDetailSerializer(case).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, **kwargs):
        case = self.get_object()
        serializer = CaseCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            case.cancel(user=request.user, reason=serializer.validated_data["reason"])
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        _audit(
            request,
            "surgery_case_cancel",
            "SurgeryCase",
            case.pk,
            case_number=case.case_number,
            reason=serializer.validated_data["reason"],
        )
        return Response(SurgeryCaseDetailSerializer(case).data)

    @action(detail=True, methods=["post"])
    def postpone(self, request, **kwargs):
        case = self.get_object()
        serializer = CasePostponeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            case.postpone(
                user=request.user,
                postponed_to=serializer.validated_data.get("postponed_to_date"),
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        _audit(
            request, "surgery_case_postpone", "SurgeryCase", case.pk, case_number=case.case_number
        )
        return Response(SurgeryCaseDetailSerializer(case).data)

    # ── Team ──────────────────────────────────────────────────────────

    @action(detail=True, methods=["get"], url_path="team")
    def list_team(self, request, **kwargs):
        case = self.get_object()
        members = case.team_members.select_related("staff_member").all()
        return Response(SurgicalTeamMemberSerializer(members, many=True).data)

    @action(detail=True, methods=["post"], url_path="team/add")
    def add_team_member(self, request, **kwargs):
        case = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member = serializer.save(surgery_case=case)
        _audit(
            request,
            "surgery_team_assign",
            "SurgeryCase",
            case.pk,
            role=member.role,
            staff_id=member.staff_member_id,
        )
        return Response(
            SurgicalTeamMemberSerializer(member).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["delete"], url_path=r"team/(?P<member_pk>\d+)")
    def remove_team_member(self, request, member_pk=None, **kwargs):
        case = self.get_object()
        try:
            member = case.team_members.get(pk=member_pk)
        except SurgicalTeamMember.DoesNotExist:
            return Response(
                {"error": "Team member not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        _audit(
            request,
            "surgery_team_remove",
            "SurgeryCase",
            case.pk,
            role=member.role,
            staff_id=member.staff_member_id,
        )
        member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"], url_path="scheduling-context")
    def scheduling_context(self, request, **kwargs):
        case = self.get_object()
        return Response(get_case_scheduling_context(case))

    # ── WHO Checklist ─────────────────────────────────────────────────

    @action(detail=True, methods=["get"], url_path="who-checklist")
    def get_who_checklist(self, request, **kwargs):
        case = self.get_object()
        try:
            checklist = case.who_checklist
        except WHOSafetyChecklist.DoesNotExist:
            return Response(
                {"detail": "No WHO checklist found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(WHOSafetyChecklistSerializer(checklist).data)

    @action(detail=True, methods=["post"], url_path="who-checklist/sign-in")
    def who_sign_in(self, request, **kwargs):
        case = self.get_object()
        serializer = WHOSignInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        checklist, _ = WHOSafetyChecklist.objects.get_or_create(surgery_case=case)
        for field, value in serializer.validated_data.items():
            setattr(checklist, field, value)
        checklist.complete_sign_in(user=request.user)
        _audit(request, "who_sign_in", "SurgeryCase", case.pk, case_number=case.case_number)
        return Response(WHOSafetyChecklistSerializer(checklist).data)

    @action(detail=True, methods=["post"], url_path="who-checklist/time-out")
    def who_time_out(self, request, **kwargs):
        case = self.get_object()
        serializer = WHOTimeOutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            checklist = case.who_checklist
        except WHOSafetyChecklist.DoesNotExist:
            return Response(
                {"error": "Complete Sign-In first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not checklist.sign_in_complete:
            return Response(
                {"error": "Sign-In must be completed before Time-Out."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        for field, value in serializer.validated_data.items():
            setattr(checklist, field, value)
        checklist.complete_time_out(user=request.user)
        _audit(request, "who_time_out", "SurgeryCase", case.pk, case_number=case.case_number)
        return Response(WHOSafetyChecklistSerializer(checklist).data)

    @action(detail=True, methods=["post"], url_path="who-checklist/sign-out")
    def who_sign_out(self, request, **kwargs):
        case = self.get_object()
        serializer = WHOSignOutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            checklist = case.who_checklist
        except WHOSafetyChecklist.DoesNotExist:
            return Response(
                {"error": "Complete Sign-In and Time-Out first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not checklist.time_out_complete:
            return Response(
                {"error": "Time-Out must be completed before Sign-Out."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        for field, value in serializer.validated_data.items():
            setattr(checklist, field, value)
        checklist.complete_sign_out(user=request.user)
        _audit(request, "who_sign_out", "SurgeryCase", case.pk, case_number=case.case_number)
        return Response(WHOSafetyChecklistSerializer(checklist).data)

    # ── Anesthesia ────────────────────────────────────────────────────

    @action(detail=True, methods=["get"], url_path="anesthesia")
    def get_anesthesia(self, request, **kwargs):
        case = self.get_object()
        try:
            record = case.anesthesia_record
        except AnesthesiaRecord.DoesNotExist:
            return Response(
                {"detail": "No anesthesia record found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(AnesthesiaRecordSerializer(record).data)

    @action(detail=True, methods=["post"], url_path="anesthesia/create")
    def create_anesthesia(self, request, **kwargs):
        case = self.get_object()
        if hasattr(case, "anesthesia_record"):
            return Response(
                {"error": "Anesthesia record already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = AnesthesiaRecordCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record = serializer.save(
            surgery_case=case,
            pre_op_assessment_at=timezone.now(),
        )
        _audit(
            request,
            "anesthesia_record_create",
            "SurgeryCase",
            case.pk,
            case_number=case.case_number,
        )
        return Response(
            AnesthesiaRecordSerializer(record).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["patch"], url_path="anesthesia/update")
    def update_anesthesia(self, request, **kwargs):
        case = self.get_object()
        try:
            record = case.anesthesia_record
        except AnesthesiaRecord.DoesNotExist:
            return Response(
                {"error": "No anesthesia record found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = AnesthesiaRecordSerializer(record, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(AnesthesiaRecordSerializer(record).data)

    @action(detail=True, methods=["get", "post"], url_path="anesthesia/vitals")
    def add_intraop_vital(self, request, **kwargs):
        case = self.get_object()
        try:
            record = case.anesthesia_record
        except AnesthesiaRecord.DoesNotExist:
            return Response(
                {"error": "Create anesthesia record first."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if request.method.lower() == "get":
            readings = record.vital_readings.order_by("recorded_at")
            return Response(IntraOpVitalReadingSerializer(readings, many=True).data)
        serializer = IntraOpVitalReadingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vital = serializer.save(anesthesia_record=record)
        return Response(
            IntraOpVitalReadingSerializer(vital).data,
            status=status.HTTP_201_CREATED,
        )

    # ── Operative Note ────────────────────────────────────────────────

    @action(detail=True, methods=["get"], url_path="operative-note")
    def get_operative_note(self, request, **kwargs):
        case = self.get_object()
        try:
            note = case.operative_note
        except OperativeNote.DoesNotExist:
            return Response(
                {"detail": "No operative note found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(OperativeNoteSerializer(note).data)

    @action(detail=True, methods=["post"], url_path="operative-note/create")
    def create_operative_note(self, request, **kwargs):
        case = self.get_object()
        if hasattr(case, "operative_note"):
            return Response(
                {"error": "Operative note already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = OperativeNoteCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note = serializer.save(surgery_case=case)
        _audit(
            request, "operative_note_create", "SurgeryCase", case.pk, case_number=case.case_number
        )
        return Response(
            OperativeNoteSerializer(note).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["patch"], url_path="operative-note/update")
    def update_operative_note(self, request, **kwargs):
        case = self.get_object()
        try:
            note = case.operative_note
        except OperativeNote.DoesNotExist:
            return Response(
                {"error": "No operative note found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = OperativeNoteSerializer(note, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(OperativeNoteSerializer(note).data)

    @action(detail=True, methods=["post"], url_path="operative-note/sign")
    def sign_operative_note(self, request, **kwargs):
        case = self.get_object()
        try:
            note = case.operative_note
        except OperativeNote.DoesNotExist:
            return Response(
                {"error": "No operative note found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        note.sign(user=request.user)
        _audit(request, "operative_note_sign", "SurgeryCase", case.pk, case_number=case.case_number)
        return Response(OperativeNoteSerializer(note).data)

    @action(detail=True, methods=["get"], url_path="operative-note/pdf")
    def operative_note_pdf(self, request, **kwargs):
        case = self.get_object()
        try:
            note = case.operative_note
        except OperativeNote.DoesNotExist:
            return Response(
                {"error": "No operative note found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        pdf_bytes = generate_operative_note_pdf(surgery_case=case, operative_note=note)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="operative-note-{case.case_number}.pdf"'
        )
        _audit(request, "operative_note_pdf", "SurgeryCase", case.pk, case_number=case.case_number)
        return response

    # ── Consumables ───────────────────────────────────────────────────

    @action(detail=True, methods=["get"], url_path="consumables")
    def list_consumables(self, request, **kwargs):
        case = self.get_object()
        consumables = case.consumables.select_related("item").all()
        return Response(TheatreConsumableSerializer(consumables, many=True).data)

    @action(detail=True, methods=["post"], url_path="consumables/add")
    def add_consumable(self, request, **kwargs):
        case = self.get_object()
        serializer = TheatreConsumableCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            consumable = create_theatre_consumable(
                surgery_case=case,
                added_by=request.user,
                data=serializer.validated_data,
                tenant_kwargs=self.get_tenant_save_kwargs(),
            )
        except InsufficientStockError as error:
            return Response({"error": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        BillingAgentService.sync_theatre_case_billing(case)
        _audit(
            request,
            "theatre_consumable_add",
            "SurgeryCase",
            case.pk,
            item_id=consumable.item_id,
            quantity=consumable.quantity_used,
        )
        return Response(
            TheatreConsumableSerializer(consumable).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["delete"], url_path=r"consumables/(?P<consumable_pk>\d+)")
    def remove_consumable(self, request, consumable_pk=None, **kwargs):
        case = self.get_object()
        try:
            consumable = case.consumables.get(pk=consumable_pk)
        except TheatreConsumable.DoesNotExist:
            return Response(
                {"error": "Consumable not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            BillingAgentService.remove_theatre_consumable_billing(consumable)
        except ValueError as error:
            return Response({"error": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        restore_theatre_consumable_stock(consumable)
        _audit(
            request, "theatre_consumable_remove", "SurgeryCase", case.pk, item_id=consumable.item_id
        )
        consumable.delete()
        BillingAgentService.sync_theatre_case_billing(case)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"], url_path="reports/summary")
    def reports_summary(self, request, **kwargs):
        date_from_str = request.query_params.get("date_from")
        date_to_str = request.query_params.get("date_to")

        if date_to_str:
            try:
                date_to = timezone.datetime.strptime(date_to_str, "%Y-%m-%d").date()
            except ValueError:
                return Response(
                    {"error": "Invalid date_to format. Use YYYY-MM-DD."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            date_to = timezone.now().date()

        if date_from_str:
            try:
                date_from = timezone.datetime.strptime(date_from_str, "%Y-%m-%d").date()
            except ValueError:
                return Response(
                    {"error": "Invalid date_from format. Use YYYY-MM-DD."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            date_from = date_to - timedelta(days=29)

        if date_from > date_to:
            return Response(
                {"error": "date_from cannot be after date_to."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        case_queryset = (
            self.get_queryset()
            .filter(scheduled_date__gte=date_from, scheduled_date__lte=date_to)
            .select_related(
                "operative_note", "pacu_record", "anesthesia_record", "requesting_doctor"
            )
            .prefetch_related("team_members__staff_member")
        )
        facility_id = getattr(
            getattr(request.user, "staff_profile", None), "primary_facility_id", None
        )
        theatre_queryset = OperatingTheatre.objects.filter(is_active=True)
        if facility_id:
            theatre_queryset = theatre_queryset.filter(facility_id=facility_id)

        return Response(
            build_theatre_report_summary(
                cases=case_queryset,
                theatres=theatre_queryset,
                start_date=date_from,
                end_date=date_to,
            )
        )

    # ── PACU ──────────────────────────────────────────────────────────

    @action(detail=True, methods=["get"], url_path="pacu")
    def get_pacu(self, request, **kwargs):
        case = self.get_object()
        try:
            record = case.pacu_record
        except PACURecord.DoesNotExist:
            return Response(
                {"detail": "No PACU record found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(PACURecordSerializer(record).data)

    @action(detail=True, methods=["post"], url_path="pacu/create")
    def create_pacu(self, request, **kwargs):
        case = self.get_object()
        if hasattr(case, "pacu_record"):
            return Response(
                {"error": "PACU record already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = PACURecordCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record = serializer.save(surgery_case=case)
        _audit(request, "pacu_record_create", "SurgeryCase", case.pk, case_number=case.case_number)
        return Response(
            PACURecordSerializer(record).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["patch"], url_path="pacu/update")
    def update_pacu(self, request, **kwargs):
        case = self.get_object()
        try:
            record = case.pacu_record
        except PACURecord.DoesNotExist:
            return Response(
                {"error": "No PACU record found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = self.get_serializer(record, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        handover_given_to = serializer.validated_data.get(
            "handover_given_to", record.handover_given_to
        )
        handover_notes = serializer.validated_data.get("handover_notes", record.handover_notes)
        if (
            "handover_given_to" in serializer.validated_data
            or "handover_notes" in serializer.validated_data
        ):
            if str(handover_given_to).strip() and str(handover_notes).strip():
                record.record_handover(recipient=str(handover_given_to), notes=str(handover_notes))
            else:
                record.handover_completed_at = None
                record.save(update_fields=["handover_completed_at", "updated_at"])
        _audit(request, "pacu_record_update", "SurgeryCase", case.pk, case_number=case.case_number)
        return Response(PACURecordSerializer(record).data)

    @action(detail=True, methods=["post"], url_path="pacu/vitals")
    def add_pacu_vital(self, request, **kwargs):
        case = self.get_object()
        try:
            record = case.pacu_record
        except PACURecord.DoesNotExist:
            return Response(
                {"error": "Create PACU record first."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = PACUVitalReadingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vital = serializer.save(pacu_record=record)
        return Response(
            PACUVitalReadingSerializer(vital).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="pacu/discharge")
    def discharge_pacu(self, request, **kwargs):
        case = self.get_object()
        try:
            record = case.pacu_record
        except PACURecord.DoesNotExist:
            return Response(
                {"error": "No PACU record found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.context["pacu_record"] = record
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        record.record_handover(
            recipient=data["handover_given_to"],
            notes=data["handover_notes"],
        )
        record.complete_discharge(
            user=request.user,
            aldrete_score=data["discharge_aldrete_score"],
            destination=data["discharge_destination"],
            notes=data.get("discharge_notes", ""),
        )
        case.discharge(user=request.user)
        _audit(
            request,
            "pacu_discharge",
            "SurgeryCase",
            case.pk,
            case_number=case.case_number,
            aldrete_score=data["discharge_aldrete_score"],
            destination=data["discharge_destination"],
        )
        return Response(PACURecordSerializer(record).data)

    @action(detail=True, methods=["get"], url_path="pacu/pdf")
    def pacu_pdf(self, request, **kwargs):
        case = self.get_object()
        try:
            record = case.pacu_record
        except PACURecord.DoesNotExist:
            return Response(
                {"error": "No PACU record found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        pdf_bytes = generate_pacu_summary_pdf(surgery_case=case, pacu_record=record)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="pacu-summary-{case.case_number}.pdf"'
        )
        _audit(request, "pacu_pdf", "SurgeryCase", case.pk, case_number=case.case_number)
        return response

    # ── Schedule (Daily Theatre List) ─────────────────────────────────

    @action(detail=False, methods=["get"], url_path="daily-list")
    def daily_list(self, request):
        """Daily theatre list for a given date."""
        date_str = request.query_params.get("date")
        if not date_str:
            date_str = str(timezone.now().date())
        cases = (
            self.get_queryset()
            .filter(
                scheduled_date=date_str,
                status__in=[
                    SurgeryCase.CaseStatus.SCHEDULED,
                    SurgeryCase.CaseStatus.PRE_OP,
                    SurgeryCase.CaseStatus.IN_THEATRE,
                    SurgeryCase.CaseStatus.IN_SURGERY,
                    SurgeryCase.CaseStatus.IN_PACU,
                    SurgeryCase.CaseStatus.DISCHARGED,
                ],
            )
            .order_by("scheduled_start_time")
        )
        serializer = SurgeryCaseListSerializer(cases, many=True)
        return Response(serializer.data)
