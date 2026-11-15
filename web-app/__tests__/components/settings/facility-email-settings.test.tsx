// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** Tests contextual help in facility Custom Email settings. Run with `npm test -- facility-email-settings`; inputs are mocked facility and SMTP API data. */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { facilityEmailApi } from '@/lib/api/facility-email';
import { FacilityEmailSettings } from '@/components/settings/facility-email-settings';

beforeAll(() => {
  Object.defineProperty(window, 'PointerEvent', {
    writable: true,
    value: window.MouseEvent,
  });
});

jest.mock('@/lib/context/facility-context', () => ({
  useFacility: () => ({
    facilityDetail: {
      id: 1,
      modules: { custom_email: true },
    },
  }),
}));

jest.mock('@/lib/api/facility-email', () => ({
  facilityEmailApi: {
    current: jest.fn().mockResolvedValue(null),
    providers: jest.fn().mockResolvedValue({
      providers: [
        {
          id: 'gmail',
          name: 'Gmail',
          smtp_host: 'smtp.gmail.com',
          smtp_port: 587,
          security_mode: 'STARTTLS',
        },
      ],
    }),
    save: jest.fn(),
    testConnection: jest.fn(),
  },
}));

const mockSave = facilityEmailApi.save as jest.MockedFunction<typeof facilityEmailApi.save>;
const mockTestConnection = facilityEmailApi.testConnection as jest.MockedFunction<
  typeof facilityEmailApi.testConnection
>;

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <FacilityEmailSettings />
    </QueryClientProvider>
  );
}

describe('FacilityEmailSettings', () => {
  beforeEach(() => {
    mockSave.mockReset();
    mockSave.mockResolvedValue({ id: 1 });
    mockTestConnection.mockReset();
    mockTestConnection.mockResolvedValue(undefined);
  });

  it('provides a contextual help control for every visible Custom Email setting', () => {
    renderSettings();

    expect(screen.getAllByRole('button', { name: /^Help:/ })).toHaveLength(7);
  });

  it('explains the difference between the sender and reply-to addresses', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('button', { name: 'Help: From address' }));
    expect(
      await screen.findByText(/recipients see this address as the sender/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Help: Reply-to address' }));
    expect(await screen.findByText(/replies are delivered to this mailbox/i)).toBeInTheDocument();
  });

  it('tests the connection automatically and then reveals SMTP activation after saving', async () => {
    const user = userEvent.setup();
    renderSettings();

    const saveButton = screen.getByRole('button', { name: /save smtp settings/i });
    expect(screen.queryByRole('button', { name: /test connection/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();

    await user.hover(saveButton);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      /save smtp settings first to test the connection and enable facility smtp/i
    );

    await user.click(saveButton);

    await waitFor(() => {
      expect(mockTestConnection).toHaveBeenCalled();
      expect(mockTestConnection.mock.calls[0][0]).toBe(1);
      expect(screen.getByRole('button', { name: /test connection/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Help:/ })).toHaveLength(8);
  });
});
