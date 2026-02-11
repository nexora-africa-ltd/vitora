# Ward Patient Compatibility Constraints - Implementation Plan

> **Status**: In Progress (Phase 1 Complete)  
> **Created**: February 12, 2026  
> **Target Sprint**: TBD  
> **PowerSync**: Phase 5 (Future Sprint - documented)

---

## 1. Overview

This document outlines the implementation plan for adding patient compatibility constraints to the ward/bed assignment system. The goal is to enforce (via soft warnings) gender, age, and other patient attributes when admitting patients to wards.

### Design Principles

1. **Soft enforcement** — Display warnings/confirmations rather than hard blocks
2. **Override with audit** — Allow staff to override with documented reason (logged)
3. **Pre-filter on UI** — Show compatible wards first, incompatible grayed out with tooltip
4. **Real-time awareness** — Use WebSockets to notify when constraint violations occur

---

## 2. Data Model Changes

### 2.1 Ward Model Updates

```python
# hmis/apps/inpatient/models.py

class Ward(TimeStampedModel):
    # ... existing fields ...

    # NEW: Gender constraints
    GENDER_RESTRICTION_CHOICES = [
        ("ANY", "Any Gender"),
        ("MALE_ONLY", "Male Only"),
        ("FEMALE_ONLY", "Female Only"),
    ]
    
    gender_restriction = models.CharField(
        max_length=20,
        choices=GENDER_RESTRICTION_CHOICES,
        default="ANY",
        help_text="Gender restriction for patient admission",
    )
    
    # NEW: Age constraints (null = no restriction)
    min_age_years = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Minimum patient age in years (null = no minimum)",
    )
    max_age_years = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum patient age in years (null = no maximum)",
    )
    
    # NEW: Isolation capability
    isolation_capable = models.BooleanField(
        default=False,
        help_text="Whether ward can handle isolation patients",
    )
    
    # NEW: Special equipment/capability flags
    oxygen_equipped = models.BooleanField(
        default=False,
        help_text="Whether beds have oxygen supply",
    )
    ventilator_capable = models.BooleanField(
        default=False,
        help_text="Whether ward supports ventilated patients",
    )
```

### 2.2 Admission Model Updates

```python
# hmis/apps/inpatient/models.py

class Admission(TimeStampedModel):
    # ... existing fields ...

    # NEW: Constraint override tracking
    constraint_override = models.BooleanField(
        default=False,
        help_text="Whether compatibility constraints were overridden",
    )
    constraint_override_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for overriding compatibility constraints",
    )
    constraint_violations = models.JSONField(
        default=list,
        blank=True,
        help_text="List of violated constraints at admission time",
    )
```

### 2.3 Auto-Populate Age Defaults on Ward Save

```python
# hmis/apps/inpatient/models.py

class Ward(TimeStampedModel):
    # ... existing fields ...

    # Default age ranges by ward type
    WARD_TYPE_AGE_DEFAULTS = {
        "PEDIATRIC": {"min_age_years": 0, "max_age_years": 14},
        "MATERNITY": {"min_age_years": 12, "max_age_years": 55},
        # Others have no defaults
    }

    def save(self, *args, **kwargs):
        """
        Override save to auto-populate age constraints based on ward type.
        Only sets defaults when creating a new ward (not on updates).
        """
        is_new = self.pk is None
        
        if is_new and self.ward_type in self.WARD_TYPE_AGE_DEFAULTS:
            defaults = self.WARD_TYPE_AGE_DEFAULTS[self.ward_type]
            if self.min_age_years is None:
                self.min_age_years = defaults.get("min_age_years")
            if self.max_age_years is None:
                self.max_age_years = defaults.get("max_age_years")
            
            # Maternity wards default to female-only
            if self.ward_type == "MATERNITY" and self.gender_restriction == "ANY":
                self.gender_restriction = "FEMALE_ONLY"
        
        super().save(*args, **kwargs)
```

### 2.4 Migration

```bash
python manage.py makemigrations inpatient --name add_ward_compatibility_constraints
python manage.py migrate
```

---

## 3. Backend Implementation

### 3.1 Compatibility Service

Create a dedicated service for checking patient-ward compatibility:

```python
# hmis/apps/inpatient/services/compatibility.py

from dataclasses import dataclass
from datetime import date
from typing import List, Optional
from hmis.apps.patients.models import Patient
from hmis.apps.inpatient.models import Ward


@dataclass
class CompatibilityViolation:
    """Represents a single constraint violation."""
    code: str           # e.g., "GENDER_MISMATCH", "AGE_BELOW_MIN"
    severity: str       # "WARNING", "CRITICAL"
    message: str        # Human-readable message
    override_allowed: bool


@dataclass
class CompatibilityResult:
    """Result of compatibility check."""
    compatible: bool
    violations: List[CompatibilityViolation]
    
    @property
    def has_critical_violations(self) -> bool:
        return any(v.severity == "CRITICAL" for v in self.violations)


class WardCompatibilityService:
    """Service for checking patient-ward compatibility."""

    def check_compatibility(
        self, 
        patient: Patient, 
        ward: Ward,
        requires_isolation: bool = False,
    ) -> CompatibilityResult:
        """
        Check if patient is compatible with ward.
        
        Args:
            patient: Patient to check
            ward: Target ward
            requires_isolation: Whether patient requires isolation
            
        Returns:
            CompatibilityResult with violations list
        """
        violations = []
        
        # Gender check
        gender_violation = self._check_gender(patient, ward)
        if gender_violation:
            violations.append(gender_violation)
        
        # Age check
        age_violation = self._check_age(patient, ward)
        if age_violation:
            violations.append(age_violation)
        
        # Isolation check
        if requires_isolation and not ward.isolation_capable:
            violations.append(CompatibilityViolation(
                code="ISOLATION_REQUIRED",
                severity="CRITICAL",
                message=f"Patient requires isolation but {ward.name} is not isolation-capable",
                override_allowed=False,
            ))
        
        # Ward type implicit checks
        type_violation = self._check_ward_type(patient, ward)
        if type_violation:
            violations.append(type_violation)
        
        return CompatibilityResult(
            compatible=len(violations) == 0,
            violations=violations,
        )

    def _check_gender(self, patient: Patient, ward: Ward) -> Optional[CompatibilityViolation]:
        """Check gender compatibility."""
        if ward.gender_restriction == "ANY":
            return None
        
        patient_gender = patient.gender  # 'M', 'F', 'O'
        
        if ward.gender_restriction == "MALE_ONLY" and patient_gender != "M":
            return CompatibilityViolation(
                code="GENDER_MISMATCH",
                severity="WARNING",
                message=f"Ward '{ward.name}' is male-only but patient is {patient.get_gender_display()}",
                override_allowed=True,
            )
        
        if ward.gender_restriction == "FEMALE_ONLY" and patient_gender != "F":
            return CompatibilityViolation(
                code="GENDER_MISMATCH",
                severity="WARNING",
                message=f"Ward '{ward.name}' is female-only but patient is {patient.get_gender_display()}",
                override_allowed=True,
            )
        
        return None

    def _check_age(self, patient: Patient, ward: Ward) -> Optional[CompatibilityViolation]:
        """Check age compatibility."""
        patient_age = self._calculate_age(patient.date_of_birth)
        
        if ward.min_age_years is not None and patient_age < ward.min_age_years:
            return CompatibilityViolation(
                code="AGE_BELOW_MIN",
                severity="WARNING",
                message=f"Patient is {patient_age} years old but ward requires minimum {ward.min_age_years} years",
                override_allowed=True,
            )
        
        if ward.max_age_years is not None and patient_age > ward.max_age_years:
            return CompatibilityViolation(
                code="AGE_ABOVE_MAX", 
                severity="WARNING",
                message=f"Patient is {patient_age} years old but ward maximum is {ward.max_age_years} years",
                override_allowed=True,
            )
        
        return None

    def _check_ward_type(self, patient: Patient, ward: Ward) -> Optional[CompatibilityViolation]:
        """Check ward type implicit constraints."""
        patient_age = self._calculate_age(patient.date_of_birth)
        
        # Maternity ward - should be female
        if ward.ward_type == "MATERNITY" and patient.gender != "F":
            return CompatibilityViolation(
                code="MATERNITY_GENDER",
                severity="WARNING",
                message="Maternity ward is intended for female patients",
                override_allowed=True,
            )
        
        # Pediatric ward - should be child (default: 0-14)
        if ward.ward_type == "PEDIATRIC" and patient_age > 14:
            return CompatibilityViolation(
                code="PEDIATRIC_AGE",
                severity="WARNING",
                message=f"Pediatric ward is intended for patients under 15 years (patient is {patient_age})",
                override_allowed=True,
            )
        
        return None

    def _calculate_age(self, dob: date) -> int:
        """Calculate age in years from date of birth."""
        today = date.today()
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


# Singleton instance
ward_compatibility_service = WardCompatibilityService()
```

### 3.2 API Endpoints

```python
# hmis/apps/inpatient/views.py

from rest_framework.decorators import action
from rest_framework.response import Response
from .services.compatibility import ward_compatibility_service


class WardViewSet(viewsets.ModelViewSet):
    # ... existing code ...

    @action(detail=True, methods=["post"])
    def check_compatibility(self, request, pk=None):
        """
        Check patient compatibility with this ward.
        
        POST /api/inpatient/wards/{id}/check_compatibility/
        Body: { "patient_id": 123, "requires_isolation": false }
        """
        ward = self.get_object()
        patient_id = request.data.get("patient_id")
        requires_isolation = request.data.get("requires_isolation", False)
        
        try:
            patient = Patient.objects.get(id=patient_id)
        except Patient.DoesNotExist:
            return Response({"error": "Patient not found"}, status=404)
        
        result = ward_compatibility_service.check_compatibility(
            patient=patient,
            ward=ward,
            requires_isolation=requires_isolation,
        )
        
        return Response({
            "compatible": result.compatible,
            "has_critical_violations": result.has_critical_violations,
            "violations": [
                {
                    "code": v.code,
                    "severity": v.severity,
                    "message": v.message,
                    "override_allowed": v.override_allowed,
                }
                for v in result.violations
            ],
        })


### 3.3 Bulk Compatibility Check Endpoint

```python
# hmis/apps/inpatient/views.py

class WardViewSet(viewsets.ModelViewSet):
    # ... existing code ...

    @action(detail=False, methods=["post"])
    def bulk_check_compatibility(self, request):
        """
        Bulk check compatibility for multiple patients across all wards.
        Useful for emergency surge scenarios.
        
        POST /api/inpatient/wards/bulk_check_compatibility/
        Body: {
            "patient_ids": [1, 2, 3, 4, 5],
            "requires_isolation": [false, false, true, false, false]
        }
        
        Returns:
        {
            "results": [
                {
                    "patient_id": 1,
                    "patient_name": "John Doe",
                    "compatible_wards": [
                        {"ward_id": 1, "ward_name": "Medical Ward 1", "available_beds": 5},
                        {"ward_id": 2, "ward_name": "Medical Ward 2", "available_beds": 3}
                    ],
                    "incompatible_wards": [
                        {"ward_id": 3, "ward_name": "Maternity", "violations": ["GENDER_MISMATCH"]}
                    ]
                },
                ...
            ]
        }
        """
        patient_ids = request.data.get("patient_ids", [])
        requires_isolation_list = request.data.get("requires_isolation", [])
        
        if not patient_ids:
            return Response({"error": "patient_ids required"}, status=400)
        
        # Pad isolation list if shorter than patient list
        while len(requires_isolation_list) < len(patient_ids):
            requires_isolation_list.append(False)
        
        patients = Patient.objects.filter(id__in=patient_ids)
        wards = Ward.objects.filter(is_active=True).prefetch_related('beds')
        
        results = []
        for patient, requires_isolation in zip(patients, requires_isolation_list):
            compatible_wards = []
            incompatible_wards = []
            
            for ward in wards:
                result = ward_compatibility_service.check_compatibility(
                    patient=patient,
                    ward=ward,
                    requires_isolation=requires_isolation,
                )
                
                ward_info = {
                    "ward_id": ward.id,
                    "ward_name": ward.name,
                    "ward_type": ward.ward_type,
                    "available_beds": ward.available_beds,
                }
                
                if result.compatible:
                    compatible_wards.append(ward_info)
                else:
                    ward_info["violations"] = [v.code for v in result.violations]
                    ward_info["has_critical"] = result.has_critical_violations
                    incompatible_wards.append(ward_info)
            
            results.append({
                "patient_id": patient.id,
                "patient_name": f"{patient.first_name} {patient.last_name}",
                "patient_mrn": patient.mrn,
                "compatible_wards": sorted(compatible_wards, key=lambda x: -x["available_beds"]),
                "incompatible_wards": incompatible_wards,
            })
        
        return Response({"results": results})


class AdmissionViewSet(viewsets.ModelViewSet):
    # ... existing code ...
    
    def perform_create(self, serializer):
        """Override to check compatibility and record violations."""
        patient = serializer.validated_data.get("patient")
        bed = serializer.validated_data.get("bed")
        ward = bed.ward
        
        # Check compatibility
        result = ward_compatibility_service.check_compatibility(
            patient=patient,
            ward=ward,
        )
        
        # If violations exist, require override confirmation
        constraint_override = self.request.data.get("constraint_override", False)
        override_reason = self.request.data.get("constraint_override_reason", "")
        
        if not result.compatible and not constraint_override:
            raise ValidationError({
                "compatibility": "Patient is not compatible with this ward. Set constraint_override=true to proceed.",
                "violations": [v.message for v in result.violations],
            })
        
        # Record any violations
        serializer.save(
            admitted_by=self.request.user,
            constraint_override=not result.compatible,
            constraint_override_reason=override_reason,
            constraint_violations=[
                {"code": v.code, "message": v.message}
                for v in result.violations
            ],
        )
```

---

## 4. WebSocket Implementation

### 4.1 Real-Time Notifications

Use Django Channels to notify relevant clients when:
- Ward constraints are updated
- Constraint violations occur during admission
- Capacity changes affect compatible bed availability

```python
# hmis/apps/inpatient/consumers.py

import json
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async


class WardCompatibilityConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for ward compatibility events.
    
    URL: /ws/wards/compatibility/
    
    Events sent to client:
    - ward_constraints_updated: Ward constraints changed
    - compatibility_violation: Admission with constraint violation occurred
    - bed_availability_changed: Compatible bed count changed
    """
    
    async def connect(self):
        """Connect to ward compatibility notifications."""
        self.user = self.scope["user"]
        
        if not self.user.is_authenticated:
            await self.close()
            return
        
        # Join facility-wide notification group
        self.group_name = "ward_compatibility"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        """Leave notification group."""
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def ward_constraints_updated(self, event):
        """Notify when ward constraints are updated."""
        await self.send_json({
            "type": "ward_constraints_updated",
            "ward_id": event["ward_id"],
            "ward_name": event["ward_name"],
            "changes": event["changes"],
            "timestamp": event["timestamp"],
        })

    async def compatibility_violation(self, event):
        """Notify when admission occurs with constraint override."""
        await self.send_json({
            "type": "compatibility_violation",
            "admission_id": event["admission_id"],
            "patient_mrn": event["patient_mrn"],
            "ward_name": event["ward_name"],
            "violations": event["violations"],
            "override_reason": event["override_reason"],
            "admitted_by": event["admitted_by"],
            "timestamp": event["timestamp"],
        })

    async def bed_availability_changed(self, event):
        """Notify when bed availability changes."""
        await self.send_json({
            "type": "bed_availability_changed",
            "ward_id": event["ward_id"],
            "ward_name": event["ward_name"],
            "available_beds": event["available_beds"],
            "total_beds": event["total_beds"],
            "timestamp": event["timestamp"],
        })
```

### 4.2 Signal Handlers for WebSocket Events

```python
# hmis/apps/inpatient/signals.py

from django.db.models.signals import post_save
from django.dispatch import receiver
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from datetime import datetime
from .models import Ward, Admission


@receiver(post_save, sender=Ward)
def notify_ward_constraints_updated(sender, instance, **kwargs):
    """Send WebSocket notification when ward constraints change."""
    channel_layer = get_channel_layer()
    
    async_to_sync(channel_layer.group_send)(
        "ward_compatibility",
        {
            "type": "ward_constraints_updated",
            "ward_id": instance.id,
            "ward_name": instance.name,
            "changes": {
                "gender_restriction": instance.gender_restriction,
                "min_age_years": instance.min_age_years,
                "max_age_years": instance.max_age_years,
                "isolation_capable": instance.isolation_capable,
            },
            "timestamp": datetime.now().isoformat(),
        }
    )


@receiver(post_save, sender=Admission)
def notify_compatibility_violation(sender, instance, created, **kwargs):
    """Send WebSocket notification when admission has constraint violations."""
    if not created or not instance.constraint_override:
        return
    
    channel_layer = get_channel_layer()
    
    # Check if any violations are CRITICAL (requires supervisor escalation)
    has_critical = any(
        v.get("code") == "ISOLATION_REQUIRED" 
        for v in instance.constraint_violations
    )
    
    # Standard notification to ward_compatibility group
    async_to_sync(channel_layer.group_send)(
        "ward_compatibility",
        {
            "type": "compatibility_violation",
            "admission_id": instance.id,
            "patient_mrn": instance.patient.mrn,
            "ward_name": instance.bed.ward.name,
            "violations": instance.constraint_violations,
            "override_reason": instance.constraint_override_reason,
            "admitted_by": instance.admitted_by.get_full_name() if instance.admitted_by else "Unknown",
            "timestamp": datetime.now().isoformat(),
            "has_critical": has_critical,
        }
    )
    
    # CRITICAL violations: Escalate to supervisor channel
    if has_critical:
        async_to_sync(channel_layer.group_send)(
            "supervisor_alerts",  # Dedicated supervisor channel
            {
                "type": "critical_violation_escalation",
                "admission_id": instance.id,
                "patient_mrn": instance.patient.mrn,
                "patient_name": f"{instance.patient.first_name} {instance.patient.last_name}",
                "ward_name": instance.bed.ward.name,
                "violations": [v for v in instance.constraint_violations if v.get("code") == "ISOLATION_REQUIRED"],
                "override_reason": instance.constraint_override_reason,
                "admitted_by": instance.admitted_by.get_full_name() if instance.admitted_by else "Unknown",
                "timestamp": datetime.now().isoformat(),
                "severity": "CRITICAL",
                "requires_action": True,
            }
        )
        
        # Also send email notification to supervisors (async via Celery)
        from hmis.apps.inpatient.tasks import notify_supervisors_critical_violation
        notify_supervisors_critical_violation.delay(instance.id)
```

### 4.3 URL Routing

```python
# hmis/routing.py

from django.urls import path
from hmis.apps.inpatient.consumers import WardCompatibilityConsumer, SupervisorAlertConsumer

websocket_urlpatterns = [
    # ... existing routes ...
    path("ws/wards/compatibility/", WardCompatibilityConsumer.as_asgi()),
    path("ws/supervisor/alerts/", SupervisorAlertConsumer.as_asgi()),
]
```

### 4.4 Supervisor Escalation for CRITICAL Violations

When a CRITICAL constraint violation is overridden (e.g., placing an isolation-required patient in a non-isolation ward), the system automatically:

1. **WebSocket**: Sends real-time alert to `supervisor_alerts` channel
2. **Celery Task**: Sends email notification to supervisors
3. **Audit Log**: Records escalation with full context

```python
# hmis/apps/inpatient/consumers.py

class SupervisorAlertConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for supervisor escalation alerts.
    Only users with supervisor permission can connect.
    
    URL: /ws/supervisor/alerts/
    """
    
    async def connect(self):
        self.user = self.scope["user"]
        
        if not self.user.is_authenticated:
            await self.close()
            return
        
        # Check supervisor permission
        has_permission = await database_sync_to_async(
            lambda: self.user.has_perm('inpatient.receive_critical_alerts')
        )()
        
        if not has_permission:
            await self.close()
            return
        
        self.group_name = "supervisor_alerts"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def critical_violation_escalation(self, event):
        """Handle critical violation escalation alert."""
        await self.send_json({
            "type": "critical_violation_escalation",
            "severity": event["severity"],
            "admission_id": event["admission_id"],
            "patient_mrn": event["patient_mrn"],
            "patient_name": event["patient_name"],
            "ward_name": event["ward_name"],
            "violations": event["violations"],
            "override_reason": event["override_reason"],
            "admitted_by": event["admitted_by"],
            "timestamp": event["timestamp"],
            "requires_action": event["requires_action"],
        })
```

```python
# hmis/apps/inpatient/tasks.py

from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings
from django.contrib.auth import get_user_model

User = get_user_model()


@shared_task
def notify_supervisors_critical_violation(admission_id: int):
    """
    Send email notification to supervisors about a critical constraint violation.
    
    Args:
        admission_id: ID of the admission with critical violations
    """
    from hmis.apps.inpatient.models import Admission
    
    try:
        admission = Admission.objects.select_related(
            'patient', 'bed__ward', 'admitted_by'
        ).get(id=admission_id)
    except Admission.DoesNotExist:
        return
    
    # Get supervisors (users with permission)
    supervisors = User.objects.filter(
        user_permissions__codename='receive_critical_alerts'
    ).values_list('email', flat=True)
    
    if not supervisors:
        return
    
    critical_violations = [
        v for v in admission.constraint_violations 
        if v.get("code") == "ISOLATION_REQUIRED"
    ]
    
    subject = f"🚨 CRITICAL: Ward Compatibility Violation - {admission.patient.mrn}"
    message = f"""
CRITICAL WARD COMPATIBILITY VIOLATION

Patient: {admission.patient.first_name} {admission.patient.last_name}
MRN: {admission.patient.mrn}
Ward: {admission.bed.ward.name}
Admitted By: {admission.admitted_by.get_full_name() if admission.admitted_by else 'Unknown'}

CRITICAL VIOLATIONS:
{chr(10).join(f"  - {v.get('message', v.get('code'))}" for v in critical_violations)}

Override Reason Given:
{admission.constraint_override_reason or 'None provided'}

This admission requires your review. Please verify the placement is clinically appropriate
or coordinate a transfer to an appropriate ward.

---
Vitora HMIS - Nexora Africa Ltd
    """
    
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=list(supervisors),
        fail_silently=True,
    )
```

---

## 5. Polling Fallback

For clients that don't support WebSockets (or as a fallback):

### 5.1 Polling Endpoint

```python
# hmis/apps/inpatient/views.py

class WardViewSet(viewsets.ModelViewSet):
    # ... existing code ...

    @action(detail=False, methods=["get"])
    def compatibility_updates(self, request):
        """
        Poll for recent compatibility-related updates.
        
        GET /api/inpatient/wards/compatibility_updates/?since=2026-02-12T10:00:00Z
        
        Returns recent:
        - Ward constraint changes
        - Compatibility violation admissions
        - Bed availability changes
        """
        since_str = request.query_params.get("since")
        if since_str:
            since = datetime.fromisoformat(since_str.replace("Z", "+00:00"))
        else:
            since = datetime.now(timezone.utc) - timedelta(minutes=5)
        
        # Recent constraint violations
        violations = Admission.objects.filter(
            constraint_override=True,
            created_at__gte=since,
        ).select_related("patient", "bed__ward", "admitted_by")[:20]
        
        # Recent ward updates
        ward_updates = Ward.objects.filter(
            updated_at__gte=since,
        )[:20]
        
        return Response({
            "since": since.isoformat(),
            "violations": [
                {
                    "admission_id": a.id,
                    "patient_mrn": a.patient.mrn,
                    "ward_name": a.bed.ward.name,
                    "violations": a.constraint_violations,
                    "timestamp": a.created_at.isoformat(),
                }
                for a in violations
            ],
            "ward_updates": [
                {
                    "ward_id": w.id,
                    "ward_name": w.name,
                    "gender_restriction": w.gender_restriction,
                    "min_age_years": w.min_age_years,
                    "max_age_years": w.max_age_years,
                    "timestamp": w.updated_at.isoformat(),
                }
                for w in ward_updates
            ],
        })
```

### 5.2 Frontend Polling Hook

```typescript
// web-app/lib/hooks/use-ward-compatibility-updates.ts

import { useQuery } from '@tanstack/react-query';
import { useWebSocket } from '@/lib/hooks/use-websocket';
import { useCallback, useEffect, useRef, useState } from 'react';

interface CompatibilityEvent {
  type: 'ward_constraints_updated' | 'compatibility_violation' | 'bed_availability_changed';
  timestamp: string;
  // ... other fields
}

export function useWardCompatibilityUpdates(options?: { pollingInterval?: number }) {
  const pollingInterval = options?.pollingInterval ?? 30000; // 30 seconds default
  const [events, setEvents] = useState<CompatibilityEvent[]>([]);
  const lastFetchRef = useRef<string>(new Date().toISOString());

  // Try WebSocket first
  const { lastMessage, isConnected } = useWebSocket('/ws/wards/compatibility/');

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      setEvents((prev) => [lastMessage as CompatibilityEvent, ...prev].slice(0, 50));
    }
  }, [lastMessage]);

  // Fallback to polling when WebSocket not connected
  const { data: pollingData } = useQuery({
    queryKey: ['ward-compatibility-updates', lastFetchRef.current],
    queryFn: async () => {
      const response = await fetch(
        `/api/inpatient/wards/compatibility_updates/?since=${lastFetchRef.current}`
      );
      const data = await response.json();
      lastFetchRef.current = new Date().toISOString();
      return data;
    },
    refetchInterval: isConnected ? false : pollingInterval, // Only poll if WS disconnected
    enabled: !isConnected,
  });

  // Merge polling data into events
  useEffect(() => {
    if (pollingData?.violations) {
      setEvents((prev) => {
        const newEvents = pollingData.violations.map((v: any) => ({
          type: 'compatibility_violation' as const,
          ...v,
        }));
        return [...newEvents, ...prev].slice(0, 50);
      });
    }
  }, [pollingData]);

  return {
    events,
    isWebSocketConnected: isConnected,
    clearEvents: () => setEvents([]),
  };
}
```

---

## 6. Frontend Implementation

### 6.1 Ward Form Updates

Add constraint fields to ward create/edit form:

```typescript
// web-app/components/inpatient/ward-form.tsx

// Add fields for:
// - gender_restriction (select: Any, Male Only, Female Only)
// - min_age_years (number input, optional)
// - max_age_years (number input, optional)
// - isolation_capable (checkbox)
// - oxygen_equipped (checkbox)
// - ventilator_capable (checkbox)
```

### 6.2 Admission Flow with Compatibility Check

```typescript
// web-app/components/inpatient/admission-form.tsx

const handleBedSelect = async (bedId: number, wardId: number) => {
  // Check compatibility before confirming selection
  const result = await inpatientApi.checkWardCompatibility(wardId, {
    patient_id: selectedPatient.id,
    requires_isolation: formData.requires_isolation,
  });

  if (!result.compatible) {
    setCompatibilityWarnings(result.violations);
    setShowOverrideDialog(true);
    return;
  }

  // Proceed with selection
  setSelectedBed(bedId);
};
```

### 6.3 Compatibility Warning Dialog

```tsx
// web-app/components/inpatient/compatibility-override-dialog.tsx

<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent>
    <DialogHeader>
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-warning" />
        <DialogTitle>Compatibility Warning</DialogTitle>
      </div>
    </DialogHeader>
    
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        This patient may not be compatible with the selected ward:
      </p>
      
      <ul className="space-y-2">
        {violations.map((v, i) => (
          <li key={i} className="flex items-start gap-2">
            <Badge variant={v.severity === 'CRITICAL' ? 'destructive' : 'warning'}>
              {v.severity}
            </Badge>
            <span className="text-sm">{v.message}</span>
          </li>
        ))}
      </ul>
    </div>
    
    <div className="space-y-2">
      <Label>Override Reason (required)</Label>
      <Textarea
        value={overrideReason}
        onChange={(e) => setOverrideReason(e.target.value)}
        placeholder="Explain why this admission should proceed despite warnings..."
      />
    </div>
    
    <DialogFooter>
      <Button variant="outline" onClick={() => onOpenChange(false)}>
        Select Different Ward
      </Button>
      <Button
        variant="destructive"
        onClick={handleOverride}
        disabled={!overrideReason.trim()}
      >
        Override & Admit
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 6.4 Ward Detail Page - Compatibility Display

Show ward constraints on the ward detail page:

```tsx
// In ward detail page, add a constraints section:

<Card>
  <CardHeader>
    <CardTitle className="text-base">Patient Compatibility Rules</CardTitle>
  </CardHeader>
  <CardContent className="space-y-2">
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">Gender Restriction</span>
      <Badge variant="outline">
        {ward.gender_restriction === 'ANY' ? 'Any Gender' : 
         ward.gender_restriction === 'MALE_ONLY' ? 'Male Only' : 'Female Only'}
      </Badge>
    </div>
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">Age Range</span>
      <span>
        {ward.min_age_years ?? 0} - {ward.max_age_years ?? '∞'} years
      </span>
    </div>
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">Isolation Capable</span>
      <Badge variant={ward.isolation_capable ? 'default' : 'secondary'}>
        {ward.isolation_capable ? 'Yes' : 'No'}
      </Badge>
    </div>
  </CardContent>
</Card>
```

---

## 7. Audit & Reporting

### 7.1 Audit Log Integration

```python
# In admission creation, log constraint overrides

AuditLog.log(
    action="admission_constraint_override",
    user=request.user,
    resource_type="Admission",
    resource_id=admission.id,
    details={
        "patient_mrn": admission.patient.mrn,
        "ward": admission.bed.ward.name,
        "violations": admission.constraint_violations,
        "override_reason": admission.constraint_override_reason,
    }
)
```

### 7.2 Reporting Dashboard

Add a section to admin/quality dashboard showing:
- Total admissions with constraint overrides (daily/weekly/monthly)
- Most common override reasons
- Wards with highest override rates
- Breakdown by violation type (gender, age, isolation)

---

## 8. Testing Requirements

### 8.1 Backend Tests

```python
# tests/test_ward_compatibility.py

class TestWardCompatibilityService:
    def test_male_patient_male_only_ward_compatible(self):
        """Male patient should be compatible with male-only ward."""
        
    def test_female_patient_male_only_ward_violation(self):
        """Female patient should have gender violation for male-only ward."""
        
    def test_child_patient_pediatric_ward_compatible(self):
        """Child under 14 should be compatible with pediatric ward."""
        
    def test_adult_patient_pediatric_ward_violation(self):
        """Adult should have age violation for pediatric ward."""
        
    def test_isolation_patient_non_isolation_ward_critical(self):
        """Isolation patient in non-isolation ward should be CRITICAL violation."""
        
    def test_override_admission_records_violations(self):
        """Override admission should record violations in JSON field."""


class TestWardAutoPopulateDefaults:
    """Tests for auto-populating age/gender defaults on ward creation."""
    
    def test_pediatric_ward_gets_default_age_range(self):
        """PEDIATRIC ward should auto-populate min_age=0, max_age=14."""
        ward = Ward.objects.create(
            name="Pediatric Ward",
            code="PED-01",
            ward_type="PEDIATRIC",
            capacity=20,
            daily_rate=1000,
        )
        assert ward.min_age_years == 0
        assert ward.max_age_years == 14
    
    def test_maternity_ward_gets_default_age_and_gender(self):
        """MATERNITY ward should auto-populate age 12-55 and FEMALE_ONLY."""
        ward = Ward.objects.create(
            name="Maternity Ward",
            code="MAT-01",
            ward_type="MATERNITY",
            capacity=15,
            daily_rate=1500,
        )
        assert ward.min_age_years == 12
        assert ward.max_age_years == 55
        assert ward.gender_restriction == "FEMALE_ONLY"
    
    def test_medical_ward_no_default_age(self):
        """MEDICAL ward should have no default age constraints."""
        ward = Ward.objects.create(
            name="Medical Ward",
            code="MED-01",
            ward_type="MEDICAL",
            capacity=30,
            daily_rate=800,
        )
        assert ward.min_age_years is None
        assert ward.max_age_years is None
    
    def test_explicit_values_not_overwritten(self):
        """Explicit age values should not be overwritten by defaults."""
        ward = Ward.objects.create(
            name="Special Pediatric",
            code="SPED-01",
            ward_type="PEDIATRIC",
            capacity=10,
            daily_rate=2000,
            min_age_years=0,
            max_age_years=18,  # Custom max instead of default 14
        )
        assert ward.max_age_years == 18  # Should keep custom value


class TestBulkCompatibilityCheck:
    """Tests for bulk_check_compatibility endpoint."""
    
    def test_bulk_check_returns_compatible_wards(self, authenticated_client, sample_patients, sample_wards):
        """Bulk check should return compatible wards for each patient."""
        response = authenticated_client.post(
            '/api/inpatient/wards/bulk_check_compatibility/',
            {
                "patient_ids": [p.id for p in sample_patients],
                "requires_isolation": [False] * len(sample_patients),
            },
            format='json'
        )
        assert response.status_code == 200
        assert len(response.data["results"]) == len(sample_patients)
        for result in response.data["results"]:
            assert "compatible_wards" in result
            assert "incompatible_wards" in result
    
    def test_bulk_check_empty_patient_list_error(self, authenticated_client):
        """Bulk check with empty patient list should return error."""
        response = authenticated_client.post(
            '/api/inpatient/wards/bulk_check_compatibility/',
            {"patient_ids": []},
            format='json'
        )
        assert response.status_code == 400


class TestSupervisorEscalation:
    """Tests for CRITICAL violation supervisor escalation."""
    
    def test_critical_violation_triggers_supervisor_notification(
        self, authenticated_client, sample_patient, isolation_required_patient, non_isolation_ward
    ):
        """CRITICAL violation should trigger supervisor notification."""
        with mock.patch('hmis.apps.inpatient.tasks.notify_supervisors_critical_violation.delay') as mock_task:
            response = authenticated_client.post(
                '/api/inpatient/admissions/',
                {
                    "patient": isolation_required_patient.id,
                    "bed": non_isolation_ward.beds.first().id,
                    "constraint_override": True,
                    "constraint_override_reason": "Emergency - no isolation beds available",
                },
                format='json'
            )
            assert response.status_code == 201
            mock_task.assert_called_once()
    
    def test_warning_violation_does_not_escalate(
        self, authenticated_client, sample_patient, male_only_ward
    ):
        """WARNING (non-critical) violation should NOT trigger supervisor escalation."""
        # Female patient in male-only ward = WARNING, not CRITICAL
        female_patient = sample_patient
        female_patient.gender = 'F'
        female_patient.save()
        
        with mock.patch('hmis.apps.inpatient.tasks.notify_supervisors_critical_violation.delay') as mock_task:
            response = authenticated_client.post(
                '/api/inpatient/admissions/',
                {
                    "patient": female_patient.id,
                    "bed": male_only_ward.beds.first().id,
                    "constraint_override": True,
                    "constraint_override_reason": "No female ward beds available",
                },
                format='json'
            )
            assert response.status_code == 201
            mock_task.assert_not_called()  # Should NOT escalate
```

### 8.2 Frontend Tests

```typescript
// tests/ward-compatibility.spec.ts

test('shows warning dialog when patient incompatible with ward', async () => {});
test('requires override reason before proceeding', async () => {});
test('records override in admission data', async () => {});
test('filters available wards by patient compatibility', async () => {});
test('bulk assignment shows compatible wards sorted by availability', async () => {});
test('supervisor receives real-time alert for CRITICAL violations', async () => {});
```

---

## 9. Implementation Phases

### Phase 1: Backend Foundation (4 days) ✅ COMPLETE
- [x] Add Ward model fields (migration)
- [x] Implement Ward model `save()` with auto-populate age defaults by ward type
- [x] Create WardCompatibilityService
- [x] Add single-patient compatibility check API endpoint
- [x] Add **bulk compatibility check** API endpoint (for emergency surge)
- [x] Update Admission model with override fields
- [x] Modify admission creation to check/record violations
- [x] Add audit logging for overrides
- [x] Write backend tests
- [x] Add `receive_critical_alerts` permission

### Phase 2: WebSocket & Polling + Supervisor Escalation (3 days)
- [ ] Create WardCompatibilityConsumer
- [ ] Create SupervisorAlertConsumer (for CRITICAL violations)
- [ ] Add signal handlers for real-time notifications
- [ ] Implement **CRITICAL violation → supervisor escalation** (WebSocket + email)
- [ ] Create Celery task `notify_supervisors_critical_violation`
- [ ] Create polling fallback endpoint
- [ ] Create frontend hook with WS/polling hybrid

### Phase 3: Frontend Integration (3-4 days)
- [ ] Update ward form with constraint fields (auto-populated defaults shown)
- [ ] Add compatibility check to admission flow
- [ ] Create override warning dialog
- [ ] Add constraints display to ward detail page
- [ ] Update bed selection to show compatibility status
- [ ] Add **bulk assignment UI** for emergency scenarios
- [ ] Write frontend tests

### Phase 4: Reporting & Refinement (2 days)
- [ ] Add override metrics to dashboard
- [ ] Create constraint violation report
- [ ] Add supervisor alert acknowledgment UI
- [ ] Documentation
- [ ] Performance testing with large patient volumes

### Phase 5: PowerSync Offline Support (Future Sprint)
- [ ] Set up PowerSync backend service
- [ ] Define sync rules for ward/bed/admission data
- [ ] Create SQLite schema for client-side storage
- [ ] Implement offline compatibility checks
- [ ] Test offline admission scenarios

### Phase 6: Insurance Tier Constraints (Future)
- [ ] Add amenity ward type and tier field
- [ ] Integrate with billing module for tier validation
- [ ] UI for tier compatibility display

---

## 10. PowerSync Implementation (Future Sprint)

> **Note**: PowerSync requires significant infrastructure changes and should be a dedicated sprint after WebSocket real-time features are stable.

### 10.1 Why PowerSync for Wards?

Ward management is **critical for offline-first** in Kenyan healthcare facilities:

| Scenario | Online-Only Impact | With PowerSync |
|----------|-------------------|----------------|
| Network outage during admission | ❌ Cannot check bed availability | ✅ Local SQLite has current ward state |
| Rural facility with intermittent connectivity | ❌ Staff must wait for connection | ✅ Admissions queue locally, sync when online |
| Emergency mass casualty | ❌ System bottleneck | ✅ Distribute admissions across offline tablets |
| Night shift with unstable internet | ❌ Reduced functionality | ✅ Full ward management capability |

### 10.2 Prerequisites

- [ ] PowerSync backend service deployed (self-hosted or PowerSync Cloud)
- [ ] PostgreSQL logical replication enabled for sync tables
- [ ] PowerSync SDK installed: `@powersync/web` or `@powersync/react-native`
- [ ] Authentication integration (JWT tokens)

### 10.3 Sync Schema Definition

```typescript
// web-app/lib/powersync/schema/inpatient.ts

import { column, Schema, Table } from '@powersync/web';

const wards = new Table({
  id: column.integer,
  name: column.text,
  code: column.text,
  ward_type: column.text,
  floor: column.text,
  capacity: column.integer,
  is_active: column.integer, // boolean as 0/1
  daily_rate: column.real,
  // Compatibility constraints
  gender_restriction: column.text, // 'ANY' | 'MALE_ONLY' | 'FEMALE_ONLY'
  min_age_years: column.integer,
  max_age_years: column.integer,
  isolation_capable: column.integer,
  oxygen_equipped: column.integer,
  ventilator_capable: column.integer,
  // Sync metadata
  updated_at: column.text,
});

const beds = new Table({
  id: column.integer,
  ward_id: column.integer,
  bed_number: column.text,
  status: column.text, // 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'RESERVED'
  bed_type: column.text,
  notes: column.text,
  status_changed_at: column.text,
  updated_at: column.text,
});

const admissions = new Table({
  id: column.integer,
  patient_id: column.integer,
  patient_mrn: column.text, // Denormalized for offline display
  patient_name: column.text, // Denormalized
  patient_gender: column.text, // For offline compatibility checks
  patient_dob: column.text, // For offline age calculation
  bed_id: column.integer,
  ward_id: column.integer, // Denormalized
  admission_status: column.text,
  admission_date: column.text,
  // Constraint tracking
  constraint_override: column.integer,
  constraint_override_reason: column.text,
  constraint_violations: column.text, // JSON string
  // Sync metadata
  local_only: column.integer, // 1 if created offline, pending sync
  sync_status: column.text, // 'SYNCED' | 'PENDING' | 'CONFLICT'
  updated_at: column.text,
});

export const inpatientSchema = new Schema({
  wards,
  beds,
  admissions,
});
```

### 10.4 Sync Rules (Backend)

```yaml
# powersync/sync-rules.yaml

bucket_definitions:
  # All wards sync to all users (small dataset, needed for compatibility checks)
  - name: wards
    data:
      - SELECT id, name, code, ward_type, floor, capacity, is_active, daily_rate,
               gender_restriction, min_age_years, max_age_years,
               isolation_capable, oxygen_equipped, ventilator_capable,
               updated_at
        FROM inpatient_ward
        WHERE is_active = true
    
  # Beds sync based on ward access (larger dataset, filtered)
  - name: beds
    parameters: SELECT ward_id FROM user_ward_assignments WHERE user_id = token_parameters.user_id
    data:
      - SELECT id, ward_id, bed_number, status, bed_type, notes, 
               status_changed_at, updated_at
        FROM inpatient_bed
        WHERE ward_id IN bucket.ward_id
    
  # Active admissions sync (historical admissions excluded to reduce sync size)
  - name: admissions
    parameters: SELECT ward_id FROM user_ward_assignments WHERE user_id = token_parameters.user_id
    data:
      - SELECT a.id, a.patient_id, p.mrn as patient_mrn,
               CONCAT(p.first_name, ' ', p.last_name) as patient_name,
               p.gender as patient_gender, p.date_of_birth as patient_dob,
               a.bed_id, b.ward_id, a.admission_status, a.admission_date,
               a.constraint_override, a.constraint_override_reason,
               a.constraint_violations, a.updated_at
        FROM inpatient_admission a
        JOIN patients_patient p ON a.patient_id = p.id
        JOIN inpatient_bed b ON a.bed_id = b.id
        WHERE b.ward_id IN bucket.ward_id
          AND a.admission_status = 'ACTIVE'
```

### 10.5 Offline Compatibility Service

```typescript
// web-app/lib/powersync/services/offline-compatibility.ts

import { db } from '@/lib/powersync/db';
import { differenceInYears, parseISO } from 'date-fns';

export interface OfflineCompatibilityViolation {
  code: string;
  severity: 'WARNING' | 'CRITICAL';
  message: string;
  overrideAllowed: boolean;
}

export interface OfflineCompatibilityResult {
  compatible: boolean;
  violations: OfflineCompatibilityViolation[];
  hasCriticalViolations: boolean;
}

/**
 * Check patient-ward compatibility using local SQLite data.
 * Works completely offline.
 */
export async function checkCompatibilityOffline(
  patientId: number,
  wardId: number,
  requiresIsolation: boolean = false
): Promise<OfflineCompatibilityResult> {
  const violations: OfflineCompatibilityViolation[] = [];

  // Fetch patient from local cache (from admissions denormalized data or patients table)
  const patient = await db.get<{
    patient_gender: string;
    patient_dob: string;
  }>(`
    SELECT patient_gender, patient_dob 
    FROM admissions 
    WHERE patient_id = ? 
    LIMIT 1
  `, [patientId]);

  // Fetch ward constraints
  const ward = await db.get<{
    name: string;
    ward_type: string;
    gender_restriction: string;
    min_age_years: number | null;
    max_age_years: number | null;
    isolation_capable: number;
  }>(`
    SELECT name, ward_type, gender_restriction, min_age_years, max_age_years, isolation_capable
    FROM wards
    WHERE id = ?
  `, [wardId]);

  if (!patient || !ward) {
    return { compatible: true, violations: [], hasCriticalViolations: false };
  }

  // Gender check
  if (ward.gender_restriction !== 'ANY') {
    if (ward.gender_restriction === 'MALE_ONLY' && patient.patient_gender !== 'M') {
      violations.push({
        code: 'GENDER_MISMATCH',
        severity: 'WARNING',
        message: `Ward '${ward.name}' is male-only`,
        overrideAllowed: true,
      });
    }
    if (ward.gender_restriction === 'FEMALE_ONLY' && patient.patient_gender !== 'F') {
      violations.push({
        code: 'GENDER_MISMATCH',
        severity: 'WARNING',
        message: `Ward '${ward.name}' is female-only`,
        overrideAllowed: true,
      });
    }
  }

  // Age check
  const patientAge = differenceInYears(new Date(), parseISO(patient.patient_dob));
  
  if (ward.min_age_years !== null && patientAge < ward.min_age_years) {
    violations.push({
      code: 'AGE_BELOW_MIN',
      severity: 'WARNING',
      message: `Patient is ${patientAge} years old, ward requires minimum ${ward.min_age_years}`,
      overrideAllowed: true,
    });
  }
  
  if (ward.max_age_years !== null && patientAge > ward.max_age_years) {
    violations.push({
      code: 'AGE_ABOVE_MAX',
      severity: 'WARNING',
      message: `Patient is ${patientAge} years old, ward maximum is ${ward.max_age_years}`,
      overrideAllowed: true,
    });
  }

  // Isolation check (CRITICAL)
  if (requiresIsolation && !ward.isolation_capable) {
    violations.push({
      code: 'ISOLATION_REQUIRED',
      severity: 'CRITICAL',
      message: `Patient requires isolation but ${ward.name} is not isolation-capable`,
      overrideAllowed: false,
    });
  }

  // Ward type implicit checks
  if (ward.ward_type === 'MATERNITY' && patient.patient_gender !== 'F') {
    violations.push({
      code: 'MATERNITY_GENDER',
      severity: 'WARNING',
      message: 'Maternity ward is intended for female patients',
      overrideAllowed: true,
    });
  }

  if (ward.ward_type === 'PEDIATRIC' && patientAge > 14) {
    violations.push({
      code: 'PEDIATRIC_AGE',
      severity: 'WARNING',
      message: `Pediatric ward is for patients under 15 (patient is ${patientAge})`,
      overrideAllowed: true,
    });
  }

  return {
    compatible: violations.length === 0,
    violations,
    hasCriticalViolations: violations.some(v => v.severity === 'CRITICAL'),
  };
}

/**
 * Get available beds for a ward from local SQLite.
 */
export async function getAvailableBedsOffline(wardId: number): Promise<number> {
  const result = await db.get<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM beds
    WHERE ward_id = ? AND status = 'AVAILABLE'
  `, [wardId]);
  
  return result?.count ?? 0;
}

/**
 * Get compatible wards for a patient from local SQLite.
 */
export async function getCompatibleWardsOffline(
  patientGender: string,
  patientDob: string,
  requiresIsolation: boolean = false
): Promise<Array<{ id: number; name: string; available_beds: number }>> {
  const patientAge = differenceInYears(new Date(), parseISO(patientDob));
  
  let query = `
    SELECT w.id, w.name,
           (SELECT COUNT(*) FROM beds b WHERE b.ward_id = w.id AND b.status = 'AVAILABLE') as available_beds
    FROM wards w
    WHERE w.is_active = 1
  `;
  
  const params: any[] = [];
  
  // Gender filter
  if (patientGender === 'M') {
    query += ` AND w.gender_restriction IN ('ANY', 'MALE_ONLY')`;
  } else if (patientGender === 'F') {
    query += ` AND w.gender_restriction IN ('ANY', 'FEMALE_ONLY')`;
  }
  
  // Age filter
  query += ` AND (w.min_age_years IS NULL OR w.min_age_years <= ?)`;
  params.push(patientAge);
  query += ` AND (w.max_age_years IS NULL OR w.max_age_years >= ?)`;
  params.push(patientAge);
  
  // Isolation filter
  if (requiresIsolation) {
    query += ` AND w.isolation_capable = 1`;
  }
  
  query += ` ORDER BY available_beds DESC`;
  
  return db.getAll(query, params);
}
```

### 10.6 Offline Admission Write-Through

```typescript
// web-app/lib/powersync/mutations/admission.ts

import { db } from '@/lib/powersync/db';
import { v4 as uuidv4 } from 'uuid';

interface OfflineAdmissionData {
  patientId: number;
  patientMrn: string;
  patientName: string;
  patientGender: string;
  patientDob: string;
  bedId: number;
  wardId: number;
  constraintOverride: boolean;
  constraintOverrideReason: string;
  constraintViolations: Array<{ code: string; message: string }>;
}

/**
 * Create admission locally when offline.
 * Will sync to server when connection restored.
 */
export async function createAdmissionOffline(data: OfflineAdmissionData): Promise<string> {
  const localId = uuidv4(); // Temporary ID until server assigns real one
  
  await db.execute(`
    INSERT INTO admissions (
      id, patient_id, patient_mrn, patient_name, patient_gender, patient_dob,
      bed_id, ward_id, admission_status, admission_date,
      constraint_override, constraint_override_reason, constraint_violations,
      local_only, sync_status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, 1, 'PENDING', ?)
  `, [
    localId,
    data.patientId,
    data.patientMrn,
    data.patientName,
    data.patientGender,
    data.patientDob,
    data.bedId,
    data.wardId,
    new Date().toISOString(),
    data.constraintOverride ? 1 : 0,
    data.constraintOverrideReason,
    JSON.stringify(data.constraintViolations),
    new Date().toISOString(),
  ]);

  // Mark bed as occupied locally
  await db.execute(`
    UPDATE beds SET status = 'OCCUPIED', updated_at = ? WHERE id = ?
  `, [new Date().toISOString(), data.bedId]);

  return localId;
}
```

### 10.7 Conflict Resolution

```typescript
// web-app/lib/powersync/conflicts/admission-conflicts.ts

import { ConflictHandler } from '@powersync/web';

/**
 * Handle conflicts when offline admission syncs to server.
 * 
 * Conflict scenarios:
 * 1. Bed was assigned to another patient while offline
 * 2. Ward constraints changed while offline
 * 3. Patient was admitted elsewhere while offline
 */
export const admissionConflictHandler: ConflictHandler = {
  async resolve(conflict) {
    const { local, remote, table } = conflict;
    
    if (table !== 'admissions') {
      return 'remote'; // Default to server wins
    }

    // If bed conflict (same bed assigned twice)
    if (remote?.bed_id === local?.bed_id && remote?.id !== local?.id) {
      // Server wins - local admission needs reassignment
      return {
        resolution: 'custom',
        data: {
          ...local,
          sync_status: 'CONFLICT',
          conflict_reason: 'BED_ALREADY_ASSIGNED',
          conflict_remote_admission_id: remote.id,
        },
      };
    }

    // If patient already admitted elsewhere
    if (remote?.patient_id === local?.patient_id && remote?.admission_status === 'ACTIVE') {
      return {
        resolution: 'custom',
        data: {
          ...local,
          sync_status: 'CONFLICT',
          conflict_reason: 'PATIENT_ALREADY_ADMITTED',
          conflict_remote_admission_id: remote.id,
        },
      };
    }

    // Default: server wins for safety
    return 'remote';
  },
};
```

### 10.8 Implementation Steps

| Step | Description | Effort |
|------|-------------|--------|
| 1 | Install PowerSync SDK (`@powersync/web`) | 0.5 day |
| 2 | Define inpatient sync schema | 0.5 day |
| 3 | Configure sync rules on PowerSync backend | 1 day |
| 4 | Implement offline compatibility service | 1 day |
| 5 | Implement offline admission mutations | 1 day |
| 6 | Implement conflict resolution handlers | 1 day |
| 7 | Update UI to use PowerSync queries | 2 days |
| 8 | Test offline scenarios (network simulation) | 1 day |
| 9 | Test conflict resolution | 1 day |
| **Total** | | **9 days** |

### 10.9 Testing Offline Scenarios

```typescript
// tests/offline-compatibility.spec.ts

describe('Offline Ward Compatibility', () => {
  beforeEach(async () => {
    // Seed local SQLite with test data
    await seedLocalDatabase();
    // Simulate offline mode
    await powerSync.disconnect();
  });

  test('checks gender compatibility offline', async () => {
    const result = await checkCompatibilityOffline(
      malePatientId,
      femaleOnlyWardId,
      false
    );
    expect(result.compatible).toBe(false);
    expect(result.violations[0].code).toBe('GENDER_MISMATCH');
  });

  test('creates admission offline and syncs when online', async () => {
    const localId = await createAdmissionOffline({
      patientId: 1,
      // ... other data
    });
    
    expect(localId).toBeDefined();
    
    // Verify local state
    const admission = await db.get('SELECT * FROM admissions WHERE id = ?', [localId]);
    expect(admission.local_only).toBe(1);
    expect(admission.sync_status).toBe('PENDING');
    
    // Reconnect and sync
    await powerSync.connect();
    await powerSync.waitForSync();
    
    // Verify synced
    const syncedAdmission = await db.get('SELECT * FROM admissions WHERE patient_id = ?', [1]);
    expect(syncedAdmission.sync_status).toBe('SYNCED');
  });

  test('handles bed conflict when syncing', async () => {
    // Create offline admission for bed 1
    await createAdmissionOffline({ bedId: 1, ... });
    
    // Simulate: another user took bed 1 while we were offline
    // (inject conflict state)
    
    await powerSync.connect();
    await powerSync.waitForSync();
    
    // Verify conflict flagged
    const admission = await db.get('SELECT * FROM admissions WHERE bed_id = 1 AND local_only = 1');
    expect(admission.sync_status).toBe('CONFLICT');
    expect(admission.conflict_reason).toBe('BED_ALREADY_ASSIGNED');
  });
});
```

---

## 12. Decisions (Resolved)

| # | Question | Decision | Implementation |
|---|----------|----------|----------------|
| 1 | Auto-populate age ranges by ward type? | ✅ YES | Ward model `save()` method - see §2.3 |
| 2 | Insurance tier constraints for amenity wards? | 📋 YES (FUTURE) | Deferred to Phase 6 |
| 3 | CRITICAL violations notify supervisor? | ✅ YES | WebSocket escalation - see §4.4 |
| 4 | Bulk compatibility check endpoint? | ✅ YES | New API endpoint - see §3.3 |

### Default Age Ranges by Ward Type

| Ward Type | Min Age | Max Age |
|-----------|---------|----------|
| PEDIATRIC | 0 | 14 |
| MATERNITY | 12 | 55 |
| ICU | null | null |
| MEDICAL | null | null |
| SURGICAL | null | null |
| ISOLATION | null | null | 

---

## 13. References

- Kenya Ministry of Health facility standards
- KQMH accreditation requirements for patient placement
- JCI standards for patient care unit appropriateness
- Local cultural considerations for gender segregation
