"""
What this file is for: inter-facility transfer workflow API actions and state transitions.
How to use: imported and re-exported by ``inpatient.views`` to preserve router imports.
Supported inputs/args: DRF ViewSet payloads and query params for transfer workflow endpoints.
"""

# ruff: noqa: ARG002

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import NestedTenantScopeMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import (
    ReadRequiresModelPermission,
    WriteRequiresRolePermission,
    get_client_ip,
)

from ..models import Admission, Bed, InterFacilityTransfer, InterFacilityTransferEvent, Ward
from ..serializers import (
    AdmissionSerializer,
    InterFacilityTransferEventSerializer,
    InterFacilityTransferSerializer,
)
from ..services.bed_assignment import NoBedAvailableError, bed_assignment_service


class InterFacilityTransferViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """Foundation API for inter-facility transfer workflow records."""

    tenant_facility_chain = "source_admission__facility"
    tenant_org_chain = "source_admission__organization"
    queryset = InterFacilityTransfer.objects.select_related(
        "source_admission",
        "source_discharge",
        "destination_admission",
        "patient",
        "source_facility",
        "destination_facility",
        "requested_by",
        "accepted_by",
        "dispatched_by",
        "arrived_by",
        "cancelled_by",
    ).prefetch_related(
        "timeline_events__actor",
    )
    serializer_class = InterFacilityTransferSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = [
        "source_admission",
        "status",
        "priority",
        "reason_code",
        "source_facility",
        "destination_facility",
    ]
    search_fields = [
        "transfer_number",
        "source_admission__admission_number",
        "patient__first_name",
        "patient__last_name",
        "destination_facility_name",
    ]
    ordering_fields = ["created_at", "updated_at", "status", "priority"]
    ordering = ["-created_at"]

    def get_queryset(self):
        self._resolve_tenant_context()
        qs = self.queryset
        user = self.request.user
        if user.is_superuser:
            return qs

        profile = getattr(user, "staff_profile", None)
        if profile is None:
            return qs.none()

        facility_ids = self._user_facility_ids(user)
        if not facility_ids:
            return qs.none()

        qs = qs.filter(source_admission__organization_id=profile.organization_id).filter(
            Q(source_facility_id__in=facility_ids) | Q(destination_facility_id__in=facility_ids)
        )

        active_facility = getattr(self.request, "facility", None)
        if active_facility is not None:
            qs = qs.filter(
                Q(source_facility_id=active_facility.id)
                | Q(destination_facility_id=active_facility.id)
            )
        return qs

    @staticmethod
    def _user_facility_ids(user) -> set[int]:
        profile = getattr(user, "staff_profile", None)
        if profile is None:
            return set()
        facility_ids = set()
        if profile.primary_facility_id:
            facility_ids.add(profile.primary_facility_id)
        secondary_facilities = getattr(profile, "secondary_facilities", None)
        if secondary_facilities is not None:
            secondary_ids = secondary_facilities.values_list("id", flat=True)
            facility_ids.update(secondary_ids)
        return facility_ids

    def _ensure_source_actor(self, transfer):
        user = self.request.user
        if user.is_superuser:
            return
        active_facility = getattr(self.request, "facility", None)
        if active_facility is not None and active_facility.id != transfer.source_facility_id:
            raise PermissionDenied(
                "This action must be performed from the source facility context."
            )
        if transfer.source_facility_id not in self._user_facility_ids(user):
            raise PermissionDenied("Only source-facility staff can perform this transfer action.")

    def _ensure_destination_actor(self, transfer):
        user = self.request.user
        if user.is_superuser:
            return
        destination_id = transfer.destination_facility_id
        if not destination_id:
            raise PermissionDenied(
                "Destination facility must be mapped before this action can be performed."
            )
        if destination_id not in self._user_facility_ids(user):
            raise PermissionDenied(
                "Only destination-facility staff can perform this transfer action."
            )
        active_facility = getattr(self.request, "facility", None)
        if active_facility is not None and active_facility.id != destination_id:
            raise PermissionDenied(
                "This action must be performed from the destination facility context."
            )

    def _ensure_action_permission(self, codename: str):
        user = self.request.user
        if user.is_superuser:
            return
        app_label = InterFacilityTransfer._meta.app_label
        if not user.has_perm(f"{app_label}.{codename}"):
            raise PermissionDenied(f"Missing required permission: {app_label}.{codename}.")

    def perform_create(self, serializer):
        instance = serializer.save(requested_by=self.request.user)
        self._record_timeline_event(
            transfer=instance,
            event_type=InterFacilityTransferEvent.EventType.CREATED,
            actor=self.request.user,
            from_status="",
            to_status=instance.status,
            note="Transfer request created.",
        )

        AuditLog.log(
            action="interfacility_transfer_create",
            user=self.request.user,
            resource_type="InterFacilityTransfer",
            resource_id=instance.id,
            details={
                "transfer_number": instance.transfer_number,
                "source_admission": instance.source_admission_id,
                "source_facility": instance.source_facility.name,
                "destination_facility": instance.destination_facility_name,
                "status": instance.status,
            },
            ip_address=get_client_ip(self.request),
        )

    def _transition_transfer(self, request, transfer, *, to_status, action, reason_required=False):
        reason = str(request.data.get("reason", "") or "").strip()
        if reason_required and not reason:
            raise ValidationError({"reason": "This field is required."})

        previous_status = transfer.status

        try:
            transfer.transition_to(to_status, user=request.user, reason=reason)
        except DjangoValidationError as exc:
            detail = exc.message_dict if hasattr(exc, "message_dict") else str(exc)
            raise ValidationError(detail) from exc

        self._record_timeline_event(
            transfer=transfer,
            event_type=self._event_type_for_status(to_status),
            actor=request.user,
            from_status=previous_status,
            to_status=to_status,
            note=reason,
        )

        AuditLog.log(
            action=action,
            user=request.user,
            resource_type="InterFacilityTransfer",
            resource_id=transfer.id,
            details={
                "transfer_number": transfer.transfer_number,
                "status": transfer.status,
                **({"reason": reason} if reason else {}),
            },
            ip_address=get_client_ip(request),
        )
        serializer = self.get_serializer(transfer)
        return Response(serializer.data)

    @staticmethod
    def _as_bool(value) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "on"}
        return bool(value)

    def _resolve_destination_ward(self, request, transfer):
        destination_ward_id = request.data.get("destination_ward")
        if destination_ward_id:
            ward = Ward.objects.filter(
                pk=destination_ward_id,
                facility_id=transfer.destination_facility_id,
                is_active=True,
            ).first()
            if ward is None:
                raise ValidationError(
                    {
                        "destination_ward": (
                            "Selected ward does not exist in the destination facility."
                        )
                    }
                )
            return ward

        source_ward_type = transfer.source_admission.ward.ward_type
        ward = (
            Ward.objects.filter(
                facility_id=transfer.destination_facility_id,
                is_active=True,
                ward_type=source_ward_type,
            )
            .order_by("id")
            .first()
        )
        if ward is not None:
            return ward

        fallback_ward = (
            Ward.objects.filter(facility_id=transfer.destination_facility_id, is_active=True)
            .order_by("id")
            .first()
        )
        if fallback_ward is not None:
            return fallback_ward

        raise ValidationError(
            {
                "destination_ward": (
                    "No active wards available in destination facility for auto-admission."
                )
            }
        )

    def _create_destination_admission(self, request, transfer, *, require_source_finalized=True):
        if transfer.destination_facility_id is None:
            raise ValidationError(
                {"destination_facility": ("Destination facility must be mapped before auto-admit.")}
            )

        if require_source_finalized and transfer.source_admission.admission_status == "ACTIVE":
            raise ValidationError(
                {
                    "source_admission": (
                        "Source admission must be finalized (not ACTIVE) before destination auto-admit."
                    )
                }
            )

        if transfer.destination_admission_id:
            return transfer.destination_admission

        if (
            Admission.objects.filter(
                patient=transfer.patient,
                admission_status="ACTIVE",
            )
            .exclude(pk=transfer.source_admission_id)
            .exists()
        ):
            raise ValidationError(
                {
                    "patient": (
                        "Patient already has an active admission. Resolve it before destination auto-admit."
                    )
                }
            )

        ward = self._resolve_destination_ward(request, transfer)

        destination_bed_id = request.data.get("destination_bed")
        auto_assign_bed = self._as_bool(request.data.get("auto_assign_bed", True))
        bed = None
        if destination_bed_id:
            bed = Bed.objects.filter(pk=destination_bed_id, ward=ward).first()
            if bed is None:
                raise ValidationError(
                    {"destination_bed": ("Selected bed does not belong to the destination ward.")}
                )
            if bed.status != "AVAILABLE":
                raise ValidationError(
                    {"destination_bed": ("Selected destination bed is not available.")}
                )
        elif auto_assign_bed:
            try:
                bed = bed_assignment_service.auto_assign_bed(
                    ward=ward,
                    user=request.user,
                    ip_address=get_client_ip(request),
                )
            except NoBedAvailableError as exc:
                raise ValidationError({"destination_bed": str(exc)}) from exc
        else:
            raise ValidationError(
                {"destination_bed": ("Provide destination_bed or set auto_assign_bed=true.")}
            )

        source_admission = transfer.source_admission
        admission_payload = {
            "patient": transfer.patient_id,
            "admission_date": request.data.get("admission_date") or timezone.now(),
            "admitting_diagnosis": request.data.get("admitting_diagnosis")
            or source_admission.admitting_diagnosis,
            "admitting_diagnosis_text": request.data.get("admitting_diagnosis_text")
            or source_admission.admitting_diagnosis_text
            or transfer.reason_details,
            "admitting_officer": request.user.id,
            "attending_doctor": request.data.get("attending_doctor"),
            "ward": ward.id,
            "bed": bed.id,
            "payer_type": request.data.get("payer_type") or source_admission.payer_type,
            "insurance_details": request.data.get("insurance_details")
            or source_admission.insurance_details,
        }
        if source_admission.mch_registration_id:
            admission_payload["mch_registration"] = source_admission.mch_registration_id

        serializer = AdmissionSerializer(
            data=admission_payload,
            context={"request": request, "view": self},
        )
        serializer.is_valid(raise_exception=True)
        admission = serializer.save(
            organization=transfer.destination_facility.organization,
            facility=transfer.destination_facility,
        )
        transfer.destination_admission = admission
        transfer.save(update_fields=["destination_admission", "updated_at"])
        return admission

    @staticmethod
    def _event_type_for_status(status_value: str) -> str:
        mapping = {
            InterFacilityTransfer.TransferStatus.PENDING_ACCEPTANCE: InterFacilityTransferEvent.EventType.SUBMITTED,
            InterFacilityTransfer.TransferStatus.ACCEPTED: InterFacilityTransferEvent.EventType.ACCEPTED,
            InterFacilityTransfer.TransferStatus.REJECTED: InterFacilityTransferEvent.EventType.REJECTED,
            InterFacilityTransfer.TransferStatus.IN_TRANSIT: InterFacilityTransferEvent.EventType.DISPATCHED,
            InterFacilityTransfer.TransferStatus.ARRIVED: InterFacilityTransferEvent.EventType.ARRIVED,
            InterFacilityTransfer.TransferStatus.CANCELLED: InterFacilityTransferEvent.EventType.CANCELLED,
        }
        return mapping.get(status_value, InterFacilityTransferEvent.EventType.CREATED)

    @staticmethod
    def _record_timeline_event(
        *,
        transfer,
        event_type: str,
        actor,
        from_status: str,
        to_status: str,
        note: str = "",
        metadata: dict | None = None,
    ) -> None:
        InterFacilityTransferEvent.objects.create(
            transfer=transfer,
            event_type=event_type,
            actor=actor,
            from_status=from_status,
            to_status=to_status,
            note=note,
            metadata=metadata or {},
            occurred_at=timezone.now(),
        )

    @staticmethod
    def _latest_transfer_event(transfer, event_type: str):
        return (
            transfer.timeline_events.filter(event_type=event_type)
            .order_by("-occurred_at", "-id")
            .first()
        )

    def _has_pending_discharge_summary_request(self, transfer) -> bool:
        requested_event = self._latest_transfer_event(
            transfer, InterFacilityTransferEvent.EventType.DISCHARGE_SUMMARY_REQUESTED
        )
        if requested_event is None:
            return False
        shared_event = self._latest_transfer_event(
            transfer, InterFacilityTransferEvent.EventType.DISCHARGE_SUMMARY_SHARED
        )
        if shared_event is None:
            return True
        if requested_event.occurred_at > shared_event.occurred_at:
            return True
        if requested_event.occurred_at == shared_event.occurred_at:
            return requested_event.id > shared_event.id
        return False

    @staticmethod
    def _build_discharge_summary_snapshot(transfer) -> dict:
        discharge = transfer.source_discharge
        if discharge is not None:
            return {
                "snapshot_source": "DISCHARGE",
                "discharge_id": discharge.id,
                "discharge_type": discharge.discharge_type,
                "discharge_date": (
                    discharge.discharge_date.isoformat() if discharge.discharge_date else None
                ),
                "final_diagnosis": discharge.final_diagnosis,
                "final_diagnosis_text": discharge.final_diagnosis_text,
                "procedures_performed": discharge.procedures_performed,
                "treatment_summary": discharge.treatment_summary,
                "discharge_medications": discharge.discharge_medications,
                "follow_up_date": (
                    discharge.follow_up_date.isoformat() if discharge.follow_up_date else None
                ),
                "follow_up_instructions": discharge.follow_up_instructions,
                "patient_instructions": discharge.patient_instructions,
                "referral_facility": discharge.referral_facility,
                "referral_reason": discharge.referral_reason,
            }

        discharge_draft = getattr(transfer.source_admission, "discharge_draft", None)
        if discharge_draft is not None:
            primary_diagnosis = ""
            for diagnosis in discharge_draft.diagnoses or []:
                if diagnosis.get("role") == "PRIMARY":
                    primary_diagnosis = str(
                        diagnosis.get("description") or diagnosis.get("code") or ""
                    )
                    break
            return {
                "snapshot_source": "DISCHARGE_DRAFT",
                "discharge_draft_id": discharge_draft.id,
                "discharge_type": discharge_draft.discharge_type,
                "final_diagnosis_text": primary_diagnosis,
                "procedures_performed": discharge_draft.procedures_performed,
                "treatment_summary": discharge_draft.treatment_summary,
                "discharge_medications": discharge_draft.discharge_medications,
                "follow_up_date": (
                    discharge_draft.follow_up_date.isoformat()
                    if discharge_draft.follow_up_date
                    else None
                ),
                "follow_up_instructions": discharge_draft.follow_up_instructions,
                "patient_instructions": discharge_draft.patient_instructions,
                "referral_facility": discharge_draft.referral_facility,
                "referral_reason": discharge_draft.referral_reason,
            }

        return {}

    @action(detail=False, methods=["get"], url_path="destination-queue")
    def destination_queue(self, request):
        user = request.user
        facility_ids = self._user_facility_ids(user)
        if not user.is_superuser and not facility_ids:
            return Response([])

        statuses = [
            InterFacilityTransfer.TransferStatus.PENDING_ACCEPTANCE,
            InterFacilityTransfer.TransferStatus.ACCEPTED,
            InterFacilityTransfer.TransferStatus.IN_TRANSIT,
        ]
        qs = self.filter_queryset(self.get_queryset()).filter(status__in=statuses)
        if not user.is_superuser:
            qs = qs.filter(destination_facility_id__in=facility_ids)

        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="timeline")
    def timeline(self, request, pk=None):
        transfer = self.get_object()
        events = (
            transfer.timeline_events.select_related("actor").all().order_by("occurred_at", "id")
        )
        serializer = InterFacilityTransferEventSerializer(events, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="request-discharge-summary")
    def request_discharge_summary(self, request, pk=None):
        transfer = self.get_object()
        self._ensure_action_permission("accept_interfacility_transfer")
        self._ensure_destination_actor(transfer)
        request_note = str(request.data.get("note", "") or "").strip()

        if transfer.status in {
            InterFacilityTransfer.TransferStatus.DRAFT,
            InterFacilityTransfer.TransferStatus.REJECTED,
            InterFacilityTransfer.TransferStatus.CANCELLED,
        }:
            raise ValidationError(
                {
                    "status": (
                        "Discharge summary can only be requested for active transfer workflows."
                    )
                }
            )

        if self._has_pending_discharge_summary_request(transfer):
            raise ValidationError(
                {
                    "detail": (
                        "A discharge summary request is already pending source-facility approval."
                    )
                }
            )

        self._record_timeline_event(
            transfer=transfer,
            event_type=InterFacilityTransferEvent.EventType.DISCHARGE_SUMMARY_REQUESTED,
            actor=request.user,
            from_status=transfer.status,
            to_status=transfer.status,
            note=request_note
            or "Destination requested discharge summary/notes from source facility.",
            metadata={
                "requested_by_facility_id": transfer.destination_facility_id,
                **({"request_note": request_note} if request_note else {}),
            },
        )

        serializer = self.get_serializer(transfer)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="share-discharge-summary")
    def share_discharge_summary(self, request, pk=None):
        transfer = self.get_object()
        self._ensure_action_permission("submit_interfacility_transfer")
        self._ensure_source_actor(transfer)

        if transfer.source_discharge_id is None:
            admission_discharge = getattr(transfer.source_admission, "discharge", None)
            if admission_discharge is not None:
                transfer.source_discharge = admission_discharge
                transfer.save(update_fields=["source_discharge", "updated_at"])

        if transfer.source_discharge_id is None and not hasattr(
            transfer.source_admission, "discharge_draft"
        ):
            raise ValidationError(
                {
                    "source_discharge": (
                        "No finalized TRANSFERRED discharge or discharge draft is available "
                        "for this workflow yet."
                    )
                }
            )

        if not self._has_pending_discharge_summary_request(transfer):
            raise ValidationError({"detail": ("No pending destination request found.")})

        snapshot = self._build_discharge_summary_snapshot(transfer)
        self._record_timeline_event(
            transfer=transfer,
            event_type=InterFacilityTransferEvent.EventType.DISCHARGE_SUMMARY_SHARED,
            actor=request.user,
            from_status=transfer.status,
            to_status=transfer.status,
            note="Source shared discharge summary/notes with destination facility.",
            metadata={
                "shared_with_facility_id": transfer.destination_facility_id,
                "discharge_snapshot": snapshot,
            },
        )

        serializer = self.get_serializer(transfer)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, pk=None):
        transfer = self.get_object()
        self._ensure_action_permission("submit_interfacility_transfer")
        self._ensure_source_actor(transfer)
        return self._transition_transfer(
            request,
            transfer,
            to_status=InterFacilityTransfer.TransferStatus.PENDING_ACCEPTANCE,
            action="interfacility_transfer_submit",
        )

    @action(detail=True, methods=["post"], url_path="accept")
    def accept(self, request, pk=None):
        transfer = self.get_object()
        self._ensure_action_permission("accept_interfacility_transfer")
        self._ensure_destination_actor(transfer)
        with transaction.atomic():
            response = self._transition_transfer(
                request,
                transfer,
                to_status=InterFacilityTransfer.TransferStatus.ACCEPTED,
                action="interfacility_transfer_accept",
            )
            self._ensure_action_permission("add_admission")
            transfer.refresh_from_db(fields=["status", "destination_admission"])
            destination_admission = self._create_destination_admission(
                request,
                transfer,
                require_source_finalized=True,
            )
            self._record_timeline_event(
                transfer=transfer,
                event_type=InterFacilityTransferEvent.EventType.AUTO_ADMITTED,
                actor=request.user,
                from_status=transfer.status,
                to_status=transfer.status,
                note=(
                    "Auto-admitted at destination on acceptance as "
                    f"{destination_admission.admission_number}."
                ),
                metadata={
                    "destination_admission_id": destination_admission.id,
                    "destination_admission_number": destination_admission.admission_number,
                    "destination_ipd_encounter_id": destination_admission.ipd_encounter_id,
                    "trigger": "accept",
                },
            )
            AuditLog.log(
                action="interfacility_transfer_auto_admit_on_accept",
                user=request.user,
                resource_type="InterFacilityTransfer",
                resource_id=transfer.id,
                details={
                    "transfer_number": transfer.transfer_number,
                    "destination_admission_id": destination_admission.id,
                    "destination_admission_number": destination_admission.admission_number,
                    "destination_ipd_encounter_id": destination_admission.ipd_encounter_id,
                },
                ip_address=get_client_ip(request),
            )
            payload = dict(response.data)
            payload.update(
                {
                    "destination_admission_id": destination_admission.id,
                    "destination_admission_number": destination_admission.admission_number,
                    "destination_ipd_encounter_id": destination_admission.ipd_encounter_id,
                }
            )
            return Response(payload)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        transfer = self.get_object()
        self._ensure_action_permission("reject_interfacility_transfer")
        self._ensure_destination_actor(transfer)
        return self._transition_transfer(
            request,
            transfer,
            to_status=InterFacilityTransfer.TransferStatus.REJECTED,
            action="interfacility_transfer_reject",
            reason_required=True,
        )

    @action(detail=True, methods=["post"], url_path="dispatch")
    def mark_dispatch(self, request, pk=None):
        transfer = self.get_object()
        self._ensure_action_permission("dispatch_interfacility_transfer")
        self._ensure_source_actor(transfer)
        return self._transition_transfer(
            request,
            transfer,
            to_status=InterFacilityTransfer.TransferStatus.IN_TRANSIT,
            action="interfacility_transfer_dispatch",
        )

    @action(detail=True, methods=["post"], url_path="arrive")
    def mark_arrival(self, request, pk=None):
        transfer = self.get_object()
        self._ensure_action_permission("arrive_interfacility_transfer")
        self._ensure_destination_actor(transfer)
        return self._handle_arrival(request, transfer, force_auto_admit=False)

    def _handle_arrival(self, request, transfer, *, force_auto_admit: bool):
        auto_admit = force_auto_admit or self._as_bool(request.data.get("auto_admit", False))

        with transaction.atomic():
            response = self._transition_transfer(
                request,
                transfer,
                to_status=InterFacilityTransfer.TransferStatus.ARRIVED,
                action="interfacility_transfer_arrive",
            )

            if auto_admit:
                self._ensure_action_permission("add_admission")
                transfer.refresh_from_db(fields=["status"])
                admission = self._create_destination_admission(request, transfer)
                self._record_timeline_event(
                    transfer=transfer,
                    event_type=InterFacilityTransferEvent.EventType.AUTO_ADMITTED,
                    actor=request.user,
                    from_status=transfer.status,
                    to_status=transfer.status,
                    note=f"Auto-admitted at destination as {admission.admission_number}.",
                    metadata={
                        "destination_admission_id": admission.id,
                        "destination_admission_number": admission.admission_number,
                        "destination_ipd_encounter_id": admission.ipd_encounter_id,
                    },
                )
                AuditLog.log(
                    action="interfacility_transfer_auto_admit",
                    user=request.user,
                    resource_type="InterFacilityTransfer",
                    resource_id=transfer.id,
                    details={
                        "transfer_number": transfer.transfer_number,
                        "destination_admission_id": admission.id,
                        "destination_admission_number": admission.admission_number,
                        "destination_ipd_encounter_id": admission.ipd_encounter_id,
                    },
                    ip_address=get_client_ip(request),
                )
                payload = dict(response.data)
                payload.update(
                    {
                        "destination_admission_id": admission.id,
                        "destination_admission_number": admission.admission_number,
                        "destination_ipd_encounter_id": admission.ipd_encounter_id,
                    }
                )
                return Response(payload)

        return response

    @action(detail=True, methods=["post"], url_path="arrive-and-admit")
    def arrive_and_admit(self, request, pk=None):
        transfer = self.get_object()
        self._ensure_action_permission("arrive_interfacility_transfer")
        self._ensure_destination_actor(transfer)
        return self._handle_arrival(request, transfer, force_auto_admit=True)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        transfer = self.get_object()
        self._ensure_action_permission("cancel_interfacility_transfer")
        self._ensure_source_actor(transfer)
        return self._transition_transfer(
            request,
            transfer,
            to_status=InterFacilityTransfer.TransferStatus.CANCELLED,
            action="interfacility_transfer_cancel",
            reason_required=True,
        )
