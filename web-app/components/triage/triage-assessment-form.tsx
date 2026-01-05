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
import { TriageCategoryBadge } from './triage-category-badge';
import { VitalAlertsPanel } from './vital-alerts-panel';
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
} from '@/lib/types/triage';
import { useCalculateTriageCategory } from '@/lib/hooks/use-triage';
import {
  ARRIVAL_MODE_CONFIG,
  CHIEF_COMPLAINT_CONFIG,
  AVPU_CONFIG,
  MOBILITY_CONFIG,
  TRIAGE_CATEGORY_CONFIG,
  ASSIGNED_AREA_CONFIG,
  VitalType,
} from '@/lib/types/triage';

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
    mental_status: z.enum(['A', 'V', 'P', 'U'], {
      required_error: 'Mental status (AVPU) is required',
    }),
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
      ],
      { required_error: 'Assigned care area is required' }
    ),
    assigned_clinician: z.number().nullable().optional(),
  })
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
type AgeGroup = 'adult' | 'adolescent' | 'school_age' | 'young_child' | 'infant' | 'neonate';

/**
 * Get age group from age in years
 */
function getAgeGroup(ageYears: number): AgeGroup {
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

const MAP_THRESHOLDS: Record<AgeGroup, MAPThresholds> = {
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
  const ageGroup = getAgeGroup(patientAgeYears);
  const thresholds = MAP_THRESHOLDS[ageGroup];

  // Emergency: MAP severely below critical (organ failure imminent)
  if (map < thresholds.criticalLow - 10) {
    return {
      severity: 'emergency',
      message: `EMERGENCY: MAP ${map} mmHg - Severe hypoperfusion`,
      icon: 'emergency',
    };
  }

  // Critical: MAP below minimum for adequate organ perfusion
  if (map < thresholds.criticalLow) {
    return {
      severity: 'critical',
      message: `Critical: MAP ${map} mmHg - Inadequate perfusion (<${thresholds.criticalLow})`,
      icon: 'critical',
    };
  }

  // Emergency: MAP dangerously elevated (hypertensive emergency)
  if (map > thresholds.elevatedHigh + 25) {
    return {
      severity: 'emergency',
      message: `EMERGENCY: MAP ${map} mmHg - Hypertensive emergency`,
      icon: 'emergency',
    };
  }

  // Critical: Severely elevated MAP
  if (map > thresholds.elevatedHigh + 15) {
    return {
      severity: 'critical',
      message: `Critical: MAP ${map} mmHg - Severely elevated`,
      icon: 'critical',
    };
  }

  // Warning: MAP below normal range but above critical
  if (map < thresholds.normalLow) {
    return {
      severity: 'warning',
      message: `Warning: MAP ${map} mmHg - Below normal (${thresholds.normalLow}-${thresholds.normalHigh})`,
      icon: 'warning',
    };
  }

  // Warning: MAP elevated above normal
  if (map > thresholds.elevatedHigh) {
    return {
      severity: 'warning',
      message: `Warning: MAP ${map} mmHg - Elevated (>${thresholds.elevatedHigh})`,
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
    heart_rate: { critical: [40, 150], warning: [50, 120], unit: 'bpm' },
    temperature: { critical: [35, 40], warning: [36, 38.5], unit: '°C' },
    respiratory_rate: { critical: [10, 30], warning: [12, 24], unit: '/min' },
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
    if (value < critLow) {
      return { severity: 'critical', message: `Critical: ${value}${config.unit} - Hypothermia`, icon: 'critical' };
    }
    if (value > critHigh) {
      return { severity: 'critical', message: `Critical: ${value}${config.unit} - Hyperthermia`, icon: 'critical' };
    }
    if (value < warnLow || value > warnHigh) {
      return { severity: 'warning', message: `Abnormal: ${value}${config.unit}`, icon: 'warning' };
    }
  } else {
    // Heart rate, RR - both low and high are concerning
    if (value < critLow || value > critHigh) {
      const direction = value < critLow ? 'Low' : 'High';
      return { severity: 'critical', message: `Critical: ${value}${config.unit} - ${direction}`, icon: 'critical' };
    }
    if (value < warnLow || value > warnHigh) {
      const direction = value < warnLow ? 'Low' : 'High';
      return { severity: 'warning', message: `Abnormal: ${value}${config.unit} - ${direction}`, icon: 'warning' };
    }
  }

  return null; // Normal
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
      vital_type: 'SPO2', // Using SPO2 as placeholder, ideally would have AVPU type
      message: 'CRITICAL: Unresponsive patient - Immediate attention required',
      value: 0,
      threshold: 0,
      clinical_note: 'Patient is unresponsive (AVPU = U). Immediate intervention required.',
    });
  }

  // Check SpO2
  if (encounter.spo2 !== undefined) {
    if (encounter.spo2 < 90) {
      alerts.push({
        id: 'spo2-critical',
        severity: 'CRITICAL',
        vital_type: 'SPO2',
        message: `Severe hypoxemia - SpO2 ${encounter.spo2}%`,
        value: encounter.spo2,
        threshold: 90,
        clinical_note: 'Immediate intervention required',
      });
    } else if (encounter.spo2 < 95) {
      alerts.push({
        id: 'spo2-warning',
        severity: 'WARNING',
        vital_type: 'SPO2',
        message: `Low oxygen saturation - SpO2 ${encounter.spo2}%`,
        value: encounter.spo2,
        threshold: 95,
        clinical_note: 'Monitor closely, consider supplemental oxygen',
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

  // Calculate MAP if both BP values are present
  let mapCritical = false;
  if (typeof systolicBp === 'number' && typeof diastolicBp === 'number') {
    const map = calculateMAP(systolicBp, diastolicBp);
    const ageGroup = getAgeGroup(patientAgeYears);
    const thresholds = MAP_THRESHOLDS[ageGroup];
    // MAP below critical threshold indicates inadequate organ perfusion
    mapCritical = map < thresholds.criticalLow || map > thresholds.elevatedHigh + 15;
  }

  // Critical conditions → RED
  if (formData.mental_status === 'U') return 'RED';
  if (typeof spo2 === 'number' && spo2 <= 90) return 'RED'; // Moderate-severe hypoxemia
  if (typeof heartRate === 'number' && (heartRate < 40 || heartRate > 150))
    return 'RED';
  if (mapCritical) return 'RED'; // MAP-based critical BP

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
  if (typeof temperature === 'number' && temperature > 40) return 'ORANGE';

  // Moderate conditions → YELLOW
  if (formData.pain_score !== null && formData.pain_score !== undefined && formData.pain_score >= 7)
    return 'YELLOW';
  if (formData.mental_status === 'V') return 'YELLOW';
  if (typeof temperature === 'number' && temperature >= 38.5) return 'YELLOW';
  if (
    typeof respiratoryRate === 'number' &&
    (respiratoryRate < 10 || respiratoryRate > 30)
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

      mental_status: initialData?.mental_status || 'A',
      mobility: initialData?.mobility || 'AMBULATORY',
      allergies_noted: initialData?.allergies_noted || patient.allergies || '',
      triage_category: initialData?.triage_category,
      auto_calculated_category:
        initialData?.auto_calculated_category ||
        initialData?.triage_category ||
        initialSuggested,
      category_override_reason: initialData?.category_override_reason || '',
      assigned_area: initialData?.assigned_area,
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

  // Calculate patient age for MAP thresholds
  const patientAge = calculateAge(patient.date_of_birth);

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
  const spo2Critical = spo2Status?.severity === 'critical';
  const heartRateCritical = heartRateStatus?.severity === 'critical';
  const bpCritical = mapStatus?.severity === 'critical';
  const temperatureCritical = temperatureStatus?.severity === 'critical';
  const respiratoryRateCritical = respiratoryRateStatus?.severity === 'critical';
  
  // Warning flags for amber border
  const spo2Warning = spo2Status?.severity === 'warning';
  const heartRateWarning = heartRateStatus?.severity === 'warning';
  const bpWarning = mapStatus?.severity === 'warning';
  const temperatureWarning = temperatureStatus?.severity === 'warning';
  const respiratoryRateWarning = respiratoryRateStatus?.severity === 'warning';

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
      },
      encounter
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
    calculateCategoryMutation,
    autoCalculatedCategory,
    setValue,
    backendAlerts,
  ]);

  // Generate alerts (prefer backend calculation when available)
  const alerts = backendAlerts ?? generateTriageAlerts(watchedValues, encounter);

  // Check if category differs from suggested
  const categoryOverridden =
    autoCalculatedCategory && selectedCategory && selectedCategory !== autoCalculatedCategory;

  // Pain severity
  const painSeverity = getPainSeverity(painScore);

  // Form submission
  const onFormSubmit = async (data: TriageFormData) => {
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
        mental_status: data.mental_status,
        mobility: data.mobility,
        allergies_noted: data.allergies_noted,
        triage_category: data.triage_category,
        auto_calculated_category: data.auto_calculated_category,
        category_override_reason: data.category_override_reason,
        assigned_area: data.assigned_area,
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
                  spo2Critical && 'border-destructive ring-1 ring-destructive',
                  spo2Warning && !spo2Critical && 'border-amber-500 ring-1 ring-amber-500'
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
                  heartRateWarning && !heartRateCritical && 'border-amber-500 ring-1 ring-amber-500'
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
                    bpWarning && !bpCritical && 'border-amber-500 ring-1 ring-amber-500'
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
                    bpWarning && !bpCritical && 'border-amber-500 ring-1 ring-amber-500'
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
                  temperatureWarning && !temperatureCritical && 'border-amber-500 ring-1 ring-amber-500'
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
              </div>

              {/* Respiratory Rate */}
              <div className="space-y-2">
                <Label htmlFor="respiratory_rate">Respiratory Rate</Label>
                <InputGroup className={cn(
                  respiratoryRateCritical && 'border-destructive ring-1 ring-destructive',
                  respiratoryRateWarning && !respiratoryRateCritical && 'border-amber-500 ring-1 ring-amber-500'
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
                        { label: string },
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

      {/* Care Area Routing */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Care Area Assignment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="assigned_area">
              Assigned Area <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="assigned_area"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={disabled}
                >
                  <SelectTrigger
                    id="assigned_area"
                    aria-required="true"
                    aria-invalid={!!errors.assigned_area}
                  >
                    <SelectValue placeholder="Select care area" />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(ASSIGNED_AREA_CONFIG) as [AssignedArea, { label: string }][]
                    ).map(([value, config]) => (
                      <SelectItem key={value} value={value}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.assigned_area && (
              <p className="text-sm text-destructive">{errors.assigned_area.message}</p>
            )}
          </div>
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
