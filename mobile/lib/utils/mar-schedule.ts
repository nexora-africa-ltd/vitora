import type { Dispensation, Prescription, PrescriptionItem } from '@/lib/types/pharmacy';
import type { MedicationAdministrationCreateData } from '@/lib/types/inpatient';

/**
 * Frequency → hours between doses mapping.
 * Matches the backend prescription frequency vocabulary.
 */
const FREQUENCY_HOURS: Record<string, number> = {
  'OD': 24,          // Once daily
  'BD': 12,          // Twice daily
  'TDS': 8,          // Three times daily
  'QDS': 6,          // Four times daily
  'Q4H': 4,          // Every 4 hours
  'Q6H': 6,          // Every 6 hours
  'Q8H': 8,          // Every 8 hours
  'Q12H': 12,        // Every 12 hours
  'STAT': 0,         // Immediately (single dose)
  'PRN': 0,          // As needed (no auto-scheduling)
  'NOCTE': 24,       // At night (once daily)
  'MANE': 24,        // In the morning (once daily)
};

/**
 * Duration string → number of days.
 * Parses common formats: "5 days", "7d", "2 weeks", "1 week".
 */
function parseDurationDays(duration: string): number {
  const trimmed = duration.trim().toLowerCase();

  const dayMatch = trimmed.match(/^(\d+)\s*(?:days?|d)$/);
  if (dayMatch) return parseInt(dayMatch[1], 10);

  const weekMatch = trimmed.match(/^(\d+)\s*(?:weeks?|w)$/);
  if (weekMatch) return parseInt(weekMatch[1], 10) * 7;

  // Fallback: try parsing leading number as days
  const num = parseInt(trimmed, 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Determines the interval in hours for a given frequency string.
 * Handles both exact matches and common variations.
 */
function getIntervalHours(frequency: string): number | null {
  const normalized = frequency.trim().toUpperCase().replace(/\s+/g, '');
  if (normalized in FREQUENCY_HOURS) return FREQUENCY_HOURS[normalized];

  // Handle descriptive frequencies
  if (normalized.includes('ONCE') || normalized.includes('DAILY')) return 24;
  if (normalized.includes('TWICE') || normalized.includes('2X')) return 12;
  if (normalized.includes('THREE') || normalized.includes('3X')) return 8;
  if (normalized.includes('FOUR') || normalized.includes('4X')) return 6;

  return null;
}

export interface GeneratedSchedule {
  entries: MedicationAdministrationCreateData[];
  totalDoses: number;
  durationDays: number;
  intervalHours: number;
}

/**
 * Generate MAR schedule entries from a prescription item's frequency and duration.
 *
 * Used to create SCHEDULED MedicationAdministration records after pharmacy
 * dispenses medication for an inpatient.
 *
 * @param admissionId - The admission to schedule for
 * @param prescriptionItem - The dispensed prescription item with frequency/duration
 * @param startTime - When to start scheduling (defaults to now)
 * @returns Generated schedule entries ready for API submission, or null if frequency is PRN/unrecognized
 */
export function generateMARScheduleFromItem(
  admissionId: number,
  prescriptionItem: PrescriptionItem,
  startTime?: Date,
): GeneratedSchedule | null {
  const frequency = prescriptionItem.frequency;
  const intervalHours = getIntervalHours(frequency);

  // PRN medications don't get auto-scheduled
  if (intervalHours === null) return null;

  const isPRN = frequency.trim().toUpperCase() === 'PRN';
  if (isPRN) return null;

  if (intervalHours === 0) {
    // STAT: single immediate dose
    const now = startTime ?? new Date();
    return {
      entries: [{
        admission: admissionId,
        prescription_item: prescriptionItem.id,
        scheduled_time: now.toISOString(),
        status: 'SCHEDULED',
        dose_given: prescriptionItem.dosage,
        route: prescriptionItem.route ?? undefined,
        is_prn: false,
      }],
      totalDoses: 1,
      durationDays: 0,
      intervalHours: 0,
    };
  }

  const durationDays = parseDurationDays(prescriptionItem.duration);
  if (durationDays <= 0) return null;

  const totalDoses = Math.floor((durationDays * 24) / intervalHours);
  if (totalDoses <= 0) return null;

  const start = startTime ?? new Date();
  const entries: MedicationAdministrationCreateData[] = [];

  for (let i = 0; i < totalDoses; i++) {
    const scheduledTime = new Date(start.getTime() + i * intervalHours * 60 * 60 * 1000);
    entries.push({
      admission: admissionId,
      prescription_item: prescriptionItem.id,
      scheduled_time: scheduledTime.toISOString(),
      status: 'SCHEDULED',
      dose_given: prescriptionItem.dosage,
      route: prescriptionItem.route ?? undefined,
      is_prn: false,
    });
  }

  return {
    entries,
    totalDoses,
    durationDays,
    intervalHours,
  };
}

/**
 * Generate MAR schedules for all items in a prescription linked to an admission.
 *
 * Filters to only items that were actually dispensed (quantity_dispensed > 0)
 * and are not cancelled.
 */
export function generateMARSchedulesForPrescription(
  admissionId: number,
  prescription: Prescription,
  startTime?: Date,
): { itemId: number; drugName: string; schedule: GeneratedSchedule }[] {
  const results: { itemId: number; drugName: string; schedule: GeneratedSchedule }[] = [];

  for (const item of prescription.items) {
    if (item.is_cancelled) continue;
    if (item.quantity_dispensed <= 0) continue;

    const schedule = generateMARScheduleFromItem(admissionId, item, startTime);
    if (schedule) {
      results.push({
        itemId: item.id,
        drugName: item.drug_name ?? `Drug #${item.drug}`,
        schedule,
      });
    }
  }

  return results;
}
