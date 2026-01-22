/**
 * Print Invoice Utility
 * Opens a clean popup window with a formatted invoice for printing
 * Uses the template from /templates/invoice.html
 */

import type { Invoice, InvoiceItem } from '@/lib/types/billing';

interface PrintInvoiceOptions {
  invoice: Invoice;
  facilityName?: string;
  facilityAddress?: string;
  facilityPhone?: string;
  facilityLicense?: string;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `KES ${num.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getStatusColor(status: string): { bg: string; color: string } {
  const colors: Record<string, { bg: string; color: string }> = {
    DRAFT: { bg: '#f1f5f9', color: '#475569' },
    PENDING: { bg: '#fef3c7', color: '#92400e' },
    PARTIAL: { bg: '#dbeafe', color: '#1e40af' },
    PAID: { bg: '#dcfce7', color: '#166534' },
    OVERDUE: { bg: '#fee2e2', color: '#991b1b' },
    CANCELLED: { bg: '#f3f4f6', color: '#6b7280' },
    PROFORMA: { bg: '#f3e8ff', color: '#7c3aed' },
  };
  return colors[status] || { bg: '#f3f4f6', color: '#6b7280' };
}

/**
 * Open a new window with the invoice template and trigger print
 */
export function printInvoice({
  invoice,
  facilityName = 'Vitora Health Facility',
  facilityAddress = '123 Health Street, Nairobi',
  facilityPhone = '+254 700 123 456',
  facilityLicense = 'MED-2024-001',
}: PrintInvoiceOptions): void {
  const displayFacilityName = facilityName;
  const displayFacilityAddress = facilityAddress;
  const displayFacilityPhone = facilityPhone;
  
  const statusColor = getStatusColor(invoice.status);
  
  // Build line items HTML
  const items = invoice.items || [];
  const lineItemsHtml = items.length > 0
    ? items.map((item: InvoiceItem) => `
        <tr>
          <td>${escapeHtml(item.description || item.service_name || 'Service')}</td>
          <td>${item.quantity}</td>
          <td>${formatCurrency(item.unit_price)}</td>
          <td>${formatCurrency(parseFloat(item.unit_price) * item.quantity)}</td>
        </tr>
      `).join('\n')
    : `<tr><td colspan="4" style="text-align: center; color: #666;">No line items</td></tr>`;

  const subtotal = parseFloat(invoice.subtotal || invoice.total_amount);
  const discount = parseFloat(invoice.discount_amount || '0');
  const total = parseFloat(invoice.total_amount);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Invoice - ${escapeHtml(invoice.invoice_number)}</title>
  <style>
    @page {
      size: A4;
      margin: 20mm;
    }

    body {
      font-family: "Inter", Arial, sans-serif;
      background: #f4f6f8;
      margin: 0;
      padding: 0;
      color: #111;
    }

    .invoice {
      width: 190mm;
      margin: auto;
      background: #ffffff;
      padding: 20mm;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .facility h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }

    .facility p {
      margin: 4px 0;
      font-size: 13px;
      color: #555;
    }

    .doc-meta {
      text-align: right;
      font-size: 13px;
    }

    .doc-meta .title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .status {
      display: inline-block;
      margin-top: 6px;
      padding: 4px 12px;
      font-size: 12px;
      border-radius: 12px;
      background: ${statusColor.bg};
      color: ${statusColor.color};
      font-weight: 600;
    }

    .divider {
      border-top: 1px solid #e5e7eb;
      margin: 24px 0;
    }

    .parties {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      font-size: 14px;
    }

    .party h3 {
      margin: 0 0 8px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #555;
    }

    .party p {
      margin: 4px 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 28px;
      font-size: 14px;
    }

    table thead th {
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
      color: #555;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 10px;
    }

    table tbody td {
      padding: 12px 0;
      border-bottom: 1px solid #f0f0f0;
    }

    table td:last-child,
    table th:last-child {
      text-align: right;
    }

    .summary {
      display: flex;
      justify-content: flex-end;
      margin-top: 24px;
    }

    .totals {
      width: 80mm;
      font-size: 14px;
    }

    .totals div {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .totals .grand {
      font-size: 18px;
      font-weight: 700;
      border-top: 2px solid #111;
      padding-top: 12px;
      margin-top: 12px;
    }

    .footer {
      margin-top: 40px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: 12px;
      color: #555;
    }

    .barcode-placeholder {
      width: 45mm;
      height: 18mm;
      border: 1px dashed #aaa;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      color: #666;
    }

    @media screen {
      body {
        padding: 32px;
      }
    }

    @media print {
      body {
        background: none;
        padding: 0;
      }
    }
  </style>
</head>
<body>

<div class="invoice">
  <!-- HEADER -->
  <div class="header">
    <div class="facility">
      <h1>${escapeHtml(displayFacilityName)}</h1>
      <p>${escapeHtml(displayFacilityAddress)}</p>
      <p>Tel: ${escapeHtml(displayFacilityPhone)}</p>
      <p>License No: ${escapeHtml(facilityLicense)}</p>
    </div>

    <div class="doc-meta">
      <div class="title">INVOICE</div>
      <div>No: ${escapeHtml(invoice.invoice_number)}</div>
      <div>Issued: ${formatDate(invoice.invoice_date)}</div>
      <div>Due: ${formatDate(invoice.due_date)}</div>
      <div class="status">${escapeHtml(invoice.status)}</div>
    </div>
  </div>

  <div class="divider"></div>

  <!-- BILLING PARTIES -->
  <div class="parties">
    <div class="party">
      <h3>Bill To (Patient)</h3>
      <p><strong>${escapeHtml(invoice.patient_name || 'N/A')}</strong></p>
      <p>MRN: ${escapeHtml(invoice.patient_mrn || 'N/A')}</p>
    </div>

    <div class="party">
      <h3>Payment Summary</h3>
      <p>Total: ${formatCurrency(total)}</p>
      <p>Paid: ${formatCurrency(invoice.amount_paid || '0')}</p>
      <p><strong>Balance: ${formatCurrency(invoice.balance_due || (total - parseFloat(invoice.amount_paid || '0')))}</strong></p>
    </div>
  </div>

  <!-- LINE ITEMS -->
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Qty</th>
        <th>Unit Price</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>
      ${lineItemsHtml}
    </tbody>
  </table>

  <!-- TOTALS -->
  <div class="summary">
    <div class="totals">
      <div><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
      ${discount > 0 ? `<div><span>Discount</span><span>-${formatCurrency(discount)}</span></div>` : ''}
      <div class="grand">
        <span>Total</span><span>${formatCurrency(total)}</span>
      </div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <div>
      <p>
        This invoice constitutes a formal request for payment and may be
        submitted to an insurer for reimbursement or claim processing.
      </p>
      <p>Generated by Vitora HMIS</p>
    </div>

    <div class="barcode-placeholder">
      ${escapeHtml(invoice.invoice_number)}
    </div>
  </div>
</div>

<script>
  window.onload = function() {
    setTimeout(function() {
      window.print();
    }, 100);
  };
  
  window.onafterprint = function() {
    window.close();
  };
</script>
</body>
</html>`;

  // Open a new window (let browser determine size)
  const printWindow = window.open('', 'printInvoice');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
