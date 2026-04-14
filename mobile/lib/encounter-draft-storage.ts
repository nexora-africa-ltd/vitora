import { deleteSensitiveValue, getSensitiveJsonValue, getSensitiveValue, setSensitiveJsonValue } from '@/lib/storage/secure-storage';

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

  await setSensitiveJsonValue(NEW_ENCOUNTER_DRAFT_KEY, draft);
}

export async function getNewEncounterDraft<TForm>(): Promise<NewEncounterDraft<TForm> | null> {
  return getSensitiveJsonValue<NewEncounterDraft<TForm>>(NEW_ENCOUNTER_DRAFT_KEY);
}

export async function clearNewEncounterDraft(): Promise<void> {
  await deleteSensitiveValue(NEW_ENCOUNTER_DRAFT_KEY);
}

export async function saveEditDraft<TForm>(encounterId: number, form: TForm): Promise<void> {
  const draft: EditEncounterDraft<TForm> = {
    encounterId,
    savedAt: new Date().toISOString(),
    form,
  };

  await setSensitiveJsonValue(getEditEncounterDraftKey(encounterId), draft);
}

export async function getEditDraft<TForm>(encounterId: number): Promise<EditEncounterDraft<TForm> | null> {
  return getSensitiveJsonValue<EditEncounterDraft<TForm>>(getEditEncounterDraftKey(encounterId));
}

export async function clearEditDraft(encounterId: number): Promise<void> {
  await deleteSensitiveValue(getEditEncounterDraftKey(encounterId));
}

export async function hasEditDraft(encounterId: number): Promise<boolean> {
  const raw = await getSensitiveValue(getEditEncounterDraftKey(encounterId));
  return Boolean(raw);
}
