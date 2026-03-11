import { pharmacyApi } from './pharmacy';
import { apiClient } from './client';

jest.mock('./client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('pharmacyApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns matching drugs from the paginated search payload', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 3,
            code: 'PCM500',
            generic_name: 'Paracetamol',
            brand_names: 'Panadol',
            strength: '500mg',
            form: 'TABLET',
            category: 'ANALGESIC',
            categories: ['ANALGESIC'],
            unit: 'tablet',
            schedule: 'P',
            is_essential: true,
            keml_code: null,
            nhif_code: null,
            requires_prescription: false,
            is_controlled: false,
            is_narcotic: false,
            default_reorder_level: 100,
            default_reorder_quantity: 200,
            shelf_life_months: 24,
            storage_requirements: '',
            reference_price: '5.00',
            is_active: true,
            display_name: 'Paracetamol 500mg TABLET',
            current_stock: 320,
            created_at: '2026-03-11T09:00:00Z',
            updated_at: '2026-03-11T09:00:00Z',
          },
        ],
      },
    });

    const drugs = await pharmacyApi.searchDrugs('para');

    expect(mockedApiClient.get).toHaveBeenCalledWith('/api/pharmacy/drugs/', {
      params: { search: 'para', page_size: 25 },
    });
    expect(drugs[0]?.display_name).toContain('Paracetamol');
    expect(drugs[0]?.reference_price).toBe(5);
  });

  it('posts dispense payloads and validates array responses', async () => {
    mockedApiClient.post.mockResolvedValueOnce({
      data: [
        {
          id: 19,
          prescription_item: 88,
          patient: 14,
          patient_name: 'Jane Doe',
          drug: 3,
          drug_name: 'Paracetamol',
          batch: 7,
          batch_number: 'B-001',
          quantity_dispensed: 20,
          quantity_returned: 0,
          unit_price: 5,
          total_price: 100,
          discount: 0,
          instructions_given: 'Take after meals',
          patient_counseled: true,
          dispensed_by: 5,
          dispensed_by_name: 'Pharmacist One',
          dispensed_at: '2026-03-11T11:00:00Z',
          verified_by: null,
          verified_by_name: null,
          verified_at: null,
          notes: '',
          created_at: '2026-03-11T11:00:00Z',
        },
      ],
    });

    const payload = {
      drug_id: 3,
      patient_id: 14,
      quantity: 20,
      prescription_item_id: 88,
    };

    const dispensings = await pharmacyApi.dispense(payload);

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/pharmacy/dispensings/dispense/', payload);
    expect(dispensings[0]?.quantity_dispensed).toBe(20);
    expect(dispensings[0]?.batch_number).toBe('B-001');
  });
});