# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tenant-scoped API endpoints for DHA Shared Health Record consent visits."""

from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.billing.services.dha_errors import DHAError, DHAUnauthorizedError
from hmis.apps.core.mixins import resolve_request_tenant
from hmis.apps.core.permissions import WriteRequiresRolePermission
from hmis.apps.shr.models import SHRConsentVisit
from hmis.apps.shr.serializers import (
    SHRCloseVisitSerializer,
    SHRConsentRequestSerializer,
    SHRConsentVisitSerializer,
    SHROTPVerificationSerializer,
)
from hmis.apps.shr.services.consent import SHRConsentError, SHRConsentService


class SHRBaseView(APIView):
    """Resolve facility context and map DHA errors consistently."""

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def facility(self, request):
        if not settings.SHR_ENABLED:
            raise SHRConsentError(
                "Shared Health Record integration is disabled by the server configuration."
            )
        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if not facility:
            raise SHRConsentError(
                "No facility context. Set X-Facility-ID or assign a primary facility."
            )
        return facility

    @staticmethod
    def error_response(exc):
        if isinstance(exc, DHAUnauthorizedError):
            return Response(
                {
                    "error": exc.message or "DHA has not authorized Shared Health Record access.",
                    "code": "dha_shr_access_not_authorized",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if isinstance(exc, DHAError):
            return Response(
                {"error": exc.message, "code": "dha_error"}, status=exc.status_code or 502
            )
        return Response(
            {"error": "Unable to process SHR consent request.", "code": "shr_consent_error"},
            status=status.HTTP_400_BAD_REQUEST,
        )


class SHRConsentCollectionView(SHRBaseView):
    """Create an SHR consent request or reuse DHA's open facility visit."""

    def get(self, request):
        """List the active facility's SHR consent visits without bearer tokens."""
        try:
            facility = self.facility(request)
        except SHRConsentError as exc:
            return self.error_response(exc)
        visits = SHRConsentVisit.objects.filter(facility=facility).select_related("patient")
        return Response(SHRConsentVisitSerializer(visits, many=True).data)

    def post(self, request):
        serializer = SHRConsentRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            facility = self.facility(request)
            from hmis.apps.encounters.models import Encounter
            from hmis.apps.patients.models import Patient

            data = serializer.validated_data
            patient = get_object_or_404(
                Patient, pk=data["patient_id"], organization=facility.organization
            )
            encounter = None
            if data.get("encounter_id"):
                encounter = get_object_or_404(Encounter, pk=data["encounter_id"], facility=facility)
            practitioner_id = data.get("practitioner_id") or getattr(
                getattr(request.user, "staff_profile", None), "hwr_id", ""
            )
            if not practitioner_id:
                raise SHRConsentError("A DHA practitioner PUID is required for SHR consent.")
            visit = SHRConsentService().request_consent(
                patient=patient,
                facility=facility,
                user=request.user,
                encounter=encounter,
                requested_by=data["requested_by"],
                visit_type=data["visit_type"],
                practitioner_id=practitioner_id,
                request_kind=data["request_kind"],
                emergency=data["emergency"],
                patient_capable=data["patient_capable"],
                incapacity_reason=data.get("incapacity_reason", ""),
                representative_cr_id=data.get("representative_cr_id", ""),
                representative_relationship=data.get("representative_relationship", ""),
                start_date=data.get("start_date"),
            )
            return Response(SHRConsentVisitSerializer(visit).data, status=status.HTTP_201_CREATED)
        except (SHRConsentError, DHAError) as exc:
            return self.error_response(exc)


class SHRConsentDetailView(SHRBaseView):
    """Retrieve local state or perform DHA consent actions for one visit."""

    def get_object(self, request, pk):
        return get_object_or_404(SHRConsentVisit, pk=pk, facility=self.facility(request))

    def get(self, request, pk):
        return Response(SHRConsentVisitSerializer(self.get_object(request, pk)).data)


class SHROTPVerificationView(SHRConsentDetailView):
    """Verify an SHR consent OTP or record a DHA consent refusal."""

    def post(self, request, pk):
        serializer = SHROTPVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        visit = self.get_object(request, pk)
        data = serializer.validated_data
        payload = {"consent_decision": data.get("consent_decision", "Approve")}
        if data.get("otp"):
            payload.update({"otp": data["otp"], "otp_record": data["otp_record"]})
        if data.get("rejection_reason"):
            payload["rejection_reason"] = data["rejection_reason"]
        try:
            result = (
                SHRConsentService()
                .client.post(
                    f"/shr/consents/{visit.consent_id}/verify",
                    json_body=payload,
                    facility=visit.facility,
                    user=request.user,
                )
                .json
            )
            if str(payload["consent_decision"]) in {"Reject", "0"}:
                visit.reject()
            elif result.get("end_date"):
                visit.close(result["end_date"])
            else:
                visit.approve(
                    consent_id=result.get("consent_id", visit.consent_id),
                    visit_id=result.get("visit_id", ""),
                    consent_token=result.get("consent_token", ""),
                )
            return Response(SHRConsentVisitSerializer(visit).data)
        except (SHRConsentError, DHAError) as exc:
            return self.error_response(exc)


class SHRConsentStatusView(SHRConsentDetailView):
    """Poll DHA's current status for a pending SHR consent request."""

    def get(self, request, pk):
        visit = self.get_object(request, pk)
        try:
            result = (
                SHRConsentService()
                .client.get(
                    f"/shr/consents/{visit.consent_id}/status",
                    facility=visit.facility,
                    user=request.user,
                )
                .json
            )
            remote_status = str(result.get("consent_status", "")).upper()
            if remote_status == "REJECTED":
                visit.reject()
            elif remote_status == "APPROVED" and result.get("visit_id"):
                visit.visit_id = result["visit_id"]
                visit.status = SHRConsentVisit.Status.APPROVED
                visit.save(update_fields=["visit_id", "status", "updated_at"])
            return Response(SHRConsentVisitSerializer(visit).data)
        except (SHRConsentError, DHAError) as exc:
            return self.error_response(exc)


class SHRResendOTPView(SHRConsentDetailView):
    """Ask DHA for a replacement OTP record for a pending consent."""

    def post(self, request, pk):
        visit = self.get_object(request, pk)
        try:
            result = (
                SHRConsentService()
                .client.post(
                    f"/shr/consents/{visit.consent_id}/resend-otp",
                    json_body={},
                    facility=visit.facility,
                    user=request.user,
                )
                .json
            )
            visit.set_pending_otp(result.get("otp_record", ""))
            return Response(SHRConsentVisitSerializer(visit).data)
        except (SHRConsentError, DHAError) as exc:
            return self.error_response(exc)


class SHRRefreshVisitView(SHRConsentDetailView):
    """Refresh the server-side bearer token for an open SHR visit."""

    def post(self, request, pk):
        visit = self.get_object(request, pk)
        try:
            result = (
                SHRConsentService()
                .client.post(
                    f"/shr/visits/{visit.visit_id}/refresh",
                    json_body={},
                    facility=visit.facility,
                    user=request.user,
                )
                .json
            )
            visit.approve(
                consent_id=visit.consent_id,
                visit_id=visit.visit_id,
                consent_token=result["consent_token"],
            )
            return Response(SHRConsentVisitSerializer(visit).data)
        except (KeyError, SHRConsentError, DHAError) as exc:
            return self.error_response(exc)


class SHRCloseVisitView(SHRConsentDetailView):
    """Close an SHR visit immediately or begin its OTP-gated closure."""

    def post(self, request, pk):
        serializer = SHRCloseVisitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        visit = self.get_object(request, pk)
        payload = {"patient_incapable": int(serializer.validated_data["patient_incapable"])}
        if serializer.validated_data.get("incapacity_reason"):
            payload["incapacity_reason"] = serializer.validated_data["incapacity_reason"]
        try:
            result = (
                SHRConsentService()
                .client.post(
                    f"/shr/visits/{visit.visit_id}/close",
                    json_body=payload,
                    facility=visit.facility,
                    user=request.user,
                )
                .json
            )
            if result.get("end_date"):
                visit.close(result["end_date"])
            else:
                visit.begin_closure(result.get("otp_record", ""))
            return Response(SHRConsentVisitSerializer(visit).data)
        except (SHRConsentError, DHAError) as exc:
            return self.error_response(exc)
