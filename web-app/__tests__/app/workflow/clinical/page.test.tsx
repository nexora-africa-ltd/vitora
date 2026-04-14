import { render, screen } from '@testing-library/react';
import ClinicalWorkflowPage from '@/app/(dashboard)/workflow/clinical/page';

jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: () => ({
    canAccessModule: () => true,
    canPerformAction: () => true,
  }),
}));

jest.mock('@/lib/context/facility-context', () => ({
  useFacility: () => ({
    hasModule: () => true,
  }),
}));

jest.mock('@/lib/hooks/use-clinical-workflow', () => ({
  useClinicalWorkflowCounts: () => ({
    isLoading: false,
    counts: {
      waitingForTriage: 3,
      waitingForConsult: 5,
      inProgress: 2,
      pendingResults: 4,
      readyToClose: 1,
      completedToday: 8,
      openWork: 15,
    },
  }),
}));

describe('ClinicalWorkflowPage', () => {
  it('renders the clinical workflow buckets', () => {
    render(<ClinicalWorkflowPage />);

    expect(screen.getByText("Today's Queue")).toBeInTheDocument();
    expect(screen.getByText('Waiting for Triage')).toBeInTheDocument();
    expect(screen.getByText('Waiting for Consult')).toBeInTheDocument();
    expect(screen.getByText('Pending Results')).toBeInTheDocument();
    expect(screen.getByText('Ready to Close')).toBeInTheDocument();
    expect(screen.getAllByText('Completed Today').length).toBeGreaterThan(0);
    expect(screen.getByText('Open Work')).toBeInTheDocument();
    expect(screen.getAllByText('4').length).toBeGreaterThan(0);
  });
});
