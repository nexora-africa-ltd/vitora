"""
Views for the social work module.

Provides REST API endpoints for:
- SocialWorkReferral (referrals from clinical encounters)
- SocialWorkCase (case management)
- CaseNote (progress notes)
- SocialWorkIntervention (interventions applied)

Includes enhanced privacy controls for GBV/abuse cases.
"""

import contextlib

from django.db.models import Q
from django_filters import rest_framework as django_filters
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.models import AuditLog
from hmis.apps.social_work.models import (
    CaseNote,
    SocialWorkCase,
    SocialWorkIntervention,
    SocialWorkReferral,
)
from hmis.apps.social_work.serializers import (
    CaseNoteCreateSerializer,
    CaseNoteSerializer,
    SocialWorkCaseClosureSerializer,
    SocialWorkCaseCreateSerializer,
    SocialWorkCaseListSerializer,
    SocialWorkCaseSerializer,
    SocialWorkInterventionCompleteSerializer,
    SocialWorkInterventionCreateSerializer,
    SocialWorkInterventionSerializer,
    SocialWorkReferralAssignWorkerSerializer,
    SocialWorkReferralCreateSerializer,
    SocialWorkReferralListSerializer,
    SocialWorkReferralSerializer,
    SocialWorkReferralUpdateStatusSerializer,
)

# ==================== REFERRAL VIEWS ====================


class SocialWorkReferralFilter(django_filters.FilterSet):
    """Filter for SocialWorkReferral."""

    patient = django_filters.NumberFilter()
    status = django_filters.CharFilter(lookup_expr="iexact")
    urgency = django_filters.CharFilter(lookup_expr="iexact")
    reason = django_filters.CharFilter(lookup_expr="iexact")
    assigned_worker = django_filters.NumberFilter()
    referred_by = django_filters.NumberFilter()
    is_sensitive = django_filters.BooleanFilter()
    created_from = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    created_to = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")

    class Meta:
        model = SocialWorkReferral
        fields = [
            "patient",
            "status",
            "urgency",
            "reason",
            "assigned_worker",
            "referred_by",
            "is_sensitive",
        ]


class SocialWorkReferralViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing social work referrals.

    Provides CRUD operations plus custom actions for:
    - Updating referral status
    - Assigning social worker
    - Accepting referrals
    - Creating cases from referrals

    Sensitive referrals (GBV, abuse) require special permission.
    """

    queryset = SocialWorkReferral.objects.select_related(
        "patient",
        "encounter",
        "referred_by",
        "assigned_worker",
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = SocialWorkReferralFilter
    search_fields = [
        "referral_number",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "clinical_summary",
        "presenting_issues",
    ]
    ordering_fields = ["created_at", "status", "urgency", "reason"]
    ordering = ["-created_at"]

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "list":
            return SocialWorkReferralListSerializer
        if self.action == "create":
            return SocialWorkReferralCreateSerializer
        if self.action == "update_status":
            return SocialWorkReferralUpdateStatusSerializer
        if self.action == "assign_worker":
            return SocialWorkReferralAssignWorkerSerializer
        return SocialWorkReferralSerializer

    def get_queryset(self):
        """
        Filter queryset based on user permissions.

        Users without 'view_sensitive_sw_referral' permission
        cannot see GBV/abuse referrals.
        """
        qs = super().get_queryset()
        user = self.request.user

        # Check if user can view sensitive referrals
        if not user.has_perm("social_work.view_sensitive_sw_referral"):
            qs = qs.filter(is_sensitive=False)

        return qs

    def perform_create(self, serializer):
        """Create referral and log audit."""
        referral = serializer.save(referred_by=self.request.user)
        AuditLog.log(
            action="sw_referral_create",
            user=self.request.user,
            resource_type="SocialWorkReferral",
            resource_id=referral.id,
            details={
                "referral_number": referral.referral_number,
                "patient_id": referral.patient_id,
                "reason": referral.reason,
                "urgency": referral.urgency,
                "is_sensitive": referral.is_sensitive,
            },
        )
        self._created_referral = referral

    def create(self, request, *args, **kwargs):
        """Override create to return detail serializer."""
        response = super().create(request, *args, **kwargs)
        if hasattr(self, "_created_referral"):
            response.data = SocialWorkReferralSerializer(self._created_referral).data
        return response

    def perform_update(self, serializer):
        """Update referral and log audit."""
        referral = serializer.save()
        AuditLog.log(
            action="sw_referral_update",
            user=self.request.user,
            resource_type="SocialWorkReferral",
            resource_id=referral.id,
            details={
                "referral_number": referral.referral_number,
                "changes": serializer.validated_data,
            },
        )

    @action(detail=True, methods=["post"])
    def update_status(self, request, pk=None):
        """
        Update referral status with validation.

        POST /api/social-work/referrals/{id}/update_status/
        Body: {"status": "ACCEPTED", "notes": "Optional notes"}
        """
        referral = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        old_status = referral.status
        new_status = serializer.validated_data["status"]

        try:
            # Handle external referral details
            if new_status == "REFERRED_OUT":
                referral.external_agency = serializer.validated_data.get("external_agency", "")
                referral.external_contact = serializer.validated_data.get("external_contact", "")
                referral.save(update_fields=["external_agency", "external_contact"])

            referral.update_status(new_status, user=request.user)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.log(
            action="sw_referral_status_change",
            user=request.user,
            resource_type="SocialWorkReferral",
            resource_id=referral.id,
            details={
                "referral_number": referral.referral_number,
                "old_status": old_status,
                "new_status": new_status,
                "notes": serializer.validated_data.get("notes", ""),
            },
        )

        return Response(SocialWorkReferralSerializer(referral).data)

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        """
        Accept a referral (shortcut for update_status with ACCEPTED).

        POST /api/social-work/referrals/{id}/accept/
        """
        referral = self.get_object()

        if referral.status != "PENDING":
            return Response(
                {"error": f"Cannot accept referral with status '{referral.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            referral.update_status("ACCEPTED", user=request.user)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.log(
            action="sw_referral_accepted",
            user=request.user,
            resource_type="SocialWorkReferral",
            resource_id=referral.id,
            details={"referral_number": referral.referral_number},
        )

        return Response(SocialWorkReferralSerializer(referral).data)

    @action(detail=True, methods=["post"])
    def assign_worker(self, request, pk=None):
        """
        Assign social worker to referral.

        POST /api/social-work/referrals/{id}/assign_worker/
        Body: {"assigned_worker": <user_id>}
        """
        referral = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        worker = serializer.validated_data["assigned_worker"]
        referral.assigned_worker = worker
        referral.save(update_fields=["assigned_worker"])

        AuditLog.log(
            action="sw_worker_assigned",
            user=request.user,
            resource_type="SocialWorkReferral",
            resource_id=referral.id,
            details={
                "referral_number": referral.referral_number,
                "worker_id": worker.id,
                "worker_name": f"{worker.first_name} {worker.last_name}",
            },
        )

        return Response(SocialWorkReferralSerializer(referral).data)

    @action(detail=True, methods=["post"])
    def create_case(self, request, pk=None):
        """
        Create a social work case from this referral.

        POST /api/social-work/referrals/{id}/create_case/
        Body: {"title": "Case title", "case_type": "GBV", "goals": "Goals text"}
        """
        referral = self.get_object()

        # Check if case already exists for this referral
        if SocialWorkCase.objects.filter(referral=referral).exists():
            return Response(
                {"error": "A case already exists for this referral"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate required fields
        title = request.data.get("title", f"Case from {referral.referral_number}")
        case_type = request.data.get("case_type")
        goals = request.data.get("goals", "")

        if not case_type:
            # Infer case type from referral reason
            reason_to_type_map = {
                "GBV": "GBV",
                "CHILD_ABUSE": "CHILD_PROTECTION",
                "CHILD_PROTECTION": "CHILD_PROTECTION",
                "ELDER_ABUSE": "ELDER_CARE",
                "MENTAL_HEALTH": "MENTAL_HEALTH",
                "SUBSTANCE_ABUSE": "SUBSTANCE_ABUSE",
                "FINANCIAL_HARDSHIP": "FINANCIAL",
                "DISCHARGE_PLANNING": "DISCHARGE",
                "GRIEF_BEREAVEMENT": "GRIEF",
                "FAMILY_CONFLICT": "FAMILY",
                "HIV_SUPPORT": "HIV_SUPPORT",
                "DISABILITY_SUPPORT": "DISABILITY",
            }
            case_type = reason_to_type_map.get(referral.reason, "GENERAL")

        # Create the case
        case = SocialWorkCase.objects.create(
            patient=referral.patient,
            referral=referral,
            assigned_worker=referral.assigned_worker or request.user,
            case_type=case_type,
            title=title,
            presenting_problem=referral.presenting_issues,
            goals=goals or "Goals to be defined",
            risk_level="MODERATE" if referral.urgency != "ROUTINE" else "LOW",
            priority="HIGH" if referral.urgency == "EMERGENCY" else "MEDIUM",
        )

        # Update referral status to IN_PROGRESS
        if referral.status in ["PENDING", "ACCEPTED"]:
            with contextlib.suppress(Exception):
                referral.update_status("IN_PROGRESS", user=request.user)

        AuditLog.log(
            action="sw_case_create_from_referral",
            user=request.user,
            resource_type="SocialWorkCase",
            resource_id=case.id,
            details={
                "case_number": case.case_number,
                "referral_number": referral.referral_number,
                "case_type": case_type,
            },
        )

        return Response(
            SocialWorkCaseSerializer(case).data,
            status=status.HTTP_201_CREATED,
        )


# ==================== CASE VIEWS ====================


class SocialWorkCaseFilter(django_filters.FilterSet):
    """Filter for SocialWorkCase."""

    patient = django_filters.NumberFilter()
    status = django_filters.CharFilter(lookup_expr="iexact")
    case_type = django_filters.CharFilter(lookup_expr="iexact")
    risk_level = django_filters.CharFilter(lookup_expr="iexact")
    priority = django_filters.CharFilter(lookup_expr="iexact")
    assigned_worker = django_filters.NumberFilter()
    supervisor = django_filters.NumberFilter()
    is_sensitive = django_filters.BooleanFilter()
    is_open = django_filters.BooleanFilter(method="filter_is_open")
    overdue = django_filters.BooleanFilter(method="filter_overdue")
    opened_from = django_filters.DateFilter(field_name="opened_at", lookup_expr="date__gte")
    opened_to = django_filters.DateFilter(field_name="opened_at", lookup_expr="date__lte")

    class Meta:
        model = SocialWorkCase
        fields = [
            "patient",
            "status",
            "case_type",
            "risk_level",
            "priority",
            "assigned_worker",
            "supervisor",
            "is_sensitive",
        ]

    def filter_is_open(self, queryset, name, value):
        """Filter by open/closed status."""
        open_statuses = ["OPEN", "IN_PROGRESS", "ON_HOLD"]
        if value:
            return queryset.filter(status__in=open_statuses)
        return queryset.exclude(status__in=open_statuses)

    def filter_overdue(self, queryset, name, value):
        """Filter by overdue review status."""
        from datetime import date
        if value:
            return queryset.filter(
                next_review_date__lt=date.today(),
                status__in=["OPEN", "IN_PROGRESS"],
            )
        return queryset


class SocialWorkCaseViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing social work cases.

    Provides CRUD operations plus custom actions for:
    - Updating case status
    - Assigning workers
    - Closing cases with outcomes

    Sensitive cases (GBV, abuse) require special permission.
    """

    queryset = SocialWorkCase.objects.select_related(
        "patient",
        "referral",
        "assigned_worker",
        "supervisor",
    ).prefetch_related("notes", "interventions")
    permission_classes = [IsAuthenticated]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = SocialWorkCaseFilter
    search_fields = [
        "case_number",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "title",
        "presenting_problem",
        "goals",
    ]
    ordering_fields = ["opened_at", "status", "risk_level", "priority", "next_review_date"]
    ordering = ["-opened_at"]

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "list":
            return SocialWorkCaseListSerializer
        if self.action == "create":
            return SocialWorkCaseCreateSerializer
        if self.action == "close":
            return SocialWorkCaseClosureSerializer
        return SocialWorkCaseSerializer

    def get_queryset(self):
        """
        Filter queryset based on user permissions.

        Users without 'view_sensitive_sw_case' permission
        cannot see GBV/abuse cases.
        """
        qs = super().get_queryset()
        user = self.request.user

        # Check if user can view sensitive cases
        if not user.has_perm("social_work.view_sensitive_sw_case"):
            qs = qs.filter(is_sensitive=False)

        # Additional filter for restricted cases
        restricted_qs = qs.filter(
            confidentiality_level__in=["RESTRICTED", "HIGHLY_RESTRICTED"]
        )
        # User must be in access_restricted_to or be the assigned worker/supervisor
        if restricted_qs.exists():
            qs = qs.filter(
                Q(confidentiality_level="STANDARD") |
                Q(assigned_worker=user) |
                Q(secondary_worker=user) |
                Q(supervisor=user) |
                Q(access_restricted_to=user)
            ).distinct()

        return qs

    def perform_create(self, serializer):
        """Create case and log audit."""
        case = serializer.save(assigned_worker=self.request.user)
        AuditLog.log(
            action="sw_case_create",
            user=self.request.user,
            resource_type="SocialWorkCase",
            resource_id=case.id,
            details={
                "case_number": case.case_number,
                "patient_id": case.patient_id,
                "case_type": case.case_type,
                "is_sensitive": case.is_sensitive,
            },
        )
        self._created_case = case

    def create(self, request, *args, **kwargs):
        """Override create to return detail serializer."""
        response = super().create(request, *args, **kwargs)
        if hasattr(self, "_created_case"):
            response.data = SocialWorkCaseSerializer(self._created_case).data
        return response

    def perform_update(self, serializer):
        """Update case and log audit."""
        case = serializer.save()
        AuditLog.log(
            action="sw_case_update",
            user=self.request.user,
            resource_type="SocialWorkCase",
            resource_id=case.id,
            details={
                "case_number": case.case_number,
                "changes": serializer.validated_data,
            },
        )

    @action(detail=True, methods=["post"])
    def update_status(self, request, pk=None):
        """
        Update case status.

        POST /api/social-work/cases/{id}/update_status/
        Body: {"status": "IN_PROGRESS"}
        """
        case = self.get_object()
        new_status = request.data.get("status")

        if not new_status:
            return Response(
                {"error": "Status is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_status = case.status

        try:
            case.update_status(new_status, user=request.user)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.log(
            action="sw_case_status_change",
            user=request.user,
            resource_type="SocialWorkCase",
            resource_id=case.id,
            details={
                "case_number": case.case_number,
                "old_status": old_status,
                "new_status": new_status,
            },
        )

        return Response(SocialWorkCaseSerializer(case).data)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        """
        Close case with outcome documentation.

        POST /api/social-work/cases/{id}/close/
        Body: {"status": "CLOSED_RESOLVED", "outcome": "Summary...", "outcome_rating": "FULLY_ACHIEVED"}
        """
        case = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if not case.is_open:
            return Response(
                {"error": "Case is already closed"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        case.close_case(
            outcome=serializer.validated_data["outcome"],
            outcome_rating=serializer.validated_data["outcome_rating"],
            user=request.user,
            status=serializer.validated_data["status"],
        )

        # Also complete the referral if exists
        if case.referral and case.referral.status not in ["COMPLETED", "CANCELLED"]:
            with contextlib.suppress(Exception):
                case.referral.update_status("COMPLETED", user=request.user)

        AuditLog.log(
            action="sw_case_closed",
            user=request.user,
            resource_type="SocialWorkCase",
            resource_id=case.id,
            details={
                "case_number": case.case_number,
                "outcome_rating": serializer.validated_data["outcome_rating"],
                "closure_status": serializer.validated_data["status"],
            },
        )

        return Response(SocialWorkCaseSerializer(case).data)

    @action(detail=True, methods=["post"])
    def assign_worker(self, request, pk=None):
        """
        Assign or reassign social worker to case.

        POST /api/social-work/cases/{id}/assign_worker/
        Body: {"assigned_worker": <user_id>, "secondary_worker": <user_id> (optional)}
        """
        case = self.get_object()

        assigned_worker_id = request.data.get("assigned_worker")
        secondary_worker_id = request.data.get("secondary_worker")

        from django.contrib.auth import get_user_model
        User = get_user_model()

        if assigned_worker_id:
            try:
                worker = User.objects.get(id=assigned_worker_id, is_active=True)
                case.assigned_worker = worker
            except User.DoesNotExist:
                return Response(
                    {"error": "Assigned worker not found"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if secondary_worker_id:
            try:
                secondary = User.objects.get(id=secondary_worker_id, is_active=True)
                case.secondary_worker = secondary
            except User.DoesNotExist:
                return Response(
                    {"error": "Secondary worker not found"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        case.save()

        AuditLog.log(
            action="sw_case_worker_assigned",
            user=request.user,
            resource_type="SocialWorkCase",
            resource_id=case.id,
            details={
                "case_number": case.case_number,
                "assigned_worker_id": assigned_worker_id,
                "secondary_worker_id": secondary_worker_id,
            },
        )

        return Response(SocialWorkCaseSerializer(case).data)


# ==================== CASE NOTE VIEWS ====================


class CaseNoteFilter(django_filters.FilterSet):
    """Filter for CaseNote."""

    case = django_filters.NumberFilter()
    note_type = django_filters.CharFilter(lookup_expr="iexact")
    author = django_filters.NumberFilter()
    contact_date_from = django_filters.DateFilter(field_name="contact_date", lookup_expr="gte")
    contact_date_to = django_filters.DateFilter(field_name="contact_date", lookup_expr="lte")
    follow_up_required = django_filters.BooleanFilter()

    class Meta:
        model = CaseNote
        fields = ["case", "note_type", "author", "follow_up_required"]


class CaseNoteViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing case notes.

    Provides CRUD operations for progress notes on social work cases.
    """

    queryset = CaseNote.objects.select_related("case", "author")
    permission_classes = [IsAuthenticated]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = CaseNoteFilter
    search_fields = ["subject", "content"]
    ordering_fields = ["contact_date", "created_at", "note_type"]
    ordering = ["-contact_date", "-created_at"]

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "create":
            return CaseNoteCreateSerializer
        return CaseNoteSerializer

    def get_queryset(self):
        """
        Filter queryset to exclude confidential notes
        unless user is case team member.
        """
        qs = super().get_queryset()
        user = self.request.user

        # Filter out confidential notes unless user is on the case team
        confidential_notes = qs.filter(is_confidential=True)
        if confidential_notes.exists():
            qs = qs.filter(
                Q(is_confidential=False) |
                Q(case__assigned_worker=user) |
                Q(case__secondary_worker=user) |
                Q(case__supervisor=user)
            )

        return qs

    def perform_create(self, serializer):
        """Create note and log audit."""
        note = serializer.save(author=self.request.user)
        AuditLog.log(
            action="sw_note_create",
            user=self.request.user,
            resource_type="CaseNote",
            resource_id=note.id,
            details={
                "case_number": note.case.case_number,
                "note_type": note.note_type,
                "subject": note.subject,
            },
        )
        self._created_note = note

    def create(self, request, *args, **kwargs):
        """Override create to return detail serializer."""
        response = super().create(request, *args, **kwargs)
        if hasattr(self, "_created_note"):
            response.data = CaseNoteSerializer(self._created_note).data
        return response


# ==================== INTERVENTION VIEWS ====================


class SocialWorkInterventionFilter(django_filters.FilterSet):
    """Filter for SocialWorkIntervention."""

    case = django_filters.NumberFilter()
    intervention_type = django_filters.CharFilter(lookup_expr="iexact")
    status = django_filters.CharFilter(lookup_expr="iexact")
    provided_by = django_filters.NumberFilter()
    planned_date_from = django_filters.DateFilter(field_name="planned_date", lookup_expr="gte")
    planned_date_to = django_filters.DateFilter(field_name="planned_date", lookup_expr="lte")

    class Meta:
        model = SocialWorkIntervention
        fields = ["case", "intervention_type", "status", "provided_by"]


class SocialWorkInterventionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing social work interventions.

    Provides CRUD operations plus custom action for completing interventions.
    """

    queryset = SocialWorkIntervention.objects.select_related("case", "provided_by")
    permission_classes = [IsAuthenticated]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = SocialWorkInterventionFilter
    search_fields = ["description", "objectives", "outcome"]
    ordering_fields = ["created_at", "planned_date", "status", "intervention_type"]
    ordering = ["-created_at"]

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "create":
            return SocialWorkInterventionCreateSerializer
        if self.action == "complete":
            return SocialWorkInterventionCompleteSerializer
        return SocialWorkInterventionSerializer

    def perform_create(self, serializer):
        """Create intervention and log audit."""
        intervention = serializer.save(provided_by=self.request.user)
        AuditLog.log(
            action="sw_intervention_create",
            user=self.request.user,
            resource_type="SocialWorkIntervention",
            resource_id=intervention.id,
            details={
                "case_number": intervention.case.case_number,
                "intervention_type": intervention.intervention_type,
            },
        )
        self._created_intervention = intervention

    def create(self, request, *args, **kwargs):
        """Override create to return detail serializer."""
        response = super().create(request, *args, **kwargs)
        if hasattr(self, "_created_intervention"):
            response.data = SocialWorkInterventionSerializer(self._created_intervention).data
        return response

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """
        Start an intervention.

        POST /api/social-work/interventions/{id}/start/
        """
        from datetime import date

        intervention = self.get_object()

        if intervention.status != "PLANNED":
            return Response(
                {"error": f"Cannot start intervention with status '{intervention.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        intervention.status = "IN_PROGRESS"
        intervention.start_date = date.today()
        intervention.save()

        AuditLog.log(
            action="sw_intervention_started",
            user=request.user,
            resource_type="SocialWorkIntervention",
            resource_id=intervention.id,
            details={
                "case_number": intervention.case.case_number,
                "intervention_type": intervention.intervention_type,
            },
        )

        return Response(SocialWorkInterventionSerializer(intervention).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """
        Complete an intervention with outcome.

        POST /api/social-work/interventions/{id}/complete/
        Body: {"outcome": "Description...", "outcome_rating": "SUCCESSFUL", "client_feedback": "..."}
        """
        intervention = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if intervention.status not in ["PLANNED", "IN_PROGRESS"]:
            return Response(
                {"error": f"Cannot complete intervention with status '{intervention.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Update optional fields
        if serializer.validated_data.get("activities"):
            intervention.activities = serializer.validated_data["activities"]
        if serializer.validated_data.get("client_feedback"):
            intervention.client_feedback = serializer.validated_data["client_feedback"]

        intervention.complete(
            outcome=serializer.validated_data["outcome"],
            outcome_rating=serializer.validated_data["outcome_rating"],
        )

        AuditLog.log(
            action="sw_intervention_completed",
            user=request.user,
            resource_type="SocialWorkIntervention",
            resource_id=intervention.id,
            details={
                "case_number": intervention.case.case_number,
                "intervention_type": intervention.intervention_type,
                "outcome_rating": serializer.validated_data["outcome_rating"],
            },
        )

        return Response(SocialWorkInterventionSerializer(intervention).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """
        Cancel an intervention.

        POST /api/social-work/interventions/{id}/cancel/
        """
        intervention = self.get_object()

        if intervention.status in ["COMPLETED", "CANCELLED"]:
            return Response(
                {"error": f"Cannot cancel intervention with status '{intervention.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        intervention.status = "CANCELLED"
        intervention.save()

        AuditLog.log(
            action="sw_intervention_cancelled",
            user=request.user,
            resource_type="SocialWorkIntervention",
            resource_id=intervention.id,
            details={
                "case_number": intervention.case.case_number,
                "intervention_type": intervention.intervention_type,
            },
        )

        return Response(SocialWorkInterventionSerializer(intervention).data)
