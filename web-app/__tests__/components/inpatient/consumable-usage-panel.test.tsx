/**
 * @jest-environment jsdom
 */

import { render, screen, userEvent, waitFor } from '@/__tests__/utils/test-utils';

import { ConsumableUsagePanel } from '@/components/inpatient/consumable-usage-panel';
import {
  useAdmissionConsumableUsage,
  useRecordAdmissionConsumableUsage,
  useReverseAdmissionConsumableUsage,
} from '@/lib/hooks/use-inpatient';
import { useStockBatches } from '@/lib/hooks/use-pharmacy';

jest.mock('@/lib/hooks/use-inpatient', () => ({
  useAdmissionConsumableUsage: jest.fn(),
  useRecordAdmissionConsumableUsage: jest.fn(),
  useReverseAdmissionConsumableUsage: jest.fn(),
}));

jest.mock('@/lib/hooks/use-pharmacy', () => ({
  useStockBatches: jest.fn(),
}));

const mockUseAdmissionConsumableUsage = useAdmissionConsumableUsage as jest.MockedFunction<typeof useAdmissionConsumableUsage>;
const mockUseRecordAdmissionConsumableUsage = useRecordAdmissionConsumableUsage as jest.MockedFunction<typeof useRecordAdmissionConsumableUsage>;
const mockUseReverseAdmissionConsumableUsage = useReverseAdmissionConsumableUsage as jest.MockedFunction<typeof useReverseAdmissionConsumableUsage>;
const mockUseStockBatches = useStockBatches as jest.MockedFunction<typeof useStockBatches>;

describe('ConsumableUsagePanel', () => {
  const mutateAsyncRecord = jest.fn();
  const mutateAsyncReverse = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseAdmissionConsumableUsage.mockReturnValue({
      data: [
        {
          id: 10,
          admission: 1,
          drug: 5,
          drug_name: 'Sterile Dressing Pack',
          batch: 2,
          batch_number: 'DRESS-001',
          quantity_used: 2,
          used_by: 7,
          used_by_username: 'nurse1',
          used_at: '2026-03-08T08:00:00Z',
          is_reversed: false,
          notes: 'Morning dressing change',
        },
      ],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useAdmissionConsumableUsage>);

    mockUseStockBatches.mockReturnValue({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 2,
            drug: 5,
            drug_name: 'Sterile Dressing Pack',
            batch_number: 'DRESS-001',
            quantity_received: 100,
            quantity_available: 40,
            quantity_dispensed: 60,
            quantity_damaged: 0,
            quantity_expired: 0,
            expiry_date: '2026-12-31',
            received_date: '2026-01-01',
            cost_price: 10,
            selling_price: 15,
            received_by: 1,
            status: 'AVAILABLE',
            days_to_expiry: 200,
            is_expired: false,
            is_low_stock: false,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-03-08T00:00:00Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useStockBatches>);

    mockUseRecordAdmissionConsumableUsage.mockReturnValue({
      mutateAsync: mutateAsyncRecord,
      isPending: false,
    } as unknown as ReturnType<typeof useRecordAdmissionConsumableUsage>);

    mockUseReverseAdmissionConsumableUsage.mockReturnValue({
      mutateAsync: mutateAsyncReverse,
      isPending: false,
    } as unknown as ReturnType<typeof useReverseAdmissionConsumableUsage>);
  });

  it('records consumable usage against a stock batch', async () => {
    const user = userEvent.setup();
    render(<ConsumableUsagePanel admissionId={1} isActive={true} />);

    await user.click(screen.getByRole('button', { name: /record usage/i }));
    await user.click(screen.getByRole('combobox', { name: /stock batch/i }));
    await user.click(
      screen.getByRole('option', {
        name: /Sterile Dressing Pack .* DRESS-001 .* 40 left/i,
      })
    );
    await user.clear(screen.getByLabelText(/quantity used/i));
    await user.type(screen.getByLabelText(/quantity used/i), '3');
    await user.type(screen.getByLabelText(/notes/i), 'Used for evening wound care');
    await user.click(screen.getByRole('button', { name: /^record usage$/i }));

    await waitFor(() => {
      expect(mutateAsyncRecord).toHaveBeenCalledWith({
        admissionId: 1,
        data: {
          batch: 2,
          quantity_used: 3,
          notes: 'Used for evening wound care',
        },
      });
    });
  });

  it('reverses an unreversed consumable usage entry', async () => {
    const user = userEvent.setup();
    render(<ConsumableUsagePanel admissionId={1} isActive={true} />);

    await user.click(screen.getByRole('button', { name: /reverse/i }));
    await user.type(screen.getByLabelText(/reason/i), 'Duplicate charting entry');
    await user.click(screen.getByRole('button', { name: /^reverse usage$/i }));

    await waitFor(() => {
      expect(mutateAsyncReverse).toHaveBeenCalledWith({
        admissionId: 1,
        usageId: 10,
        data: { reason: 'Duplicate charting entry' },
      });
    });
  });
});
