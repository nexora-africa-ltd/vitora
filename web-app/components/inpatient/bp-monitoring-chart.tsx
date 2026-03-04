'use client';

import { useState } from 'react';
import { Plus, HeartPulse } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { HelpPopover } from '@/components/shared/help-popover';
import {
  useBPReadings,
  useCreateBPReading,
} from '@/lib/hooks/use-inpatient';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';
import type { BPPosition } from '@/lib/types/inpatient';

const chartConfig: ChartConfig = {
  systolic: { label: 'Systolic (mmHg)', color: 'hsl(var(--chart-1))' },
  diastolic: { label: 'Diastolic (mmHg)', color: 'hsl(var(--chart-2))' },
  pulse: { label: 'Pulse (BPM)', color: 'hsl(var(--chart-3))' },
  map: { label: 'MAP (mmHg)', color: 'hsl(var(--chart-4))' },
};

const POSITIONS: { value: BPPosition; label: string }[] = [
  { value: 'SITTING', label: 'Sitting' },
  { value: 'STANDING', label: 'Standing' },
  { value: 'LYING', label: 'Lying/Supine' },
  { value: 'LEFT_LATERAL', label: 'Left Lateral' },
];

interface BPMonitoringChartProps {
  admissionId: number;
  isActive: boolean;
}

export function BPMonitoringChart({ admissionId, isActive }: BPMonitoringChartProps) {
  const { toast } = useToast();
  const { data, isLoading } = useBPReadings(admissionId);
  const createReading = useCreateBPReading();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [pulse, setPulse] = useState('');
  const [position, setPosition] = useState<BPPosition>('SITTING');
  const [arm, setArm] = useState('');
  const [notes, setNotes] = useState('');

  const readings = data?.results ?? [];

  // Chart data: reverse to show chronological order (oldest first)
  const chartData = [...readings].reverse().map((r) => ({
    time: formatDateTime(r.recorded_at),
    systolic: r.systolic,
    diastolic: r.diastolic,
    pulse: r.pulse ?? undefined,
    map: r.mean_arterial_pressure ?? undefined,
  }));

  const handleSubmit = async () => {
    const sys = parseInt(systolic);
    const dia = parseInt(diastolic);
    if (isNaN(sys) || isNaN(dia) || sys <= 0 || dia <= 0) {
      toast({ title: 'Validation Error', description: 'Enter valid systolic and diastolic values', variant: 'destructive' });
      return;
    }
    if (dia >= sys) {
      toast({ title: 'Validation Error', description: 'Diastolic must be less than systolic', variant: 'destructive' });
      return;
    }

    try {
      await createReading.mutateAsync({
        admission: admissionId,
        recorded_at: new Date().toISOString(),
        systolic: sys,
        diastolic: dia,
        pulse: pulse ? parseInt(pulse) : undefined,
        position,
        arm: arm || undefined,
        notes: notes || undefined,
      });
      toast({ title: 'BP reading recorded' });
      setDialogOpen(false);
      resetForm();
    } catch {
      toast({ title: 'Error', description: 'Failed to record BP reading', variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setSystolic('');
    setDiastolic('');
    setPulse('');
    setPosition('SITTING');
    setArm('');
    setNotes('');
  };

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">BP Monitoring Chart</h3>
          <HelpPopover content="Track blood pressure trends over time. Useful for patients with hypertension, pre-eclampsia, or post-operative BP monitoring. Shows systolic, diastolic, MAP, and pulse." />
        </div>
        {isActive && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-1.5" />
                Record BP
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Record Blood Pressure</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="systolic">Systolic (mmHg) *</Label>
                    <Input
                      id="systolic"
                      type="number"
                      min="0"
                      max="300"
                      placeholder="120"
                      value={systolic}
                      onChange={(e) => setSystolic(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="diastolic">Diastolic (mmHg) *</Label>
                    <Input
                      id="diastolic"
                      type="number"
                      min="0"
                      max="200"
                      placeholder="80"
                      value={diastolic}
                      onChange={(e) => setDiastolic(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bp-pulse">Pulse (BPM)</Label>
                    <Input
                      id="bp-pulse"
                      type="number"
                      min="0"
                      max="250"
                      placeholder="72"
                      value={pulse}
                      onChange={(e) => setPulse(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="position">Position</Label>
                    <Select value={position} onValueChange={(v) => setPosition(v as BPPosition)}>
                      <SelectTrigger id="position"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {POSITIONS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="arm">Arm</Label>
                    <Select value={arm} onValueChange={setArm}>
                      <SelectTrigger id="arm"><SelectValue placeholder="Select arm" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Left">Left</SelectItem>
                        <SelectItem value="Right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bp-notes">Notes</Label>
                    <Input
                      id="bp-notes"
                      placeholder="Symptoms, medication..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={createReading.isPending || !systolic || !diastolic}>
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
            <HeartPulse className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No blood pressure readings recorded yet.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Blood Pressure Trend</CardTitle>
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
                    yAxisId="bp"
                    tickLine={false}
                    axisLine={false}
                    domain={[40, 200]}
                    className="text-xs fill-muted-foreground"
                    width={40}
                  />
                  <YAxis
                    yAxisId="pulse"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 'auto']}
                    className="text-xs fill-muted-foreground"
                    width={40}
                  />
                  {/* Hypertension thresholds */}
                  <ReferenceLine yAxisId="bp" y={140} stroke="hsl(var(--destructive))" strokeDasharray="3 3" label="Hyp SYS" />
                  <ReferenceLine yAxisId="bp" y={90} stroke="hsl(var(--destructive))" strokeDasharray="3 3" label="Hyp DIA" />
                  {/* Hypotension threshold */}
                  <ReferenceLine yAxisId="bp" y={60} stroke="hsl(var(--chart-4))" strokeDasharray="3 3" label="Low" />
                  <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line
                    yAxisId="bp"
                    dataKey="systolic"
                    type="monotone"
                    stroke="var(--color-systolic)"
                    strokeWidth={2}
                    dot={{ fill: 'var(--color-systolic)', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    yAxisId="bp"
                    dataKey="diastolic"
                    type="monotone"
                    stroke="var(--color-diastolic)"
                    strokeWidth={2}
                    dot={{ fill: 'var(--color-diastolic)', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    yAxisId="bp"
                    dataKey="map"
                    type="monotone"
                    stroke="var(--color-map)"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    dot={{ fill: 'var(--color-map)', r: 2 }}
                    connectNulls
                  />
                  <Line
                    yAxisId="pulse"
                    dataKey="pulse"
                    type="monotone"
                    stroke="var(--color-pulse)"
                    strokeWidth={2}
                    dot={{ fill: 'var(--color-pulse)', r: 3 }}
                    connectNulls
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
              <div className="overflow-x-auto">
                <table className="min-w-[560px] w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2 font-medium">Date/Time</th>
                      <th className="p-2 font-medium">BP (mmHg)</th>
                      <th className="p-2 font-medium">MAP</th>
                      <th className="p-2 font-medium">Pulse</th>
                      <th className="p-2 font-medium">Position</th>
                      <th className="p-2 font-medium">Arm</th>
                      <th className="p-2 font-medium">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readings.slice(0, 15).map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="p-2 whitespace-nowrap">{formatDateTime(r.recorded_at)}</td>
                        <td className="p-2">
                          <span className={
                            r.is_hypertensive
                              ? 'text-destructive font-semibold'
                              : r.is_hypotensive
                                ? 'text-blue-600 font-semibold'
                                : ''
                          }>
                            {r.systolic}/{r.diastolic}
                          </span>
                          {r.is_hypertensive && (
                            <Badge variant="destructive" className="ml-1 text-xs">High</Badge>
                          )}
                          {r.is_hypotensive && (
                            <Badge variant="warning" className="ml-1 text-xs">Low</Badge>
                          )}
                        </td>
                        <td className="p-2">{r.mean_arterial_pressure ?? '—'}</td>
                        <td className="p-2">{r.pulse ?? '—'}</td>
                        <td className="p-2">{r.position_display || r.position}</td>
                        <td className="p-2">{r.arm || '—'}</td>
                        <td className="p-2 text-muted-foreground">{r.recorded_by_username}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
