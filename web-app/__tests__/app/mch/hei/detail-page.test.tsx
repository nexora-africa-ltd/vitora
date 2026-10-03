// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * HEI detail-route regression test.
 * Run with: npx jest __tests__/app/mch/hei/detail-page.test.tsx --runInBand.
 * Inputs: a promised HEI route ID and mocked HEI detail response.
 */

import { render, screen } from '@/__tests__/utils/test-utils';
import { act } from 'react';
import HEIDetailPage from '@/app/(dashboard)/mch/hei/[id]/page';

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: () => ({
      data: {
        id: 1,
        hei_number: 'HEI-0001',
        infant: 5,
        infant_name: 'Baby Wanjiku',
        infant_mrn: 'MRN-001',
        mch_registration: null,
        mother_name: 'Jane Wanjiku',
        enrollment_date: '2026-01-10',
        status: 'ACTIVE',
        mother_art_status: 'ON_ART',
        infant_arv_prophylaxis: 'NVP',
        arv_start_date: '2026-01-10',
        arv_end_date: null,
        breastfeeding_status: 'EXCLUSIVE',
        cotrimoxazole_prophylaxis: true,
        cotrimoxazole_start_date: '2026-02-01',
        enrolled_by: null,
        enrolled_by_name: null,
        pcr_tests: [],
        notes: '',
        created_at: '2026-01-10T00:00:00Z',
        updated_at: '2026-01-10T00:00:00Z',
      },
      isLoading: false,
      error: null,
    }),
  };
});

jest.mock('@/lib/api/mch', () => ({ heiFollowUpApi: { get: jest.fn() } }));
jest.mock('@/lib/context/page-refresh-context', () => ({
  usePageRefresh: () => ({ refresh: jest.fn(), isRefreshing: false }),
}));

describe('HEIDetailPage', () => {
  it('renders the HEI detail route for a selected follow-up record', async () => {
    await act(async () => {
      render(<HEIDetailPage params={Promise.resolve({ id: '1' })} />);
    });

    expect(screen.getByRole('heading', { name: /hei follow-up hei-0001/i })).toBeInTheDocument();
    expect(screen.getAllByText('Baby Wanjiku')).toHaveLength(2);
  });
});
