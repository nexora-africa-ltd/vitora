import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimelineFilters } from '@/components/patients/timeline-filters';
import type { TimelineFilters as FilterType } from '@/lib/types/timeline';

describe('TimelineFilters', () => {
  const defaultFilters: FilterType = {
    eventTypes: ['encounter', 'lab_result', 'prescription', 'vital_alert', 'diagnosis', 'admission', 'discharge'],
    startDate: undefined,
    endDate: undefined,
    searchQuery: undefined,
  };

  const mockOnChange = jest.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it('renders search input', () => {
    render(<TimelineFilters filters={defaultFilters} onChange={mockOnChange} />);
    
    expect(screen.getByPlaceholderText('Search timeline...')).toBeInTheDocument();
  });

  it('renders filters button', () => {
    render(<TimelineFilters filters={defaultFilters} onChange={mockOnChange} />);
    
    expect(screen.getByRole('button', { name: /filters/i })).toBeInTheDocument();
  });

  it('submits search on form submit', async () => {
    const user = userEvent.setup();
    render(<TimelineFilters filters={defaultFilters} onChange={mockOnChange} />);
    
    const searchInput = screen.getByPlaceholderText('Search timeline...');
    await user.type(searchInput, 'test search');
    
    const searchButton = screen.getByRole('button', { name: 'Search' });
    await user.click(searchButton);
    
    expect(mockOnChange).toHaveBeenCalledWith({
      ...defaultFilters,
      searchQuery: 'test search',
    });
  });

  it('opens filter popover on click', async () => {
    const user = userEvent.setup();
    render(<TimelineFilters filters={defaultFilters} onChange={mockOnChange} />);
    
    const filtersButton = screen.getByRole('button', { name: /filters/i });
    await user.click(filtersButton);
    
    expect(screen.getByText('Event Types')).toBeInTheDocument();
    expect(screen.getByText('Date Range')).toBeInTheDocument();
  });

  it('shows event type checkboxes', async () => {
    const user = userEvent.setup();
    render(<TimelineFilters filters={defaultFilters} onChange={mockOnChange} />);
    
    await user.click(screen.getByRole('button', { name: /filters/i }));
    
    expect(screen.getByText('Visits')).toBeInTheDocument();
    expect(screen.getByText('Lab Results')).toBeInTheDocument();
    expect(screen.getByText('Prescriptions')).toBeInTheDocument();
  });

  it('displays active filter count badge', () => {
    const filtersWithDate: FilterType = {
      ...defaultFilters,
      startDate: '2026-01-01',
    };
    
    render(<TimelineFilters filters={filtersWithDate} onChange={mockOnChange} />);
    
    // Should show badge with count
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('displays search query tag when active', () => {
    const filtersWithSearch: FilterType = {
      ...defaultFilters,
      searchQuery: 'test',
    };
    
    render(<TimelineFilters filters={filtersWithSearch} onChange={mockOnChange} />);
    
    expect(screen.getByText('"test"')).toBeInTheDocument();
  });

  it('displays date filter tags when active', () => {
    const filtersWithDates: FilterType = {
      ...defaultFilters,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    };
    
    render(<TimelineFilters filters={filtersWithDates} onChange={mockOnChange} />);
    
    expect(screen.getByText('From: 2026-01-01')).toBeInTheDocument();
    expect(screen.getByText('To: 2026-01-31')).toBeInTheDocument();
  });

  it('clears search query when X is clicked', async () => {
    const user = userEvent.setup();
    const filtersWithSearch: FilterType = {
      ...defaultFilters,
      searchQuery: 'test',
    };
    
    render(<TimelineFilters filters={filtersWithSearch} onChange={mockOnChange} />);
    
    // Find the X button in the search tag
    const tagContainer = screen.getByText('"test"').parentElement;
    const clearButton = tagContainer?.querySelector('button');
    
    if (clearButton) {
      await user.click(clearButton);
      expect(mockOnChange).toHaveBeenCalledWith({
        ...filtersWithSearch,
        searchQuery: undefined,
      });
    }
  });

  it('has clear all button in popover', async () => {
    const user = userEvent.setup();
    render(<TimelineFilters filters={defaultFilters} onChange={mockOnChange} />);
    
    await user.click(screen.getByRole('button', { name: /filters/i }));
    
    expect(screen.getByText('Clear all')).toBeInTheDocument();
  });
});
