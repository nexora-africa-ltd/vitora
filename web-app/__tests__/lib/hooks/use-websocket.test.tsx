/**
 * Tests for WebSocket hooks
 */
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWebSocket, useClinicQueueSocket, getConnectionStatusText, getConnectionStatusColor } from '@/lib/hooks/use-websocket';
import { usePatientJourneyStore } from '@/lib/stores/patient-journey';
import React from 'react';

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    // Mock send
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event('open'));
    }
  }

  simulateMessage(data: unknown) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

// Setup and teardown
beforeAll(() => {
  (global as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;
});

beforeEach(() => {
  MockWebSocket.instances = [];
  // Reset patient journey store
  usePatientJourneyStore.setState({ activePatients: {}, selectedPatientId: null });
});

// Helper to create wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientTestWrapper';
  return Wrapper;
}

describe('useWebSocket', () => {
  it('should connect to WebSocket when URL is provided', async () => {
    const { result } = renderHook(
      () => useWebSocket('ws://localhost/test'),
      { wrapper: createWrapper() }
    );

    expect(result.current.connectionState).toBe('connecting');
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost/test');
  });

  it('should not connect when URL is null', () => {
    const { result } = renderHook(
      () => useWebSocket(null),
      { wrapper: createWrapper() }
    );

    expect(result.current.connectionState).toBe('disconnected');
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('should update state to connected on open', async () => {
    const { result } = renderHook(
      () => useWebSocket('ws://localhost/test'),
      { wrapper: createWrapper() }
    );

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    expect(result.current.connectionState).toBe('connected');
    expect(result.current.isConnected).toBe(true);
  });

  it('should call onMessage when message received', async () => {
    const onMessage = jest.fn();
    
    renderHook(
      () => useWebSocket('ws://localhost/test', { onMessage }),
      { wrapper: createWrapper() }
    );

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    act(() => {
      MockWebSocket.instances[0].simulateMessage({ event: 'test', data: { foo: 'bar' } });
    });

    expect(onMessage).toHaveBeenCalledWith({ event: 'test', data: { foo: 'bar' } });
  });

  it('should disconnect when disconnect() is called', () => {
    const { result } = renderHook(
      () => useWebSocket('ws://localhost/test'),
      { wrapper: createWrapper() }
    );

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.connectionState).toBe('disconnected');
  });
});

describe('useClinicQueueSocket', () => {
  it('should connect to clinic queue WebSocket', () => {
    renderHook(
      () => useClinicQueueSocket(123),
      { wrapper: createWrapper() }
    );

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toContain('/ws/clinics/123/queue/');
  });

  it('should not connect when clinicId is null', () => {
    renderHook(
      () => useClinicQueueSocket(null),
      { wrapper: createWrapper() }
    );

    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('should update patient journey store on patient_called event', () => {
    // First register a patient
    usePatientJourneyStore.getState().registerPatient({
      id: 1,
      mrn: 'MRN-001',
      name: 'Test Patient',
    });

    renderHook(
      () => useClinicQueueSocket(123),
      { wrapper: createWrapper() }
    );

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        event: 'patient_called',
        data: {
          visit_id: 1,
          patient_id: 1,
          patient_name: 'Test Patient',
          queue_number: 5,
          called_at: '2026-01-26T10:00:00Z',
        },
      });
    });

    const patient = usePatientJourneyStore.getState().getPatient(1);
    expect(patient?.consultation_status).toBe('CALLED');
  });

  it('should update patient journey store on consultation_started event', () => {
    // Register and check in patient
    const store = usePatientJourneyStore.getState();
    store.registerPatient({ id: 2, mrn: 'MRN-002', name: 'Test Patient 2' });
    store.checkInPatient(2);

    renderHook(
      () => useClinicQueueSocket(123),
      { wrapper: createWrapper() }
    );

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        event: 'consultation_started',
        data: {
          visit_id: 2,
          patient_id: 2,
          patient_name: 'Test Patient 2',
          queue_number: 6,
          encounter_id: 100,
          consultation_start: '2026-01-26T10:05:00Z',
        },
      });
    });

    const patient = usePatientJourneyStore.getState().getPatient(2);
    expect(patient?.consultation_status).toBe('IN_PROGRESS');
    expect(patient?.encounter_id).toBe(100);
  });
});

describe('getConnectionStatusText', () => {
  it('should return correct text for each state', () => {
    expect(getConnectionStatusText('connecting')).toBe('Connecting...');
    expect(getConnectionStatusText('connected')).toBe('Live updates active');
    expect(getConnectionStatusText('reconnecting')).toBe('Reconnecting...');
    expect(getConnectionStatusText('disconnected')).toBe('Disconnected (polling fallback)');
    expect(getConnectionStatusText('error')).toBe('Connection error (polling fallback)');
  });
});

describe('getConnectionStatusColor', () => {
  it('should return correct color for each state', () => {
    expect(getConnectionStatusColor('connected')).toBe('green');
    expect(getConnectionStatusColor('connecting')).toBe('yellow');
    expect(getConnectionStatusColor('reconnecting')).toBe('yellow');
    expect(getConnectionStatusColor('error')).toBe('red');
    expect(getConnectionStatusColor('disconnected')).toBe('gray');
  });
});
