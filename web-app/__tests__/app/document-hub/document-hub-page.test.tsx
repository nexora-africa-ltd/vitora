// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * What this file is for:
 * - Coverage for Document Hub page behavior including responsive classes,
 *   list states, search/filter wiring, pagination, signing, sharing, and preview.
 *
 * How to run:
 * - cd web-app && npm test -- __tests__/app/document-hub/document-hub-page.test.tsx
 *
 * Supported inputs:
 * - Jest runtime only.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DocumentHubPage from '@/app/(dashboard)/document-hub/page';

const mockUseDocumentHub = jest.fn();
const mockToast = jest.fn();
const mockRefresh = jest.fn();
const mockShareMutateAsync = jest.fn();
const mockSignMutateAsync = jest.fn();

jest.mock('@/lib/context/page-refresh-context', () => ({
  usePageRefresh: () => ({
    refresh: mockRefresh,
    isRefreshing: false,
  }),
}));

jest.mock('@/lib/hooks', () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock('@/lib/hooks/use-debounce', () => ({
  useDebounce: (value: string) => value,
}));

jest.mock('@/lib/hooks/use-document-hub', () => ({
  useDocumentHub: (...args: unknown[]) => mockUseDocumentHub(...args),
  useShareDocument: () => ({ isPending: false, mutateAsync: mockShareMutateAsync }),
  useSignFromHub: () => ({ isPending: false, mutateAsync: mockSignMutateAsync }),
}));

jest.mock('@/components/shared/pull-to-refresh', () => ({
  PullToRefresh: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/shared/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

jest.mock('@/components/clinics/staff-search-combobox', () => ({
  StaffSearchCombobox: ({ onSelect }: { onSelect: (value: number) => void }) => (
    <div>
      <button type="button" onClick={() => onSelect(99)}>
        select-recipient
      </button>
    </div>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder: string;
  }) => <input value={value} onChange={onChange} placeholder={placeholder} />,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, className, asChild, ...props }: any) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, {
        className: `${children.props.className || ''} ${className || ''}`.trim(),
      });
    }
    return (
      <button className={className} {...props}>
        {children}
      </button>
    );
  },
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('@/components/ui/tabs', () => {
  const React = require('react');
  const TabsContext = React.createContext({
    value: '',
    onValueChange: (_value: string) => {},
  });

  return {
    Tabs: ({
      value,
      onValueChange,
      children,
    }: {
      value: string;
      onValueChange: (value: string) => void;
      children: React.ReactNode;
    }) => (
      <TabsContext.Provider value={{ value, onValueChange }}>{children}</TabsContext.Provider>
    ),
    TabsList: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div role="tablist" className={className}>
        {children}
      </div>
    ),
    TabsTrigger: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const ctx = React.useContext(TabsContext);
      const label = typeof children === 'string' ? children : undefined;
      return (
        <button
          type="button"
          role="tab"
          aria-selected={ctx.value === value}
          aria-label={label}
          onClick={() => ctx.onValueChange(value)}
        >
          {children}
        </button>
      );
    },
  };
});

jest.mock('@/components/ui/select', () => {
  const React = require('react');
  const SelectContext = React.createContext({
    value: '',
    onValueChange: (_value: string) => {},
  });

  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value: string;
      onValueChange: (value: string) => void;
      children: React.ReactNode;
    }) => (
      <SelectContext.Provider value={{ value, onValueChange }}>{children}</SelectContext.Provider>
    ),
    SelectTrigger: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <button type="button" className={className}>
        {children}
      </button>
    ),
    SelectValue: () => <span>value</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const ctx = React.useContext(SelectContext);
      return (
        <button type="button" onClick={() => ctx.onValueChange(value)}>
          {children}
        </button>
      );
    },
  };
});

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-content" className={className}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

const mockItem = {
  document_type: 'Invoice',
  document_id: 42,
  document_number: 'INV-042',
  title: 'Invoice INV-042',
  status: 'DRAFT',
  patient_name: 'Jane Doe',
  owner_name: 'Dr. Admin',
  is_signed: false,
  can_sign: true,
  is_shared_with_me: false,
  share_permission: null,
  shared_by_name: null,
  signed_at: null,
  shared_at: null,
};

function setupHubResponse(overrides?: Partial<ReturnType<typeof mockUseDocumentHub>>) {
  const refetch = jest.fn();
  const response = {
    data: {
      count: 1,
      results: [mockItem],
    },
    isLoading: false,
    isFetching: false,
    refetch,
    ...overrides,
  };
  mockUseDocumentHub.mockReturnValue(response);
  return response;
}

describe('DocumentHubPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupHubResponse();
  });

  it('renders page header, stats, and search input', () => {
    render(<DocumentHubPage />);

    expect(screen.getByRole('heading', { name: 'Document Hub' })).toBeInTheDocument();
    expect(screen.getByText('Visible')).toBeInTheDocument();
    expect(screen.getAllByText('Signed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pending Signature').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Shared').length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText('Search by number, patient, owner...')).toBeInTheDocument();
  });

  it('renders loading state and empty state', () => {
    setupHubResponse({ isLoading: true });
    const { rerender } = render(<DocumentHubPage />);
    expect(screen.getByText('Loading documents...')).toBeInTheDocument();

    setupHubResponse({ data: { count: 0, results: [] }, isLoading: false });
    rerender(<DocumentHubPage />);
    expect(screen.getByText('No documents found.')).toBeInTheDocument();
  });

  it('passes query params to useDocumentHub and updates on search', async () => {
    render(<DocumentHubPage />);

    expect(mockUseDocumentHub).toHaveBeenLastCalledWith({
      tab: 'mine',
      q: undefined,
      page: 1,
      page_size: 20,
    });

    fireEvent.change(screen.getByPlaceholderText('Search by number, patient, owner...'), {
      target: { value: 'INV-042' },
    });

    await waitFor(() => {
      expect(mockUseDocumentHub).toHaveBeenLastCalledWith({
        tab: 'mine',
        q: 'INV-042',
        page: 1,
        page_size: 20,
      });
    });
  });

  it('switches tab filters and requests updated data', async () => {
    render(<DocumentHubPage />);

    fireEvent.click(screen.getByRole('tab', { name: 'Signed' }));

    await waitFor(() => {
      expect(mockUseDocumentHub).toHaveBeenLastCalledWith({
        tab: 'signed',
        q: undefined,
        page: 1,
        page_size: 20,
      });
    });
  });

  it('supports pagination and page-size changes', async () => {
    setupHubResponse({ data: { count: 44, results: [mockItem] } });
    render(<DocumentHubPage />);

    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => {
      expect(mockUseDocumentHub).toHaveBeenLastCalledWith({
        tab: 'mine',
        q: undefined,
        page: 2,
        page_size: 20,
      });
    });

    fireEvent.click(screen.getByRole('button', { name: '50 / page' }));
    await waitFor(() => {
      expect(mockUseDocumentHub).toHaveBeenLastCalledWith({
        tab: 'mine',
        q: undefined,
        page: 1,
        page_size: 50,
      });
    });
  });

  it('signs a document and refreshes list', async () => {
    const { refetch } = setupHubResponse();
    mockSignMutateAsync.mockResolvedValue({});

    render(<DocumentHubPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign' }));

    await waitFor(() => {
      expect(mockSignMutateAsync).toHaveBeenCalledWith({
        document_type: 'Invoice',
        document_id: 42,
      });
      expect(refetch).toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith({ title: 'Document signed' });
    });
  });

  it('shows share validation error when recipient is missing', async () => {
    render(<DocumentHubPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    const dialog = screen.getByTestId('dialog-content');
    const shareButtons = within(dialog).getAllByRole('button', { name: 'Share' });
    fireEvent.click(shareButtons[shareButtons.length - 1]);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Select a recipient staff member',
        variant: 'destructive',
      });
    });
  });

  it('shares a document successfully and resets share dialog state', async () => {
    const { refetch } = setupHubResponse();
    mockShareMutateAsync.mockResolvedValue({});

    render(<DocumentHubPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    const dialog = screen.getByTestId('dialog-content');
    fireEvent.click(within(dialog).getByRole('button', { name: 'select-recipient' }));

    const shareButtons = within(dialog).getAllByRole('button', { name: 'Share' });
    fireEvent.click(shareButtons[shareButtons.length - 1]);

    await waitFor(() => {
      expect(mockShareMutateAsync).toHaveBeenCalledWith({
        document_type: 'Invoice',
        document_id: 42,
        shared_with: 99,
        permission: 'VIEW',
      });
      expect(refetch).toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith({ title: 'Document shared' });
    });
  });

  it('opens preview dialog with metadata and full-page link', () => {
    render(<DocumentHubPage />);

    fireEvent.click(screen.getByRole('button', { name: 'View' }));

    const dialog = screen.getByTestId('dialog-content');
    expect(within(dialog).getByRole('heading', { name: 'Invoice INV-042' })).toBeInTheDocument();
    expect(within(dialog).getByText('Loading preview...')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Open Full Page' })).toHaveAttribute(
      'href',
      '/transactions/invoices/42'
    );
  });

  it('keeps responsive classes for small screens', () => {
    render(<DocumentHubPage />);

    expect(screen.getByRole('tablist')).toHaveClass('h-auto');
    expect(screen.getByRole('button', { name: 'View' })).toHaveClass('flex-1');
    expect(screen.getByRole('button', { name: 'Sign' })).toHaveClass('flex-1');
    expect(screen.getByRole('button', { name: 'Share' })).toHaveClass('flex-1');

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    const dialog = screen.getByTestId('dialog-content');
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveClass('w-full');
  });
});
