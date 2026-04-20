'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
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
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
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
import type { SurgeryCaseDetail, SurgicalTeamMember } from '@/lib/types/theatre';

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  PRE_OP: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  IN_THEATRE: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  IN_SURGERY: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  IN_PACU: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  DISCHARGED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  POSTPONED: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  CANCELLED: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};

const STATUS_FLOW: Record<string, { label: string; action: string; icon: React.ElementType }> = {
  REQUESTED: { label: 'Schedule', action: 'schedule', icon: Clock },
  SCHEDULED: { label: 'Start Pre-Op', action: 'startPreOp', icon: Play },
  PRE_OP: { label: 'Enter Theatre', action: 'enterTheatre', icon: DoorOpen },
  IN_THEATRE: { label: 'Start Surgery', action: 'startSurgery', icon: Scissors },
  IN_SURGERY: { label: 'End Surgery', action: 'endSurgery', icon: Square },
  IN_PACU: { label: 'Discharge', action: 'dischargeCase', icon: ChevronRight },
};

export default function CaseDetailPage() {
  const { caseNumber } = useParams<{ caseNumber: string }>();
  const router = useRouter();
  const [surgeryCase, setSurgeryCase] = useState<SurgeryCaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const fetchCase = useCallback(async () => {
    if (!caseNumber) return;
    try {
      setLoading(true);
      // Fetch by case number — API allows looking up by case_number via list + filter
      const data = await theatreApi.listCases({ search: caseNumber });
      const found = data.results.find(c => c.case_number === caseNumber);
      if (found) {
        const detail = await theatreApi.getCase(found.id);
        setSurgeryCase(detail);
      }
    } catch {
      // not found
    } finally {
      setLoading(false);
    }
  }, [caseNumber]);

  useEffect(() => { fetchCase(); }, [fetchCase]);

  const runAction = async (action: string) => {
    if (!surgeryCase) return;
    try {
      setActionLoading(true);
      const id = surgeryCase.id;
      switch (action) {
        case 'schedule':
          await theatreApi.scheduleCase(id, { scheduled_date: surgeryCase.scheduled_date, scheduled_start_time: surgeryCase.scheduled_start_time });
          break;
        case 'startPreOp':
          await theatreApi.startPreOp(id);
          break;
        case 'enterTheatre':
          await theatreApi.enterTheatre(id);
          break;
        case 'startSurgery':
          await theatreApi.startSurgery(id);
          break;
        case 'endSurgery':
          await theatreApi.endSurgery(id);
          break;
        case 'dischargeCase':
          await theatreApi.dischargeCase(id);
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
      await theatreApi.cancelCase(surgeryCase.id, { reason: cancelReason });
      setCancelDialog(false);
      setCancelReason('');
      await fetchCase();
    } catch {
      // error
    } finally {
      setActionLoading(false);
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
          {surgeryCase.priority !== 'ELECTIVE' && (
            <Badge className={`text-xs ${surgeryCase.priority === 'EMERGENCY' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'}`}>
              {surgeryCase.priority === 'EMERGENCY' && <AlertTriangle className="h-3 w-3 mr-1" />}
              {surgeryCase.priority}
            </Badge>
          )}
          <Badge className={`${STATUS_COLORS[surgeryCase.status] || ''} text-xs`}>
            {surgeryCase.status.replace(/_/g, ' ')}
          </Badge>
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

      {/* Detail Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Clinical Info */}
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

        {/* Billing */}
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

        {/* Team */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Surgical Team
              <Badge variant="secondary" className="text-xs ml-auto">{surgeryCase.team_members.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {surgeryCase.team_members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No team members assigned yet.</p>
            ) : (
              <div className="space-y-2">
                {surgeryCase.team_members.map(m => (
                  <TeamMemberRow key={m.id} member={m} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Documentation Status */}
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

function TeamMemberRow({ member }: { member: SurgicalTeamMember }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="truncate">{member.staff_name}</span>
      <Badge variant="outline" className="text-xs shrink-0 ml-2">
        {member.role.replace(/_/g, ' ')}
      </Badge>
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
