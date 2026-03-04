/**
 * AI Context Enrichment Form
 *
 * Inline collapsible form rendered in the chat panel when clinical context
 * is insufficient or partial. Allows the clinician to quickly fill in
 * missing fields (chief complaint, vitals) without leaving the chat.
 *
 * The enrichment data is stored in AIChatContext and merged with the base
 * patient/encounter context before API calls.
 */
'use client';

import React, { useCallback, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Thermometer,
  Heart,
  Wind,
  Activity,
  Droplets,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import type { AIContextEnrichment } from '@/lib/utils/ai-context-sufficiency';
import type { ContextSufficiencyResult } from '@/lib/utils/ai-context-sufficiency';

// =============================================================================
// Types
// =============================================================================

export interface AIContextEnrichmentFormProps {
  /** Current sufficiency result (determines which fields to show) */
  sufficiency: ContextSufficiencyResult;
  /** Current enrichment values (pre-fill the form) */
  currentEnrichment: AIContextEnrichment | null;
  /** Called when user applies enrichment */
  onEnrich: (data: AIContextEnrichment) => void;
}

// =============================================================================
// Compact number input
// =============================================================================

interface CompactInputProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  unit?: string;
  type?: 'number' | 'text';
  min?: number;
  max?: number;
  step?: number;
}

function CompactInput({
  label,
  icon,
  value,
  onChange,
  placeholder,
  unit,
  type = 'number',
  min,
  max,
  step,
}: CompactInputProps) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-1 text-muted-foreground shrink-0 w-7" title={label}>
        {icon}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        className={cn(
          'flex-1 min-w-0 rounded border bg-background px-2 py-1',
          'text-xs placeholder:text-muted-foreground/60',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'w-full'
        )}
      />
      {unit && <span className="text-[10px] text-muted-foreground shrink-0">{unit}</span>}
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function AIContextEnrichmentForm({
  sufficiency,
  currentEnrichment,
  onEnrich,
}: AIContextEnrichmentFormProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Form state — pre-fill from current enrichment
  const [chiefComplaint, setChiefComplaint] = useState(currentEnrichment?.chief_complaint ?? '');
  const [temperature, setTemperature] = useState(currentEnrichment?.temperature?.toString() ?? '');
  const [heartRate, setHeartRate] = useState(currentEnrichment?.heart_rate?.toString() ?? '');
  const [spo2, setSpo2] = useState(currentEnrichment?.spo2?.toString() ?? '');
  const [respiratoryRate, setRespiratoryRate] = useState(currentEnrichment?.respiratory_rate?.toString() ?? '');
  const [systolicBp, setSystolicBp] = useState(currentEnrichment?.systolic_bp?.toString() ?? '');
  const [diastolicBp, setDiastolicBp] = useState(currentEnrichment?.diastolic_bp?.toString() ?? '');

  // Determine which fields are missing from base context
  const missingChiefComplaint = sufficiency.missingFields.includes('chief complaint');
  const missingAnyVitals = sufficiency.missingFields.some((f) => f.includes('vital'));

  // Check which specific vitals are missing
  const missingVitalsList = sufficiency.missingFields
    .filter((f) => f.includes('vital'))
    .join(' ');
  const missingHR = missingVitalsList.includes('heart rate') || sufficiency.vitalCount === 0;
  const missingSpo2 = missingVitalsList.includes('SpO2') || sufficiency.vitalCount === 0;
  const missingTemp = missingVitalsList.includes('temperature') || sufficiency.vitalCount === 0;
  const missingRR = missingVitalsList.includes('respiratory rate') || sufficiency.vitalCount === 0;
  const missingBP = missingVitalsList.includes('blood pressure') || sufficiency.vitalCount === 0;

  const hasAnyMissingField = missingChiefComplaint || missingAnyVitals;

  // Don't render if context is already sufficient with all vitals
  if (!hasAnyMissingField) return null;

  const handleApply = useCallback(() => {
    const enrichment: AIContextEnrichment = {};

    if (chiefComplaint.trim()) enrichment.chief_complaint = chiefComplaint.trim();
    if (temperature) enrichment.temperature = parseFloat(temperature);
    if (heartRate) enrichment.heart_rate = parseInt(heartRate, 10);
    if (spo2) enrichment.spo2 = parseFloat(spo2);
    if (respiratoryRate) enrichment.respiratory_rate = parseInt(respiratoryRate, 10);
    if (systolicBp) enrichment.systolic_bp = parseInt(systolicBp, 10);
    if (diastolicBp) enrichment.diastolic_bp = parseInt(diastolicBp, 10);

    // Only apply if at least one field has a value
    const hasAnyValue = Object.values(enrichment).some(
      (v) => v != null && v !== '' && !Number.isNaN(v)
    );
    if (hasAnyValue) {
      onEnrich(enrichment);
      setIsExpanded(false);
    }
  }, [chiefComplaint, temperature, heartRate, spo2, respiratoryRate, systolicBp, diastolicBp, onEnrich]);

  const filledCount = [chiefComplaint, temperature, heartRate, spo2, respiratoryRate, systolicBp || diastolicBp]
    .filter(Boolean).length;

  return (
    <div className="border-t">
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Activity className="h-3 w-3" />
          {isExpanded ? 'Hide quick-fill' : 'Quick-fill missing data'}
          {filledCount > 0 && !isExpanded && (
            <span className="text-[10px] font-medium text-primary">
              ({filledCount} added)
            </span>
          )}
        </span>
        {isExpanded ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>

      {/* Expandable form */}
      {isExpanded && (
        <div className="px-3 pb-2 space-y-2">
          {/* Chief complaint */}
          {missingChiefComplaint && (
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Chief Complaint
              </label>
              <textarea
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                placeholder="e.g., chest pain radiating to left arm"
                className={cn(
                  'w-full mt-0.5 rounded border bg-background px-2 py-1.5',
                  'text-xs placeholder:text-muted-foreground/60 resize-none',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  'min-h-[32px] max-h-[60px]'
                )}
                rows={1}
              />
            </div>
          )}

          {/* Vital signs grid */}
          {missingAnyVitals && (
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Vital Signs
              </label>
              <div className="grid grid-cols-2 gap-1.5 mt-0.5">
                {missingTemp && (
                  <CompactInput
                    label="Temperature"
                    icon={<Thermometer className="h-3 w-3" />}
                    value={temperature}
                    onChange={setTemperature}
                    placeholder="37.0"
                    unit="°C"
                    min={30}
                    max={45}
                    step={0.1}
                  />
                )}
                {missingHR && (
                  <CompactInput
                    label="Heart Rate"
                    icon={<Heart className="h-3 w-3" />}
                    value={heartRate}
                    onChange={setHeartRate}
                    placeholder="80"
                    unit="bpm"
                    min={20}
                    max={250}
                  />
                )}
                {missingSpo2 && (
                  <CompactInput
                    label="SpO2"
                    icon={<Droplets className="h-3 w-3" />}
                    value={spo2}
                    onChange={setSpo2}
                    placeholder="98"
                    unit="%"
                    min={50}
                    max={100}
                  />
                )}
                {missingRR && (
                  <CompactInput
                    label="Respiratory Rate"
                    icon={<Wind className="h-3 w-3" />}
                    value={respiratoryRate}
                    onChange={setRespiratoryRate}
                    placeholder="18"
                    unit="/min"
                    min={4}
                    max={60}
                  />
                )}
                {missingBP && (
                  <>
                    <CompactInput
                      label="Systolic BP"
                      icon={<Activity className="h-3 w-3" />}
                      value={systolicBp}
                      onChange={setSystolicBp}
                      placeholder="120"
                      unit="sys"
                      min={50}
                      max={300}
                    />
                    <CompactInput
                      label="Diastolic BP"
                      icon={<Activity className="h-3 w-3" />}
                      value={diastolicBp}
                      onChange={setDiastolicBp}
                      placeholder="80"
                      unit="dia"
                      min={20}
                      max={200}
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {/* Apply button */}
          <Button
            type="button"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={handleApply}
          >
            Update context
          </Button>

          <p className="text-[10px] text-muted-foreground text-center">
            This adds context for AI only — does not save to the patient record
          </p>
        </div>
      )}
    </div>
  );
}
