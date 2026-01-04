'use client';

import { useState, useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useDebounce } from '@/lib/hooks/use-debounce';
import type { 
  EncounterFormData, 
  VitalAlert, 
  ICD10SearchResult,
  DiagnosisFormData 
} from '@/lib/types/encounter-form';
import type { Encounter } from '@/lib/types/encounter';
import type { Patient } from '@/lib/types/patient';

/**
 * Hook for ICD-10 code search.
 */
export function useICD10Search(query: string) {
  const debouncedQuery = useDebounce(query, 300);
  
  return useQuery({
    queryKey: ['icd10-search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) {
        return [];
      }
      const response = await apiClient.get<{ results: ICD10SearchResult[] }>(
        `/api/icd10-codes/?search=${encodeURIComponent(debouncedQuery)}&page_size=20`
      );
      return response.data.results || [];
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 60000, // Cache for 1 minute
  });
}

/**
 * Hook for patient search in encounter form.
 */
export function usePatientSearch(query: string) {
  const debouncedQuery = useDebounce(query, 300);
  
  return useQuery({
    queryKey: ['patient-search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) {
        return [];
      }
      const response = await apiClient.get<{ results: Patient[] }>(
        `/api/patients/?search=${encodeURIComponent(debouncedQuery)}&page_size=10`
      );
      return response.data.results || [];
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 30000,
  });
}

/**
 * Hook for fetching recent patients (ordered by last updated).
 */
export function useRecentPatients(limit: number = 10) {
  return useQuery({
    queryKey: ['patients', 'recent', limit],
    queryFn: async () => {
      const response = await apiClient.get<{ results: Patient[] }>(
        `/api/patients/?ordering=-updated_at&page_size=${limit}`
      );
      return response.data.results || [];
    },
    staleTime: 30000, // Cache for 30 seconds
  });
}

/**
 * Hook for creating encounters with validation.
 * Note: Does NOT auto-redirect on success - the calling component handles navigation.
 */
export function useCreateEncounterWithValidation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: EncounterFormData) => {
      // Transform form data to API format
      const apiData = {
        patient: data.patient,
        encounter_type: data.encounter_type,
        encounter_date: data.encounter_date,
        chief_complaint: data.chief_complaint,
        temperature: data.temperature,
        pulse: data.pulse,
        blood_pressure: data.blood_pressure_systolic && data.blood_pressure_diastolic
          ? `${data.blood_pressure_systolic}/${data.blood_pressure_diastolic}`
          : '',
        respiratory_rate: data.respiratory_rate,
        spo2: data.spo2,
        weight: data.weight,
        height: data.height,
        allergies: data.allergies,
        chronic_conditions: data.chronic_conditions,
        current_medications: data.current_medications,
        past_surgeries: data.past_surgeries,
        family_history: data.family_history,
        social_history: data.social_history,
        notes: data.notes,
        status: data.status,
      };
      
      const response = await apiClient.post<Encounter>('/api/encounters/', apiData);
      return response.data;
    },
    onSuccess: (encounter) => {
      queryClient.invalidateQueries({ queryKey: ['encounters'] });
      queryClient.invalidateQueries({ queryKey: ['patients', encounter.patient, 'encounters'] });
      // Note: Navigation is handled by the calling component to allow for intermediate modals
    },
  });
}

/**
 * Hook for adding diagnosis to an encounter.
 */
export function useAddDiagnosis(encounterId: number) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: DiagnosisFormData) => {
      const response = await apiClient.post(
        `/api/encounters/${encounterId}/diagnoses/`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounters', encounterId, 'diagnoses'] });
    },
  });
}

/**
 * Get vital sign alerts based on values.
 */
export function getVitalAlerts(data: EncounterFormData): VitalAlert[] {
  const alerts: VitalAlert[] = [];
  
  // Temperature alerts
  if (data.temperature !== null) {
    if (data.temperature < 35 || data.temperature > 39) {
      alerts.push({
        field: 'temperature',
        message: `Temperature ${data.temperature}°C is ${data.temperature < 35 ? 'hypothermic' : 'hyperthermic'}`,
        severity: 'critical',
      });
    } else if (data.temperature < 36.1 || data.temperature > 37.2) {
      alerts.push({
        field: 'temperature',
        message: `Temperature ${data.temperature}°C is outside normal range (36.1-37.2°C)`,
        severity: 'warning',
      });
    }
  }
  
  // Pulse alerts
  if (data.pulse !== null) {
    if (data.pulse < 50 || data.pulse > 120) {
      alerts.push({
        field: 'pulse',
        message: `Pulse ${data.pulse} bpm is ${data.pulse < 50 ? 'bradycardic' : 'tachycardic'}`,
        severity: 'critical',
      });
    } else if (data.pulse < 60 || data.pulse > 100) {
      alerts.push({
        field: 'pulse',
        message: `Pulse ${data.pulse} bpm is outside normal range (60-100 bpm)`,
        severity: 'warning',
      });
    }
  }
  
  // SpO2 alerts - spectrum-based ranges (using rounded integer values)
  if (data.spo2 !== null) {
    const spo2Rounded = Math.round(data.spo2);
    if (spo2Rounded < 85) {
      alerts.push({
        field: 'spo2',
        message: `SpO2 ${spo2Rounded}% - Severe hypoxemia, IMMEDIATE ATTENTION REQUIRED`,
        severity: 'critical',
      });
    } else if (spo2Rounded < 90) {
      alerts.push({
        field: 'spo2',
        message: `SpO2 ${spo2Rounded}% - Moderate hypoxemia, requires oxygen therapy`,
        severity: 'critical',
      });
    } else if (spo2Rounded < 92) {
      alerts.push({
        field: 'spo2',
        message: `SpO2 ${spo2Rounded}% - Mild hypoxemia, monitor closely`,
        severity: 'warning',
      });
    } else if (spo2Rounded < 95) {
      alerts.push({
        field: 'spo2',
        message: `SpO2 ${spo2Rounded}% - Below normal, consider supplemental oxygen`,
        severity: 'warning',
      });
    }
    // 95-100% is normal, no alert needed
  }
  
  // Respiratory rate alerts
  if (data.respiratory_rate !== null) {
    if (data.respiratory_rate < 8 || data.respiratory_rate > 30) {
      alerts.push({
        field: 'respiratory_rate',
        message: `Respiratory rate ${data.respiratory_rate}/min is critically abnormal`,
        severity: 'critical',
      });
    } else if (data.respiratory_rate < 12 || data.respiratory_rate > 20) {
      alerts.push({
        field: 'respiratory_rate',
        message: `Respiratory rate ${data.respiratory_rate}/min is outside normal range (12-20/min)`,
        severity: 'warning',
      });
    }
  }
  
  // Blood pressure alerts
  if (data.blood_pressure_systolic !== null && data.blood_pressure_diastolic !== null) {
    const sys = data.blood_pressure_systolic;
    const dia = data.blood_pressure_diastolic;
    
    if (sys >= 180 || dia >= 120) {
      alerts.push({
        field: 'blood_pressure',
        message: `BP ${sys}/${dia} mmHg indicates hypertensive crisis - IMMEDIATE ATTENTION`,
        severity: 'critical',
      });
    } else if (sys < 90 || dia < 60) {
      alerts.push({
        field: 'blood_pressure',
        message: `BP ${sys}/${dia} mmHg indicates hypotension`,
        severity: 'critical',
      });
    } else if (sys >= 140 || dia >= 90) {
      alerts.push({
        field: 'blood_pressure',
        message: `BP ${sys}/${dia} mmHg indicates hypertension`,
        severity: 'warning',
      });
    }
  }
  
  return alerts;
}

/**
 * Calculate BMI from weight (kg) and height (cm).
 */
export function calculateBMI(weight: number | null, height: number | null): { bmi: number | null; classification: string } {
  if (!weight || !height || height <= 0) {
    return { bmi: null, classification: '' };
  }
  
  const heightM = height / 100;
  const bmi = weight / (heightM * heightM);
  
  let classification = '';
  if (bmi < 18.5) classification = 'Underweight';
  else if (bmi < 25) classification = 'Normal';
  else if (bmi < 30) classification = 'Overweight';
  else classification = 'Obese';
  
  return { bmi: Math.round(bmi * 10) / 10, classification };
}

/**
 * Auto-save hook for encounter form.
 */
export function useAutoSave(
  data: EncounterFormData,
  encounterId: number | null,
  isDirty: boolean
) {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const debouncedData = useDebounce(data, 5000); // 5 second debounce
  
  useEffect(() => {
    if (!encounterId || !isDirty) return;
    
    const save = async () => {
      setIsSaving(true);
      try {
        const apiData = {
          ...debouncedData,
          blood_pressure: debouncedData.blood_pressure_systolic && debouncedData.blood_pressure_diastolic
            ? `${debouncedData.blood_pressure_systolic}/${debouncedData.blood_pressure_diastolic}`
            : '',
        };
        await apiClient.patch(`/api/encounters/${encounterId}/`, apiData);
        setLastSaved(new Date());
      } catch (error) {
        console.error('Auto-save failed:', error);
      } finally {
        setIsSaving(false);
      }
    };
    
    save();
  }, [debouncedData, encounterId, isDirty]);
  
  return { lastSaved, isSaving };
}
