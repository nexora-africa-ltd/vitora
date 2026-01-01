# Sprint 1.5-1.6 Track C: Web Frontend Dashboard - Deliverables

**Sprint Duration**: Weeks 9-12 (Phase 1)
**Status**: 📋 PLANNED
**Target Date**: Q1 2026
**Dependencies**: Sprint 1.3-1.4 Track C (Next.js scaffold, Auth, Patient list)

---

## Executive Summary

Track C of Sprint 1.5-1.6 extends the Web Frontend with encounter details views, patient timeline/history, reporting dashboards for stakeholders, and ensures mobile-responsive design. This creates a read-only stakeholder demo portal while maintaining the existing patient management functionality.

### Key Deliverables

| Deliverable | Tests Required | Priority | User Input Needed |
|-------------|----------------|----------|-------------------|
| Encounter Details View | 12 tests | High | ❌ |
| Patient Timeline/History | 14 tests | High | ❌ |
| Reporting Dashboard | 16 tests | High | ✅ **KPI Definitions** |
| Dashboard Widgets | 10 tests | Medium | ❌ |
| Data Visualization Charts | 8 tests | Medium | ❌ |
| Responsive Design (Mobile) | 12 tests | High | ❌ |
| Stakeholder Access Control | 8 tests | Medium | ✅ **Stakeholder Roles** |
| Print/Export Reports | 6 tests | Low | ❌ |
| E2E Tests (Playwright) | 14 tests | High | ❌ |

**Total Planned Tests**: ~100 tests (Unit + E2E)
**Target Coverage**: ≥80%

---

## ⚠️ User Input Required

Before implementation begins, the following inputs are needed:

### 1. KPI/Metrics Definitions (MEDIUM PRIORITY)

| Metric | Description | Default |
|--------|-------------|---------|
| **Daily Patient Volume** | Patients seen per day | ✅ Included |
| **Average Wait Time** | Time from check-in to consultation | ✅ Included |
| **Revenue Metrics** | Daily/weekly/monthly revenue | ✅ Included |
| **Lab Turnaround Time** | Average TAT for lab results | ✅ Included |
| **Pharmacy Stock Alerts** | Low stock, expiring items | ✅ Included |
| **Custom KPIs** | Facility-specific metrics | ⏳ Provide if needed |

**Action Required**: 
- Review default KPIs and confirm if suitable
- Provide any facility-specific metrics you want tracked

**Timeline**: Needed by Week 10 (for dashboard implementation)

### 2. Stakeholder Roles/Permissions (LOW PRIORITY)

| Role | Description | Default Access |
|------|-------------|----------------|
| **Facility Admin** | Full access to all reports | All dashboards |
| **Department Head** | Department-specific data | Own department only |
| **Finance Officer** | Billing/revenue reports | Financial reports |
| **External Stakeholder** | Summary metrics only | Public dashboard |

**Note**: We'll implement a basic role-based dashboard access. Detailed RBAC is planned for Sprint 1.7-1.8.

### 3. Branding/Theming (OPTIONAL)

| Item | Description | Default |
|------|-------------|---------|
| **Primary Color** | Brand color | Vitora Blue (#0066CC) |
| **Logo** | Dashboard header logo | Vitora logo |
| **Facility Name** | Display name | "[Your Facility Name]" |

**Note**: Defaults will be used unless custom branding is provided.

---

## Prerequisites (From Sprint 1.3-1.4 Track C)

The following should already exist from the previous sprint:

### Existing Web App Structure
```
web-app/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx        # Login page
│   ├── (dashboard)/
│   │   ├── layout.tsx            # Dashboard layout with sidebar
│   │   ├── page.tsx              # Dashboard home (to be enhanced)
│   │   ├── patients/
│   │   │   ├── page.tsx          # Patient list
│   │   │   └── [id]/page.tsx     # Patient detail
│   │   └── encounters/
│   │       └── page.tsx          # Encounters list (basic)
│   └── layout.tsx                # Root layout
├── components/
│   ├── layout/
│   │   ├── sidebar.tsx           # Navigation sidebar
│   │   └── header.tsx            # Top header
│   └── ui/                       # shadcn/ui components
├── lib/
│   ├── api.ts                    # API client
│   └── auth.ts                   # Auth utilities
└── __tests__/                    # Jest unit tests
```

### Existing Authentication
- JWT-based authentication
- Token refresh mechanism
- Protected route middleware

---

## Components to Implement

### 1. Encounter Details View

**Files**: 
- `app/(dashboard)/encounters/[id]/page.tsx`
- `components/encounters/encounter-detail.tsx`
- `components/encounters/vitals-card.tsx`
- `components/encounters/diagnosis-card.tsx`
- `components/encounters/treatment-card.tsx`

**Purpose**: Display comprehensive encounter information in a read-only format.

**Component Structure**:
```tsx
// app/(dashboard)/encounters/[id]/page.tsx
import { EncounterDetail } from '@/components/encounters/encounter-detail';

interface EncounterPageProps {
  params: { id: string };
}

export default async function EncounterPage({ params }: EncounterPageProps) {
  return (
    <div className="container mx-auto py-6">
      <EncounterDetail encounterId={params.id} />
    </div>
  );
}

// components/encounters/encounter-detail.tsx
'use client';

import { useEncounter } from '@/hooks/use-encounter';
import { VitalsCard } from './vitals-card';
import { DiagnosisCard } from './diagnosis-card';
import { TreatmentCard } from './treatment-card';
import { LabResultsCard } from './lab-results-card';
import { PrescriptionsCard } from './prescriptions-card';

interface EncounterDetailProps {
  encounterId: string;
}

export function EncounterDetail({ encounterId }: EncounterDetailProps) {
  const { data: encounter, isLoading, error } = useEncounter(encounterId);
  
  if (isLoading) return <EncounterSkeleton />;
  if (error) return <ErrorState error={error} />;
  if (!encounter) return <NotFound />;
  
  return (
    <div className="space-y-6">
      {/* Header with patient info */}
      <EncounterHeader encounter={encounter} />
      
      {/* Encounter metadata */}
      <EncounterMeta encounter={encounter} />
      
      {/* Vitals section */}
      <VitalsCard vitals={encounter.vitals} />
      
      {/* Chief complaint & History */}
      <ChiefComplaintCard 
        chiefComplaint={encounter.chief_complaint}
        historyOfPresentIllness={encounter.history_of_present_illness}
      />
      
      {/* Physical examination */}
      <PhysicalExamCard exam={encounter.physical_exam} />
      
      {/* Diagnosis */}
      <DiagnosisCard diagnoses={encounter.diagnoses} />
      
      {/* Treatment plan */}
      <TreatmentCard treatment={encounter.treatment_plan} />
      
      {/* Lab results (if any) */}
      {encounter.lab_orders?.length > 0 && (
        <LabResultsCard labOrders={encounter.lab_orders} />
      )}
      
      {/* Prescriptions (if any) */}
      {encounter.prescriptions?.length > 0 && (
        <PrescriptionsCard prescriptions={encounter.prescriptions} />
      )}
      
      {/* Clinical notes */}
      <ClinicalNotesCard notes={encounter.clinical_notes} />
      
      {/* Follow-up */}
      <FollowUpCard followUp={encounter.follow_up} />
    </div>
  );
}
```

**Vitals Display with Alerts**:
```tsx
// components/encounters/vitals-card.tsx
interface VitalsCardProps {
  vitals: {
    temperature?: number;
    pulse?: number;
    blood_pressure?: string;
    respiratory_rate?: number;
    spo2?: number;
    weight?: number;
    height?: number;
  };
}

export function VitalsCard({ vitals }: VitalsCardProps) {
  const alerts = getVitalAlerts(vitals);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Vital Signs
          {alerts.length > 0 && (
            <Badge variant="destructive">{alerts.length} Alert(s)</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <VitalItem 
            label="Temperature" 
            value={vitals.temperature} 
            unit="°C"
            alert={isAbnormalTemp(vitals.temperature)}
          />
          <VitalItem 
            label="Pulse" 
            value={vitals.pulse} 
            unit="bpm"
            alert={isAbnormalPulse(vitals.pulse)}
          />
          <VitalItem 
            label="Blood Pressure" 
            value={vitals.blood_pressure} 
            unit="mmHg"
          />
          <VitalItem 
            label="SpO2" 
            value={vitals.spo2} 
            unit="%"
            alert={vitals.spo2 && vitals.spo2 < 95}
            critical={vitals.spo2 && vitals.spo2 < 90}
          />
          <VitalItem 
            label="Respiratory Rate" 
            value={vitals.respiratory_rate} 
            unit="/min"
          />
          <VitalItem 
            label="Weight" 
            value={vitals.weight} 
            unit="kg"
          />
          <VitalItem 
            label="Height" 
            value={vitals.height} 
            unit="cm"
          />
          <VitalItem 
            label="BMI" 
            value={calculateBMI(vitals.weight, vitals.height)} 
            unit="kg/m²"
          />
        </div>
        
        {/* Alert messages */}
        {alerts.length > 0 && (
          <div className="mt-4 space-y-2">
            {alerts.map((alert, i) => (
              <Alert key={i} variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{alert}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**Test Coverage**: 12 tests

| Test | Description | Type |
|------|-------------|------|
| `test_encounter_detail_renders` | Component renders with data | Unit |
| `test_encounter_loading_state` | Loading skeleton shown | Unit |
| `test_encounter_error_state` | Error message displayed | Unit |
| `test_encounter_not_found` | 404 handling | Unit |
| `test_vitals_card_display` | All vitals shown | Unit |
| `test_vitals_alert_spo2_low` | SpO2 < 95% shows alert | Unit |
| `test_vitals_alert_critical` | Critical values highlighted | Unit |
| `test_diagnosis_card_icd10` | ICD-10 codes displayed | Unit |
| `test_treatment_card_display` | Treatment plan shown | Unit |
| `test_lab_results_section` | Lab results integrated | Unit |
| `test_prescriptions_section` | Prescriptions shown | Unit |
| `test_print_encounter` | Print view available | Unit |

---

### 2. Patient Timeline/History

**Files**:
- `app/(dashboard)/patients/[id]/history/page.tsx`
- `components/patients/patient-timeline.tsx`
- `components/patients/timeline-item.tsx`

**Purpose**: Display chronological history of all patient encounters and events.

**Component Structure**:
```tsx
// components/patients/patient-timeline.tsx
'use client';

import { usePatientHistory } from '@/hooks/use-patient-history';
import { TimelineItem } from './timeline-item';
import { TimelineFilters } from './timeline-filters';

interface PatientTimelineProps {
  patientId: string;
}

export function PatientTimeline({ patientId }: PatientTimelineProps) {
  const [filters, setFilters] = useState<TimelineFilters>({
    dateRange: 'all',
    eventTypes: ['encounter', 'lab', 'pharmacy', 'vitals'],
  });
  
  const { 
    data: history, 
    isLoading, 
    hasMore, 
    loadMore 
  } = usePatientHistory(patientId, filters);
  
  if (isLoading) return <TimelineSkeleton />;
  
  return (
    <div className="space-y-6">
      {/* Filters */}
      <TimelineFilters 
        filters={filters} 
        onChange={setFilters}
      />
      
      {/* Summary stats */}
      <TimelineSummary history={history} />
      
      {/* Timeline */}
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
        
        {/* Timeline items */}
        <div className="space-y-4">
          {history.events.map((event) => (
            <TimelineItem key={event.id} event={event} />
          ))}
        </div>
        
        {/* Load more */}
        {hasMore && (
          <Button 
            variant="outline" 
            className="w-full mt-4"
            onClick={loadMore}
          >
            Load More History
          </Button>
        )}
      </div>
    </div>
  );
}

// components/patients/timeline-item.tsx
interface TimelineEvent {
  id: string;
  type: 'encounter' | 'lab' | 'pharmacy' | 'vitals' | 'admission' | 'discharge';
  date: string;
  title: string;
  description: string;
  metadata: Record<string, any>;
  user: {
    name: string;
    role: string;
  };
}

export function TimelineItem({ event }: { event: TimelineEvent }) {
  const Icon = getEventIcon(event.type);
  const color = getEventColor(event.type);
  
  return (
    <div className="relative pl-10">
      {/* Icon */}
      <div className={cn(
        "absolute left-0 p-2 rounded-full",
        color
      )}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      
      {/* Content */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{event.title}</CardTitle>
            <span className="text-sm text-muted-foreground">
              {formatDate(event.date)}
            </span>
          </div>
          <CardDescription>
            {event.user.name} • {event.user.role}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{event.description}</p>
          
          {/* Type-specific details */}
          {event.type === 'encounter' && (
            <EncounterSummary data={event.metadata} />
          )}
          {event.type === 'lab' && (
            <LabSummary data={event.metadata} />
          )}
          {event.type === 'pharmacy' && (
            <PharmacySummary data={event.metadata} />
          )}
          
          {/* Link to full details */}
          <Link 
            href={getEventDetailUrl(event)} 
            className="text-sm text-primary hover:underline mt-2 inline-block"
          >
            View Details →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Test Coverage**: 14 tests

| Test | Description | Type |
|------|-------------|------|
| `test_timeline_renders_events` | Events displayed chronologically | Unit |
| `test_timeline_loading_state` | Loading skeleton shown | Unit |
| `test_timeline_empty_state` | "No history" message | Unit |
| `test_timeline_filter_by_date` | Date range filter works | Unit |
| `test_timeline_filter_by_type` | Event type filter works | Unit |
| `test_timeline_encounter_item` | Encounter events styled | Unit |
| `test_timeline_lab_item` | Lab events with results | Unit |
| `test_timeline_pharmacy_item` | Pharmacy events shown | Unit |
| `test_timeline_pagination` | Load more works | Unit |
| `test_timeline_item_link` | Links to detail pages | Unit |
| `test_timeline_summary_stats` | Summary counts correct | Unit |
| `test_timeline_responsive` | Mobile layout works | Unit |
| `test_timeline_print_view` | Print formatting | Unit |
| `test_timeline_accessibility` | ARIA labels present | Unit |

---

### 3. Reporting Dashboard

**Files**:
- `app/(dashboard)/reports/page.tsx`
- `app/(dashboard)/reports/[reportType]/page.tsx`
- `components/reports/dashboard-overview.tsx`
- `components/reports/kpi-card.tsx`
- `components/reports/chart-card.tsx`

**Purpose**: Comprehensive reporting dashboard with KPIs and visualizations.

**Component Structure**:
```tsx
// app/(dashboard)/reports/page.tsx
import { DashboardOverview } from '@/components/reports/dashboard-overview';
import { DateRangePicker } from '@/components/ui/date-range-picker';

export default function ReportsPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reports Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of facility performance metrics
          </p>
        </div>
        <DateRangePicker />
      </div>
      
      <DashboardOverview />
    </div>
  );
}

// components/reports/dashboard-overview.tsx
'use client';

import { useDashboardMetrics } from '@/hooks/use-dashboard-metrics';
import { KPICard } from './kpi-card';
import { ChartCard } from './chart-card';
import { ReportSection } from './report-section';

export function DashboardOverview() {
  const { data: metrics, isLoading } = useDashboardMetrics();
  
  if (isLoading) return <DashboardSkeleton />;
  
  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Patients Today"
          value={metrics.patientsToday}
          change={metrics.patientsTodayChange}
          icon={<Users className="h-4 w-4" />}
          trend={metrics.patientsTodayTrend}
        />
        <KPICard
          title="Revenue (Today)"
          value={formatCurrency(metrics.revenueToday)}
          change={metrics.revenueTodayChange}
          icon={<DollarSign className="h-4 w-4" />}
          trend={metrics.revenueTodayTrend}
        />
        <KPICard
          title="Pending Lab Results"
          value={metrics.pendingLabResults}
          icon={<FlaskConical className="h-4 w-4" />}
          variant={metrics.pendingLabResults > 10 ? 'warning' : 'default'}
        />
        <KPICard
          title="Stock Alerts"
          value={metrics.stockAlerts}
          icon={<AlertTriangle className="h-4 w-4" />}
          variant={metrics.stockAlerts > 0 ? 'destructive' : 'default'}
        />
      </div>
      
      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard
          title="Patient Volume (7 Days)"
          description="Daily patient visits"
        >
          <PatientVolumeChart data={metrics.patientVolumeWeek} />
        </ChartCard>
        
        <ChartCard
          title="Revenue Breakdown"
          description="By department"
        >
          <RevenueBreakdownChart data={metrics.revenueByDepartment} />
        </ChartCard>
      </div>
      
      {/* Detailed Sections */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ReportSection
          title="Clinical Summary"
          href="/reports/clinical"
          metrics={[
            { label: 'Encounters Today', value: metrics.encountersToday },
            { label: 'Avg. Consultation Time', value: `${metrics.avgConsultTime} min` },
            { label: 'Follow-up Rate', value: `${metrics.followUpRate}%` },
          ]}
        />
        
        <ReportSection
          title="Laboratory"
          href="/reports/laboratory"
          metrics={[
            { label: 'Tests Today', value: metrics.labTestsToday },
            { label: 'Avg. TAT', value: `${metrics.avgLabTAT} hrs` },
            { label: 'Pending Results', value: metrics.pendingLabResults },
          ]}
        />
        
        <ReportSection
          title="Pharmacy"
          href="/reports/pharmacy"
          metrics={[
            { label: 'Dispensed Today', value: metrics.dispensedToday },
            { label: 'Low Stock Items', value: metrics.lowStockItems },
            { label: 'Expiring Soon', value: metrics.expiringSoon },
          ]}
        />
      </div>
      
      {/* Recent Activity */}
      <RecentActivityFeed activities={metrics.recentActivity} />
    </div>
  );
}
```

**KPI Card Component**:
```tsx
// components/reports/kpi-card.tsx
interface KPICardProps {
  title: string;
  value: string | number;
  change?: number;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  variant?: 'default' | 'warning' | 'destructive';
  href?: string;
}

export function KPICard({
  title,
  value,
  change,
  icon,
  trend,
  variant = 'default',
  href,
}: KPICardProps) {
  const Wrapper = href ? Link : 'div';
  
  return (
    <Wrapper href={href || ''}>
      <Card className={cn(
        "transition-colors",
        href && "hover:bg-accent cursor-pointer",
        variant === 'warning' && "border-yellow-500",
        variant === 'destructive' && "border-red-500",
      )}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {icon && (
            <div className={cn(
              "p-2 rounded-full",
              variant === 'warning' && "bg-yellow-100 text-yellow-600",
              variant === 'destructive' && "bg-red-100 text-red-600",
              variant === 'default' && "bg-primary/10 text-primary",
            )}>
              {icon}
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
          {change !== undefined && (
            <p className={cn(
              "text-xs flex items-center gap-1 mt-1",
              trend === 'up' && "text-green-600",
              trend === 'down' && "text-red-600",
              trend === 'neutral' && "text-muted-foreground",
            )}>
              {trend === 'up' && <TrendingUp className="h-3 w-3" />}
              {trend === 'down' && <TrendingDown className="h-3 w-3" />}
              {change > 0 ? '+' : ''}{change}% from yesterday
            </p>
          )}
        </CardContent>
      </Card>
    </Wrapper>
  );
}
```

**Test Coverage**: 16 tests

| Test | Description | Type |
|------|-------------|------|
| `test_dashboard_renders` | Dashboard loads successfully | Unit |
| `test_dashboard_loading_state` | Loading skeletons shown | Unit |
| `test_kpi_cards_display` | All KPIs displayed | Unit |
| `test_kpi_trend_up` | Positive trend styled green | Unit |
| `test_kpi_trend_down` | Negative trend styled red | Unit |
| `test_kpi_warning_variant` | Warning styling applied | Unit |
| `test_kpi_click_navigation` | KPI links work | Unit |
| `test_patient_volume_chart` | Chart renders with data | Unit |
| `test_revenue_chart` | Revenue breakdown shown | Unit |
| `test_date_range_filter` | Date filter updates data | Unit |
| `test_report_section_links` | Section links work | Unit |
| `test_recent_activity_feed` | Activity items shown | Unit |
| `test_dashboard_refresh` | Refresh button works | Unit |
| `test_dashboard_export` | Export functionality | Unit |
| `test_dashboard_print` | Print layout works | Unit |
| `test_dashboard_responsive` | Mobile layout correct | Unit |

---

### 4. Dashboard Widgets

**Files**:
- `components/widgets/patient-volume-chart.tsx`
- `components/widgets/revenue-chart.tsx`
- `components/widgets/department-stats.tsx`
- `components/widgets/recent-activity.tsx`

**Purpose**: Reusable chart and data visualization widgets.

**Chart Components** (using Recharts):
```tsx
// components/widgets/patient-volume-chart.tsx
'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface PatientVolumeData {
  date: string;
  patients: number;
  encounters: number;
}

interface PatientVolumeChartProps {
  data: PatientVolumeData[];
}

export function PatientVolumeChart({ data }: PatientVolumeChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="date" 
          tickFormatter={(value) => formatShortDate(value)}
        />
        <YAxis />
        <Tooltip 
          labelFormatter={(value) => formatFullDate(value)}
          formatter={(value: number, name: string) => [
            value,
            name === 'patients' ? 'Patients' : 'Encounters'
          ]}
        />
        <Area
          type="monotone"
          dataKey="patients"
          stackId="1"
          stroke="#8884d8"
          fill="#8884d8"
          fillOpacity={0.6}
        />
        <Area
          type="monotone"
          dataKey="encounters"
          stackId="2"
          stroke="#82ca9d"
          fill="#82ca9d"
          fillOpacity={0.6}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// components/widgets/revenue-chart.tsx
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface RevenueData {
  department: string;
  amount: number;
  percentage: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export function RevenueBreakdownChart({ data }: { data: RevenueData[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          fill="#8884d8"
          paddingAngle={2}
          dataKey="amount"
          nameKey="department"
          label={({ department, percentage }) => `${department}: ${percentage}%`}
        >
          {data.map((entry, index) => (
            <Cell key={entry.department} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => formatCurrency(value)} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

**Test Coverage**: 10 tests

| Test | Description | Type |
|------|-------------|------|
| `test_area_chart_renders` | Area chart with data | Unit |
| `test_area_chart_empty` | Empty state handled | Unit |
| `test_pie_chart_renders` | Pie chart with data | Unit |
| `test_pie_chart_legend` | Legend displayed | Unit |
| `test_chart_tooltip` | Tooltips work on hover | Unit |
| `test_chart_responsive` | Charts resize correctly | Unit |
| `test_recent_activity_list` | Activity items render | Unit |
| `test_activity_item_link` | Activity links work | Unit |
| `test_department_stats_grid` | Stats grid layout | Unit |
| `test_widget_loading_state` | Loading states | Unit |

---

### 5. Data Visualization Charts

**Files**:
- `lib/chart-utils.ts`
- `components/charts/line-chart.tsx`
- `components/charts/bar-chart.tsx`
- `components/charts/trend-indicator.tsx`

**Purpose**: Chart utilities and additional visualization components.

**Test Coverage**: 8 tests

| Test | Description | Type |
|------|-------------|------|
| `test_line_chart_renders` | Line chart display | Unit |
| `test_bar_chart_renders` | Bar chart display | Unit |
| `test_chart_axis_formatting` | Axis labels formatted | Unit |
| `test_trend_indicator_up` | Upward trend arrow | Unit |
| `test_trend_indicator_down` | Downward trend arrow | Unit |
| `test_chart_color_scheme` | Consistent colors | Unit |
| `test_chart_accessibility` | Chart ARIA labels | Unit |
| `test_chart_data_validation` | Invalid data handled | Unit |

---

### 6. Responsive Design

**Files**:
- `components/layout/responsive-sidebar.tsx`
- `components/layout/mobile-nav.tsx`
- `app/globals.css` (responsive utilities)

**Purpose**: Ensure all dashboard views work on mobile devices.

**Responsive Breakpoints**:
```css
/* Tailwind breakpoints used */
sm: 640px   /* Mobile landscape */
md: 768px   /* Tablet */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large desktop */
```

**Mobile Navigation**:
```tsx
// components/layout/mobile-nav.tsx
'use client';

import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';

export function MobileNav() {
  const [open, setOpen] = useState(false);
  
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild className="lg:hidden">
        <Button variant="ghost" size="icon">
          <Menu className="h-6 w-6" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <nav className="flex flex-col gap-4">
          <NavLinks onNavigate={() => setOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
```

**Responsive Table Component**:
```tsx
// components/ui/responsive-table.tsx
interface ResponsiveTableProps<T> {
  data: T[];
  columns: Column<T>[];
  mobileCard?: (item: T) => React.ReactNode;
}

export function ResponsiveTable<T>({ 
  data, 
  columns, 
  mobileCard 
}: ResponsiveTableProps<T>) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key}>{col.header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item, i) => (
              <TableRow key={i}>
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    {col.render ? col.render(item) : item[col.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      {/* Mobile cards */}
      <div className="md:hidden space-y-4">
        {data.map((item, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              {mobileCard ? mobileCard(item) : (
                <dl className="space-y-2">
                  {columns.map((col) => (
                    <div key={col.key} className="flex justify-between">
                      <dt className="text-muted-foreground">{col.header}</dt>
                      <dd>{col.render ? col.render(item) : item[col.key]}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
```

**Test Coverage**: 12 tests

| Test | Description | Type |
|------|-------------|------|
| `test_mobile_nav_toggle` | Mobile menu opens/closes | Unit |
| `test_mobile_nav_links` | Links navigate correctly | Unit |
| `test_sidebar_hidden_mobile` | Sidebar hidden on mobile | Unit |
| `test_responsive_table_desktop` | Table shows on desktop | Unit |
| `test_responsive_table_mobile` | Cards show on mobile | Unit |
| `test_kpi_grid_responsive` | KPI grid adapts | Unit |
| `test_chart_responsive` | Charts resize | Unit |
| `test_form_responsive` | Forms stack on mobile | Unit |
| `test_modal_responsive` | Modals full-width mobile | Unit |
| `test_touch_targets` | Touch targets ≥44px | Unit |
| `test_viewport_meta` | Viewport configured | E2E |
| `test_no_horizontal_scroll` | No overflow on mobile | E2E |

---

### 7. Stakeholder Access Control

**Files**:
- `lib/permissions.ts`
- `components/auth/permission-gate.tsx`
- `middleware.ts` (route protection)

**Purpose**: Control dashboard access based on user roles.

**Permission Configuration**:
```tsx
// lib/permissions.ts
export const DASHBOARD_PERMISSIONS = {
  // Clinical data
  'view:encounters': ['admin', 'clinician', 'nurse', 'department_head'],
  'view:patient_history': ['admin', 'clinician', 'nurse', 'department_head'],
  
  // Reports
  'view:clinical_reports': ['admin', 'clinician', 'department_head'],
  'view:financial_reports': ['admin', 'finance_officer', 'department_head'],
  'view:lab_reports': ['admin', 'lab_technician', 'department_head'],
  'view:pharmacy_reports': ['admin', 'pharmacist', 'department_head'],
  
  // Dashboard sections
  'view:full_dashboard': ['admin', 'department_head'],
  'view:summary_dashboard': ['stakeholder', 'external'],
  
  // Export
  'export:reports': ['admin', 'department_head', 'finance_officer'],
} as const;

export function hasPermission(
  userRole: string, 
  permission: keyof typeof DASHBOARD_PERMISSIONS
): boolean {
  const allowedRoles = DASHBOARD_PERMISSIONS[permission];
  return allowedRoles.includes(userRole as any);
}

// components/auth/permission-gate.tsx
interface PermissionGateProps {
  permission: keyof typeof DASHBOARD_PERMISSIONS;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGate({ 
  permission, 
  fallback = null, 
  children 
}: PermissionGateProps) {
  const { user } = useAuth();
  
  if (!user || !hasPermission(user.role, permission)) {
    return fallback;
  }
  
  return <>{children}</>;
}
```

**Test Coverage**: 8 tests

| Test | Description | Type |
|------|-------------|------|
| `test_admin_full_access` | Admin sees all sections | Unit |
| `test_clinician_clinical_access` | Clinician sees clinical | Unit |
| `test_finance_financial_access` | Finance sees revenue | Unit |
| `test_stakeholder_limited_access` | Stakeholder summary only | Unit |
| `test_permission_gate_allowed` | Content shown if allowed | Unit |
| `test_permission_gate_denied` | Content hidden if denied | Unit |
| `test_route_protection` | Unauthorized redirected | E2E |
| `test_api_permission_check` | API respects permissions | E2E |

---

### 8. Print/Export Reports

**Files**:
- `lib/export-utils.ts`
- `components/reports/export-button.tsx`
- `app/(dashboard)/reports/print/[reportType]/page.tsx`

**Purpose**: Export dashboard data to PDF/CSV and print-friendly views.

**Export Utilities**:
```tsx
// lib/export-utils.ts
import { jsPDF } from 'jspdf';
import { Parser } from '@json2csv/plainjs';

export async function exportToPDF(
  title: string,
  data: any,
  options: PDFExportOptions = {}
): Promise<Blob> {
  const doc = new jsPDF();
  
  // Add header
  doc.setFontSize(18);
  doc.text(title, 14, 22);
  
  // Add date
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
  
  // Add content based on data type
  // ... implementation
  
  return doc.output('blob');
}

export function exportToCSV(
  data: Record<string, any>[],
  filename: string
): void {
  const parser = new Parser();
  const csv = parser.parse(data);
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${formatDate(new Date())}.csv`;
  link.click();
  
  URL.revokeObjectURL(url);
}

// components/reports/export-button.tsx
interface ExportButtonProps {
  data: any;
  filename: string;
  title: string;
}

export function ExportButton({ data, filename, title }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);
  
  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const blob = await exportToPDF(title, data);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } finally {
      setExporting(false);
    }
  };
  
  const handleExportCSV = () => {
    exportToCSV(data, filename);
  };
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={exporting}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={handleExportPDF}>
          <FileText className="h-4 w-4 mr-2" />
          Export as PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportCSV}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" />
          Print
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**Test Coverage**: 6 tests

| Test | Description | Type |
|------|-------------|------|
| `test_export_pdf_generation` | PDF blob created | Unit |
| `test_export_csv_format` | CSV formatted correctly | Unit |
| `test_export_button_dropdown` | Dropdown shows options | Unit |
| `test_print_layout` | Print CSS applied | Unit |
| `test_export_filename_format` | Date in filename | Unit |
| `test_export_permission_check` | Export requires permission | Unit |

---

### 9. E2E Tests (Playwright)

**Files**:
- `e2e/encounter-detail.spec.ts`
- `e2e/patient-timeline.spec.ts`
- `e2e/reports-dashboard.spec.ts`
- `e2e/responsive.spec.ts`

**Purpose**: End-to-end tests for critical user flows.

**Test Specifications**:
```typescript
// e2e/encounter-detail.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Encounter Detail View', () => {
  test.beforeEach(async ({ page }) => {
    // Login and navigate to encounter
    await loginAsClinicianUser(page);
    await page.goto('/encounters/1');
  });
  
  test('should display encounter details', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /encounter/i })).toBeVisible();
    await expect(page.getByText(/vital signs/i)).toBeVisible();
    await expect(page.getByText(/diagnosis/i)).toBeVisible();
  });
  
  test('should show vital alerts for abnormal values', async ({ page }) => {
    // Navigate to encounter with low SpO2
    await page.goto('/encounters/critical-vitals');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText(/SpO2.*below normal/i)).toBeVisible();
  });
  
  test('should display lab results if present', async ({ page }) => {
    await expect(page.getByText(/lab results/i)).toBeVisible();
    await expect(page.getByText(/CBC/i)).toBeVisible();
  });
});

// e2e/reports-dashboard.spec.ts
test.describe('Reports Dashboard', () => {
  test('should display KPI cards', async ({ page }) => {
    await loginAsAdminUser(page);
    await page.goto('/reports');
    
    await expect(page.getByText(/patients today/i)).toBeVisible();
    await expect(page.getByText(/revenue/i)).toBeVisible();
    await expect(page.getByText(/pending lab/i)).toBeVisible();
  });
  
  test('should filter by date range', async ({ page }) => {
    await loginAsAdminUser(page);
    await page.goto('/reports');
    
    // Open date picker
    await page.getByRole('button', { name: /date range/i }).click();
    
    // Select last 7 days
    await page.getByText(/last 7 days/i).click();
    
    // Verify data updates
    await expect(page.getByText(/loading/i)).not.toBeVisible();
  });
  
  test('should export report to CSV', async ({ page }) => {
    await loginAsAdminUser(page);
    await page.goto('/reports');
    
    // Click export
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export/i }).click();
    await page.getByText(/csv/i).click();
    
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });
});

// e2e/responsive.spec.ts
test.describe('Responsive Design', () => {
  test('should show mobile navigation on small screens', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await loginAsClinicianUser(page);
    
    // Sidebar should be hidden
    await expect(page.locator('[data-testid="sidebar"]')).not.toBeVisible();
    
    // Mobile menu button should be visible
    await expect(page.getByRole('button', { name: /toggle menu/i })).toBeVisible();
  });
  
  test('should display cards instead of table on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await loginAsClinicianUser(page);
    await page.goto('/patients');
    
    // Table should be hidden
    await expect(page.locator('table')).not.toBeVisible();
    
    // Cards should be visible
    await expect(page.locator('[data-testid="patient-card"]').first()).toBeVisible();
  });
});
```

**Test Coverage**: 14 tests

| Test | Description | Type |
|------|-------------|------|
| `test_encounter_detail_display` | Encounter loads correctly | E2E |
| `test_encounter_vital_alerts` | Critical values shown | E2E |
| `test_encounter_lab_results` | Lab section visible | E2E |
| `test_patient_timeline_load` | Timeline renders | E2E |
| `test_timeline_filter_events` | Filters work | E2E |
| `test_dashboard_kpi_display` | KPIs show values | E2E |
| `test_dashboard_date_filter` | Date range works | E2E |
| `test_dashboard_export_csv` | CSV download | E2E |
| `test_dashboard_export_pdf` | PDF generation | E2E |
| `test_mobile_navigation` | Mobile menu works | E2E |
| `test_mobile_table_cards` | Cards on mobile | E2E |
| `test_stakeholder_access` | Limited access enforced | E2E |
| `test_chart_rendering` | Charts display | E2E |
| `test_print_layout` | Print view works | E2E |

---

## API Endpoints (Backend Requirements)

The following API endpoints are needed to support the dashboard:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/encounters/{id}/` | GET | Full encounter detail with nested data |
| `/api/patients/{id}/history/` | GET | Patient timeline events |
| `/api/reports/dashboard/` | GET | Dashboard KPIs and summary |
| `/api/reports/patient-volume/` | GET | Patient volume chart data |
| `/api/reports/revenue/` | GET | Revenue breakdown data |
| `/api/reports/clinical/` | GET | Clinical summary report |
| `/api/reports/laboratory/` | GET | Lab summary report |
| `/api/reports/pharmacy/` | GET | Pharmacy summary report |

---

## Dependencies

### NPM Packages to Add
```json
{
  "dependencies": {
    "recharts": "^2.10.0",
    "date-fns": "^3.0.0",
    "jspdf": "^2.5.1",
    "@json2csv/plainjs": "^7.0.0"
  },
  "devDependencies": {
    "@types/recharts": "^1.8.0"
  }
}
```

---

## Implementation Timeline

| Week | Tasks | Deliverables |
|------|-------|--------------|
| **Week 9** | Encounter detail view, Patient timeline | Detail views with 26 tests passing |
| **Week 10** | Dashboard KPIs, Charts | Main dashboard functional |
| **Week 11** | Responsive design, Export | Mobile-ready, export working |
| **Week 12** | E2E tests, Polish, Documentation | Complete web dashboard |

---

## Success Criteria

- [ ] All 100+ tests passing (unit + E2E)
- [ ] ≥80% code coverage
- [ ] Encounter detail view functional
- [ ] Patient timeline displaying history
- [ ] Dashboard with KPIs and charts
- [ ] Mobile-responsive on all pages
- [ ] Export to PDF/CSV working
- [ ] Stakeholder access control enforced
- [ ] E2E tests passing on all browsers
- [ ] No accessibility violations (WCAG 2.1 AA)

---

## Appendix: File Structure After Implementation

```
web-app/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # Enhanced dashboard home
│   │   ├── patients/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── history/page.tsx    # NEW: Timeline
│   │   ├── encounters/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx           # NEW: Detail view
│   │   └── reports/                     # NEW: Reports section
│   │       ├── page.tsx
│   │       ├── clinical/page.tsx
│   │       ├── laboratory/page.tsx
│   │       ├── pharmacy/page.tsx
│   │       └── print/[type]/page.tsx
│   └── layout.tsx
├── components/
│   ├── layout/
│   │   ├── sidebar.tsx
│   │   ├── header.tsx
│   │   ├── mobile-nav.tsx              # NEW
│   │   └── responsive-sidebar.tsx      # NEW
│   ├── encounters/                      # NEW
│   │   ├── encounter-detail.tsx
│   │   ├── vitals-card.tsx
│   │   ├── diagnosis-card.tsx
│   │   └── treatment-card.tsx
│   ├── patients/
│   │   ├── patient-timeline.tsx        # NEW
│   │   └── timeline-item.tsx           # NEW
│   ├── reports/                         # NEW
│   │   ├── dashboard-overview.tsx
│   │   ├── kpi-card.tsx
│   │   ├── chart-card.tsx
│   │   ├── report-section.tsx
│   │   └── export-button.tsx
│   ├── widgets/                         # NEW
│   │   ├── patient-volume-chart.tsx
│   │   ├── revenue-chart.tsx
│   │   └── recent-activity.tsx
│   ├── auth/
│   │   └── permission-gate.tsx         # NEW
│   └── ui/
│       └── responsive-table.tsx        # NEW
├── lib/
│   ├── api.ts
│   ├── auth.ts
│   ├── permissions.ts                   # NEW
│   ├── chart-utils.ts                   # NEW
│   └── export-utils.ts                  # NEW
├── hooks/
│   ├── use-encounter.ts                 # NEW
│   ├── use-patient-history.ts           # NEW
│   └── use-dashboard-metrics.ts         # NEW
├── __tests__/
│   ├── components/
│   │   ├── encounters/
│   │   ├── patients/
│   │   ├── reports/
│   │   └── widgets/
│   └── lib/
└── e2e/
    ├── encounter-detail.spec.ts         # NEW
    ├── patient-timeline.spec.ts         # NEW
    ├── reports-dashboard.spec.ts        # NEW
    └── responsive.spec.ts               # NEW
```

---

**Document Version**: 1.0
**Created**: January 2, 2026
**Author**: Engineering Team
**Review Status**: DRAFT - Pending stakeholder review
