import AsyncStorage from '@react-native-async-storage/async-storage';

const NEW_ENCOUNTER_DRAFT_KEY = 'vitora.mobile.new-encounter-draft';
const EDIT_ENCOUNTER_DRAFT_KEY_PREFIX = 'vitora.mobile.edit-encounter-draft';

export interface NewEncounterDraft<TForm> {
  savedAt: string;
  form: TForm;
}

export interface EditEncounterDraft<TForm> {
  encounterId: number;
  savedAt: string;
  form: TForm;
}

function getEditEncounterDraftKey(encounterId: number): string {
  return `${EDIT_ENCOUNTER_DRAFT_KEY_PREFIX}.${encounterId}`;
}

export async function saveNewEncounterDraft<TForm>(form: TForm): Promise<void> {
  const draft: NewEncounterDraft<TForm> = {
    savedAt: new Date().toISOString(),
    form,
  };

  await AsyncStorage.setItem(NEW_ENCOUNTER_DRAFT_KEY, JSON.stringify(draft));
}

export async function getNewEncounterDraft<TForm>(): Promise<NewEncounterDraft<TForm> | null> {
  const raw = await AsyncStorage.getItem(NEW_ENCOUNTER_DRAFT_KEY);
  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as NewEncounterDraft<TForm>;
}

export async function clearNewEncounterDraft(): Promise<void> {
  await AsyncStorage.removeItem(NEW_ENCOUNTER_DRAFT_KEY);
}

export async function saveEditDraft<TForm>(encounterId: number, form: TForm): Promise<void> {
  const draft: EditEncounterDraft<TForm> = {
    encounterId,
    savedAt: new Date().toISOString(),
    form,
  };

  await AsyncStorage.setItem(getEditEncounterDraftKey(encounterId), JSON.stringify(draft));
}

export async function getEditDraft<TForm>(encounterId: number): Promise<EditEncounterDraft<TForm> | null> {
  const raw = await AsyncStorage.getItem(getEditEncounterDraftKey(encounterId));
  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as EditEncounterDraft<TForm>;
}

export async function clearEditDraft(encounterId: number): Promise<void> {
  await AsyncStorage.removeItem(getEditEncounterDraftKey(encounterId));
}

export async function hasEditDraft(encounterId: number): Promise<boolean> {
  const raw = await AsyncStorage.getItem(getEditEncounterDraftKey(encounterId));
  return Boolean(raw);
}