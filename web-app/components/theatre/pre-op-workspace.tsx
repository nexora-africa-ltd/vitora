'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  FlaskConical,
  Loader2,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Syringe,
  Trash2,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { staffApi } from '@/lib/api/rbac';
import { getApiErrorMessage } from '@/lib/api/client';
import { laboratoryApi } from '@/lib/api/laboratory';
import { proceduresApi } from '@/lib/api/procedures';
import { theatreApi } from '@/lib/api/theatre';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { TEAM_ROLES } from '@/lib/schemas/theatre.schema';
import {
  getTeamAssignmentErrorMessage,
  TeamAssignmentDialog,
  TEAM_ROLE_LABELS,
} from '@/components/theatre/team-assignment-dialog';
import { useToast } from '@/lib/hooks/use-toast';
import type { LabOrder } from '@/lib/types/laboratory';
import type { ProcedureCatalogDetail, ProcedureOrder } from '@/lib/types/procedure';
import type { StaffProfile } from '@/lib/types/rbac';
import type {
  AnesthesiaRecord,
  CaseSchedulingContext,
  SurgeryCaseDetail,
  SurgicalTeamMember,
  WHOChecklist,
} from '@/lib/types/theatre';

const consentFormSchema = z.object({
  consent_text: z.string().min(10, 'Consent text is required'),
  procedure_explained: z.boolean().default(true),
  risks_explained: z.boolean().default(true),
  alternatives_explained: z.boolean().default(true),
  questions_answered: z.boolean().default(true),
  signed_by_patient: z.boolean().default(true),
  patient_signature: z.string().min(2, 'Patient signature or typed name is required'),
  signed_by_guardian: z.boolean().default(false),
  guardian_name: z.string().default(''),
  guardian_relationship: z.string().default(''),
  guardian_id_number: z.string().default(''),
  guardian_signature: z.string().default(''),
  witness_required: z.boolean().default(false),
  witness_name: z.string().default(''),
  witness_signature: z.string().default(''),
});

const whoSignInSchema = z.object({
  patient_identity_confirmed: z.boolean().default(false),
  procedure_site_marked: z.boolean().default(false),
  consent_signed: z.boolean().default(false),
  anesthesia_machine_checked: z.boolean().default(false),
  pulse_oximeter_attached: z.boolean().default(false),
  allergies_reviewed: z.boolean().default(false),
  allergy_notes: z.string().default(''),
  difficult_airway_risk: z.boolean().default(false),
  aspiration_risk: z.boolean().default(false),
  airway_equipment_available: z.boolean().default(false),
  blood_loss_risk: z.string().default(''),
  iv_access_adequate: z.boolean().default(false),
  blood_products_available: z.boolean().default(false),
});

const anesthesiaPreOpSchema = z.object({
  anesthesiologist: z.coerce.number().int().positive('Anesthesiologist user ID is required'),
  mallampati_class: z.string().default(''),
  mouth_opening: z.string().default(''),
  neck_mobility: z.string().default(''),
  dentition_notes: z.string().default(''),
  last_solid_food: z.string().default(''),
  last_clear_fluids: z.string().default(''),
  npo_confirmed: z.boolean().default(false),
  premedication_given: z.string().default(''),
  anesthesia_consent_obtained: z.boolean().default(false),
  risks_explained: z.boolean().default(false),
});

type ConsentFormValues = z.infer<typeof consentFormSchema>;
type WHOSignInFormValues = z.infer<typeof whoSignInSchema>;
type AnesthesiaPreOpFormValues = z.infer<typeof anesthesiaPreOpSchema>;

type PreOpCheck = {
  label: string;
  complete: boolean;
  detail: string;
};

function toDateTimeLocalValue(value?: string | null): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (part: number) => part.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoOrUndefined(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function getLinkedProcedureOrder(
  surgeryCase: SurgeryCaseDetail,
  orders: Array<{ id: number; procedure: number; scheduled_date: string | null; encounter?: number | null }>
) {
  const exactEncounterAndProcedure = orders.find(
    (order) =>
      order.procedure === surgeryCase.primary_procedure &&
      surgeryCase.encounter != null &&
      order.encounter === surgeryCase.encounter
  );

  if (exactEncounterAndProcedure) {
    return exactEncounterAndProcedure;
  }

  const exactProcedure = orders.find(
    (order) =>
      order.procedure === surgeryCase.primary_procedure &&
      order.scheduled_date === surgeryCase.scheduled_date
  );

  if (exactProcedure) {
    return exactProcedure;
  }

  return orders.find((order) => order.procedure === surgeryCase.primary_procedure) ?? orders[0] ?? null;
}

export function PreOpReadinessCard({
  consentReady,
  labsReady,
  whoReady,
  anesthesiaReady,
  labOrders,
}: {
  consentReady: boolean;
  labsReady: boolean;
  whoReady: boolean;
  anesthesiaReady: boolean;
  labOrders: LabOrder[];
}) {
  const checks: PreOpCheck[] = [
    {
      label: 'Surgical consent',
      complete: consentReady,
      detail: consentReady ? 'Signed and linked to the procedure order.' : 'Consent is still pending or not linked.',
    },
    {
      label: 'Pre-op labs',
      complete: labsReady,
      detail:
        labOrders.length === 0
          ? 'No encounter lab orders are linked to this case.'
          : labsReady
            ? 'All linked lab orders are completed.'
            : 'Some linked lab orders are still pending.',
    },
    {
      label: 'WHO Sign-In',
      complete: whoReady,
      detail: whoReady ? 'WHO Sign-In is complete.' : 'WHO Sign-In still needs completion.',
    },
    {
      label: 'Anesthesia assessment',
      complete: anesthesiaReady,
      detail: anesthesiaReady ? 'Assessment captured with NPO confirmation.' : 'Assessment is missing or NPO is not confirmed.',
    },
  ];
  const readyForTheatre = checks.every((check) => check.complete);

  return (
    <Card className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
        aria-hidden="true"
      />
      <CardHeader className="relative pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Pre-Op Readiness
          <Badge variant={readyForTheatre ? 'success' : 'warning'} size="sm" className="ml-auto w-fit">
            {readyForTheatre ? 'Ready for theatre' : 'Needs attention'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="relative space-y-3">
        {checks.map((check) => (
          <div key={check.label} className="flex items-start justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{check.label}</p>
              <p className="text-xs text-muted-foreground">{check.detail}</p>
            </div>
            <Badge variant={check.complete ? 'success' : 'outline'} size="sm" className="shrink-0 w-fit">
              {check.complete ? 'Complete' : 'Pending'}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function PreOpWorkspace({
  surgeryCase,
  onCaseRefresh,
}: {
  surgeryCase: SurgeryCaseDetail;
  onCaseRefresh?: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [procedureOrder, setProcedureOrder] = useState<ProcedureOrder | null>(null);
  const [procedureCatalog, setProcedureCatalog] = useState<ProcedureCatalogDetail | null>(null);
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [whoChecklist, setWhoChecklist] = useState<WHOChecklist | null>(null);
  const [anesthesiaRecord, setAnesthesiaRecord] = useState<AnesthesiaRecord | null>(null);
  const [schedulingContext, setSchedulingContext] = useState<CaseSchedulingContext | null>(null);
  const [creatingLinkedOrder, setCreatingLinkedOrder] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);
  const [signingConsent, setSigningConsent] = useState(false);
  const [savingWho, setSavingWho] = useState(false);
  const [savingAnesthesia, setSavingAnesthesia] = useState(false);
  const [assignmentDialog, setAssignmentDialog] = useState(false);
  const [staffSearch, setStaffSearch] = useState('');
  const [staffResults, setStaffResults] = useState<StaffProfile[]>([]);
  const [staffResultsLoading, setStaffResultsLoading] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState<(typeof TEAM_ROLES)[number] | ''>('');
  const [teamNotes, setTeamNotes] = useState('');
  const [staffPickerOpen, setStaffPickerOpen] = useState(false);
  const [teamMutationLoading, setTeamMutationLoading] = useState(false);

  const consentForm = useForm<ConsentFormValues>({
    resolver: zodResolver(consentFormSchema),
    defaultValues: {
      consent_text: '',
      procedure_explained: true,
      risks_explained: true,
      alternatives_explained: true,
      questions_answered: true,
      signed_by_patient: true,
      patient_signature: '',
      signed_by_guardian: false,
      guardian_name: '',
      guardian_relationship: '',
      guardian_id_number: '',
      guardian_signature: '',
      witness_required: false,
      witness_name: '',
      witness_signature: '',
    },
  });

  const whoForm = useForm<WHOSignInFormValues>({
    resolver: zodResolver(whoSignInSchema),
    defaultValues: {
      patient_identity_confirmed: false,
      procedure_site_marked: false,
      consent_signed: false,
      anesthesia_machine_checked: false,
      pulse_oximeter_attached: false,
      allergies_reviewed: false,
      allergy_notes: '',
      difficult_airway_risk: false,
      aspiration_risk: false,
      airway_equipment_available: false,
      blood_loss_risk: '',
      iv_access_adequate: false,
      blood_products_available: false,
    },
  });

  const anesthesiaForm = useForm<AnesthesiaPreOpFormValues>({
    resolver: zodResolver(anesthesiaPreOpSchema),
    defaultValues: {
      anesthesiologist: surgeryCase.requesting_doctor,
      mallampati_class: '',
      mouth_opening: '',
      neck_mobility: '',
      dentition_notes: '',
      last_solid_food: '',
      last_clear_fluids: '',
      npo_confirmed: false,
      premedication_given: '',
      anesthesia_consent_obtained: false,
      risks_explained: false,
    },
  });

  const loadPreOpData = useCallback(async (showLoadingState = true) => {
    if (showLoadingState) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const procedureOrderPromise = proceduresApi.listOrders(
        surgeryCase.encounter != null
          ? {
              encounter: String(surgeryCase.encounter),
              patient: String(surgeryCase.patient),
            }
          : {
              patient: String(surgeryCase.patient),
            }
      );

      const [catalogEntry, orderListing, linkedLabOrders, checklist, anesthesia, caseSchedulingContext] = await Promise.all([
        proceduresApi.getCatalogEntry(surgeryCase.primary_procedure).catch(() => null),
        procedureOrderPromise.catch(() => null),
        (surgeryCase.encounter != null
          ? laboratoryApi.getEncounterOrders(surgeryCase.encounter)
          : laboratoryApi.getPatientOrders(surgeryCase.patient)
        ).catch(() => []),
        theatreApi.getWHOChecklist(surgeryCase.case_number).catch(() => null),
        theatreApi.getAnesthesiaRecord(surgeryCase.case_number).catch(() => null),
        theatreApi.getCaseSchedulingContext(surgeryCase.case_number).catch(() => null),
      ]);

      const linkedOrderList = orderListing?.results ?? [];
      const linkedOrderListItem = getLinkedProcedureOrder(surgeryCase, linkedOrderList);
      const linkedOrder = linkedOrderListItem
        ? await proceduresApi.getOrder(linkedOrderListItem.id).catch(() => null)
        : null;

      setProcedureCatalog((catalogEntry as ProcedureCatalogDetail | null) ?? null);
      setProcedureOrder(linkedOrder as ProcedureOrder | null);
      setLabOrders(linkedLabOrders);
      setWhoChecklist(checklist);
      setAnesthesiaRecord(anesthesia);
      setSchedulingContext(caseSchedulingContext);

      consentForm.reset({
        consent_text:
          linkedOrder?.consent?.consent_text ||
          (catalogEntry as ProcedureCatalogDetail | null)?.consent_template ||
          `I consent to ${surgeryCase.primary_procedure_name}.`,
        procedure_explained: linkedOrder?.consent?.procedure_explained ?? true,
        risks_explained: linkedOrder?.consent?.risks_explained ?? true,
        alternatives_explained: linkedOrder?.consent?.alternatives_explained ?? true,
        questions_answered: linkedOrder?.consent?.questions_answered ?? true,
        signed_by_patient: linkedOrder?.consent?.signed_by_patient ?? true,
        patient_signature: linkedOrder?.consent?.patient_signature || '',
        signed_by_guardian: linkedOrder?.consent?.signed_by_guardian ?? false,
        guardian_name: linkedOrder?.consent?.guardian_name || '',
        guardian_relationship: linkedOrder?.consent?.guardian_relationship || '',
        guardian_id_number: linkedOrder?.consent?.guardian_id_number || '',
        guardian_signature: linkedOrder?.consent?.guardian_signature || '',
        witness_required: linkedOrder?.consent?.witness_required ?? false,
        witness_name: linkedOrder?.consent?.witness_name || '',
        witness_signature: linkedOrder?.consent?.witness_signature || '',
      });

      whoForm.reset({
        patient_identity_confirmed: checklist?.patient_identity_confirmed ?? false,
        procedure_site_marked: checklist?.procedure_site_marked ?? false,
        consent_signed: checklist?.consent_signed ?? false,
        anesthesia_machine_checked: checklist?.anesthesia_machine_checked ?? false,
        pulse_oximeter_attached: checklist?.pulse_oximeter_attached ?? false,
        allergies_reviewed: checklist?.allergies_reviewed ?? false,
        allergy_notes: checklist?.allergy_notes ?? '',
        difficult_airway_risk: checklist?.difficult_airway_risk ?? false,
        aspiration_risk: checklist?.aspiration_risk ?? false,
        airway_equipment_available: checklist?.airway_equipment_available ?? false,
        blood_loss_risk: checklist?.blood_loss_risk ?? '',
        iv_access_adequate: checklist?.iv_access_adequate ?? false,
        blood_products_available: checklist?.blood_products_available ?? false,
      });

      anesthesiaForm.reset({
        anesthesiologist: anesthesia?.anesthesiologist ?? surgeryCase.requesting_doctor,
        mallampati_class: anesthesia?.mallampati_class ?? '',
        mouth_opening: anesthesia?.mouth_opening ?? '',
        neck_mobility: anesthesia?.neck_mobility ?? '',
        dentition_notes: anesthesia?.dentition_notes ?? '',
        last_solid_food: toDateTimeLocalValue(anesthesia?.last_solid_food),
        last_clear_fluids: toDateTimeLocalValue(anesthesia?.last_clear_fluids),
        npo_confirmed: anesthesia?.npo_confirmed ?? false,
        premedication_given: anesthesia?.premedication_given ?? '',
        anesthesia_consent_obtained: anesthesia?.anesthesia_consent_obtained ?? false,
        risks_explained: anesthesia?.risks_explained ?? false,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [anesthesiaForm, consentForm, surgeryCase, whoForm]);

  useEffect(() => {
    void loadPreOpData(true);
  }, [loadPreOpData]);

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
    if (!assignmentDialog) {
      return;
    }
    void loadStaffOptions(staffSearch);
  }, [assignmentDialog, loadStaffOptions, staffSearch]);

  const pendingLabOrders = useMemo(
    () => labOrders.filter((order) => order.status !== 'COMPLETED'),
    [labOrders]
  );
  const labsReady = pendingLabOrders.length === 0;
  const consentReady =
    !(procedureCatalog?.consent_required ?? true) || procedureOrder?.consent?.status === 'SIGNED';
  const whoReady = Boolean(whoChecklist?.sign_in_complete);
  const anesthesiaReady = Boolean(
    anesthesiaRecord && anesthesiaRecord.pre_op_assessment_at && anesthesiaRecord.npo_confirmed
  );
  const canManageTeam = hasPermission('theatre.manage_theatre');
  const coverageByMember = useMemo(
    () => new Map(
      (schedulingContext?.members || []).map((member) => [
        `${member.staff_member_id}:${member.role}`,
        member,
      ])
    ),
    [schedulingContext]
  );

  const refreshEverything = useCallback(async () => {
    await loadPreOpData(false);
    if (onCaseRefresh) {
      await onCaseRefresh();
    }
  }, [loadPreOpData, onCaseRefresh]);

  const resetTeamAssignmentForm = () => {
    setSelectedStaffId(null);
    setSelectedRole('');
    setTeamNotes('');
    setStaffSearch('');
    setStaffPickerOpen(false);
  };

  const handleAssignTeamMember = async () => {
    if (!selectedStaffId || !selectedRole) {
      return;
    }

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
      await refreshEverything();
    } catch (error) {
      toast({
        title: 'Assignment failed',
        description: getTeamAssignmentErrorMessage(error, 'The team member could not be assigned.'),
        variant: 'destructive',
      });
    } finally {
      setTeamMutationLoading(false);
    }
  };

  const handleRemoveTeamMember = async (memberId: number) => {
    try {
      setTeamMutationLoading(true);
      await theatreApi.removeTeamMember(surgeryCase.case_number, memberId);
      toast({
        title: 'Team member removed',
        description: 'The team assignment has been removed from the case.',
      });
      await refreshEverything();
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

  const handleCreateLinkedOrder = async () => {
    try {
      setCreatingLinkedOrder(true);
      await proceduresApi.createOrder({
        patient: surgeryCase.patient,
        procedure: surgeryCase.primary_procedure,
        encounter: surgeryCase.encounter ?? undefined,
        indication: surgeryCase.diagnosis,
        clinical_notes: surgeryCase.procedure_notes,
        laterality: surgeryCase.laterality,
        priority: surgeryCase.priority,
      });
      toast({
        title: 'Procedure order linked',
        description: 'A linked procedure order was created for consent tracking.',
      });
      await refreshEverything();
    } catch (error) {
      toast({
        title: 'Unable to create linked procedure order',
        description: getApiErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setCreatingLinkedOrder(false);
    }
  };

  const handleCreateConsent = async (values: ConsentFormValues) => {
    if (!procedureOrder) {
      toast({
        title: 'Procedure order required',
        description: 'Create a linked procedure order before capturing consent.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSavingConsent(true);
      await proceduresApi.createConsent(procedureOrder.id, values);
      if (values.signed_by_patient || values.signed_by_guardian) {
        await proceduresApi.signConsent(procedureOrder.id);
      }
      toast({
        title: 'Consent saved',
        description: values.signed_by_patient || values.signed_by_guardian
          ? 'Consent was captured and signed.'
          : 'Consent draft saved. It still needs signing.',
      });
      await refreshEverything();
    } catch (error) {
      toast({
        title: 'Unable to save consent',
        description: getApiErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setSavingConsent(false);
    }
  };

  const handleSignExistingConsent = async () => {
    if (!procedureOrder) {
      return;
    }

    try {
      setSigningConsent(true);
      await proceduresApi.signConsent(procedureOrder.id);
      toast({ title: 'Consent signed', description: 'The surgical consent is now complete.' });
      await refreshEverything();
    } catch (error) {
      toast({
        title: 'Unable to sign consent',
        description: getApiErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setSigningConsent(false);
    }
  };

  const handleSignIn = async (values: WHOSignInFormValues) => {
    try {
      setSavingWho(true);
      await theatreApi.completeSignIn(surgeryCase.case_number, values);
      toast({ title: 'WHO Sign-In saved', description: 'The sign-in checklist has been updated.' });
      await refreshEverything();
    } catch (error) {
      toast({
        title: 'Unable to save WHO Sign-In',
        description: getApiErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setSavingWho(false);
    }
  };

  const handleAnesthesiaSave = async (values: AnesthesiaPreOpFormValues) => {
    const payload = {
      ...values,
      last_solid_food: toIsoOrUndefined(values.last_solid_food),
      last_clear_fluids: toIsoOrUndefined(values.last_clear_fluids),
    };

    try {
      setSavingAnesthesia(true);
      if (anesthesiaRecord) {
        await theatreApi.updateAnesthesiaRecord(surgeryCase.case_number, payload);
      } else {
        await theatreApi.createAnesthesiaRecord(surgeryCase.case_number, payload);
      }
      toast({
        title: 'Anesthesia assessment saved',
        description: 'Pre-operative anesthesia assessment has been updated.',
      });
      await refreshEverything();
    } catch (error) {
      toast({
        title: 'Unable to save anesthesia assessment',
        description: getApiErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setSavingAnesthesia(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64 lg:col-span-2" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Pre-Operative Workflow</h2>
          <p className="text-sm text-muted-foreground">
            Capture readiness checks, surgical consent, WHO Sign-In, and anesthesia assessment.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refreshEverything()} disabled={refreshing}>
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
        </Button>
      </div>

      <PreOpReadinessCard
        consentReady={consentReady}
        labsReady={labsReady}
        whoReady={whoReady}
        anesthesiaReady={anesthesiaReady}
        labOrders={labOrders}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Surgical Team
            <Badge variant="secondary" size="sm" className="ml-auto w-fit">
              {surgeryCase.team_members.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {canManageTeam ? (
            <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Assign team members before sign-in</p>
                <p className="text-xs text-muted-foreground">Keep the pre-op roster aligned with the scheduled surgeon, anesthesia, and nursing coverage.</p>
              </div>
              <Button type="button" size="sm" onClick={() => setAssignmentDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Assign Member
              </Button>
            </div>
          ) : null}

          {surgeryCase.team_members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No team members assigned yet.</p>
          ) : (
            <div className="space-y-2">
              {surgeryCase.team_members.map((member) => (
                <PreOpTeamMemberRow
                  key={member.id}
                  member={member}
                  coverage={coverageByMember.get(`${member.staff_member}:${member.role}`) ?? null}
                  canManageTeam={canManageTeam}
                  removing={teamMutationLoading}
                  onRemove={() => handleRemoveTeamMember(member.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSignature className="h-4 w-4" />
              Surgical Consent
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {procedureCatalog?.consent_required === false ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>No written consent required</AlertTitle>
                <AlertDescription>
                  The linked procedure catalog entry does not require formal consent.
                </AlertDescription>
              </Alert>
            ) : !procedureOrder ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No linked procedure order</AlertTitle>
                <AlertDescription>
                  Theatre consent is tracked through the procedures module. Create a linked procedure order to capture and sign consent.
                </AlertDescription>
              </Alert>
            ) : procedureOrder.consent?.status === 'SIGNED' ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Consent complete</AlertTitle>
                <AlertDescription>
                  Consent was signed on {procedureOrder.consent.obtained_at ? new Date(procedureOrder.consent.obtained_at).toLocaleString() : 'this order'}.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Consent pending</AlertTitle>
                <AlertDescription>
                  Capture consent details below, then sign the consent when complete.
                </AlertDescription>
              </Alert>
            )}

            <div className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Procedure order</span>
                <Badge variant={procedureOrder ? 'info' : 'outline'} size="sm" className="w-fit">
                  {procedureOrder ? procedureOrder.order_number : 'Not linked'}
                </Badge>
              </div>
            </div>

            {!procedureOrder && (
              <Button onClick={handleCreateLinkedOrder} disabled={creatingLinkedOrder}>
                {creatingLinkedOrder && <Loader2 className="h-4 w-4 animate-spin" />}
                Create linked procedure order
              </Button>
            )}

            {procedureOrder && procedureOrder.consent?.status !== 'SIGNED' && (
              <>
                <Separator />
                <Form {...consentForm}>
                  <form className="space-y-4" onSubmit={consentForm.handleSubmit(handleCreateConsent)}>
                    <FormField
                      control={consentForm.control}
                      name="consent_text"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Consent text</FormLabel>
                          <FormControl>
                            <Textarea rows={4} placeholder="Explain the procedure, benefits, and risks..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        ['procedure_explained', 'Procedure explained'],
                        ['risks_explained', 'Risks explained'],
                        ['alternatives_explained', 'Alternatives discussed'],
                        ['questions_answered', 'Questions answered'],
                        ['signed_by_patient', 'Signed by patient'],
                        ['signed_by_guardian', 'Signed by guardian'],
                        ['witness_required', 'Witness required'],
                      ].map(([name, label]) => (
                        <FormField
                          key={name}
                          control={consentForm.control}
                          name={name as keyof ConsentFormValues}
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border p-3">
                              <FormControl>
                                <Checkbox checked={field.value as boolean} onCheckedChange={(checked) => field.onChange(checked === true)} />
                              </FormControl>
                              <FormLabel className="!mt-0">{label}</FormLabel>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        control={consentForm.control}
                        name="patient_signature"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Patient signature / typed name</FormLabel>
                            <FormControl>
                              <Input placeholder="Patient or guardian name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={consentForm.control}
                        name="guardian_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Guardian name</FormLabel>
                            <FormControl>
                              <Input placeholder="Guardian name if applicable" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={consentForm.control}
                        name="guardian_relationship"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Guardian relationship</FormLabel>
                            <FormControl>
                              <Input placeholder="Parent, spouse, sibling..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={consentForm.control}
                        name="guardian_id_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Guardian ID number</FormLabel>
                            <FormControl>
                              <Input placeholder="Guardian ID / passport" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={consentForm.control}
                        name="witness_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Witness name</FormLabel>
                            <FormControl>
                              <Input placeholder="Witness name if required" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={consentForm.control}
                        name="witness_signature"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Witness signature</FormLabel>
                            <FormControl>
                              <Input placeholder="Witness signature or typed name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button type="submit" disabled={savingConsent}>
                        {savingConsent && <Loader2 className="h-4 w-4 animate-spin" />}
                        Save consent
                      </Button>
                      {procedureOrder.consent && (
                        <Button type="button" variant="outline" onClick={handleSignExistingConsent} disabled={signingConsent}>
                          {signingConsent && <Loader2 className="h-4 w-4 animate-spin" />}
                          Sign consent
                        </Button>
                      )}
                    </div>
                  </form>
                </Form>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="h-4 w-4" />
              Pre-Op Labs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Alert>
              {labsReady ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              <AlertTitle>{labsReady ? 'Lab checks clear' : 'Lab review pending'}</AlertTitle>
              <AlertDescription>
                {labOrders.length === 0
                  ? 'No lab orders were found for the linked encounter or patient.'
                  : labsReady
                    ? 'All linked lab orders are completed and ready for review.'
                    : `${pendingLabOrders.length} lab order${pendingLabOrders.length === 1 ? '' : 's'} still need completion.`}
              </AlertDescription>
            </Alert>

            {labOrders.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No encounter lab orders found. If pre-op investigations are required, create them from the patient encounter before proceeding.
              </div>
            ) : (
              <div className="space-y-2">
                {labOrders.map((order) => {
                  const completedItems = order.items.filter((item) => item.has_result).length;
                  return (
                    <div key={order.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{order.order_number}</p>
                          <p className="text-xs text-muted-foreground">
                            {order.items.map((item) => item.test_name).join(', ') || 'No tests listed'}
                          </p>
                        </div>
                        <Badge variant={order.status === 'COMPLETED' ? 'success' : 'warning'} size="sm" className="w-fit shrink-0">
                          {order.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Results ready for {completedItems} of {order.items.length} test{order.items.length === 1 ? '' : 's'}.
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              WHO Sign-In
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...whoForm}>
              <form className="space-y-4" onSubmit={whoForm.handleSubmit(handleSignIn)}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['patient_identity_confirmed', 'Patient identity confirmed'],
                    ['procedure_site_marked', 'Procedure site marked'],
                    ['consent_signed', 'Consent signed'],
                    ['anesthesia_machine_checked', 'Anesthesia machine checked'],
                    ['pulse_oximeter_attached', 'Pulse oximeter attached'],
                    ['allergies_reviewed', 'Allergies reviewed'],
                    ['difficult_airway_risk', 'Difficult airway risk assessed'],
                    ['aspiration_risk', 'Aspiration risk assessed'],
                    ['airway_equipment_available', 'Airway equipment available'],
                    ['iv_access_adequate', 'IV access adequate'],
                    ['blood_products_available', 'Blood products available'],
                  ].map(([name, label]) => (
                    <FormField
                      key={name}
                      control={whoForm.control}
                      name={name as keyof WHOSignInFormValues}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border p-3">
                          <FormControl>
                            <Checkbox checked={field.value as boolean} onCheckedChange={(checked) => field.onChange(checked === true)} />
                          </FormControl>
                          <FormLabel className="!mt-0">{label}</FormLabel>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={whoForm.control}
                    name="blood_loss_risk"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Blood loss risk</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select risk" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="LOW">Low</SelectItem>
                            <SelectItem value="MODERATE">Moderate</SelectItem>
                            <SelectItem value="HIGH">High</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={whoForm.control}
                    name="allergy_notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Allergy notes</FormLabel>
                        <FormControl>
                          <Input placeholder="List allergies or reactions" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button type="submit" disabled={savingWho}>
                  {savingWho && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save WHO Sign-In
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Syringe className="h-4 w-4" />
              Anesthesia Pre-Op Assessment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...anesthesiaForm}>
              <form className="space-y-4" onSubmit={anesthesiaForm.handleSubmit(handleAnesthesiaSave)}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={anesthesiaForm.control}
                    name="anesthesiologist"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Anesthesiologist user ID</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormDescription>
                          Staff picker wiring can be added later, but this closes the pre-op documentation gap now.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={anesthesiaForm.control}
                    name="mallampati_class"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mallampati class</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select class" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="I">Class I</SelectItem>
                            <SelectItem value="II">Class II</SelectItem>
                            <SelectItem value="III">Class III</SelectItem>
                            <SelectItem value="IV">Class IV</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={anesthesiaForm.control}
                    name="mouth_opening"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mouth opening</FormLabel>
                        <FormControl>
                          <Input placeholder="Three fingers, limited, etc." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={anesthesiaForm.control}
                    name="neck_mobility"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Neck mobility</FormLabel>
                        <FormControl>
                          <Input placeholder="Normal, restricted, collar in situ..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={anesthesiaForm.control}
                    name="last_solid_food"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last solid food</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={anesthesiaForm.control}
                    name="last_clear_fluids"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last clear fluids</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={anesthesiaForm.control}
                  name="dentition_notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dentition notes</FormLabel>
                      <FormControl>
                        <Textarea rows={3} placeholder="Loose teeth, dentures, dentures removed..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={anesthesiaForm.control}
                  name="premedication_given"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pre-medication</FormLabel>
                      <FormControl>
                        <Textarea rows={3} placeholder="List medications and timing" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ['npo_confirmed', 'NPO confirmed'],
                    ['anesthesia_consent_obtained', 'Anesthesia consent obtained'],
                    ['risks_explained', 'Risks explained'],
                  ].map(([name, label]) => (
                    <FormField
                      key={name}
                      control={anesthesiaForm.control}
                      name={name as keyof AnesthesiaPreOpFormValues}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border p-3">
                          <FormControl>
                            <Checkbox checked={field.value as boolean} onCheckedChange={(checked) => field.onChange(checked === true)} />
                          </FormControl>
                          <FormLabel className="!mt-0">{label}</FormLabel>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>

                <Button type="submit" disabled={savingAnesthesia}>
                  {savingAnesthesia && <Loader2 className="h-4 w-4 animate-spin" />}
                  {anesthesiaRecord ? 'Update assessment' : 'Create assessment'}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      <TeamAssignmentDialog
        open={assignmentDialog}
        onOpenChange={(open) => {
          setAssignmentDialog(open);
          if (!open) {
            resetTeamAssignmentForm();
          }
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

function PreOpTeamMemberRow({
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
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
      <div className="min-w-0 space-y-1">
        <p className="font-medium">{member.staff_name}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" size="sm" className="w-fit">
            {TEAM_ROLE_LABELS[member.role as (typeof TEAM_ROLES)[number]] ?? member.role.replace(/_/g, ' ')}
          </Badge>
          {member.notes ? <span>{member.notes}</span> : null}
        </div>
        {coverage ? (
          <p className="text-xs text-muted-foreground">
            {coverage.message}
            {coverage.shift_statuses.length > 0 ? ` Shift status: ${coverage.shift_statuses.join(', ')}.` : ''}
          </p>
        ) : (
          <p className="text-xs text-amber-600">No matching shift coverage found for this assignment.</p>
        )}
      </div>
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
  );
}
