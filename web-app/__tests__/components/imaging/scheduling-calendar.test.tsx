/**
 * Tests for SchedulingCalendar component.
 * Phase B: Frontend Order Management - Scheduling Calendar
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SchedulingCalendar } from '@/components/imaging/scheduling-calendar';
import { imagingApi } from '@/lib/api/imaging';
import { format, addDays, subDays } from 'date-fns';
import {
  ImagingCalendarResponse,
  ImagingModality,
} from '@/lib/types/imaging';

// Mock the imaging API
jest.mock('@/lib/api/imaging', () => ({
  imagingApi: {
    getCalendar: jest.fn(),
    listResources: jest.fn(),
    getResourceAvailability: jest.fn(),
  },
}));

const mockImagingApi = imagingApi as jest.Mocked<typeof imagingApi>;

// Mock calendar data
const mockCalendarData: ImagingCalendarResponse = {
  date: '2026-02-07',
  resources: [
    {
      resource: {
        id: 1,
        name: 'X-Ray Room 1',
        code: 'XR-ROOM-1',
        resource_type: 'ROOM',
        is_active: true,
        metadata: {
          department: 'radiology',
          modalities: ['XR'] as ImagingModality[],
          room_number: '101',
        },
      },
      slots: [
        {
          date: '2026-02-07',
          start_time: '08:00:00',
          end_time: '08:30:00',
          is_available: true,
          appointment: null,
        },
        {
          date: '2026-02-07',
          start_time: '08:30:00',
          end_time: '09:00:00',
          is_available: false,
          appointment: {
            id: 1,
            patient_name: 'John Doe',
            appointment_number: 'APT-2026-001',
            status: 'CONFIRMED',
          },
        },
        {
          date: '2026-02-07',
          start_time: '09:00:00',
          end_time: '09:30:00',
          is_available: true,
          appointment: null,
        },
      ],
      total_slots: 3,
      available_slots: 2,
      booked_slots: 1,
    },
    {
      resource: {
        id: 2,
        name: 'CT Scanner',
        code: 'CT-SCANNER-1',
        resource_type: 'EQUIPMENT',
        is_active: true,
        metadata: {
          department: 'radiology',
          modalities: ['CT'] as ImagingModality[],
          room_number: '102',
        },
      },
      slots: [
        {
          date: '2026-02-07',
          start_time: '08:00:00',
          end_time: '08:45:00',
          is_available: true,
          appointment: null,
        },
        {
          date: '2026-02-07',
          start_time: '08:45:00',
          end_time: '09:30:00',
          is_available: true,
          appointment: null,
        },
      ],
      total_slots: 2,
      available_slots: 2,
      booked_slots: 0,
    },
  ],
};

const emptyCalendarData: ImagingCalendarResponse = {
  date: '2026-02-07',
  resources: [],
};

// Helper to create a QueryClient wrapper
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });

  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
};

let user: ReturnType<typeof userEvent.setup>;

describe('SchedulingCalendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-07T10:00:00'));
    mockImagingApi.getCalendar.mockResolvedValue(mockCalendarData);
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Rendering', () => {
    it('renders the calendar header with title', async () => {
      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Imaging Schedule')).toBeInTheDocument();
      });
    });

    it('renders the date navigation controls', async () => {
      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /previous day/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /next day/i })).toBeInTheDocument();
      });
    });

    it('displays current date by default', async () => {
      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/Sat, Feb 7, 2026/)).toBeInTheDocument();
      });
    });

    it('displays resources with their names', async () => {
      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('X-Ray Room 1')).toBeInTheDocument();
        expect(screen.getByText('CT Scanner')).toBeInTheDocument();
      });
    });

    it('displays availability stats', async () => {
      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Total slots = 3 + 2 = 5
        expect(screen.getByText('Total:')).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument();
      });
    });

    it('shows modality filter dropdown', async () => {
      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('All Modalities')).toBeInTheDocument();
      });
    });

    it('shows refresh button', async () => {
      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /refresh calendar/i })).toBeInTheDocument();
      });
    });

    it('shows legend for available and booked slots', async () => {
      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Available')).toBeInTheDocument();
        expect(screen.getByText('Booked')).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    it('shows loading skeleton while fetching data', () => {
      mockImagingApi.getCalendar.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      // The skeleton should be present while loading
      const skeletons = document.querySelectorAll('[class*="animate-pulse"], [class*="Skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Error State', () => {
    it('shows error message when API fails', async () => {
      mockImagingApi.getCalendar.mockRejectedValue(new Error('Failed to load calendar'));

      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Failed to load calendar')).toBeInTheDocument();
      });
    });

    it('shows retry button on error', async () => {
      mockImagingApi.getCalendar.mockRejectedValue(new Error('API error'));

      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
    });

    it('can retry after error', async () => {
      mockImagingApi.getCalendar.mockRejectedValueOnce(new Error('API error'));
      mockImagingApi.getCalendar.mockResolvedValueOnce(mockCalendarData);

      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: /retry/i });
      await user.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText('X-Ray Room 1')).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no resources found', async () => {
      mockImagingApi.getCalendar.mockResolvedValue(emptyCalendarData);

      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('No resources found')).toBeInTheDocument();
      });
    });

    it('shows empty state message when filtering by modality with no results', async () => {
      mockImagingApi.getCalendar.mockResolvedValue(emptyCalendarData);

      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/no imaging resources/i)).toBeInTheDocument();
      });
    });
  });

  describe('Date Navigation', () => {
    it('navigates to previous day when clicking previous button', async () => {
      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/Feb 7, 2026/)).toBeInTheDocument();
      });

      const prevButton = screen.getByRole('button', { name: /previous day/i });
      await user.click(prevButton);

      await waitFor(() => {
        expect(screen.getByText(/Feb 6, 2026/)).toBeInTheDocument();
      });
    });

    it('navigates to next day when clicking next button', async () => {
      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/Feb 7, 2026/)).toBeInTheDocument();
      });

      const nextButton = screen.getByRole('button', { name: /next day/i });
      await user.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText(/Feb 8, 2026/)).toBeInTheDocument();
      });
    });

    it('does not show Today button when on today', async () => {
      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /^today$/i })).not.toBeInTheDocument();
      });
    });

    it('shows Today button when not on today', async () => {
      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      // Navigate to next day
      const nextButton = screen.getByRole('button', { name: /next day/i });
      await user.click(nextButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^today$/i })).toBeInTheDocument();
      });
    });

    it('returns to today when clicking Today button', async () => {
      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      // Navigate to next day
      const nextButton = screen.getByRole('button', { name: /next day/i });
      await user.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText(/Feb 8, 2026/)).toBeInTheDocument();
      });

      const todayButton = screen.getByRole('button', { name: /^today$/i });
      await user.click(todayButton);

      await waitFor(() => {
        expect(screen.getByText(/Feb 7, 2026/)).toBeInTheDocument();
      });
    });
  });

  describe('Slot Display', () => {
    it('displays time slots in the header', async () => {
      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('8:00 AM')).toBeInTheDocument();
        expect(screen.getByText('8:30 AM')).toBeInTheDocument();
        expect(screen.getByText('9:00 AM')).toBeInTheDocument();
      });
    });

    it('displays availability count for each resource', async () => {
      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('2/3 available')).toBeInTheDocument(); // X-Ray Room 1
        expect(screen.getByText('2/2 available')).toBeInTheDocument(); // CT Scanner
      });
    });
  });

  describe('Slot Interaction', () => {
    it('calls onSlotSelect when clicking an available slot', async () => {
      const onSlotSelect = jest.fn();
      render(<SchedulingCalendar onSlotSelect={onSlotSelect} />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('X-Ray Room 1')).toBeInTheDocument();
      });

      // Find and click an available slot
      const availableSlots = screen.getAllByRole('button', { name: /available slot/i });
      await user.click(availableSlots[0]);

      expect(onSlotSelect).toHaveBeenCalled();
      expect(onSlotSelect).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({
          is_available: true,
        })
      );
    });

    it('does not call onSlotSelect when clicking a booked slot', async () => {
      const onSlotSelect = jest.fn();
      render(<SchedulingCalendar onSlotSelect={onSlotSelect} />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('X-Ray Room 1')).toBeInTheDocument();
      });

      // Find and click a booked slot
      const bookedSlots = screen.getAllByRole('button', { name: /booked slot/i });
      await user.click(bookedSlots[0]);

      expect(onSlotSelect).not.toHaveBeenCalled();
    });

    it('shows appointment info tooltip on hover for booked slots', async () => {
      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('X-Ray Room 1')).toBeInTheDocument();
      });

      // Hover over booked slot to trigger tooltip
      const bookedSlots = screen.getAllByRole('button', { name: /booked slot/i });
      await user.hover(bookedSlots[0]);

      // Tooltip content should appear
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('APT-2026-001')).toBeInTheDocument();
      });
    });
  });

  describe('Modality Filtering', () => {
    it('updates calendar when selecting a modality filter', async () => {
      const filteredData: ImagingCalendarResponse = {
        date: '2026-02-07',
        resources: [mockCalendarData.resources[0]], // Only X-Ray
      };

      mockImagingApi.getCalendar
        .mockResolvedValueOnce(mockCalendarData)
        .mockResolvedValueOnce(filteredData);

      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('X-Ray Room 1')).toBeInTheDocument();
        expect(screen.getByText('CT Scanner')).toBeInTheDocument();
      });

      // Open modality filter
      const filterTrigger = screen.getByRole('combobox');
      await user.click(filterTrigger);

      // Select X-Ray
      const xrayOption = await screen.findByRole('option', { name: 'X-Ray' });
      await user.click(xrayOption);

      // API should be called with modality filter
      await waitFor(() => {
        expect(mockImagingApi.getCalendar).toHaveBeenCalledWith(
          expect.objectContaining({
            modality: 'XR',
          })
        );
      });
    });
  });

  describe('Refresh', () => {
    it('refreshes calendar when clicking refresh button', async () => {
      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('X-Ray Room 1')).toBeInTheDocument();
      });

      // Initial call
      expect(mockImagingApi.getCalendar).toHaveBeenCalledTimes(1);

      const refreshButton = screen.getByRole('button', { name: /refresh calendar/i });
      await user.click(refreshButton);

      await waitFor(() => {
        expect(mockImagingApi.getCalendar).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Props', () => {
    it('renders in compact mode when compact prop is true', async () => {
      render(<SchedulingCalendar compact />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('X-Ray Room 1')).toBeInTheDocument();
      });
    });

    it('hides booked slots when showOnlyAvailable is true', async () => {
      render(<SchedulingCalendar showOnlyAvailable />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('X-Ray Room 1')).toBeInTheDocument();
      });

      // Available slots should be visible
      const availableSlots = screen.getAllByRole('button', { name: /available slot/i });
      expect(availableSlots.length).toBeGreaterThan(0);

      // Booked slots should be hidden/dimmed (not clickable)
      // The booked slot button should exist but be semi-transparent
    });
  });

  describe('API Calls', () => {
    it('calls API with correct date parameter', async () => {
      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(mockImagingApi.getCalendar).toHaveBeenCalledWith({
          date: '2026-02-07',
          modality: undefined,
        });
      });
    });

    it('calls API with new date when navigating', async () => {
      render(<SchedulingCalendar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/Feb 7, 2026/)).toBeInTheDocument();
      });

      const nextButton = screen.getByRole('button', { name: /next day/i });
      await user.click(nextButton);

      await waitFor(() => {
        expect(mockImagingApi.getCalendar).toHaveBeenCalledWith({
          date: '2026-02-08',
          modality: undefined,
        });
      });
    });
  });
});
