/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';

import { AdmissionOrdersTab } from '@/components/inpatient/admission-orders-tab';
import { useAdmissionOrders } from '@/lib/hooks/use-inpatient';

jest.mock('@/lib/hooks/use-inpatient', () => ({
  useAdmissionOrders: jest.fn(),
}));

const mockUseAdmissionOrders = useAdmissionOrders as jest.MockedFunction<typeof useAdmissionOrders>;

describe('AdmissionOrdersTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('links admission prescriptions to the pharmacy detail page by numeric id', () => {
    mockUseAdmissionOrders.mockReturnValue({
      data: {
        lab_orders: [],
        imaging_orders: [],
        prescriptions: [
          {
            id: 42,
            prescription_number: 'RX-ADM-001',
            status: 'PENDING',
            prescribed_date: '2026-03-08T09:00:00Z',
            items: [{ id: 1 }],
          },
        ],
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useAdmissionOrders>);

    render(<AdmissionOrdersTab admissionId={1} patientId={2} encounterId={3} />);

    expect(screen.getByRole('link', { name: /RX-ADM-001/i })).toHaveAttribute(
      'href',
      '/pharmacy/prescriptions/42'
    );
  });
});