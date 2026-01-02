/**
 * TDD Tests for Form Draft Store (Zustand)
 * Tests draft saving, loading, and clearing functionality
 */
import { useFormStore } from '@/lib/stores/form-store';

describe('Form Store', () => {
  beforeEach(() => {
    // Reset store before each test
    useFormStore.setState({ drafts: {} });
  });

  describe('saveDraft', () => {
    it('should save a draft with form data', () => {
      const formId = 'patient-form';
      const data = { first_name: 'John', last_name: 'Doe' };

      useFormStore.getState().saveDraft(formId, data);

      const draft = useFormStore.getState().drafts[formId];
      expect(draft).toBeDefined();
      expect(draft?.id).toBe(formId);
      expect(draft?.data).toEqual(data);
      expect(draft?.savedAt).toBeInstanceOf(Date);
    });

    it('should overwrite existing draft with same formId', () => {
      const formId = 'patient-form';
      
      useFormStore.getState().saveDraft(formId, { first_name: 'John' });
      useFormStore.getState().saveDraft(formId, { first_name: 'Jane' });

      const draft = useFormStore.getState().drafts[formId];
      expect(draft?.data.first_name).toBe('Jane');
    });
  });

  describe('getDraft', () => {
    it('should return draft if exists', () => {
      const formId = 'encounter-form';
      const data = { chief_complaint: 'Headache' };
      
      useFormStore.getState().saveDraft(formId, data);
      const draft = useFormStore.getState().getDraft(formId);

      expect(draft).not.toBeNull();
      expect(draft?.data).toEqual(data);
    });

    it('should return null if draft does not exist', () => {
      const draft = useFormStore.getState().getDraft('non-existent');
      expect(draft).toBeNull();
    });
  });

  describe('clearDraft', () => {
    it('should clear a specific draft', () => {
      useFormStore.getState().saveDraft('form-1', { field: 'value1' });
      useFormStore.getState().saveDraft('form-2', { field: 'value2' });

      useFormStore.getState().clearDraft('form-1');

      expect(useFormStore.getState().getDraft('form-1')).toBeNull();
      expect(useFormStore.getState().getDraft('form-2')).not.toBeNull();
    });
  });

  describe('clearAllDrafts', () => {
    it('should clear all drafts', () => {
      useFormStore.getState().saveDraft('form-1', { field: 'value1' });
      useFormStore.getState().saveDraft('form-2', { field: 'value2' });

      useFormStore.getState().clearAllDrafts();

      expect(Object.keys(useFormStore.getState().drafts)).toHaveLength(0);
    });
  });
});
