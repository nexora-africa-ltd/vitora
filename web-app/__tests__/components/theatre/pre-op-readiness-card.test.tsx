import { render, screen } from '@testing-library/react';
import { PreOpReadinessCard } from '@/components/theatre/pre-op-workspace';

describe('PreOpReadinessCard', () => {
  it('shows ready state when all checks are complete', () => {
    render(
      <PreOpReadinessCard
        consentReady={true}
        labsReady={true}
        whoReady={true}
        anesthesiaReady={true}
        labOrders={[]}
      />
    );

    expect(screen.getByText('Ready for theatre')).toBeInTheDocument();
    expect(screen.getAllByText('Complete').length).toBeGreaterThanOrEqual(4);
  });

  it('shows pending state when any readiness check is incomplete', () => {
    render(
      <PreOpReadinessCard
        consentReady={false}
        labsReady={false}
        whoReady={true}
        anesthesiaReady={false}
        labOrders={[
          {
            id: 1,
            order_number: 'LAB-1',
            patient: 1,
            encounter: 1,
            ordered_by: 1,
            order_type: 'IN_HOUSE',
            status: 'ORDERED',
            priority: 'ROUTINE',
            specimen_collected: false,
            ordered_at: '2026-04-20T08:00:00Z',
            items: [],
            total_cost: 0,
            created_at: '2026-04-20T08:00:00Z',
            updated_at: '2026-04-20T08:00:00Z',
          },
        ]}
      />
    );

    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('Some linked lab orders are still pending.')).toBeInTheDocument();
    expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(1);
  });
});
