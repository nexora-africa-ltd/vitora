// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** Staff lookup regression tests. Run npx jest staff-search-combobox --runInBand; no extra inputs. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StaffSearchCombobox } from '@/components/clinics/staff-search-combobox';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useStaffLookup } from '@/lib/hooks/use-rbac';

jest.mock('@/lib/hooks/use-rbac', () => ({
  useStaffLookup: jest.fn(),
  useStaffList: jest.fn(() => ({ data: undefined, isLoading: false })),
}));

const staff = {
  id: 91,
  user: 42,
  full_name: 'Dr Jane Smith',
  user_email: 'jane@example.com',
  employee_id: 'EMP-91',
  primary_role_name: 'Doctor',
  primary_department_name: 'Emergency',
  license_number: 'KMP-123',
};
const mockLookup = useStaffLookup as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockLookup.mockReturnValue({ data: { results: [staff], count: 1 }, isLoading: false });
});

it('surfaces lookup results and returns the user ID and selection details', async () => {
  const onSelect = jest.fn();
  render(<StaffSearchCombobox value={undefined} onSelect={onSelect} />);
  await userEvent.click(screen.getByRole('combobox'));
  await userEvent.click(await screen.findByRole('option', { name: /Dr Jane Smith/ }));
  expect(onSelect).toHaveBeenCalledWith(42, staff);
});

it('retains local filtering for other SearchableSelect callers', async () => {
  render(
    <SearchableSelect
      options={[{ value: '1', label: 'Jane' }, { value: '2', label: 'John' }]}
      onValueChange={jest.fn()}
    />
  );
  await userEvent.click(screen.getByRole('combobox'));
  fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'Jane' } });
  await waitFor(() => expect(screen.queryByRole('option', { name: 'John' })).not.toBeInTheDocument());
  expect(screen.getByRole('option', { name: 'Jane' })).toBeInTheDocument();
});

it('uses debounced remote search without discarding multi-term server matches', async () => {
  render(<StaffSearchCombobox value={undefined} onSelect={jest.fn()} />);
  await userEvent.click(screen.getByRole('combobox'));
  const input = screen.getByPlaceholderText('Search by name, email, or employee ID...');
  fireEvent.change(input, { target: { value: 'Smith Jane' } });
  await waitFor(() =>
    expect(mockLookup).toHaveBeenLastCalledWith({ search: 'Smith Jane', page_size: 50 })
  );
  expect(screen.getByRole('option', { name: /Dr Jane Smith/ })).toBeInTheDocument();
});

it('keeps the selected clinician visible after search results change', async () => {
  const onSelect = jest.fn();
  const { rerender } = render(<StaffSearchCombobox value={undefined} onSelect={onSelect} />);
  await userEvent.click(screen.getByRole('combobox'));
  await userEvent.click(await screen.findByRole('option', { name: /Dr Jane Smith/ }));
  mockLookup.mockReturnValue({ data: { results: [], count: 0 }, isLoading: false });
  rerender(<StaffSearchCombobox value={42} onSelect={onSelect} />);
  expect(screen.getByRole('combobox')).toHaveTextContent('Dr Jane Smith');
});

it('shows lookup failures as errors with retry instead of an empty staff list', async () => {
  const refetch = jest.fn();
  mockLookup.mockReturnValue({ isLoading: false, isError: true, refetch });
  render(<StaffSearchCombobox value={undefined} onSelect={jest.fn()} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to load staff');
  expect(screen.queryByText('No staff members found.')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Retry staff lookup' }));
  expect(refetch).toHaveBeenCalledTimes(1);
});

it('excludes assigned users and honors disabled state', async () => {
  const { rerender } = render(
    <StaffSearchCombobox value={undefined} onSelect={jest.fn()} excludeUserIds={[42]} />
  );
  await userEvent.click(screen.getByRole('combobox'));
  expect(screen.queryByRole('option', { name: /Dr Jane Smith/ })).not.toBeInTheDocument();
  rerender(<StaffSearchCombobox value={undefined} onSelect={jest.fn()} disabled />);
  expect(screen.getAllByRole('combobox')[0]).toBeDisabled();
});
