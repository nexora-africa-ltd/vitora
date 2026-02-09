/**
 * Proforma Invoices Page
 * Dedicated view for managing proforma invoices
 * Supports filtering by status (Active, Expired, Converted)
 */
'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { useToast } from '@/lib/hooks/use-toast';
import {
  Plus,
  Search,
  FileText,
  Clock,
  ArrowRightCircle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import {
  ProformaConvertDialog,
  ProformaRenewDialog,
} from '@/components/billing';
import {
  useProformas,
  useConvertProforma,
  useConvertProformaItems,
  useRenewProforma,
} from '@/lib/hooks/billing';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { Invoice } from '@/lib/types/billing';

// ============================================================================
// Types
// ============================================================================

type ProformaFilter = 'all' | 'active' | 'expired' | 'converted';

// ============================================================================
// Stats Card Component
// ============================================================================

interface StatsCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  description?: string;
  variant?: 'default' | 'primary' | 'warning' | 'critical' | 'success';
}

function StatsCard({ title, value, icon, description, variant = 'default' }: StatsCardProps) {
  return (
    <Card variant={variant}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Expiry Badge Component
// ============================================================================

function ExpiryBadge({ invoice }: { invoice: Invoice }) {
  const days = invoice.days_until_expiry;

  if (invoice.is_converted) {
    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Converted
      </Badge>
    );
  }

  if (!invoice.is_valid || days < 0) {
    return (
      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
        <XCircle className="h-3 w-3 mr-1" />
        Expired
      </Badge>
    );
  }

  if (days === 0) {
    return (
      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
        <AlertCircle className="h-3 w-3 mr-1" />
        Expires Today
      </Badge>
    );
  }

  if (days <= 7) {
    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
        <Clock className="h-3 w-3 mr-1" />
        {days}d left
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
      <Clock className="h-3 w-3 mr-1" />
      {days}d left
    </Badge>
  );
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function ProformasPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyState({ onCreateNew }: { onCreateNew: () => void }) {
  return (
    <Card variant="dashed" className="p-0">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">No proforma invoices found</h3>
        <p className="text-muted-foreground mb-4">
          Create a proforma invoice to provide a quotation to your patients
        </p>
        <Button onClick={onCreateNew}>
          <Plus className="h-4 w-4 mr-2" />
          Create Proforma
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function ProformasPage() {
  const router = useRouter();
  const { toast } = useToast();

  // State
  const [filter, setFilter] = useState<ProformaFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProforma, setSelectedProforma] = useState<Invoice | null>(null);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);

  // Queries & Mutations
  const { data, isLoading, refetch } = useProformas();
  const convertMutation = useConvertProforma();
  const convertItemsMutation = useConvertProformaItems();
  const renewMutation = useRenewProforma();

  // Filter and search proformas
  const filteredProformas = useMemo(() => {
    let proformas = data?.results || [];

    // Apply status filter
    switch (filter) {
      case 'active':
        proformas = proformas.filter((p) => p.is_valid && !p.is_converted);
        break;
      case 'expired':
        proformas = proformas.filter((p) => !p.is_valid && !p.is_converted);
        break;
      case 'converted':
        proformas = proformas.filter((p) => p.is_converted);
        break;
    }

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      proformas = proformas.filter(
        (p) =>
          p.invoice_number.toLowerCase().includes(query) ||
          p.patient_name?.toLowerCase().includes(query) ||
          p.patient_mrn?.toLowerCase().includes(query)
      );
    }

    return proformas;
  }, [data?.results, filter, searchQuery]);

  // Calculate stats
  const stats = useMemo(() => {
    const all = data?.results || [];
    return {
      total: all.length,
      active: all.filter((p) => p.is_valid && !p.is_converted).length,
      expiringSoon: all.filter((p) => p.is_valid && !p.is_converted && p.days_until_expiry <= 7).length,
      expired: all.filter((p) => !p.is_valid && !p.is_converted).length,
      converted: all.filter((p) => p.is_converted).length,
    };
  }, [data?.results]);

  // Handlers
  const handleCreateNew = () => {
    router.push('/transactions/invoices/new?type=proforma');
  };

  const handleSelectProforma = (proforma: Invoice) => {
    router.push(`/transactions/invoices/${proforma.id}`);
  };

  const handleOpenConvertDialog = (proforma: Invoice) => {
    setSelectedProforma(proforma);
    setConvertDialogOpen(true);
  };

  const handleOpenRenewDialog = (proforma: Invoice) => {
    setSelectedProforma(proforma);
    setRenewDialogOpen(true);
  };

  const handleConvertFull = async (proforma: Invoice) => {
    try {
      const newInvoice = await convertMutation.mutateAsync(proforma.id);
      toast({
        title: 'Proforma Converted',
        description: `Created invoice ${newInvoice.invoice_number}`,
      });
      setConvertDialogOpen(false);
      router.push(`/transactions/invoices/${newInvoice.id}`);
    } catch (error) {
      toast({
        title: 'Conversion Failed',
        description: 'Failed to convert proforma. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleConvertPartial = async (proforma: Invoice, itemIds: number[]) => {
    try {
      const newInvoice = await convertItemsMutation.mutateAsync({
        id: proforma.id,
        itemIds,
      });
      toast({
        title: 'Proforma Partially Converted',
        description: `Created invoice ${newInvoice.invoice_number} with ${itemIds.length} item(s)`,
      });
      setConvertDialogOpen(false);
      router.push(`/transactions/invoices/${newInvoice.id}`);
    } catch (error) {
      toast({
        title: 'Conversion Failed',
        description: 'Failed to convert proforma items. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleRenew = async (proforma: Invoice, validityDays?: number) => {
    try {
      const renewed = await renewMutation.mutateAsync({
        id: proforma.id,
        validityDays,
      });
      toast({
        title: 'Proforma Renewed',
        description: `Proforma ${renewed.invoice_number} validity extended`,
      });
      setRenewDialogOpen(false);
      refetch();
    } catch (error) {
      toast({
        title: 'Renewal Failed',
        description: 'Failed to renew proforma. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Proforma Invoices" />
        <ProformasPageSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <PageHeader
        title="Proforma Invoices"
        helpContent="Proformas are quotations that can be converted to invoices. Active proformas are valid and awaiting conversion. Expired proformas need renewal before conversion."
        actions={
          <Button onClick={handleCreateNew} className="bg-purple-600 hover:bg-purple-700 w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            New Proforma
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Active Proformas"
          value={stats.active}
          icon={<FileText className="h-4 w-4 text-purple-600" />}
          description="Valid and unconverted"
          variant="primary"
        />
        <StatsCard
          title="Expiring Soon"
          value={stats.expiringSoon}
          icon={<AlertCircle className="h-4 w-4 text-amber-600" />}
          description="Within 7 days"
          variant={stats.expiringSoon > 0 ? 'warning' : 'default'}
        />
        <StatsCard
          title="Expired"
          value={stats.expired}
          icon={<XCircle className="h-4 w-4 text-red-600" />}
          description="Needs renewal"
          variant={stats.expired > 0 ? 'critical' : 'default'}
        />
        <StatsCard
          title="Converted"
          value={stats.converted}
          icon={<CheckCircle2 className="h-4 w-4 text-blue-600" />}
          description="To invoices"
          variant="success"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search proformas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as ProformaFilter)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Proformas</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="converted">Converted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Proformas Table */}
      {filteredProformas.length === 0 ? (
        <EmptyState onCreateNew={handleCreateNew} />
      ) : (
        <Card>
          <CardContent className="p-0 sm:p-6">
            <ResponsiveTable
              data={filteredProformas}
              keyExtractor={(p) => p.id}
              onRowClick={handleSelectProforma}
              columns={[
                {
                  key: 'invoice_number',
                  header: 'Proforma #',
                  cell: (p) => <span className="font-mono font-medium">{p.invoice_number}</span>,
                },
                {
                  key: 'patient',
                  header: 'Patient',
                  cell: (p) => (
                    <div>
                      <div className="font-medium">{p.patient_name}</div>
                      {p.patient_mrn && (
                        <div className="text-sm text-muted-foreground">{p.patient_mrn}</div>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'invoice_date',
                  header: 'Date',
                  cell: (p) => formatDate(p.invoice_date),
                  hideOnMobile: true,
                },
                {
                  key: 'total_amount',
                  header: 'Amount',
                  cell: (p) => <span className="font-medium">{formatCurrency(parseFloat(p.total_amount))}</span>,
                },
                {
                  key: 'status',
                  header: 'Status',
                  cell: (p) => <ExpiryBadge invoice={p} />,
                },
                {
                  key: 'valid_until',
                  header: 'Valid Until',
                  cell: (p) => (p.valid_until ? formatDate(p.valid_until) : '-'),
                  hideOnMobile: true,
                },
                {
                  key: 'actions',
                  header: 'Actions',
                  className: 'w-[100px]',
                  hideOnMobile: true,
                  cell: (p) => (
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {p.can_convert && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenConvertDialog(p)}
                          title="Convert to Invoice"
                        >
                          <ArrowRightCircle className="h-4 w-4" />
                        </Button>
                      )}
                      {!p.is_valid && !p.is_converted && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenRenewDialog(p)}
                          title="Renew Proforma"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
              mobileCard={(proforma) => (
                <Card className="p-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono font-medium text-sm">{proforma.invoice_number}</p>
                      <p className="font-medium truncate">{proforma.patient_name}</p>
                      {proforma.patient_mrn && (
                        <p className="text-sm text-muted-foreground">{proforma.patient_mrn}</p>
                      )}
                    </div>
                    <ExpiryBadge invoice={proforma} />
                  </div>
                  <div className="flex justify-between items-center mt-3 pt-3 border-t">
                    <span className="font-medium">{formatCurrency(parseFloat(proforma.total_amount))}</span>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {proforma.can_convert && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenConvertDialog(proforma)}
                        >
                          <ArrowRightCircle className="h-4 w-4" />
                        </Button>
                      )}
                      {!proforma.is_valid && !proforma.is_converted && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenRenewDialog(proforma)}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              )}
            />
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <ProformaConvertDialog
        open={convertDialogOpen}
        onOpenChange={setConvertDialogOpen}
        invoice={selectedProforma}
        onConvertFull={handleConvertFull}
        onConvertPartial={handleConvertPartial}
        isLoading={convertMutation.isPending || convertItemsMutation.isPending}
      />

      <ProformaRenewDialog
        open={renewDialogOpen}
        onOpenChange={setRenewDialogOpen}
        invoice={selectedProforma}
        onRenew={handleRenew}
        isLoading={renewMutation.isPending}
      />
    </div>
  );
}
