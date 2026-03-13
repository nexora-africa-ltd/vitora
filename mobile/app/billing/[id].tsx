import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { DataRow, EmptyState, HeroCard, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { billingApi } from '@/lib/api/billing';
import { useAppTheme } from '@/lib/theme/theme-context';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { InvoiceStatus } from '@/lib/types/billing';

function getInvoiceTone(status: InvoiceStatus): 'primary' | 'warning' | 'danger' | 'neutral' {
  if (status === 'paid') {
    return 'primary';
  }
  if (status === 'partial' || status === 'pending' || status === 'draft' || status === 'proforma') {
    return 'warning';
  }
  if (status === 'overdue' || status === 'cancelled' || status === 'written_off') {
    return 'danger';
  }
  return 'neutral';
}

export default function BillingDetailScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const params = useLocalSearchParams<{ id: string }>();
  const invoiceId = Number(params.id);

  const invoiceQuery = useQuery({
    queryKey: ['billing-invoice', invoiceId],
    queryFn: () => billingApi.getInvoice(invoiceId),
    enabled: Number.isFinite(invoiceId),
  });

  const paymentsQuery = useQuery({
    queryKey: ['billing-payments', invoiceId],
    queryFn: () => billingApi.listPayments({ invoice: invoiceId, page_size: 50 }),
    enabled: Number.isFinite(invoiceId),
  });

  if (invoiceQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading invoice details..." />
      </ScreenContainer>
    );
  }

  if (!invoiceQuery.data) {
    return (
      <ScreenContainer>
        <EmptyState title="Invoice not found" description="This invoice could not be loaded into the mobile billing viewer." />
      </ScreenContainer>
    );
  }

  const invoice = invoiceQuery.data;
  const payments = paymentsQuery.data?.results ?? [];

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="Invoice"
        title={invoice.invoice_number}
        description={`${invoice.patient_name} · ${invoice.patient_mrn} · ${formatDate(invoice.invoice_date)} · Viewer mode`}
      >
        <Pill label={invoice.status.replace(/_/g, ' ')} tone={getInvoiceTone(invoice.status)} />
      </HeroCard>

      <SectionCard title="Summary">
        <DataRow label="Payment type" value={invoice.payment_type} />
        <DataRow label="Invoice date" value={formatDate(invoice.invoice_date)} />
        <DataRow label="Due date" value={formatDate(invoice.due_date)} />
        <DataRow label="Total" value={formatCurrency(invoice.total_amount)} />
        <DataRow label="Amount paid" value={formatCurrency(invoice.amount_paid)} />
        <DataRow label="Balance due" value={formatCurrency(invoice.balance_due)} />
        <DataRow label="Insurance provider" value={invoice.insurance_provider} />
        <DataRow label="SHA claim number" value={invoice.sha_claim_number} />
      </SectionCard>

      <SectionCard title="Line items" subtitle={`${invoice.items.length} item${invoice.items.length === 1 ? '' : 's'} on this invoice.`}>
        {invoice.items.length === 0 ? (
          <EmptyState title="No line items" description="This invoice does not contain billable items yet." />
        ) : (
          invoice.items.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <Text style={styles.itemTitle}>{item.service_name || item.drug_name || item.lab_order_name || item.description}</Text>
              <Text style={styles.itemMeta}>Qty {item.quantity} · Unit {formatCurrency(item.unit_price)}</Text>
              <Text style={styles.itemMeta}>Line total {formatCurrency(item.line_total)}</Text>
              {item.sha_code ? <Text style={styles.itemTag}>SHA code {item.sha_code}</Text> : null}
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard title="Payments" subtitle="Synced payments posted against this invoice.">
        {payments.length === 0 ? (
          <EmptyState title="No payments recorded" description="Payments recorded in the shared billing workspace will appear here after sync." />
        ) : (
          payments.map((payment) => (
            <View key={payment.id} style={styles.itemCard}>
              <Text style={styles.itemTitle}>{payment.method}</Text>
              <Text style={styles.itemMeta}>{formatCurrency(payment.amount)} · {payment.status}</Text>
              <Text style={styles.itemMeta}>{formatDate(payment.payment_date)}</Text>
            </View>
          ))
        )}
      </SectionCard>
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    itemCard: {
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      gap: 4,
      padding: 12,
    },
    itemTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    itemMeta: {
      color: theme.colors.mutedText,
      fontSize: 13,
    },
    itemTag: {
      color: theme.colors.secondary,
      fontSize: 12,
      fontWeight: '700',
    },
  });
}