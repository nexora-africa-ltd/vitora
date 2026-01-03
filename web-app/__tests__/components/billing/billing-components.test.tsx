/**
 * TDD Tests for Billing Components - RED PHASE
 * 
 * Tests for billing UI components before implementation.
 * All tests should FAIL initially.
 * 
 * User Stories:
 * - KE-CSH-001: Payment Processing
 * - KE-CSH-002: Invoice Generation
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Components to be implemented
import { InvoiceList } from '@/components/billing/InvoiceList';
import { InvoiceDetail } from '@/components/billing/InvoiceDetail';
import { InvoiceForm } from '@/components/billing/InvoiceForm';
import { PaymentForm } from '@/components/billing/PaymentForm';
import { PaymentList } from '@/components/billing/PaymentList';
import { ReceiptView } from '@/components/billing/ReceiptView';
import { ServiceSelector } from '@/components/billing/ServiceSelector';
import { MpesaPaymentDialog } from '@/components/billing/MpesaPaymentDialog';
import { CreditNoteForm } from '@/components/billing/CreditNoteForm';
import { BillingDashboard } from '@/components/billing/BillingDashboard';

// Mock hooks
jest.mock('@/lib/hooks/billing');
jest.mock('@/lib/api/billing');

// Test wrapper
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

// ============================================================================
// Test Fixtures
// ============================================================================

const mockInvoice = {
  id: 1,
  invoice_number: 'INV-20260103-0001',
  patient: 1,
  patient_name: 'Jane Doe',
  patient_mrn: 'MRN-20260101-0001',
  status: 'PENDING' as const,
  invoice_date: '2026-01-03',
  due_date: '2026-02-02',
  subtotal: '1500.00',
  discount_type: null,
  discount_value: '0.00',
  discount_amount: '0.00',
  tax_amount: '0.00',
  total_amount: '1500.00',
  amount_paid: '0.00',
  balance_due: '1500.00',
  insurance_coverage: '0.00',
  notes: '',
  created_at: '2026-01-03T10:00:00Z',
  updated_at: '2026-01-03T10:00:00Z',
  created_by: 1,
  items: [
    {
      id: 1,
      invoice: 1,
      description: 'General Consultation',
      quantity: 1,
      unit_price: '500.00',
      discount_percentage: '0.00',
      line_total: '500.00',
      service: 1,
      service_name: 'General Consultation',
      is_covered_by_insurance: false,
      created_at: '2026-01-03T10:00:00Z',
      updated_at: '2026-01-03T10:00:00Z',
    },
    {
      id: 2,
      invoice: 1,
      description: 'Complete Blood Count',
      quantity: 1,
      unit_price: '1000.00',
      discount_percentage: '0.00',
      line_total: '1000.00',
      service: 2,
      service_name: 'Complete Blood Count',
      is_covered_by_insurance: false,
      created_at: '2026-01-03T10:00:00Z',
      updated_at: '2026-01-03T10:00:00Z',
    },
  ],
};

const mockPayment = {
  id: 1,
  payment_reference: 'PAY-20260103-0001',
  invoice: 1,
  invoice_number: 'INV-20260103-0001',
  patient_name: 'Jane Doe',
  amount: '500.00',
  method: 'CASH' as const,
  status: 'COMPLETED' as const,
  notes: '',
  created_at: '2026-01-03T10:30:00Z',
  updated_at: '2026-01-03T10:30:00Z',
  created_by: 1,
  processed_at: '2026-01-03T10:30:00Z',
};

const mockReceipt = {
  id: 1,
  receipt_number: 'RCP-20260103-0001',
  payment: 1,
  payment_reference: 'PAY-20260103-0001',
  patient_name: 'Jane Doe',
  patient_mrn: 'MRN-20260101-0001',
  facility_name: 'Demo Health Facility',
  facility_address: '123 Health Street, Nairobi',
  facility_phone: '+254712345678',
  amount: '500.00',
  amount_in_words: 'Five Hundred Kenya Shillings Only',
  payment_method: 'CASH' as const,
  receipt_date: '2026-01-03T10:30:00Z',
  is_voided: false,
  created_at: '2026-01-03T10:30:00Z',
  created_by: 1,
};

const mockServices = [
  { id: 1, code: 'CONS-001', name: 'General Consultation', unit_price: '500.00', category: 1, category_name: 'Consultation' },
  { id: 2, code: 'LAB-001', name: 'Complete Blood Count', unit_price: '1000.00', category: 2, category_name: 'Laboratory' },
];

// ============================================================================
// InvoiceList Component Tests
// ============================================================================

describe('InvoiceList', () => {
  const mockOnSelect = jest.fn();
  const mockOnCreateNew = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render invoice list with data', () => {
    render(
      <InvoiceList
        invoices={[mockInvoice]}
        isLoading={false}
        onSelect={mockOnSelect}
        onCreateNew={mockOnCreateNew}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('INV-20260103-0001')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('KES 1,500.00')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();
  });

  it('should show loading state', () => {
    render(
      <InvoiceList
        invoices={[]}
        isLoading={true}
        onSelect={mockOnSelect}
        onCreateNew={mockOnCreateNew}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('should show empty state when no invoices', () => {
    render(
      <InvoiceList
        invoices={[]}
        isLoading={false}
        onSelect={mockOnSelect}
        onCreateNew={mockOnCreateNew}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText(/no invoices found/i)).toBeInTheDocument();
  });

  it('should call onSelect when invoice row is clicked', async () => {
    render(
      <InvoiceList
        invoices={[mockInvoice]}
        isLoading={false}
        onSelect={mockOnSelect}
        onCreateNew={mockOnCreateNew}
      />,
      { wrapper: createWrapper() }
    );

    await userEvent.click(screen.getByText('INV-20260103-0001'));

    expect(mockOnSelect).toHaveBeenCalledWith(mockInvoice);
  });

  it('should call onCreateNew when create button is clicked', async () => {
    render(
      <InvoiceList
        invoices={[]}
        isLoading={false}
        onSelect={mockOnSelect}
        onCreateNew={mockOnCreateNew}
      />,
      { wrapper: createWrapper() }
    );

    await userEvent.click(screen.getByRole('button', { name: /create|new invoice/i }));

    expect(mockOnCreateNew).toHaveBeenCalled();
  });

  it('should filter invoices by status', async () => {
    const mockOnFilter = jest.fn();
    render(
      <InvoiceList
        invoices={[mockInvoice]}
        isLoading={false}
        onSelect={mockOnSelect}
        onCreateNew={mockOnCreateNew}
        onFilter={mockOnFilter}
      />,
      { wrapper: createWrapper() }
    );

    // Find and click status filter
    const statusFilter = screen.getByRole('combobox', { name: /status/i });
    await userEvent.click(statusFilter);
    await userEvent.click(screen.getByRole('option', { name: /pending/i }));

    expect(mockOnFilter).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING' }));
  });

  it('should show status badges with correct colors', () => {
    const invoices = [
      { ...mockInvoice, id: 1, status: 'DRAFT' as const },
      { ...mockInvoice, id: 2, invoice_number: 'INV-002', status: 'PENDING' as const },
      { ...mockInvoice, id: 3, invoice_number: 'INV-003', status: 'PAID' as const },
      { ...mockInvoice, id: 4, invoice_number: 'INV-004', status: 'OVERDUE' as const },
    ];

    render(
      <InvoiceList
        invoices={invoices}
        isLoading={false}
        onSelect={mockOnSelect}
        onCreateNew={mockOnCreateNew}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('DRAFT')).toHaveClass(/gray|slate/);
    expect(screen.getByText('PENDING')).toHaveClass(/yellow|amber/);
    expect(screen.getByText('PAID')).toHaveClass(/green/);
    expect(screen.getByText('OVERDUE')).toHaveClass(/red/);
  });
});

// ============================================================================
// InvoiceDetail Component Tests - KE-CSH-002
// ============================================================================

describe('InvoiceDetail', () => {
  const mockOnPay = jest.fn();
  const mockOnCancel = jest.fn();
  const mockOnAddItem = jest.fn();
  const mockOnRemoveItem = jest.fn();
  const mockOnApplyDiscount = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render invoice header information', () => {
    render(
      <InvoiceDetail
        invoice={mockInvoice}
        onPay={mockOnPay}
        onCancel={mockOnCancel}
        onAddItem={mockOnAddItem}
        onRemoveItem={mockOnRemoveItem}
        onApplyDiscount={mockOnApplyDiscount}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('INV-20260103-0001')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('MRN-20260101-0001')).toBeInTheDocument();
  });

  it('should render itemized breakdown', () => {
    render(
      <InvoiceDetail
        invoice={mockInvoice}
        onPay={mockOnPay}
        onCancel={mockOnCancel}
        onAddItem={mockOnAddItem}
        onRemoveItem={mockOnRemoveItem}
        onApplyDiscount={mockOnApplyDiscount}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('General Consultation')).toBeInTheDocument();
    expect(screen.getByText('Complete Blood Count')).toBeInTheDocument();
    expect(screen.getByText('KES 500.00')).toBeInTheDocument();
    expect(screen.getByText('KES 1,000.00')).toBeInTheDocument();
  });

  it('should show totals section', () => {
    render(
      <InvoiceDetail
        invoice={mockInvoice}
        onPay={mockOnPay}
        onCancel={mockOnCancel}
        onAddItem={mockOnAddItem}
        onRemoveItem={mockOnRemoveItem}
        onApplyDiscount={mockOnApplyDiscount}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText(/subtotal/i)).toBeInTheDocument();
    expect(screen.getByText(/total/i)).toBeInTheDocument();
    expect(screen.getByText('KES 1,500.00')).toBeInTheDocument();
  });

  it('should show pay button for pending invoices', () => {
    render(
      <InvoiceDetail
        invoice={mockInvoice}
        onPay={mockOnPay}
        onCancel={mockOnCancel}
        onAddItem={mockOnAddItem}
        onRemoveItem={mockOnRemoveItem}
        onApplyDiscount={mockOnApplyDiscount}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByRole('button', { name: /pay|record payment/i })).toBeInTheDocument();
  });

  it('should hide pay button for paid invoices', () => {
    const paidInvoice = { ...mockInvoice, status: 'PAID' as const, balance_due: '0.00' };

    render(
      <InvoiceDetail
        invoice={paidInvoice}
        onPay={mockOnPay}
        onCancel={mockOnCancel}
        onAddItem={mockOnAddItem}
        onRemoveItem={mockOnRemoveItem}
        onApplyDiscount={mockOnApplyDiscount}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.queryByRole('button', { name: /pay|record payment/i })).not.toBeInTheDocument();
  });

  it('should call onPay when pay button is clicked', async () => {
    render(
      <InvoiceDetail
        invoice={mockInvoice}
        onPay={mockOnPay}
        onCancel={mockOnCancel}
        onAddItem={mockOnAddItem}
        onRemoveItem={mockOnRemoveItem}
        onApplyDiscount={mockOnApplyDiscount}
      />,
      { wrapper: createWrapper() }
    );

    await userEvent.click(screen.getByRole('button', { name: /pay|record payment/i }));

    expect(mockOnPay).toHaveBeenCalledWith(mockInvoice);
  });

  it('should show discount information when applied', () => {
    const discountedInvoice = {
      ...mockInvoice,
      discount_type: 'PERCENTAGE' as const,
      discount_value: '10.00',
      discount_amount: '150.00',
      total_amount: '1350.00',
      balance_due: '1350.00',
    };

    render(
      <InvoiceDetail
        invoice={discountedInvoice}
        onPay={mockOnPay}
        onCancel={mockOnCancel}
        onAddItem={mockOnAddItem}
        onRemoveItem={mockOnRemoveItem}
        onApplyDiscount={mockOnApplyDiscount}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText(/discount/i)).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.getByText('-KES 150.00')).toBeInTheDocument();
  });

  it('should allow printing invoice', async () => {
    const mockPrint = jest.fn();
    window.print = mockPrint;

    render(
      <InvoiceDetail
        invoice={mockInvoice}
        onPay={mockOnPay}
        onCancel={mockOnCancel}
        onAddItem={mockOnAddItem}
        onRemoveItem={mockOnRemoveItem}
        onApplyDiscount={mockOnApplyDiscount}
      />,
      { wrapper: createWrapper() }
    );

    await userEvent.click(screen.getByRole('button', { name: /print/i }));

    expect(mockPrint).toHaveBeenCalled();
  });
});

// ============================================================================
// PaymentForm Component Tests - KE-CSH-001
// ============================================================================

describe('PaymentForm', () => {
  const mockOnSubmit = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render payment method options', () => {
    render(
      <PaymentForm
        invoice={mockInvoice}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByRole('radio', { name: /cash/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /m-pesa/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /card/i })).toBeInTheDocument();
  });

  it('should pre-fill amount with balance due', () => {
    render(
      <PaymentForm
        invoice={mockInvoice}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
      { wrapper: createWrapper() }
    );

    const amountInput = screen.getByLabelText(/amount/i);
    expect(amountInput).toHaveValue(1500);
  });

  it('should validate amount does not exceed balance', async () => {
    render(
      <PaymentForm
        invoice={mockInvoice}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
      { wrapper: createWrapper() }
    );

    const amountInput = screen.getByLabelText(/amount/i);
    await userEvent.clear(amountInput);
    await userEvent.type(amountInput, '2000');

    await userEvent.click(screen.getByRole('button', { name: /submit|pay/i }));

    expect(screen.getByText(/amount cannot exceed balance/i)).toBeInTheDocument();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('should show change calculation for cash payments', async () => {
    render(
      <PaymentForm
        invoice={{ ...mockInvoice, balance_due: '450.00' }}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
      { wrapper: createWrapper() }
    );

    // Select cash payment
    await userEvent.click(screen.getByRole('radio', { name: /cash/i }));

    // Enter amount tendered
    const tenderedInput = screen.getByLabelText(/amount tendered|received/i);
    await userEvent.clear(tenderedInput);
    await userEvent.type(tenderedInput, '500');

    // Check change displayed
    expect(screen.getByText(/change/i)).toBeInTheDocument();
    expect(screen.getByText('KES 50.00')).toBeInTheDocument();
  });

  it('should show phone number field for M-Pesa', async () => {
    render(
      <PaymentForm
        invoice={mockInvoice}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
      { wrapper: createWrapper() }
    );

    await userEvent.click(screen.getByRole('radio', { name: /m-pesa/i }));

    expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
  });

  it('should validate Kenyan phone number format', async () => {
    render(
      <PaymentForm
        invoice={mockInvoice}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
      { wrapper: createWrapper() }
    );

    await userEvent.click(screen.getByRole('radio', { name: /m-pesa/i }));

    const phoneInput = screen.getByLabelText(/phone number/i);
    await userEvent.type(phoneInput, '123456');

    await userEvent.click(screen.getByRole('button', { name: /submit|pay/i }));

    expect(screen.getByText(/valid kenyan phone number/i)).toBeInTheDocument();
  });

  it('should accept valid Kenyan phone formats', async () => {
    render(
      <PaymentForm
        invoice={mockInvoice}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
      { wrapper: createWrapper() }
    );

    await userEvent.click(screen.getByRole('radio', { name: /m-pesa/i }));

    const phoneInput = screen.getByLabelText(/phone number/i);
    await userEvent.type(phoneInput, '0712345678');

    await userEvent.click(screen.getByRole('button', { name: /submit|pay/i }));

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'MPESA',
        mpesa_phone_number: '0712345678',
      })
    );
  });

  it('should show card details fields for card payment', async () => {
    render(
      <PaymentForm
        invoice={mockInvoice}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
      { wrapper: createWrapper() }
    );

    await userEvent.click(screen.getByRole('radio', { name: /card/i }));

    expect(screen.getByLabelText(/last 4 digits/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/card type/i)).toBeInTheDocument();
  });

  it('should submit cash payment correctly', async () => {
    render(
      <PaymentForm
        invoice={mockInvoice}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
      { wrapper: createWrapper() }
    );

    await userEvent.click(screen.getByRole('radio', { name: /cash/i }));
    await userEvent.click(screen.getByRole('button', { name: /submit|pay/i }));

    expect(mockOnSubmit).toHaveBeenCalledWith({
      invoice: 1,
      amount: '1500.00',
      method: 'CASH',
    });
  });
});

// ============================================================================
// MpesaPaymentDialog Component Tests
// ============================================================================

describe('MpesaPaymentDialog', () => {
  const mockOnSuccess = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show STK push initiation state', () => {
    render(
      <MpesaPaymentDialog
        isOpen={true}
        invoice={mockInvoice}
        phoneNumber="0712345678"
        amount="500.00"
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
        status="initiating"
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText(/initiating/i)).toBeInTheDocument();
    expect(screen.getByText(/please wait/i)).toBeInTheDocument();
  });

  it('should show waiting for confirmation state', () => {
    render(
      <MpesaPaymentDialog
        isOpen={true}
        invoice={mockInvoice}
        phoneNumber="0712345678"
        amount="500.00"
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
        status="waiting"
        checkoutRequestId="ws_CO_123456789"
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText(/enter your M-Pesa PIN/i)).toBeInTheDocument();
    expect(screen.getByText(/0712345678/)).toBeInTheDocument();
  });

  it('should show success state with receipt number', () => {
    render(
      <MpesaPaymentDialog
        isOpen={true}
        invoice={mockInvoice}
        phoneNumber="0712345678"
        amount="500.00"
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
        status="success"
        mpesaReceiptNumber="QJH3XXXXXX"
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText(/payment successful/i)).toBeInTheDocument();
    expect(screen.getByText('QJH3XXXXXX')).toBeInTheDocument();
  });

  it('should show failure state with error message', () => {
    render(
      <MpesaPaymentDialog
        isOpen={true}
        invoice={mockInvoice}
        phoneNumber="0712345678"
        amount="500.00"
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
        status="failed"
        errorMessage="Request cancelled by user"
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText(/payment failed/i)).toBeInTheDocument();
    expect(screen.getByText(/request cancelled/i)).toBeInTheDocument();
  });

  it('should allow retry after failure', async () => {
    const mockOnRetry = jest.fn();

    render(
      <MpesaPaymentDialog
        isOpen={true}
        invoice={mockInvoice}
        phoneNumber="0712345678"
        amount="500.00"
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
        onRetry={mockOnRetry}
        status="failed"
        errorMessage="Timeout"
      />,
      { wrapper: createWrapper() }
    );

    await userEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(mockOnRetry).toHaveBeenCalled();
  });

  it('should show countdown timer while waiting', () => {
    render(
      <MpesaPaymentDialog
        isOpen={true}
        invoice={mockInvoice}
        phoneNumber="0712345678"
        amount="500.00"
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
        status="waiting"
        timeoutSeconds={60}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText(/60/)).toBeInTheDocument();
  });
});

// ============================================================================
// ReceiptView Component Tests
// ============================================================================

describe('ReceiptView', () => {
  const mockOnPrint = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render receipt details', () => {
    render(
      <ReceiptView
        receipt={mockReceipt}
        onPrint={mockOnPrint}
        onClose={mockOnClose}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('RCP-20260103-0001')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('KES 500.00')).toBeInTheDocument();
    expect(screen.getByText('Five Hundred Kenya Shillings Only')).toBeInTheDocument();
  });

  it('should show facility information', () => {
    render(
      <ReceiptView
        receipt={mockReceipt}
        onPrint={mockOnPrint}
        onClose={mockOnClose}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Demo Health Facility')).toBeInTheDocument();
    expect(screen.getByText('123 Health Street, Nairobi')).toBeInTheDocument();
  });

  it('should show payment method', () => {
    render(
      <ReceiptView
        receipt={mockReceipt}
        onPrint={mockOnPrint}
        onClose={mockOnClose}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText(/cash/i)).toBeInTheDocument();
  });

  it('should call onPrint when print button clicked', async () => {
    render(
      <ReceiptView
        receipt={mockReceipt}
        onPrint={mockOnPrint}
        onClose={mockOnClose}
      />,
      { wrapper: createWrapper() }
    );

    await userEvent.click(screen.getByRole('button', { name: /print/i }));

    expect(mockOnPrint).toHaveBeenCalled();
  });

  it('should show voided status for voided receipts', () => {
    const voidedReceipt = {
      ...mockReceipt,
      is_voided: true,
      void_reason: 'Duplicate entry',
    };

    render(
      <ReceiptView
        receipt={voidedReceipt}
        onPrint={mockOnPrint}
        onClose={mockOnClose}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText(/voided/i)).toBeInTheDocument();
    expect(screen.getByText(/duplicate entry/i)).toBeInTheDocument();
  });
});

// ============================================================================
// ServiceSelector Component Tests
// ============================================================================

describe('ServiceSelector', () => {
  const mockOnSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render service categories', () => {
    render(
      <ServiceSelector
        services={mockServices as any}
        categories={[
          { id: 1, name: 'Consultation', code: 'CONS', description: '', display_order: 1, is_active: true, created_at: '', updated_at: '' },
          { id: 2, name: 'Laboratory', code: 'LAB', description: '', display_order: 2, is_active: true, created_at: '', updated_at: '' },
        ]}
        onSelect={mockOnSelect}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Consultation')).toBeInTheDocument();
    expect(screen.getByText('Laboratory')).toBeInTheDocument();
  });

  it('should filter services by category', async () => {
    render(
      <ServiceSelector
        services={mockServices as any}
        categories={[
          { id: 1, name: 'Consultation', code: 'CONS', description: '', display_order: 1, is_active: true, created_at: '', updated_at: '' },
          { id: 2, name: 'Laboratory', code: 'LAB', description: '', display_order: 2, is_active: true, created_at: '', updated_at: '' },
        ]}
        onSelect={mockOnSelect}
      />,
      { wrapper: createWrapper() }
    );

    await userEvent.click(screen.getByText('Laboratory'));

    expect(screen.getByText('Complete Blood Count')).toBeInTheDocument();
    expect(screen.queryByText('General Consultation')).not.toBeInTheDocument();
  });

  it('should search services by name', async () => {
    render(
      <ServiceSelector
        services={mockServices as any}
        categories={[]}
        onSelect={mockOnSelect}
      />,
      { wrapper: createWrapper() }
    );

    const searchInput = screen.getByPlaceholderText(/search/i);
    await userEvent.type(searchInput, 'blood');

    expect(screen.getByText('Complete Blood Count')).toBeInTheDocument();
    expect(screen.queryByText('General Consultation')).not.toBeInTheDocument();
  });

  it('should call onSelect with service details', async () => {
    render(
      <ServiceSelector
        services={mockServices as any}
        categories={[]}
        onSelect={mockOnSelect}
      />,
      { wrapper: createWrapper() }
    );

    await userEvent.click(screen.getByText('General Consultation'));

    expect(mockOnSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        name: 'General Consultation',
        unit_price: '500.00',
      })
    );
  });
});

// ============================================================================
// CreditNoteForm Component Tests
// ============================================================================

describe('CreditNoteForm', () => {
  const mockOnSubmit = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render reason options', () => {
    render(
      <CreditNoteForm
        invoice={mockInvoice}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByRole('option', { name: /overcharge/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /service not rendered/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /duplicate billing/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /other/i })).toBeInTheDocument();
  });

  it('should require reason detail', async () => {
    render(
      <CreditNoteForm
        invoice={mockInvoice}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
      { wrapper: createWrapper() }
    );

    await userEvent.type(screen.getByLabelText(/amount/i), '100');
    await userEvent.selectOptions(screen.getByLabelText(/reason/i), 'OVERCHARGE');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(screen.getByText(/reason detail is required/i)).toBeInTheDocument();
  });

  it('should validate amount does not exceed invoice total', async () => {
    render(
      <CreditNoteForm
        invoice={mockInvoice}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
      { wrapper: createWrapper() }
    );

    await userEvent.type(screen.getByLabelText(/amount/i), '2000');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(screen.getByText(/cannot exceed invoice total/i)).toBeInTheDocument();
  });

  it('should submit credit note request', async () => {
    render(
      <CreditNoteForm
        invoice={mockInvoice}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
      { wrapper: createWrapper() }
    );

    await userEvent.type(screen.getByLabelText(/amount/i), '100');
    await userEvent.selectOptions(screen.getByLabelText(/reason/i), 'OVERCHARGE');
    await userEvent.type(screen.getByLabelText(/reason detail/i), 'Incorrect fee applied');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(mockOnSubmit).toHaveBeenCalledWith({
      invoice: 1,
      amount: '100.00',
      reason: 'OVERCHARGE',
      reason_detail: 'Incorrect fee applied',
    });
  });
});

// ============================================================================
// BillingDashboard Component Tests - KE-CLM-003
// ============================================================================

describe('BillingDashboard', () => {
  const mockDailyReport = {
    date: '2026-01-03',
    total_collected: '15000.00',
    invoice_count: 10,
    by_payment_method: {
      CASH: '8000.00',
      MPESA: '5000.00',
      CARD: '2000.00',
      INSURANCE: '0.00',
      BANK_TRANSFER: '0.00',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show daily collection summary', () => {
    render(
      <BillingDashboard
        dailyReport={mockDailyReport}
        isLoading={false}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText(/today's collection/i)).toBeInTheDocument();
    expect(screen.getByText('KES 15,000.00')).toBeInTheDocument();
    expect(screen.getByText('10 invoices')).toBeInTheDocument();
  });

  it('should show payment method breakdown', () => {
    render(
      <BillingDashboard
        dailyReport={mockDailyReport}
        isLoading={false}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText(/cash/i)).toBeInTheDocument();
    expect(screen.getByText('KES 8,000.00')).toBeInTheDocument();
    expect(screen.getByText(/m-pesa/i)).toBeInTheDocument();
    expect(screen.getByText('KES 5,000.00')).toBeInTheDocument();
  });

  it('should show pending invoices count', () => {
    render(
      <BillingDashboard
        dailyReport={mockDailyReport}
        pendingInvoicesCount={5}
        overdueInvoicesCount={2}
        isLoading={false}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText(/pending/i)).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('should show loading state', () => {
    render(
      <BillingDashboard
        dailyReport={null}
        isLoading={true}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('should allow date selection for report', async () => {
    const mockOnDateChange = jest.fn();

    render(
      <BillingDashboard
        dailyReport={mockDailyReport}
        isLoading={false}
        onDateChange={mockOnDateChange}
      />,
      { wrapper: createWrapper() }
    );

    const datePicker = screen.getByLabelText(/date/i);
    await userEvent.clear(datePicker);
    await userEvent.type(datePicker, '2026-01-02');

    expect(mockOnDateChange).toHaveBeenCalledWith('2026-01-02');
  });
});

// ============================================================================
// PaymentList Component Tests
// ============================================================================

describe('PaymentList', () => {
  const mockOnViewReceipt = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render payment list', () => {
    render(
      <PaymentList
        payments={[mockPayment]}
        isLoading={false}
        onViewReceipt={mockOnViewReceipt}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('PAY-20260103-0001')).toBeInTheDocument();
    expect(screen.getByText('KES 500.00')).toBeInTheDocument();
    expect(screen.getByText('CASH')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
  });

  it('should show receipt button for completed payments', () => {
    render(
      <PaymentList
        payments={[mockPayment]}
        isLoading={false}
        onViewReceipt={mockOnViewReceipt}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByRole('button', { name: /receipt/i })).toBeInTheDocument();
  });

  it('should call onViewReceipt when receipt button clicked', async () => {
    render(
      <PaymentList
        payments={[mockPayment]}
        isLoading={false}
        onViewReceipt={mockOnViewReceipt}
      />,
      { wrapper: createWrapper() }
    );

    await userEvent.click(screen.getByRole('button', { name: /receipt/i }));

    expect(mockOnViewReceipt).toHaveBeenCalledWith(mockPayment);
  });

  it('should filter by payment method', async () => {
    const mockOnFilter = jest.fn();

    render(
      <PaymentList
        payments={[mockPayment]}
        isLoading={false}
        onViewReceipt={mockOnViewReceipt}
        onFilter={mockOnFilter}
      />,
      { wrapper: createWrapper() }
    );

    const methodFilter = screen.getByRole('combobox', { name: /method/i });
    await userEvent.click(methodFilter);
    await userEvent.click(screen.getByRole('option', { name: /m-pesa/i }));

    expect(mockOnFilter).toHaveBeenCalledWith(expect.objectContaining({ method: 'MPESA' }));
  });
});
