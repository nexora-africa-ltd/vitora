import { listLocalScreenings, queueOfflineScreeningCreate, upsertScreenings } from '@/lib/db';
import { PaginatedCommunityScreeningSchema, CommunityScreeningSchema } from '@/lib/schemas/screening.schema';
import { parseResponse } from '@/lib/schemas/validation';
import { apiClient, toApiError } from '@/lib/api/client';
import type { CommunityScreening, CommunityScreeningCreateData, CommunityScreeningListParams } from '@/lib/types/screening';

function withServerMetadata(record: Omit<CommunityScreening, 'local_only' | 'sync_error' | 'sync_status'>): CommunityScreening {
  return {
    ...record,
    local_only: false,
    sync_error: null,
    sync_status: 'uploaded',
  };
}

function appendFormValue(formData: FormData, key: string, value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return;
  }

  formData.append(key, String(value));
}

function buildScreeningFormData(data: CommunityScreeningCreateData): FormData {
  const formData = new FormData();

  appendFormValue(formData, 'patient', data.patient);
  appendFormValue(formData, 'patient_name_snapshot', data.patient_name);
  appendFormValue(formData, 'patient_mrn_snapshot', data.patient_mrn);
  appendFormValue(formData, 'screening_type', data.screening_type);
  appendFormValue(formData, 'screening_date', data.screening_date);
  appendFormValue(formData, 'chu_name', data.chu_name);
  appendFormValue(formData, 'territory', data.territory);
  appendFormValue(formData, 'notes', data.notes);
  appendFormValue(formData, 'muac_mm', data.muac_mm);
  appendFormValue(formData, 'edema_present', data.edema_present);
  appendFormValue(formData, 'fever_present', data.fever_present);
  appendFormValue(formData, 'cough_duration_days', data.cough_duration_days);
  appendFormValue(formData, 'household_contact_name', data.household_contact_name);
  appendFormValue(formData, 'malaria_rdt_result', data.malaria_rdt_result);
  appendFormValue(formData, 'malaria_treatment_referred', data.malaria_treatment_referred);
  appendFormValue(formData, 'tb_referral_made', data.tb_referral_made);

  if (data.location) {
    formData.append('location', JSON.stringify(data.location));
  }

  if (data.photo?.uri) {
    const fileName = data.photo.uri.split('/').pop() || `screening-${Date.now()}.jpg`;
    const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : 'jpg';
    const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';
    formData.append('photo_upload', {
      name: fileName,
      type: mimeType,
      uri: data.photo.uri,
    } as never);
  }

  return formData;
}

export const screeningApi = {
  async listScreenings(params: CommunityScreeningListParams = {}): Promise<{ count: number; results: CommunityScreening[] }> {
    const response = await apiClient.get('/api/mch/community-screenings/', {
      params: {
        ...(params.modified_after ? { modified_after: params.modified_after } : {}),
        ...(typeof params.page === 'number' ? { page: params.page } : {}),
        ...(typeof params.page_size === 'number' ? { page_size: params.page_size } : {}),
        ...(typeof params.patient === 'number' ? { patient: params.patient } : {}),
        ...(params.screening_type ? { screening_type: params.screening_type } : {}),
      },
    });
    const parsed = parseResponse(PaginatedCommunityScreeningSchema, response.data, { context: 'screeningApi.listScreenings' });
    return {
      count: parsed.count,
      results: parsed.results.map(withServerMetadata),
    };
  },

  async uploadScreening(data: CommunityScreeningCreateData): Promise<CommunityScreening> {
    const response = await apiClient.post('/api/mch/community-screenings/', buildScreeningFormData(data), {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return withServerMetadata(parseResponse(CommunityScreeningSchema, response.data, { context: 'screeningApi.uploadScreening' }));
  },

  async createScreening(data: CommunityScreeningCreateData): Promise<CommunityScreening> {
    try {
      const uploaded = await screeningApi.uploadScreening(data);
      await upsertScreenings([uploaded]);
      return uploaded;
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.status !== 0) {
        throw error;
      }

      return queueOfflineScreeningCreate(data);
    }
  },

  async syncPendingScreenings(): Promise<{ attempted: number; uploaded: number; pending: number; message: string }> {
    const before = await listLocalScreenings();
    const attempted = before.records.filter((record) => record.sync_status === 'pending_upload').length;
    // Dynamic import to break require cycle: engine -> pull -> screening -> engine
    const { runOfflineSync } = await import('@/lib/sync/engine');
    const syncSummary = await runOfflineSync();
    const after = await listLocalScreenings();
    const pending = after.records.filter((record) => record.sync_status === 'pending_upload').length;
    const uploaded = Math.max(attempted - pending, 0);

    if (syncSummary.status === 'error' && syncSummary.error) {
      return {
        attempted,
        uploaded,
        pending,
        message: syncSummary.error,
      };
    }

    return {
      attempted,
      uploaded,
      pending,
      message: pending > 0 ? `${uploaded} screening record(s) uploaded. ${pending} still pending.` : `Uploaded ${uploaded} screening record(s).`,
    };
  },
};
