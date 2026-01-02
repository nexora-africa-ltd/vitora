'use client';

import { AlertTriangle, AlertCircle, Thermometer, Heart, Wind, Droplets, Scale, Ruler, Activity, Info, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import type { EncounterFormData, VitalAlert } from '@/lib/types/encounter-form';
import { getVitalAlerts } from '@/lib/hooks/use-encounter-form';
import { calculateBMI, getBMIColorClass } from '@/lib/utils/bmi';
import type { Patient } from '@/lib/types/patient';

interface VitalsFormProps {
  data: EncounterFormData;
  onChange: (field: keyof EncounterFormData, value: number | null) => void;
  disabled?: boolean;
  errors?: Record<string, string>;
  patient?: Patient | null;
  onNext?: () => void;
}

export function VitalsForm({ data, onChange, disabled = false, errors = {}, patient, onNext }: VitalsFormProps) {
  const alerts = getVitalAlerts(data);
  
  // Calculate age-aware BMI
  const bmiResult = calculateBMI(
    data.weight, 
    data.height, 
    patient?.date_of_birth,
    patient?.gender
  );
  
  const criticalAlerts = alerts.filter(a => a.severity === 'critical');
  const warningAlerts = alerts.filter(a => a.severity === 'warning');
  
  const getFieldStatus = (field: string) => {
    const alert = alerts.find(a => a.field === field);
    if (alert?.severity === 'critical') return 'critical';
    if (alert?.severity === 'warning') return 'warning';
    return 'normal';
  };
  
  const inputClassName = (field: string) => {
    const status = getFieldStatus(field);
    return cn(
      'pr-12', // Add padding for unit suffix
      status === 'critical' && 'border-destructive bg-destructive/5',
      status === 'warning' && 'border-amber-500 bg-amber-50 dark:bg-amber-950/20',
      errors[field] && 'border-destructive'
    );
  };
  
  // Check if any vital has been entered
  const hasAnyVitals = !!(
    data.temperature || data.pulse || data.blood_pressure_systolic || 
    data.blood_pressure_diastolic || data.respiratory_rate || 
    data.spo2 || data.weight || data.height
  );
  
  return (
    <Card className={cn(criticalAlerts.length > 0 && 'border-destructive')}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Vital Signs
          </CardTitle>
          {criticalAlerts.length > 0 && (
            <Badge variant="destructive" className="animate-pulse">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {criticalAlerts.length} Critical
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Critical alerts */}
        {criticalAlerts.length > 0 && (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-4 space-y-2">
            <div className="flex items-center gap-2 text-destructive font-medium">
              <AlertTriangle className="h-5 w-5" />
              <span>Critical Vital Sign Alerts</span>
            </div>
            <ul className="space-y-1 text-sm">
              {criticalAlerts.map((alert, i) => (
                <li key={i} className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                  <span>{alert.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Warning alerts */}
        {warningAlerts.length > 0 && (
          <div className="rounded-lg border border-amber-500 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-500 font-medium">
              <AlertCircle className="h-5 w-5" />
              <span>Abnormal Values</span>
            </div>
            <ul className="space-y-1 text-sm text-amber-800 dark:text-amber-400">
              {warningAlerts.map((alert, i) => (
                <li key={i}>{alert.message}</li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Vital sign inputs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Temperature */}
          <div className="space-y-2">
            <Label htmlFor="temperature" className="flex items-center gap-2">
              <Thermometer className="h-4 w-4" />
              Temperature
            </Label>
            <div className="relative">
              <Input
                id="temperature"
                type="number"
                step="0.1"
                min="35"
                max="45"
                placeholder="36.5"
                value={data.temperature ?? ''}
                onChange={(e) => onChange('temperature', e.target.value ? parseFloat(e.target.value) : null)}
                className={inputClassName('temperature')}
                disabled={disabled}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                °C
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Normal: 36.1-37.2°C</p>
          </div>
          
          {/* Pulse */}
          <div className="space-y-2">
            <Label htmlFor="pulse" className="flex items-center gap-2">
              <Heart className="h-4 w-4" />
              Pulse
            </Label>
            <div className="relative">
              <Input
                id="pulse"
                type="number"
                min="30"
                max="200"
                placeholder="72"
                value={data.pulse ?? ''}
                onChange={(e) => onChange('pulse', e.target.value ? parseInt(e.target.value) : null)}
                className={cn('pr-12', inputClassName('pulse'))}
                disabled={disabled}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                bpm
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Normal: 60-100 bpm</p>
          </div>
          
          {/* Blood Pressure */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Blood Pressure
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="60"
                max="250"
                placeholder="120"
                value={data.blood_pressure_systolic ?? ''}
                onChange={(e) => onChange('blood_pressure_systolic', e.target.value ? parseInt(e.target.value) : null)}
                className={cn('w-20', inputClassName('blood_pressure'))}
                disabled={disabled}
              />
              <span className="text-muted-foreground">/</span>
              <Input
                type="number"
                min="40"
                max="150"
                placeholder="80"
                value={data.blood_pressure_diastolic ?? ''}
                onChange={(e) => onChange('blood_pressure_diastolic', e.target.value ? parseInt(e.target.value) : null)}
                className={cn('w-20', inputClassName('blood_pressure'))}
                disabled={disabled}
              />
              <span className="text-sm text-muted-foreground">mmHg</span>
            </div>
            <p className="text-xs text-muted-foreground">Normal: 90/60-120/80</p>
          </div>
          
          {/* Respiratory Rate */}
          <div className="space-y-2">
            <Label htmlFor="respiratory_rate" className="flex items-center gap-2">
              <Wind className="h-4 w-4" />
              Respiratory Rate
            </Label>
            <div className="relative">
              <Input
                id="respiratory_rate"
                type="number"
                min="8"
                max="40"
                placeholder="16"
                value={data.respiratory_rate ?? ''}
                onChange={(e) => onChange('respiratory_rate', e.target.value ? parseInt(e.target.value) : null)}
                className={cn('pr-12', inputClassName('respiratory_rate'))}
                disabled={disabled}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                /min
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Normal: 12-20/min</p>
          </div>
          
          {/* SpO2 */}
          <div className="space-y-2">
            <Label htmlFor="spo2" className="flex items-center gap-2">
              <Droplets className="h-4 w-4" />
              SpO2
            </Label>
            <div className="relative">
              <Input
                id="spo2"
                type="number"
                step="1"
                min="0"
                max="100"
                placeholder="98"
                value={data.spo2 ?? ''}
                onChange={(e) => onChange('spo2', e.target.value ? parseFloat(e.target.value) : null)}
                className={cn('pr-12', inputClassName('spo2'))}
                disabled={disabled}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                %
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Normal: 95-100%
            </p>
          </div>
          
          {/* Weight */}
          <div className="space-y-2">
            <Label htmlFor="weight" className="flex items-center gap-2">
              <Scale className="h-4 w-4" />
              Weight
            </Label>
            <div className="relative">
              <Input
                id="weight"
                type="number"
                step="0.1"
                min="0.5"
                max="300"
                placeholder="70"
                value={data.weight ?? ''}
                onChange={(e) => onChange('weight', e.target.value ? parseFloat(e.target.value) : null)}
                className="pr-12"
                disabled={disabled}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                kg
              </span>
            </div>
          </div>
          
          {/* Height */}
          <div className="space-y-2">
            <Label htmlFor="height" className="flex items-center gap-2">
              <Ruler className="h-4 w-4" />
              Height
            </Label>
            <div className="relative">
              <Input
                id="height"
                type="number"
                step="0.1"
                min="20"
                max="250"
                placeholder="170"
                value={data.height ?? ''}
                onChange={(e) => onChange('height', e.target.value ? parseFloat(e.target.value) : null)}
                className="pr-12"
                disabled={disabled}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                cm
              </span>
            </div>
          </div>
          
          {/* BMI (calculated) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              BMI (Calculated)
            </Label>
            <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 flex items-center justify-between">
              {!bmiResult.isAgeAppropriate ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Info className="h-4 w-4" />
                  <span className="text-xs">Not applicable under 2 years</span>
                </div>
              ) : bmiResult.bmi !== null ? (
                <>
                  <span className="font-medium">{bmiResult.bmi}</span>
                  <div className="flex items-center gap-2">
                    {bmiResult.percentile && (
                      <span className="text-xs text-muted-foreground">
                        {bmiResult.percentile}th %ile
                      </span>
                    )}
                    <Badge 
                      variant={
                        bmiResult.classification === 'Normal' || bmiResult.classification === 'Healthy Weight' 
                          ? 'default' 
                          : bmiResult.classification === 'Underweight' 
                            ? 'secondary' 
                            : 'destructive'
                      }
                      className={getBMIColorClass(bmiResult.classification)}
                    >
                      {bmiResult.classification}
                    </Badge>
                  </div>
                </>
              ) : (
                <span className="text-muted-foreground">Enter weight & height</span>
              )}
            </div>
            {bmiResult.message && bmiResult.isAgeAppropriate && (
              <p className="text-xs text-muted-foreground">{bmiResult.message}</p>
            )}
          </div>
        </div>
      </CardContent>
      
      {/* Next Section Button */}
      {onNext && (
        <CardFooter className="border-t pt-4">
          <div className="flex justify-end w-full">
            <Button onClick={onNext} variant="outline">
              Next: Medical History
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}

export default VitalsForm;
