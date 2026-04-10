'use client';

/**
 * AnalyticsPageContent — wraps the built-in dashboard and the Metabase
 * "Explore" tab in a tabbed container.
 */

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, CalendarDays, Compass } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AnalyticsDashboard } from '@/components/analytics/analytics-dashboard';
import { MetabaseEmbed } from '@/components/analytics/metabase-embed';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Period } from '@/components/analytics/analytics-dashboard';

/**
 * Default Metabase dashboard IDs.
 * These correspond to dashboards created in Metabase during initial setup.
 * Admins can update these via env vars or a settings page in the future.
 */
const METABASE_DASHBOARDS = {
  facilityOverview: 1,
  clinicalTrends: 2,
  financialPerformance: 3,
} as const;

export function AnalyticsPageContent() {
  const [period, setPeriod] = useState<Period>('30d');

  return (
    <Tabs defaultValue="dashboard">
      <div className="flex items-center justify-between gap-2 sm:gap-4 text-xs sm:text-sm">
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5 text-xs sm:text-sm">
            <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="explore" className="gap-1.5 text-xs sm:text-sm">
            <Compass className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Explore</span>
          </TabsTrigger>
        </TabsList>

        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[110px] sm:w-[140px] text-xs sm:text-sm h-8 sm:h-9">
            <CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7d</SelectItem>
            <SelectItem value="30d">Last 30d</SelectItem>
            <SelectItem value="90d">Last 90d</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <TabsContent value="dashboard" className="mt-4">
        <AnalyticsDashboard period={period} />
      </TabsContent>

      <TabsContent value="explore" className="mt-4 space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Facility Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <MetabaseEmbed
              resourceType="dashboard"
              resourceId={METABASE_DASHBOARDS.facilityOverview}
              title="Facility Overview"
              minHeight="500px"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Clinical Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <MetabaseEmbed
              resourceType="dashboard"
              resourceId={METABASE_DASHBOARDS.clinicalTrends}
              title="Clinical Trends"
              minHeight="500px"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Financial Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <MetabaseEmbed
              resourceType="dashboard"
              resourceId={METABASE_DASHBOARDS.financialPerformance}
              title="Financial Performance"
              minHeight="500px"
            />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
