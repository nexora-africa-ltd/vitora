'use client';

/**
 * AnalyticsPageContent — wraps the built-in dashboard and the Metabase
 * "Explore" tab in a tabbed container.
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Compass } from 'lucide-react';
import { AnalyticsDashboard } from '@/components/analytics/analytics-dashboard';
import { MetabaseEmbed } from '@/components/analytics/metabase-embed';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
  return (
    <Tabs defaultValue="dashboard">
      <TabsList>
        <TabsTrigger value="dashboard" className="gap-1.5">
          <BarChart3 className="h-4 w-4" />
          <span className="sm:hidden">Dashboard</span>
          <span className="hidden sm:inline">Dashboard</span>
        </TabsTrigger>
        <TabsTrigger value="explore" className="gap-1.5">
          <Compass className="h-4 w-4" />
          <span className="sm:hidden">Explore</span>
          <span className="hidden sm:inline">Explore</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard" className="mt-4">
        <AnalyticsDashboard />
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
