'use client';

import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface EnrollmentSearchInputProps {
  patientId: number;
  value: number | null;
  onChange: (enrollmentId: number | null) => void;
}

/**
 * Enrollment search input for linking MCH registration to ANC enrollment.
 * Shows a select dropdown with available ANC enrollments for the patient.
 *
 * NOTE: This is a simplified placeholder. In the full implementation,
 * it would query the clinics API for enrollments filtered by patient.
 */
export function EnrollmentSearchInput({
  patientId,
  value,
  onChange,
}: EnrollmentSearchInputProps) {
  return (
    <div className="space-y-1">
      <Select
        value={value?.toString() ?? ''}
        onValueChange={(v) => onChange(v ? parseInt(v) : null)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select ANC enrollment (optional)..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">None</SelectItem>
          {/* Enrollments would be loaded from /api/clinics/enrollments/?patient={patientId}&clinic_type=ANC */}
          <div className="px-3 py-2 text-xs text-muted-foreground">
            ANC enrollments for patient #{patientId} will appear here once loaded.
          </div>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Links pregnancy data (LMP, EDD, gravida, parity) from the ANC enrollment.
      </p>
    </div>
  );
}
