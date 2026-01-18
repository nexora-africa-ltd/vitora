# Dashboard Real Endpoints Implementation Plan

> **Status**: Planning  
> **Priority**: Medium  
> **Estimated Effort**: 3-4 sprints  

## Current State Analysis

### ✅ Already Implemented (Real Data)
| Endpoint | Location | Data |
|----------|----------|------|
| `/api/core/dashboard/stats/` | `backend/hmis/apps/core/dashboard_views.py` | KPIs (patients, encounters, pharmacy, lab, triage, billing, alerts) |

### ❌ Using Mock Data (Frontend Only)
| Data | Frontend Location | Backend Needed |
|------|-------------------|----------------|
| `patientVolume` | `use-dashboard-metrics.ts:162-176` | Historical encounters by date |
| `revenueBreakdown` | `use-dashboard-metrics.ts:179-184` | Revenue by department |
| `recentActivity` | `use-dashboard-metrics.ts:187-231` | Activity feed/audit log |

---

## Phase 1: Patient Volume History API

### Backend Endpoint
**Route**: `GET /api/core/dashboard/patient-volume/`

**Query Parameters**:
- `start_date` (required): YYYY-MM-DD
- `end_date` (required): YYYY-MM-DD
- `granularity` (optional): `day` | `week` | `month` (default: `day`)

**Response Schema**:
```python
{
    "date_range": {"start": "2026-01-01", "end": "2026-01-07"},
    "granularity": "day",
    "data": [
        {
            "date": "2026-01-01",
            "registrations": 12,
            "encounters": 45,
            "by_type": {
                "OPD": 32,
                "IPD": 8,
                "EMERGENCY": 5,
                "ANC": 0,
                "PAEDIATRIC": 0,
                # ... all encounter types
            }
        },
        # ... more days
    ]
}
```

### Backend Implementation

**File**: `backend/hmis/apps/core/dashboard_views.py`

```python
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def patient_volume_history(request):
    """
    Get patient volume history for charts.
    
    Query params:
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)
        granularity: day|week|month (default: day)
    """
    from hmis.apps.patients.models import Patient
    from hmis.apps.encounters.models import Encounter
    from django.db.models import Count
    from django.db.models.functions import TruncDate, TruncWeek, TruncMonth
    
    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    granularity = request.query_params.get('granularity', 'day')
    
    # Validation
    if not start_date or not end_date:
        return Response({"error": "start_date and end_date required"}, status=400)
    
    trunc_func = {
        'day': TruncDate,
        'week': TruncWeek,
        'month': TruncMonth,
    }.get(granularity, TruncDate)
    
    # Patient registrations by date
    registrations = (
        Patient.objects
        .filter(created_at__date__range=[start_date, end_date])
        .annotate(date=trunc_func('created_at'))
        .values('date')
        .annotate(count=Count('id'))
    )
    
    # Encounters by date and type
    encounters = (
        Encounter.objects
        .filter(encounter_date__range=[start_date, end_date])
        .annotate(date=trunc_func('encounter_date'))
        .values('date', 'encounter_type')
        .annotate(count=Count('id'))
    )
    
    # Aggregate into response format
    # ... (build date-keyed dict, fill gaps, return)
```

### Frontend Hook Update

**File**: `web-app/lib/hooks/use-dashboard-metrics.ts`

```typescript
// New dedicated hook
export function usePatientVolumeHistory(filter?: DateRangeFilter) {
  const dateRange = getDateRange(filter);
  
  return useQuery({
    queryKey: ['patient-volume-history', dateRange],
    queryFn: async () => {
      const response = await apiClient.get<PatientVolumeResponse>(
        '/api/core/dashboard/patient-volume/',
        { params: { start_date: dateRange.start, end_date: dateRange.end } }
      );
      return response.data.data;
    },
    staleTime: 300000, // 5 minutes
  });
}
```

### TDD Tests Required
- [x] `test_patient_volume_requires_authentication`
- [x] `test_patient_volume_requires_date_params`
- [x] `test_patient_volume_returns_daily_breakdown`
- [x] `test_patient_volume_groups_by_encounter_type`
- [x] `test_patient_volume_respects_granularity`

---

## Phase 2: Revenue Breakdown API

### Backend Endpoint
**Route**: `GET /api/core/dashboard/revenue-breakdown/`

**Query Parameters**:
- `start_date` (required): YYYY-MM-DD
- `end_date` (required): YYYY-MM-DD
- `group_by` (optional): `department` | `service_type` | `payment_method`

**Response Schema**:
```python
{
    "date_range": {"start": "2026-01-01", "end": "2026-01-07"},
    "total_revenue": 145200.00,
    "currency": "KES",
    "breakdown": [
        {
            "department": "Consultation",
            "amount": 45000.00,
            "percentage": 31.0,
            "transaction_count": 120
        },
        {
            "department": "Laboratory",
            "amount": 35000.00,
            "percentage": 24.1,
            "transaction_count": 85
        },
        # ...
    ]
}
```

### Backend Implementation

**File**: `backend/hmis/apps/core/dashboard_views.py`

```python
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def revenue_breakdown(request):
    """
    Get revenue breakdown by department/service.
    """
    from hmis.apps.billing.models import Payment, InvoiceLineItem
    from django.db.models import Sum, Count
    
    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    group_by = request.query_params.get('group_by', 'department')
    
    # Aggregate payments by department
    breakdown = (
        Payment.objects
        .filter(
            payment_date__date__range=[start_date, end_date],
            status='COMPLETED'
        )
        .values('invoice__department')  # or service_type
        .annotate(
            amount=Sum('amount'),
            transaction_count=Count('id')
        )
        .order_by('-amount')
    )
    
    total = sum(item['amount'] for item in breakdown)
    
    return Response({
        "date_range": {"start": start_date, "end": end_date},
        "total_revenue": total,
        "currency": "KES",
        "breakdown": [
            {
                "department": item['invoice__department'],
                "amount": float(item['amount']),
                "percentage": round(item['amount'] / total * 100, 1) if total else 0,
                "transaction_count": item['transaction_count'],
            }
            for item in breakdown
        ]
    })
```

### TDD Tests Required
- [x] `test_revenue_breakdown_requires_authentication`
- [x] `test_revenue_breakdown_aggregates_by_department`
- [x] `test_revenue_breakdown_calculates_percentages`
- [x] `test_revenue_breakdown_filters_by_date_range`

---

## Phase 3: Activity Feed API

### Backend Endpoint
**Route**: `GET /api/core/dashboard/activity-feed/`

**Query Parameters**:
- `limit` (optional): Number of items (default: 20, max: 100)
- `offset` (optional): Pagination offset
- `types` (optional): Comma-separated activity types filter

**Response Schema**:
```python
{
    "count": 150,
    "next": "/api/core/dashboard/activity-feed/?limit=20&offset=20",
    "results": [
        {
            "id": "act_123",
            "type": "patient",
            "action": "registered",
            "title": "New patient registered",
            "description": "John Doe (MRN-20260118-0001)",
            "timestamp": "2026-01-18T10:30:00Z",
            "user": {
                "id": 5,
                "name": "Jane Nurse"
            },
            "resource": {
                "type": "patient",
                "id": 1234,
                "href": "/patients/1234"
            }
        },
        # ...
    ]
}
```

### Backend Implementation Options

**Option A: Use Existing AuditLog**
```python
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def activity_feed(request):
    """
    Get recent activity feed from audit logs.
    """
    from hmis.apps.core.models import AuditLog
    
    limit = min(int(request.query_params.get('limit', 20)), 100)
    offset = int(request.query_params.get('offset', 0))
    types = request.query_params.get('types', '').split(',') if request.query_params.get('types') else None
    
    queryset = AuditLog.objects.select_related('user').order_by('-timestamp')
    
    if types:
        queryset = queryset.filter(resource_type__in=types)
    
    total = queryset.count()
    activities = queryset[offset:offset + limit]
    
    return Response({
        "count": total,
        "next": f"...?limit={limit}&offset={offset + limit}" if offset + limit < total else None,
        "results": [
            {
                "id": f"act_{log.id}",
                "type": log.resource_type.lower(),
                "action": log.action,
                "title": _format_activity_title(log),
                "description": _format_activity_description(log),
                "timestamp": log.timestamp.isoformat(),
                "user": {"id": log.user_id, "name": log.user.get_full_name()} if log.user else None,
                "resource": {
                    "type": log.resource_type,
                    "id": log.resource_id,
                    "href": _get_resource_href(log)
                }
            }
            for log in activities
        ]
    })
```

**Option B: Dedicated Activity Model** (More flexible, better for notifications)
```python
# hmis/apps/core/models.py
class ActivityFeed(models.Model):
    """Real-time activity feed for dashboard."""
    
    ACTIVITY_TYPES = [
        ('patient', 'Patient'),
        ('encounter', 'Encounter'),
        ('lab', 'Laboratory'),
        ('pharmacy', 'Pharmacy'),
        ('billing', 'Billing'),
        ('triage', 'Triage'),
    ]
    
    type = models.CharField(max_length=20, choices=ACTIVITY_TYPES)
    action = models.CharField(max_length=50)  # registered, completed, dispensed, etc.
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    resource_type = models.CharField(max_length=50)
    resource_id = models.PositiveIntegerField()
    metadata = models.JSONField(default=dict, blank=True)
    
    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['type', '-timestamp']),
        ]
```

### Recommendation
Use **Option A (AuditLog)** first since it already exists and captures all CRUD operations. Migrate to Option B later if needed for notifications/subscriptions.

### TDD Tests Required
- [ ] `test_activity_feed_requires_authentication`
- [ ] `test_activity_feed_returns_recent_first`
- [ ] `test_activity_feed_respects_limit`
- [ ] `test_activity_feed_filters_by_type`
- [ ] `test_activity_feed_includes_user_info`

---

## Phase 4: Frontend Integration

### Update Type Definitions
**File**: `web-app/lib/types/dashboard.ts`

```typescript
// Add new response types
export interface PatientVolumeResponse {
  date_range: { start: string; end: string };
  granularity: 'day' | 'week' | 'month';
  data: PatientVolumeData[];
}

export interface RevenueBreakdownResponse {
  date_range: { start: string; end: string };
  total_revenue: number;
  currency: string;
  breakdown: RevenueData[];
}

export interface ActivityFeedResponse {
  count: number;
  next: string | null;
  results: RecentActivity[];
}

// Update RecentActivity to match backend
export interface RecentActivity {
  id: string;
  type: 'patient' | 'encounter' | 'lab' | 'pharmacy' | 'billing' | 'triage';
  action: string;
  title: string;
  description: string;
  timestamp: string;
  user?: { id: number; name: string };
  resource?: { type: string; id: number; href: string };
}
```

### Update Hooks
**File**: `web-app/lib/hooks/use-dashboard-metrics.ts`

```typescript
// Replace mock implementations with real API calls

async function fetchDashboardMetrics(filter?: DateRangeFilter): Promise<DashboardMetrics> {
  const dateRange = getDateRange(filter);
  
  // Fetch all in parallel
  const [stats, volumeRes, revenueRes, activityRes] = await Promise.all([
    apiClient.get<DashboardStats>('/api/core/dashboard/stats/'),
    apiClient.get<PatientVolumeResponse>('/api/core/dashboard/patient-volume/', {
      params: { start_date: dateRange.start, end_date: dateRange.end }
    }),
    apiClient.get<RevenueBreakdownResponse>('/api/core/dashboard/revenue-breakdown/', {
      params: { start_date: dateRange.start, end_date: dateRange.end }
    }),
    apiClient.get<ActivityFeedResponse>('/api/core/dashboard/activity-feed/', {
      params: { limit: 10 }
    }),
  ]);
  
  return {
    kpis: buildKPIsFromStats(stats.data),
    patientVolume: volumeRes.data.data,
    revenueBreakdown: revenueRes.data.breakdown,
    recentActivity: activityRes.data.results,
    dateRange,
  };
}
```

---

## Implementation Priority

| Phase | Endpoint | Effort | Dependencies | Priority |
|-------|----------|--------|--------------|----------|
| 1 | Patient Volume History | 3 days | None | **High** - Charts are empty without it |
| 2 | Revenue Breakdown | 2 days | Billing module | **Medium** - Useful for finance |
| 3 | Activity Feed | 2 days | AuditLog exists | **Medium** - Nice to have |
| 4 | Frontend Integration | 2 days | Phases 1-3 | **High** - Ties it all together |

---

## URL Registration

**File**: `backend/hmis/apps/core/urls.py`

```python
from django.urls import path
from . import dashboard_views

urlpatterns = [
    # Existing
    path('dashboard/stats/', dashboard_views.dashboard_stats, name='dashboard-stats'),
    
    # New endpoints
    path('dashboard/patient-volume/', dashboard_views.patient_volume_history, name='dashboard-patient-volume'),
    path('dashboard/revenue-breakdown/', dashboard_views.revenue_breakdown, name='dashboard-revenue-breakdown'),
    path('dashboard/activity-feed/', dashboard_views.activity_feed, name='dashboard-activity-feed'),
]
```

---

## Testing Checklist

### Backend Tests
- [ ] Unit tests for each helper function
- [ ] Integration tests for each endpoint
- [ ] Permission tests (authentication required)
- [ ] Edge cases (empty data, invalid dates)
- [ ] Performance tests (large date ranges)

### Frontend Tests
- [ ] Hook tests with MSW mocks
- [ ] Error handling (API failures)
- [ ] Loading states
- [ ] Empty states (no data)

---

## Rollout Plan

1. **Week 1**: Implement Phase 1 (Patient Volume) + Tests
2. **Week 2**: Implement Phase 2 (Revenue) + Phase 3 (Activity)
3. **Week 3**: Frontend Integration + E2E Tests
4. **Week 4**: Performance optimization, caching, monitoring

---

## Questions to Resolve

1. **Data Retention**: How far back should historical data be queryable?
2. **Caching Strategy**: Use Redis or Django cache? TTL values?
3. **Rate Limiting**: Should dashboard endpoints be rate-limited?
4. **Real-time Updates**: Consider WebSocket for live activity feed?
