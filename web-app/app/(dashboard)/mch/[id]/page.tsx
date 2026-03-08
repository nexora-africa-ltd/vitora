'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Baby, Calendar, CalendarPlus, ExternalLink, FileText, Heart, Loader2, Shield, Stethoscope, Syringe, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';
import { mchRegistrationsApi, ancVisitsApi, deliveriesApi, pncVisitsApi } from '@/lib/api/mch';
import { ANCVisitsTab } from '@/components/mch/anc-visits-tab';
import { DeliveryTab } from '@/components/mch/delivery-tab';
import { PNCVisitsTab } from '@/components/mch/pnc-visits-tab';
import { PartographTab } from '@/components/mch/partograph-tab';
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
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { refresh, isRefreshing } = usePageRefresh();

  const registrationId = parseInt(id, 10);
  const requestedTab = searchParams.get('tab');
  const defaultTab = requestedTab === 'pnc'
    ? 'pnc'
    : requestedTab === 'delivery'
      ? 'delivery'
      : requestedTab === 'partograph'
        ? 'partograph'
        : 'anc';
  const linkedClinicVisitId = Number(searchParams.get('clinic_visit_id'));
  const linkedEncounterId = Number(searchParams.get('encounter_id'));
  const activeClinicVisitId = Number.isFinite(linkedClinicVisitId) && linkedClinicVisitId > 0
    ? linkedClinicVisitId
    : null;
  const activeEncounterId = Number.isFinite(linkedEncounterId) && linkedEncounterId > 0
    ? linkedEncounterId
    : null;

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

  // --- ANC Queue & Scheduling ---
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');

  const routeToANCMutation = useMutation({
    mutationFn: () => mchRegistrationsApi.routeToANC(registrationId),
    onSuccess: (data) => {
      toast({
        title: 'Sent to ANC Queue',
        description: `Queue #${data.queue_number} at ${data.clinic}. Opening clinic visit.`,
      });
      router.push(`/clinics/visits/${data.clinic_visit_id}`);
    },
    onError: (error: Error & { response?: { data?: { detail?: string } } }) => {
      toast({
        title: 'Error',
        description: error.response?.data?.detail || 'Failed to send to ANC queue.',
        variant: 'destructive',
      });
    },
  });

  const routeToPNCMutation = useMutation({
    mutationFn: () => mchRegistrationsApi.routeToPNC(registrationId),
    onSuccess: (data) => {
      toast({
        title: 'Sent to PNC Queue',
        description: `Queue #${data.queue_number} at ${data.clinic}. Opening clinic visit.`,
      });
      router.push(`/clinics/visits/${data.clinic_visit_id}`);
    },
    onError: (error: Error & { response?: { data?: { detail?: string } } }) => {
      toast({
        title: 'Error',
        description: error.response?.data?.detail || 'Failed to send to PNC queue.',
        variant: 'destructive',
      });
    },
  });

  const scheduleANCMutation = useMutation({
    mutationFn: (data: { date: string; notes?: string }) =>
      mchRegistrationsApi.scheduleANCVisit(registrationId, data),
    onSuccess: (data) => {
      setShowScheduleDialog(false);
      setScheduleDate('');
      setScheduleNotes('');
      toast({
        title: 'ANC Visit Scheduled',
        description: `Appointment ${data.appointment_number} on ${formatDate(data.scheduled_date)}.`,
      });
    },
    onError: (error: Error & { response?: { data?: { detail?: string } } }) => {
      toast({
        title: 'Error',
        description: error.response?.data?.detail || 'Failed to schedule ANC visit.',
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

  const isDelivered = ['DELIVERED', 'POSTNATAL', 'COMPLETED'].includes(registration.status);

  const daysToEDD = registration.edd && !isDelivered
    ? Math.ceil((new Date(registration.edd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-6">
        <PageHeader
          title={registration.mch_number}
          helpContent="View and manage maternal and child health registration details. Track ANC visits, delivery, PNC visits, growth, and immunizations."
          actions={
            registration.status === 'ACTIVE' ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowScheduleDialog(true)}
                  disabled={scheduleANCMutation.isPending}
                >
                  <CalendarPlus className="h-4 w-4 mr-1.5" />
                  <span className="sm:hidden">Schedule</span>
                  <span className="hidden sm:inline">Schedule ANC Visit</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => routeToANCMutation.mutate()}
                  disabled={routeToANCMutation.isPending}
                >
                  {routeToANCMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Stethoscope className="h-4 w-4 mr-1.5" />
                  )}
                  <span className="sm:hidden">ANC Queue</span>
                  <span className="hidden sm:inline">Send to ANC Queue</span>
                </Button>
              </div>
            ) : isDelivered ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  size="sm"
                  onClick={() => routeToPNCMutation.mutate()}
                  disabled={routeToPNCMutation.isPending}
                >
                  {routeToPNCMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Heart className="h-4 w-4 mr-1.5" />
                  )}
                  <span className="sm:hidden">PNC Queue</span>
                  <span className="hidden sm:inline">Send to PNC Queue</span>
                </Button>
              </div>
            ) : undefined
          }
        />

        {activeClinicVisitId ? (
          <Card className="border-sky-200 bg-sky-50/70">
            <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-sky-900">
                This consultation is linked to clinic visit #{activeClinicVisitId}
                {activeEncounterId ? ` and encounter #${activeEncounterId}` : ''}.
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/clinics/visits/${activeClinicVisitId}`}>Open Clinic Visit</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {/* Summary Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-4 rounded-lg bg-muted/50">
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-lg font-semibold truncate">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={`/patients/${registration.mother}`}
                      className="hover:text-sky-600 dark:hover:text-sky-400 hover:underline transition-colors duration-200"
                    >
                      {registration.mother_name}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>View mother&apos;s patient record</TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
          <Card className="border-orange-200 bg-orange">
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
          <div className="pt-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href={`/patients/${registration.baby}`}>
                  <Card className="border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/50 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2 text-sky-700 dark:text-sky-400">
                        <Baby className="h-4 w-4" />
                        Baby Information
                        <ExternalLink className="h-3.5 w-3.5 ml-auto text-sky-400 dark:text-sky-500" />
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-medium">{registration.baby_name}</p>
                      <p className="text-sm text-muted-foreground">{registration.baby_mrn}</p>
                    </CardContent>
                  </Card>
                </Link>
              </TooltipTrigger>
              <TooltipContent>View baby&apos;s patient record</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue={defaultTab} className="space-y-4">
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
            <TabsTrigger value="partograph" className="gap-2">
              <Stethoscope className="h-4 w-4" />
              <span className="sm:hidden">Labour</span>
              <span className="hidden sm:inline">Partograph</span>
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
            <ANCVisitsTab
              registrationId={registrationId}
              isDelivered={isDelivered}
              clinicVisitId={defaultTab === 'anc' ? activeClinicVisitId : null}
              encounterId={defaultTab === 'anc' ? activeEncounterId : null}
            />
          </TabsContent>

          <TabsContent value="delivery">
            <DeliveryTab registrationId={registrationId} />
          </TabsContent>

          <TabsContent value="partograph">
            <PartographTab registrationId={registrationId} registration={registration} />
          </TabsContent>

          <TabsContent value="pnc">
            <PNCVisitsTab
              registrationId={registrationId}
              isDelivered={isDelivered}
              clinicVisitId={defaultTab === 'pnc' ? activeClinicVisitId : null}
              encounterId={defaultTab === 'pnc' ? activeEncounterId : null}
            />
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

      {/* Schedule ANC Visit Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule ANC Visit</DialogTitle>
            <DialogDescription>
              Schedule a future ANC appointment for {registration.mother_name}.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (scheduleDate) {
                scheduleANCMutation.mutate({ date: scheduleDate, notes: scheduleNotes || undefined });
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="schedule-date">Visit Date *</Label>
              <Input
                id="schedule-date"
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-notes">Notes</Label>
              <Textarea
                id="schedule-notes"
                value={scheduleNotes}
                onChange={(e) => setScheduleNotes(e.target.value)}
                placeholder="e.g. 2nd trimester check-up..."
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowScheduleDialog(false)}
                disabled={scheduleANCMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!scheduleDate || scheduleANCMutation.isPending}>
                {scheduleANCMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Schedule
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PullToRefresh>
  );
}
