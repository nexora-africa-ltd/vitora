'use client';

import { useState, useEffect, useCallback } from 'react';
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
  ChevronRight,
  PauseCircle,
  Scissors,
  Plus,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
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
import { staffApi } from '@/lib/api/rbac';
import type { CaseSchedulingContext, SurgeryCaseDetail, SurgicalTeamMember } from '@/lib/types/theatre';
import type { StaffProfile } from '@/lib/types/rbac';
import { TEAM_ROLES } from '@/lib/schemas/theatre.schema';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useToast } from '@/lib/hooks/use-toast';
import {
  getTeamAssignmentErrorMessage,
  TeamAssignmentDialog,
  TEAM_ROLE_LABELS,
} from '@/components/theatre/team-assignment-dialog';
import { PreOpWorkspace } from '@/components/theatre/pre-op-workspace';
import { IntraOpWorkspace } from '@/components/theatre/intra-op-workspace';
import { PostOpWorkspace } from '@/components/theatre/post-op-workspace';
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
  const [staffSearch, setStaffSearch] = useState('');
  const [staffResults, setStaffResults] = useState<StaffProfile[]>([]);
  const [staffResultsLoading, setStaffResultsLoading] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState<(typeof TEAM_ROLES)[number] | ''>('');
  const [teamNotes, setTeamNotes] = useState('');
  const [staffPickerOpen, setStaffPickerOpen] = useState(false);
  const [teamMutationLoading, setTeamMutationLoading] = useState(false);

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

  const fetchCase = useCallback(async () => {
    if (!caseNumber) return;
    try {
      setLoading(true);
      const [detail, context] = await Promise.all([
        theatreApi.getCase(caseNumber),
        theatreApi.getCaseSchedulingContext(caseNumber).catch(() => null),
      ]);
      setSurgeryCase(detail);
      setSchedulingContext(context);
    } catch {
      // not found
      setSurgeryCase(null);
      setSchedulingContext(null);
    } finally {
      setLoading(false);
    }
  }, [caseNumber]);

  useEffect(() => { fetchCase(); }, [fetchCase]);

  const loadStaffOptions = useCallback(async (searchValue: string) => {
    try {
      setStaffResultsLoading(true);
      const response = await staffApi.list({
        search: searchValue || undefined,
        page_size: 50,
        employment_status: 'ACTIVE',
      });
      setStaffResults(response.results ?? []);
    } catch {
      toast({
        title: 'Unable to load staff',
        description: 'Staff candidates could not be loaded for team assignment.',
        variant: 'destructive',
      });
    } finally {
      setStaffResultsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!assignmentDialog) return;
    void loadStaffOptions(staffSearch);
  }, [assignmentDialog, staffSearch, loadStaffOptions]);

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

  const resetTeamAssignmentForm = () => {
    setSelectedStaffId(null);
    setSelectedRole('');
    setTeamNotes('');
    setStaffSearch('');
    setStaffPickerOpen(false);
  };

  const handleAssignTeamMember = async () => {
    if (!surgeryCase || !selectedStaffId || !selectedRole) return;
    try {
      setTeamMutationLoading(true);
      await theatreApi.addTeamMember(surgeryCase.case_number, {
        staff_member: selectedStaffId,
        role: selectedRole,
        notes: teamNotes.trim() || undefined,
      });
      toast({
        title: 'Team member assigned',
        description: 'The surgical team roster has been updated.',
      });
      setAssignmentDialog(false);
      resetTeamAssignmentForm();
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!surgeryCase) {
    return (
      <div className="text-center py-24">
        <p className="text-muted-foreground mb-4">Case not found.</p>
        <Button variant="outline" onClick={() => router.push('/theatre/cases')}>Back to Cases</Button>
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
    <div className="space-y-6">
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
            {surgeryCase.theatre_name} &middot; {surgeryCase.scheduled_date} {surgeryCase.scheduled_start_time?.slice(0, 5)}
            {surgeryCase.estimated_duration_minutes ? ` &middot; ${surgeryCase.estimated_duration_minutes}min est.` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <TheatreCasePriorityBadge priority={surgeryCase.priority} hideElective />
          <TheatreCaseStatusBadge status={surgeryCase.status} />
        </div>
      </div>

      {/* Actions */}
      {!isTerminal && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {nextStep && (
            <Button onClick={() => runAction(nextStep.action)} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <nextStep.icon className="h-4 w-4 mr-2" />}
              {nextStep.label}
            </Button>
          )}
          {canCancel && (
            <Button variant="destructive" onClick={() => setCancelDialog(true)} disabled={actionLoading}>
              <Ban className="h-4 w-4 mr-2" />
              Cancel Case
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
          <TabsTrigger value="overview" className="text-sm">Overview</TabsTrigger>
          <TabsTrigger value="pre-op" className="text-sm">Pre-Op</TabsTrigger>
          <TabsTrigger value="intra-op" className="text-sm">Intra-Op</TabsTrigger>
          <TabsTrigger value="post-op" className="text-sm">Post-Op</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Scheduling Integration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <DetailRow
                  label="Slot Source"
                  value={schedulingContext?.slot_validation.source === 'scheduling_resource' ? 'Scheduling resource' : 'Theatre hours'}
                />
                <DetailRow
                  label="Scheduling Resource"
                  value={schedulingContext?.theatre.scheduling_resource_name || 'Not linked'}
                />
                <DetailRow
                  label="Resource Schedule"
                  value={schedulingContext?.theatre.has_resource_schedule ? 'Configured' : 'Not configured'}
                />
                <DetailRow
                  label="Team Coverage"
                  value={
                    schedulingContext
                      ? `${schedulingContext.team_summary.covered_members}/${schedulingContext.team_summary.total_members || 0}`
                      : '—'
                  }
                />
                {schedulingContext && !schedulingContext.slot_validation.available && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                    <p className="font-medium">Scheduling issue detected</p>
                    <p className="mt-1 text-xs">{schedulingContext.slot_validation.reason}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Clinical Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <DetailRow label="Diagnosis" value={surgeryCase.diagnosis || '—'} />
                <DetailRow label="ASA Class" value={surgeryCase.asa_class || '—'} />
                <DetailRow label="Anesthesia" value={surgeryCase.anesthesia_type || '—'} />
                <DetailRow label="Laterality" value={surgeryCase.laterality} />
                <DetailRow label="Requesting Doctor" value={surgeryCase.requesting_doctor_name} />
                {surgeryCase.procedure_notes && (
                  <div>
                    <p className="text-muted-foreground">Notes</p>
                    <p className="whitespace-pre-wrap">{surgeryCase.procedure_notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Billing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <DetailRow label="Total Charges" value={`KES ${surgeryCase.total_charges}`} />
                <DetailRow label="Billable" value={surgeryCase.is_billable ? 'Yes' : 'No'} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" /> Surgical Team
                  <Badge variant="secondary" className="text-xs ml-auto">{surgeryCase.team_members.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {canManageTeam ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-dashed p-3">
                    <div>
                      <p className="text-sm font-medium">Assign team members</p>
                      <p className="text-xs text-muted-foreground">Add surgeons, anesthesia staff, and theatre nurses from the active staff directory.</p>
                    </div>
                    <Button type="button" size="sm" onClick={() => setAssignmentDialog(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Assign Member
                    </Button>
                  </div>
                ) : null}
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

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4" /> Documentation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <DocStatus label="WHO Checklist" done={surgeryCase.has_who_checklist} />
                <DocStatus label="Anesthesia Record" done={surgeryCase.has_anesthesia_record} />
                <DocStatus label="Operative Note" done={surgeryCase.has_operative_note} />
                <DocStatus label="PACU Record" done={surgeryCase.has_pacu_record} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pre-op" className="space-y-6">
          <PreOpWorkspace surgeryCase={surgeryCase} onCaseRefresh={fetchCase} />
        </TabsContent>

        <TabsContent value="intra-op" className="space-y-6">
          <IntraOpWorkspace surgeryCase={surgeryCase} onCaseRefresh={fetchCase} />
        </TabsContent>

        <TabsContent value="post-op" className="space-y-6">
          <PostOpWorkspace surgeryCase={surgeryCase} onCaseRefresh={fetchCase} />
        </TabsContent>
      </Tabs>

      {/* Cancellation Details */}
      {surgeryCase.status === 'CANCELLED' && surgeryCase.cancellation_reason && (
        <Card className="border-destructive/50">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-destructive">Cancellation Reason</p>
            <p className="text-sm mt-1">{surgeryCase.cancellation_reason}</p>
          </CardContent>
        </Card>
      )}

      {surgeryCase.status === 'POSTPONED' && surgeryCase.postponed_to_date && (
        <Card className="border-amber-500/50">
          <CardContent className="p-4 flex items-center gap-2">
            <CalendarX2 className="h-4 w-4 text-amber-600" />
            <p className="text-sm">Postponed to <strong>{surgeryCase.postponed_to_date}</strong></p>
          </CardContent>
        </Card>
      )}

      {/* Cancel Dialog */}
      <Dialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Surgery Case</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Reason for cancellation..."
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog(false)}>Keep Case</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={!cancelReason.trim() || actionLoading}>
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TeamAssignmentDialog
        open={assignmentDialog}
        onOpenChange={(open) => {
          setAssignmentDialog(open);
          if (!open) resetTeamAssignmentForm();
        }}
        staffPickerOpen={staffPickerOpen}
        onStaffPickerOpenChange={setStaffPickerOpen}
        staffSearch={staffSearch}
        onStaffSearchChange={setStaffSearch}
        staffResults={staffResults}
        staffResultsLoading={staffResultsLoading}
        selectedStaffId={selectedStaffId}
        onSelectedStaffIdChange={setSelectedStaffId}
        selectedRole={selectedRole}
        onSelectedRoleChange={setSelectedRole}
        teamNotes={teamNotes}
        onTeamNotesChange={setTeamNotes}
        onSubmit={handleAssignTeamMember}
        submitting={teamMutationLoading}
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right truncate">{value}</span>
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
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="min-w-0">
        <p className="truncate">{member.staff_name}</p>
        {coverage && (
          <p className={`text-xs ${coverage.has_shift_coverage ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-300'}`}>
            {coverage.message}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {coverage && (
          <Badge className={coverage.has_shift_coverage ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 text-xs' : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300 text-xs'}>
            {coverage.has_shift_coverage ? 'Covered' : 'Uncovered'}
          </Badge>
        )}
        <Badge variant="outline" className="text-xs">
          {member.role.replace(/_/g, ' ')}
        </Badge>
        {canManageTeam ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            disabled={removing}
            aria-label={`Remove ${member.staff_name} from team`}
          >
            {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function DocStatus({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      {done ? (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 text-xs">Complete</Badge>
      ) : (
        <Badge variant="outline" className="text-xs text-muted-foreground">Pending</Badge>
      )}
    </div>
  );
}
