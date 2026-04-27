'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AlertTriangle, Plus, Syringe } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getApiErrorMessage } from '@/lib/api/client';
import { theatreApi } from '@/lib/api/theatre';
import { useToast } from '@/lib/hooks/use-toast';
import {
  getVitalAlert,
  getVitalStatus,
  getNormalRange,
  vitalInputClass,
} from '@/lib/vitals-thresholds';

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

const intraOpVitalSchema = z.object({
  recorded_at: z.string().min(1, 'Recording time is required'),
  systolic_bp: z.coerce.number().nullable().optional(),
  diastolic_bp: z.coerce.number().nullable().optional(),
  heart_rate: z.coerce.number().nullable().optional(),
  respiratory_rate: z.coerce.number().nullable().optional(),
  spo2: z.coerce.number().nullable().optional(),
  etco2: z.coerce.number().nullable().optional(),
  fio2: z.coerce.number().nullable().optional(),
  tidal_volume: z.coerce.number().nullable().optional(),
  peak_pressure: z.coerce.number().nullable().optional(),
  temperature: z.string().default(''),
  cvp: z.coerce.number().nullable().optional(),
  bis_index: z.coerce.number().nullable().optional(),
  tof_count: z.coerce.number().nullable().optional(),
  blood_glucose: z.coerce.number().nullable().optional(),
  pain_score: z.coerce.number().nullable().optional(),
  notes: z.string().default(''),
});

type IntraOpVitalValues = z.infer<typeof intraOpVitalSchema>;

interface VitalsEntryFormProps {
  caseNumber: string;
  onVitalAdded: () => void | Promise<void>;
}

export function VitalsEntryForm({ caseNumber, onVitalAdded }: VitalsEntryFormProps) {
  const { toast } = useToast();

  const form = useForm<IntraOpVitalValues>({
    resolver: zodResolver(intraOpVitalSchema),
    defaultValues: {
      recorded_at: toDateTimeLocalValue(new Date().toISOString()),
      systolic_bp: undefined,
      diastolic_bp: undefined,
      heart_rate: undefined,
      respiratory_rate: undefined,
      spo2: undefined,
      etco2: undefined,
      fio2: undefined,
      tidal_volume: undefined,
      peak_pressure: undefined,
      temperature: '',
      cvp: undefined,
      bis_index: undefined,
      tof_count: undefined,
      blood_glucose: undefined,
      pain_score: undefined,
      notes: '',
    },
  });

  const onSubmit = async (values: IntraOpVitalValues) => {
    try {
      await theatreApi.addIntraOpVital(caseNumber, {
        ...values,
        recorded_at: toIsoOrUndefined(values.recorded_at),
        temperature: values.temperature || undefined,
      });
      toast({
        title: 'Intra-op vital saved',
        description: 'The anesthesia trend chart has been updated.',
      });
      form.reset({
        ...form.getValues(),
        recorded_at: toDateTimeLocalValue(new Date().toISOString()),
        notes: '',
      });
      await onVitalAdded();
    } catch (error) {
      toast({
        title: 'Unable to save vital',
        description: getApiErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const watchedValues = form.watch();

  // Collect all current inline alerts for a summary banner
  const thresholdFields = [
    'heart_rate', 'spo2', 'systolic_bp', 'diastolic_bp',
    'respiratory_rate', 'etco2',
  ] as const;
  const activeAlerts = thresholdFields
    .map((f) => getVitalAlert(f, watchedValues[f] as number | null | undefined))
    .filter(Boolean) as string[];

  const numericField = (
    name: keyof IntraOpVitalValues,
    label: string,
    opts?: { step?: string; thresholdKey?: string }
  ) => {
    const thresholdKey = opts?.thresholdKey ?? name;
    return (
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => {
          const numVal = (field.value as number | null | undefined) ?? null;
          const status = getVitalStatus(thresholdKey, numVal);
          const alert = getVitalAlert(thresholdKey, numVal);
          const range = getNormalRange(thresholdKey);
          return (
            <FormItem>
              <FormLabel className="flex items-center gap-1.5">
                {label}
                {status === 'critical' && (
                  <span className="text-red-500 text-[10px] font-bold">CRITICAL</span>
                )}
                {status === 'warning' && (
                  <span className="text-amber-500 text-[10px] font-bold">WARNING</span>
                )}
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step={opts?.step}
                  className={vitalInputClass(thresholdKey, numVal)}
                  value={numVal ?? ''}
                  onChange={(e) =>
                    field.onChange(e.target.value ? Number(e.target.value) : undefined)
                  }
                />
              </FormControl>
              {alert && (
                <p className={`text-[11px] leading-tight ${status === 'critical' ? 'text-red-600' : 'text-amber-600'}`}>
                  {alert}
                </p>
              )}
              {!alert && range && numVal != null && (
                <p className="text-[11px] leading-tight text-muted-foreground">
                  Normal: {range}
                </p>
              )}
              <FormMessage />
            </FormItem>
          );
        }}
      />
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Syringe className="h-4 w-4" />
          Record Vital Reading
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <FormField
                control={form.control}
                name="recorded_at"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recorded at</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {numericField('heart_rate', 'HR (bpm)')}
              {numericField('spo2', 'SpO2 (%)', { step: '0.1' })}
              {numericField('systolic_bp', 'Systolic BP')}
              {numericField('diastolic_bp', 'Diastolic BP')}
              {numericField('respiratory_rate', 'Resp Rate')}
              {numericField('etco2', 'EtCO2')}
              {numericField('fio2', 'FiO2 (%)', { step: '0.1' })}
              {numericField('tidal_volume', 'Tidal Vol (mL)')}
              {numericField('peak_pressure', 'Peak Press (cmH2O)')}
              {numericField('cvp', 'CVP (cmH2O)')}
              {numericField('bis_index', 'BIS Index')}
              {numericField('tof_count', 'TOF Count')}
              {numericField('blood_glucose', 'Glucose (mmol/L)', { step: '0.1' })}
              {numericField('pain_score', 'Pain Score (0-10)')}
              <FormField
                control={form.control}
                name="temperature"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temp (°C)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Inline alert summary — shown when any threshold-monitored value is out of range */}
            {activeAlerts.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc pl-4 text-sm space-y-0.5">
                    {activeAlerts.map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <Button type="submit">
              <Plus className="h-4 w-4 mr-2" />
              Add vital reading
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
