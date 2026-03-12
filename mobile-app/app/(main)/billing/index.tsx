/**
 * Billing list screen.
 */

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInvoices } from '@/hooks/useBilling';
import { colors } from '@/constants/colors';
import { useTheme } from '@/lib/theme/context';
import type { InvoiceStatus } from '@/lib/types/billing';

function getStatusColors(status: InvoiceStatus) {
  switch (status) {
    case 'paid':
      return { backgroundColor: colors.success.light, color: colors.white };
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

export default function BillingListScreen(): React.JSX.Element {
  const router = useRouter();
  const { themeColors } = useTheme();
  const params = useLocalSearchParams<{ patient?: string; encounter?: string }>();
  const [searchQuery, setSearchQuery] = useState('');

  const filters = useMemo(() => {
    const patient = params.patient ? Number(params.patient) : undefined;
    const encounter = params.encounter ? Number(params.encounter) : undefined;

    return {
      search: searchQuery || undefined,
      patient: Number.isFinite(patient) ? patient : undefined,
      encounter: Number.isFinite(encounter) ? encounter : undefined,
      ordering: '-invoice_date',
    };
  }, [params.encounter, params.patient, searchQuery]);

  const { data, isLoading, error, refetch, isRefetching } = useInvoices(filters);
  const invoices = data?.results ?? [];

  const subtitle = useMemo(() => {
    if (filters.patient) {
      return `Filtered to patient #${filters.patient}`;
    }

    if (filters.encounter) {
      return `Filtered to encounter #${filters.encounter}`;
    }

    return 'Read-only invoice summaries';
  }, [filters.encounter, filters.patient]);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background.primary }]}> 
      <View style={[styles.searchContainer, { backgroundColor: themeColors.background.secondary, borderBottomColor: themeColors.border }]}> 
        <Text style={[styles.subtitle, { color: themeColors.text.secondary }]}>{subtitle}</Text>
        <TextInput
          style={[styles.searchInput, { backgroundColor: themeColors.card, color: themeColors.text.primary, borderColor: themeColors.border }]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by invoice number or patient"
          placeholderTextColor={themeColors.text.tertiary}
          testID="billing-search-input"
        />
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
          <Text style={[styles.helperText, { color: themeColors.text.secondary }]}>Loading invoices...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={[styles.errorTitle, { color: themeColors.text.primary }]}>Failed to load invoices</Text>
          <Text style={[styles.helperText, { color: themeColors.text.secondary }]}>{error.message}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => refetch()}
              tintColor={colors.primary[500]}
              colors={[colors.primary[500]]}
            />
          }
          renderItem={({ item }) => {
            const statusColors = getStatusColors(item.status);

            return (
              <TouchableOpacity
                style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                onPress={() =>
                  router.push({
                    pathname: '/(main)/billing/[id]' as never,
                    params: { id: item.id.toString() },
                  })
                }
                testID={`invoice-item-${item.id}`}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderCopy}>
                    <Text style={[styles.invoiceNumber, { color: themeColors.text.primary }]}>{item.invoice_number}</Text>
                    <Text style={[styles.patientName, { color: themeColors.text.secondary }]}>{item.patient_name} • {item.patient_mrn}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusColors.backgroundColor }]}>
                    <Text style={[styles.statusBadgeText, { color: statusColors.color }]}>{item.status.replace('_', ' ')}</Text>
                  </View>
                </View>

                <View style={styles.amountRow}>
                  <View>
                    <Text style={[styles.amountLabel, { color: themeColors.text.secondary }]}>Total</Text>
                    <Text style={[styles.amountValue, { color: themeColors.text.primary }]}>KES {item.total_amount}</Text>
                  </View>
                  <View>
                    <Text style={[styles.amountLabel, { color: themeColors.text.secondary }]}>Balance</Text>
                    <Text style={[styles.amountValue, { color: themeColors.text.primary }]}>KES {item.balance_due}</Text>
                  </View>
                </View>

                <Text style={[styles.invoiceMeta, { color: themeColors.text.secondary }]}>Invoice date: {item.invoice_date}</Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={[styles.errorTitle, { color: themeColors.text.primary }]}>No invoices found</Text>
              <Text style={[styles.helperText, { color: themeColors.text.secondary }]}>Try a different search or clear the current filter.</Text>
            </View>
          }
          contentContainerStyle={invoices.length === 0 ? styles.emptyListContent : styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    padding: 16,
    borderBottomWidth: 1,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 10,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  emptyListContent: {
    flexGrow: 1,
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
  retryButton: {
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.primary[500],
  },
  retryButtonText: {
    color: colors.white,
    fontWeight: '600',
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  cardHeaderCopy: {
    flex: 1,
  },
  invoiceNumber: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  patientName: {
    fontSize: 13,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  amountLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  amountValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  invoiceMeta: {
    fontSize: 12,
  },
});