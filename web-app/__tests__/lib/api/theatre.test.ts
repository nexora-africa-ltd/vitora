import { apiClient } from '@/lib/api/client';
import { parseResponse } from '@/lib/schemas/validation';
import { theatreApi } from '@/lib/api/theatre';

jest.mock('@/lib/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/lib/schemas/validation', () => ({
  parseResponse: jest.fn((_schema, data) => data),
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;
const mockParseResponse = parseResponse as jest.Mock;

describe('theatreApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses backend action URLs for theatre workflow helpers', async () => {
    mockApiClient.post
      .mockResolvedValueOnce({ data: { id: 1 } })
      .mockResolvedValueOnce({ data: { id: 2 } })
      .mockResolvedValueOnce({ data: { id: 3 } })
      .mockResolvedValueOnce({ data: { id: 4 } })
      .mockResolvedValueOnce({ data: { id: 5 } });
    mockApiClient.patch.mockResolvedValueOnce({ data: { id: 6 } });

    await theatreApi.addTeamMember('SURG-20260420-0001', { staff_member: 5, role: 'LEAD_SURGEON' });
    await theatreApi.createAnesthesiaRecord('SURG-20260420-0001', { anesthesiologist: 5 });
    await theatreApi.updateAnesthesiaRecord('SURG-20260420-0001', { npo_confirmed: true });
    await theatreApi.createOperativeNote('SURG-20260420-0001', {
      dictated_by: 5,
      pre_operative_diagnosis: 'Acute appendicitis',
      post_operative_diagnosis: 'Acute appendicitis confirmed',
      procedure_performed: 'Appendectomy',
      findings: 'Inflamed appendix',
      technique_description: 'Open approach',
    });
    await theatreApi.addConsumable('SURG-20260420-0001', { item: 9, quantity_used: 1 });
    await theatreApi.createPACURecord('SURG-20260420-0001', {
      arrival_time: '2026-04-20T10:00:00Z',
      arriving_nurse: 8,
      initial_aldrete_score: 8,
    });

    expect(mockApiClient.post).toHaveBeenNthCalledWith(1, '/api/theatre/cases/SURG-20260420-0001/team/add/', { staff_member: 5, role: 'LEAD_SURGEON' });
    expect(mockApiClient.post).toHaveBeenNthCalledWith(2, '/api/theatre/cases/SURG-20260420-0001/anesthesia/create/', { anesthesiologist: 5 });
    expect(mockApiClient.patch).toHaveBeenCalledWith('/api/theatre/cases/SURG-20260420-0001/anesthesia/update/', { npo_confirmed: true });
    expect(mockApiClient.post).toHaveBeenNthCalledWith(3, '/api/theatre/cases/SURG-20260420-0001/operative-note/create/', {
      dictated_by: 5,
      pre_operative_diagnosis: 'Acute appendicitis',
      post_operative_diagnosis: 'Acute appendicitis confirmed',
      procedure_performed: 'Appendectomy',
      findings: 'Inflamed appendix',
      technique_description: 'Open approach',
    });
    expect(mockApiClient.post).toHaveBeenNthCalledWith(4, '/api/theatre/cases/SURG-20260420-0001/consumables/add/', { item: 9, quantity_used: 1 });
    expect(mockApiClient.post).toHaveBeenNthCalledWith(5, '/api/theatre/cases/SURG-20260420-0001/pacu/create/', {
      arrival_time: '2026-04-20T10:00:00Z',
      arriving_nurse: 8,
      initial_aldrete_score: 8,
    });
  });

  it('parses responses with theatre contexts', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { id: 1 } });
    await theatreApi.getCase('SURG-20260420-0001');
    expect(mockParseResponse).toHaveBeenCalledWith(expect.anything(), { id: 1 }, { context: 'theatreApi.getCase' });
  });
});
