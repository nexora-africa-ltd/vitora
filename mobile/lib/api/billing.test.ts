import { billingApi } from './billing';
import { http, HttpResponse } from 'msw';

import { server } from '@/__tests__/msw/server';

const API_BASE_URL = 'http://127.0.0.1:9088';

describe('billingApi', () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it('unwraps invoice list payloads and coerces money fields', async () => {
    let requestedPatient = '';
    server.use(
      http.get(`${API_BASE_URL}/api/billing/invoices/`, ({ request }) => {
        requestedPatient = new URL(request.url).searchParams.get('patient') ?? '';
        return HttpResponse.json({
          count: 1,
          next: null,
          previous: null,
          results: [
            {
              id: 8,
              invoice_number: 'INV-20260313-0008',
              patient: 14,
              patient_name: 'Jane Doe',
              patient_mrn: 'MRN-20260311-0001',
              encounter: 55,
              invoice_date: '2026-03-13',
              due_date: null,
              status: 'partial',
              payment_type: 'cash',
              subtotal: '1500.00',
              discount_amount: '0.00',
              tax_amount: '0.00',
              total_amount: '1500.00',
              amount_paid: '500.00',
              balance: '1000.00',
              balance_due: '1000.00',
              created_at: '2026-03-13T08:00:00Z',
              updated_at: '2026-03-13T08:00:00Z',
              items: [],
            },
          ],
        });
      })
    );

    const response = await billingApi.listInvoices({ patient: 14 });

    expect(requestedPatient).toBe('14');
    expect(response.results[0]?.total_amount).toBe(1500);
    expect(response.results[0]?.balance_due).toBe(1000);
  });

  it('loads invoice detail and payment summaries', async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/billing/invoices/8/`, () =>
        HttpResponse.json({
          id: 8,
          invoice_number: 'INV-20260313-0008',
          patient: 14,
          patient_name: 'Jane Doe',
          patient_mrn: 'MRN-20260311-0001',
          encounter: 55,
          invoice_date: '2026-03-13',
          due_date: null,
          status: 'partial',
          payment_type: 'cash',
          subtotal: '1500.00',
          discount_amount: '0.00',
          tax_amount: '0.00',
          total_amount: '1500.00',
          amount_paid: '500.00',
          balance: '1000.00',
          balance_due: '1000.00',
          created_at: '2026-03-13T08:00:00Z',
          updated_at: '2026-03-13T08:00:00Z',
          items: [
            {
              id: 90,
              description: 'Consultation fee',
              quantity: 1,
              unit_price: '1500.00',
              discount_amount: '0.00',
              line_total: '1500.00',
              is_covered_by_insurance: false,
            },
          ],
        })
      ),
      http.get(`${API_BASE_URL}/api/billing/payments/`, () =>
        HttpResponse.json({
          count: 1,
          next: null,
          previous: null,
          results: [
            {
              id: 33,
              payment_reference: 'PAY-33',
              invoice: 8,
              invoice_number: 'INV-20260313-0008',
              method: 'cash',
              amount: '500.00',
              status: 'completed',
              payment_date: '2026-03-13',
            },
          ],
        })
      )
    );

    const invoice = await billingApi.getInvoice(8);
    const payments = await billingApi.listPayments({ invoice: 8 });

    expect(invoice.items[0]?.line_total).toBe(1500);
    expect(payments.results[0]?.amount).toBe(500);
  });
});
