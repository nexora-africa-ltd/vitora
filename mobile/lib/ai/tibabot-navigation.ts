import { Ionicons } from '@expo/vector-icons';

export interface TibaBotQuickAction {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  query: string;
}

export interface GlobalTibaBotConfig {
  inputPlaceholder: string;
  quickActions: TibaBotQuickAction[];
  sheetTitle: string;
}

const DEFAULT_GLOBAL_TIBABOT_CONFIG: GlobalTibaBotConfig = {
  inputPlaceholder: 'Ask a clinical question...',
  quickActions: [
    {
      id: 'differentials',
      label: 'Suggest differentials',
      icon: 'medkit-outline',
      query: 'Based on the clinical findings, suggest the top differential diagnoses with reasoning.',
    },
    {
      id: 'workup',
      label: 'Recommend workup',
      icon: 'flask-outline',
      query: 'Recommend the appropriate diagnostic workup and investigations for this presentation.',
    },
    {
      id: 'management',
      label: 'Management plan',
      icon: 'clipboard-outline',
      query: 'Suggest an evidence-based management plan for this patient presentation.',
    },
    {
      id: 'red-flags',
      label: 'Check red flags',
      icon: 'alert-circle-outline',
      query: 'Identify any red flags or warning signs that require immediate attention in this case.',
    },
  ],
  sheetTitle: 'TibaBot Clinical Assist',
};

const PATIENT_GLOBAL_TIBABOT_CONFIG: GlobalTibaBotConfig = {
  inputPlaceholder: 'Ask about registration, search, or patient intake...',
  quickActions: [
    {
      id: 'register-patient',
      label: 'Registration checklist',
      icon: 'person-add-outline',
      query: 'List the key details to confirm before registering a new patient in Vitora, including identity, demographics, emergency contact, consent, and county or sub-county location fields.',
    },
    {
      id: 'search-patient',
      label: 'Find a patient fast',
      icon: 'search-outline',
      query: 'What is the safest way to search for an existing patient when the user only has partial details like name, phone number, date of birth, or MRN?',
    },
    {
      id: 'duplicate-check',
      label: 'Avoid duplicates',
      icon: 'copy-outline',
      query: 'Give me a quick checklist for spotting possible duplicate patient registrations before I create a new chart.',
    },
    {
      id: 'consent-script',
      label: 'Explain consent',
      icon: 'shield-checkmark-outline',
      query: 'Draft a short front-desk explanation for consent and privacy that fits patient registration in a Kenyan healthcare facility.',
    },
  ],
  sheetTitle: 'TibaBot Patient Assist',
};

const BILLING_GLOBAL_TIBABOT_CONFIG: GlobalTibaBotConfig = {
  inputPlaceholder: 'Ask about claims, invoices, balances, or payments...',
  quickActions: [
    {
      id: 'sha-precheck',
      label: 'SHA claim pre-check',
      icon: 'shield-outline',
      query: 'Give me a short checklist for validating an SHA claim before submission, including eligibility, diagnosis support, charge completeness, and common rejection risks.',
    },
    {
      id: 'rejected-claim',
      label: 'Fix rejected claim',
      icon: 'refresh-circle-outline',
      query: 'What should I review first when an SHA claim is rejected or stays pending for too long?',
    },
    {
      id: 'invoice-summary',
      label: 'Explain invoice status',
      icon: 'receipt-outline',
      query: 'Summarize how to explain invoice totals, payments received, and remaining balance to a patient or cashier in plain language.',
    },
    {
      id: 'payment-next-step',
      label: 'Next billing step',
      icon: 'card-outline',
      query: 'Based on a draft or partial invoice, what next checks should billing staff complete before payment posting or claim submission?',
    },
  ],
  sheetTitle: 'TibaBot Billing Assist',
};

const PHARMACY_GLOBAL_TIBABOT_CONFIG: GlobalTibaBotConfig = {
  inputPlaceholder: 'Ask about prescriptions, stock, substitutions, or dispensing...',
  quickActions: [
    {
      id: 'dispense-check',
      label: 'Dispense safely',
      icon: 'medkit-outline',
      query: 'Give me a quick dispensing safety checklist for a prescription, including dose verification, route, frequency, allergies, interactions, and patient counselling points.',
    },
    {
      id: 'stock-alt',
      label: 'Stock alternative',
      icon: 'swap-horizontal-outline',
      query: 'If a prescribed medicine is out of stock, what checks should pharmacy staff complete before suggesting a therapeutic or formulary alternative?',
    },
    {
      id: 'counselling',
      label: 'Patient counselling',
      icon: 'chatbubble-ellipses-outline',
      query: 'Draft short patient counselling guidance for a newly dispensed medicine, covering use, adherence, common side effects, and warning signs.',
    },
    {
      id: 'partial-dispense',
      label: 'Partial dispense next steps',
      icon: 'list-outline',
      query: 'What should I document and communicate when only part of a prescription can be dispensed today?',
    },
  ],
  sheetTitle: 'TibaBot Pharmacy Assist',
};

const LABORATORY_GLOBAL_TIBABOT_CONFIG: GlobalTibaBotConfig = {
  inputPlaceholder: 'Ask about orders, specimens, critical values, or result review...',
  quickActions: [
    {
      id: 'specimen-check',
      label: 'Specimen checklist',
      icon: 'flask-outline',
      query: 'Give me a specimen collection and handoff checklist for a lab order, including labeling, timing, transport, and rejection risks.',
    },
    {
      id: 'critical-result',
      label: 'Critical result action',
      icon: 'alert-circle-outline',
      query: 'What immediate steps should laboratory staff follow when a result is critical or dangerously abnormal before verification is completed?',
    },
    {
      id: 'result-review',
      label: 'Review abnormal result',
      icon: 'analytics-outline',
      query: 'Help me review an abnormal lab result by outlining common causes, specimen issues to exclude, and what the clinician may need next.',
    },
    {
      id: 'verification-check',
      label: 'Verify result safely',
      icon: 'shield-checkmark-outline',
      query: 'List the final checks to complete before verifying and releasing a laboratory result to the clinical team.',
    },
  ],
  sheetTitle: 'TibaBot Laboratory Assist',
};

const INPATIENT_GLOBAL_TIBABOT_CONFIG: GlobalTibaBotConfig = {
  inputPlaceholder: 'Ask about admissions, bed flow, ward care, or nursing tasks...',
  quickActions: [
    {
      id: 'admission-check',
      label: 'Admission checklist',
      icon: 'bed-outline',
      query: 'Give me an inpatient admission checklist covering bed assignment, handover, initial assessment, active orders, and immediate risk checks.',
    },
    {
      id: 'deterioration',
      label: 'Spot deterioration',
      icon: 'pulse-outline',
      query: 'What red flags should ward staff watch for when an inpatient appears to be deteriorating, and what should happen first?',
    },
    {
      id: 'handover',
      label: 'Ward handover',
      icon: 'repeat-outline',
      query: 'Create a concise inpatient handover structure for shift change, including diagnosis, current status, pending tasks, and escalation items.',
    },
    {
      id: 'mar-kardex',
      label: 'Medication round checks',
      icon: 'clipboard-outline',
      query: 'List the essential checks for a safe medication administration round using the MAR or kardex in an inpatient ward.',
    },
  ],
  sheetTitle: 'TibaBot Inpatient Assist',
};

const MCH_GLOBAL_TIBABOT_CONFIG: GlobalTibaBotConfig = {
  inputPlaceholder: 'Ask about ANC follow-up, maternal risk, immunization, or outreach...',
  quickActions: [
    {
      id: 'anc-risk',
      label: 'ANC risk review',
      icon: 'heart-outline',
      query: 'Give me a structured antenatal risk review checklist covering danger signs, blood pressure concerns, bleeding, infection, fetal movement, and referral triggers.',
    },
    {
      id: 'visit-plan',
      label: 'Next ANC visit plan',
      icon: 'calendar-outline',
      query: 'What should be reviewed, documented, and scheduled at the next ANC visit for an active pregnancy in routine follow-up?',
    },
    {
      id: 'immunization-catchup',
      label: 'Immunization catch-up',
      icon: 'bandage-outline',
      query: 'Help me reason through a missed maternal or child immunization schedule and the safest catch-up approach to confirm locally.',
    },
    {
      id: 'community-counselling',
      label: 'Mother counselling',
      icon: 'people-outline',
      query: 'Draft short counselling points for a pregnant mother on nutrition, warning signs, birth preparedness, and when to seek urgent care.',
    },
  ],
  sheetTitle: 'TibaBot MCH Assist',
};

function matchesRoutePrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => new RegExp(`^${prefix}(?:/|$)`).test(pathname));
}

function isEncounterDetailRoute(pathname: string) {
  return /^\/encounters\/(?!new\/?$)[^/]+\/?$/.test(pathname);
}

export function getGlobalTibaBotConfig(pathname: string | null | undefined): GlobalTibaBotConfig | null {
  if (!pathname || pathname === '/' || pathname === '/sign-in' || isEncounterDetailRoute(pathname)) {
    return null;
  }

  if (matchesRoutePrefix(pathname, ['/patients'])) {
    return PATIENT_GLOBAL_TIBABOT_CONFIG;
  }

  if (matchesRoutePrefix(pathname, ['/billing'])) {
    return BILLING_GLOBAL_TIBABOT_CONFIG;
  }

  if (matchesRoutePrefix(pathname, ['/pharmacy'])) {
    return PHARMACY_GLOBAL_TIBABOT_CONFIG;
  }

  if (matchesRoutePrefix(pathname, ['/laboratory'])) {
    return LABORATORY_GLOBAL_TIBABOT_CONFIG;
  }

  if (matchesRoutePrefix(pathname, ['/inpatient'])) {
    return INPATIENT_GLOBAL_TIBABOT_CONFIG;
  }

  if (matchesRoutePrefix(pathname, ['/mch'])) {
    return MCH_GLOBAL_TIBABOT_CONFIG;
  }

  return DEFAULT_GLOBAL_TIBABOT_CONFIG;
}

export function shouldShowGlobalTibaBotFab(pathname: string | null | undefined) {
  return getGlobalTibaBotConfig(pathname) !== null;
}