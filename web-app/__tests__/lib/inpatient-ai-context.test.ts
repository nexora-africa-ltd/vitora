import type { Encounter } from '@/lib/types/encounter';
import type { WardRound } from '@/lib/types/inpatient';
import {
  buildAdmissionAIClinicalNotes,
  buildSourceEncounterClinicalSummary,
  getLatestWardRound,
} from '@/lib/utils/inpatient-ai-context';

describe('inpatient-ai-context', () => {
  const sourceEncounter: Encounter = {
    id: 41,
    patient: 7,
    encounter_type: 'OPD',
    encounter_date: '2026-04-24',
    chief_complaint: 'Shortness of breath and fever',
    status: 'IN_PROGRESS',
    history_of_present_illness: 'Three days of worsening cough with pleuritic chest pain.',
    physical_examination: 'Tachypneic with right basal crackles.',
    assessment: 'Community acquired pneumonia with hypoxia.',
    current_medications: 'Amoxicillin, Paracetamol',
    allergies: 'Penicillin',
    chronic_conditions: 'Asthma',
    created_at: '2026-04-24T08:00:00Z',
  };

  const wardRounds: WardRound[] = [
    {
      id: 1,
      admission: 5,
      round_date: '2026-04-24',
      round_time: '08:00',
      conducted_by: 2,
      review_type: 'WARD_ROUND',
      subjective: 'Still febrile overnight.',
      objective: 'Temperature 38.2C, crackles persist.',
      assessment: 'Improving slowly after IV antibiotics.',
      plan: 'Continue ceftriaxone and repeat CBC tomorrow.',
      condition_status: 'IMPROVING',
      requires_consultant_review: false,
    },
    {
      id: 2,
      admission: 5,
      round_date: '2026-04-25',
      round_time: '09:30',
      conducted_by: 2,
      review_type: 'WARD_ROUND',
      subjective: 'Breathing easier this morning.',
      objective: 'Afebrile, saturating 96% on room air.',
      assessment: 'Clinically stable for step-down care.',
      plan: 'Convert to oral antibiotics if repeat observations remain stable.',
      condition_status: 'STABLE',
      requires_consultant_review: false,
    },
  ];

  it('builds a concise source encounter summary from OPD narrative fields', () => {
    const summary = buildSourceEncounterClinicalSummary(sourceEncounter);

    expect(summary).toContain('OPD source encounter');
    expect(summary).toContain('Chief complaint: Shortness of breath and fever');
    expect(summary).toContain('HPI: Three days of worsening cough with pleuritic chest pain.');
    expect(summary).toContain('Assessment: Community acquired pneumonia with hypoxia.');
  });

  it('combines source encounter context with chronological ward-round progression', () => {
    const summary = buildAdmissionAIClinicalNotes({
      sourceEncounter,
      wardRounds,
      wardRoundLimit: 5,
    });

    expect(summary).toContain('OPD source encounter');
    expect(summary).toContain('Ward round progression');
    expect(summary).toContain('2026-04-24');
    expect(summary).toContain('2026-04-25');
    expect(summary).toContain('Convert to oral antibiotics');
  });

  it('picks the most recent ward round by date and time', () => {
    const latestRound = getLatestWardRound(wardRounds);

    expect(latestRound?.id).toBe(2);
  });
});
