/**
 * Route to Emergency Dialog
 *
 * Dialog for routing a triaged patient to an ER zone.
 * Displays available emergency areas with descriptions.
 */
'use client';

import { useState, useMemo } from 'react';
import { Siren, ArrowRight, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useUpdateTriageAssessment } from '@/lib/hooks/use-triage';
import { toast } from '@/lib/hooks/use-toast';
import type { TriageAssessment, AssignedArea } from '@/lib/types/triage';
import { EMERGENCY_AREA_OPTIONS, TRIAGE_CATEGORY_CONFIG } from '@/lib/types/triage';
import { cn } from '@/lib/utils/cn';

interface RouteToEmergencyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assessment: TriageAssessment | null;
  onSuccess?: () => void;
}

// Map category to urgency styling
const CATEGORY_URGENCY: Record<string, { bg: string; border: string; text: string }> = {
  RED: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-300 dark:border-red-700',
    text: 'text-red-700 dark:text-red-300',
  },
  ORANGE: {
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    border: 'border-orange-300 dark:border-orange-700',
    text: 'text-orange-700 dark:text-orange-300',
  },
  YELLOW: {
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    border: 'border-yellow-300 dark:border-yellow-700',
    text: 'text-yellow-700 dark:text-yellow-300',
  },
  GREEN: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-300 dark:border-green-700',
    text: 'text-green-700 dark:text-green-300',
  },
};

export function RouteToEmergencyDialog({
  open,
  onOpenChange,
  assessment,
  onSuccess,
}: RouteToEmergencyDialogProps) {
  const [selectedArea, setSelectedArea] = useState<AssignedArea | ''>('');

  // Update assessment mutation
  const { mutateAsync: updateAssessment, isPending: isRouting } = useUpdateTriageAssessment();

  // Filter areas by category recommendation
  const sortedAreas = useMemo(() => {
    const category = assessment?.triage_category;
    return [...EMERGENCY_AREA_OPTIONS].sort((a, b) => {
      // Prioritize areas that match the category
      const aMatch = a.category === category ? -1 : 0;
      const bMatch = b.category === category ? -1 : 0;
      return aMatch - bMatch;
    });
  }, [assessment?.triage_category]);

  const handleRoute = async () => {
    if (!assessment || !selectedArea) return;

    try {
      await updateAssessment({
        id: assessment.id,
        data: {
          assigned_area: selectedArea,
          // Clear clinic assignment when sending to ER
          assigned_clinic: null,
        },
      });

      toast({
        title: 'Routed to Emergency',
        description: `Patient has been routed to ${EMERGENCY_AREA_OPTIONS.find(a => a.value === selectedArea)?.label || selectedArea}.`,
      });

      setSelectedArea('');
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Failed to route to emergency:', error);
      toast({
        title: 'Error',
        description: 'Failed to route patient. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleClose = () => {
    setSelectedArea('');
    onOpenChange(false);
  };

  if (!assessment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Siren className="h-5 w-5 text-red-600" />
            Send to Emergency Area
          </DialogTitle>
          <DialogDescription>
            Select an ER zone for {assessment.patient_name || 'this patient'}.
          </DialogDescription>
        </DialogHeader>

        {/* Current category indicator */}
        <Alert className={cn(
          'border',
          CATEGORY_URGENCY[assessment.triage_category]?.border,
          CATEGORY_URGENCY[assessment.triage_category]?.bg
        )}>
          <AlertTriangle className={cn('h-4 w-4', CATEGORY_URGENCY[assessment.triage_category]?.text)} />
          <AlertDescription className={CATEGORY_URGENCY[assessment.triage_category]?.text}>
            Triage Category: <strong>{TRIAGE_CATEGORY_CONFIG[assessment.triage_category]?.label}</strong>
          </AlertDescription>
        </Alert>

        {/* Emergency area selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Select ER Zone</Label>
          <RadioGroup
            value={selectedArea}
            onValueChange={(value) => setSelectedArea(value as AssignedArea)}
            className="space-y-2"
          >
            {sortedAreas.map((area) => {
              const isRecommended = area.category === assessment.triage_category;
              const categoryColors = CATEGORY_URGENCY[area.category] || CATEGORY_URGENCY.GREEN;

              return (
                <div key={area.value} className="relative">
                  <RadioGroupItem
                    value={area.value}
                    id={area.value}
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor={area.value}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all duration-200',
                      'hover:border-primary/50 hover:bg-accent/50',
                      'peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5',
                      selectedArea === area.value && 'ring-2 ring-primary ring-offset-2 scale-[1.02] shadow-md border-primary'
                    )}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-sm">{area.label}</span>
                      {isRecommended && (
                        <span className="text-xs text-muted-foreground">
                          Recommended for {assessment.triage_category} patients
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedArea === area.value && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      )}
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs shrink-0',
                          categoryColors?.bg,
                          categoryColors?.border,
                          categoryColors?.text
                        )}
                      >
                        {area.category}
                      </Badge>
                    </div>
                  </Label>
                </div>
              );
            })}
          </RadioGroup>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={handleClose} disabled={isRouting}>
            Cancel
          </Button>
          <Button
            onClick={handleRoute}
            disabled={!selectedArea || isRouting}
            className="bg-red-600 hover:bg-red-700"
          >
            {isRouting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Routing...
              </>
            ) : (
              <>
                <ArrowRight className="h-4 w-4 mr-2" />
                Send to ER
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
