import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FacilitySwitcher } from '@/components/layout/facility-switcher';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSwitchFacility = jest.fn();
const mockFacility = {
  id: 1,
  name: 'Main Clinic',
  mfl_code: '12345',
  modules: { outpatient: true, inpatient: true, pharmacy: true, laboratory: true, imaging: false, theatre: false, emergency: false, maternity: false },
};

const mockOrganization = { id: 10, name: 'Demo Health Group' };

const mockUseFacility = jest.fn();
jest.mock('@/lib/context/facility-context', () => ({
  useFacility: () => mockUseFacility(),
}));

const mockFacilitiesList = jest.fn();
jest.mock('@/lib/api/facilities', () => ({
  facilitiesApi: {
    list: (...args: unknown[]) => mockFacilitiesList(...args),
    get: jest.fn().mockResolvedValue({
      id: 2,
      name: 'Branch Clinic',
      mfl_code: '12346',
      level: 3,
      organization: 10,
      organization_name: 'Demo Health Group',
      modules: { outpatient: true, inpatient: false, pharmacy: true, laboratory: false, imaging: false, theatre: false, emergency: false, maternity: false },
    }),
  },
  toUserFacility: jest.fn((detail: Record<string, unknown>) => ({
    id: detail.id,
    name: detail.name,
    mfl_code: detail.mfl_code,
    modules: detail.modules,
  })),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FacilitySwitcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when no facility is set', () => {
    mockUseFacility.mockReturnValue({
      facility: null,
      switchFacility: mockSwitchFacility,
      organization: null,
    });
    mockFacilitiesList.mockResolvedValue({ results: [] });

    const { container } = render(<FacilitySwitcher />, {
      wrapper: createWrapper(),
    });
    expect(container.firstChild).toBeNull();
  });

  it('shows static facility name for single-facility users', async () => {
    mockUseFacility.mockReturnValue({
      facility: mockFacility,
      switchFacility: mockSwitchFacility,
      organization: mockOrganization,
    });
    mockFacilitiesList.mockResolvedValue({
      results: [{ id: 1, name: 'Main Clinic', mfl_code: '12345', level: 4, is_headquarters: true }],
    });

    render(<FacilitySwitcher />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Main Clinic')).toBeInTheDocument();
    });

    // No combobox button for single facility
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('renders dropdown with all org facilities for multi-facility users', async () => {
    mockUseFacility.mockReturnValue({
      facility: mockFacility,
      switchFacility: mockSwitchFacility,
      organization: mockOrganization,
    });
    mockFacilitiesList.mockResolvedValue({
      results: [
        { id: 1, name: 'Main Clinic', mfl_code: '12345', level: 4, is_headquarters: true },
        { id: 2, name: 'Branch Clinic', mfl_code: '12346', level: 3, is_headquarters: false },
        { id: 3, name: 'Mobile Unit', mfl_code: '12347', level: 2, is_headquarters: false },
      ],
    });

    render(<FacilitySwitcher />, { wrapper: createWrapper() });

    // Wait for facilities to load
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    // Open the dropdown
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));

    // All facilities should be listed (Main Clinic appears in both trigger and list)
    await waitFor(() => {
      expect(screen.getAllByText('Main Clinic').length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('Branch Clinic')).toBeInTheDocument();
      expect(screen.getByText('Mobile Unit')).toBeInTheDocument();
    });

    // Organization name as group heading
    expect(screen.getByText('Demo Health Group')).toBeInTheDocument();
  });

  it('shows HQ badge on headquarters facility', async () => {
    mockUseFacility.mockReturnValue({
      facility: mockFacility,
      switchFacility: mockSwitchFacility,
      organization: mockOrganization,
    });
    mockFacilitiesList.mockResolvedValue({
      results: [
        { id: 1, name: 'Main Clinic', mfl_code: '12345', level: 4, is_headquarters: true },
        { id: 2, name: 'Branch Clinic', mfl_code: '12346', level: 3, is_headquarters: false },
      ],
    });

    render(<FacilitySwitcher />, { wrapper: createWrapper() });

    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('combobox'));

    await waitFor(() => {
      expect(screen.getByText('HQ')).toBeInTheDocument();
    });
  });

  it('calls switchFacility when a different facility is selected', async () => {
    mockUseFacility.mockReturnValue({
      facility: mockFacility,
      switchFacility: mockSwitchFacility,
      organization: mockOrganization,
    });
    mockFacilitiesList.mockResolvedValue({
      results: [
        { id: 1, name: 'Main Clinic', mfl_code: '12345', level: 4, is_headquarters: true },
        { id: 2, name: 'Branch Clinic', mfl_code: '12346', level: 3, is_headquarters: false },
      ],
    });

    render(<FacilitySwitcher />, { wrapper: createWrapper() });

    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('combobox'));

    await waitFor(() => {
      expect(screen.getByText('Branch Clinic')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Branch Clinic'));

    await waitFor(() => {
      expect(mockSwitchFacility).toHaveBeenCalledWith(
        expect.objectContaining({ id: 2, name: 'Branch Clinic' }),
      );
    });
  });

  it('does NOT call switchFacility when selecting the current facility', async () => {
    mockUseFacility.mockReturnValue({
      facility: mockFacility,
      switchFacility: mockSwitchFacility,
      organization: mockOrganization,
    });
    mockFacilitiesList.mockResolvedValue({
      results: [
        { id: 1, name: 'Main Clinic', mfl_code: '12345', level: 4, is_headquarters: true },
        { id: 2, name: 'Branch Clinic', mfl_code: '12346', level: 3, is_headquarters: false },
      ],
    });

    render(<FacilitySwitcher />, { wrapper: createWrapper() });

    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('combobox'));

    await waitFor(() => {
      expect(screen.getAllByText('Main Clinic').length).toBeGreaterThan(0);
    });

    // Click the currently active facility in the list
    const options = screen.getAllByText('Main Clinic');
    const optionInList = options.find((el) => el.closest('[cmdk-item]'));
    if (optionInList) {
      await user.click(optionInList);
    }

    expect(mockSwitchFacility).not.toHaveBeenCalled();
  });
});
