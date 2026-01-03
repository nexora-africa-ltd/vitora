import type {
  Admission,
  AdmissionRecommendation,
  Bed,
  InpatientWard,
} from '@/lib/types/inpatient';

export const mockInpatientWards: InpatientWard[] = [
  {
    id: 1,
    name: 'Medical Ward',
    code: 'MED-01',
    ward_type: 'MEDICAL',
    ward_type_display: 'Medical Ward',
    floor: '1',
    capacity: 30,
    description: 'General medical ward',
    is_active: true,
    daily_rate: '1000.00',
    available_beds: 2,
    occupancy_rate: 93.33,
  },
  {
    id: 2,
    name: 'Surgical Ward',
    code: 'SURG-01',
    ward_type: 'SURGICAL',
    ward_type_display: 'Surgical Ward',
    floor: '2',
    capacity: 20,
    description: 'General surgical ward',
    is_active: true,
    daily_rate: '1500.00',
    available_beds: 5,
    occupancy_rate: 75.0,
  },
];

export const mockBeds: Bed[] = [
  {
    id: 1,
    ward: 1,
    ward_name: 'Medical Ward',
    bed_number: 'M-01',
    status: 'AVAILABLE',
    status_display: 'Available',
    notes: '',
  },
  {
    id: 2,
    ward: 1,
    ward_name: 'Medical Ward',
    bed_number: 'M-02',
    status: 'OCCUPIED',
    status_display: 'Occupied',
    notes: '',
  },
  {
    id: 3,
    ward: 2,
    ward_name: 'Surgical Ward',
    bed_number: 'S-01',
    status: 'AVAILABLE',
    status_display: 'Available',
    notes: '',
  },
];

export const mockAdmissionRecommendations: AdmissionRecommendation[] = [
  {
    id: 1,
    encounter: 1,
    recommended_by: 1,
    recommended_by_username: 'Dr. Admin',
    reason: 'Severe malaria requiring IV treatment',
    provisional_diagnosis: 'B50.0',
    provisional_diagnosis_text: 'Severe falciparum malaria',
    urgency: 'URGENT',
    preferred_ward_type: 'MEDICAL',
    status: 'PENDING',
    expires_at: '2026-01-04T09:00:00Z',
    is_expired: false,
  },
];

export const mockAdmissions: Admission[] = [
  {
    id: 1,
    admission_number: 'ADM-20260103-0001',
    patient: 1,
    patient_name: 'John Doe',
    opd_encounter: 1,
    ipd_encounter: 999,
    recommendation: 1,
    admission_date: '2026-01-03T10:00:00Z',
    admitting_diagnosis: 'B50.0',
    admitting_diagnosis_text: 'Severe falciparum malaria',
    admitting_officer: 2,
    attending_doctor: 1,
    ward: 1,
    ward_name: 'Medical Ward',
    bed: 2,
    bed_number: 'M-02',
    admission_status: 'ACTIVE',
    payer_type: 'CASH',
    length_of_stay: 0,
  },
];
