/**
 * Counselling Module Dashboard Page
 * Shows clinic queue, stats, and referral management
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { PageHeader } from '@/components/shared/page-header';
import { CounsellingReferralTable } from '@/components/allied-health/counselling';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { EmptyState } from '@/components/shared/empty-state';
import {
  Heart,
  Users,
  Clock,
  CheckCircle,
  Plus,
  User,
  ArrowRight,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { useAlliedHealthDashboard } from '@/lib/hooks/use-allied-health';
import { useClinicVisits } from '@/lib/hooks/use-clinics';

export default function CounsellingDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('queue');

  const { data: dashboardStats, isLoading: statsLoading } = useAlliedHealthDashboard();
  // Include both counselling and mental health clinic types
  const { data: queueData, isLoading: queueLoading } = useClinicVisits({
    clinic_type: 'COUNSELLING,MENTAL_HEALTH',
    status: 'REGISTERED,WAITING,CALLED,IN_CONSULTATION',
    date: format(new Date(), 'yyyy-MM-dd'),
    page_size: 50,
  });

  const counsellingStats = dashboardStats?.counselling;
  const counsellingQueue = dashboardStats?.clinic_queue_stats?.counselling;
  const mentalHealthQueue = dashboardStats?.clinic_queue_stats?.mental_health;
  const totalWaiting = (counsellingQueue?.waiting_count || 0) + (mentalHealthQueue?.waiting_count || 0);
  const totalInConsultation = (counsellingQueue?.in_consultation_count || 0) + (mentalHealthQueue?.in_consultation_count || 0);

  const statusVariants: Record<string, string> = {
    REGISTERED: 'bg-blue-100 text-blue-800',
    WAITING: 'bg-yellow-100 text-yellow-800',
    CALLED: 'bg-orange-100 text-orange-800',
    IN_CONSULTATION: 'bg-purple-100 text-purple-800',
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Counselling Services"
        helpContent="Manage counselling referrals and sessions. Support grief counselling, family therapy, substance abuse, mental health, and psychosocial support."
        actions={
          <Button onClick={() => router.push('/allied-health/counselling/referrals/new')}>
            <Plus className="h-4 w-4 mr-2" />
            New Referral
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
              {statsLoading ? '...' : totalWaiting}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalInConsultation} in session
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Referrals</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {statsLoading ? '...' : (counsellingStats?.pending_count || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Awaiting acceptance
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Follow-ups Due</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {statsLoading ? '...' : (counsellingStats?.follow_ups_count || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Scheduled follow-ups
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
              {statsLoading ? '...' : (counsellingStats?.completed_today_count || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Sessions finished
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="queue" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Today&apos;s Queue</span>
            <span className="sm:hidden">Queue</span>
            {totalWaiting > 0 && (
              <Badge variant="secondary" className="ml-1">
                {totalWaiting}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="referrals" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Referrals</span>
            <span className="sm:hidden">Referrals</span>
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
                  description="No patients are currently checked into Counselling or Mental Health Clinics."
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

        <TabsContent value="referrals">
          <CounsellingReferralTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
