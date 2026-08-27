"""
What this file is for: inpatient nursing kardex viewset with notes, schedule items, and care-plan workflows.
How to use: imported by ``inpatient.views`` so existing router imports remain stable.
Supported inputs/args: DRF request payloads/query params handled by NursingKardexViewSet actions.
"""

# ruff: noqa: ARG002

from django.contrib.auth import get_user_model
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import NestedTenantScopeMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import (
    ReadRequiresModelPermission,
    WriteRequiresRolePermission,
    get_client_ip,
)

from ..models import (
    KardexFieldChange,
    KardexHandoverNote,
    KardexScheduleItem,
    KardexShiftNote,
    NursingCarePlanEntry,
    NursingCarePlanEntryChange,
    NursingKardex,
)
from ..serializers import (
    KardexHandoverNoteSerializer,
    KardexScheduleItemCreateSerializer,
    KardexScheduleItemSerializer,
    KardexScheduleItemUpdateSerializer,
    KardexShiftNoteSerializer,
    NursingCarePlanEntryChangeSerializer,
    NursingCarePlanEntryCreateSerializer,
    NursingCarePlanEntrySerializer,
    NursingKardexSerializer,
)

User = get_user_model()


class NursingKardexViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for NursingKardex model.

    Provides CRUD operations for nursing kardex with:
    - Nursing care plans
    - Risk assessments
    - Shift notes and handovers

    Endpoints:
    - GET /api/inpatient/kardex/ - List all kardexes
    - GET /api/inpatient/kardex/{id}/ - Kardex detail
    - PATCH /api/inpatient/kardex/{id}/ - Update kardex
    - POST /api/inpatient/kardex/{id}/add-shift-note/ - Add shift note
    - POST /api/inpatient/kardex/{id}/add-handover-note/ - Add handover note
    """

    tenant_facility_chain = "admission__facility"
    tenant_org_chain = "admission__organization"
    queryset = NursingKardex.objects.all()
    serializer_class = NursingKardexSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["admission", "fall_risk", "pressure_sore_risk"]
    search_fields = [
        "admission__admission_number",
        "admission__patient__first_name",
        "admission__patient__last_name",
        "nursing_problems",
    ]
    ordering_fields = ["created_at", "updated_at"]
    ordering = ["-created_at"]

    TRACKED_KARDEX_FIELDS = [
        "mobility_status",
        "dietary_requirements",
        "allergies",
        "iv_access",
        "code_status",
        "code_status_notes",
        "current_medications",
        "iv_fluids",
        "hygiene_precautions",
        "maternity_continuity_action",
        "maternity_continuity_notes",
        "fall_risk",
        "pressure_sore_risk",
        "isolation_required",
        "isolation_type",
    ]

    @staticmethod
    def _snapshot_care_plan_entry(entry: NursingCarePlanEntry) -> dict:
        """Compact snapshot used for care-plan change history and audit logs."""
        return {
            "implementation": entry.implementation,
            "evaluation": entry.evaluation,
            "status": entry.status,
            "last_reviewed_at": (
                entry.last_reviewed_at.isoformat() if entry.last_reviewed_at else None
            ),
        }

    def perform_update(self, serializer):
        """Persist kardex updates and append field-change history for tracked fields."""
        instance = serializer.instance
        previous_values = {
            field: getattr(instance, field, None) for field in self.TRACKED_KARDEX_FIELDS
        }
        updated_instance = serializer.save()

        changed_fields: list[str] = []
        history_entries: list[KardexFieldChange] = []
        for field_name in self.TRACKED_KARDEX_FIELDS:
            if field_name not in serializer.validated_data:
                continue

            old_value = previous_values.get(field_name)
            new_value = getattr(updated_instance, field_name, None)
            if old_value == new_value:
                continue

            changed_fields.append(field_name)
            history_entries.append(
                KardexFieldChange(
                    kardex=updated_instance,
                    field_name=field_name,
                    old_value="" if old_value is None else str(old_value),
                    new_value="" if new_value is None else str(new_value),
                    changed_by=self.request.user,
                )
            )

        if history_entries:
            KardexFieldChange.objects.bulk_create(history_entries)
            AuditLog.log(
                action="kardex_update",
                user=self.request.user,
                resource_type="NursingKardex",
                resource_id=updated_instance.id,
                details={
                    "admission_number": updated_instance.admission.admission_number,
                    "updated_fields": changed_fields,
                },
                ip_address=get_client_ip(self.request),
            )

    @action(detail=True, methods=["post"], url_path="add-schedule-item")
    def add_schedule_item(self, request, pk=None):
        """Add a scheduled treatment/test/vitals/medication item to the kardex."""
        kardex = self.get_object()
        serializer = KardexScheduleItemCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        item = KardexScheduleItem.objects.create(
            kardex=kardex,
            created_by=request.user,
            **serializer.validated_data,
        )

        AuditLog.log(
            action="kardex_schedule_item_create",
            user=request.user,
            resource_type="KardexScheduleItem",
            resource_id=item.id,
            details={
                "kardex_id": kardex.id,
                "admission_number": kardex.admission.admission_number,
                "item_type": item.item_type,
                "scheduled_for": item.scheduled_for.isoformat(),
            },
            ip_address=get_client_ip(request),
        )

        return Response(KardexScheduleItemSerializer(item).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch"], url_path=r"update-schedule-item/(?P<item_id>\d+)")
    def update_schedule_item(self, request, pk=None, item_id=None):
        """Update an existing kardex schedule item."""
        kardex = self.get_object()
        try:
            item = kardex.schedule_items.get(id=item_id)
        except KardexScheduleItem.DoesNotExist:
            return Response({"error": "Schedule item not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = KardexScheduleItemUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not serializer.validated_data:
            return Response(
                {"error": "No valid fields to update"}, status=status.HTTP_400_BAD_REQUEST
            )

        for field_name, value in serializer.validated_data.items():
            setattr(item, field_name, value)
        item.save(update_fields=list(serializer.validated_data.keys()) + ["updated_at"])

        AuditLog.log(
            action="kardex_schedule_item_update",
            user=request.user,
            resource_type="KardexScheduleItem",
            resource_id=item.id,
            details={
                "kardex_id": kardex.id,
                "admission_number": kardex.admission.admission_number,
                "updated_fields": list(serializer.validated_data.keys()),
            },
            ip_address=get_client_ip(request),
        )

        return Response(KardexScheduleItemSerializer(item).data)

    @action(detail=True, methods=["delete"], url_path=r"delete-schedule-item/(?P<item_id>\d+)")
    def delete_schedule_item(self, request, pk=None, item_id=None):
        """Delete a kardex schedule item."""
        kardex = self.get_object()
        try:
            item = kardex.schedule_items.get(id=item_id)
        except KardexScheduleItem.DoesNotExist:
            return Response({"error": "Schedule item not found"}, status=status.HTTP_404_NOT_FOUND)

        deleted_details = {
            "kardex_id": kardex.id,
            "admission_number": kardex.admission.admission_number,
            "item_id": item.id,
            "item_type": item.item_type,
            "title": item.title,
        }
        item.delete()

        AuditLog.log(
            action="kardex_schedule_item_delete",
            user=request.user,
            resource_type="KardexScheduleItem",
            resource_id=item_id,
            details=deleted_details,
            ip_address=get_client_ip(request),
        )

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="add-shift-note")
    def add_shift_note(self, request, pk=None):
        """
        Add a shift note to the kardex.

        Request body:
        - shift: DAY or NIGHT
        - content: Note content
        """
        kardex = self.get_object()
        shift = request.data.get("shift")
        content = request.data.get("content")

        if not shift or not content:
            return Response(
                {"error": "Shift and content are required"}, status=status.HTTP_400_BAD_REQUEST
            )

        note = KardexShiftNote.objects.create(
            kardex=kardex, shift=shift, nurse=request.user, content=content
        )

        # Log shift note creation
        AuditLog.log(
            action="kardex_shift_note_create",
            user=request.user,
            resource_type="KardexShiftNote",
            resource_id=note.id,
            details={
                "kardex_id": kardex.id,
                "admission_number": kardex.admission.admission_number,
                "shift": shift,
            },
            ip_address=get_client_ip(request),
        )

        serializer = KardexShiftNoteSerializer(note)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="add-handover-note")
    def add_handover_note(self, request, pk=None):
        """
        Add a handover note to the kardex.

        Request body:
        - incoming_nurse: User ID of incoming nurse
        - shift_ending: DAY or NIGHT
        - pending_tasks: Tasks for next shift
        - escalations: Issues escalated (optional)
        """
        kardex = self.get_object()
        incoming_nurse_id = request.data.get("incoming_nurse")
        shift_ending = request.data.get("shift_ending")
        pending_tasks = request.data.get("pending_tasks")
        escalations = request.data.get("escalations", "")

        if not incoming_nurse_id or not shift_ending or not pending_tasks:
            return Response(
                {"error": "incoming_nurse, shift_ending, and pending_tasks are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            incoming_nurse = User.objects.get(id=incoming_nurse_id)
        except User.DoesNotExist:
            return Response({"error": "Incoming nurse not found"}, status=status.HTTP_404_NOT_FOUND)

        note = KardexHandoverNote.objects.create(
            kardex=kardex,
            outgoing_nurse=request.user,
            incoming_nurse=incoming_nurse,
            shift_ending=shift_ending,
            pending_tasks=pending_tasks,
            escalations=escalations,
        )

        # Log handover note creation
        AuditLog.log(
            action="kardex_handover_note_create",
            user=request.user,
            resource_type="KardexHandoverNote",
            resource_id=note.id,
            details={
                "kardex_id": kardex.id,
                "admission_number": kardex.admission.admission_number,
                "shift_ending": shift_ending,
                "incoming_nurse": incoming_nurse.username,
            },
            ip_address=get_client_ip(request),
        )

        serializer = KardexHandoverNoteSerializer(note)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="add-care-plan-entry")
    def add_care_plan_entry(self, request, pk=None):
        """
        Add a nursing care plan entry to the kardex.

        Request body:
        - recorded_at: Date/time of the entry
        - assessment: Assessment findings / cluster of cues
        - nursing_diagnosis: Nursing diagnosis
        - goal_and_outcome_criteria: Goals and outcome criteria
        - plan_of_action: Nursing plan of action / interventions
        - scientific_rationale: Scientific rationale
        - implementation: What was implemented (optional)
        - evaluation: Evaluation of outcomes (optional)
        - status: ACTIVE / RESOLVED / ONGOING (default: ACTIVE)
        """
        kardex = self.get_object()
        serializer = NursingCarePlanEntryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        entry = NursingCarePlanEntry.objects.create(
            kardex=kardex,
            recorded_by=request.user,
            **serializer.validated_data,
        )

        NursingCarePlanEntryChange.objects.create(
            care_plan_entry=entry,
            action="CREATE",
            changed_by=request.user,
            changed_fields=[
                "assessment",
                "nursing_diagnosis",
                "goal_and_outcome_criteria",
                "plan_of_action",
                "scientific_rationale",
                "implementation",
                "evaluation",
                "status",
            ],
            before_data={},
            after_data=self._snapshot_care_plan_entry(entry),
            notes="Care plan entry created",
        )

        # Log care plan entry creation
        AuditLog.log(
            action="kardex_care_plan_entry_create",
            user=request.user,
            resource_type="NursingCarePlanEntry",
            resource_id=entry.id,
            details={
                "kardex_id": kardex.id,
                "admission_number": kardex.admission.admission_number,
                "nursing_diagnosis": entry.nursing_diagnosis[:100],
                "status": entry.status,
            },
            ip_address=get_client_ip(request),
        )

        result_serializer = NursingCarePlanEntrySerializer(entry)
        return Response(result_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch"], url_path=r"update-care-plan-entry/(?P<entry_id>\d+)")
    def update_care_plan_entry(self, request, pk=None, entry_id=None):
        """
        Update a nursing care plan entry (e.g., add implementation/evaluation).

        Only the following fields can be updated:
        - implementation, evaluation, status

        Entries in terminal statuses (RESOLVED, DISCONTINUED) cannot be updated.
        """
        kardex = self.get_object()
        try:
            entry = kardex.care_plan_entries.get(id=entry_id)
        except NursingCarePlanEntry.DoesNotExist:
            return Response(
                {"error": "Care plan entry not found"}, status=status.HTTP_404_NOT_FOUND
            )

        if entry.status in NursingCarePlanEntry.TERMINAL_STATUSES:
            return Response(
                {"error": f"Cannot update a {entry.get_status_display().lower()} care plan entry"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        allowed_fields = {"implementation", "evaluation", "status"}
        update_data = {k: v for k, v in request.data.items() if k in allowed_fields}

        if not update_data:
            return Response(
                {"error": "No valid fields to update. Allowed: implementation, evaluation, status"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate status transition
        new_status = update_data.get("status")
        if new_status and new_status not in dict(NursingCarePlanEntry.STATUS_CHOICES):
            return Response(
                {"error": f"Invalid status: {new_status}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        before_snapshot = self._snapshot_care_plan_entry(entry)
        previous_status = entry.status

        # Any implementation/evaluation/status update is treated as a clinical review.
        entry.last_reviewed_at = timezone.now()

        for field, value in update_data.items():
            setattr(entry, field, value)
        entry.save(update_fields=list(update_data.keys()) + ["last_reviewed_at", "updated_at"])

        after_snapshot = self._snapshot_care_plan_entry(entry)
        status_transitioned_to_resolved = (
            "status" in update_data and previous_status != "RESOLVED" and entry.status == "RESOLVED"
        )
        history_action = "RESOLVE" if status_transitioned_to_resolved else "UPDATE"
        NursingCarePlanEntryChange.objects.create(
            care_plan_entry=entry,
            action=history_action,
            changed_by=request.user,
            changed_fields=list(update_data.keys()) + ["last_reviewed_at"],
            before_data=before_snapshot,
            after_data=after_snapshot,
            notes=(
                "Care plan resolved via single-entry update"
                if status_transitioned_to_resolved
                else "Care plan entry updated"
            ),
        )

        # Log care plan entry update
        AuditLog.log(
            action="kardex_care_plan_entry_update",
            user=request.user,
            resource_type="NursingCarePlanEntry",
            resource_id=entry.id,
            details={
                "kardex_id": kardex.id,
                "admission_number": kardex.admission.admission_number,
                "updated_fields": list(update_data.keys()),
                "before": before_snapshot,
                "after": after_snapshot,
            },
            ip_address=get_client_ip(request),
        )

        result_serializer = NursingCarePlanEntrySerializer(entry)
        return Response(result_serializer.data)

    @action(detail=True, methods=["post"], url_path="resolve-all-care-plans")
    def resolve_all_care_plans(self, request, pk=None):
        """
        Bulk-resolve all active/ongoing care plan entries for discharge clearance.

        Sets all non-terminal entries to RESOLVED. Optionally accepts:
        - evaluation: str — evaluation note applied to all resolved entries
        """
        kardex = self.get_object()
        evaluation = request.data.get("evaluation", "")

        pending_entries = kardex.care_plan_entries.filter(status__in=["ACTIVE", "ONGOING"])
        count = pending_entries.count()

        if count == 0:
            return Response(
                {"message": "No active care plan entries to resolve", "resolved_count": 0}
            )

        resolved_entries = []
        history_rows = []
        review_timestamp = timezone.now()
        for entry in pending_entries:
            before_snapshot = self._snapshot_care_plan_entry(entry)
            entry.status = "RESOLVED"
            if evaluation:
                entry.evaluation = evaluation
            entry.last_reviewed_at = review_timestamp
            entry.save(update_fields=["status", "evaluation", "last_reviewed_at", "updated_at"])
            resolved_entries.append(entry.id)
            history_rows.append(
                NursingCarePlanEntryChange(
                    care_plan_entry=entry,
                    action="BULK_RESOLVE",
                    changed_by=request.user,
                    changed_fields=["status", "evaluation", "last_reviewed_at"],
                    before_data=before_snapshot,
                    after_data=self._snapshot_care_plan_entry(entry),
                    notes="Care plan entry resolved via bulk action",
                )
            )

        if history_rows:
            NursingCarePlanEntryChange.objects.bulk_create(history_rows)

        AuditLog.log(
            action="kardex_care_plan_bulk_resolve",
            user=request.user,
            resource_type="NursingKardex",
            resource_id=kardex.id,
            details={
                "admission_number": kardex.admission.admission_number,
                "resolved_count": count,
                "resolved_entry_ids": resolved_entries,
                "evaluation": evaluation[:200] if evaluation else "",
            },
            ip_address=get_client_ip(request),
        )

        return Response(
            {"message": f"{count} care plan entry(ies) resolved", "resolved_count": count}
        )

    @action(
        detail=True, methods=["post"], url_path=r"discontinue-care-plan-entry/(?P<entry_id>\d+)"
    )
    def discontinue_care_plan_entry(self, request, pk=None, entry_id=None):
        """
        Discontinue a care plan entry (e.g., plan abandoned, patient refused).

        Requires:
        - reason: str — reason for discontinuation (stored in evaluation field)
        """
        kardex = self.get_object()
        try:
            entry = kardex.care_plan_entries.get(id=entry_id)
        except NursingCarePlanEntry.DoesNotExist:
            return Response(
                {"error": "Care plan entry not found"}, status=status.HTTP_404_NOT_FOUND
            )

        if entry.status in NursingCarePlanEntry.TERMINAL_STATUSES:
            return Response(
                {
                    "error": f"Cannot discontinue a {entry.get_status_display().lower()} care plan entry"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = request.data.get("reason", "").strip()
        if not reason:
            return Response(
                {"error": "A reason is required to discontinue a care plan entry"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        before_snapshot = self._snapshot_care_plan_entry(entry)

        entry.status = "DISCONTINUED"
        entry.evaluation = (
            f"[Discontinued] {reason}"
            if not entry.evaluation
            else f"{entry.evaluation}\n[Discontinued] {reason}"
        )
        entry.last_reviewed_at = timezone.now()
        entry.save(update_fields=["status", "evaluation", "last_reviewed_at", "updated_at"])

        after_snapshot = self._snapshot_care_plan_entry(entry)
        NursingCarePlanEntryChange.objects.create(
            care_plan_entry=entry,
            action="DISCONTINUE",
            changed_by=request.user,
            changed_fields=["status", "evaluation", "last_reviewed_at"],
            before_data=before_snapshot,
            after_data=after_snapshot,
            notes=reason,
        )

        AuditLog.log(
            action="kardex_care_plan_entry_discontinue",
            user=request.user,
            resource_type="NursingCarePlanEntry",
            resource_id=entry.id,
            details={
                "kardex_id": kardex.id,
                "admission_number": kardex.admission.admission_number,
                "reason": reason[:200],
                "before": before_snapshot,
                "after": after_snapshot,
            },
            ip_address=get_client_ip(request),
        )

        result_serializer = NursingCarePlanEntrySerializer(entry)
        return Response(result_serializer.data)

    @action(detail=True, methods=["get"], url_path=r"care-plan-entry-history/(?P<entry_id>\d+)")
    def care_plan_entry_history(self, request, pk=None, entry_id=None):
        """List change history entries for a single care-plan entry."""
        kardex = self.get_object()
        try:
            entry = kardex.care_plan_entries.get(id=entry_id)
        except NursingCarePlanEntry.DoesNotExist:
            return Response(
                {"error": "Care plan entry not found"}, status=status.HTTP_404_NOT_FOUND
            )

        history_qs = entry.change_history.select_related("changed_by").all()
        serializer = NursingCarePlanEntryChangeSerializer(history_qs, many=True)
        return Response(serializer.data)
