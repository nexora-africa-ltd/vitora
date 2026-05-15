'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ClipboardCheck,
  Clock,
  Activity,
  Users,
  FileText,
  Syringe,
  AlertTriangle,
  Play,
  Square,
  DoorOpen,
  Ban,
  CalendarX2,
  Loader2,
  Scissors,
  Plus,
  Trash2,
  ExternalLink,
  Eye,
  Stethoscope,
  HeartPulse,
  BedDouble,
  Wrench,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { theatreApi } from '@/lib/api/theatre';
import { formatDate } from '@/lib/utils/format';
import type { CaseSchedulingContext, CaseEquipmentRequirement, SurgeryCaseDetail, SurgicalTeamMember } from '@/lib/types/theatre';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useToast } from '@/lib/hooks/use-toast';
import { useOptionalAIChatContext } from '@/lib/context/ai-chat-context';
import type { AIQuickAction } from '@/lib/types/ai';
import {
  getTeamAssignmentErrorMessage,
  TeamAssignmentDialog,
  TEAM_ROLE_LABELS,
} from '@/components/theatre/team-assignment-dialog';
import { PreOpWorkspace } from '@/components/theatre/pre-op-workspace';
import { IntraOpWorkspace } from '@/components/theatre/intra-op-workspace';
import { PostOpWorkspace } from '@/components/theatre/post-op-workspace';
import { EquipmentAssignDialog } from '@/components/theatre/equipment-assign-dialog';
import {
  TheatreCasePriorityBadge,
  TheatreCaseStatusBadge,
} from '@/components/theatre/theatre-display';

const STATUS_FLOW: Record<string, { label: string; action: string; icon: React.ElementType }> = {
  REQUESTED: { label: 'Schedule', action: 'schedule', icon: Clock },
  SCHEDULED: { label: 'Start Pre-Op', action: 'startPreOp', icon: Play },
  PRE_OP: { label: 'Enter Theatre', action: 'enterTheatre', icon: DoorOpen },
  IN_THEATRE: { label: 'Start Surgery', action: 'startSurgery', icon: Scissors },
  IN_SURGERY: { label: 'End Surgery', action: 'endSurgery', icon: Square },
};

const THEATRE_QUICK_ACTIONS: AIQuickAction[] = [
  {
    id: 'theatre-pre-op-risk',
    label: 'Pre-op risk summary',
    query:
      'Summarise the pre-operative risk profile for this surgical case. Consider ASA class, RCRI factors, patient age, comorbidities, and any flagged alerts. What are the key concerns?',
    userMessage: '🔍 Analysing pre-operative risk...',
  },
  {
    id: 'theatre-anaesthesia-plan',
    label: 'Anaesthesia considerations',
    query:
      'Based on this patient\'s profile, procedure type, and risk factors, what anaesthesia approach do you recommend? Note any airway concerns, fasting status, and special precautions.',
    userMessage: '💉 Reviewing anaesthesia considerations...',
  },
  {
    id: 'theatre-post-op-plan',
    label: 'Post-op care plan',
    query:
      'Outline a post-operative care plan for this surgical case. Include monitoring, pain management, early mobilisation, nutrition, wound care, and discharge criteria.',
    userMessage: '📋 Generating post-op care plan...',
  },
  {
    id: 'theatre-complication-watch',
    label: 'Complications to watch',
    query:
      'What are the most likely post-operative complications for this procedure? Include incidence, early signs, and recommended actions for each.',
    userMessage: '⚠️ Reviewing potential complications...',
  },
];

export default function CaseDetailPage() {
  const { caseNumber } = useParams<{ caseNumber: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const [surgeryCase, setSurgeryCase] = useState<SurgeryCaseDetail | null>(null);
  const [schedulingContext, setSchedulingContext] = useState<CaseSchedulingContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [assignmentDialog, setAssignmentDialog] = useState(false);
  const [teamMutationLoading, setTeamMutationLoading] = useState(false);
  const [equipmentList, setEquipmentList] = useState<CaseEquipmentRequirement[]>([]);
  const [equipmentDialog, setEquipmentDialog] = useState(false);
  const [equipmentMutationLoading, setEquipmentMutationLoading] = useState(false);

  const requestedTab = searchParams.get('tab');
  const derivedDefaultTab = requestedTab && ['overview', 'pre-op', 'intra-op', 'post-op'].includes(requestedTab)
    ? requestedTab
    : ['SCHEDULED', 'PRE_OP'].includes(surgeryCase?.status || '')
      ? 'pre-op'
      : ['IN_THEATRE', 'IN_SURGERY'].includes(surgeryCase?.status || '')
        ? 'intra-op'
        : surgeryCase?.status === 'IN_PACU'
          ? 'post-op'
          : 'overview';
  const [activeTab, setActiveTab] = useState(derivedDefaultTab);

  useEffect(() => {
    setActiveTab(derivedDefaultTab);
  }, [derivedDefaultTab]);

  const fetchCase = useCallback(async (showLoading = false) => {
    if (!caseNumber) return;
    try {
      if (showLoading) setLoading(true);
      const [detail, context] = await Promise.all([
        theatreApi.getCase(caseNumber),
        theatreApi.getCaseSchedulingContext(caseNumber).catch(() => null),
      ]);
      setSurgeryCase(detail);
      setSchedulingContext(context);
      // Fetch equipment list after we have the case ID
      if (detail?.id) {
        theatreApi.listCaseEquipment(detail.id).then(setEquipmentList).catch(() => setEquipmentList([]));
      }
    } catch {
      // not found
      setSurgeryCase(null);
      setSchedulingContext(null);
      setEquipmentList([]);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [caseNumber]);

  useEffect(() => { fetchCase(true); }, [fetchCase]);

  // =========================================================================
  // AI Chat Widget — theatre-aware context wiring
  // =========================================================================

  const chatCtx = useOptionalAIChatContext();
  const setEncounterAwareContext = chatCtx?.setEncounterAwareContext;
  const setQuickActions = chatCtx?.setQuickActions;

  useEffect(() => {
    if (!setEncounterAwareContext || !surgeryCase) return;

    const age = (() => {
      if (!surgeryCase.patient_date_of_birth) return 0;
      const dob = new Date(surgeryCase.patient_date_of_birth);
      if (Number.isNaN(dob.getTime())) return 0;
      const today = new Date();
      let a = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) a--;
      return a;
    })();

    setEncounterAwareContext(
      {
        patient_age: age,
        patient_sex: surgeryCase.patient_gender === 'M' ? 'male' : 'female',
      },
      {
        chief_complaint: `Surgical case: ${surgeryCase.primary_procedure_name}${surgeryCase.diagnosis ? ` — ${surgeryCase.diagnosis}` : ''}`,
        clinical_notes: [
          `Procedure: ${surgeryCase.primary_procedure_name}`,
          `Priority: ${surgeryCase.priority}`,
          `ASA Class: ${surgeryCase.asa_class}`,
          `Anesthesia: ${surgeryCase.anesthesia_type}`,
          surgeryCase.laterality !== 'NA' ? `Laterality: ${surgeryCase.laterality}` : '',
          surgeryCase.procedure_notes ? `Notes: ${surgeryCase.procedure_notes}` : '',
        ].filter(Boolean).join('. '),
      },
    );

    return () => { setEncounterAwareContext(null, null); };
  }, [surgeryCase, setEncounterAwareContext]);

  useEffect(() => {
    if (!setQuickActions) return;
    setQuickActions(THEATRE_QUICK_ACTIONS);
    return () => { setQuickActions([]); };
  }, [setQuickActions]);

  const runAction = async (action: string) => {
    if (!surgeryCase) return;
    try {
      setActionLoading(true);
      const id = surgeryCase.id;
      switch (action) {
        case 'schedule':
          await theatreApi.scheduleCase(surgeryCase.case_number, {
            scheduled_date: surgeryCase.scheduled_date,
            scheduled_start_time: surgeryCase.scheduled_start_time,
          });
          break;
        case 'startPreOp':
          await theatreApi.startPreOp(surgeryCase.case_number);
          break;
        case 'enterTheatre':
          await theatreApi.enterTheatre(surgeryCase.case_number);
          break;
        case 'startSurgery':
          await theatreApi.startSurgery(surgeryCase.case_number);
          break;
        case 'endSurgery':
          await theatreApi.endSurgery(surgeryCase.case_number);
          break;
        case 'dischargeCase':
          await theatreApi.dischargeCase(surgeryCase.case_number);
          break;
      }
      await fetchCase();
    } catch {
      // error handling
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!surgeryCase) return;
    try {
      setActionLoading(true);
      await theatreApi.cancelCase(surgeryCase.case_number, { reason: cancelReason });
      setCancelDialog(false);
      setCancelReason('');
      await fetchCase();
    } catch {
      // error
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignTeamMember = async (data: { staffUserId: number; role: string; notes: string }) => {
    if (!surgeryCase) return;
    try {
      setTeamMutationLoading(true);
      await theatreApi.addTeamMember(surgeryCase.case_number, {
        staff_member: data.staffUserId,
        role: data.role,
        notes: data.notes || undefined,
      });
      toast({
        title: 'Team member assigned',
        description: 'The surgical team roster has been updated.',
      });
      setAssignmentDialog(false);
      await fetchCase();
    } catch (error) {
      const message = getTeamAssignmentErrorMessage(error, 'The team member could not be assigned.');
      toast({
        title: 'Assignment failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setTeamMutationLoading(false);
    }
  };

  const handleRemoveTeamMember = async (memberId: number) => {
    if (!surgeryCase) return;
    try {
      setTeamMutationLoading(true);
      await theatreApi.removeTeamMember(surgeryCase.case_number, memberId);
      toast({
        title: 'Team member removed',
        description: 'The team assignment has been removed from the case.',
      });
      await fetchCase();
    } catch (error) {
      toast({
        title: 'Removal failed',
        description: getTeamAssignmentErrorMessage(error, 'The team member could not be removed.'),
        variant: 'destructive',
      });
    } finally {
      setTeamMutationLoading(false);
    }
  };

  const handleAddEquipment = async (data: import('@/lib/types/theatre').CaseEquipmentCreateData) => {
    if (!surgeryCase) return;
    try {
      setEquipmentMutationLoading(true);
      await theatreApi.addCaseEquipment(surgeryCase.id, data);
      setEquipmentDialog(false);
      toast({ title: 'Equipment added', description: 'Equipment requirement has been added to the case.' });
      await fetchCase();
    } catch (error) {
      toast({
        title: 'Failed to add equipment',
        description: getTeamAssignmentErrorMessage(error, 'The equipment could not be assigned.'),
        variant: 'destructive',
      });
    } finally {
      setEquipmentMutationLoading(false);
    }
  };

  const handleRemoveEquipment = async (requirementId: number) => {
    if (!surgeryCase) return;
    try {
      setEquipmentMutationLoading(true);
      await theatreApi.removeCaseEquipment(surgeryCase.id, requirementId);
      toast({ title: 'Equipment removed' });
      await fetchCase();
    } catch (error) {
      toast({
        title: 'Failed to remove equipment',
        description: getTeamAssignmentErrorMessage(error, 'The equipment could not be removed.'),
        variant: 'destructive',
      });
    } finally {
      setEquipmentMutationLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!surgeryCase) {
    return (
      <div className="flex flex-col items-center justify-center py-16 sm:py-24 gap-4">
        <AlertTriangle className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-muted-foreground text-sm">Case not found.</p>
        <Button variant="outline" size="sm" onClick={() => router.push('/theatre/cases')}>View All Cases</Button>
      </div>
    );
  }

  const nextStep = STATUS_FLOW[surgeryCase.status];
  const isTerminal = ['DISCHARGED', 'CANCELLED'].includes(surgeryCase.status);
  const canCancel = !['DISCHARGED', 'CANCELLED', 'IN_SURGERY'].includes(surgeryCase.status);
  const canManageTeam = hasPermission('theatre.manage_theatre');
  const coverageByMember = new Map(
    (schedulingContext?.members || []).map((member: CaseSchedulingContext['members'][number]) => [
      `${member.staff_member_id}:${member.role}`,
      member,
    ])
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Case ${surgeryCase.case_number}`}
        helpContent="View surgery case details, manage workflow transitions, review team and documentation."
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {surgeryCase.patient_name}
            <span className="text-muted-foreground"> &middot; {surgeryCase.patient_mrn}</span>
          </p>
          <p className="text-sm truncate">{surgeryCase.primary_procedure_name}</p>
          <p className="text-xs text-muted-foreground">
            {surgeryCase.theatre_name} &middot; {formatDate(surgeryCase.scheduled_date)} {surgeryCase.scheduled_start_time?.slice(0, 5)}
            {surgeryCase.estimated_duration_minutes ? <> &middot; {surgeryCase.estimated_duration_minutes}min est.</> : ''}
            {surgeryCase.encounter != null ? (
              <>
                {' '}&middot;{' '}
                <Link
                  href={`/encounters/${surgeryCase.encounter}`}
                  className="inline-flex items-center gap-1 text-blue-700 underline decoration-blue-700/40 hover:decoration-blue-700 dark:text-blue-400 dark:decoration-blue-400/40 dark:hover:decoration-blue-400"
                >
                  <ExternalLink className="h-3 w-3" />
                  Encounter #{surgeryCase.encounter}
                </Link>
              </>
            ) : (
              <>
                {' '}&middot;{' '}
                <button
                  type="button"
                  className="text-primary hover:underline"
                  disabled={actionLoading}
                  onClick={async () => {
                    try {
                      setActionLoading(true);
                      await theatreApi.linkEncounter(surgeryCase.case_number);
                      toast({ title: 'Encounter linked', description: 'A procedure encounter has been created and linked to this case.' });
                      await fetchCase();
                    } catch {
                      toast({ title: 'Failed to link encounter', variant: 'destructive' });
                    } finally {
                      setActionLoading(false);
                    }
                  }}
                >
                  {actionLoading ? 'Linking...' : 'Link encounter'}
                </button>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          <TheatreCasePriorityBadge priority={surgeryCase.priority} hideElective />
          <TheatreCaseStatusBadge status={surgeryCase.status} />
        </div>
      </div>

      {/* Actions */}
      {!isTerminal && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          {canCancel && (
            <Button variant="destructive" onClick={() => setCancelDialog(true)} disabled={actionLoading}>
              <Ban className="h-4 w-4 mr-2" />
              Cancel Case
            </Button>
          )}
          {nextStep && (
            <Button onClick={() => runAction(nextStep.action)} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <nextStep.icon className="h-4 w-4 mr-2" />}
              {nextStep.label}
            </Button>
          )}
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value);
          const params = new URLSearchParams(searchParams.toString());
          if (value === 'overview') {
            params.delete('tab');
          } else {
            params.set('tab', value);
          }
          const query = params.toString();
          router.replace(query ? `/theatre/cases/${surgeryCase.case_number}?${query}` : `/theatre/cases/${surgeryCase.case_number}`);
        }}
      >
        <TabsList className="grid w-full grid-cols-4 rounded-lg border bg-muted/30 p-1">
          <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm">
            <Eye className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="pre-op" className="gap-1.5 text-xs sm:text-sm">
            <Stethoscope className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Pre-Op</span>
          </TabsTrigger>
          <TabsTrigger value="intra-op" className="gap-1.5 text-xs sm:text-sm">
            <HeartPulse className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Intra-Op</span>
          </TabsTrigger>
          <TabsTrigger value="post-op" className="gap-1.5 text-xs sm:text-sm">
            <BedDouble className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Post-Op</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 sm:space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="relative overflow-hidden">
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                aria-hidden="true"
              />
              <CardHeader className="relative pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Scheduling
                  <HelpPopover content="Shows how this case maps to the scheduling system: theatre resource, slot availability, and team shift coverage status." />
                </CardTitle>
              </CardHeader>
              <CardContent className="relative space-y-2 text-sm">
                <DetailRow
                  label="Slot Source"
                  value={schedulingContext?.slot_validation.source === 'scheduling_resource' ? 'Scheduling resource' : 'Theatre hours'}
                />
                <DetailRow
                  label="Resource"
                  value={schedulingContext?.theatre.scheduling_resource_name || 'Not linked'}
                />
                <DetailRow
                  label="Schedule"
                  value={schedulingContext?.theatre.has_resource_schedule ? 'Configured' : 'Not configured'}
                />
                <DetailRow
                  label="Coverage"
                  value={
                    schedulingContext
                      ? `${schedulingContext.team_summary.covered_members}/${schedulingContext.team_summary.total_members || 0}`
                      : '—'
                  }
                />
                {schedulingContext && !schedulingContext.slot_validation.available && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100 text-xs sm:text-sm">
                    <p className="font-medium">Scheduling issue</p>
                    <p className="mt-1">{schedulingContext.slot_validation.reason}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                aria-hidden="true"
              />
              <CardHeader className="relative pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Clinical Details
                  <HelpPopover content="Diagnosis, ASA classification, anesthesia type, laterality, and procedure notes from the requesting surgeon." />
                </CardTitle>
              </CardHeader>
              <CardContent className="relative space-y-2 text-sm">
                <DetailRow label="Diagnosis" value={surgeryCase.diagnosis || '—'} />
                <DetailRow label="ASA Class" value={surgeryCase.asa_class || '—'} />
                <DetailRow label="Anesthesia" value={surgeryCase.anesthesia_type || '—'} />
                <DetailRow label="Laterality" value={surgeryCase.laterality} />
                <DetailRow label="Doctor" value={surgeryCase.requesting_doctor_name} />
                {surgeryCase.procedure_notes && (
                  <div>
                    <p className="text-muted-foreground">Notes</p>
                    <p className="whitespace-pre-wrap">{surgeryCase.procedure_notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                aria-hidden="true"
              />
              <CardHeader className="relative pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Billing
                  <HelpPopover content="Total theatre charges and billable status for this surgery case." />
                </CardTitle>
              </CardHeader>
              <CardContent className="relative space-y-2 text-sm">
                <DetailRow label="Total Charges" value={`KES ${surgeryCase.total_charges}`} />
                <DetailRow label="Billable" value={surgeryCase.is_billable ? 'Yes' : 'No'} />
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                aria-hidden="true"
              />
              <CardHeader className="relative pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" /> Surgical Team
                  <HelpPopover content="Assigned team members with roles and shift coverage status. Add or remove members when you have theatre management permissions." />
                  <Badge variant="secondary" className="text-xs ml-auto shrink-0">{surgeryCase.team_members.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="relative space-y-3">
                {canManageTeam && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-dashed p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Assign team members</p>
                      <p className="text-xs text-muted-foreground">Add surgeons, anesthesia staff, and theatre nurses.</p>
                    </div>
                    <Button type="button" size="sm" onClick={() => setAssignmentDialog(true)} className="w-full sm:w-auto">
                      <Plus className="h-4 w-4 mr-2" />
                      Assign
                    </Button>
                  </div>
                )}
                {surgeryCase.team_members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No team members assigned yet.</p>
                ) : (
                  <div className="space-y-2">
                    {surgeryCase.team_members.map(m => (
                      <TeamMemberRow
                        key={m.id}
                        member={m}
                        coverage={coverageByMember.get(`${m.staff_member}:${m.role}`) ?? null}
                        canManageTeam={canManageTeam}
                        onRemove={() => handleRemoveTeamMember(m.id)}
                        removing={teamMutationLoading}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Equipment Requirements */}
            <Card className="relative overflow-hidden">
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                aria-hidden="true"
              />
              <CardHeader className="relative pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Wrench className="h-4 w-4" /> Equipment
                  <HelpPopover content="Surgical equipment assigned to this case. Shows confirmation status and scheduling conflicts." />
                  <Badge variant="secondary" className="text-xs ml-auto shrink-0">{equipmentList.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="relative space-y-3">
                {canManageTeam && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-dashed p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Assign equipment</p>
                      <p className="text-xs text-muted-foreground">Add required surgical equipment for this case.</p>
                    </div>
                    <Button type="button" size="sm" onClick={() => setEquipmentDialog(true)} className="w-full sm:w-auto">
                      <Plus className="h-4 w-4 mr-2" />
                      Add
                    </Button>
                  </div>
                )}
                {schedulingContext?.equipment?.has_conflicts && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100 text-xs sm:text-sm">
                    <p className="font-medium">Equipment conflicts detected</p>
                    <p className="mt-0.5">Some equipment is double-booked during this case&apos;s time window.</p>
                  </div>
                )}
                {equipmentList.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No equipment assigned yet.</p>
                ) : (
                  <div className="space-y-2">
                    {equipmentList.map((eq) => (
                      <EquipmentRow
                        key={eq.id}
                        equipment={eq}
                        hasConflict={schedulingContext?.equipment?.items?.find(i => i.requirement_id === eq.id)?.has_conflict ?? false}
                        canManage={canManageTeam}
                        onRemove={() => handleRemoveEquipment(eq.id)}
                        removing={equipmentMutationLoading}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden sm:col-span-2">
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                aria-hidden="true"
              />
              <CardHeader className="relative pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4" /> Documentation
                  <HelpPopover content="Tracks completion of WHO checklist, anesthesia record, operative note, and PACU record across the surgical workflow." />
                </CardTitle>
              </CardHeader>
              <CardContent className="relative grid gap-2 sm:grid-cols-2">
                <DocStatus label="WHO Checklist" done={surgeryCase.has_who_checklist} />
                <DocStatus label="Anesthesia Record" done={surgeryCase.has_anesthesia_record} />
                <DocStatus label="Operative Note" done={surgeryCase.has_operative_note} />
                <DocStatus label="PACU Record" done={surgeryCase.has_pacu_record} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pre-op" className="space-y-4 sm:space-y-6">
          <PreOpWorkspace surgeryCase={surgeryCase} onCaseRefresh={fetchCase} />
        </TabsContent>

        <TabsContent value="intra-op" className="space-y-4 sm:space-y-6">
          <IntraOpWorkspace surgeryCase={surgeryCase} onCaseRefresh={fetchCase} />
        </TabsContent>

        <TabsContent value="post-op" className="space-y-4 sm:space-y-6">
          <PostOpWorkspace surgeryCase={surgeryCase} onCaseRefresh={fetchCase} />
        </TabsContent>
      </Tabs>

      {/* Cancellation Details */}
      {surgeryCase.status === 'CANCELLED' && surgeryCase.cancellation_reason && (
        <Card className="border-destructive/50">
          <CardContent className="p-3 sm:p-4">
            <p className="text-sm font-medium text-destructive">Cancellation Reason</p>
            <p className="text-sm mt-1">{surgeryCase.cancellation_reason}</p>
          </CardContent>
        </Card>
      )}

      {surgeryCase.status === 'POSTPONED' && surgeryCase.postponed_to_date && (
        <Card className="border-amber-500/50">
          <CardContent className="p-3 sm:p-4 flex items-center gap-2">
            <CalendarX2 className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-sm">Postponed to <strong>{surgeryCase.postponed_to_date}</strong></p>
          </CardContent>
        </Card>
      )}

      {/* Cancel Dialog */}
      <Dialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Cancel Surgery Case</DialogTitle>
              <HelpPopover content="Provide a reason for cancelling this case. The cancellation will be recorded in the case audit trail." />
            </div>
          </DialogHeader>
          <Textarea
            placeholder="Reason for cancellation..."
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
            rows={3}
          />
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setCancelDialog(false)} className="w-full sm:w-auto">Keep Case</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={!cancelReason.trim() || actionLoading} className="w-full sm:w-auto">
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TeamAssignmentDialog
        open={assignmentDialog}
        onOpenChange={setAssignmentDialog}
        excludeUserIds={surgeryCase.team_members.map((m) => m.staff_member)}
        onSubmit={handleAssignTeamMember}
        submitting={teamMutationLoading}
      />

      <EquipmentAssignDialog
        open={equipmentDialog}
        onOpenChange={setEquipmentDialog}
        defaultStartTime={surgeryCase.scheduled_start_time?.slice(0, 5) || '08:00'}
        defaultEndTime={(() => {
          const parts = (surgeryCase.scheduled_start_time || '08:00').split(':').map(Number);
          const totalMin = (parts[0] ?? 8) * 60 + (parts[1] ?? 0) + (surgeryCase.estimated_duration_minutes || 60);
          return `${String(Math.floor(totalMin / 60) % 24).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
        })()}
        onSubmit={handleAddEquipment}
        submitting={equipmentMutationLoading}
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 sm:gap-4">
      <span className="text-muted-foreground shrink-0 text-xs sm:text-sm">{label}</span>
      <span className="text-right truncate text-xs sm:text-sm">{value}</span>
    </div>
  );
}

function TeamMemberRow({
  member,
  coverage,
  canManageTeam,
  onRemove,
  removing,
}: {
  member: SurgicalTeamMember;
  coverage: CaseSchedulingContext['members'][number] | null;
  canManageTeam: boolean;
  onRemove: () => void;
  removing: boolean;
}) {
  return (
    <div className="flex items-start sm:items-center justify-between gap-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{member.staff_name}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <Badge variant="outline" className="text-xs shrink-0 w-fit">
            {member.role.replace(/_/g, ' ')}
          </Badge>
          {coverage && (
            <Badge className={`text-xs shrink-0 w-fit ${coverage.has_shift_coverage ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300'}`}>
              {coverage.has_shift_coverage ? 'Covered' : 'Uncovered'}
            </Badge>
          )}
        </div>
        {coverage && !coverage.has_shift_coverage && (
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">{coverage.message}</p>
        )}
      </div>
      {canManageTeam && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
          onClick={onRemove}
          disabled={removing}
          aria-label={`Remove ${member.staff_name} from team`}
        >
          {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );
}

function DocStatus({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm gap-2">
      <span className="truncate">{label}</span>
      {done ? (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 text-xs shrink-0 w-fit">Complete</Badge>
      ) : (
        <Badge variant="outline" className="text-xs text-muted-foreground shrink-0 w-fit">Pending</Badge>
      )}
    </div>
  );
}

function EquipmentRow({
  equipment,
  hasConflict,
  canManage,
  onRemove,
  removing,
}: {
  equipment: CaseEquipmentRequirement;
  hasConflict: boolean;
  canManage: boolean;
  onRemove: () => void;
  removing: boolean;
}) {
  const name = equipment.equipment_type_name || equipment.resource_name || 'Unknown';
  const timeRange = `${equipment.reserved_from?.slice(0, 5)} – ${equipment.reserved_until?.slice(0, 5)}`;
  return (
    <div className="flex items-start sm:items-center justify-between gap-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{name}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <Badge variant="outline" className="text-xs shrink-0 w-fit">{timeRange}</Badge>
          {equipment.equipment_type_category && (
            <Badge variant="secondary" className="text-xs shrink-0 w-fit">
              {equipment.equipment_type_category.replace(/_/g, ' ')}
            </Badge>
          )}
          {equipment.is_confirmed ? (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 text-xs shrink-0 w-fit">Confirmed</Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300 text-xs shrink-0 w-fit">Pending</Badge>
          )}
          {hasConflict && (
            <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 text-xs shrink-0 w-fit">Conflict</Badge>
          )}
        </div>
        {equipment.resource_code && (
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">{equipment.resource_code}</p>
        )}
      </div>
      {canManage && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
          onClick={onRemove}
          disabled={removing}
          aria-label={`Remove ${name}`}
        >
          {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );
}
