'use client';

import { useState } from 'react';
import { AlertTriangle, AlertCircle, Thermometer, Heart, Wind, Droplets, Scale, Ruler, Activity, Info, ChevronRight, Pencil, X, Check } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
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
  /** Whether vitals came from triage (shows as read-only cards with edit option) */
  fromTriage?: boolean;
  /** Source of vitals for display purposes */
  vitalsSource?: string;
}

/** Individual vital sign card for display mode */
function VitalCard({
  icon: Icon,
  label,
  value,
  unit,
  normalRange,
  status,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number | null;
  unit: string;
  normalRange?: string;
  status?: 'normal' | 'warning' | 'critical';
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3 bg-card',
        status === 'critical' && 'border-destructive bg-destructive/5',
        status === 'warning' && 'border-amber-500 bg-amber-50 dark:bg-amber-950/20'
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn(
          'text-xl font-semibold',
          status === 'critical' && 'text-destructive',
          status === 'warning' && 'text-amber-600 dark:text-amber-500'
        )}>
          {value ?? '—'}
        </span>
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
      {normalRange && (
        <p className="text-xs text-muted-foreground mt-1">{normalRange}</p>
      )}
    </div>
  );
}

export function VitalsForm({ data, onChange, disabled = false, errors = {}, patient, onNext, fromTriage = false, vitalsSource }: VitalsFormProps) {
  const [isEditing, setIsEditing] = useState(false);
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
  
  // Determine if we should show card view (from triage and not editing)
  const showCardView = fromTriage && !isEditing;
  
  return (
    <Card className={cn(criticalAlerts.length > 0 && 'border-destructive')}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Vital Signs
            </CardTitle>
            {fromTriage && vitalsSource && (
              <Badge variant="outline" className="text-xs">
                From {vitalsSource === 'TRIAGE' ? 'Triage' : vitalsSource}
              </Badge>
            )}
            {criticalAlerts.length > 0 && (
              <Badge variant="destructive" className="animate-pulse">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {criticalAlerts.length} Critical
              </Badge>
            )}
          </div>
          {fromTriage && !disabled && (
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={() => setIsEditing(false)}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="h-8"
                    onClick={() => setIsEditing(false)}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Done
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit Vitals
                </Button>
              )}
            </div>
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
        
        {/* Card view - shows vitals as read-only cards (for triage data) */}
        {showCardView ? (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            <VitalCard
              icon={Thermometer}
              label="Temperature"
              value={data.temperature}
              unit="°C"
              normalRange="36.1-37.2°C"
              status={getFieldStatus('temperature')}
            />
            <VitalCard
              icon={Heart}
              label="Pulse"
              value={data.pulse}
              unit="bpm"
              normalRange="60-100 bpm"
              status={getFieldStatus('pulse')}
            />
            <VitalCard
              icon={Activity}
              label="Blood Pressure"
              value={data.blood_pressure_systolic && data.blood_pressure_diastolic 
                ? `${data.blood_pressure_systolic}/${data.blood_pressure_diastolic}` 
                : null}
              unit="mmHg"
              normalRange="90/60-120/80"
              status={getFieldStatus('blood_pressure')}
            />
            <VitalCard
              icon={Wind}
              label="Resp. Rate"
              value={data.respiratory_rate}
              unit="/min"
              normalRange="12-20/min"
              status={getFieldStatus('respiratory_rate')}
            />
            <VitalCard
              icon={Droplets}
              label="SpO₂"
              value={data.spo2}
              unit="%"
              normalRange="95-100%"
              status={getFieldStatus('spo2')}
            />
            <VitalCard
              icon={Scale}
              label="Weight"
              value={data.weight}
              unit="kg"
            />
            <VitalCard
              icon={Ruler}
              label="Height"
              value={data.height}
              unit="cm"
            />
            {/* BMI Card */}
            <div className="rounded-lg border p-3 bg-card">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Info className="h-4 w-4" />
                <span className="text-xs font-medium">BMI</span>
              </div>
              {!bmiResult.isAgeAppropriate ? (
                <span className="text-sm text-muted-foreground">N/A under 2yrs</span>
              ) : bmiResult.bmi !== null ? (
                <div>
                  <span className="text-xl font-semibold">{bmiResult.bmi}</span>
                  <Badge 
                    variant="outline"
                    className={cn('ml-2 text-xs', getBMIColorClass(bmiResult.classification))}
                  >
                    {bmiResult.classification}
                  </Badge>
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
          </div>
        ) : (
        /* Vital sign inputs - editable form */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Temperature */}
          <div className="space-y-2">
            <Label htmlFor="temperature" className="flex items-center gap-2">
              <Thermometer className="h-4 w-4" />
              Temperature
            </Label>
            <InputGroup data-disabled={disabled} className={inputClassName('temperature')}>
              <InputGroupInput
                id="temperature"
                type="number"
                step="0.1"
                min="35"
                max="45"
                placeholder="36.5"
                value={data.temperature ?? ''}
                onChange={(e) => onChange('temperature', e.target.value ? parseFloat(e.target.value) : null)}
                disabled={disabled}
              />
              <InputGroupAddon align="inline-end">°C</InputGroupAddon>
            </InputGroup>
            <p className="text-xs text-muted-foreground">Normal: 36.1-37.2°C</p>
          </div>
          
          {/* Pulse */}
          <div className="space-y-2">
            <Label htmlFor="pulse" className="flex items-center gap-2">
              <Heart className="h-4 w-4" />
              Pulse
            </Label>
            <InputGroup data-disabled={disabled} className={inputClassName('pulse')}>
              <InputGroupInput
                id="pulse"
                type="number"
                min="30"
                max="200"
                placeholder="72"
                value={data.pulse ?? ''}
                onChange={(e) => onChange('pulse', e.target.value ? parseInt(e.target.value) : null)}
                disabled={disabled}
              />
              <InputGroupAddon align="inline-end">bpm</InputGroupAddon>
            </InputGroup>
            <p className="text-xs text-muted-foreground">Normal: 60-100 bpm</p>
          </div>
          
          {/* Blood Pressure */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Blood Pressure
            </Label>
            <InputGroup data-disabled={disabled} className={inputClassName('blood_pressure')}>
              <InputGroupInput
                type="number"
                min="60"
                max="250"
                placeholder="120"
                value={data.blood_pressure_systolic ?? ''}
                onChange={(e) => onChange('blood_pressure_systolic', e.target.value ? parseInt(e.target.value) : null)}
                className="text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                disabled={disabled}
              />
              <InputGroupText>/</InputGroupText>
              <InputGroupInput
                type="number"
                min="40"
                max="150"
                placeholder="80"
                value={data.blood_pressure_diastolic ?? ''}
                onChange={(e) => onChange('blood_pressure_diastolic', e.target.value ? parseInt(e.target.value) : null)}
                className="text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                disabled={disabled}
              />
              <InputGroupAddon align="inline-end">mmHg</InputGroupAddon>
            </InputGroup>
            <p className="text-xs text-muted-foreground">Normal: 90/60-120/80</p>
          </div>
          
          {/* Respiratory Rate */}
          <div className="space-y-2">
            <Label htmlFor="respiratory_rate" className="flex items-center gap-2">
              <Wind className="h-4 w-4" />
              Respiratory Rate
            </Label>
            <InputGroup data-disabled={disabled} className={inputClassName('respiratory_rate')}>
              <InputGroupInput
                id="respiratory_rate"
                type="number"
                min="8"
                max="40"
                placeholder="16"
                value={data.respiratory_rate ?? ''}
                onChange={(e) => onChange('respiratory_rate', e.target.value ? parseInt(e.target.value) : null)}
                disabled={disabled}
              />
              <InputGroupAddon align="inline-end">/min</InputGroupAddon>
            </InputGroup>
            <p className="text-xs text-muted-foreground">Normal: 12-20/min</p>
          </div>
          
          {/* SpO2 */}
          <div className="space-y-2">
            <Label htmlFor="spo2" className="flex items-center gap-2">
              <Droplets className="h-4 w-4" />
              SpO2
            </Label>
            <InputGroup data-disabled={disabled} className={inputClassName('spo2')}>
              <InputGroupInput
                id="spo2"
                type="number"
                step="1"
                min="0"
                max="100"
                placeholder="98"
                value={data.spo2 ?? ''}
                onChange={(e) => onChange('spo2', e.target.value ? parseFloat(e.target.value) : null)}
                disabled={disabled}
              />
              <InputGroupAddon align="inline-end">%</InputGroupAddon>
            </InputGroup>
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
            <InputGroup data-disabled={disabled}>
              <InputGroupInput
                id="weight"
                type="number"
                step="0.1"
                min="0.5"
                max="300"
                placeholder="70"
                value={data.weight ?? ''}
                onChange={(e) => onChange('weight', e.target.value ? parseFloat(e.target.value) : null)}
                disabled={disabled}
              />
              <InputGroupAddon align="inline-end">kg</InputGroupAddon>
            </InputGroup>
          </div>
          
          {/* Height */}
          <div className="space-y-2">
            <Label htmlFor="height" className="flex items-center gap-2">
              <Ruler className="h-4 w-4" />
              Height
            </Label>
            <InputGroup data-disabled={disabled}>
              <InputGroupInput
                id="height"
                type="number"
                step="0.1"
                min="20"
                max="250"
                placeholder="170"
                value={data.height ?? ''}
                onChange={(e) => onChange('height', e.target.value ? parseFloat(e.target.value) : null)}
                disabled={disabled}
              />
              <InputGroupAddon align="inline-end">cm</InputGroupAddon>
            </InputGroup>
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
        )}
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
