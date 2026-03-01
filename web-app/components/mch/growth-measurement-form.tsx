'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { HelpPopover } from '@/components/shared/help-popover';
import { useToast } from '@/lib/hooks/use-toast';
import { growthMeasurementsApi } from '@/lib/api/mch';
import type { GrowthMeasurementCreateData } from '@/lib/types/mch';

interface GrowthMeasurementFormProps {
  patientId: number;
  /** Called after successful submission */
  onSuccess?: () => void;
  /** Called when cancel is clicked */
  onCancel?: () => void;
}

/**
 * Form to record a new growth measurement (weight, height, HC, MUAC).
 * Used on the growth chart page and as a standalone form.
 */
export function GrowthMeasurementForm({
  patientId,
  onSuccess,
  onCancel,
}: GrowthMeasurementFormProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [measurementDate, setMeasurementDate] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [headCircumference, setHeadCircumference] = useState('');
  const [muac, setMuac] = useState('');
  const [notes, setNotes] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: GrowthMeasurementCreateData) =>
      growthMeasurementsApi.create(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['growth-measurements', patientId] });
      queryClient.invalidateQueries({ queryKey: ['growth-chart-data', patientId] });

      const alerts = result.alerts || [];
      toast({
        title: 'Measurement Recorded',
        description:
          alerts.length > 0
            ? `Warning: ${alerts.join(', ')}`
            : 'Growth measurement saved and Z-scores calculated.',
        variant: alerts.length > 0 ? 'destructive' : 'default',
      });

      resetForm();
      onSuccess?.();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to record growth measurement.',
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setMeasurementDate(new Date().toISOString().split('T')[0]);
    setWeight('');
    setHeight('');
    setHeadCircumference('');
    setMuac('');
    setNotes('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!weight && !height && !headCircumference && !muac) {
      toast({
        title: 'Validation Error',
        description: 'Please enter at least one measurement.',
        variant: 'destructive',
      });
      return;
    }

    createMutation.mutate({
      patient: patientId,
      measurement_date: measurementDate,
      weight: weight ? parseFloat(weight) : undefined,
      height: height ? parseFloat(height) : undefined,
      head_circumference: headCircumference
        ? parseFloat(headCircumference)
        : undefined,
      muac: muac ? parseFloat(muac) : undefined,
      notes,
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Record Growth Measurement</CardTitle>
          <HelpPopover content="Enter the child's measurements. Z-scores are automatically calculated against WHO growth standards. MUAC is measured for children 6-59 months: SAM < 11.5cm, MAM 11.5-12.4cm." />
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Measurement Date</Label>
            <Input
              type="date"
              value={measurementDate}
              onChange={(e) => setMeasurementDate(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Weight (kg)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="50"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="e.g., 5.75"
              />
            </div>
            <div className="space-y-2">
              <Label>Height/Length (cm)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="200"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="e.g., 65.0"
              />
            </div>
            <div className="space-y-2">
              <Label>Head Circumference (cm)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="80"
                value={headCircumference}
                onChange={(e) => setHeadCircumference(e.target.value)}
                placeholder="e.g., 40.0"
              />
            </div>
            <div className="space-y-2">
              <Label>MUAC (cm)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="30"
                value={muac}
                onChange={(e) => setMuac(e.target.value)}
                placeholder="e.g., 13.5"
              />
              <p className="text-xs text-muted-foreground">
                SAM: &lt;11.5cm | MAM: 11.5–12.4cm (6–59 months)
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes about the measurement..."
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Record Measurement
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
