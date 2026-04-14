/**
 * Physiotherapy Module Dashboard Page
 * Shows clinic queue, stats, and order management
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { PageHeader } from '@/components/shared/page-header';
import { PhysioOrderTable } from '@/components/allied-health/physiotherapy';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { EmptyState } from '@/components/shared/empty-state';
import {
  SquareDashedTopSolid,
  Users,
  Clock,
  CheckCircle,
  Plus,
  User,
  ArrowRight,
  Calendar,
} from 'lucide-react';
import { useAlliedHealthDashboard } from '@/lib/hooks/use-allied-health';
import { useClinicVisits } from '@/lib/hooks/use-clinics';

export default function PhysiotherapyDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('queue');

  const { data: dashboardStats, isLoading: statsLoading } = useAlliedHealthDashboard();
  const { data: queueData, isLoading: queueLoading } = useClinicVisits({
    clinic_type: 'PHYSIO',
    status: 'REGISTERED,WAITING,CALLED,IN_CONSULTATION',
    date: format(new Date(), 'yyyy-MM-dd'),
    page_size: 50,
  });

  const physioStats = dashboardStats?.physiotherapy;
  const queueStats = dashboardStats?.clinic_queue_stats?.physio;

  const statusVariants: Record<string, string> = {
    REGISTERED: 'bg-blue-100 text-blue-800',
    WAITING: 'bg-yellow-100 text-yellow-800',
    CALLED: 'bg-orange-100 text-orange-800',
    IN_CONSULTATION: 'bg-purple-100 text-purple-800',
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Physiotherapy Services"
        helpContent="Manage physiotherapy orders, treatment sessions, and patient rehabilitation progress."
        actions={
          <Button onClick={() => router.push('/allied-health/physiotherapy/orders/new')}>
            <Plus className="h-4 w-4 mr-2" />
            New Order
          </Button>
        }
      />

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clinic Queue</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {statsLoading ? '...' : (queueStats?.waiting_count || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {queueStats?.in_consultation_count || 0} in treatment
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
              {statsLoading ? '...' : (physioStats?.pending_count || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Awaiting approval
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sessions Today</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {statsLoading ? '...' : (physioStats?.today_sessions_count || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Scheduled or in progress
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {statsLoading ? '...' : (physioStats?.completed_today_count || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Sessions finished
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Queue and Orders */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="queue" className="gap-1.5 px-2 sm:px-4">
            <Users className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Today&apos;s Queue</span>
            {(queueStats?.waiting_count || 0) > 0 && (
              <Badge variant="secondary" className="ml-1">
                {queueStats?.waiting_count}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-1.5 px-2 sm:px-4">
            <SquareDashedTopSolid className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Treatment Orders</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Today&apos;s Clinic Queue</CardTitle>
            </CardHeader>
            <CardContent>
              {queueLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : !queueData || queueData.results.length === 0 ? (
                <EmptyState
                  title="No patients in queue"
                  description="No patients are currently checked into the Physiotherapy Clinic."
                />
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {queueData.results.map((visit) => (
                      <div
                        key={visit.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => router.push(`/clinics/visits/${visit.id}`)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
                            <User className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium">{visit.patient_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {visit.patient_mrn} • Queue #{visit.queue_number}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right text-sm">
                            <p className="text-muted-foreground">
                              {visit.registered_at && format(new Date(visit.registered_at), 'HH:mm')}
                            </p>
                          </div>
                          <Badge className={statusVariants[visit.status] || 'bg-gray-100'}>
                            {visit.status.replace(/_/g, ' ')}
                          </Badge>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <PhysioOrderTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
