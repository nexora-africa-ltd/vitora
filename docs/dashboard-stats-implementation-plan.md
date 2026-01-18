# Dashboard Real-Time Stats Implementation Plan

> **Branch**: `feature/dashboard-real-stats`
> **Estimated Effort**: 6-8 hours
> **Priority**: High (stakeholder demo visibility)

---

## Executive Summary

Replace hardcoded/mock dashboard statistics with real-time data from the backend API. Implement a cached dashboard stats endpoint to maintain fast page loads while providing accurate metrics.

---

## Current State Analysis

### Main Dashboard (`/dashboard`)

| Metric | Current Source | Status |
|--------|---------------|--------|
| Total Patients | Hardcoded `1,234` | ❌ Mock |
| Today's Encounters | Hardcoded `48` | ❌ Mock |
| Prescriptions | Hardcoded `156` | ❌ Mock |
| Alerts | `useStockAlerts()` | ✅ Real |
| Recent Patients | `usePatients()` | ✅ Real |

### Reports Page (`/reports`)

| Metric | Current Source | Status |
|--------|---------------|--------|
| Total Patients | API with fallback | ⚠️ Partial |
| Encounters Today | `Math.random()` | ❌ Mock |
| Avg Wait Time | Hardcoded `24` | ❌ Mock |
| Pending Lab Tests | Hardcoded `18` | ❌ Mock |
| Low Stock Items | Hardcoded `7` | ❌ Mock |
| Revenue Today | Hardcoded `145,200` | ❌ Mock |
| Patient Volume Chart | Random generation | ❌ Mock |
| Revenue Breakdown | Hardcoded array | ❌ Mock |

### Module Reports (Already Implemented ✅)

| Module | Status | Notes |
|--------|--------|-------|
| Triage Reports | ✅ Real | Uses `useTriageReports()` hook |
| Pharmacy Reports | ✅ Real | Stock summary, expiry, dispensing |
| Laboratory | ⚠️ Partial | Queue stats exist, need reports |

---

## Implementation Plan

### Phase 1: Backend Dashboard Stats API (2-3 hours)

#### 1.1 Create Dashboard Stats Endpoint

**File**: `backend/hmis/apps/core/views.py`

```python
# GET /api/dashboard/stats/
# Response cached for 5 minutes

{
    "timestamp": "2026-01-17T08:30:00Z",
    "cache_ttl": 300,

    "patients": {
        "total": 1247,
        "today": 12,
        "this_week": 45,
        "this_month": 156
    },

    "encounters": {
        "total": 3456,
        "today": 48,
        "in_progress": 8,
        "completed_today": 40
    },

    "pharmacy": {
        "prescriptions_today": 156,
        "pending_dispensing": 12,
        "low_stock_items": 7,
        "expiring_soon": 15
    },

    "laboratory": {
        "pending_tests": 18,
        "completed_today": 34,
        "critical_results": 2
    },

    "triage": {
        "waiting": 5,
        "avg_wait_time_minutes": 24,
        "emergency_count": 2
    },

    "billing": {
        "revenue_today": 145200,
        "pending_payments": 23500,
        "sha_claims_pending": 12
    },

    "alerts": {
        "critical": 1,
        "high": 3,
        "medium": 5,
        "total_unresolved": 9
    }
}
```

#### 1.2 Implement Caching Strategy

```python
# Option A: Django cache framework (recommended for staging)
from django.core.cache import cache

DASHBOARD_STATS_CACHE_KEY = "dashboard_stats"
DASHBOARD_STATS_TTL = 300  # 5 minutes

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    # Try cache first
    cached = cache.get(DASHBOARD_STATS_CACHE_KEY)
    if cached:
        return Response(cached)

    # Compute stats
    stats = compute_dashboard_stats()

    # Cache and return
    cache.set(DASHBOARD_STATS_CACHE_KEY, stats, DASHBOARD_STATS_TTL)
    return Response(stats)
```

#### 1.3 Add URL Route

```python
# backend/hmis/apps/core/urls.py
urlpatterns = [
    ...
    path("dashboard/stats/", views.dashboard_stats, name="dashboard-stats"),
]
```

### Phase 2: Frontend Integration (2-3 hours)

#### 2.1 Create Dashboard Stats Hook

**File**: `web-app/lib/hooks/use-dashboard-stats.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

export interface DashboardStats {
  timestamp: string;
  cache_ttl: number;
  patients: {
    total: number;
    today: number;
    this_week: number;
    this_month: number;
  };
  encounters: {
    total: number;
    today: number;
    in_progress: number;
    completed_today: number;
  };
  pharmacy: {
    prescriptions_today: number;
    pending_dispensing: number;
    low_stock_items: number;
    expiring_soon: number;
  };
  laboratory: {
    pending_tests: number;
    completed_today: number;
    critical_results: number;
  };
  triage: {
    waiting: number;
    avg_wait_time_minutes: number;
    emergency_count: number;
  };
  billing: {
    revenue_today: number;
    pending_payments: number;
    sha_claims_pending: number;
  };
  alerts: {
    critical: number;
    high: number;
    medium: number;
    total_unresolved: number;
  };
}

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: async () => {
      const response = await apiClient.get('/api/dashboard/stats/');
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes (match backend TTL)
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
  });
}
```

#### 2.2 Update Main Dashboard Page

**File**: `web-app/app/(dashboard)/dashboard/page.tsx`

```tsx
'use client';

import { useDashboardStats } from '@/lib/hooks/use-dashboard-stats';
import { StatsCard } from '@/components/dashboard/stats-card';
import { formatNumber, formatCurrency } from '@/lib/utils/format';

export default function DashboardPage() {
  const { data: stats, isLoading } = useDashboardStats();

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatsCard
        title="Total Patients"
        value={formatNumber(stats?.patients.total ?? 0)}
        description={`+${stats?.patients.today ?? 0} today`}
        icon={Users}
        loading={isLoading}
      />
      <StatsCard
        title="Today's Encounters"
        value={stats?.encounters.today ?? 0}
        description={`${stats?.encounters.in_progress ?? 0} in progress`}
        icon={Stethoscope}
        loading={isLoading}
      />
      {/* ... */}
    </div>
  );
}
```

#### 2.3 Update Reports Dashboard

**File**: `web-app/lib/hooks/use-dashboard-metrics.ts`

Replace mock data generation with real API calls using the same `/api/dashboard/stats/` endpoint.

### Phase 3: Historical Data Endpoint (2 hours) - Optional

For charts and trend analysis, create a time-series endpoint:

```python
# GET /api/dashboard/history/?days=7

{
    "data": [
        {
            "date": "2026-01-10",
            "patients_registered": 12,
            "encounters": 45,
            "revenue": 145200
        },
        ...
    ]
}
```

---

## Database Queries

### Patients Stats
```python
from django.utils import timezone
from datetime import timedelta

today = timezone.now().date()
week_ago = today - timedelta(days=7)
month_start = today.replace(day=1)

Patient.objects.count()  # total
Patient.objects.filter(created_at__date=today).count()  # today
Patient.objects.filter(created_at__date__gte=week_ago).count()  # this_week
```

### Encounters Stats
```python
Encounter.objects.filter(encounter_date=today).count()  # today
Encounter.objects.filter(encounter_date=today, status='IN_PROGRESS').count()
```

### Pharmacy Stats
```python
Prescription.objects.filter(
    created_at__date=today,
    status='DISPENSED'
).count()

StockAlert.objects.filter(
    resolved=False,
    alert_type='LOW_STOCK'
).count()
```

### Laboratory Stats
```python
LabOrder.objects.filter(
    status__in=['PENDING', 'SAMPLE_COLLECTED']
).count()
```

### Triage Stats
```python
from django.db.models import Avg

TriageAssessment.objects.filter(
    status='WAITING'
).count()

# Avg wait time
TriageAssessment.objects.filter(
    completed_at__date=today
).annotate(
    wait_time=F('completed_at') - F('created_at')
).aggregate(avg_wait=Avg('wait_time'))
```

---

## Testing Plan

### Backend Tests
```python
# tests/test_dashboard_stats.py

def test_dashboard_stats_requires_auth(api_client):
    response = api_client.get('/api/dashboard/stats/')
    assert response.status_code == 401

def test_dashboard_stats_returns_all_sections(authenticated_client):
    response = authenticated_client.get('/api/dashboard/stats/')
    assert response.status_code == 200
    assert 'patients' in response.data
    assert 'encounters' in response.data
    assert 'pharmacy' in response.data

def test_dashboard_stats_caching(authenticated_client):
    # First call computes
    response1 = authenticated_client.get('/api/dashboard/stats/')
    timestamp1 = response1.data['timestamp']

    # Second call should be cached (same timestamp)
    response2 = authenticated_client.get('/api/dashboard/stats/')
    timestamp2 = response2.data['timestamp']

    assert timestamp1 == timestamp2
```

### Frontend Tests
```typescript
// __tests__/dashboard-stats.test.tsx

describe('useDashboardStats', () => {
  it('fetches stats from API', async () => {
    // Mock API response
    // Verify hook returns data correctly
  });

  it('handles loading state', () => {
    // Verify loading skeleton displays
  });
});
```

---

## Migration Notes

1. **No database migrations required** - purely view/cache layer
2. **Backward compatible** - existing mock data falls back if API unavailable
3. **Progressive enhancement** - charts can remain mock until Phase 3

---

## Files to Create/Modify

### Backend (New)
- [ ] `hmis/apps/core/dashboard_views.py` - Stats endpoint
- [ ] `hmis/apps/core/dashboard_serializers.py` - Response schema
- [ ] `tests/test_dashboard_stats.py` - API tests

### Backend (Modify)
- [ ] `hmis/apps/core/urls.py` - Add route
- [ ] `hmis/settings/base.py` - Cache configuration

### Frontend (New)
- [ ] `lib/hooks/use-dashboard-stats.ts` - React Query hook
- [ ] `lib/types/dashboard-stats.ts` - TypeScript types

### Frontend (Modify)
- [ ] `app/(dashboard)/dashboard/page.tsx` - Use real data
- [ ] `components/dashboard/stats-card.tsx` - Add loading state
- [ ] `lib/hooks/use-dashboard-metrics.ts` - Replace mock data

---

## Rollout Plan

1. **Day 1**: Backend endpoint + tests
2. **Day 2**: Frontend integration + main dashboard
3. **Day 3**: Reports page + cleanup mock data
4. **Day 4**: Testing on staging + stakeholder review

---

## Success Criteria

- [ ] Dashboard loads in <500ms
- [ ] All stats reflect real database counts
- [ ] Stats auto-refresh every 5 minutes
- [ ] Loading states display during fetch
- [ ] Works on staging environment with demo data
- [ ] 80%+ test coverage on new code

---

## Out of Scope (Future)

- Historical trend charts (Phase 2)
- Per-department dashboards
- Custom date range filtering on main dashboard
- Real-time WebSocket updates
- BI Mart / data warehouse

---

*Document Version: 1.0*
*Created: January 17, 2026*
*Author: Engineering Team*
