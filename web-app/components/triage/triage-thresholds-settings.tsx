/**
 * TriageThresholdsSettings Component
 *
 * Admin settings page for configuring vital sign thresholds
 * that trigger triage alerts. Allows customization per facility.
 *
 * Sprint 1.5-1.6 Track E: Triage MVP
 *
 * @see features/triage/triage-thresholds.feature for BDD scenarios
 */
'use client';

import * as React from 'react';
import { Settings, Edit, Download, Upload, RotateCcw, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { HelpPopover } from '@/components/shared/help-popover';
import type { TriageVitalThreshold, VitalType } from '@/lib/types/triage';

// =============================================================================
// TYPES
// =============================================================================

export interface TriageThresholdsSettingsProps {
  /** Current threshold configurations */
  thresholds: TriageVitalThreshold[];
  /** Loading state */
  isLoading?: boolean;
  /** Whether user can edit thresholds */
  canEdit?: boolean;
  /** Callback to save a threshold */
  onSave: (threshold: Partial<TriageVitalThreshold> & { id: number }) => void;
  /** Callback to reset a threshold to defaults */
  onReset: (thresholdId: number) => void;
  /** Callback to toggle threshold active state */
  onToggleActive: (thresholdId: number, isActive: boolean) => void;
  /** Callback to export configuration */
  onExport: () => void;
  /** Callback to import configuration */
  onImport: (file: File) => void;
}

interface EditFormData {
  critical_low: number | null;
  warning_low: number | null;
  warning_high: number | null;
  critical_high: number | null;
}

interface ValidationError {
  field: string;
  message: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const VITAL_TYPE_CONFIG: Record<VitalType, { label: string; unit: string; min: number; max: number }> = {
  SPO2: { label: 'SpO2', unit: '%', min: 0, max: 100 },
  SYSTOLIC_BP: { label: 'Systolic BP', unit: 'mmHg', min: 40, max: 300 },
  DIASTOLIC_BP: { label: 'Diastolic BP', unit: 'mmHg', min: 20, max: 200 },
  HEART_RATE: { label: 'Heart Rate', unit: 'bpm', min: 20, max: 300 },
  TEMPERATURE: { label: 'Temperature', unit: '°C', min: 25, max: 45 },
  RESPIRATORY_RATE: { label: 'Respiratory Rate', unit: '/min', min: 0, max: 60 },
  // Non-numeric vital types (used for structured alerts, not configurable thresholds)
  MENTAL_STATUS: { label: 'Mental Status', unit: 'AVPU', min: 0, max: 3 },
  PAIN_SCORE: { label: 'Pain Score', unit: '/10', min: 0, max: 10 },
  GENERAL: { label: 'General', unit: '', min: 0, max: 0 },
};

const DEFAULT_THRESHOLDS: Record<VitalType, EditFormData> = {
  SPO2: { critical_low: 90, warning_low: 95, warning_high: null, critical_high: null },
  SYSTOLIC_BP: { critical_low: 90, warning_low: 100, warning_high: 140, critical_high: 180 },
  DIASTOLIC_BP: { critical_low: null, warning_low: null, warning_high: 90, critical_high: 120 },
  HEART_RATE: { critical_low: 40, warning_low: 50, warning_high: 100, critical_high: 150 },
  TEMPERATURE: { critical_low: 35.0, warning_low: 36.5, warning_high: 37.5, critical_high: 40.0 },
  RESPIRATORY_RATE: { critical_low: 8, warning_low: 10, warning_high: 24, critical_high: 30 },
  // Non-numeric vital types (not configurable via UI)
  MENTAL_STATUS: { critical_low: null, warning_low: null, warning_high: null, critical_high: null },
  PAIN_SCORE: { critical_low: null, warning_low: null, warning_high: 7, critical_high: 9 },
  GENERAL: { critical_low: null, warning_low: null, warning_high: null, critical_high: null },
};

// Configurable vital types (subset that appears in threshold records)
type ConfigurableVitalType = 'SPO2' | 'SYSTOLIC_BP' | 'DIASTOLIC_BP' | 'HEART_RATE' | 'TEMPERATURE' | 'RESPIRATORY_RATE';

// Vital types that should appear in the configuration table
const CONFIGURABLE_VITAL_TYPES: ConfigurableVitalType[] = [
  'SPO2',
  'SYSTOLIC_BP',
  'DIASTOLIC_BP',
  'HEART_RATE',
  'TEMPERATURE',
  'RESPIRATORY_RATE',
];

/**
 * Create display thresholds by merging API data with defaults.
 * This ensures all configurable vital types are shown even if not yet in the database.
 */
function createDisplayThresholds(apiThresholds: TriageVitalThreshold[]): TriageVitalThreshold[] {
  const thresholdMap = new Map(apiThresholds.map((t) => [t.vital_type, t]));

  return CONFIGURABLE_VITAL_TYPES.map((vitalType, index) => {
    const existing = thresholdMap.get(vitalType);
    if (existing) {
      return existing;
    }
    // Create a synthetic threshold from defaults
    const defaults = DEFAULT_THRESHOLDS[vitalType];
    return {
      id: -(index + 1), // Negative IDs indicate synthetic/default entries
      vital_type: vitalType,
      critical_low: defaults.critical_low,
      warning_low: defaults.warning_low,
      warning_high: defaults.warning_high,
      critical_high: defaults.critical_high,
      is_active: true,
      created_at: '',
      updated_at: '',
    };
  });
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function validateThresholds(
  vitalType: VitalType,
  data: EditFormData
): ValidationError[] {
  const errors: ValidationError[] = [];
  const config = VITAL_TYPE_CONFIG[vitalType];

  // Validate range for each non-null value
  const fields: (keyof EditFormData)[] = ['critical_low', 'warning_low', 'warning_high', 'critical_high'];
  for (const field of fields) {
    const value = data[field];
    if (value !== null) {
      if (value < config.min || value > config.max) {
        errors.push({
          field,
          message: `${config.label} must be between ${config.min} and ${config.max}`,
        });
      }
    }
  }

  // Validate order: critical_low < warning_low < warning_high < critical_high
  if (data.critical_low !== null && data.warning_low !== null) {
    if (data.critical_low >= data.warning_low) {
      errors.push({
        field: 'critical_low',
        message: 'Critical low must be less than Warning low',
      });
    }
  }

  if (data.warning_low !== null && data.warning_high !== null) {
    if (data.warning_low >= data.warning_high) {
      errors.push({
        field: 'warning_low',
        message: 'Warning low must be less than Warning high',
      });
    }
  }

  if (data.warning_high !== null && data.critical_high !== null) {
    if (data.warning_high >= data.critical_high) {
      errors.push({
        field: 'warning_high',
        message: 'Warning high must be less than Critical high',
      });
    }
  }

  return errors;
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function LoadingSkeleton() {
  return (
    <div data-testid="thresholds-loading" className="space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ThresholdEditDialogProps {
  threshold: TriageVitalThreshold;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<TriageVitalThreshold> & { id: number }) => void;
  onReset: () => void;
}

function ThresholdEditDialog({
  threshold,
  isOpen,
  onClose,
  onSave,
  onReset,
}: ThresholdEditDialogProps) {
  const [formData, setFormData] = React.useState<EditFormData>({
    critical_low: threshold.critical_low,
    warning_low: threshold.warning_low,
    warning_high: threshold.warning_high,
    critical_high: threshold.critical_high,
  });
  const [errors, setErrors] = React.useState<ValidationError[]>([]);
  const [showResetConfirm, setShowResetConfirm] = React.useState(false);

  const config = VITAL_TYPE_CONFIG[threshold.vital_type];

  const handleChange = (field: keyof EditFormData, value: string) => {
    const numValue = value === '' ? null : parseFloat(value);
    setFormData((prev) => ({ ...prev, [field]: numValue }));
    setErrors([]);
  };

  const handleSave = () => {
    const validationErrors = validateThresholds(threshold.vital_type, formData);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    onSave({
      id: threshold.id,
      ...formData,
    });
    onClose();
  };

  const handleResetConfirm = () => {
    onReset();
    setShowResetConfirm(false);
    onClose();
  };

  const getFieldError = (field: string) => errors.find((e) => e.field === field)?.message;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Edit {config.label} Thresholds</DialogTitle>
              <HelpPopover
                content={`Configure alert thresholds for ${config.label} (${config.unit}). Values outside these thresholds will trigger alerts during triage.`}
              />
            </div>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Critical Low */}
            <div className="grid gap-2">
              <Label htmlFor="critical_low">Critical Low</Label>
              <Input
                id="critical_low"
                type="number"
                step={threshold.vital_type === 'TEMPERATURE' ? '0.1' : '1'}
                value={formData.critical_low ?? ''}
                onChange={(e) => handleChange('critical_low', e.target.value)}
                placeholder="e.g., 90"
              />
              {getFieldError('critical_low') && (
                <p className="text-sm text-destructive">{getFieldError('critical_low')}</p>
              )}
            </div>

            {/* Warning Low */}
            <div className="grid gap-2">
              <Label htmlFor="warning_low">Warning Low</Label>
              <Input
                id="warning_low"
                type="number"
                step={threshold.vital_type === 'TEMPERATURE' ? '0.1' : '1'}
                value={formData.warning_low ?? ''}
                onChange={(e) => handleChange('warning_low', e.target.value)}
                placeholder="e.g., 95"
              />
              {getFieldError('warning_low') && (
                <p className="text-sm text-destructive">{getFieldError('warning_low')}</p>
              )}
            </div>

            {/* Warning High */}
            <div className="grid gap-2">
              <Label htmlFor="warning_high">Warning High</Label>
              <Input
                id="warning_high"
                type="number"
                step={threshold.vital_type === 'TEMPERATURE' ? '0.1' : '1'}
                value={formData.warning_high ?? ''}
                onChange={(e) => handleChange('warning_high', e.target.value)}
                placeholder="e.g., 140"
              />
              {getFieldError('warning_high') && (
                <p className="text-sm text-destructive">{getFieldError('warning_high')}</p>
              )}
            </div>

            {/* Critical High */}
            <div className="grid gap-2">
              <Label htmlFor="critical_high">Critical High</Label>
              <Input
                id="critical_high"
                type="number"
                step={threshold.vital_type === 'TEMPERATURE' ? '0.1' : '1'}
                value={formData.critical_high ?? ''}
                onChange={(e) => handleChange('critical_high', e.target.value)}
                placeholder="e.g., 180"
              />
              {getFieldError('critical_high') && (
                <p className="text-sm text-destructive">{getFieldError('critical_high')}</p>
              )}
            </div>

            {/* General errors */}
            {errors.length > 0 && !errors.some((e) => ['critical_low', 'warning_low', 'warning_high', 'critical_high'].includes(e.field)) && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{errors[0]?.message}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowResetConfirm(true)}
              className="w-full sm:w-auto"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Default
            </Button>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave}>Save</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to Default?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reset {config.label} thresholds to system defaults. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetConfirm}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * TriageThresholdsSettings - Admin configuration for vital thresholds
 *
 * Features:
 * - View all vital thresholds in a table
 * - Edit individual thresholds with validation
 * - Toggle threshold active/inactive
 * - Reset to default values
 * - Export/Import configuration
 * - Permission-based access (view-only for non-admins)
 * - Loading and empty states
 */
export function TriageThresholdsSettings({
  thresholds,
  isLoading = false,
  canEdit = true,
  onSave,
  onReset,
  onToggleActive,
  onExport,
  onImport,
}: TriageThresholdsSettingsProps) {
  const [editingThreshold, setEditingThreshold] = React.useState<TriageVitalThreshold | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
      e.target.value = '';
    }
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  // Merge API thresholds with defaults to always show all configurable vitals
  const displayThresholds = createDisplayThresholds(thresholds);

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
        {canEdit && (
          <>
            <Button variant="outline" size="sm" onClick={handleImportClick}>
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
            <Label htmlFor="triage-thresholds-import" className="sr-only">
              Import triage threshold configuration (JSON)
            </Label>
            <input
              id="triage-thresholds-import"
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Import triage threshold configuration (JSON)"
              title="Import triage threshold configuration (JSON)"
            />
            <Button variant="outline" size="sm">
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset All
            </Button>
          </>
        )}
      </div>

      {/* Permission Warning */}
      {!canEdit && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            View only mode. Administrator access required to modify thresholds.
          </AlertDescription>
        </Alert>
      )}

      <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              <CardTitle className="text-base sm:text-lg">Threshold Configuration</CardTitle>
              <HelpPopover content="Values outside these thresholds will trigger alerts during triage. Critical thresholds trigger immediate alerts; warning thresholds prompt review. Click Edit to customize values for your facility." />
            </div>
          </CardHeader>
          <CardContent>
            <Table data-testid="thresholds-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Vital Type</TableHead>
                  <TableHead className="text-center">Critical Low</TableHead>
                  <TableHead className="text-center">Warning Low</TableHead>
                  <TableHead className="text-center">Warning High</TableHead>
                  <TableHead className="text-center">Critical High</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  {canEdit && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayThresholds.map((threshold) => {
                  const config = VITAL_TYPE_CONFIG[threshold.vital_type];
                  const isDefault = threshold.id < 0;
                  return (
                    <TableRow
                      key={threshold.id}
                      data-testid={`threshold-row-${threshold.vital_type}`}
                      className={cn(!threshold.is_active && 'opacity-50')}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div>
                            <span className="font-medium">{config.label}</span>
                            <span className="text-muted-foreground ml-1">({config.unit})</span>
                          </div>
                          {isDefault && (
                            <Badge variant="secondary" className="text-xs">
                              Default
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        <span className="text-red-600">
                          {threshold.critical_low ?? '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        <span className="text-orange-600">
                          {threshold.warning_low ?? '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        <span className="text-orange-600">
                          {threshold.warning_high ?? '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        <span className="text-red-600">
                          {threshold.critical_high ?? '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          <Switch
                            data-testid={`active-indicator-${threshold.vital_type}`}
                            checked={threshold.is_active}
                            onCheckedChange={(checked) =>
                              onToggleActive(threshold.id, checked)
                            }
                            disabled={!canEdit}
                            aria-label={`${config.label} active`}
                          />
                        </div>
                      </TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingThreshold(threshold)}
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

      {/* Edit Dialog */}
      {editingThreshold && (
        <ThresholdEditDialog
          threshold={editingThreshold}
          isOpen={!!editingThreshold}
          onClose={() => setEditingThreshold(null)}
          onSave={onSave}
          onReset={() => onReset(editingThreshold.id)}
        />
      )}
    </div>
  );
}
