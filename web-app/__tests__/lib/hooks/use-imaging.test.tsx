/**
 * Tests for imaging hooks.
 * Phase B: Frontend Order Management
 */

import { act, render, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, StrictMode } from 'react';
import { initCornerstone, useCornerstone } from '@/components/imaging/dicom/use-cornerstone';
import {
  useImagingProcedures,
  useImagingProcedureSearch,
  useImagingOrder,
  useImagingOrders,
  usePatientImagingOrders,
  useEncounterImagingOrders,
  useImagingWorklist,
  useWorklistStats,
  useCreateImagingOrder,
  imagingKeys,
} from '@/lib/hooks/use-imaging';
import { imagingApi } from '@/lib/api/imaging';

// Mock the API
jest.mock('@/lib/api/imaging', () => ({
  imagingApi: {
    listProcedures: jest.fn(),
    getProcedure: jest.fn(),
    searchProcedures: jest.fn(),
    listOrders: jest.fn(),
    getOrder: jest.fn(),
    getPatientOrders: jest.fn(),
    getEncounterOrders: jest.fn(),
    createOrder: jest.fn(),
    updateOrder: jest.fn(),
    deleteOrder: jest.fn(),
    submitOrder: jest.fn(),
    scheduleOrder: jest.fn(),
    startOrder: jest.fn(),
    completeOrder: jest.fn(),
    cancelOrder: jest.fn(),
    getWorklist: jest.fn(),
    getWorklistStats: jest.fn(),
  },
}));

const mockImagingApi = imagingApi as jest.Mocked<typeof imagingApi>;

// Exercise viewport lifecycle without requiring WebGL or decoding real DICOM in jsdom.
const mockSetStack = jest.fn(() => Promise.resolve());
const mockSetImageIdIndex = jest.fn(() => Promise.resolve());
const mockResetCamera = jest.fn();
const mockRender = jest.fn();
const mockEngines: Array<{ destroy: jest.Mock }> = [];
const mockCoreInit = jest.fn(() => Promise.resolve());
const mockLoaderInit = jest.fn();
const mockLoadAndCacheImage = jest.fn(() => Promise.resolve({ voiLUTFunction: 'S' }));
const mockAddTool = jest.fn();
const mockGroups = new Map();
const mockCreateGroup = jest.fn((id: string) => {
  if (mockGroups.has(id)) throw new Error('Duplicate tool group');
  const names = new Set();
  const group = {
    addViewport: jest.fn(),
    addTool: jest.fn((name: string) => {
      if (names.has(name)) throw new Error('Duplicate tool registration');
      names.add(name);
    }),
    setToolActive: jest.fn(),
  };
  mockGroups.set(id, group);
  return group;
});
const mockDestroyGroup = jest.fn((id: string) => mockGroups.delete(id));

jest.mock(
  '@cornerstonejs/core',
  () => ({
    init: () => mockCoreInit(),
    Enums: {
      ViewportType: { STACK: 'stack' },
      Events: { IMAGE_RENDERED: 'CORNERSTONE_IMAGE_RENDERED' },
    },
    RenderingEngine: jest.fn().mockImplementation(() => {
      const engine = {
        destroy: jest.fn(),
        resize: jest.fn(),
        enableElement: jest.fn(),
        getViewport: () => ({
          setStack: mockSetStack,
          setImageIdIndex: mockSetImageIdIndex,
          render: mockRender,
          resetCamera: mockResetCamera,
        }),
      };
      mockEngines.push(engine);
      return engine;
    }),
    imageLoader: { loadAndCacheImage: (...args: unknown[]) => mockLoadAndCacheImage(...args) },
  }),
  { virtual: true }
);
jest.mock(
  '@cornerstonejs/tools',
  () => ({
    init: jest.fn(),
    addTool: (...args: unknown[]) => mockAddTool(...args),
    ZoomTool: { toolName: 'Zoom' },
    PanTool: { toolName: 'Pan' },
    WindowLevelTool: { toolName: 'WindowLevel' },
    LengthTool: { toolName: 'Length' },
    AngleTool: { toolName: 'Angle' },
    EllipticalROITool: { toolName: 'EllipticalROI' },
    RectangleROITool: { toolName: 'RectangleROI' },
    StackScrollTool: { toolName: 'StackScroll' },
    Enums: { MouseBindings: { Primary: 1, Auxiliary: 4, Secondary: 2, Wheel: 524288 } },
    ToolGroupManager: {
      getToolGroup: (id: string) => mockGroups.get(id),
      createToolGroup: (id: string) => mockCreateGroup(id),
      destroyToolGroup: (id: string) => mockDestroyGroup(id),
    },
  }),
  { virtual: true }
);
jest.mock(
  '@cornerstonejs/dicom-image-loader',
  () => ({
    init: (...args: unknown[]) => mockLoaderInit(...args),
  }),
  { virtual: true }
);

function CornerstoneProbe({ urls }: { urls: string[] }) {
  const viewer = useCornerstone({ imageUrls: urls });
  return (
    <div>
      <div data-testid="viewport" ref={viewer.containerRef} />
      <button onClick={() => viewer.goToImage(1)}>Next</button>
      <span>{viewer.error || (viewer.isReady ? 'Ready' : 'Loading')}</span>
      <span data-testid="image-loading">{String(viewer.isImageLoading)}</span>
      <span data-testid="current-index">{viewer.currentIndex}</span>
    </div>
  );
}

describe('Cornerstone viewport lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGroups.clear();
    mockEngines.length = 0;
    mockSetStack.mockImplementation(() => Promise.resolve());
    mockSetImageIdIndex.mockImplementation(() => Promise.resolve());
    mockLoadAndCacheImage.mockImplementation(() => Promise.resolve({ voiLUTFunction: 'S' }));
    mockRender.mockImplementation(() => undefined);
    jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(512);
    jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(512);
  });
  afterEach(() => jest.restoreAllMocks());

  it('coalesces concurrent initialization instead of registering tools twice', async () => {
    await Promise.all([initCornerstone(), initCornerstone()]);
    expect(mockCoreInit).toHaveBeenCalledTimes(1);
    expect(mockAddTool).toHaveBeenCalledTimes(8);
    expect(mockLoaderInit).toHaveBeenCalledWith(
      expect.objectContaining({
        maxWebWorkers: 2,
      })
    );
  });

  it('creates only the current viewport during StrictMode effect replay', async () => {
    const view = render(
      <StrictMode>
        <CornerstoneProbe urls={['/one.dcm']} />
      </StrictMode>
    );
    await view.findByText('Ready');
    expect(mockEngines).toHaveLength(1);
    expect(mockCreateGroup).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(mockEngines[0].destroy).toHaveBeenCalledTimes(1);
    expect(mockGroups.size).toBe(0);
  });

  it('does not reload the stack when a parent recreates an equivalent URL array', async () => {
    const view = render(<CornerstoneProbe urls={['/one.dcm']} />);
    await view.findByText('Ready');
    view.rerender(<CornerstoneProbe urls={['/one.dcm']} />);
    await act(async () => {});
    expect(mockSetStack).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('does not create tools after an in-flight stack load is unmounted', async () => {
    let resolve!: () => void;
    mockSetStack.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        })
    );
    const view = render(<CornerstoneProbe urls={['/slow.dcm']} />);
    await waitFor(() => expect(mockSetStack).toHaveBeenCalled());
    view.unmount();
    await act(async () => resolve());
    expect(mockCreateGroup).not.toHaveBeenCalled();
    expect(mockEngines[0].destroy).toHaveBeenCalledTimes(1);
  });

  it('isolates tool groups for concurrently mounted viewers', async () => {
    const view = render(
      <>
        <CornerstoneProbe urls={['/one.dcm']} />
        <CornerstoneProbe urls={['/two.dcm']} />
      </>
    );
    await waitFor(() => expect(view.getAllByText('Ready')).toHaveLength(2));
    expect(mockGroups.size).toBe(2);
    view.unmount();
    expect(mockGroups.size).toBe(0);
  });

  it('ignores a stale load completing after the user switches stacks', async () => {
    let resolve!: () => void;
    mockSetStack.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        })
    );
    const view = render(<CornerstoneProbe urls={['/slow.dcm']} />);
    await waitFor(() => expect(mockSetStack).toHaveBeenCalledTimes(1));
    view.rerender(<CornerstoneProbe urls={['/new.dcm']} />);
    await view.findByText('Ready');
    await act(async () => resolve());
    expect(mockCreateGroup).toHaveBeenCalledTimes(1);
    expect(mockEngines[0].destroy).toHaveBeenCalledTimes(1);
    expect(mockEngines[1].destroy).not.toHaveBeenCalled();
    view.unmount();
  });

  it('fits a frame rendered during setStack, before its promise resolves', async () => {
    mockSetStack.mockImplementationOnce(() => {
      document
        .querySelector('[data-testid="viewport"]')!
        .dispatchEvent(new Event('CORNERSTONE_IMAGE_RENDERED'));
      return Promise.resolve();
    });
    const view = render(<CornerstoneProbe urls={['/cached.dcm']} />);
    await view.findByText('Ready');
    expect(mockResetCamera).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('restores all standard VOI LUT values from naturalized DICOM metadata', async () => {
    const image = { voiLUTFunction: 'L', data: { VOILUTFunction: 'LINEAR_EXACT' } };
    mockLoadAndCacheImage.mockResolvedValueOnce(image);
    const view = render(<CornerstoneProbe urls={['/mammo.dcm']} />);
    await view.findByText('Ready');
    expect(mockLoadAndCacheImage).toHaveBeenCalledWith('wadouri:/mammo.dcm');
    expect(image.voiLUTFunction).toBe('LINEAR_EXACT');
    view.unmount();
  });

  it('defaults invalid or absent VOI LUT values to the DICOM LINEAR default', async () => {
    const image = { voiLUTFunction: 'X' };
    mockLoadAndCacheImage.mockResolvedValueOnce(image);
    const view = render(<CornerstoneProbe urls={['/unknown-voi.dcm']} />);
    await view.findByText('Ready');
    expect(image.voiLUTFunction).toBe('LINEAR');
    view.unmount();
  });

  it('keeps the prior index behind a loading state until the selected image resolves', async () => {
    let resolve!: () => void;
    mockSetImageIdIndex.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        })
    );
    const view = render(<CornerstoneProbe urls={['/one.dcm', '/two.dcm']} />);
    await view.findByText('Ready');
    await act(async () => view.getByRole('button', { name: 'Next' }).click());
    expect(view.getByTestId('image-loading')).toHaveTextContent('true');
    expect(view.getByTestId('current-index')).toHaveTextContent('0');
    await act(async () => resolve());
    expect(view.getByTestId('image-loading')).toHaveTextContent('false');
    expect(view.getByTestId('current-index')).toHaveTextContent('1');
    expect(mockLoadAndCacheImage).toHaveBeenLastCalledWith('wadouri:/two.dcm');
    view.unmount();
  });

  it('normalizes the selected image before navigating to it', async () => {
    const firstImage = { voiLUTFunction: 'LINEAR' };
    const selectedImage = { voiLUTFunction: 'S', data: { VOILUTFunction: 'SIGMOID' } };
    mockLoadAndCacheImage.mockResolvedValueOnce(firstImage).mockResolvedValueOnce(selectedImage);
    const view = render(<CornerstoneProbe urls={['/one.dcm', '/two.dcm']} />);
    await view.findByText('Ready');
    await act(async () => view.getByRole('button', { name: 'Next' }).click());
    expect(selectedImage.voiLUTFunction).toBe('SIGMOID');
    expect(mockSetImageIdIndex).toHaveBeenCalledWith(1);
    view.unmount();
  });

  it('removes the initial-fit listener before rendering again and on cleanup', async () => {
    const view = render(<CornerstoneProbe urls={['/one.dcm']} />);
    await view.findByText('Ready');
    const element = view.getByTestId('viewport');
    mockResetCamera.mockClear();
    let nested = false;
    mockRender.mockImplementation(() => {
      if (!nested) {
        nested = true;
        element.dispatchEvent(new Event('CORNERSTONE_IMAGE_RENDERED'));
      }
    });
    act(() => {
      element.dispatchEvent(new Event('CORNERSTONE_IMAGE_RENDERED'));
    });
    expect(mockResetCamera).toHaveBeenCalledTimes(1);
    view.unmount();
    element.dispatchEvent(new Event('CORNERSTONE_IMAGE_RENDERED'));
    expect(mockResetCamera).toHaveBeenCalledTimes(1);
  });
});

// Create wrapper with fresh QueryClient for each test
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientTestWrapper';
  return Wrapper;
}

describe('imagingKeys', () => {
  it('generates correct query keys', () => {
    expect(imagingKeys.all).toEqual(['imaging']);
    expect(imagingKeys.procedures()).toEqual(['imaging', 'procedures']);
    expect(imagingKeys.orders()).toEqual(['imaging', 'orders']);
    expect(imagingKeys.orderDetail('IMG-001')).toEqual(['imaging', 'orders', 'detail', 'IMG-001']);
    expect(imagingKeys.patientOrders(123)).toEqual(['imaging', 'orders', 'patient', 123]);
    expect(imagingKeys.encounterOrders(456)).toEqual(['imaging', 'orders', 'encounter', 456]);
  });
});

describe('useImagingProcedures', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches procedures successfully', async () => {
    const mockData = {
      count: 2,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          code: 'XR-CHEST',
          name: 'Chest X-Ray',
          modality: 'XR' as const,
          body_region: 'CHEST' as const,
          cost: 1500,
          available_in_house: true,
          is_active: true,
        },
        {
          id: 2,
          code: 'US-ABDOM',
          name: 'Abdominal Ultrasound',
          modality: 'US' as const,
          body_region: 'ABDOMEN' as const,
          cost: 2500,
          available_in_house: true,
          is_active: true,
        },
      ],
    };

    mockImagingApi.listProcedures.mockResolvedValue(mockData);

    const { result } = renderHook(() => useImagingProcedures(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.results).toHaveLength(2);
    expect(mockImagingApi.listProcedures).toHaveBeenCalledTimes(1);
  });

  it('passes params to API', async () => {
    mockImagingApi.listProcedures.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });

    const { result } = renderHook(() => useImagingProcedures({ modality: 'CT', page: 2 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockImagingApi.listProcedures).toHaveBeenCalledWith({
      modality: 'CT',
      page: 2,
    });
  });
});

describe('useImagingProcedureSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches the initial procedure catalog when enabled without a search query', async () => {
    mockImagingApi.searchProcedures.mockResolvedValue([]);

    renderHook(() => useImagingProcedureSearch('', true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockImagingApi.searchProcedures).toHaveBeenCalledWith('');
    });
  });
});

describe('useImagingOrders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches orders successfully', async () => {
    const mockData = {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          order_number: 'IMG-2026-0001',
          patient: 1,
          encounter: 1,
          ordered_by: 1,
          priority: 'ROUTINE' as const,
          clinical_indication: 'Test',
          status: 'ORDERED' as const,
          total_cost: 1500,
          is_paid: false,
          items: [],
          ordered_at: '2026-02-06T10:00:00Z',
        },
      ],
    };

    mockImagingApi.listOrders.mockResolvedValue(mockData);

    const { result } = renderHook(() => useImagingOrders(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.results).toHaveLength(1);
  });
});

describe('useImagingOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches single order', async () => {
    const mockOrder = {
      id: 1,
      order_number: 'IMG-2026-0001',
      patient: 1,
      patient_name: 'John Doe',
      encounter: 1,
      ordered_by: 1,
      ordered_by_name: 'Dr. Smith',
      priority: 'URGENT' as const,
      clinical_indication: 'Trauma',
      status: 'IN_PROGRESS' as const,
      total_cost: 3000,
      is_paid: false,
      items: [],
      ordered_at: '2026-02-06T10:00:00Z',
    };

    mockImagingApi.getOrder.mockResolvedValue(mockOrder);

    const { result } = renderHook(() => useImagingOrder('IMG-2026-0001'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.order_number).toBe('IMG-2026-0001');
    expect(mockImagingApi.getOrder).toHaveBeenCalledWith('IMG-2026-0001');
  });

  it('is disabled when orderNumber is empty', async () => {
    const { result } = renderHook(() => useImagingOrder(''), {
      wrapper: createWrapper(),
    });

    // Should not call API when disabled
    expect(mockImagingApi.getOrder).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('usePatientImagingOrders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches orders for a patient', async () => {
    const mockOrders = [
      {
        id: 1,
        order_number: 'IMG-2026-0001',
        patient: 123,
        encounter: 1,
        ordered_by: 1,
        priority: 'ROUTINE' as const,
        clinical_indication: 'Test 1',
        status: 'COMPLETED' as const,
        total_cost: 1500,
        is_paid: true,
        items: [],
        ordered_at: '2026-02-06T10:00:00Z',
      },
    ];

    mockImagingApi.getPatientOrders.mockResolvedValue(mockOrders);

    const { result } = renderHook(() => usePatientImagingOrders(123), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(mockImagingApi.getPatientOrders).toHaveBeenCalledWith(123);
  });
});

describe('useEncounterImagingOrders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches orders for an encounter', async () => {
    const mockOrders = [
      {
        id: 1,
        order_number: 'IMG-2026-0001',
        patient: 1,
        encounter: 456,
        ordered_by: 1,
        priority: 'STAT' as const,
        clinical_indication: 'Emergency',
        status: 'ORDERED' as const,
        total_cost: 5000,
        is_paid: false,
        items: [],
        ordered_at: '2026-02-06T10:00:00Z',
      },
    ];

    mockImagingApi.getEncounterOrders.mockResolvedValue(mockOrders);

    const { result } = renderHook(() => useEncounterImagingOrders(456), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(mockImagingApi.getEncounterOrders).toHaveBeenCalledWith(456);
  });
});

describe('useWorklistStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches worklist statistics', async () => {
    const mockStats = {
      total_pending: 5,
      total_in_progress: 3,
      total_completed_today: 12,
      stat_orders: 1,
      urgent_orders: 2,
    };

    mockImagingApi.getWorklistStats.mockResolvedValue(mockStats);

    const { result } = renderHook(() => useWorklistStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.total_pending).toBe(5);
    expect(result.current.data?.stat_orders).toBe(1);
  });
});

describe('useCreateImagingOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates an order and invalidates queries', async () => {
    const newOrderData = {
      patient: 1,
      encounter: 1,
      priority: 'ROUTINE' as const,
      clinical_indication: 'Test order',
      items: [{ procedure_code: 'XR-CHEST' }],
    };

    const createdOrder = {
      id: 1,
      order_number: 'IMG-2026-0001',
      ...newOrderData,
      ordered_by: 1,
      status: 'DRAFT' as const,
      total_cost: 1500,
      is_paid: false,
      items: [
        {
          id: 1,
          procedure: 1,
          procedure_name: 'Chest X-Ray',
          procedure_code: 'XR-CHEST',
          modality: 'XR' as const,
          laterality: 'NA' as const,
          is_completed: false,
          unit_cost: 1500,
        },
      ],
      ordered_at: '2026-02-06T10:00:00Z',
    };

    mockImagingApi.createOrder.mockResolvedValue(createdOrder);

    const { result } = renderHook(() => useCreateImagingOrder(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync(newOrderData);

    expect(mockImagingApi.createOrder).toHaveBeenCalledWith(newOrderData);
  });
});
