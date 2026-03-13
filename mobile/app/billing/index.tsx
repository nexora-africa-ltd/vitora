import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, HeroCard, ListSkeleton, Pill, ScreenList, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { billingApi } from '@/lib/api/billing';
import { useRefreshQueries } from '@/lib/hooks/use-refresh-queries';
import { useAppTheme } from '@/lib/theme/theme-context';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { Invoice, InvoiceStatus } from '@/lib/types/billing';

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

export default function BillingScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const params = useLocalSearchParams<{ patientId?: string; encounterId?: string }>();
  const patientId = params.patientId ? Number(params.patientId) : undefined;
  const encounterId = params.encounterId ? Number(params.encounterId) : undefined;
  const refreshKeys = useMemo(() => [['billing-invoices']] as const, []);
  const { isRefreshing, refresh } = useRefreshQueries(refreshKeys);

  const invoicesQuery = useQuery({
    queryKey: ['billing-invoices', patientId ?? null, encounterId ?? null],
    queryFn: () => billingApi.listInvoices({ patient: patientId, encounter: encounterId, ordering: '-invoice_date', page_size: 50 }),
  });

  if (invoicesQuery.isLoading) {
    return <ListSkeleton itemCount={4} showHero />;
  }

  const invoices = invoicesQuery.data?.results ?? [];

  return (
    <ScreenList
      contentContainerStyle={styles.listContent}
      data={invoices}
      emptyDescription="There are no billing records for this filter yet."
      emptyTitle="No invoices found"
      estimatedItemHeight={108}
      header={
        <>
          <HeroCard
            eyebrow="Billing"
            title="Billing viewer"
            description={patientId ? 'Viewer scope for this patient\'s invoices and payments.' : encounterId ? 'Viewer scope for invoices linked to this encounter.' : 'Review invoice totals and synced payment status from the mobile billing viewer.'}
          />

          <SectionCard title="Viewer scope" subtitle={`${invoices.length} invoice${invoices.length === 1 ? '' : 's'} available in the mobile viewer.`}>
            <AppButton label="Back to patient list" variant="ghost" onPress={() => router.back()} />
          </SectionCard>

          <SectionCard title="Invoices" subtitle="Billing visibility only. Creation, edits, and payment posting stay in the shared billing workspace.">
            <Text style={styles.helperText}>Pull down to refresh payment status and balances.</Text>
          </SectionCard>
        </>
      }
      keyExtractor={(invoice: Invoice) => String(invoice.id)}
      onRefresh={() => void refresh()}
      refreshing={isRefreshing || invoicesQuery.isRefetching}
      renderItem={({ item: invoice }) => (
        <Pressable
          onPress={() => router.push(`/billing/${invoice.id}` as never)}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleBlock}>
              <Text style={styles.cardTitle}>{invoice.invoice_number}</Text>
              <Text style={styles.cardMeta}>{invoice.patient_name} · {invoice.patient_mrn}</Text>
            </View>
            <Pill label={invoice.status.replace(/_/g, ' ')} tone={getInvoiceTone(invoice.status)} />
          </View>
          <Text style={styles.cardSummary}>Invoice date {formatDate(invoice.invoice_date)} · Payment type {invoice.payment_type}</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountText}>Total {formatCurrency(invoice.total_amount)}</Text>
            <Text style={styles.amountText}>Balance {formatCurrency(invoice.balance_due)}</Text>
          </View>
        </Pressable>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      gap: 8,
      padding: 14,
    },
    cardPressed: {
      opacity: 0.82,
    },
    cardHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    cardTitleBlock: {
      flex: 1,
      gap: 2,
    },
    cardTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '800',
    },
    cardMeta: {
      color: theme.colors.mutedText,
      fontSize: 12,
    },
    cardSummary: {
      color: theme.colors.mutedText,
      fontSize: 13,
    },
    amountRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    amountText: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    helperText: {
      color: theme.colors.mutedText,
      fontSize: 13,
    },
    listContent: {
      paddingBottom: 28,
    },
    separator: {
      height: 12,
    },
  });
}