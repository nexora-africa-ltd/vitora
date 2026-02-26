/**
 * Allied Health Dashboard
 * Overview of all Allied Health services
 */

'use client';

import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ModuleCard, TodaysSessionsList } from '@/components/allied-health';
import { useAlliedHealthDashboard } from '@/lib/hooks/use-allied-health';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import {
  Activity,
  Apple,
  Briefcase,
  Heart,
  Users,
  Calendar,
  AlertTriangle,
  Clock,
} from 'lucide-react';

export default function AlliedHealthDashboardPage() {
  const { data: stats, isLoading, error } = useAlliedHealthDashboard();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-destructive">
        Failed to load dashboard: {error.message}
      </div>
    );
  }

  const moduleConfigs = [
    {
      title: 'Physiotherapy',
      href: '/allied-health/physiotherapy',
      icon: Activity,
      stats: [
        { label: 'clinic queue', value: stats?.clinic_queue_stats?.physio?.waiting_count || 0, variant: 'info' as const },
        { label: 'pending', value: stats?.physiotherapy.pending_count || 0, variant: 'warning' as const },
        { label: 'sessions today', value: stats?.physiotherapy.today_sessions_count || 0 },
      ],
    },
    {
      title: 'Nutrition',
      href: '/allied-health/nutrition',
      icon: Apple,
      stats: [
        { label: 'clinic queue', value: stats?.clinic_queue_stats?.nutrition?.waiting_count || 0, variant: 'info' as const },
        { label: 'pending', value: stats?.nutrition.pending_count || 0, variant: 'warning' as const },
        { label: 'consultations', value: stats?.nutrition.consultations_count || 0 },
      ],
    },
    {
      title: 'Occupational Therapy',
      href: '/allied-health/occupational-therapy',
      icon: Briefcase,
      stats: [
        { label: 'clinic queue', value: stats?.clinic_queue_stats?.ot?.waiting_count || 0, variant: 'info' as const },
        { label: 'pending', value: stats?.occupational_therapy.pending_count || 0, variant: 'warning' as const },
        { label: 'sessions today', value: stats?.occupational_therapy.today_sessions_count || 0 },
      ],
    },
    {
      title: 'Social Work',
      href: '/allied-health/social-work',
      icon: Users,
      stats: [
        { label: 'clinic queue', value: stats?.clinic_queue_stats?.social_work?.waiting_count || 0, variant: 'info' as const },
        { label: 'open cases', value: stats?.social_work.open_cases_count || 0 },
        { label: 'urgent', value: stats?.social_work.urgent_count || 0, variant: 'danger' as const },
      ],
    },
    {
      title: 'Counselling',
      href: '/allied-health/counselling',
      icon: Heart,
      stats: [
        { label: 'clinic queue', value: (stats?.clinic_queue_stats?.counselling?.waiting_count || 0) + (stats?.clinic_queue_stats?.mental_health?.waiting_count || 0), variant: 'info' as const },
        { label: 'pending', value: stats?.counselling.pending_count || 0, variant: 'warning' as const },
        { label: 'follow-ups', value: stats?.counselling.follow_ups_count || 0 },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Allied Health Services"
        helpContent="Manage physiotherapy, nutrition, occupational therapy, social work, and counselling services."
      />

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today&apos;s Sessions</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.todays_sessions?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all modules
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clinic Queue</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {stats?.clinic_queue_stats?.totals?.waiting_count || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.clinic_queue_stats?.totals?.in_consultation_count || 0} in consultation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {(stats?.physiotherapy.pending_count || 0) +
                (stats?.nutrition.pending_count || 0) +
                (stats?.occupational_therapy.pending_count || 0) +
                (stats?.counselling.pending_count || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Awaiting approval
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Treatments</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {(stats?.physiotherapy.in_progress_count || 0) +
                (stats?.occupational_therapy.in_progress_count || 0) +
                (stats?.counselling.in_progress_count || 0) +
                (stats?.social_work.open_cases_count || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Currently ongoing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Urgent Cases</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {stats?.social_work.urgent_count || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Require attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Module Cards & Today's Sessions */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Module Cards */}
        <div className="lg:col-span-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {moduleConfigs.map((config) => (
            <ModuleCard key={config.title} {...config} />
          ))}
        </div>

        {/* Today's Sessions */}
        <div className="lg:col-span-1">
          <TodaysSessionsList
            sessions={stats?.todays_sessions || []}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
