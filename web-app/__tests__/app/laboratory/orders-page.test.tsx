// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Purpose: Regression tests for the laboratory orders page route.
 * Usage: Run with `cd web-app && npx jest "__tests__/app/laboratory/orders-page.test.tsx" --runInBand`.
 * Inputs: Jest environment; mocked Next router, facility context, and lab hooks.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import LaboratoryOrdersPage from '@/app/(dashboard)/laboratory/orders/page';

const pushMock = jest.fn();
const useLabOrdersMock = jest.fn();
const useCreateRouteAccessMock = jest.fn();
const useFacilityMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

jest.mock('@/components/shared/page-header', () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {actions}
    </div>
  ),
}));

jest.mock('@/components/shared/pull-to-refresh', () => ({
  PullToRefresh: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/laboratory/lab-order-table', () => ({
  LabOrderTable: ({ orders }: { orders: Array<{ id: number }> }) => (
    <div data-testid="lab-order-table">orders: {orders.length}</div>
  ),
}));

jest.mock('@/lib/context/page-refresh-context', () => ({
  usePageRefresh: () => ({ refresh: jest.fn(), isRefreshing: false }),
}));

jest.mock('@/lib/hooks/use-laboratory', () => ({
  useLabOrders: (...args: unknown[]) => useLabOrdersMock(...args),
}));

jest.mock('@/lib/hooks/use-create-route-access', () => ({
  useCreateRouteAccess: () => useCreateRouteAccessMock(),
}));

jest.mock('@/lib/context/facility-context', () => ({
  useFacility: () => useFacilityMock(),
}));

describe('LaboratoryOrdersPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    useCreateRouteAccessMock.mockReturnValue(() => true);
    useFacilityMock.mockReturnValue({ facility: { id: 1 }, facilityDetail: null });
    useLabOrdersMock.mockReturnValue({
      data: { results: [{ id: 11 }], count: 1, next: null, previous: null },
      isLoading: false,
      error: null,
    });
  });

  it('renders the orders page and table content when facility is selected', () => {
    render(<LaboratoryOrdersPage />);

    expect(screen.getByRole('heading', { name: 'Lab Orders' })).toBeInTheDocument();
    expect(screen.getByTestId('lab-order-table')).toHaveTextContent('orders: 1');
    expect(useLabOrdersMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, page_size: 20 }),
      { enabled: true }
    );
  });

  it('shows facility selection message and disables query when no facility is active', () => {
    useFacilityMock.mockReturnValue({ facility: null, facilityDetail: null });

    render(<LaboratoryOrdersPage />);

    expect(screen.getByText('Select a facility to view laboratory orders.')).toBeInTheDocument();
    expect(screen.queryByTestId('lab-order-table')).not.toBeInTheDocument();
    expect(useLabOrdersMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, page_size: 20 }),
      { enabled: false }
    );
  });

  it('navigates to new order form from header action', async () => {
    const user = userEvent.setup();
    render(<LaboratoryOrdersPage />);

    await user.click(screen.getByRole('button', { name: 'New Lab Order' }));

    expect(pushMock).toHaveBeenCalledWith('/laboratory/orders/new');
  });
});
