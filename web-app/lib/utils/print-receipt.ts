/**
 * Print Receipt Utility
 * Opens a clean popup window with a formatted receipt for printing
 * Uses the template from /templates/receipt.html
 */

import type { Receipt } from '@/lib/types/billing';

interface PrintReceiptOptions {
  receipt: Receipt;
  facilityName?: string;
  facilityAddress?: string;
  facilityPhone?: string;
  lineItems?: Array<{ description: string; amount: string }>;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(amount: number): string {
  return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Open a new window with the receipt template and trigger print
 */
export function printReceipt({
  receipt,
  facilityName = 'Vitora Health Facility',
  facilityAddress = '123 Health Street, Nairobi',
  facilityPhone = '+254 700 123 456',
  lineItems,
}: PrintReceiptOptions): void {
  const displayFacilityName = receipt.facility_name || facilityName;
  const displayFacilityAddress = receipt.facility_address || facilityAddress;
  const displayFacilityPhone = receipt.facility_phone || facilityPhone;
  
  const amount = parseFloat(receipt.amount);
  const amountPaid = formatCurrency(amount);
  
  // Build line items HTML
  const items = lineItems || [{ description: 'Payment', amount: amountPaid }];
  const lineItemsHtml = items
    .map(item => `<tr><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.amount)}</td></tr>`)
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Payment Receipt - ${escapeHtml(receipt.receipt_number)}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      background: #f5f5f5;
      margin: 0;
      padding: 24px;
    }

    .receipt {
      max-width: 380px;
      margin: auto;
      background: #ffffff;
      padding: 20px;
      border: 1px solid #ddd;
    }

    .header {
      text-align: center;
      margin-bottom: 16px;
    }

    .header h1 {
      margin: 0;
      font-size: 18px;
      letter-spacing: 1px;
    }

    .header p {
      margin: 4px 0;
      font-size: 12px;
      color: #555;
    }

    .divider {
      border-top: 1px dashed #aaa;
      margin: 12px 0;
    }

    .meta,
    .totals {
      font-size: 13px;
    }

    .meta div,
    .totals div {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      margin-top: 10px;
    }

    table th,
    table td {
      padding: 6px 0;
      text-align: left;
    }

    table th {
      border-bottom: 1px solid #ccc;
    }

    table td:last-child,
    table th:last-child {
      text-align: right;
    }

    .totals {
      margin-top: 10px;
      font-weight: bold;
    }

    .footer {
      margin-top: 16px;
      text-align: center;
      font-size: 11px;
      color: #555;
    }

    .barcode {
      margin-top: 14px;
      text-align: center;
    }

    .barcode-placeholder {
      display: inline-block;
      width: 180px;
      height: 60px;
      border: 1px dashed #999;
      font-size: 10px;
      line-height: 60px;
      color: #777;
    }

    @media print {
      body {
        background: none;
        padding: 0;
      }

      .receipt {
        border: none;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>

  <div class="receipt">
    <!-- HEADER -->
    <div class="header">
      <h1>${escapeHtml(displayFacilityName)}</h1>
      <p>${escapeHtml(displayFacilityAddress)}</p>
      <p>Tel: ${escapeHtml(displayFacilityPhone)}</p>
      <p><strong>PAYMENT RECEIPT</strong></p>
    </div>

    <div class="divider"></div>

    <!-- METADATA -->
    <div class="meta">
      <div><span>Receipt No:</span><span>${escapeHtml(receipt.receipt_number)}</span></div>
      <div><span>Date:</span><span>${formatDate(receipt.receipt_date)}</span></div>
      ${receipt.payment_reference ? `<div><span>Invoice Ref:</span><span>${escapeHtml(receipt.payment_reference)}</span></div>` : ''}
      <div><span>Patient:</span><span>${escapeHtml(receipt.patient_name)}</span></div>
      ${receipt.patient_mrn ? `<div><span>MRN:</span><span>${escapeHtml(receipt.patient_mrn)}</span></div>` : ''}
      <div><span>Payment Method:</span><span>${escapeHtml(receipt.payment_method.replace(/_/g, ' '))}</span></div>
      ${receipt.received_by_username || receipt.issued_by_username ? `<div><span>Served By:</span><span>${escapeHtml(receipt.received_by_username || receipt.issued_by_username || '')}</span></div>` : ''}
      ${receipt.payment_point_name || receipt.payment_point_code ? `<div><span>Till/Point:</span><span>${escapeHtml(receipt.payment_point_name || receipt.payment_point_code || '')}</span></div>` : ''}
    </div>

    <div class="divider"></div>

    <!-- LINE ITEMS -->
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHtml}
      </tbody>
    </table>

    <!-- TOTALS -->
    <div class="divider"></div>

    <div class="totals">
      <div><span>Total Paid:</span><span>${amountPaid}</span></div>
    </div>

    <!-- BARCODE / QR PLACEHOLDER -->
    <div class="barcode">
      <div class="barcode-placeholder">
        BARCODE / QR CODE
      </div>
    </div>

    <!-- FOOTER -->
    <div class="footer">
      <p>
        This receipt acknowledges payment only and does not replace
        a valid invoice or insurance claim document.
      </p>
      <p>Thank you for your visit.</p>
      <p>Generated by Vitora HMIS</p>
    </div>
  </div>

  <script>
    window.onload = function() {
      // Small delay to ensure rendering is complete
      setTimeout(function() {
        window.print();
      }, 100);
    };
    
    // Close window after printing (or if cancelled)
    window.onafterprint = function() {
      window.close();
    };
  </script>
</body>
</html>`;

  // Open a new window (let browser determine size)
  const printWindow = window.open('', 'printReceipt');
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
