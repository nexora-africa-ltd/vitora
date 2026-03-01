'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Baby, Calendar, FileText, Heart, Shield, Syringe, TrendingUp, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';
import { mchRegistrationsApi, ancVisitsApi, deliveriesApi, pncVisitsApi } from '@/lib/api/mch';
import { ANCVisitsTab } from '@/components/mch/anc-visits-tab';
import { DeliveryTab } from '@/components/mch/delivery-tab';
import { PNCVisitsTab } from '@/components/mch/pnc-visits-tab';
import { GrowthTab } from '@/components/mch/growth-tab';
import { ImmunizationsTab } from '@/components/mch/immunizations-tab';
import { HEITab } from '@/components/mch/hei-tab';
import type { MCHRegistrationStatus } from '@/lib/types/mch';

const statusColors: Record<MCHRegistrationStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  DELIVERED: 'bg-blue-100 text-blue-800',
  POSTNATAL: 'bg-purple-100 text-purple-800',
  COMPLETED: 'bg-gray-100 text-gray-800',
  TRANSFERRED_OUT: 'bg-yellow-100 text-yellow-800',
  LOST_TO_FOLLOW_UP: 'bg-orange-100 text-orange-800',
  DECEASED: 'bg-red-100 text-red-800',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function MCHRegistrationDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { refresh, isRefreshing } = usePageRefresh();

  const registrationId = parseInt(id, 10);

  const {
    data: registration,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['mch-registration', registrationId],
    queryFn: () => mchRegistrationsApi.get(registrationId),
    enabled: !isNaN(registrationId),
  });

  const transitionMutation = useMutation({
    mutationFn: (newStatus: string) =>
      mchRegistrationsApi.transitionStatus(registrationId, newStatus),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mch-registration', registrationId] });
      toast({
        title: 'Status Updated',
        description: 'MCH registration status has been updated.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update status. Please try again.',
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !registration) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Failed to load MCH registration.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/mch')}>
          Back to Registrations
        </Button>
      </div>
    );
  }

  const daysToEDD = registration.edd
    ? Math.ceil((new Date(registration.edd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-6">
        <PageHeader
          title={`MCH ${registration.mch_number}`}
          helpContent="View and manage maternal and child health registration details. Track ANC visits, delivery, PNC visits, growth, and immunizations."
        />

        {/* Summary Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-4 rounded-lg bg-muted/50">
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-lg font-semibold truncate">
              {registration.mother_name}
              <span className="text-muted-foreground font-normal"> • {registration.mother_mrn}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Registered {formatDate(registration.registration_date)}
              {registration.linda_jamii_beneficiary && (
                <span className="ml-2 text-blue-600">• Linda Jamii</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Badge className={`${statusColors[registration.status]} shrink-0`}>
              {registration.status.replace(/_/g, ' ')}
            </Badge>
            {registration.is_high_risk && (
              <Badge variant="destructive" className="gap-1 shrink-0">
                <AlertTriangle className="h-3 w-3" />
                High Risk
              </Badge>
            )}
            {registration.is_sensitive && (
              <Badge variant="outline" className="gap-1 shrink-0 border-orange-500 text-orange-500">
                <Shield className="h-3 w-3" />
                Sensitive
              </Badge>
            )}
          </div>
        </div>

        {/* Pregnancy Info Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Gestation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{registration.gestation_display || 'N/A'}</p>
              {registration.trimester && (
                <p className="text-xs text-muted-foreground">Trimester {registration.trimester}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">EDD</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {registration.edd ? formatDate(registration.edd) : 'N/A'}
              </p>
              {daysToEDD !== null && daysToEDD > 0 && (
                <p className="text-xs text-muted-foreground">{daysToEDD} days remaining</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">ANC Visits</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{registration.anc_visit_count}</p>
              <p className="text-xs text-muted-foreground">
                {registration.anc_visit_count >= 4 ? 'Target met' : `${4 - registration.anc_visit_count} more recommended`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">PNC Visits</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{registration.pnc_visit_count}</p>
            </CardContent>
          </Card>
        </div>

        {/* Risk Factors */}
        {registration.risk_factors && (
          <Card className="border-orange-200 bg-orange-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-orange-700">
                <AlertTriangle className="h-4 w-4" />
                Risk Factors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{registration.risk_factors}</p>
            </CardContent>
          </Card>
        )}

        {/* Baby Info (if delivered) */}
        {registration.baby && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-blue-700">
                <Baby className="h-4 w-4" />
                Baby Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-medium">{registration.baby_name}</p>
              <p className="text-sm text-muted-foreground">{registration.baby_mrn}</p>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="anc" className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="anc" className="gap-2">
              <Calendar className="h-4 w-4" />
              <span className="sm:hidden">ANC</span>
              <span className="hidden sm:inline">ANC Visits</span>
            </TabsTrigger>
            <TabsTrigger value="delivery" className="gap-2">
              <Baby className="h-4 w-4" />
              Delivery
            </TabsTrigger>
            <TabsTrigger value="pnc" className="gap-2">
              <Heart className="h-4 w-4" />
              <span className="sm:hidden">PNC</span>
              <span className="hidden sm:inline">PNC Visits</span>
            </TabsTrigger>
            {registration.baby && (
              <>
                <TabsTrigger value="growth" className="gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Growth
                </TabsTrigger>
                <TabsTrigger value="immunizations" className="gap-2">
                  <Syringe className="h-4 w-4" />
                  <span className="sm:hidden">Imm</span>
                  <span className="hidden sm:inline">Immunizations</span>
                </TabsTrigger>
              </>
            )}
            {registration.is_sensitive && (
              <TabsTrigger value="hei" className="gap-2">
                <Shield className="h-4 w-4" />
                HEI
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="anc">
            <ANCVisitsTab registrationId={registrationId} />
          </TabsContent>

          <TabsContent value="delivery">
            <DeliveryTab registrationId={registrationId} />
          </TabsContent>

          <TabsContent value="pnc">
            <PNCVisitsTab registrationId={registrationId} />
          </TabsContent>

          {registration.baby && (
            <>
              <TabsContent value="growth">
                <GrowthTab patientId={registration.baby} />
              </TabsContent>

              <TabsContent value="immunizations">
                <ImmunizationsTab patientId={registration.baby} />
              </TabsContent>
            </>
          )}

          {registration.is_sensitive && (
            <TabsContent value="hei">
              <HEITab registrationId={registrationId} infantId={registration.baby} />
            </TabsContent>
          )}
        </Tabs>

        {/* Notes */}
        {registration.notes && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{registration.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </PullToRefresh>
  );
}
