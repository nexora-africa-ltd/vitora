# Queue + Room Routing Pattern

> **SSOT** for the reusable queue-with-room-assignment architecture used across Vitora HMIS modules. Follow this pattern when adding queuing to Lab, Procedures, Imaging, Pharmacy, or any other module that routes patients to rooms/stations.

---

## Overview

The pattern connects three core concepts:

```
Patient check-in → Queue Entry (with optional room FK)
                         ↑
                    Auto-routing service
                         ↑
            Room (PLACE Resource) + Active Shift (clocked-in staff)
```

**Queue Entry** tracks the patient's position and status.
**Room** is a `scheduling.Resource` with `resource_type='PLACE'`.
**Auto-routing** selects the best room based on capacity and staff presence.
**Module Settings** toggle auto-routing on/off per facility.

---

## Architecture

### Models Involved

| Model | App | Role |
|-------|-----|------|
| `Resource` | `scheduling` | PLACE resources are rooms/stations. Has `capacity`, `department` FK, `is_active`. |
| `Shift` | `scheduling` | Tracks clocked-in staff. `room` FK links a shift to a PLACE resource. `status` in `[ACTIVE, ON_BREAK]` = staff present. |
| `Department` | `core` | Tags rooms to a module (e.g., "Triage", "Laboratory", "Radiology"). |
| `WaitingQueue` | `triage` | Queue entry with `triage_room` FK to `Resource`. **Replace with your module's queue model.** |
| `TriageSettings` | `triage` | Per-facility toggle (`auto_route_to_room`) + department FK. **Replace with your module's settings model.** |

### Data Flow

```
1. Patient checks in → Queue entry created
2. If auto-routing enabled:
   a. Query PLACE resources in configured department for the facility
   b. Annotate each room with current_load (active queue entries pointing to it)
   c. Query active shifts (ACTIVE/ON_BREAK) to find rooms with staff
   d. Filter: room.current_load < room.capacity AND room has active staff
   e. Pick room with lowest load (ties broken alphabetically)
3. Set queue_entry.room = selected room (or None if no eligible room)
4. Staff can manually assign/reassign rooms from the queue UI
```

---

## Implementation Checklist

When adding queue + room routing to a new module (e.g., Lab), follow these steps:

### 1. Queue Model

Create a queue model in your module with a room FK:

```python
# hmis/apps/laboratory/models.py

class LabQueue(models.Model):
    """Queue for patients waiting for lab sample collection."""

    STATUS_CHOICES = [
        ("WAITING", "Waiting"),
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
    ]

    patient = models.ForeignKey("patients.Patient", on_delete=models.CASCADE, related_name="lab_queue_entries")
    encounter = models.ForeignKey("encounters.Encounter", on_delete=models.CASCADE, null=True, blank=True)
    lab_order = models.ForeignKey("laboratory.LabOrder", on_delete=models.CASCADE, null=True, blank=True)
    check_in_time = models.DateTimeField(default=timezone.now)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="WAITING")
    priority = models.CharField(max_length=20, blank=True, default="")
    
    # Room assignment (the key FK)
    assigned_room = models.ForeignKey(
        "scheduling.Resource",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lab_queue_entries",         # ← unique related_name per module
        limit_choices_to={"resource_type": "PLACE"},
        help_text="Lab station/room assigned to this patient.",
    )
    
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["check_in_time"]
```

**Key points:**
- FK to `scheduling.Resource` with `on_delete=SET_NULL` (room deletion shouldn't cascade)
- `limit_choices_to={"resource_type": "PLACE"}` for admin validation
- Unique `related_name` (used in the capacity annotation query)

### 2. Module Settings Model

```python
class LabSettings(models.Model):
    """Per-facility lab queue settings."""

    facility = models.OneToOneField("core.Facility", on_delete=models.CASCADE, related_name="lab_settings")
    auto_route_to_room = models.BooleanField(default=False)
    lab_department = models.ForeignKey(
        "core.Department",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        help_text="Department used to identify lab rooms/stations.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Lab Settings"
        verbose_name_plural = "Lab Settings"
```

### 3. Auto-Routing Service Function

Copy and adapt from `hmis/apps/triage/services.py::find_best_triage_room`:

```python
# hmis/apps/laboratory/services.py

def find_best_lab_room(facility):
    """
    Find the best available lab room for auto-routing.

    Eligible rooms must:
    1. Be active PLACE resources in the facility
    2. Belong to the configured lab department
    3. Have at least one ACTIVE or ON_BREAK shift (clocked-in staff)
    4. Have current patient load below capacity

    Returns the least-loaded eligible room, or None.
    """
    from django.db.models import Count, Q
    from hmis.apps.scheduling.models import Resource, Shift
    from .models import LabSettings, LabQueue

    try:
        settings = LabSettings.objects.select_related("lab_department").get(facility=facility)
    except LabSettings.DoesNotExist:
        return None

    if not settings.auto_route_to_room or not settings.lab_department_id:
        return None

    rooms = (
        Resource.objects.filter(
            facility=facility,
            resource_type="PLACE",
            is_active=True,
            department=settings.lab_department,
        )
        .annotate(
            current_load=Count(
                "lab_queue_entries",                      # ← matches related_name on LabQueue.assigned_room
                filter=Q(lab_queue_entries__status__in=["WAITING", "IN_PROGRESS"]),
            )
        )
        .order_by("current_load", "name")
    )

    from datetime import date as date_cls
    today = date_cls.today()
    rooms_with_staff = set(
        Shift.objects.filter(
            room__in=rooms,
            shift_date=today,
            status__in=["ACTIVE", "ON_BREAK"],
        ).values_list("room_id", flat=True)
    )

    for room in rooms:
        if room.pk not in rooms_with_staff:
            continue
        if room.current_load < room.capacity:
            return room

    return None
```

**The three things you customize:**
1. Settings model class (`LabSettings`)
2. Queue model related name (`lab_queue_entries`)
3. Active status values in the filter (`["WAITING", "IN_PROGRESS"]`)

### 4. Serializers

**Read serializer** — add `assigned_room` (FK id) and `assigned_room_name` (display):

```python
class LabQueueSerializer(serializers.ModelSerializer):
    assigned_room_name = serializers.CharField(
        source="assigned_room.name", read_only=True, allow_null=True, default=None
    )

    class Meta:
        model = LabQueue
        fields = [..., "assigned_room", "assigned_room_name", ...]
```

**Create serializer** — accept optional `assigned_room_id`:

```python
class LabQueueCreateSerializer(serializers.ModelSerializer):
    assigned_room_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)

    def validate_assigned_room_id(self, value):
        if value is None:
            return value
        from hmis.apps.scheduling.models import Resource
        try:
            Resource.objects.get(pk=value, resource_type="PLACE", is_active=True)
        except Resource.DoesNotExist:
            raise serializers.ValidationError("Room not found or not active.")
        return value

    def create(self, validated_data):
        room_id = validated_data.pop("assigned_room_id", None)
        # ... create queue entry ...
        # Resolve room: explicit > auto-route > None
        room = None
        if room_id:
            from hmis.apps.scheduling.models import Resource
            room = Resource.objects.get(pk=room_id)
        elif facility:
            from .services import find_best_lab_room
            room = find_best_lab_room(facility)
        entry = LabQueue.objects.create(assigned_room=room, ...)
        return entry
```

**Settings serializer:**

```python
class LabSettingsSerializer(serializers.ModelSerializer):
    lab_department_name = serializers.CharField(
        source="lab_department.name", read_only=True, allow_null=True, default=None
    )

    class Meta:
        model = LabSettings
        fields = ["id", "facility", "auto_route_to_room", "lab_department", "lab_department_name", "created_at", "updated_at"]
        read_only_fields = ["facility", "created_at", "updated_at"]
```

### 5. ViewSet Actions

Add these actions to your queue ViewSet:

```python
from hmis.apps.core.mixins import NestedTenantScopeMixin

class LabQueueViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """Queue ViewSets typically have no direct facility FK — use
    NestedTenantScopeMixin to scope through a parent chain.

    ⚠️ Do NOT use TenantScopedViewMixin with tenant_scope='none' and a manual
    get_queryset bypass — that skips _resolve_tenant_context().
    """
    queryset = LabQueue.objects.select_related("patient", "encounter", "assigned_room")
    tenant_facility_chain = "encounter__facility"
    tenant_org_chain = "encounter__organization"

    @action(detail=True, methods=["post"], url_path="assign-room")
    def assign_room(self, request, pk=None):
        """Manually assign or clear a room."""
        entry = self.get_object()
        room_id = request.data.get("assigned_room_id")
        if room_id is None:
            entry.assigned_room = None
        else:
            from hmis.apps.scheduling.models import Resource
            try:
                room = Resource.objects.get(pk=room_id, resource_type="PLACE", is_active=True)
            except Resource.DoesNotExist:
                return Response({"error": "Room not found."}, status=400)
            entry.assigned_room = room
        entry.save(update_fields=["assigned_room", "updated_at"])
        return Response(LabQueueSerializer(entry).data)

    @action(detail=False, methods=["get"], url_path="available-rooms")
    def available_rooms(self, request):
        """List rooms with occupancy and active-staff info."""
        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        if not facility:
            return Response([])
        try:
            settings = LabSettings.objects.select_related("lab_department").get(facility=facility)
        except LabSettings.DoesNotExist:
            return Response([])
        if not settings.lab_department_id:
            return Response([])

        rooms = Resource.objects.filter(
            facility=facility, resource_type="PLACE", is_active=True,
            department=settings.lab_department,
        ).annotate(
            current_load=Count("lab_queue_entries", filter=Q(lab_queue_entries__status__in=["WAITING", "IN_PROGRESS"]))
        ).order_by("name")

        today = date.today()
        rooms_with_staff = set(
            Shift.objects.filter(room__in=rooms, shift_date=today, status__in=["ACTIVE", "ON_BREAK"])
            .values_list("room_id", flat=True)
        )

        return Response([
            {
                "id": r.pk, "name": r.name, "code": r.code,
                "capacity": r.capacity, "current_load": r.current_load,
                "has_active_staff": r.pk in rooms_with_staff,
                "is_available": r.current_load < r.capacity and r.pk in rooms_with_staff,
            }
            for r in rooms
        ])
```

And a simple settings ViewSet:

```python
class LabSettingsViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """Per-facility lab queue settings.

    Uses tenant_scope='facility' so TenantScopedViewMixin automatically:
    - resolves facility from X-Facility-Id header or staff profile
    - scopes list() queryset to the active facility
    """
    queryset = LabSettings.objects.select_related("lab_department")
    serializer_class = LabSettingsSerializer
    permission_classes = [IsAuthenticated]
    tenant_scope = "facility"  # ⚠️ MUST be "facility", NOT "none"
    http_method_names = ["get", "patch", "head", "options"]

    @action(detail=False, methods=["get"], url_path="current")
    def current(self, request):
        """Get or create settings for the current facility."""
        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        if not facility:
            return Response({"error": "No facility context."}, status=400)
        obj, _ = LabSettings.objects.get_or_create(facility=facility)
        return Response(LabSettingsSerializer(obj).data)
```

> ⚠️ **Do NOT use `tenant_scope = "none"` with a manual `get_queryset` that
> bypasses `super()`**. This skips `_resolve_tenant_context()` and the
> `X-Facility-Id` header is never read — `request.facility` stays `None`.
> Use `tenant_scope = "facility"` for models with a direct `facility` FK.
> Use `NestedTenantScopeMixin` for models scoped through a parent chain
> (e.g., queue entries scoped via `encounter__facility`).

### 6. URL Registration

```python
router.register(r"queue", LabQueueViewSet, basename="labqueue")
router.register(r"settings", LabSettingsViewSet, basename="labsettings")
```

### 7. Frontend

#### Zod Schemas

```typescript
// lib/schemas/laboratory.schema.ts

export const LabQueueEntrySchema = z.object({
  id: z.number(),
  patient: z.number(),
  patient_name: z.string(),
  status: z.enum(['WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  assigned_room: z.number().nullable(),
  assigned_room_name: z.string().nullable(),
  // ... other fields
});

export const AvailableLabRoomSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string(),
  capacity: z.number(),
  current_load: z.number(),
  has_active_staff: z.boolean(),
  is_available: z.boolean(),
});

export const LabSettingsSchema = z.object({
  id: z.number(),
  facility: z.number(),
  auto_route_to_room: z.boolean(),
  lab_department: z.number().nullable(),
  lab_department_name: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
```

#### React Query Hooks

```typescript
// lib/hooks/use-lab-queue.ts

export const labQueueKeys = {
  all: ['lab-queue'] as const,
  entries: () => [...labQueueKeys.all, 'entries'] as const,
  availableRooms: () => [...labQueueKeys.all, 'available-rooms'] as const,
  settings: () => [...labQueueKeys.all, 'settings'] as const,
};

export function useLabQueue(filters = {}) {
  return useQuery({
    queryKey: labQueueKeys.entries(),
    queryFn: () => labApi.getQueue(filters),
    refetchInterval: 15000,
  });
}

export function useAvailableLabRooms() {
  return useQuery({
    queryKey: labQueueKeys.availableRooms(),
    queryFn: () => labApi.getAvailableRooms(),
    refetchInterval: 30000,
  });
}

export function useAssignLabRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, roomId }: { entryId: number; roomId: number | null }) =>
      labApi.assignRoom(entryId, roomId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: labQueueKeys.entries() });
      qc.invalidateQueries({ queryKey: labQueueKeys.availableRooms() });
    },
  });
}

export function useLabSettings() {
  return useQuery({
    queryKey: labQueueKeys.settings(),
    queryFn: () => labApi.getSettings(),
  });
}

export function useUpdateLabSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => labApi.updateSettings(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: labQueueKeys.settings() }),
  });
}
```

#### Queue UI Pattern

The queue card shows:
1. **Room badge** — `DoorOpen` icon + room name (when assigned)
2. **Room dropdown** — `<Select>` with available rooms, showing `(load/capacity)` and staff status
3. **Settings page tab** — toggle for auto-routing + room overview grid

See [triage/page.tsx](../web-app/app/(dashboard)/triage/page.tsx) for the reference implementation.

### 8. Tests

Write tests covering:

```python
class TestAutoRouting:
    def test_returns_none_when_no_settings(self, facility): ...
    def test_returns_none_when_disabled(self, facility, settings): ...
    def test_returns_none_when_no_department(self, facility): ...
    def test_returns_none_when_no_active_staff(self, settings, room): ...
    def test_routes_to_room_with_active_staff(self, settings, room, shift): ...
    def test_skips_full_room(self, settings, room, shift, queue_entries): ...
    def test_prefers_least_loaded_room(self, settings, room_a, room_b, shifts): ...
    def test_skips_inactive_room(self, settings, room): ...
    def test_on_break_counts_as_active_staff(self, settings, room, on_break_shift): ...

class TestQueueAPIAutoRouting:
    def test_create_auto_routes_when_enabled(self, client, settings, room, shift): ...
    def test_create_no_route_when_disabled(self, client, settings): ...
    def test_create_with_explicit_room(self, client, room): ...

class TestAssignRoomAction:
    def test_assign_room(self, client, entry, room): ...
    def test_clear_room(self, client, entry, room): ...
    def test_invalid_room(self, client, entry): ...

class TestAvailableRooms:
    def test_returns_rooms_with_occupancy(self, client, settings, rooms, shifts): ...
    def test_empty_when_no_settings(self, client): ...

class TestModuleSettings:
    def test_get_current_creates_if_missing(self, client, facility): ...
    def test_patch_toggle(self, client, settings): ...
```

See `backend/tests/triage/test_triage_room_routing.py` for the reference implementation (28 tests).

---

## Reference Implementations

| File | Purpose |
|------|---------|
| `backend/hmis/apps/triage/models.py` → `WaitingQueue.triage_room`, `TriageSettings` | Queue model + settings model |
| `backend/hmis/apps/triage/services.py` → `find_best_triage_room()` | Auto-routing algorithm |
| `backend/hmis/apps/triage/serializers.py` → `WaitingQueueSerializer`, `TriageSettingsSerializer` | Serializers |
| `backend/hmis/apps/triage/views.py` → `WaitingQueueViewSet`, `TriageSettingsViewSet` | ViewSets with `assign-room` and `available-triage-rooms` actions |
| `backend/tests/triage/test_triage_room_routing.py` | 28 comprehensive tests |
| `web-app/lib/schemas/triage.schema.ts` → `AvailableTriageRoomSchema`, `TriageSettingsSchema` | Frontend Zod schemas |
| `web-app/lib/api/triage.ts` → `assignTriageRoom()`, `getAvailableTriageRooms()`, `getTriageSettings()` | API client methods |
| `web-app/lib/hooks/use-triage.ts` → `useAvailableTriageRooms()`, `useAssignTriageRoom()`, `useTriageSettings()` | React Query hooks |
| `web-app/app/(dashboard)/triage/page.tsx` | Queue UI with room badges + dropdown |
| `web-app/app/(dashboard)/triage/settings/page.tsx` | Settings UI with toggle + room overview |

---

## Key Design Decisions

1. **Room = `scheduling.Resource(PLACE)`** — Reuses existing Resource model. No new room model needed. Tag rooms to a module via the `department` FK.

2. **`related_name` per module** — Each module's queue model uses a unique `related_name` on the room FK (e.g., `triage_queue_entries`, `lab_queue_entries`). This is required for the `Count` annotation in the auto-routing query.

3. **Settings per facility, not global** — Each facility can independently toggle auto-routing and choose which department identifies their rooms.

4. **Staff presence = active shift in room** — A room "has staff" if there's a `Shift` with `room=resource` and `status in [ACTIVE, ON_BREAK]` for today. This leverages the existing clock-in system.

5. **Least-loaded routing** — Among eligible rooms, the one with the fewest active patients is selected. This distributes load evenly.

6. **Manual override always available** — Even with auto-routing on, staff can reassign rooms via the queue UI. Explicit `room_id` in the create payload overrides auto-routing.

7. **Graceful degradation** — If no eligible room is found (all full, no staff, no settings), the patient is simply queued without a room assignment. The system never blocks check-in.

8. **Tenant scoping: use the right mixin** — Queue entries typically lack a direct `facility` FK and connect through a parent chain (e.g., `encounter__facility`). Use `NestedTenantScopeMixin` for queue ViewSets and `TenantScopedViewMixin` with `tenant_scope = "facility"` for settings ViewSets. **Never** use `tenant_scope = "none"` with a manual `get_queryset` that calls `viewsets.ModelViewSet.get_queryset(self)` — this bypasses `_resolve_tenant_context()`, so the `X-Facility-Id` header is never read and `request.facility` stays `None`.

---

**Last Updated**: April 13, 2026
