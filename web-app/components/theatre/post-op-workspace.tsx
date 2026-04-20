'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  AlertCircle,
  CheckCircle2,
  HeartPulse,
  Loader2,
  MoveRight,
  Siren,
} from 'lucide-react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { getApiErrorMessage } from '@/lib/api/client';
import { theatreApi } from '@/lib/api/theatre';
import { useToast } from '@/lib/hooks/use-toast';
import type { PACURecord, SurgeryCaseDetail } from '@/lib/types/theatre';

const pacuArrivalSchema = z.object({
  arrival_time: z.string().min(1, 'Arrival time is required'),
  arriving_nurse: z.coerce.number().int().positive('Receiving nurse user ID is required'),
  initial_aldrete_score: z.coerce.number().min(0).max(10),
  initial_pain_score: z.coerce.number().min(0).max(10).optional(),
});

const pacuVitalSchema = z.object({
  recorded_at: z.string().min(1, 'Recorded time is required'),
  recorded_by: z.coerce.number().int().positive('Recorder user ID is required'),
  systolic_bp: z.coerce.number().optional(),
  diastolic_bp: z.coerce.number().optional(),
  heart_rate: z.coerce.number().optional(),
  respiratory_rate: z.coerce.number().optional(),
  spo2: z.coerce.number().optional(),
  temperature: z.string().default(''),
  aldrete_score: z.coerce.number().min(0).max(10).optional(),
  pain_score: z.coerce.number().min(0).max(10).optional(),
  sedation_level: z.string().default(''),
  notes: z.string().default(''),
});

const pacuDischargeSchema = z.object({
  discharge_aldrete_score: z.coerce.number().min(0).max(10),
  discharge_destination: z.enum(['WARD', 'ICU', 'DAY_CASE_DISCHARGE', 'EXTENDED_OBSERVATION']),
  discharge_notes: z.string().default(''),
  confirmCaseDischarge: z.boolean().default(true),
});

function toDateTimeLocalValue(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => part.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoOrUndefined(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function PostOpWorkspace({ surgeryCase, onCaseRefresh }: { surgeryCase: SurgeryCaseDetail; onCaseRefresh?: () => Promise<void> | void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pacuRecord, setPacuRecord] = useState<PACURecord | null>(null);

  const arrivalForm = useForm<z.infer<typeof pacuArrivalSchema>>({
    resolver: zodResolver(pacuArrivalSchema),
    defaultValues: {
      arrival_time: toDateTimeLocalValue(new Date().toISOString()),
      arriving_nurse: surgeryCase.requesting_doctor,
      initial_aldrete_score: 8,
      initial_pain_score: 0,
    },
  });
  const vitalForm = useForm<z.infer<typeof pacuVitalSchema>>({
    resolver: zodResolver(pacuVitalSchema),
    defaultValues: {
      recorded_at: toDateTimeLocalValue(new Date().toISOString()),
      recorded_by: surgeryCase.requesting_doctor,
      systolic_bp: undefined,
      diastolic_bp: undefined,
      heart_rate: undefined,
      respiratory_rate: undefined,
      spo2: undefined,
      temperature: '',
      aldrete_score: 8,
      pain_score: 0,
      sedation_level: '',
      notes: '',
    },
  });
  const dischargeForm = useForm<z.infer<typeof pacuDischargeSchema>>({
    resolver: zodResolver(pacuDischargeSchema),
    defaultValues: {
      discharge_aldrete_score: 9,
      discharge_destination: 'WARD',
      discharge_notes: '',
      confirmCaseDischarge: true,
    },
  });

  const loadRecord = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true); else setRefreshing(true);
    try {
      const record = await theatreApi.getPACURecord(surgeryCase.case_number).catch(() => null);
      setPacuRecord(record);
      if (record) {
        arrivalForm.reset({
          arrival_time: toDateTimeLocalValue(record.arrival_time),
          arriving_nurse: record.arriving_nurse ?? surgeryCase.requesting_doctor,
          initial_aldrete_score: record.initial_aldrete_score ?? 8,
          initial_pain_score: record.initial_pain_score ?? 0,
        });
        dischargeForm.reset({
          discharge_aldrete_score: record.discharge_aldrete_score ?? 9,
          discharge_destination: (record.discharge_destination || 'WARD') as 'WARD' | 'ICU' | 'DAY_CASE_DISCHARGE' | 'EXTENDED_OBSERVATION',
          discharge_notes: record.discharge_notes ?? '',
          confirmCaseDischarge: true,
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [arrivalForm, dischargeForm, surgeryCase.case_number, surgeryCase.requesting_doctor]);

  useEffect(() => {
    void loadRecord(true);
  }, [loadRecord]);

  const refreshAll = useCallback(async () => {
    await loadRecord(false);
    await onCaseRefresh?.();
  }, [loadRecord, onCaseRefresh]);

  const chartData = useMemo(
    () => (pacuRecord?.vital_readings || []).map((vital) => ({
      time: new Date(vital.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      heartRate: vital.heart_rate ?? null,
      spo2: vital.spo2 ?? null,
      aldrete: vital.aldrete_score ?? null,
      pain: vital.pain_score ?? null,
    })),
    [pacuRecord]
  );

  const createArrival = async (values: z.infer<typeof pacuArrivalSchema>) => {
    try {
      await theatreApi.createPACURecord(surgeryCase.case_number, {
        arrival_time: toIsoOrUndefined(values.arrival_time),
        arriving_nurse: values.arriving_nurse,
        initial_aldrete_score: values.initial_aldrete_score,
        initial_pain_score: values.initial_pain_score,
      });
      toast({ title: 'PACU arrival recorded', description: 'Recovery monitoring can now continue in this workspace.' });
      await refreshAll();
    } catch (error) {
      toast({ title: 'Unable to create PACU record', description: getApiErrorMessage(error), variant: 'destructive' });
    }
  };

  const addVital = async (values: z.infer<typeof pacuVitalSchema>) => {
    try {
      await theatreApi.addPACUVital(surgeryCase.case_number, {
        ...values,
        recorded_at: toIsoOrUndefined(values.recorded_at),
        temperature: values.temperature || undefined,
      });
      toast({ title: 'PACU vital saved', description: 'The recovery monitoring trend has been updated.' });
      vitalForm.reset({ ...values, notes: '' });
      await refreshAll();
    } catch (error) {
      toast({ title: 'Unable to save PACU vital', description: getApiErrorMessage(error), variant: 'destructive' });
    }
  };

  const dischargePatient = async (values: z.infer<typeof pacuDischargeSchema>) => {
    try {
      await theatreApi.dischargePACU(surgeryCase.case_number, {
        discharge_aldrete_score: values.discharge_aldrete_score,
        discharge_destination: values.discharge_destination,
        discharge_notes: values.discharge_notes,
      });
      if (values.confirmCaseDischarge && surgeryCase.status === 'IN_PACU') {
        await theatreApi.dischargeCase(surgeryCase.case_number);
      }
      toast({ title: 'PACU discharge completed', description: 'Recovery discharge details were recorded.' });
      await refreshAll();
    } catch (error) {
      toast({ title: 'Unable to complete PACU discharge', description: getApiErrorMessage(error), variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-56" /><Skeleton className="h-56" /></div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Post-Operative & PACU Workflow</h2>
          <p className="text-sm text-muted-foreground">Capture PACU arrival, monitor recovery vitals, and complete discharge from recovery.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refreshAll()} disabled={refreshing}>{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}</Button>
      </div>

      {!pacuRecord ? (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><MoveRight className="h-4 w-4" />PACU Arrival</CardTitle></CardHeader>
          <CardContent>
            {surgeryCase.status !== 'IN_PACU' ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Case not yet in PACU</AlertTitle>
                <AlertDescription>Transition the case to PACU from the case workflow before creating the recovery record.</AlertDescription>
              </Alert>
            ) : null}
            <Form {...arrivalForm}>
              <form className="space-y-4" onSubmit={arrivalForm.handleSubmit(createArrival)}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField control={arrivalForm.control} name="arrival_time" render={({ field }) => <FormItem><FormLabel>Arrival time</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={arrivalForm.control} name="arriving_nurse" render={({ field }) => <FormItem><FormLabel>Receiving nurse user ID</FormLabel><FormControl><Input type="number" min={1} {...field} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={arrivalForm.control} name="initial_aldrete_score" render={({ field }) => <FormItem><FormLabel>Initial Aldrete score</FormLabel><FormControl><Input type="number" min={0} max={10} {...field} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={arrivalForm.control} name="initial_pain_score" render={({ field }) => <FormItem><FormLabel>Initial pain score</FormLabel><FormControl><Input type="number" min={0} max={10} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                </div>
                <Button type="submit">Create PACU record</Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="relative overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
              <CardHeader className="relative pb-3"><CardTitle className="text-base flex items-center gap-2"><HeartPulse className="h-4 w-4" />Recovery Status</CardTitle></CardHeader>
              <CardContent className="relative space-y-3">
                <div className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">Arrival documented</span><Badge variant="success" size="sm" className="w-fit">{new Date(pacuRecord.arrival_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Badge></div>
                <div className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">Initial Aldrete</span><Badge variant={(pacuRecord.initial_aldrete_score ?? 0) >= 8 ? 'success' : 'warning'} size="sm" className="w-fit">{pacuRecord.initial_aldrete_score ?? 'N/A'}/10</Badge></div>
                <div className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">Vitals recorded</span><Badge variant={pacuRecord.vital_readings.length > 0 ? 'info' : 'outline'} size="sm" className="w-fit">{pacuRecord.vital_readings.length}</Badge></div>
                <div className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">Discharge</span><Badge variant={pacuRecord.discharge_time ? 'success' : 'warning'} size="sm" className="w-fit">{pacuRecord.discharge_time ? 'Completed' : 'Pending'}</Badge></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Siren className="h-4 w-4" />PACU Monitoring Trend</CardTitle></CardHeader>
              <CardContent>
                {pacuRecord.vital_readings.length === 0 ? (
                  <Alert><AlertCircle className="h-4 w-4" /><AlertTitle>No PACU vitals yet</AlertTitle><AlertDescription>Add the first recovery observation below.</AlertDescription></Alert>
                ) : (
                  <div className="h-64 rounded-lg border p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="time" />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="heartRate" stroke="#ef4444" strokeWidth={2} dot={false} name="HR" />
                        <Line type="monotone" dataKey="spo2" stroke="#0ea5e9" strokeWidth={2} dot={false} name="SpO2" />
                        <Line type="monotone" dataKey="aldrete" stroke="#14b8a6" strokeWidth={2} dot={false} name="Aldrete" />
                        <Line type="monotone" dataKey="pain" stroke="#f59e0b" strokeWidth={2} dot={false} name="Pain" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><HeartPulse className="h-4 w-4" />Add PACU Vital</CardTitle></CardHeader>
              <CardContent>
                <Form {...vitalForm}>
                  <form className="space-y-4" onSubmit={vitalForm.handleSubmit(addVital)}>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <FormField control={vitalForm.control} name="recorded_at" render={({ field }) => <FormItem><FormLabel>Recorded at</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={vitalForm.control} name="recorded_by" render={({ field }) => <FormItem><FormLabel>Recorded by user ID</FormLabel><FormControl><Input type="number" min={1} {...field} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={vitalForm.control} name="heart_rate" render={({ field }) => <FormItem><FormLabel>HR</FormLabel><FormControl><Input type="number" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={vitalForm.control} name="spo2" render={({ field }) => <FormItem><FormLabel>SpO2</FormLabel><FormControl><Input type="number" step="0.1" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={vitalForm.control} name="systolic_bp" render={({ field }) => <FormItem><FormLabel>Systolic BP</FormLabel><FormControl><Input type="number" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={vitalForm.control} name="diastolic_bp" render={({ field }) => <FormItem><FormLabel>Diastolic BP</FormLabel><FormControl><Input type="number" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={vitalForm.control} name="aldrete_score" render={({ field }) => <FormItem><FormLabel>Aldrete score</FormLabel><FormControl><Input type="number" min={0} max={10} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={vitalForm.control} name="pain_score" render={({ field }) => <FormItem><FormLabel>Pain score</FormLabel><FormControl><Input type="number" min={0} max={10} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField control={vitalForm.control} name="sedation_level" render={({ field }) => <FormItem><FormLabel>Sedation level</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={vitalForm.control} name="temperature" render={({ field }) => <FormItem><FormLabel>Temperature</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                    </div>
                    <FormField control={vitalForm.control} name="notes" render={({ field }) => <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>} />
                    <Button type="submit">Add PACU vital</Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><MoveRight className="h-4 w-4" />Discharge Workflow</CardTitle></CardHeader>
              <CardContent>
                {pacuRecord.discharge_time ? (
                  <Alert><CheckCircle2 className="h-4 w-4" /><AlertTitle>Discharge already completed</AlertTitle><AlertDescription>{pacuRecord.discharge_destination ? `Destination: ${pacuRecord.discharge_destination.replace(/_/g, ' ')}` : 'Recovery discharge has already been documented.'}</AlertDescription></Alert>
                ) : (
                  <Form {...dischargeForm}>
                    <form className="space-y-4" onSubmit={dischargeForm.handleSubmit(dischargePatient)}>
                      <FormField control={dischargeForm.control} name="discharge_aldrete_score" render={({ field }) => <FormItem><FormLabel>Discharge Aldrete score</FormLabel><FormControl><Input type="number" min={0} max={10} {...field} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={dischargeForm.control} name="discharge_destination" render={({ field }) => <FormItem><FormLabel>Destination</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="WARD">Ward</SelectItem><SelectItem value="ICU">ICU</SelectItem><SelectItem value="DAY_CASE_DISCHARGE">Day Case Discharge</SelectItem><SelectItem value="EXTENDED_OBSERVATION">Extended Observation</SelectItem></SelectContent></Select><FormMessage /></FormItem>} />
                      <FormField control={dischargeForm.control} name="discharge_notes" render={({ field }) => <FormItem><FormLabel>Discharge notes</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={dischargeForm.control} name="confirmCaseDischarge" render={({ field }) => <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border p-3"><FormControl><Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} /></FormControl><FormLabel className="!mt-0">Also move case status to discharged</FormLabel></FormItem>} />
                      <Button type="submit">Complete PACU discharge</Button>
                    </form>
                  </Form>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
