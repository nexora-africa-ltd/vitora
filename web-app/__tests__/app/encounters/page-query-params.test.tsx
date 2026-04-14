import { render, screen, waitFor } from '@testing-library/react';
import EncountersPage from '@/app/(dashboard)/encounters/page';

const mockUseEncounters = jest.fn();
const mockUseMyClaimedEncounters = jest.fn();
const mockUseAllClaimedEncounters = jest.fn();
const mockUseReleaseEncounter = jest.fn();
const mockSearchParams = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => mockSearchParams(),
}));

jest.mock('@/lib/hooks/use-encounters', () => ({
  useEncounters: (...args: unknown[]) => mockUseEncounters(...args),
}));

jest.mock('@/lib/hooks/use-consultation-queue', () => ({
  useMyClaimedEncounters: (...args: unknown[]) => mockUseMyClaimedEncounters(...args),
  useAllClaimedEncounters: (...args: unknown[]) => mockUseAllClaimedEncounters(...args),
  useReleaseEncounter: () => mockUseReleaseEncounter(),
}));

jest.mock('@/lib/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock('@/components/encounters/consultation-queue-container', () => ({
  ConsultationQueueContainer: () => <div>Consultation Queue</div>,
}));

jest.mock('@/components/encounters/encounter-table', () => ({
  EncounterTable: ({
    encounters,
    emptyTitle,
  }: {
    encounters: unknown[];
    emptyTitle?: string;
  }) => (
    <div>
      <div>Encounter Table {encounters.length}</div>
      {emptyTitle ? <div>{emptyTitle}</div> : null}
    </div>
  ),
}));

describe('EncountersPage workflow query params', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams.mockReturnValue(new URLSearchParams());
    mockUseEncounters.mockReturnValue({
      data: { count: 0, results: [] },
      isLoading: false,
      error: null,
    });
    mockUseMyClaimedEncounters.mockReturnValue({
      data: { count: 0, results: [] },
      isLoading: false,
    });
    mockUseAllClaimedEncounters.mockReturnValue({
      data: { count: 0, results: [] },
      isLoading: false,
    });
    mockUseReleaseEncounter.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });
  });

  it('defaults to the consultation queue when no workflow params are present', () => {
    render(<EncountersPage />);

    expect(screen.getByText('Consultation Queue')).toBeInTheDocument();
    expect(mockUseEncounters).toHaveBeenCalledWith({
      page: 1,
      page_size: 10,
      status: undefined,
      encounter_type: undefined,
      ordering: '-encounter_date',
    });
  });

  it('opens the all encounters tab with the requested status filter from workflow params', async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams('tab=all&status=RESULTS_PENDING'));

    render(<EncountersPage />);

    await waitFor(() => {
      expect(screen.getByText('Encounter Table 0')).toBeInTheDocument();
    });

    expect(screen.getByText('Pending Results')).toBeInTheDocument();
    expect(screen.getByText('No encounters are currently waiting on results.')).toBeInTheDocument();

    expect(mockUseEncounters).toHaveBeenCalledWith({
      page: 1,
      page_size: 10,
      status: 'RESULTS_PENDING',
      encounter_type: undefined,
      ordering: '-encounter_date',
    });
  });

  it('opens the consultation queue tab for waiting-for-consult workflow links', async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams('tab=queue'));

    render(<EncountersPage />);

    await waitFor(() => {
      expect(screen.getByText('Consultation Queue')).toBeInTheDocument();
    });
    expect(screen.queryByText('Encounter Table 0')).not.toBeInTheDocument();
  });

  it('maps date=today to an exact encounter_date filter for completed encounters', async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams('tab=all&status=CLOSED&date=today'));

    render(<EncountersPage />);

    await waitFor(() => {
      expect(screen.getByText('Encounter Table 0')).toBeInTheDocument();
    });

    expect(screen.getByText('Completed Today')).toBeInTheDocument();

    const today = new Date().toISOString().split('T')[0];
    expect(mockUseEncounters).toHaveBeenCalledWith({
      page: 1,
      page_size: 10,
      status: 'CLOSED',
      encounter_type: undefined,
      encounter_date: today,
      ordering: '-encounter_date',
    });
  });
});
