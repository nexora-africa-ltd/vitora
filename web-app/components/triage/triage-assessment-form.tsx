/**
 * TriageAssessmentForm Component
 *
 * Main form for performing patient triage assessments according to
 * KETA (Kenya Emergency Triage Assessment) standards.
 *
 * Sprint 1.5-1.6 Track E: Triage MVP
 *
 * @see features/triage/triage-assessment.feature for BDD scenarios
 */
'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  User,
  Clock,
  Ambulance,
  Activity,
  Brain,
  AlertCircle,
  AlertTriangle,
  MapPin,
  Stethoscope,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { TriageCategoryBadge } from './triage-category-badge';
import { VitalAlertsPanel } from './vital-alerts-panel';
import { GCSScorePanel } from './gcs-score-panel';
import type { GCSScores } from './gcs-score-panel';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import type {
  TriageAssessmentCreateData,
  ArrivalMode,
  ChiefComplaintCategory,
  AVPUStatus,
  MobilityStatus,
  TriageCategory,
  AssignedArea,
  TriageAlert,
  EtATDangerSign,
  DehydrationLevel,
  FontanelleStatus,
  BreastfeedingAbility,
  AgeGroup,
} from '@/lib/types/triage';
import { useCalculateTriageCategory } from '@/lib/hooks/use-triage';
import {
  ARRIVAL_MODE_CONFIG,
  CHIEF_COMPLAINT_CONFIG,
  AVPU_CONFIG,
  MOBILITY_CONFIG,
  TRIAGE_CATEGORY_CONFIG,
  ASSIGNED_AREA_CONFIG,
  EMERGENCY_AREA_OPTIONS,
  VitalType,
  ETAT_DANGER_SIGNS_CONFIG,
  DEHYDRATION_CONFIG,
  FONTANELLE_CONFIG,
  BREASTFEEDING_CONFIG,
  getAgeGroup,
  isPediatric,
  isNeonateOrInfant,
} from '@/lib/types/triage';
import { useClinics } from '@/lib/hooks/use-clinics';
import { calculateBMI, getBMIColorClass } from '@/lib/utils/bmi';
import { AIRiskAssessmentPanel } from './ai-risk-assessment-panel';

// =============================================================================
// VALIDATION SCHEMA
// =============================================================================

const triageFormSchema = z
  .object({
    arrival_mode: z.enum(['WALK_IN', 'AMBULANCE', 'POLICE', 'REFERRAL', 'OTHER'], {
      required_error: 'Arrival mode is required',
    }),
    arrival_time: z.string().min(1, 'Arrival time is required'),
    chief_complaint_category: z.enum(
      [
        'CHEST_PAIN',
        'DIFFICULTY_BREATHING',
        'TRAUMA',
        'FEVER',
        'ABDOMINAL_PAIN',
        'HEADACHE',
        'ALTERED_CONSCIOUSNESS',
        'BLEEDING',
        'POISONING',
        'OBSTETRIC',
        'PEDIATRIC',
        // Neonatal-specific
        'NEONATAL_SEPSIS',
        'NEONATAL_JAUNDICE',
        'NEONATAL_RESPIRATORY_DISTRESS',
        'BIRTH_ASPHYXIA',
        // Pediatric-specific
        'FEBRILE_CONVULSION',
        'CROUP',
        'BRONCHIOLITIS',
        'SEVERE_MALARIA',
        'OTHER',
      ],
      { required_error: 'Chief complaint category is required' }
    ),
    chief_complaint: z.string().min(1, 'Chief complaint details are required'),
    pain_score: z.number().min(0).max(10).nullable().optional(),

    // Vital signs (optional) - nullable number with range validation
    // Use union to properly short-circuit null before range checks
    spo2: z.union([
      z.literal(null),
      z.number().min(0, 'SpO2 must be between 0 and 100').max(100, 'SpO2 must be between 0 and 100'),
    ]).optional(),
    heart_rate: z.union([
      z.literal(null),
      z.number().min(0, 'Heart rate must be between 0 and 300').max(300, 'Heart rate must be between 0 and 300'),
    ]).optional(),
    systolic_bp: z.union([
      z.literal(null),
      z.number().min(0, 'Systolic BP must be between 0 and 300').max(300, 'Systolic BP must be between 0 and 300'),
    ]).optional(),
    diastolic_bp: z.union([
      z.literal(null),
      z.number().min(0, 'Diastolic BP must be between 0 and 200').max(200, 'Diastolic BP must be between 0 and 200'),
    ]).optional(),
    temperature: z.union([
      z.literal(null),
      z.number().min(30, 'Temperature must be between 30 and 45').max(45, 'Temperature must be between 30 and 45'),
    ]).optional(),
    respiratory_rate: z.union([
      z.literal(null),
      z.number().min(0, 'Respiratory rate must be between 0 and 60').max(60, 'Respiratory rate must be between 0 and 60'),
    ]).optional(),
    weight: z.union([
      z.literal(null),
      z.number().min(0, 'Weight must be positive').max(500, 'Weight must be less than 500 kg'),
    ]).optional(),
    height: z.union([
      z.literal(null),
      z.number().min(0, 'Height must be positive').max(300, 'Height must be less than 300 cm'),
    ]).optional(),
    mental_status: z.enum(['A', 'V', 'P', 'U'], {
      required_error: 'Mental status (AVPU) is required',
    }),
    // Glasgow Coma Scale (optional - for trauma/neuro cases)
    gcs_eye: z.union([
      z.literal(null),
      z.number().min(1, 'Eye response must be 1-4').max(4, 'Eye response must be 1-4'),
    ]).optional().nullable(),
    gcs_verbal: z.union([
      z.literal(null),
      z.number().min(1, 'Verbal response must be 1-5').max(5, 'Verbal response must be 1-5'),
    ]).optional().nullable(),
    gcs_motor: z.union([
      z.literal(null),
      z.number().min(1, 'Motor response must be 1-6').max(6, 'Motor response must be 1-6'),
    ]).optional().nullable(),
    mobility: z.enum(['AMBULATORY', 'WHEELCHAIR', 'STRETCHER', 'IMMOBILE'], {
      required_error: 'Mobility status is required',
    }),
    allergies_noted: z.string().optional(),
    triage_category: z.enum(['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE'], {
      required_error: 'Triage category is required',
    }),
    auto_calculated_category: z
      .enum(['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE'])
      .optional(),
    category_override_reason: z.string().optional(),

    // ETAT pediatric fields (optional for all, shown conditionally for <12y)
    etat_danger_signs: z.array(z.string()).optional().default([]),
    dehydration_level: z.enum(['NONE', 'SOME', 'SEVERE', '']).optional().default(''),
    fontanelle_status: z.enum(['NORMAL', 'BULGING', 'SUNKEN', '']).optional().default(''),
    breastfeeding_ability: z.enum(['NORMAL', 'REDUCED', 'UNABLE', '']).optional().default(''),
    capillary_refill_seconds: z.union([
      z.literal(null),
      z.number().min(0, 'Must be 0-15').max(15, 'Must be 0-15'),
    ]).optional(),
    muac_cm: z.union([
      z.literal(null),
      z.number().min(0, 'Must be 0-30').max(30, 'Must be 0-30'),
    ]).optional(),

    // Routing: Either assigned_area (ER zones) OR assigned_clinic (clinics)
    assigned_area: z.enum(
      [
        'ER_RESUS',
        'ER_ACUTE',
        'ER_FAST_TRACK',
        'OBSERVATION',
        'OPD',
        'TRAUMA',
        'PEDIATRIC_ER',
        'MATERNITY',
        'SPECIALTY',
        '', // Empty when clinic is assigned
      ]
    ).optional(),
    assigned_clinic: z.number().nullable().optional(),
    assigned_clinician: z.number().nullable().optional(),
  })
  .refine(
    (data) => {
      // Routing validation: require either assigned_area OR assigned_clinic
      const hasArea = data.assigned_area && data.assigned_area.trim() !== '';
      const hasClinic = data.assigned_clinic != null;

      if (!hasArea && !hasClinic) {
        return false;
      }
      return true;
    },
    {
      message: 'Select either an emergency area or a clinic for routing',
      path: ['assigned_area'],
    }
  )
  .refine(
    (data) => {
      // If category differs from auto-calculated, require override reason
      if (
        data.auto_calculated_category &&
        data.triage_category !== data.auto_calculated_category
      ) {
        return !!data.category_override_reason?.trim();
      }
      return true;
    },
    {
      message: 'Override reason is required when changing category',
      path: ['category_override_reason'],
    }
  );

type TriageFormData = z.infer<typeof triageFormSchema>;

// =============================================================================
// TYPES
// =============================================================================

interface Patient {
  id: number;
  mrn: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'M' | 'F' | 'O';
  allergies?: string;
}

interface Encounter {
  id: number;
  patient: number;
  encounter_type: string;
  spo2?: number;
  pulse?: number;
  blood_pressure?: string;
  temperature?: number;
  respiratory_rate?: number;
  created_at?: string;
}

export interface TriageAssessmentFormProps {
  /** Patient data */
  patient: Patient;
  /** Active encounter */
  encounter: Encounter;
  /** Initial form data (for editing) */
  initialData?: Partial<TriageFormData>;
  /** Submit handler */
  onSubmit: (data: TriageAssessmentCreateData) => Promise<void> | void;
  /** Cancel handler */
  onCancel: () => void;
  /** Loading state */
  isLoading?: boolean;
  /** Disabled state */
  disabled?: boolean;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate patient age from date of birth
 */
function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Get pain severity label from score
 */
function getPainSeverity(score: number | null | undefined): {
  label: string;
  color: string;
} {
  if (score === null || score === undefined) return { label: 'Not assessed', color: 'gray' };
  if (score === 0) return { label: 'None', color: 'green' };
  if (score <= 2) return { label: 'Minimal', color: 'green' };
  if (score <= 4) return { label: 'Mild', color: 'yellow' };
  if (score <= 6) return { label: 'Moderate', color: 'orange' };
  if (score <= 8) return { label: 'Severe', color: 'red' };
  return { label: 'Unbearable', color: 'red' };
}

/**
 * Vital threshold status for inline display
 */
interface VitalThresholdStatus {
  severity: 'normal' | 'warning' | 'critical' | 'emergency';
  message: string;
  icon: 'check' | 'warning' | 'critical' | 'emergency';
}

/**
 * Calculate Mean Arterial Pressure (MAP)
 * MAP = (SBP + 2 × DBP) / 3
 */
function calculateMAP(systolic: number, diastolic: number): number {
  return Math.round((systolic + 2 * diastolic) / 3);
}

/**
 * Age group classification for MAP thresholds
 */
type MAPAgeGroup = 'adult' | 'adolescent' | 'school_age' | 'young_child' | 'infant' | 'neonate';

/**
 * Get age group from age in years (for MAP thresholds)
 */
function getMAPAgeGroup(ageYears: number): MAPAgeGroup {
  if (ageYears >= 18) return 'adult';
  if (ageYears >= 13) return 'adolescent';
  if (ageYears >= 6) return 'school_age';
  if (ageYears >= 1) return 'young_child';
  if (ageYears >= 1/12) return 'infant'; // 1 month or more
  return 'neonate';
}

/**
 * MAP thresholds by age group
 * Based on clinical guidelines for organ perfusion
 */
interface MAPThresholds {
  normalLow: number;
  normalHigh: number;
  criticalLow: number;
  elevatedHigh: number;
  label: string;
}

const MAP_THRESHOLDS: Record<MAPAgeGroup, MAPThresholds> = {
  adult: {
    normalLow: 70,
    normalHigh: 100,
    criticalLow: 65,
    elevatedHigh: 105,
    label: 'Adult (≥18y)',
  },
  adolescent: {
    normalLow: 65,
    normalHigh: 95,
    criticalLow: 60,
    elevatedHigh: 100,
    label: 'Adolescent (13-17y)',
  },
  school_age: {
    normalLow: 60,
    normalHigh: 90,
    criticalLow: 55,
    elevatedHigh: 95,
    label: 'School-age (6-12y)',
  },
  young_child: {
    normalLow: 55,
    normalHigh: 85,
    criticalLow: 50,
    elevatedHigh: 90,
    label: 'Young child (1-5y)',
  },
  infant: {
    normalLow: 45,
    normalHigh: 70,
    criticalLow: 40,
    elevatedHigh: 75,
    label: 'Infant (1-12mo)',
  },
  neonate: {
    normalLow: 40,
    normalHigh: 60,
    criticalLow: 35,
    elevatedHigh: 65,
    label: 'Neonate (<1mo)',
  },
};

/**
 * Get MAP threshold status based on age
 */
function getMAPThresholdStatus(
  systolic: number | null | undefined,
  diastolic: number | null | undefined,
  patientAgeYears: number
): VitalThresholdStatus | null {
  if (systolic === null || systolic === undefined ||
      diastolic === null || diastolic === undefined) {
    return null;
  }

  const map = calculateMAP(systolic, diastolic);
  const ageGroup = getMAPAgeGroup(patientAgeYears);
  const thresholds = MAP_THRESHOLDS[ageGroup];

  // Emergency: MAP severely below critical (organ failure imminent)
  if (map < thresholds.criticalLow - 10) {
    return {
      severity: 'emergency',
      message: `EMERGENCY: Severe hypotension - MAP ${map} mmHg`,
      icon: 'emergency',
    };
  }

  // Critical: MAP below minimum for adequate organ perfusion
  if (map <= thresholds.criticalLow) {
    return {
      severity: 'critical',
      message: `Critical: Hypotension - MAP ${map} mmHg (≤${thresholds.criticalLow})`,
      icon: 'critical',
    };
  }

  // Emergency: MAP dangerously elevated (hypertensive emergency)
  if (map > thresholds.elevatedHigh + 25) {
    return {
      severity: 'emergency',
      message: `EMERGENCY: Hypertensive emergency - MAP ${map} mmHg`,
      icon: 'emergency',
    };
  }

  // Critical: Severely elevated MAP
  if (map >= thresholds.elevatedHigh + 15) {
    return {
      severity: 'critical',
      message: `Critical: Hypertension - MAP ${map} mmHg`,
      icon: 'critical',
    };
  }

  // Warning: MAP below normal range but above critical
  if (map < thresholds.normalLow) {
    return {
      severity: 'warning',
      message: `Warning: Low blood pressure - MAP ${map} mmHg`,
      icon: 'warning',
    };
  }

  // Warning: MAP elevated above normal
  if (map > thresholds.elevatedHigh) {
    return {
      severity: 'warning',
      message: `Warning: Elevated blood pressure - MAP ${map} mmHg`,
      icon: 'warning',
    };
  }

  // Normal range - return null (no badge needed)
  return null;
}

/**
 * Get vital threshold status with severity and message
 */
function getVitalThresholdStatus(
  vitalType: 'spo2' | 'heart_rate' | 'temperature' | 'respiratory_rate',
  value: number | null | undefined
): VitalThresholdStatus | null {
  if (value === null || value === undefined) return null;

  const thresholds: Record<string, { critical: [number, number]; warning: [number, number]; unit: string }> = {
    spo2: { critical: [90, Infinity], warning: [95, Infinity], unit: '%' },
    heart_rate: { critical: [40, 150], warning: [50, 100], unit: 'bpm' },
    temperature: { critical: [32, 40], warning: [36.0, 37.5], unit: '°C' },
    respiratory_rate: { critical: [8, 30], warning: [10, 24], unit: '/min' },
  };

  const config = thresholds[vitalType];
  if (!config) return null;

  const [critLow, critHigh] = config.critical;
  const [warnLow, warnHigh] = config.warning;

  // Check critical thresholds
  if (vitalType === 'spo2') {
    // SpO2 clinical severity levels (adult):
    // ≤85%: Severe hypoxemia (medical emergency)
    // 86-90%: Moderate hypoxemia (clinically significant)
    // 91-94%: Mild hypoxemia (slightly reduced)
    // 95-100%: Normal oxygenation
    if (value <= 85) {
      return { severity: 'emergency', message: `EMERGENCY: ${value}${config.unit} - Severe hypoxemia`, icon: 'emergency' };
    }
    if (value <= 90) {
      return { severity: 'critical', message: `Critical: ${value}${config.unit} - Moderate hypoxemia`, icon: 'critical' };
    }
    if (value <= 94) {
      return { severity: 'warning', message: `Warning: ${value}${config.unit} - Mild hypoxemia`, icon: 'warning' };
    }
    // 95-100% is normal, return null
  } else if (vitalType === 'temperature') {
    // Temperature - refined clinical terminology
    // Critical: <32°C (severe hypothermia), ≥40°C (high fever)
    // Warning low: 32-35°C (moderate), 35-36°C (mild hypothermia)
    // Warning high: 37.6-38.4°C (low-grade fever), 38.5-39.9°C (moderate fever)
    if (value < 32) {
      return { severity: 'critical', message: `Critical: ${value}${config.unit} - Severe hypothermia`, icon: 'critical' };
    }
    if (value >= 40) {
      return { severity: 'critical', message: `Critical: ${value}${config.unit} - High fever / Hyperpyrexia`, icon: 'critical' };
    }
    if (value >= 38.5) {
      return { severity: 'warning', message: `Warning: ${value}${config.unit} - Moderate fever`, icon: 'warning' };
    }
    if (value > 37.5) {
      return { severity: 'warning', message: `Warning: ${value}${config.unit} - Low-grade fever`, icon: 'warning' };
    }
    if (value < 35) {
      return { severity: 'warning', message: `Warning: ${value}${config.unit} - Moderate hypothermia`, icon: 'warning' };
    }
    if (value < 36) {
      return { severity: 'warning', message: `Warning: ${value}${config.unit} - Mild hypothermia`, icon: 'warning' };
    }
  } else if (vitalType === 'heart_rate') {
    // Heart rate - use clinical terminology
    if (value < critLow) {
      return { severity: 'critical', message: `Critical: ${value}${config.unit} - Severe bradycardia`, icon: 'critical' };
    }
    if (value > critHigh) {
      return { severity: 'critical', message: `Critical: ${value}${config.unit} - Severe tachycardia`, icon: 'critical' };
    }
    if (value < warnLow) {
      return { severity: 'warning', message: `Warning: ${value}${config.unit} - Bradycardia`, icon: 'warning' };
    }
    if (value > warnHigh) {
      return { severity: 'warning', message: `Warning: ${value}${config.unit} - Tachycardia`, icon: 'warning' };
    }
  } else if (vitalType === 'respiratory_rate') {
    // Respiratory rate - use clinical terminology
    if (value < critLow) {
      return { severity: 'critical', message: `Critical: ${value}${config.unit} - Respiratory depression`, icon: 'critical' };
    }
    if (value > critHigh) {
      return { severity: 'critical', message: `Critical: ${value}${config.unit} - Respiratory distress`, icon: 'critical' };
    }
    if (value < warnLow) {
      return { severity: 'warning', message: `Warning: ${value}${config.unit} - Bradypnea`, icon: 'warning' };
    }
    if (value > warnHigh) {
      return { severity: 'warning', message: `Warning: ${value}${config.unit} - Tachypnea`, icon: 'warning' };
    }
  }

  return null; // Normal
}

/**
 * Get age-specific normal range hint for a vital sign.
 * Returns a short string like "Normal: 100-150 bpm" or null for SpO2 (same for all ages).
 */
function getVitalRangeHint(
  vitalType: 'heart_rate' | 'respiratory_rate' | 'temperature',
  ageGroup: AgeGroup
): string | null {
  const ranges: Record<string, Record<AgeGroup, string>> = {
    heart_rate: {
      neonate: '100-160 bpm',
      infant: '100-150 bpm',
      toddler: '80-130 bpm',
      preschool: '80-120 bpm',
      child: '70-110 bpm',
      adolescent: '60-100 bpm',
      adult: '60-100 bpm',
    },
    respiratory_rate: {
      neonate: '30-60 /min',
      infant: '25-50 /min',
      toddler: '20-30 /min',
      preschool: '20-30 /min',
      child: '18-25 /min',
      adolescent: '12-20 /min',
      adult: '12-20 /min',
    },
    temperature: {
      neonate: '36.5-37.5 °C',
      infant: '36.0-37.5 °C',
      toddler: '36.0-37.5 °C',
      preschool: '36.0-37.5 °C',
      child: '36.0-37.5 °C',
      adolescent: '36.0-37.5 °C',
      adult: '36.0-37.5 °C',
    },
  };
  const range = ranges[vitalType]?.[ageGroup];
  if (!range) return null;
  // Only show for pediatric patients (adults don't need the hint since thresholds match the badge)
  if (ageGroup === 'adult' || ageGroup === 'adolescent') return null;
  return `Normal (${ageGroup}): ${range}`;
}

/**
 * Inline vital alert badge component
 * Color coding:
 * - Emergency: Dark red/purple (life-threatening)
 * - Critical: Red (requires immediate attention)
 * - Warning: Amber/Orange (monitor closely)
 */
function VitalThresholdBadge({ status }: { status: VitalThresholdStatus }) {
  if (status.severity === 'emergency') {
    return (
      <div className="flex items-center gap-1.5 mt-1.5 p-2 rounded-md bg-rose-100 dark:bg-rose-950/70 border-2 border-rose-500 dark:border-rose-600">
        <AlertCircle className="h-4 w-4 text-rose-700 dark:text-rose-300 shrink-0 animate-pulse" />
        <span className="text-xs font-bold text-rose-800 dark:text-rose-200">{status.message}</span>
      </div>
    );
  }

  if (status.severity === 'critical') {
    return (
      <div className="flex items-center gap-1.5 mt-1.5 p-2 rounded-md bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-700">
        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
        <span className="text-xs font-medium text-red-700 dark:text-red-300">{status.message}</span>
      </div>
    );
  }

  if (status.severity === 'warning') {
    return (
      <div className="flex items-center gap-1.5 mt-1.5 p-2 rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-xs font-medium text-amber-700 dark:text-amber-300">{status.message}</span>
      </div>
    );
  }

  return null;
}

/**
 * Generate triage alerts from assessment data and vitals
 * This is a frontend fallback when backend calculate-category API fails or is slow
 */
function generateTriageAlerts(
  formData: Partial<TriageFormData>,
  encounter: Encounter
): TriageAlert[] {
  const alerts: TriageAlert[] = [];

  // Check for AVPU = U (Unresponsive)
  if (formData.mental_status === 'U') {
    alerts.push({
      id: 'avpu-unresponsive',
      severity: 'CRITICAL',
      vital_type: 'MENTAL_STATUS',
      message: 'CRITICAL: Unresponsive patient - Immediate attention required',
      value: 0,
      threshold: 0,
      clinical_note: 'Patient is unresponsive (AVPU = U). Immediate intervention required.',
    });
  }

  // Check for AVPU = P (Responds to Pain)
  if (formData.mental_status === 'P') {
    alerts.push({
      id: 'avpu-pain',
      severity: 'CRITICAL',
      vital_type: 'MENTAL_STATUS',
      message: 'CRITICAL: Patient only responds to pain',
      value: 0,
      threshold: 0,
      clinical_note: 'Patient responds only to pain (AVPU = P). Urgent assessment required.',
    });
  }

  // Check Glasgow Coma Scale
  const gcsEye = formData.gcs_eye;
  const gcsVerbal = formData.gcs_verbal;
  const gcsMotor = formData.gcs_motor;
  if (gcsEye && gcsVerbal && gcsMotor) {
    const gcsTotal = gcsEye + gcsVerbal + gcsMotor;
    if (gcsTotal <= 8) {
      alerts.push({
        id: 'gcs-severe',
        severity: 'CRITICAL',
        vital_type: 'GCS',
        message: `Severe brain injury - GCS ${gcsTotal}/15`,
        value: gcsTotal,
        threshold: 8,
        clinical_note: 'GCS ≤8 indicates severe brain injury. Patient may require intubation. Immediate neurosurgical assessment recommended.',
      });
    } else if (gcsTotal <= 12) {
      alerts.push({
        id: 'gcs-moderate',
        severity: 'WARNING',
        vital_type: 'GCS',
        message: `Moderate brain injury - GCS ${gcsTotal}/15`,
        value: gcsTotal,
        threshold: 12,
        clinical_note: 'GCS 9-12 indicates moderate brain injury. Close neurological monitoring required. Consider CT head scan.',
      });
    }
  }

  // Check SpO2 - backend tiers: ≤85% severe critical, 86-90% moderate critical, 91-94% warning
  const spo2Value = typeof formData.spo2 === 'number' ? formData.spo2 : encounter.spo2;
  if (spo2Value !== undefined && spo2Value !== null) {
    if (spo2Value <= 85) {
      alerts.push({
        id: 'spo2-critical-severe',
        severity: 'CRITICAL',
        vital_type: 'SPO2',
        message: `Severe hypoxemia - SpO2 ${spo2Value}%`,
        value: spo2Value,
        threshold: 85,
        clinical_note: 'Life-threatening hypoxia - high-flow oxygen, prepare intubation',
      });
    } else if (spo2Value <= 90) {
      alerts.push({
        id: 'spo2-critical-moderate',
        severity: 'CRITICAL',
        vital_type: 'SPO2',
        message: `Moderate hypoxemia - SpO2 ${spo2Value}%`,
        value: spo2Value,
        threshold: 90,
        clinical_note: 'Significant hypoxia - supplemental oxygen required',
      });
    } else if (spo2Value < 95) {
      alerts.push({
        id: 'spo2-warning',
        severity: 'WARNING',
        vital_type: 'SPO2',
        message: `Low oxygen saturation - SpO2 ${spo2Value}%`,
        value: spo2Value,
        threshold: 95,
        clinical_note: 'Monitor closely, consider supplemental oxygen',
      });
    }
  }

  // Check Heart Rate
  const heartRate = typeof formData.heart_rate === 'number' ? formData.heart_rate : encounter.pulse;
  if (heartRate !== undefined && heartRate !== null) {
    if (heartRate < 40) {
      alerts.push({
        id: 'hr-critical-low',
        severity: 'CRITICAL',
        vital_type: 'HEART_RATE',
        message: `Severe bradycardia - ${heartRate} bpm`,
        value: heartRate,
        threshold: 40,
        clinical_note: 'Check cardiac rhythm, consider atropine',
      });
    } else if (heartRate > 150) {
      alerts.push({
        id: 'hr-critical-high',
        severity: 'CRITICAL',
        vital_type: 'HEART_RATE',
        message: `Severe tachycardia - ${heartRate} bpm`,
        value: heartRate,
        threshold: 150,
        clinical_note: 'Assess for underlying cause',
      });
    } else if (heartRate < 50) {
      alerts.push({
        id: 'hr-warning-low',
        severity: 'WARNING',
        vital_type: 'HEART_RATE',
        message: `Bradycardia - ${heartRate} bpm`,
        value: heartRate,
        threshold: 50,
        clinical_note: 'Monitor for symptoms',
      });
    } else if (heartRate > 100) {
      alerts.push({
        id: 'hr-warning-high',
        severity: 'WARNING',
        vital_type: 'HEART_RATE',
        message: `Tachycardia - ${heartRate} bpm`,
        value: heartRate,
        threshold: 100,
        clinical_note: 'Monitor closely',
      });
    }
  }

  // Check Systolic BP
  const systolicBp = formData.systolic_bp;
  if (typeof systolicBp === 'number') {
    if (systolicBp < 90) {
      alerts.push({
        id: 'bp-critical-low',
        severity: 'CRITICAL',
        vital_type: 'SYSTOLIC_BP',
        message: `Severe hypotension - systolic ${systolicBp} mmHg`,
        value: systolicBp,
        threshold: 90,
        clinical_note: 'Check for shock, sepsis, or bleeding',
      });
    } else if (systolicBp > 180) {
      alerts.push({
        id: 'bp-critical-high',
        severity: 'CRITICAL',
        vital_type: 'SYSTOLIC_BP',
        message: `Hypertensive crisis - systolic ${systolicBp} mmHg`,
        value: systolicBp,
        threshold: 180,
        clinical_note: 'Immediate intervention required',
      });
    } else if (systolicBp < 100) {
      alerts.push({
        id: 'bp-warning-low',
        severity: 'WARNING',
        vital_type: 'SYSTOLIC_BP',
        message: `Low blood pressure - systolic ${systolicBp} mmHg`,
        value: systolicBp,
        threshold: 100,
        clinical_note: 'Monitor closely',
      });
    } else if (systolicBp > 140) {
      alerts.push({
        id: 'bp-warning-high',
        severity: 'WARNING',
        vital_type: 'SYSTOLIC_BP',
        message: `Elevated blood pressure - systolic ${systolicBp} mmHg`,
        value: systolicBp,
        threshold: 140,
        clinical_note: 'Monitor and reassess',
      });
    }
  }

  // Check Temperature - refined thresholds:
  // Critical: <32°C (severe hypothermia), ≥40°C (high fever)
  // Warning low: 32-35°C (moderate), 35-36°C (mild hypothermia)
  // Warning high: 37.6-38.4°C (low-grade fever), 38.5-39.9°C (moderate fever)
  // Normal: 36-37.5°C
  const temperature = typeof formData.temperature === 'number' ? formData.temperature : encounter.temperature;
  if (temperature !== undefined && temperature !== null) {
    if (temperature < 32) {
      alerts.push({
        id: 'temp-critical-severe-hypothermia',
        severity: 'CRITICAL',
        vital_type: 'TEMPERATURE',
        message: `Severe hypothermia - ${temperature}°C`,
        value: temperature,
        threshold: 32,
        clinical_note: 'Life-threatening; risk of cardiac arrest',
      });
    } else if (temperature >= 40) {
      alerts.push({
        id: 'temp-critical-high-fever',
        severity: 'CRITICAL',
        vital_type: 'TEMPERATURE',
        message: `High fever / Hyperpyrexia - ${temperature}°C`,
        value: temperature,
        threshold: 40,
        clinical_note: 'Potentially life-threatening; urgent evaluation needed',
      });
    } else if (temperature >= 38.5) {
      alerts.push({
        id: 'temp-warning-moderate-fever',
        severity: 'WARNING',
        vital_type: 'TEMPERATURE',
        message: `Moderate fever - ${temperature}°C`,
        value: temperature,
        threshold: 38.5,
        clinical_note: 'Clinical attention may be required',
      });
    } else if (temperature > 37.5) {
      alerts.push({
        id: 'temp-warning-low-grade-fever',
        severity: 'WARNING',
        vital_type: 'TEMPERATURE',
        message: `Low-grade fever - ${temperature}°C`,
        value: temperature,
        threshold: 37.5,
        clinical_note: 'Usually mild, often infection-related',
      });
    } else if (temperature < 35) {
      alerts.push({
        id: 'temp-warning-moderate-hypothermia',
        severity: 'WARNING',
        vital_type: 'TEMPERATURE',
        message: `Moderate hypothermia - ${temperature}°C`,
        value: temperature,
        threshold: 35,
        clinical_note: 'Symptoms: shivering, confusion, slurred speech',
      });
    } else if (temperature < 36) {
      alerts.push({
        id: 'temp-warning-mild-hypothermia',
        severity: 'WARNING',
        vital_type: 'TEMPERATURE',
        message: `Mild hypothermia - ${temperature}°C`,
        value: temperature,
        threshold: 36,
        clinical_note: 'Usually mild, monitor closely',
      });
    }
  }

  // Check Pain Score
  const painScore = formData.pain_score;
  if (typeof painScore === 'number' && painScore >= 7) {
    alerts.push({
      id: painScore >= 9 ? 'pain-critical' : 'pain-warning',
      severity: painScore >= 9 ? 'CRITICAL' : 'WARNING',
      vital_type: 'PAIN_SCORE',
      message: `${painScore >= 9 ? 'Severe' : 'Significant'} pain - ${painScore}/10`,
      value: painScore,
      threshold: painScore >= 9 ? 9 : 7,
      clinical_note: painScore >= 9 ? 'Immediate analgesia needed' : 'Pain management needed',
    });
  }

  // Check Respiratory Rate - thresholds: critical_low=8, critical_high=30, warning_low=10, warning_high=24
  const respiratoryRate = formData.respiratory_rate;
  if (typeof respiratoryRate === 'number') {
    if (respiratoryRate < 8) {
      alerts.push({
        id: 'rr-critical-low',
        severity: 'CRITICAL',
        vital_type: 'RESPIRATORY_RATE',
        message: `Respiratory depression - ${respiratoryRate}/min`,
        value: respiratoryRate,
        threshold: 8,
        clinical_note: 'Assess airway, consider reversal agents',
      });
    } else if (respiratoryRate > 30) {
      alerts.push({
        id: 'rr-critical-high',
        severity: 'CRITICAL',
        vital_type: 'RESPIRATORY_RATE',
        message: `Respiratory distress - ${respiratoryRate}/min`,
        value: respiratoryRate,
        threshold: 30,
        clinical_note: 'Assess for hypoxia, consider oxygen',
      });
    } else if (respiratoryRate < 10) {
      alerts.push({
        id: 'rr-warning-low',
        severity: 'WARNING',
        vital_type: 'RESPIRATORY_RATE',
        message: `Bradypnea - ${respiratoryRate}/min`,
        value: respiratoryRate,
        threshold: 10,
        clinical_note: 'Monitor closely',
      });
    } else if (respiratoryRate > 24) {
      alerts.push({
        id: 'rr-warning-high',
        severity: 'WARNING',
        vital_type: 'RESPIRATORY_RATE',
        message: `Tachypnea - ${respiratoryRate}/min`,
        value: respiratoryRate,
        threshold: 24,
        clinical_note: 'Investigate cause',
      });
    }
  }

  // Check Diastolic BP - thresholds: critical_high=120, warning_high=90
  const diastolicBp = formData.diastolic_bp;
  if (typeof diastolicBp === 'number') {
    if (diastolicBp > 120) {
      alerts.push({
        id: 'dbp-critical-high',
        severity: 'CRITICAL',
        vital_type: 'DIASTOLIC_BP',
        message: `Diastolic hypertensive crisis - ${diastolicBp} mmHg`,
        value: diastolicBp,
        threshold: 120,
        clinical_note: 'Risk of end-organ damage',
      });
    } else if (diastolicBp > 90) {
      alerts.push({
        id: 'dbp-warning-high',
        severity: 'WARNING',
        vital_type: 'DIASTOLIC_BP',
        message: `Elevated diastolic BP - ${diastolicBp} mmHg`,
        value: diastolicBp,
        threshold: 90,
        clinical_note: 'Monitor and reassess',
      });
    }
  }

  return alerts;
}

/**
 * Calculate suggested triage category based on vitals and assessment
 * Uses MAP (Mean Arterial Pressure) for blood pressure evaluation
 */
function calculateSuggestedCategory(
  formData: Partial<TriageFormData>,
  encounter: Encounter,
  patientAgeYears: number = 30 // Default to adult if age unknown
): TriageCategory {
  const spo2 = typeof formData.spo2 === 'number' ? formData.spo2 : encounter.spo2;
  const heartRate =
    typeof formData.heart_rate === 'number' ? formData.heart_rate : encounter.pulse;
  const systolicBp = typeof formData.systolic_bp === 'number' ? formData.systolic_bp : undefined;
  const diastolicBp =
    typeof formData.diastolic_bp === 'number' ? formData.diastolic_bp : undefined;
  const temperature =
    typeof formData.temperature === 'number' ? formData.temperature : encounter.temperature;
  const respiratoryRate =
    typeof formData.respiratory_rate === 'number'
      ? formData.respiratory_rate
      : encounter.respiratory_rate;

  // --- ETAT danger signs → immediate RED (children <12y) ---
  if (formData.etat_danger_signs && formData.etat_danger_signs.length > 0) {
    return 'RED';
  }

  // --- ETAT dehydration ---
  if (formData.dehydration_level === 'SEVERE') return 'RED';

  // --- Capillary refill ---
  if (typeof formData.capillary_refill_seconds === 'number') {
    if (formData.capillary_refill_seconds >= 5) return 'RED';
  }

  // --- Fontanelle: bulging → RED (meningitis sign) ---
  if (formData.fontanelle_status === 'BULGING') return 'RED';

  // --- Unable to breastfeed for neonate/infant → RED ---
  if (formData.breastfeeding_ability === 'UNABLE' && patientAgeYears < 1) return 'RED';

  // Calculate MAP if both BP values are present
  let mapCritical = false;
  if (typeof systolicBp === 'number' && typeof diastolicBp === 'number') {
    const map = calculateMAP(systolicBp, diastolicBp);
    const ageGroup = getMAPAgeGroup(patientAgeYears);
    const thresholds = MAP_THRESHOLDS[ageGroup];
    mapCritical = map < thresholds.criticalLow || map > thresholds.elevatedHigh + 15;
  }

  // Critical conditions → RED
  if (formData.mental_status === 'U') return 'RED';
  const gcsEye = formData.gcs_eye;
  const gcsVerbal = formData.gcs_verbal;
  const gcsMotor = formData.gcs_motor;
  if (gcsEye && gcsVerbal && gcsMotor) {
    const gcsTotal = gcsEye + gcsVerbal + gcsMotor;
    if (gcsTotal <= 8) return 'RED';
  }
  if (typeof spo2 === 'number' && spo2 <= 90) return 'RED';
  if (typeof heartRate === 'number' && (heartRate < 40 || heartRate > 150))
    return 'RED';
  if (mapCritical) return 'RED';
  if (typeof temperature === 'number' && (temperature < 32 || temperature >= 40))
    return 'RED';

  // --- ETAT ORANGE-level escalations ---
  if (formData.dehydration_level === 'SOME') return 'ORANGE';
  if (typeof formData.capillary_refill_seconds === 'number' && formData.capillary_refill_seconds >= 3) {
    return 'ORANGE';
  }
  if (typeof formData.muac_cm === 'number' && formData.muac_cm < 11.5) return 'ORANGE';
  if (formData.fontanelle_status === 'SUNKEN') return 'ORANGE';
  if (formData.breastfeeding_ability === 'REDUCED') return 'ORANGE';

  // High-risk complaints or warning vitals → ORANGE
  const highRiskComplaints: ChiefComplaintCategory[] = [
    'CHEST_PAIN',
    'DIFFICULTY_BREATHING',
    'ALTERED_CONSCIOUSNESS',
  ];
  if (
    formData.chief_complaint_category &&
    highRiskComplaints.includes(formData.chief_complaint_category)
  ) {
    return 'ORANGE';
  }
  if (
    formData.chief_complaint_category === 'DIFFICULTY_BREATHING' &&
    typeof spo2 === 'number' &&
    spo2 < 95
  ) {
    return 'ORANGE';
  }
  if (typeof spo2 === 'number' && spo2 < 95) return 'ORANGE';
  if (formData.mental_status === 'P') return 'ORANGE';
  // GCS 9-12 (moderate brain injury) → ORANGE
  if (gcsEye && gcsVerbal && gcsMotor) {
    const gcsTotal = gcsEye + gcsVerbal + gcsMotor;
    if (gcsTotal >= 9 && gcsTotal <= 12) return 'ORANGE';
  }
  // Moderate hypothermia (32-35°C) or moderate fever (38.5-39.9°C) → ORANGE
  if (typeof temperature === 'number' && ((temperature >= 32 && temperature < 35) || temperature >= 38.5))
    return 'ORANGE';

  // Moderate conditions → YELLOW
  if (formData.pain_score !== null && formData.pain_score !== undefined && formData.pain_score >= 7)
    return 'YELLOW';
  if (formData.mental_status === 'V') return 'YELLOW';
  // Mild hypothermia (35-36°C) or low-grade fever (37.6-38.4°C) → YELLOW
  if (typeof temperature === 'number' && ((temperature >= 35 && temperature < 36) || temperature > 37.5))
    return 'YELLOW';
  // Respiratory rate outside warning thresholds (<10 or >24)
  if (
    typeof respiratoryRate === 'number' &&
    (respiratoryRate < 10 || respiratoryRate > 24)
  ) {
    return 'YELLOW';
  }

  // Stable conditions → GREEN
  if (formData.mental_status === 'A') return 'GREEN';

  // Non-urgent → BLUE
  return 'BLUE';
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * TriageAssessmentForm - Main triage assessment form
 *
 * Features:
 * - Patient arrival information (mode, time)
 * - Chief complaint category and details
 * - Pain score with visual scale (0-10)
 * - AVPU mental status assessment
 * - Mobility status
 * - Allergies (pre-populated from patient record)
 * - KETA triage category selection with auto-suggestion
 * - Category override with mandatory reason
 * - Care area routing
 * - Form validation with error messages
 * - Accessibility support
 */
export function TriageAssessmentForm({
  patient,
  encounter,
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  disabled = false,
}: TriageAssessmentFormProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [showVitals, setShowVitals] = React.useState(true);
  const [backendAlerts, setBackendAlerts] = React.useState<TriageAlert[] | null>(null);

  // Routing mode: 'emergency' for ER zones, 'clinic' for clinic routing
  const [routingMode, setRoutingMode] = React.useState<'emergency' | 'clinic'>(
    initialData?.assigned_clinic ? 'clinic' : 'emergency'
  );
  const [clinicSearch, setClinicSearch] = React.useState('');
  const [clinicListExpanded, setClinicListExpanded] = React.useState(
    !initialData?.assigned_clinic // Collapse if a clinic is already selected
  );

  // Fetch active clinics for routing
  const { data: clinicsData, isLoading: clinicsLoading } = useClinics({
    status: 'ACTIVE',
  });
  const clinics = React.useMemo(() => clinicsData?.results ?? [], [clinicsData?.results]);

  // Filter clinics by search
  const filteredClinics = React.useMemo(() => {
    if (!clinicSearch.trim()) return clinics;
    const query = clinicSearch.toLowerCase();
    return clinics.filter(
      (clinic) =>
        clinic.name.toLowerCase().includes(query) ||
        clinic.clinic_type_display.toLowerCase().includes(query)
    );
  }, [clinics, clinicSearch]);

  const calculateCategoryMutation = useCalculateTriageCategory();

  // Use initialData's category if provided, otherwise calculate locally as fallback
  const initialSuggested = initialData?.auto_calculated_category ||
    initialData?.triage_category ||
    calculateSuggestedCategory(initialData || {}, encounter);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TriageFormData>({
    resolver: zodResolver(triageFormSchema),
    defaultValues: {
      arrival_mode: initialData?.arrival_mode || 'WALK_IN',
      // Use encounter creation time as arrival time (when patient was registered)
      arrival_time: initialData?.arrival_time ||
        (encounter.created_at ? new Date(encounter.created_at).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16)),
      chief_complaint_category: initialData?.chief_complaint_category,
      chief_complaint: initialData?.chief_complaint || '',
      pain_score: initialData?.pain_score ?? null,

      spo2: null,
      heart_rate: null,
      systolic_bp: null,
      diastolic_bp: null,
      temperature: null,
      respiratory_rate: null,
      weight: null,
      height: null,

      mental_status: initialData?.mental_status || 'A',
      // Glasgow Coma Scale (optional)
      gcs_eye: null,
      gcs_verbal: null,
      gcs_motor: null,
      mobility: initialData?.mobility || 'AMBULATORY',
      allergies_noted: initialData?.allergies_noted || patient.allergies || '',
      triage_category: initialData?.triage_category,
      auto_calculated_category:
        initialData?.auto_calculated_category ||
        initialData?.triage_category ||
        initialSuggested,
      category_override_reason: initialData?.category_override_reason || '',
      // ETAT pediatric fields
      etat_danger_signs: [],
      dehydration_level: '',
      fontanelle_status: '',
      breastfeeding_ability: '',
      capillary_refill_seconds: null,
      muac_cm: null,
      assigned_area: initialData?.assigned_area || '',
      assigned_clinic: initialData?.assigned_clinic ?? null,
      assigned_clinician: initialData?.assigned_clinician || null,
    },
  });

  // Watch form values for dynamic updates
  const watchedValues = watch();
  const painScore = watchedValues.pain_score;
  const mentalStatus = watchedValues.mental_status;
  const selectedCategory = watchedValues.triage_category;
  const autoCalculatedCategory = watchedValues.auto_calculated_category;
  const chiefComplaintCategory = watchedValues.chief_complaint_category;

  const spo2 = watchedValues.spo2;
  const heartRate = watchedValues.heart_rate;
  const systolicBp = watchedValues.systolic_bp;
  const diastolicBp = watchedValues.diastolic_bp;
  const temperature = watchedValues.temperature;
  const respiratoryRate = watchedValues.respiratory_rate;
  const weight = watchedValues.weight;
  const height = watchedValues.height;

  // Calculate patient age for MAP thresholds
  const patientAge = calculateAge(patient.date_of_birth);

  // Calculate patient age group for ETAT conditional rendering
  const patientAgeGroup = getAgeGroup(patient.date_of_birth);
  const showPediatricSection = isPediatric(patientAgeGroup);
  const showNeonatalFields = isNeonateOrInfant(patientAgeGroup);

  // Get threshold status for each vital (for inline badges)
  const spo2Status = getVitalThresholdStatus('spo2', spo2);
  const heartRateStatus = getVitalThresholdStatus('heart_rate', heartRate);
  const temperatureStatus = getVitalThresholdStatus('temperature', temperature);
  const respiratoryRateStatus = getVitalThresholdStatus('respiratory_rate', respiratoryRate);

  // MAP-based blood pressure evaluation (age-adjusted)
  const mapStatus = getMAPThresholdStatus(systolicBp, diastolicBp, patientAge);
  const mapValue = (systolicBp != null && diastolicBp != null)
    ? calculateMAP(systolicBp, diastolicBp)
    : null;

  // Critical flags for input border styling
  // Emergency flags (higher than critical)
  const spo2Emergency = spo2Status?.severity === 'emergency';

  const spo2Critical = spo2Status?.severity === 'critical';
  const heartRateCritical = heartRateStatus?.severity === 'critical';
  const bpCritical = mapStatus?.severity === 'critical';
  const temperatureCritical = temperatureStatus?.severity === 'critical';
  const respiratoryRateCritical = respiratoryRateStatus?.severity === 'critical';

  // Calculate BMI when weight and height are available
  const bmiResult = calculateBMI(
    weight ?? null,
    height ?? null,
    patient.date_of_birth,
    patient.gender
  );

  // Warning flags for amber border
  const spo2Warning = spo2Status?.severity === 'warning';
  const heartRateWarning = heartRateStatus?.severity === 'warning';
  const bpWarning = mapStatus?.severity === 'warning';
  const temperatureWarning = temperatureStatus?.severity === 'warning';
  const respiratoryRateWarning = respiratoryRateStatus?.severity === 'warning';

  // Normal/success flags - value is present AND within normal range (no alert)
  const spo2Normal = spo2 != null && !spo2Status;
  const heartRateNormal = heartRate != null && !heartRateStatus;
  const bpNormal = systolicBp != null && diastolicBp != null && !mapStatus;
  const temperatureNormal = temperature != null && !temperatureStatus;
  const respiratoryRateNormal = respiratoryRate != null && !respiratoryRateStatus;

  // Recalculate suggested category when relevant fields change
  // Skip recalculation if the category was provided via initialData (backend is source of truth)
  const hasInitialCategory = Boolean(initialData?.auto_calculated_category || initialData?.triage_category);
  const [hasUserInteracted, setHasUserInteracted] = React.useState(false);

  // Track when user actually interacts with category-relevant fields
  const prevChiefComplaintCategory = React.useRef(chiefComplaintCategory);
  const prevMentalStatus = React.useRef(mentalStatus);

  React.useEffect(() => {
    // Detect user interaction (field value changed from initial)
    if (
      chiefComplaintCategory !== prevChiefComplaintCategory.current ||
      mentalStatus !== prevMentalStatus.current
    ) {
      setHasUserInteracted(true);
    }
    prevChiefComplaintCategory.current = chiefComplaintCategory;
    prevMentalStatus.current = mentalStatus;
  }, [chiefComplaintCategory, mentalStatus]);

  React.useEffect(() => {
    // If category was provided in initialData and user hasn't interacted, respect initial value
    if (hasInitialCategory && !hasUserInteracted) {
      return;
    }

    if (!chiefComplaintCategory) return;

    // Local calculation is a fallback when no vitals are entered
    // Backend calculation (via useEffect below) takes precedence when vitals are provided
    const newSuggested = calculateSuggestedCategory(
      {
        mental_status: mentalStatus,
        chief_complaint_category: chiefComplaintCategory,
        pain_score: painScore,
        spo2,
        heart_rate: heartRate,
        systolic_bp: systolicBp,
        diastolic_bp: diastolicBp,
        temperature,
        respiratory_rate: respiratoryRate,
        // ETAT fields for pediatric category preview
        etat_danger_signs: watchedValues.etat_danger_signs,
        dehydration_level: watchedValues.dehydration_level,
        fontanelle_status: watchedValues.fontanelle_status,
        breastfeeding_ability: watchedValues.breastfeeding_ability,
        capillary_refill_seconds: watchedValues.capillary_refill_seconds,
        muac_cm: watchedValues.muac_cm,
      },
      encounter,
      patientAge
    );
    if (newSuggested !== autoCalculatedCategory) {
      setValue('auto_calculated_category', newSuggested);
    }
  }, [
    mentalStatus,
    chiefComplaintCategory,
    painScore,
    spo2,
    heartRate,
    systolicBp,
    diastolicBp,
    temperature,
    respiratoryRate,
    encounter,
    setValue,
    autoCalculatedCategory,
    hasInitialCategory,
    hasUserInteracted,
    patientAge,
    watchedValues.etat_danger_signs,
    watchedValues.dehydration_level,
    watchedValues.fontanelle_status,
    watchedValues.breastfeeding_ability,
    watchedValues.capillary_refill_seconds,
    watchedValues.muac_cm,
  ]);

  // Use backend calculate-category when vitals are provided
  React.useEffect(() => {
    const hasAnyVitals = [
      spo2,
      heartRate,
      systolicBp,
      diastolicBp,
      temperature,
      respiratoryRate,
    ].some((value) => typeof value === 'number' && !Number.isNaN(value));

    if (!hasAnyVitals) {
      if (backendAlerts !== null) setBackendAlerts(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      (async () => {
        try {
          const response = await calculateCategoryMutation.mutateAsync({
            spo2: typeof spo2 === 'number' ? spo2 : undefined,
            heart_rate: typeof heartRate === 'number' ? heartRate : undefined,
            systolic_bp: typeof systolicBp === 'number' ? systolicBp : undefined,
            diastolic_bp: typeof diastolicBp === 'number' ? diastolicBp : undefined,
            temperature: typeof temperature === 'number' ? temperature : undefined,
            respiratory_rate:
              typeof respiratoryRate === 'number' ? respiratoryRate : undefined,
            mental_status: mentalStatus,
            chief_complaint_category: chiefComplaintCategory || 'OTHER',
            pain_score: typeof painScore === 'number' ? painScore : undefined,
            mobility: watchedValues.mobility,
            // ETAT fields for pediatric category calculation
            patient_age_years: patientAge,
            etat_danger_signs: watchedValues.etat_danger_signs?.length
              ? watchedValues.etat_danger_signs
              : undefined,
            dehydration_level: watchedValues.dehydration_level || undefined,
            fontanelle_status: watchedValues.fontanelle_status || undefined,
            breastfeeding_ability: watchedValues.breastfeeding_ability || undefined,
            capillary_refill_seconds:
              typeof watchedValues.capillary_refill_seconds === 'number'
                ? watchedValues.capillary_refill_seconds
                : undefined,
            muac_cm:
              typeof watchedValues.muac_cm === 'number'
                ? watchedValues.muac_cm
                : undefined,
          });

          if (cancelled) return;

          setBackendAlerts(response.alerts || []);
          if (
            response.suggested_category &&
            response.suggested_category !== autoCalculatedCategory
          ) {
            setValue('auto_calculated_category', response.suggested_category);
          }
        } catch {
          if (cancelled) return;
          setBackendAlerts(null);
        }
      })();
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- calculateCategoryMutation, autoCalculatedCategory, backendAlerts, setValue intentionally excluded to prevent infinite re-render loop
  }, [
    spo2,
    heartRate,
    systolicBp,
    diastolicBp,
    temperature,
    respiratoryRate,
    mentalStatus,
    chiefComplaintCategory,
    painScore,
    watchedValues.mobility,
    patientAge,
    watchedValues.etat_danger_signs,
    watchedValues.dehydration_level,
    watchedValues.fontanelle_status,
    watchedValues.breastfeeding_ability,
    watchedValues.capillary_refill_seconds,
    watchedValues.muac_cm,
  ]);

  // Generate alerts: prefer backend alerts if available, otherwise use local fallback
  // Always compute local alerts for immediate feedback while backend loads
  const localAlerts = generateTriageAlerts(watchedValues, encounter);
  // Use backend alerts when available (even if empty), otherwise use local
  const alerts = backendAlerts !== null ? backendAlerts : localAlerts;

  // Check if category differs from suggested
  const categoryOverridden =
    autoCalculatedCategory && selectedCategory && selectedCategory !== autoCalculatedCategory;

  // Pain severity
  const painSeverity = getPainSeverity(painScore);

  // Form submission
  const onFormSubmit = async (data: TriageFormData) => {
    // Debug: Log vitals being submitted
    console.log('[TriageAssessmentForm] Submitting form with vitals:', {
      spo2: data.spo2,
      heart_rate: data.heart_rate,
      systolic_bp: data.systolic_bp,
      diastolic_bp: data.diastolic_bp,
      temperature: data.temperature,
      respiratory_rate: data.respiratory_rate,
      weight: data.weight,
      height: data.height,
    });
    
    setIsSubmitting(true);
    try {
      await onSubmit({
        encounter: encounter.id,
        arrival_mode: data.arrival_mode,
        arrival_time: data.arrival_time,
        chief_complaint_category: data.chief_complaint_category,
        chief_complaint: data.chief_complaint,
        pain_score: data.pain_score,
        spo2: data.spo2,
        heart_rate: data.heart_rate,
        systolic_bp: data.systolic_bp,
        diastolic_bp: data.diastolic_bp,
        temperature: data.temperature,
        respiratory_rate: data.respiratory_rate,
        weight: data.weight,
        height: data.height,
        mental_status: data.mental_status,
        // Glasgow Coma Scale (optional)
        gcs_eye: data.gcs_eye,
        gcs_verbal: data.gcs_verbal,
        gcs_motor: data.gcs_motor,
        mobility: data.mobility,
        allergies_noted: data.allergies_noted,
        triage_category: data.triage_category,
        auto_calculated_category: data.auto_calculated_category,
        category_override_reason: data.category_override_reason,
        // ETAT pediatric fields (only send non-empty values)
        etat_danger_signs: data.etat_danger_signs?.length ? data.etat_danger_signs as EtATDangerSign[] : undefined,
        dehydration_level: data.dehydration_level || undefined,
        fontanelle_status: data.fontanelle_status || undefined,
        breastfeeding_ability: data.breastfeeding_ability || undefined,
        capillary_refill_seconds: data.capillary_refill_seconds,
        muac_cm: data.muac_cm,
        // Routing: use routingMode state to determine which field to send
        // Clinic mode: send assigned_clinic, clear assigned_area
        // Emergency mode: send assigned_area, clear assigned_clinic
        assigned_area: routingMode === 'clinic' ? undefined : data.assigned_area,
        assigned_clinic: routingMode === 'emergency' ? undefined : data.assigned_clinic,
        assigned_clinician: data.assigned_clinician,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const age = calculateAge(patient.date_of_birth);
  const genderDisplay = patient.gender === 'M' ? 'Male' : patient.gender === 'F' ? 'Female' : 'Other';

  return (
    <form
      role="form"
      onSubmit={handleSubmit(onFormSubmit)}
      className="space-y-6"
    >
      {/* Patient Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <User className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">
                  {patient.first_name} {patient.last_name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {patient.mrn} • {age} yrs • {genderDisplay}
                </p>
              </div>
            </div>
            {autoCalculatedCategory && (
              <div data-testid="suggested-category" className="text-right">
                <p className="text-xs text-muted-foreground mb-1">Suggested Category</p>
                <TriageCategoryBadge category={autoCalculatedCategory} showIcon />
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Alerts Panel */}
      {alerts.length > 0 && (
        <VitalAlertsPanel alerts={alerts} showClinicalNotes />
      )}

      {/* Arrival Information */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Ambulance className="h-4 w-4" />
            Arrival Information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {/* Arrival Mode */}
          <div className="space-y-2">
            <Label htmlFor="arrival_mode">
              Arrival Mode <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="arrival_mode"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={disabled}
                >
                  <SelectTrigger
                    id="arrival_mode"
                    aria-required="true"
                    aria-invalid={!!errors.arrival_mode}
                  >
                    <SelectValue placeholder="Select arrival mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(ARRIVAL_MODE_CONFIG) as [ArrivalMode, { label: string }][]).map(
                      ([value, config]) => (
                        <SelectItem key={value} value={value}>
                          {config.label}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.arrival_mode && (
              <p className="text-sm text-destructive">{errors.arrival_mode.message}</p>
            )}
          </div>

          {/* Arrival Time */}
          <div className="space-y-2">
            <Label htmlFor="arrival_time">
              Arrival Time <span className="text-muted-foreground text-xs">(from check-in)</span>
            </Label>
            <Input
              id="arrival_time"
              type="datetime-local"
              {...register('arrival_time')}
              disabled
              readOnly
              className="bg-muted cursor-not-allowed"
              aria-required="true"
              aria-invalid={!!errors.arrival_time}
            />
            {errors.arrival_time && (
              <p className="text-sm text-destructive">{errors.arrival_time.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Vital Signs */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Vital Signs
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowVitals((v) => !v)}
              disabled={disabled}
              aria-expanded={showVitals}
            >
              {showVitals ? 'Hide' : 'Show'}
            </Button>
          </div>
        </CardHeader>
        {showVitals && (
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              {/* SpO2 */}
              <div className="space-y-2">
                <Label htmlFor="spo2">SpO2</Label>
                <InputGroup className={cn(
                  spo2Emergency && 'border-rose-600 ring-2 ring-rose-500 bg-rose-50 dark:bg-rose-950/30',
                  spo2Critical && !spo2Emergency && 'border-destructive ring-1 ring-destructive',
                  spo2Warning && !spo2Critical && !spo2Emergency && 'border-amber-500 ring-1 ring-amber-500',
                  spo2Normal && 'border-green-500 ring-1 ring-green-500'
                )}>
                  <InputGroupInput
                    id="spo2"
                    inputMode="decimal"
                    placeholder="e.g. 98"
                    aria-invalid={!!errors.spo2}
                    disabled={disabled}
                    {...register('spo2', {
                      setValueAs: (v) => {
                        if (v === '' || v === null || v === undefined) return null;
                        const num = parseFloat(v);
                        return Number.isNaN(num) ? null : num;
                      },
                    })}
                  />
                  <InputGroupAddon align="inline-end">%</InputGroupAddon>
                </InputGroup>
                {errors.spo2 && <p className="text-sm text-destructive">{errors.spo2.message}</p>}
                {spo2Status && <VitalThresholdBadge status={spo2Status} />}
              </div>

              {/* Heart Rate */}
              <div className="space-y-2">
                <Label htmlFor="heart_rate">Heart Rate</Label>
                <InputGroup className={cn(
                  heartRateCritical && 'border-destructive ring-1 ring-destructive',
                  heartRateWarning && !heartRateCritical && 'border-amber-500 ring-1 ring-amber-500',
                  heartRateNormal && 'border-green-500 ring-1 ring-green-500'
                )}>
                  <InputGroupInput
                    id="heart_rate"
                    inputMode="numeric"
                    placeholder="e.g. 80"
                    aria-invalid={!!errors.heart_rate}
                    disabled={disabled}
                    {...register('heart_rate', {
                      setValueAs: (v) => {
                        if (v === '' || v === null || v === undefined) return null;
                        const num = parseInt(v, 10);
                        return Number.isNaN(num) ? null : num;
                      },
                    })}
                  />
                  <InputGroupAddon align="inline-end">bpm</InputGroupAddon>
                </InputGroup>
                {errors.heart_rate && (
                  <p className="text-sm text-destructive">{errors.heart_rate.message}</p>
                )}
                {heartRateStatus && <VitalThresholdBadge status={heartRateStatus} />}
                {showPediatricSection && !heartRateStatus && (
                  <p className="text-xs text-muted-foreground mt-1">{getVitalRangeHint('heart_rate', patientAgeGroup)}</p>
                )}
              </div>

              {/* Blood Pressure - with MAP calculation */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="systolic_bp">Blood Pressure <span className="text-xs text-muted-foreground">(mmHg)</span></Label>
                  {mapValue !== null && (
                    <span className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded",
                      bpCritical && "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
                      bpWarning && !bpCritical && "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
                      !bpCritical && !bpWarning && "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                    )}>
                      MAP: {mapValue}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <InputGroup className={cn(
                    'flex-1',
                    bpCritical && 'border-destructive ring-1 ring-destructive',
                    bpWarning && !bpCritical && 'border-amber-500 ring-1 ring-amber-500',
                    bpNormal && 'border-green-500 ring-1 ring-green-500'
                  )}>
                    <InputGroupInput
                      id="systolic_bp"
                      inputMode="numeric"
                      placeholder="120"
                      aria-invalid={!!errors.systolic_bp}
                      aria-label="Systolic blood pressure"
                      disabled={disabled}
                      {...register('systolic_bp', {
                        setValueAs: (v) => {
                          if (v === '' || v === null || v === undefined) return null;
                          const num = parseInt(v, 10);
                          return Number.isNaN(num) ? null : num;
                        },
                      })}
                    />
                  </InputGroup>
                  <span className="text-muted-foreground font-medium">/</span>
                  <InputGroup className={cn(
                    'flex-1',
                    bpCritical && 'border-destructive ring-1 ring-destructive',
                    bpWarning && !bpCritical && 'border-amber-500 ring-1 ring-amber-500',
                    bpNormal && 'border-green-500 ring-1 ring-green-500'
                  )}>
                    <InputGroupInput
                      id="diastolic_bp"
                      inputMode="numeric"
                      placeholder="80"
                      aria-invalid={!!errors.diastolic_bp}
                      aria-label="Diastolic blood pressure"
                      disabled={disabled}
                      {...register('diastolic_bp', {
                        setValueAs: (v) => {
                          if (v === '' || v === null || v === undefined) return null;
                          const num = parseInt(v, 10);
                          return Number.isNaN(num) ? null : num;
                        },
                      })}
                    />
                  </InputGroup>
                </div>
                {(errors.systolic_bp || errors.diastolic_bp) && (
                  <p className="text-sm text-destructive">
                    {errors.systolic_bp?.message || errors.diastolic_bp?.message}
                  </p>
                )}
                {mapStatus && <VitalThresholdBadge status={mapStatus} />}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {/* Temperature */}
              <div className="space-y-2">
                <Label htmlFor="temperature">Temperature</Label>
                <InputGroup className={cn(
                  temperatureCritical && 'border-destructive ring-1 ring-destructive',
                  temperatureWarning && !temperatureCritical && 'border-amber-500 ring-1 ring-amber-500',
                  temperatureNormal && 'border-green-500 ring-1 ring-green-500'
                )}>
                  <InputGroupInput
                    id="temperature"
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    placeholder="e.g. 37.2"
                    aria-invalid={!!errors.temperature}
                    disabled={disabled}
                    {...register('temperature', {
                      setValueAs: (v) => {
                        if (v === '' || v === null || v === undefined) return null;
                        const num = parseFloat(v);
                        return Number.isNaN(num) ? null : num;
                      },
                    })}
                  />
                  <InputGroupAddon align="inline-end">°C</InputGroupAddon>
                </InputGroup>
                {errors.temperature && (
                  <p className="text-sm text-destructive">{errors.temperature.message}</p>
                )}
                {temperatureStatus && <VitalThresholdBadge status={temperatureStatus} />}
                {showPediatricSection && !temperatureStatus && (
                  <p className="text-xs text-muted-foreground mt-1">{getVitalRangeHint('temperature', patientAgeGroup)}</p>
                )}
              </div>

              {/* Respiratory Rate */}
              <div className="space-y-2">
                <Label htmlFor="respiratory_rate">Respiratory Rate</Label>
                <InputGroup className={cn(
                  respiratoryRateCritical && 'border-destructive ring-1 ring-destructive',
                  respiratoryRateWarning && !respiratoryRateCritical && 'border-amber-500 ring-1 ring-amber-500',
                  respiratoryRateNormal && 'border-green-500 ring-1 ring-green-500'
                )}>
                  <InputGroupInput
                    id="respiratory_rate"
                    inputMode="numeric"
                    placeholder="e.g. 16"
                    aria-invalid={!!errors.respiratory_rate}
                    disabled={disabled}
                    {...register('respiratory_rate', {
                      setValueAs: (v) => {
                        if (v === '' || v === null || v === undefined) return null;
                        const num = parseInt(v, 10);
                        return Number.isNaN(num) ? null : num;
                      },
                    })}
                  />
                  <InputGroupAddon align="inline-end">/min</InputGroupAddon>
                </InputGroup>
                {errors.respiratory_rate && (
                  <p className="text-sm text-destructive">{errors.respiratory_rate.message}</p>
                )}
                {respiratoryRateStatus && <VitalThresholdBadge status={respiratoryRateStatus} />}
                {showPediatricSection && !respiratoryRateStatus && (
                  <p className="text-xs text-muted-foreground mt-1">{getVitalRangeHint('respiratory_rate', patientAgeGroup)}</p>
                )}
              </div>

              {/* Weight */}
              <div className="space-y-2">
                <Label htmlFor="weight">Weight</Label>
                <InputGroup>
                  <InputGroupInput
                    id="weight"
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    placeholder="e.g. 70"
                    aria-invalid={!!errors.weight}
                    disabled={disabled}
                    {...register('weight', {
                      setValueAs: (v) => {
                        if (v === '' || v === null || v === undefined) return null;
                        const num = parseFloat(v);
                        return Number.isNaN(num) ? null : num;
                      },
                    })}
                  />
                  <InputGroupAddon align="inline-end">kg</InputGroupAddon>
                </InputGroup>
                {errors.weight && (
                  <p className="text-sm text-destructive">{errors.weight.message}</p>
                )}
              </div>

              {/* Height (optional) */}
              <div className="space-y-2">
                <Label htmlFor="height">Height</Label>
                <InputGroup>
                  <InputGroupInput
                    id="height"
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    placeholder="e.g. 170"
                    aria-invalid={!!errors.height}
                    disabled={disabled}
                    {...register('height', {
                      setValueAs: (v) => {
                        if (v === '' || v === null || v === undefined) return null;
                        const num = parseFloat(v);
                        return Number.isNaN(num) ? null : num;
                      },
                    })}
                  />
                  <InputGroupAddon align="inline-end">cm</InputGroupAddon>
                </InputGroup>
                {errors.height && (
                  <p className="text-sm text-destructive">{errors.height.message}</p>
                )}
              </div>

              {/* BMI (Calculated - Only show when we have values) */}
              {bmiResult.bmi !== null && bmiResult.isAgeAppropriate && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-muted-foreground">
                    <Info className="h-4 w-4" />
                    BMI
                  </Label>
                  <div className="flex items-center gap-2 h-10">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-base font-semibold px-3 py-1.5',
                        getBMIColorClass(bmiResult.classification)
                      )}
                    >
                      {bmiResult.bmi}
                    </Badge>
                    <div className="flex flex-col">
                      <span className={cn(
                        'text-sm font-medium',
                        getBMIColorClass(bmiResult.classification)
                      )}>
                        {bmiResult.classification}
                      </span>
                      {bmiResult.percentile && (
                        <span className="text-xs text-muted-foreground">
                          {bmiResult.percentile}th percentile
                        </span>
                      )}
                    </div>
                  </div>
                  {bmiResult.message && (
                    <p className="text-xs text-muted-foreground">{bmiResult.message}</p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Chief Complaint */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Stethoscope className="h-4 w-4" />
            Chief Complaint
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="chief_complaint_category">
              Chief Complaint Category <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="chief_complaint_category"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={disabled}
                >
                  <SelectTrigger
                    id="chief_complaint_category"
                    aria-required="true"
                    aria-invalid={!!errors.chief_complaint_category}
                  >
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(CHIEF_COMPLAINT_CONFIG) as [
                        ChiefComplaintCategory,
                        { label: string; ageRestriction?: 'neonatal' | 'pediatric' },
                      ][]
                    )
                      .filter(([, config]) => {
                        // Filter categories by patient age
                        if (config.ageRestriction === 'neonatal') return isNeonateOrInfant(patientAgeGroup);
                        if (config.ageRestriction === 'pediatric') return isPediatric(patientAgeGroup);
                        return true;
                      })
                      .map(([value, config]) => (
                      <SelectItem key={value} value={value}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.chief_complaint_category && (
              <p className="text-sm text-destructive">
                {errors.chief_complaint_category.message}
              </p>
            )}
          </div>

          {/* Details */}
          <div className="space-y-2">
            <Label htmlFor="chief_complaint">
              Chief Complaint Details <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="chief_complaint"
              {...register('chief_complaint')}
              placeholder="Describe the chief complaint in detail..."
              disabled={disabled}
              aria-required="true"
              aria-invalid={!!errors.chief_complaint}
              rows={3}
            />
            {errors.chief_complaint && (
              <p className="text-sm text-destructive">{errors.chief_complaint.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ETAT Pediatric Assessment — shown for patients <12 years */}
      {showPediatricSection && (
        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-orange-700 dark:text-orange-300">
              <ShieldAlert className="h-4 w-4" />
              Pediatric Assessment (ETAT)
              <Badge variant="outline" className="ml-auto text-xs">
                {patientAgeGroup}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* ETAT Danger Signs */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                ETAT Danger Signs
                <span className="text-xs text-muted-foreground ml-2">(check all that apply)</span>
              </Label>
              <Controller
                name="etat_danger_signs"
                control={control}
                render={({ field }) => {
                  const selected = field.value || [];
                  return (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(Object.entries(ETAT_DANGER_SIGNS_CONFIG) as [EtATDangerSign, { label: string; description: string }][]).map(
                        ([sign, config]) => (
                          <label
                            key={sign}
                            className={cn(
                              'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                              selected.includes(sign)
                                ? 'border-red-500 bg-red-50 dark:bg-red-950/30'
                                : 'border-border hover:border-muted-foreground'
                            )}
                          >
                            <Checkbox
                              checked={selected.includes(sign)}
                              onCheckedChange={(checked) => {
                                const next = checked
                                  ? [...selected, sign]
                                  : selected.filter((s: string) => s !== sign);
                                field.onChange(next);
                              }}
                              disabled={disabled}
                              className="mt-0.5"
                            />
                            <div>
                              <span className="text-sm font-medium">{config.label}</span>
                              <p className="text-xs text-muted-foreground">{config.description}</p>
                            </div>
                          </label>
                        )
                      )}
                    </div>
                  );
                }}
              />
              {watchedValues.etat_danger_signs && watchedValues.etat_danger_signs.length > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                  <span className="text-sm font-medium text-red-700 dark:text-red-300">
                    {watchedValues.etat_danger_signs.length} danger sign(s) — auto-escalation to RED category
                  </span>
                </div>
              )}
            </div>

            {/* Capillary Refill & MUAC */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="capillary_refill_seconds">Capillary Refill (seconds)</Label>
                <Input
                  id="capillary_refill_seconds"
                  type="number"
                  min={0}
                  max={15}
                  step={1}
                  {...register('capillary_refill_seconds', { valueAsNumber: true })}
                  placeholder="e.g. 2"
                  disabled={disabled}
                />
                {errors.capillary_refill_seconds && (
                  <p className="text-sm text-destructive">{errors.capillary_refill_seconds.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="muac_cm">MUAC (cm)</Label>
                <Input
                  id="muac_cm"
                  type="number"
                  min={0}
                  max={30}
                  step={0.1}
                  {...register('muac_cm', { valueAsNumber: true })}
                  placeholder="e.g. 12.5"
                  disabled={disabled}
                />
                {watchedValues.muac_cm != null && watchedValues.muac_cm < 11.5 && (
                  <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                    ⚠ SAM: MUAC &lt; 11.5 cm
                  </p>
                )}
                {watchedValues.muac_cm != null && watchedValues.muac_cm >= 11.5 && watchedValues.muac_cm < 12.5 && (
                  <p className="text-sm text-orange-600 dark:text-orange-400">
                    MAM: MUAC 11.5-12.5 cm
                  </p>
                )}
                {errors.muac_cm && (
                  <p className="text-sm text-destructive">{errors.muac_cm.message}</p>
                )}
              </div>
            </div>

            {/* Dehydration Level */}
            <div className="space-y-2">
              <Label>Dehydration Level</Label>
              <Controller
                name="dehydration_level"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || ''} onValueChange={field.onChange} disabled={disabled}>
                    <SelectTrigger>
                      <SelectValue placeholder="Assess dehydration" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(DEHYDRATION_CONFIG) as [DehydrationLevel, { label: string }][]).map(
                        ([value, config]) => (
                          <SelectItem key={value} value={value}>{config.label}</SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Neonatal/Infant-specific fields */}
            {showNeonatalFields && (
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Fontanelle Status */}
                <div className="space-y-2">
                  <Label>Fontanelle Status</Label>
                  <Controller
                    name="fontanelle_status"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value || ''} onValueChange={field.onChange} disabled={disabled}>
                        <SelectTrigger>
                          <SelectValue placeholder="Assess fontanelle" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(FONTANELLE_CONFIG) as [FontanelleStatus, { label: string }][]).map(
                            ([value, config]) => (
                              <SelectItem key={value} value={value}>{config.label}</SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                {/* Breastfeeding Ability */}
                <div className="space-y-2">
                  <Label>Breastfeeding Ability</Label>
                  <Controller
                    name="breastfeeding_ability"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value || ''} onValueChange={field.onChange} disabled={disabled}>
                        <SelectTrigger>
                          <SelectValue placeholder="Assess feeding" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(BREASTFEEDING_CONFIG) as [BreastfeedingAbility, { label: string }][]).map(
                            ([value, config]) => (
                              <SelectItem key={value} value={value}>{config.label}</SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Clinical Assessment */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Clinical Assessment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Pain Score */}
          <div className="space-y-3" data-testid="pain-score-section">
            <div className="flex items-center justify-between">
              <Label htmlFor="pain_score">Pain Score (0-10)</Label>
              <Badge
                className={cn(
                  painSeverity.color === 'green' && 'bg-green-500',
                  painSeverity.color === 'yellow' && 'bg-yellow-500 text-black',
                  painSeverity.color === 'orange' && 'bg-orange-500',
                  painSeverity.color === 'red' && 'bg-red-500',
                  painSeverity.color === 'gray' && 'bg-gray-400'
                )}
              >
                {painSeverity.label}
              </Badge>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">0</span>
              <Controller
                name="pain_score"
                control={control}
                render={({ field }) => (
                  <input
                    type="range"
                    id="pain_score"
                    aria-label="Pain score"
                    min={0}
                    max={10}
                    value={field.value ?? 0}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                    disabled={disabled}
                    className="flex-1 h-2 bg-gradient-to-r from-green-400 via-yellow-400 to-red-500 rounded-lg appearance-none cursor-pointer"
                  />
                )}
              />
              <span className="text-sm font-medium">10</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Current: {painScore ?? 'Not assessed'} - {painSeverity.label}
            </p>
          </div>

          {/* AVPU Mental Status */}
          <div className="space-y-3">
            <Label>
              Mental Status (AVPU) <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="mental_status"
              control={control}
              render={({ field }) => (
                <RadioGroup
                  aria-label="Mental status"
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                  disabled={disabled}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                >
                  {(Object.entries(AVPU_CONFIG) as [AVPUStatus, { code: string; label: string; description: string }][]).map(
                    ([value, config]) => (
                      <div key={value} className="flex items-center space-x-2">
                        <RadioGroupItem
                          value={value}
                          id={`avpu-${value}`}
                          className={cn(
                            value === 'U' && field.value === 'U' && 'border-red-500'
                          )}
                        />
                        <Label
                          htmlFor={`avpu-${value}`}
                          className={cn(
                            'font-normal cursor-pointer',
                            value === 'U' && field.value === 'U' && 'text-red-600 font-medium'
                          )}
                        >
                          {config.label}
                        </Label>
                      </div>
                    )
                  )}
                </RadioGroup>
              )}
            />
            {errors.mental_status && (
              <p className="text-sm text-destructive">{errors.mental_status.message}</p>
            )}
            {mentalStatus === 'U' && (
              <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>CRITICAL: Unresponsive patient - Immediate attention required</span>
              </div>
            )}
          </div>

          {/* DEBUG: GCS visibility check */}
          {process.env.NODE_ENV === 'development' && (
            <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
              DEBUG: CC={chiefComplaintCategory}, AVPU={mentalStatus}, 
              showGCS={(chiefComplaintCategory === 'TRAUMA' ||
                chiefComplaintCategory === 'ALTERED_CONSCIOUSNESS' ||
                mentalStatus === 'P' ||
                mentalStatus === 'U').toString()}
            </div>
          )}

          {/* Glasgow Coma Scale - conditional for trauma/neuro cases */}
          {/* Hidden for neonates/infants — AVPU is used instead (GCS unreliable for pre-verbal children) */}
          {!showNeonatalFields &&
           (chiefComplaintCategory === 'TRAUMA' ||
            chiefComplaintCategory === 'ALTERED_CONSCIOUSNESS' ||
            mentalStatus === 'P' ||
            mentalStatus === 'U') && (
            <Controller
              name="gcs_eye"
              control={control}
              render={({ field: eyeField }) => (
                <Controller
                  name="gcs_verbal"
                  control={control}
                  render={({ field: verbalField }) => (
                    <Controller
                      name="gcs_motor"
                      control={control}
                      render={({ field: motorField }) => (
                        <GCSScorePanel
                          value={{
                            eye: eyeField.value ?? null,
                            verbal: verbalField.value ?? null,
                            motor: motorField.value ?? null,
                          }}
                          onChange={(gcs: GCSScores) => {
                            eyeField.onChange(gcs.eye);
                            verbalField.onChange(gcs.verbal);
                            motorField.onChange(gcs.motor);
                          }}
                          disabled={disabled}
                        />
                      )}
                    />
                  )}
                />
              )}
            />
          )}

          {/* Mobility */}
          <div className="space-y-2">
            <Label htmlFor="mobility">
              Mobility Status <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="mobility"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={disabled}
                >
                  <SelectTrigger
                    id="mobility"
                    aria-required="true"
                    aria-invalid={!!errors.mobility}
                  >
                    <SelectValue placeholder="Select mobility status" />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(MOBILITY_CONFIG) as [
                        MobilityStatus,
                        { label: string; description: string },
                      ][]
                    ).map(([value, config]) => (
                      <SelectItem key={value} value={value}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.mobility && (
              <p className="text-sm text-destructive">{errors.mobility.message}</p>
            )}
          </div>

          {/* Allergies */}
          <div className="space-y-2">
            <Label htmlFor="allergies_noted">Allergies Noted</Label>
            <Input
              id="allergies_noted"
              {...register('allergies_noted')}
              placeholder="Enter known allergies or NKDA"
              disabled={disabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Triage Category */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Triage Category (KETA)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Controller
            name="triage_category"
            control={control}
            render={({ field }) => (
              <RadioGroup
                aria-label="Triage category"
                value={field.value ?? ''}
                onValueChange={field.onChange}
                disabled={disabled}
                className="space-y-2"
              >
                {(
                  Object.entries(TRIAGE_CATEGORY_CONFIG) as [
                    TriageCategory,
                    { category: string; label: string; description: string },
                  ][]
                ).map(([value, config]) => (
                  <div
                    key={value}
                    className={cn(
                      'flex items-center space-x-3 p-3 rounded-lg border transition-colors',
                      field.value === value && 'border-blue-500 bg-blue-50 dark:bg-blue-950',
                      value === autoCalculatedCategory &&
                        field.value !== value &&
                        'border-dashed border-green-400'
                    )}
                  >
                    <RadioGroupItem value={value} id={`category-${value}`} />
                    <Label
                      htmlFor={`category-${value}`}
                      className="flex-1 cursor-pointer flex items-center gap-3"
                    >
                      <TriageCategoryBadge category={value} size="sm" />
                      <span className="text-sm">{config.label}</span>
                      {value === autoCalculatedCategory && (
                        <Badge variant="outline" className="ml-auto text-xs">
                          Suggested
                        </Badge>
                      )}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}
          />
          {errors.triage_category && (
            <p className="text-sm text-destructive">{errors.triage_category.message}</p>
          )}

          {/* Override Reason */}
          {categoryOverridden && (
            <div className="space-y-2 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 rounded-lg">
              <Label htmlFor="category_override_reason" className="text-amber-800 dark:text-amber-200">
                Override Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="category_override_reason"
                {...register('category_override_reason')}
                placeholder="Explain why you're selecting a different category..."
                disabled={disabled}
                rows={2}
              />
              {errors.category_override_reason && (
                <p className="text-sm text-destructive">
                  {errors.category_override_reason.message}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Risk Assessment */}
      <AIRiskAssessmentPanel
        patientAge={patientAge}
        patientGender={patient.gender}
        chiefComplaint={watchedValues.chief_complaint}
        chiefComplaintCategory={watchedValues.chief_complaint_category}
        vitals={{
          spo2: spo2,
          heart_rate: heartRate,
          systolic_bp: systolicBp,
          diastolic_bp: diastolicBp,
          temperature: temperature,
          respiratory_rate: respiratoryRate,
        }}
        painScore={painScore}
        mentalStatus={mentalStatus}
        mobility={watchedValues.mobility}
        allergies={watchedValues.allergies_noted}
        disabled={disabled}
      />

      {/* Care Area Routing */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Care Area Assignment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Routing Mode Toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={routingMode === 'emergency' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setRoutingMode('emergency');
                setValue('assigned_clinic', null);
              }}
              disabled={disabled}
              className="flex-1"
            >
              🚨 Emergency Area
            </Button>
            <Button
              type="button"
              variant={routingMode === 'clinic' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setRoutingMode('clinic');
                setValue('assigned_area', '');
              }}
              disabled={disabled}
              className="flex-1"
            >
              🏥 Route to Clinic
            </Button>
          </div>

          {/* Emergency Area Selection */}
          {routingMode === 'emergency' && (
            <div className="space-y-2">
              <Label>
                Emergency Area <span className="text-destructive">*</span>
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {EMERGENCY_AREA_OPTIONS.map((option) => {
                  const isSelected = watchedValues.assigned_area === option.value;
                  const categoryColor = {
                    RED: 'border-red-500 bg-red-50 dark:bg-red-950/30',
                    ORANGE: 'border-orange-500 bg-orange-50 dark:bg-orange-950/30',
                    YELLOW: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30',
                    GREEN: 'border-green-500 bg-green-50 dark:bg-green-950/30',
                    BLUE: 'border-blue-500 bg-blue-50 dark:bg-blue-950/30',
                  }[option.category as string] || '';

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setValue('assigned_area', option.value);
                        setValue('assigned_clinic', null);
                      }}
                      disabled={disabled}
                      className={cn(
                        'p-3 text-left rounded-lg border-2 transition-all',
                        'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary',
                        isSelected
                          ? `${categoryColor} border-primary ring-2 ring-primary`
                          : 'border-border hover:border-muted-foreground'
                      )}
                    >
                      <div className="font-medium text-sm">{option.label}</div>
                    </button>
                  );
                })}
              </div>
              {errors.assigned_area && (
                <p className="text-sm text-destructive">{errors.assigned_area.message}</p>
              )}
            </div>
          )}

          {/* Clinic Selection */}
          {routingMode === 'clinic' && (
            <div className="space-y-3">
              <Label>
                Select Clinic <span className="text-destructive">*</span>
              </Label>

              {/* Selected Clinic Display (collapsed state) */}
              {watchedValues.assigned_clinic ? (
                <div className="p-3 bg-accent rounded-lg border border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-primary font-bold">✓</span>
                      <div>
                        <div className="text-sm font-medium text-accent-foreground">
                          {clinics.find(c => c.id === watchedValues.assigned_clinic)?.name}
                        </div>
                        <div className="text-xs text-primary-foreground">
                          {clinics.find(c => c.id === watchedValues.assigned_clinic)?.clinic_type_display}
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={() => setValue('assigned_clinic', null)}
                      disabled={disabled}
                      className="text-accent-foreground hover:text-foreground"
                    >
                      Change
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Clinic Search */}
                  <div className="relative">
                    <Input
                      placeholder="Search clinics..."
                      value={clinicSearch}
                      onChange={(e) => setClinicSearch(e.target.value)}
                      disabled={disabled}
                      className="pl-8"
                    />
                    <Stethoscope className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>

                  {/* Clinic List */}
                  <div className="max-h-48 overflow-y-auto border border-border rounded-lg bg-card">
                    {clinicsLoading ? (
                      <div className="p-4 text-center text-muted-foreground">
                        Loading clinics...
                      </div>
                    ) : filteredClinics.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground">
                        {clinicSearch ? 'No clinics match your search' : 'No active clinics available'}
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {filteredClinics.map((clinic) => (
                          <button
                            key={clinic.id}
                            type="button"
                            onClick={() => {
                              setValue('assigned_clinic', clinic.id);
                              setValue('assigned_area', '');
                              setClinicSearch(''); // Clear search on selection
                            }}
                            disabled={disabled}
                            className={cn(
                              'w-full p-3 text-left transition-colors',
                              'hover:bg-accent hover:text-accent-foreground focus:outline-none focus:bg-accent focus:text-accent-foreground'
                            )}
                          >
                            <div className="font-medium text-sm">{clinic.name}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <span>{clinic.clinic_type_display}</span>
                              {clinic.is_open_today && (
                                <Badge variant="outline" className="text-[10px] py-0 px-1">Open</Badge>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {errors.assigned_area && (
                <p className="text-sm text-destructive">{errors.assigned_area.message}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || disabled}>
          {isSubmitting ? 'Saving...' : 'Complete Triage'}
        </Button>
      </div>
    </form>
  );
}
