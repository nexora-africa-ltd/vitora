import { create } from 'zustand';

interface FormDraft {
  id: string;
  data: Record<string, any>;
  savedAt: Date;
}

interface FormState {
  // Draft storage
  drafts: Record<string, FormDraft>;
  
  // Actions
  saveDraft: (formId: string, data: Record<string, any>) => void;
  getDraft: (formId: string) => FormDraft | null;
  clearDraft: (formId: string) => void;
  clearAllDrafts: () => void;
}

export const useFormStore = create<FormState>()((set, get) => ({
  drafts: {},
  
  saveDraft: (formId, data) => {
    set((state) => ({
      drafts: {
        ...state.drafts,
        [formId]: {
          id: formId,
          data,
          savedAt: new Date(),
        },
      },
    }));
  },
  
  getDraft: (formId) => {
    return get().drafts[formId] || null;
  },
  
  clearDraft: (formId) => {
    set((state) => {
      const { [formId]: _, ...rest } = state.drafts;
      return { drafts: rest };
    });
  },
  
  clearAllDrafts: () => {
    set({ drafts: {} });
  },
}));
