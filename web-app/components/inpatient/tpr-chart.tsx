'use client';

import { useMemo, useState } from 'react';
import { Plus, Thermometer } from 'lucide-react';
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { HelpPopover } from '@/components/shared/help-popover';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  useTemperatureReadings,
  useCreateTemperatureReading,
} from '@/lib/hooks/use-inpatient';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';
import { getAgeGroupFromYears, getVitalRangeHint, getVitalPlaceholder, isPediatric, type AgeGroup } from '@/lib/vitals';
import type { TemperatureReading } from '@/lib/types/inpatient';

const chartConfig: ChartConfig = {
  temperature: { label: 'Temperature (°C)', color: 'hsl(var(--chart-1))' },
  pulse: { label: 'Pulse (BPM)', color: 'hsl(var(--chart-2))' },
  respiratory_rate: { label: 'Resp Rate', color: 'hsl(var(--chart-3))' },
};

interface TPRChartProps {
  admissionId: number;
  isActive: boolean;
  /** Patient age in years for age-adjusted reference lines */
  patientAge?: number | null;
}

/** Get temperature reference lines adjusted for age group */
function getTempReferenceLines(ageGroup: AgeGroup | null) {
  if (ageGroup === 'neonate') {
    return { febrile: 37.5, low: 36.0 };
  }
  if (ageGroup === 'infant') {
    return { febrile: 37.5, low: 36.0 };
  }
  // Default (adult/older children)
  return { febrile: 37.5, low: 36.1 };
}

export function TPRChart({ admissionId, isActive, patientAge }: TPRChartProps) {
  const { toast } = useToast();
  const { data, isLoading } = useTemperatureReadings(admissionId);
  const createReading = useCreateTemperatureReading();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Age group for paediatric-adjusted ranges
  const ageGroup = useMemo(() => (patientAge != null ? getAgeGroupFromYears(patientAge) : null), [patientAge]);
  const tempRefLines = useMemo(() => getTempReferenceLines(ageGroup), [ageGroup]);

  // Form state
  const [temperature, setTemperature] = useState('');
  const [pulse, setPulse] = useState('');
  const [respiratoryRate, setRespiratoryRate] = useState('');
  const [notes, setNotes] = useState('');

  const readings = data?.results ?? [];
  const recentReadings = readings.slice(0, 10);

  // Chart data: reverse to show chronological order (oldest first)
  const chartData = [...readings].reverse().map((r) => ({
    time: formatDateTime(r.recorded_at),
    temperature: Number(r.temperature),
    pulse: r.pulse ?? undefined,
    respiratory_rate: r.respiratory_rate ?? undefined,
  }));

  const handleSubmit = async () => {
    const tempValue = parseFloat(temperature);
    if (isNaN(tempValue) || tempValue < 30 || tempValue > 45) {
      toast({ title: 'Invalid temperature', description: 'Enter a value between 30°C and 45°C', variant: 'destructive' });
      return;
    }

    const pulseValue = pulse ? parseInt(pulse, 10) : undefined;
    if (pulseValue !== undefined && (pulseValue < 0 || pulseValue > 250)) {
      toast({ title: 'Invalid pulse', description: 'Enter a value between 0 and 250 BPM', variant: 'destructive' });
      return;
    }

    const rrValue = respiratoryRate ? parseInt(respiratoryRate, 10) : undefined;
    if (rrValue !== undefined && (rrValue < 0 || rrValue > 80)) {
      toast({ title: 'Invalid respiratory rate', description: 'Enter a value between 0 and 80', variant: 'destructive' });
      return;
    }

    try {
      await createReading.mutateAsync({
        admission: admissionId,
        recorded_at: new Date().toISOString(),
        temperature: tempValue,
        pulse: pulseValue,
        respiratory_rate: rrValue,
        notes: notes || undefined,
      });
      toast({ title: 'TPR reading recorded' });
      setDialogOpen(false);
      resetForm();
    } catch {
      toast({ title: 'Error', description: 'Failed to record TPR reading', variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setTemperature('');
    setPulse('');
    setRespiratoryRate('');
    setNotes('');
  };

  if (isLoading) {
    return <Skeleton className="h-96" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">TPR Chart</h3>
          <HelpPopover content="Temperature, Pulse, and Respiration (TPR) chart. Track trends over time based on the Kenya hospital observation chart form." />
        </div>
        {isActive && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-1.5" />
                Record TPR
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <DialogTitle>Record TPR Reading</DialogTitle>
                  {ageGroup && isPediatric(ageGroup) && (
                    <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 dark:text-blue-400">
                      Paediatric
                    </Badge>
                  )}
                </div>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="temp">Temperature (°C) *</Label>
                    <Input
                      id="temp"
                      type="number"
                      step="0.1"
                      min="30"
                      max="45"
                      placeholder={getVitalPlaceholder('temperature', ageGroup)}
                      value={temperature}
                      onChange={(e) => setTemperature(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">{getVitalRangeHint('temperature', ageGroup)}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pulse">Pulse (BPM)</Label>
                    <Input
                      id="pulse"
                      type="number"
                      min="0"
                      max="250"
                      placeholder={getVitalPlaceholder('pulse', ageGroup)}
                      value={pulse}
                      onChange={(e) => setPulse(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">{getVitalRangeHint('pulse', ageGroup)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="rr">Respiratory Rate</Label>
                    <Input
                      id="rr"
                      type="number"
                      min="0"
                      max="80"
                      placeholder={getVitalPlaceholder('respiratory_rate', ageGroup)}
                      value={respiratoryRate}
                      onChange={(e) => setRespiratoryRate(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">{getVitalRangeHint('respiratory_rate', ageGroup)}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Input
                      id="notes"
                      placeholder="Additional observations"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
                <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={createReading.isPending}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={createReading.isPending || !temperature}>
                  {createReading.isPending ? 'Saving...' : 'Save Reading'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {readings.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Thermometer className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No TPR readings recorded yet.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Temperature Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
                <LineChart accessibilityLayer data={chartData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="time"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    className="text-xs fill-muted-foreground"
                    tickFormatter={(v) => {
                      const parts = v.split(' ');
                      return parts.length > 1 ? parts[1] : v;
                    }}
                  />
                  <YAxis
                    yAxisId="temp"
                    tickLine={false}
                    axisLine={false}
                    domain={[35, 42]}
                    className="text-xs fill-muted-foreground"
                    width={40}
                    tickFormatter={(v: number) => `${v}°`}
                  />
                  <YAxis
                    yAxisId="vitals"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 'auto']}
                    className="text-xs fill-muted-foreground"
                    width={40}
                  />
                  <ReferenceLine yAxisId="temp" y={tempRefLines.febrile} stroke="hsl(var(--destructive))" strokeDasharray="3 3" label="Febrile" />
                  <ReferenceLine yAxisId="temp" y={tempRefLines.low} stroke="hsl(var(--chart-4))" strokeDasharray="3 3" label="Low" />
                  <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line
                    yAxisId="temp"
                    dataKey="temperature"
                    type="monotone"
                    stroke="var(--color-temperature)"
                    strokeWidth={2}
                    dot={{ fill: 'var(--color-temperature)', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    yAxisId="vitals"
                    dataKey="pulse"
                    type="monotone"
                    stroke="var(--color-pulse)"
                    strokeWidth={2}
                    dot={{ fill: 'var(--color-pulse)', r: 3 }}
                  />
                  <Line
                    yAxisId="vitals"
                    dataKey="respiratory_rate"
                    type="monotone"
                    stroke="var(--color-respiratory_rate)"
                    strokeWidth={2}
                    dot={{ fill: 'var(--color-respiratory_rate)', r: 3 }}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Recent Readings Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent Readings</CardTitle>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              <ResponsiveTable
                data={recentReadings}
                keyExtractor={(item) => item.id}
                columns={[
                  {
                    key: 'recorded_at',
                    header: 'Date/Time',
                    sortable: true,
                    sortType: 'date' as const,
                    cell: (item: TemperatureReading) => (
                      <span className="whitespace-nowrap">{formatDateTime(item.recorded_at)}</span>
                    ),
                  },
                  {
                    key: 'temperature',
                    header: 'Temp (°C)',
                    sortable: true,
                    sortType: 'number' as const,
                    cell: (item: TemperatureReading) => (
                      <div>
                        <span className={item.is_febrile ? 'text-destructive font-semibold' : item.is_hypothermic ? 'text-blue-600 font-semibold' : ''}>
                          {Number(item.temperature).toFixed(1)}°C
                        </span>
                        {item.is_febrile && <Badge variant="destructive" className="ml-1 text-xs">Febrile</Badge>}
                      </div>
                    ),
                  },
                  {
                    key: 'pulse',
                    header: 'Pulse',
                    sortable: true,
                    sortType: 'number' as const,
                    cell: (item: TemperatureReading) => item.pulse ?? '—',
                  },
                  {
                    key: 'respiratory_rate',
                    header: 'RR',
                    sortable: true,
                    sortType: 'number' as const,
                    cell: (item: TemperatureReading) => item.respiratory_rate ?? '—',
                  },
                  {
                    key: 'recorded_by_username',
                    header: 'By',
                    className: 'text-muted-foreground',
                    cell: (item: TemperatureReading) => item.recorded_by_username ?? '—',
                  },
                ]}
                mobileCard={(item: TemperatureReading) => (
                  <Card className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium whitespace-nowrap">{formatDateTime(item.recorded_at)}</p>
                        <p className="text-xs text-muted-foreground mt-1">Recorded by {item.recorded_by_username ?? '—'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={item.is_febrile ? 'text-destructive font-semibold' : item.is_hypothermic ? 'text-blue-600 font-semibold' : 'font-semibold'}>
                          {Number(item.temperature).toFixed(1)}°C
                        </p>
                        {item.is_febrile && <Badge variant="destructive" className="mt-1 text-xs">Febrile</Badge>}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Pulse:</span> {item.pulse ?? '—'}
                      </div>
                      <div>
                        <span className="text-muted-foreground">RR:</span> {item.respiratory_rate ?? '—'}
                      </div>
                    </div>
                  </Card>
                )}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
