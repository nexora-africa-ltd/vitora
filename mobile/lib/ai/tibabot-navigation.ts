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

function isEncounterDetailRoute(pathname: string) {
  return /^\/encounters\/(?!new\/?$)[^/]+\/?$/.test(pathname);
}

export function getGlobalTibaBotConfig(pathname: string | null | undefined): GlobalTibaBotConfig | null {
  if (!pathname || pathname === '/' || pathname === '/sign-in' || isEncounterDetailRoute(pathname)) {
    return null;
  }

  if (/^\/patients(?:\/|$)/.test(pathname)) {
    return PATIENT_GLOBAL_TIBABOT_CONFIG;
  }

  if (/^\/billing(?:\/|$)/.test(pathname)) {
    return BILLING_GLOBAL_TIBABOT_CONFIG;
  }

  return DEFAULT_GLOBAL_TIBABOT_CONFIG;
}

export function shouldShowGlobalTibaBotFab(pathname: string | null | undefined) {
  return getGlobalTibaBotConfig(pathname) !== null;
}