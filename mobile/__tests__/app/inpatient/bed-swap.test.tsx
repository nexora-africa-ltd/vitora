import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import BedBoardScreen from '@/app/inpatient/[wardId]';
import { inpatientApi } from '@/lib/api/inpatient';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({ wardId: '1' }),
}));

jest.mock('@/lib/theme/theme-context', () => ({
  useAppTheme: () => ({
    theme: require('@/constants/theme').lightTheme,
    isDarkMode: false,
  }),
}));

jest.mock('@/lib/api/inpatient', () => ({
  inpatientApi: {
    getWard: jest.fn(),
    getWardBeds: jest.fn(),
    swapBeds: jest.fn(),
  },
}));

const mockedApi = inpatientApi as jest.Mocked<typeof inpatientApi>;

const wardData = {
  id: 1,
  name: 'Medical Ward 1',
  code: 'MW001',
  ward_type: 'MEDICAL' as const,
  ward_type_display: 'Medical',
  capacity: 6,
  total_beds: 6,
  occupied_beds: 3,
  available_beds: 3,
  occupancy_rate: 50,
  is_active: true,
};

const bedsData = {
  count: 6,
  next: null,
  previous: null,
  results: [
    { id: 1, ward: 1, bed_number: 'B-001', status: 'OCCUPIED' as const, status_display: 'Occupied' },
    { id: 2, ward: 1, bed_number: 'B-002', status: 'OCCUPIED' as const, status_display: 'Occupied' },
    { id: 3, ward: 1, bed_number: 'B-003', status: 'OCCUPIED' as const, status_display: 'Occupied' },
    { id: 4, ward: 1, bed_number: 'B-004', status: 'AVAILABLE' as const, status_display: 'Available' },
    { id: 5, ward: 1, bed_number: 'B-005', status: 'AVAILABLE' as const, status_display: 'Available' },
    { id: 6, ward: 1, bed_number: 'B-006', status: 'MAINTENANCE' as const, status_display: 'Under Maintenance' },
  ],
};

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });

  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <BedBoardScreen />
    </QueryClientProvider>
  );

  return { ...rendered, queryClient };
}

describe('Bed swap functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    mockedApi.getWard.mockResolvedValue(wardData as never);
    mockedApi.getWardBeds.mockResolvedValue(bedsData as never);
  });

  it('shows swap beds button when 2+ occupied beds exist', async () => {
    const rendered = renderScreen();

    expect(await screen.findByText('Swap beds')).toBeTruthy();

    rendered.unmount();
    rendered.queryClient.clear();
  });

  it('hides swap beds button when fewer than 2 occupied beds', async () => {
    mockedApi.getWardBeds.mockResolvedValue({
      ...bedsData,
      results: [
        { id: 1, ward: 1, bed_number: 'B-001', status: 'OCCUPIED' as const, status_display: 'Occupied' },
        { id: 2, ward: 1, bed_number: 'B-002', status: 'AVAILABLE' as const, status_display: 'Available' },
      ],
    } as never);

    const rendered = renderScreen();

    await screen.findByText('B-001');
    expect(screen.queryByText('Swap beds')).toBeNull();

    rendered.unmount();
    rendered.queryClient.clear();
  });

  it('enters swap mode with instruction to tap first bed', async () => {
    const rendered = renderScreen();

    const swapBtn = await screen.findByText('Swap beds');
    fireEvent.press(swapBtn);

    expect(await screen.findByText('Tap the first occupied bed.')).toBeTruthy();

    rendered.unmount();
    rendered.queryClient.clear();
  });

  it('shows confirm swap button after selecting two beds', async () => {
    const rendered = renderScreen();

    const swapBtn = await screen.findByText('Swap beds');
    fireEvent.press(swapBtn);

    await screen.findByText('Tap the first occupied bed.');

    // Tap first occupied bed
    const bed1 = screen.getByText('B-001');
    fireEvent.press(bed1);

    expect(await screen.findByText(/Selected: B-001/)).toBeTruthy();

    // Tap second occupied bed
    const bed2 = screen.getByText('B-002');
    fireEvent.press(bed2);

    expect(await screen.findByText(/Swapping B-001 ↔ B-002/)).toBeTruthy();
    expect(screen.getByText('Confirm swap')).toBeTruthy();

    rendered.unmount();
    rendered.queryClient.clear();
  });

  it('exits swap mode when cancel is pressed', async () => {
    const rendered = renderScreen();

    const swapBtn = await screen.findByText('Swap beds');
    fireEvent.press(swapBtn);

    await screen.findByText('Tap the first occupied bed.');

    const cancelBtn = screen.getByText('Cancel');
    fireEvent.press(cancelBtn);

    // Should no longer show swap instructions
    expect(screen.queryByText('Tap the first occupied bed.')).toBeNull();

    rendered.unmount();
    rendered.queryClient.clear();
  });

  it('calls swapBeds API on confirm and shows success alert', async () => {
    mockedApi.swapBeds.mockResolvedValue({
      bed_a: 1,
      bed_b: 2,
      bed_a_number: 'B-001',
      bed_b_number: 'B-002',
      message: 'Beds B-001 and B-002 swapped successfully.',
    });

    const rendered = renderScreen();

    // Enter swap mode
    const swapBtn = await screen.findByText('Swap beds');
    fireEvent.press(swapBtn);

    // Select two beds
    const bed1 = screen.getByText('B-001');
    fireEvent.press(bed1);
    const bed2 = screen.getByText('B-002');
    fireEvent.press(bed2);

    // Confirm
    const confirmBtn = await screen.findByText('Confirm swap');
    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(mockedApi.swapBeds).toHaveBeenCalledWith({
        bed_a: 1,
        bed_b: 2,
        reason: undefined,
      });
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Beds swapped',
        'Beds B-001 and B-002 swapped successfully.'
      );
    });

    rendered.unmount();
    rendered.queryClient.clear();
  });

  it('shows error alert when swap fails', async () => {
    mockedApi.swapBeds.mockRejectedValue(new Error('Internal server error'));

    const rendered = renderScreen();

    const swapBtn = await screen.findByText('Swap beds');
    fireEvent.press(swapBtn);

    const bed1 = screen.getByText('B-001');
    fireEvent.press(bed1);
    const bed2 = screen.getByText('B-002');
    fireEvent.press(bed2);

    const confirmBtn = await screen.findByText('Confirm swap');
    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'Failed to swap beds. Please try again.'
      );
    });

    rendered.unmount();
    rendered.queryClient.clear();
  });
});
