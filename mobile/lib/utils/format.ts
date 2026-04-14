import type { Patient } from '@/lib/types/patient';

export function formatDate(value?: string | null): string {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function formatDateTime(value?: string | null): string {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatCurrency(value?: number | null): string {
  if (value == null || Number.isNaN(value)) {
    return 'KES 0.00';
  }

  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function buildPatientName(patient: Pick<Patient, 'first_name' | 'middle_name' | 'last_name' | 'full_name'>): string {
  if (patient.full_name) {
    return patient.full_name;
  }

  return [patient.first_name, patient.middle_name, patient.last_name].filter(Boolean).join(' ');
}

export function formatGender(gender: string): string {
  if (gender === 'M') {
    return 'Male';
  }
  if (gender === 'F') {
    return 'Female';
  }
  return 'Other';
}
