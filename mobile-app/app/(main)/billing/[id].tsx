/**
 * Billing detail screen.
 */

import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useInvoice, useInvoicePayments } from '@/hooks/useBilling';
import { colors } from '@/constants/colors';
import { useTheme } from '@/lib/theme/context';
import type { InvoiceStatus } from '@/lib/types/billing';

function getStatusColors(status: InvoiceStatus) {
  switch (status) {
    case 'paid':
      return { backgroundColor: colors.success.main, color: colors.white };
    case 'partial':
      return { backgroundColor: colors.warning.main, color: colors.white };
    case 'overdue':
    case 'cancelled':
    case 'written_off':
      return { backgroundColor: colors.error.main, color: colors.white };
    default:
      return { backgroundColor: colors.secondary[500], color: colors.white };
  }
}

function InfoRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string | null | undefined;
  valueColor?: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor } : undefined]}>{value || '--'}</Text>
    </View>
  );
}

export default function BillingDetailScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { themeColors } = useTheme();
  const invoiceId = id ? Number(id) : null;
  const { data: invoice, isLoading, error } = useInvoice(invoiceId);
  const { data: payments } = useInvoicePayments(invoiceId ? { invoice: invoiceId } : {});

  if (isLoading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: themeColors.background.primary }]}> 
        <ActivityIndicator size="large" color={colors.primary[500]} />
        <Text style={[styles.helperText, { color: themeColors.text.secondary }]}>Loading invoice...</Text>
      </View>
    );
  }

  if (error || !invoice) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: themeColors.background.primary }]}> 
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={[styles.errorTitle, { color: themeColors.text.primary }]}>Failed to load invoice</Text>
        <Text style={[styles.helperText, { color: themeColors.text.secondary }]}>{error?.message || 'Invoice not found'}</Text>
      </View>
    );
  }

  const statusColors = getStatusColors(invoice.status);

  return (
    <ScrollView style={[styles.container, { backgroundColor: themeColors.background.primary }]}> 
      <View style={styles.header}>
        <Text style={styles.invoiceNumber}>{invoice.invoice_number}</Text>
        <Text style={styles.patientSummary}>{invoice.patient_name} • {invoice.patient_mrn}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColors.backgroundColor }]}>
          <Text style={[styles.statusBadgeText, { color: statusColors.color }]}>{invoice.status.replace('_', ' ')}</Text>
        </View>
      </View>

      <View style={[styles.section, { borderBottomColor: themeColors.border }]}> 
        <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Invoice Summary</Text>
        <InfoRow label="Invoice Date" value={invoice.invoice_date} valueColor={themeColors.text.primary} />
        <InfoRow label="Due Date" value={invoice.due_date} valueColor={themeColors.text.primary} />
        <InfoRow label="Payment Type" value={invoice.payment_type} valueColor={themeColors.text.primary} />
        <InfoRow label="Total" value={`KES ${invoice.total_amount}`} valueColor={themeColors.text.primary} />
        <InfoRow label="Amount Paid" value={`KES ${invoice.amount_paid}`} valueColor={colors.success.main} />
        <InfoRow label="Balance Due" value={`KES ${invoice.balance_due}`} valueColor={invoice.balance_due === '0.00' ? colors.success.main : colors.error.main} />
      </View>

      <View style={[styles.section, { borderBottomColor: themeColors.border }]}> 
        <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Insurance & Notes</Text>
        <InfoRow label="Provider" value={invoice.insurance_provider} valueColor={themeColors.text.primary} />
        <InfoRow label="Member No." value={invoice.insurance_member_no} valueColor={themeColors.text.primary} />
        <InfoRow label="SHA Claim No." value={invoice.sha_claim_number} valueColor={themeColors.text.primary} />
        <InfoRow label="Coverage" value={invoice.insurance_coverage} valueColor={themeColors.text.primary} />
        <InfoRow label="Notes" value={invoice.notes} valueColor={themeColors.text.primary} />
      </View>

      <View style={[styles.section, { borderBottomColor: themeColors.border }]}> 
        <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Line Items</Text>
        {invoice.items.length === 0 ? (
          <Text style={[styles.helperText, { color: themeColors.text.secondary }]}>No line items available.</Text>
        ) : (
          invoice.items.map((item) => (
            <View key={item.id} style={[styles.itemCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}> 
              <Text style={[styles.itemTitle, { color: themeColors.text.primary }]}>{item.service_name || item.drug_name || item.lab_order_name || item.description}</Text>
              {item.description ? (
                <Text style={[styles.itemDescription, { color: themeColors.text.secondary }]}>{item.description}</Text>
              ) : null}
              <View style={styles.itemMetaRow}>
                <Text style={[styles.itemMeta, { color: themeColors.text.secondary }]}>Qty {item.quantity}</Text>
                <Text style={[styles.itemMeta, { color: themeColors.text.secondary }]}>KES {item.unit_price}</Text>
                <Text style={[styles.itemAmount, { color: themeColors.text.primary }]}>KES {item.line_total}</Text>
              </View>
              {item.sha_code ? (
                <Text style={[styles.itemTag, { color: colors.secondary[500] }]}>SHA Code: {item.sha_code}</Text>
              ) : null}
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Payment Summary</Text>
        {(payments?.results ?? []).length === 0 ? (
          <Text style={[styles.helperText, { color: themeColors.text.secondary }]}>No payments recorded yet.</Text>
        ) : (
          (payments?.results ?? []).map((payment) => (
            <View key={payment.id} style={[styles.paymentCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}> 
              <View style={styles.itemMetaRow}>
                <Text style={[styles.itemTitle, { color: themeColors.text.primary }]}>{payment.method}</Text>
                <Text style={[styles.itemAmount, { color: themeColors.text.primary }]}>KES {payment.amount}</Text>
              </View>
              <Text style={[styles.itemDescription, { color: themeColors.text.secondary }]}>Status: {payment.status}</Text>
              <Text style={[styles.itemDescription, { color: themeColors.text.secondary }]}>Date: {payment.payment_date}</Text>
              {payment.payment_reference ? (
                <Text style={[styles.itemDescription, { color: themeColors.text.secondary }]}>Ref: {payment.payment_reference}</Text>
              ) : null}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  helperText: {
    marginTop: 10,
    fontSize: 14,
    textAlign: 'center',
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  header: {
    padding: 24,
    backgroundColor: colors.primary[500],
  },
  invoiceNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.white,
    marginBottom: 4,
  },
  patientSummary: {
    fontSize: 14,
    color: colors.primary[100],
    marginBottom: 12,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    maxWidth: '60%',
    textAlign: 'right',
  },
  itemCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  itemDescription: {
    fontSize: 13,
    marginBottom: 4,
  },
  itemMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  itemMeta: {
    fontSize: 12,
  },
  itemAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  itemTag: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
  },
  paymentCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
});