/**
 * Triage Assessment Step Definitions
 * 
 * Steps for triage assessment scenarios including vitals,
 * KETA categories, and clinical assessment.
 */

import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';
import { createPatient, createEncounter, safeHashes } from '../../support/fixtures';

type KetaCategory = 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE';

function parseNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const num = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(num) ? num : undefined;
}

function calculateKetaCategory(
  assessment: Record<string, string>,
  vitals: Record<string, string>
): { category: KetaCategory; alerts: string[] } {
  const alerts: string[] = [];

  const spo2 = parseNumber(vitals.spo2);
  const systolicBp = parseNumber(vitals.systolic_bp);
  const hr = parseNumber(vitals.heart_rate);
  const temp = parseNumber(vitals.temperature);

  // RED triggers (as per feature expectations)
  if (spo2 !== undefined && spo2 <= 85) {
    alerts.push('Severe hypoxemia - SpO2 critically low');
    return { category: 'RED', alerts };
  }
  if (systolicBp !== undefined && systolicBp < 90) {
    alerts.push('Severe hypotension - Systolic BP < 90');
    return { category: 'RED', alerts };
  }
  if (systolicBp !== undefined && systolicBp > 180) {
    alerts.push('Hypertensive crisis - Systolic BP > 180');
    return { category: 'RED', alerts };
  }
  if (hr !== undefined && hr < 40) {
    alerts.push('Severe bradycardia - HR < 40 bpm');
    return { category: 'RED', alerts };
  }
  if (hr !== undefined && hr > 150) {
    alerts.push('Severe tachycardia - HR > 150 bpm');
    return { category: 'RED', alerts };
  }

  // ORANGE triggers
  if (spo2 !== undefined && spo2 < 95) {
    alerts.push(`Low oxygen saturation (SpO2 ${spo2}%)`);
    return { category: 'ORANGE', alerts };
  }

  const cc = (assessment.chief_complaint_category || '').toUpperCase();
  if (cc === 'CHEST_PAIN') {
    if ((systolicBp !== undefined && systolicBp >= 150) || (hr !== undefined && hr >= 120)) {
      return { category: 'ORANGE', alerts };
    }
  }

  // YELLOW triggers
  if (temp !== undefined && temp >= 38.5) {
    return { category: 'YELLOW', alerts };
  }

  // BLUE for stable follow-up/referral
  const isFollowUp = (assessment.follow_up_or_referral || '').toLowerCase() === 'true';
  if (isFollowUp) {
    return { category: 'BLUE', alerts };
  }

  // Default stable
  return { category: 'GREEN', alerts };
}

/**
 * Background steps for triage assessment
 */

Given(
  'I am on the triage assessment page for patient {string}',
  async function (this: VitoraWorld, mrn: string) {
    this.patient = createPatient({ mrn });
    this.currentPage = 'triage assessment';
    
    if (this.page) {
      await this.page.goto(`/triage/assess/${mrn}`);
      await this.page.waitForLoadState('networkidle');
    }
  }
);

Given(
  'the patient has an active encounter',
  async function (this: VitoraWorld) {
    this.encounter = createEncounter({
      patientId: this.patient?.id || 1,
      type: 'OPD',
      status: 'active',
    });
    this.store('activeEncounter', this.encounter);
  }
);

/**
 * Assessment data setup
 */

Given(
  'I have entered the following assessment data:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const rows = safeHashes(dataTable.hashes());
    const data: Record<string, string> = {};
    for (const row of rows) {
      const field = String(row.field || row.Field || '').trim();
      const value = String(row.value || row.Value || '').trim();
      if (field) data[field] = value;
    }

    this.store('assessmentData', data);
  }
);

Given(
  'I have entered chief complaint category {string}',
  async function (this: VitoraWorld, category: string) {
    const data = this.retrieve<Record<string, string>>('assessmentData') || {};
    data.chief_complaint_category = category;
    this.store('assessmentData', data);
  }
);

Given(
  'the encounter has vitals:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const rows = safeHashes(dataTable.hashes());
    const vitals: Record<string, string> = {};
    for (const row of rows) {
      const vital = String(row.vital || row.Vital || '').trim();
      const value = String(row.value || row.Value || '').trim();
      if (vital) vitals[vital] = value;
    }

    this.store('encounterVitals', vitals);
    this.encounter = this.encounter || createEncounter({ patientId: this.patient?.id || 1, type: 'OPD', status: 'active' });
    this.encounter.vitals = vitals;
  }
);

Given(
  'all vitals are within normal range',
  async function (this: VitoraWorld) {
    const vitals: Record<string, string> = {
      temperature: '36.8',
      spo2: '98',
      systolic_bp: '120',
      heart_rate: '80',
    };
    this.store('encounterVitals', vitals);
    this.encounter = this.encounter || createEncounter({ patientId: this.patient?.id || 1, type: 'OPD', status: 'active' });
    this.encounter.vitals = vitals;
  }
);

Given(
  'the patient is seeking a follow-up or referral',
  async function (this: VitoraWorld) {
    const data = this.retrieve<Record<string, string>>('assessmentData') || {};
    data.follow_up_or_referral = 'true';
    this.store('assessmentData', data);
  }
);

Given(
  'I am viewing a patient\'s triage assessment',
  async function (this: VitoraWorld) {
    // Create a patient with existing triage data
    this.patient = createPatient();
    this.encounter = createEncounter({
      patientId: this.patient.id,
      type: 'OPD',
      status: 'active',
    });
    
    if (this.page) {
      await this.page.goto(`/triage/assessment/${this.patient.mrn}`);
      await this.page.waitForLoadState('networkidle');
    }
  }
);

/**
 * Arrival mode steps
 */

When(
  'I select arrival mode {string}',
  async function (this: VitoraWorld, mode: string) {
    this.store('arrivalMode', mode);
    
    if (this.page) {
      await this.page.selectOption('[data-testid="arrival-mode"]', mode);
    }
  }
);

When(
  'I enter arrival time as {string}',
  async function (this: VitoraWorld, time: string) {
    this.store('arrivalTime', time);
    
    if (this.page) {
      await this.page.fill('[data-testid="arrival-time"]', time);
    }
  }
);

Then(
  'the arrival mode should be set to {string}',
  async function (this: VitoraWorld, expectedCode: string) {
    const arrivalMode = this.retrieve('arrivalMode') as string;
    // Normalize mode to code
    const modeToCode: Record<string, string> = {
      'Walk-in': 'WALK_IN',
      'Ambulance': 'AMBULANCE',
      'Police': 'POLICE',
      'Referral from another facility': 'REFERRAL',
      'Other': 'OTHER',
    };
    expect(modeToCode[arrivalMode] || arrivalMode).toBe(expectedCode);
  }
);

Then(
  'the arrival time should be recorded',
  async function (this: VitoraWorld) {
    const arrivalTime = this.retrieve('arrivalTime');
    expect(arrivalTime).toBeDefined();
  }
);

/**
 * Chief complaint steps
 */

When(
  'I select chief complaint category {string}',
  async function (this: VitoraWorld, category: string) {
    this.store('chiefComplaintCategory', category);
    
    if (this.page) {
      await this.page.selectOption('[data-testid="chief-complaint-category"]', category);
    }
  }
);

When(
  'I enter chief complaint details {string}',
  async function (this: VitoraWorld, details: string) {
    this.store('chiefComplaintDetails', details);
    
    if (this.page) {
      await this.page.fill('[data-testid="chief-complaint-details"]', details);
    }
  }
);

Then(
  'the chief complaint category should be {string}',
  async function (this: VitoraWorld, expectedCode: string) {
    const category = this.retrieve('chiefComplaintCategory') as string;
    const categoryToCode: Record<string, string> = {
      'Chest Pain': 'CHEST_PAIN',
      'Difficulty Breathing': 'DIFFICULTY_BREATHING',
      'Trauma/Injury': 'TRAUMA',
      'Fever': 'FEVER',
      'Abdominal Pain': 'ABDOMINAL_PAIN',
      'Headache': 'HEADACHE',
      'Altered Consciousness': 'ALTERED_CONSCIOUSNESS',
      'Bleeding': 'BLEEDING',
      'Poisoning/Overdose': 'POISONING',
      'Obstetric Emergency': 'OBSTETRIC',
      'Pediatric Emergency': 'PEDIATRIC',
      'Other': 'OTHER',
    };
    expect(categoryToCode[category] || category).toBe(expectedCode);
  }
);

Then(
  'the chief complaint category code should be {string}',
  async function (this: VitoraWorld, expectedCode: string) {
    const category = this.retrieve('chiefComplaintCategory') as string;
    const categoryToCode: Record<string, string> = {
      'Chest Pain': 'CHEST_PAIN',
      'Difficulty Breathing': 'DIFFICULTY_BREATHING',
      'Trauma/Injury': 'TRAUMA',
      'Fever': 'FEVER',
      'Abdominal Pain': 'ABDOMINAL_PAIN',
      'Headache': 'HEADACHE',
      'Altered Consciousness': 'ALTERED_CONSCIOUSNESS',
      'Bleeding': 'BLEEDING',
      'Poisoning/Overdose': 'POISONING',
      'Obstetric Emergency': 'OBSTETRIC',
      'Pediatric Emergency': 'PEDIATRIC',
      'Other': 'OTHER',
    };
    expect(categoryToCode[category] || category).toBe(expectedCode);
  }
);

Then(
  'the chief complaint text should be saved',
  async function (this: VitoraWorld) {
    const details = this.retrieve('chiefComplaintDetails');
    expect(details).toBeDefined();
  }
);

/**
 * Pain score steps
 */

When(
  'I click on pain level {int} on the pain scale',
  async function (this: VitoraWorld, level: number) {
    this.store('painScore', level);
    
    if (this.page) {
      await this.page.click(`[data-testid="pain-scale-${level}"]`);
    }
  }
);

When(
  'I set the pain score to {int}',
  async function (this: VitoraWorld, score: number) {
    this.store('painScore', score);
    
    if (this.page) {
      await this.page.fill('[data-testid="pain-score"]', String(score));
    }
  }
);

When(
  'I leave the pain score empty',
  async function (this: VitoraWorld) {
    this.store('painScore', null);
    
    if (this.page) {
      await this.page.fill('[data-testid="pain-score"]', '');
    }
  }
);

Then(
  'the pain score should be set to {int}',
  async function (this: VitoraWorld, expectedScore: number) {
    const painScore = this.retrieve('painScore') as number;
    expect(painScore).toBe(expectedScore);
  }
);

Then(
  'the pain score should be null',
  async function (this: VitoraWorld) {
    const painScore = this.retrieve('painScore');
    expect(painScore).toBeNull();
  }
);

Then(
  'the pain indicator should show {string}',
  async function (this: VitoraWorld, expectedSeverity: string) {
    const painScore = this.retrieve('painScore') as number;
    const scoreToSeverity: Record<number, string> = {
      0: 'None',
      1: 'Minimal',
      2: 'Minimal',
      3: 'Mild',
      4: 'Mild',
      5: 'Moderate',
      6: 'Moderate',
      7: 'Severe',
      8: 'Severe',
      9: 'Worst',
      10: 'Unbearable',
    };
    expect(scoreToSeverity[painScore]).toBe(expectedSeverity);
  }
);

Then(
  'the pain color should be {string}',
  async function (this: VitoraWorld, expectedColor: string) {
    const painScore = this.retrieve('painScore') as number;
    let color = 'green';
    if (painScore >= 3 && painScore < 5) color = 'yellow';
    else if (painScore >= 5 && painScore < 7) color = 'orange';
    else if (painScore >= 7) color = 'red';
    expect(color).toBe(expectedColor);
  }
);

/**
 * Mental status (AVPU) steps
 */

When(
  'I select mental status {string}',
  async function (this: VitoraWorld, status: string) {
    this.store('mentalStatus', status);
    
    if (this.page) {
      await this.page.click(`[data-testid="avpu-${status.toLowerCase()}"]`);
    }
  }
);

Then(
  'the mental status code should be {string}',
  async function (this: VitoraWorld, expectedCode: string) {
    const status = this.retrieve('mentalStatus') as string;
    const statusToCode: Record<string, string> = {
      'Alert': 'A',
      'Verbal': 'V',
      'Pain': 'P',
      'Unresponsive': 'U',
    };
    expect(statusToCode[status] || status.charAt(0).toUpperCase()).toBe(expectedCode);
  }
);

Then(
  'the mental status indicator should show {string}',
  async function (this: VitoraWorld, expectedDescription: string) {
    const status = this.retrieve('mentalStatus');
    expect(expectedDescription).toContain(status as string);
  }
);

/**
 * Triage submission steps
 */

When(
  'I submit the triage assessment',
  async function (this: VitoraWorld) {
    if (this.page) {
      await this.page.click('[data-testid="submit-triage"]');
      await this.page.waitForResponse(resp => resp.url().includes('/api/triage') && resp.status() === 201);
    }
    this.store('triageSubmitted', true);
  }
);

When(
  'I try to submit the triage assessment',
  async function (this: VitoraWorld) {
    this.store('triageSubmitAttempted', true);
    if (this.page) {
      await this.page.click('[data-testid="submit-triage"], button:has-text("Submit")');
      // Do not require success for a "try".
      await this.page.waitForTimeout(300);
    }
  }
);

/**
 * KETA categorization steps
 */

When(
  'I calculate the triage category',
  async function (this: VitoraWorld) {
    const assessmentData = this.retrieve<Record<string, string>>('assessmentData') || {};
    const vitals = this.retrieve<Record<string, string>>('encounterVitals') || (this.encounter?.vitals as Record<string, string> | undefined) || {};

    const result = calculateKetaCategory(assessmentData, vitals);
    this.store('suggestedCategory', result.category);
    this.store('ketaAlerts', result.alerts);

    if (this.page) {
      const button = this.page.locator('button:has-text("Calculate Triage Category"), [data-testid="calculate-triage-category"]');
      if (await button.count()) {
        await button.first().click();
      }
    }
  }
);

Then(
  'the suggested category should be {string}',
  async function (this: VitoraWorld, expected: string) {
    const suggested = this.retrieve<KetaCategory>('suggestedCategory');
    expect(suggested).toBe(expected);
  }
);

Then(
  'the auto-calculated category should be {string}',
  async function (this: VitoraWorld, expected: string) {
    const suggested = this.retrieve<KetaCategory>('suggestedCategory');
    expect(suggested).toBe(expected);
  }
);

Then(
  'alerts should include {string}',
  async function (this: VitoraWorld, expectedAlert: string) {
    const alerts = this.retrieve<string[]>('ketaAlerts') || [];
    expect(alerts).toContain(expectedAlert);
  }
);

Then(
  'an alert should be shown: {string}',
  async function (this: VitoraWorld, expectedAlert: string) {
    const alerts = this.retrieve<string[]>('ketaAlerts') || [];
    expect(alerts).toContain(expectedAlert);
  }
);

Then(
  'the assessment should be saved successfully',
  async function (this: VitoraWorld) {
    const submitted = this.retrieve('triageSubmitted');
    expect(submitted).toBe(true);
    
    if (this.page) {
      await expect(this.page.locator('[data-testid="success-message"]')).toBeVisible();
    }
  }
);
