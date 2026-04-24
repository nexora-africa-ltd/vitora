import type { Encounter } from '@/lib/types/encounter';
import type { WardRound } from '@/lib/types/inpatient';

function hasText(value?: string | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function cleanText(value?: string | null): string | null {
  if (!hasText(value)) return null;
  return value.trim();
}

function parseWardRoundTimestamp(round: WardRound): number {
  const datePart = cleanText(round.round_date) ?? '';
  const timePart = cleanText(round.round_time) ?? '00:00';
  return new Date(`${datePart}T${timePart}`).getTime();
}

export function getLatestWardRound(wardRounds?: WardRound[] | null): WardRound | null {
  if (!wardRounds?.length) return null;

  return [...wardRounds].sort((left, right) => {
    return parseWardRoundTimestamp(right) - parseWardRoundTimestamp(left);
  })[0] ?? null;
}

export function buildSourceEncounterClinicalSummary(
  sourceEncounter?: Encounter | null
): string | null {
  if (!sourceEncounter) return null;

  const lines: string[] = ['OPD source encounter'];

  if (hasText(sourceEncounter.encounter_date)) {
    lines.push(`Date: ${sourceEncounter.encounter_date}`);
  }
  if (hasText(sourceEncounter.chief_complaint)) {
    lines.push(`Chief complaint: ${sourceEncounter.chief_complaint}`);
  }
  if (hasText(sourceEncounter.history_of_present_illness)) {
    lines.push(`HPI: ${sourceEncounter.history_of_present_illness}`);
  }
  if (hasText(sourceEncounter.physical_examination)) {
    lines.push(`Examination: ${sourceEncounter.physical_examination}`);
  }
  if (hasText(sourceEncounter.assessment)) {
    lines.push(`Assessment: ${sourceEncounter.assessment}`);
  }
  if (hasText(sourceEncounter.current_medications)) {
    lines.push(`Current medications: ${sourceEncounter.current_medications}`);
  }
  if (hasText(sourceEncounter.allergies)) {
    lines.push(`Allergies: ${sourceEncounter.allergies}`);
  }
  if (hasText(sourceEncounter.chronic_conditions)) {
    lines.push(`Comorbidities: ${sourceEncounter.chronic_conditions}`);
  }

  return lines.length > 1 ? lines.join('\n') : null;
}

function buildWardRoundProgressionSummary(
  wardRounds?: WardRound[] | null,
  wardRoundLimit = 5
): string | null {
  if (!wardRounds?.length) return null;

  const rounds = [...wardRounds]
    .sort((left, right) => parseWardRoundTimestamp(left) - parseWardRoundTimestamp(right))
    .slice(-wardRoundLimit);

  const lines: string[] = ['Ward round progression'];

  for (const round of rounds) {
    const roundParts: string[] = [];

    if (hasText(round.condition_status_display || round.condition_status)) {
      roundParts.push(`Condition ${round.condition_status_display || round.condition_status}`);
    }
    if (hasText(round.subjective)) roundParts.push(`S: ${round.subjective}`);
    if (hasText(round.objective)) roundParts.push(`O: ${round.objective}`);
    if (hasText(round.assessment)) roundParts.push(`A: ${round.assessment}`);
    if (hasText(round.plan)) roundParts.push(`P: ${round.plan}`);

    if (roundParts.length > 0) {
      lines.push(`${round.round_date} ${cleanText(round.round_time) ?? ''}`.trim());
      lines.push(roundParts.join(' | '));
    }
  }

  return lines.length > 1 ? lines.join('\n') : null;
}

export function buildAdmissionAIClinicalNotes({
  sourceEncounter,
  wardRounds,
  wardRoundLimit = 5,
}: {
  sourceEncounter?: Encounter | null;
  wardRounds?: WardRound[] | null;
  wardRoundLimit?: number;
}): string | null {
  const parts = [
    buildSourceEncounterClinicalSummary(sourceEncounter),
    buildWardRoundProgressionSummary(wardRounds, wardRoundLimit),
  ].filter((value): value is string => hasText(value));

  return parts.length > 0 ? parts.join('\n\n') : null;
}
