'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Inbox,
  Check,
  X,
  ExternalLink,
  AlertCircle,
  Send,
  RotateCcw,
  Download,
  GitBranch,
  ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/page-header';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { standaloneLisApi } from '@/lib/api/standalone-lis';
import type {
  ExternalOrderRequest,
  ExternalOrderStatus,
  InboundIngestionEvent,
  MessageMappingConfig,
  MessageMappingValidationResult,
  StandaloneBillingPayment,
  ResultDeliveryLog,
  CrosswalkEntry,
  StandaloneBillingInvoice,
  StandaloneRemittanceLine,
} from '@/lib/types/standalone-lis';
import { toast } from 'sonner';

const statusColors: Record<ExternalOrderStatus, string> = {
  RECEIVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  ACCEPTED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  PROCESSING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  COMPLETED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

export default function ExternalOrdersPage() {
  const [activeTab, setActiveTab] = useState<
    'orders' | 'reconciliation' | 'commercial' | 'mappings'
  >('orders');
  const [rejectDialog, setRejectDialog] = useState<ExternalOrderRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [deliveryDestination, setDeliveryDestination] = useState<Record<number, string>>({});
  const [mappingCodeSystem, setMappingCodeSystem] = useState('EXT_LIS');
  const [defaultPayerType, setDefaultPayerType] = useState<
    'cash' | 'sha' | 'private_insurance' | 'corporate' | 'mixed'
  >('cash');
  const [defaultPackage, setDefaultPackage] = useState<
    '' | 'BASIC' | 'COMPREHENSIVE' | 'EMPLOYMENT' | 'REFERRAL'
  >('');
  const [mappingExternalCode, setMappingExternalCode] = useState('');
  const [mappingTestCode, setMappingTestCode] = useState('');
  const [mappingValidationPayload, setMappingValidationPayload] = useState(
    JSON.stringify({ tests: [{ code: 'CBC' }] }, null, 2)
  );
  const [mappingValidationResult, setMappingValidationResult] =
    useState<MessageMappingValidationResult | null>(null);
  const { refresh, isRefreshing } = usePageRefresh();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['external-orders'],
    queryFn: () => standaloneLisApi.listExternalOrders(),
  });

  const { data: inboundEvents, isLoading: isInboundLoading } = useQuery({
    queryKey: ['lis-inbound-events'],
    queryFn: () => standaloneLisApi.listInboundEvents(),
  });

  const { data: deliveryLogs, isLoading: isDeliveryLoading } = useQuery({
    queryKey: ['lis-delivery-logs'],
    queryFn: () => standaloneLisApi.listDeliveryLogs(),
  });

  const { data: crosswalk, isLoading: isCrosswalkLoading } = useQuery({
    queryKey: ['lis-crosswalk'],
    queryFn: () => standaloneLisApi.listCrosswalk(),
  });

  const { data: mappings, isLoading: isMappingsLoading } = useQuery({
    queryKey: ['lis-message-mappings', mappingCodeSystem],
    queryFn: () => standaloneLisApi.listMessageMappings(mappingCodeSystem),
  });

  const { data: billingReconciliation, isLoading: isBillingReconLoading } = useQuery({
    queryKey: ['lis-billing-reconciliation'],
    queryFn: () => standaloneLisApi.getBillingReconciliation(),
  });

  const { data: billingInvoices, isLoading: isBillingInvoicesLoading } = useQuery({
    queryKey: ['lis-billing-invoices'],
    queryFn: () => standaloneLisApi.listBillingInvoices(),
  });

  const { data: billingPayments, isLoading: isBillingPaymentsLoading } = useQuery({
    queryKey: ['lis-billing-payments'],
    queryFn: () => standaloneLisApi.listBillingPayments(),
  });

  const { data: remittanceLines, isLoading: isRemittanceLinesLoading } = useQuery({
    queryKey: ['lis-remittance-lines'],
    queryFn: () => standaloneLisApi.listRemittanceLines(),
  });

  const acceptMutation = useMutation({
    mutationFn: (id: number) =>
      standaloneLisApi.acceptExternalOrder(id, {
        auto_create_walkin: true,
        enable_billing: true,
        payer_type: defaultPayerType,
        diagnostic_package: defaultPackage,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-orders'] });
      queryClient.invalidateQueries({ queryKey: ['lis-billing-reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['lis-billing-invoices'] });
      toast.success('External order accepted and lab order created');
    },
    onError: () => toast.error('Failed to accept order'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      standaloneLisApi.rejectExternalOrder(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-orders'] });
      setRejectDialog(null);
      setRejectReason('');
      toast.success('External order rejected');
    },
    onError: () => toast.error('Failed to reject order'),
  });

  const replayMutation = useMutation({
    mutationFn: (eventId: number) => standaloneLisApi.replayInboundEvent(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lis-inbound-events'] });
      queryClient.invalidateQueries({ queryKey: ['external-orders'] });
      toast.success('Dead-letter event replayed');
    },
    onError: () => toast.error('Replay failed'),
  });

  const deliverMutation = useMutation({
    mutationFn: ({ id, channel, destination }: { id: number; channel: 'PDF_PACKAGE' | 'WEBHOOK'; destination?: string }) =>
      standaloneLisApi.deliverResult(id, { channel, destination }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lis-delivery-logs'] });
      toast.success('Result delivery requested');
    },
    onError: () => toast.error('Failed to deliver result'),
  });

  const addMappingMutation = useMutation({
    mutationFn: () =>
      standaloneLisApi.upsertMessageMapping({
        code_system: mappingCodeSystem.trim(),
        external_code: mappingExternalCode.trim(),
        relationship: 'EQUIVALENT',
        test_code: mappingTestCode.trim().toUpperCase(),
      }),
    onSuccess: () => {
      setMappingExternalCode('');
      setMappingTestCode('');
      queryClient.invalidateQueries({ queryKey: ['lis-message-mappings', mappingCodeSystem] });
      toast.success('Mapping saved');
    },
    onError: () => toast.error('Failed to save mapping'),
  });

  const validateMappingMutation = useMutation({
    mutationFn: async () => {
      const parsed = JSON.parse(mappingValidationPayload);
      return standaloneLisApi.validateMessageMappings({
        source_system: mappingCodeSystem.trim(),
        message_format: 'JSON',
        payload: parsed,
      });
    },
    onSuccess: (result) => {
      setMappingValidationResult(result);
      toast.success('Validation completed');
    },
    onError: () => toast.error('Validation failed. Ensure payload is valid JSON.'),
  });

  const deleteMappingMutation = useMutation({
    mutationFn: (id: number) => standaloneLisApi.deleteMessageMapping(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lis-message-mappings', mappingCodeSystem] });
      toast.success('Mapping deleted');
    },
    onError: () => toast.error('Failed to delete mapping'),
  });

  const columns = [
    {
      key: 'placer_order_number',
      header: 'Order #',
      sortable: true,
      cell: (item: ExternalOrderRequest) => (
        <span className="font-mono text-sm">{item.placer_order_number}</span>
      ),
    },
    {
      key: 'sending_facility',
      header: 'From',
      sortable: true,
      cell: (item: ExternalOrderRequest) => (
        <div className="flex items-center gap-1">
          <ExternalLink className="h-3 w-3 text-muted-foreground" />
          <span className="max-w-[150px] truncate">{item.sending_facility}</span>
        </div>
      ),
    },
    {
      key: 'patient_name',
      header: 'Patient',
      sortable: true,
      cell: (item: ExternalOrderRequest) => item.patient_name,
    },
    {
      key: 'tests',
      header: 'Tests',
      cell: (item: ExternalOrderRequest) => (
        <span className="text-sm text-muted-foreground">{item.requested_tests.length} test(s)</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: ExternalOrderRequest) => (
        <Badge className={statusColors[item.status]}>{item.status}</Badge>
      ),
    },
    {
      key: 'created_at',
      header: 'Received',
      sortable: true,
      sortType: 'date' as const,
      cell: (item: ExternalOrderRequest) => new Date(item.created_at).toLocaleString(),
      hideOnMobile: true,
    },
    {
      key: 'actions',
      header: '',
      cell: (item: ExternalOrderRequest) =>
        item.status === 'RECEIVED' ? (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-green-600"
              onClick={(e) => {
                e.stopPropagation();
                acceptMutation.mutate(item.id);
              }}
              disabled={acceptMutation.isPending}
            >
              <Check className="mr-1 h-3 w-3" /> Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-red-600"
              onClick={(e) => {
                e.stopPropagation();
                setRejectDialog(item);
              }}
            >
              <X className="mr-1 h-3 w-3" /> Reject
            </Button>
          </div>
        ) : item.status === 'ACCEPTED' || item.status === 'COMPLETED' ? (
          <div className="flex flex-col gap-1 sm:flex-row">
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={(e) => {
                e.stopPropagation();
                deliverMutation.mutate({ id: item.id, channel: 'PDF_PACKAGE' });
              }}
              disabled={deliverMutation.isPending}
            >
              <Download className="mr-1 h-3 w-3" /> PDF
            </Button>
            <div className="flex gap-1">
              <Input
                value={deliveryDestination[item.id] ?? ''}
                onChange={(e) =>
                  setDeliveryDestination((prev) => ({ ...prev, [item.id]: e.target.value }))
                }
                placeholder="Webhook URL"
                className="h-7 w-36 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={(e) => {
                  e.stopPropagation();
                  deliverMutation.mutate({
                    id: item.id,
                    channel: 'WEBHOOK',
                    destination: deliveryDestination[item.id],
                  });
                }}
                disabled={deliverMutation.isPending}
              >
                <Send className="mr-1 h-3 w-3" /> Push
              </Button>
            </div>
          </div>
        ) : null,
    },
  ];

  const pendingCount = data?.results.filter((o) => o.status === 'RECEIVED').length || 0;
  const failedInboundCount = inboundEvents?.results.filter((e) => e.status === 'FAILED').length || 0;
  const failedDeliveryCount = deliveryLogs?.results.filter((d) => d.status === 'FAILED').length || 0;

  const inboundColumns = [
    {
      key: 'trace_id',
      header: 'Trace ID',
      cell: (item: InboundIngestionEvent) => <span className="font-mono text-xs">{item.trace_id}</span>,
    },
    { key: 'source_system', header: 'Source', sortable: true, cell: (item: InboundIngestionEvent) => item.source_system },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: InboundIngestionEvent) => (
        <Badge variant={item.status === 'FAILED' ? 'destructive' : 'secondary'}>{item.status}</Badge>
      ),
    },
    {
      key: 'error_message',
      header: 'Error',
      cell: (item: InboundIngestionEvent) => item.error_message || '-',
    },
    {
      key: 'actions',
      header: '',
      cell: (item: InboundIngestionEvent) =>
        item.status === 'FAILED' ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => replayMutation.mutate(item.id)}
            disabled={replayMutation.isPending}
          >
            <RotateCcw className="mr-1 h-3 w-3" /> Replay
          </Button>
        ) : null,
    },
  ];

  const deliveryColumns = [
    {
      key: 'trace_id',
      header: 'Trace ID',
      cell: (item: ResultDeliveryLog) => <span className="font-mono text-xs">{item.trace_id}</span>,
    },
    { key: 'channel', header: 'Channel', sortable: true, cell: (item: ResultDeliveryLog) => item.channel },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: ResultDeliveryLog) => (
        <Badge variant={item.status === 'FAILED' ? 'destructive' : 'secondary'}>{item.status}</Badge>
      ),
    },
    { key: 'destination', header: 'Destination', cell: (item: ResultDeliveryLog) => item.destination || '-' },
    {
      key: 'pdf',
      header: '',
      cell: (item: ResultDeliveryLog) =>
        item.channel === 'PDF_PACKAGE' && item.pdf_filename ? (
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const blob = await standaloneLisApi.downloadDeliveryPdf(item.id);
              const url = URL.createObjectURL(blob);
              window.open(url, '_blank');
              setTimeout(() => URL.revokeObjectURL(url), 5000);
            }}
          >
            <Download className="mr-1 h-3 w-3" /> PDF
          </Button>
        ) : null,
    },
  ];

  const crosswalkColumns = [
    { key: 'source_system', header: 'Source', sortable: true, cell: (item: CrosswalkEntry) => item.source_system },
    { key: 'external_patient_id', header: 'External ID', sortable: true, cell: (item: CrosswalkEntry) => item.external_patient_id },
    { key: 'patient_name_snapshot', header: 'Patient', sortable: true, cell: (item: CrosswalkEntry) => item.patient_name_snapshot || '-' },
    { key: 'walkin_patient', header: 'Walk-in', cell: (item: CrosswalkEntry) => item.walkin_patient ?? '-' },
    { key: 'patient', header: 'HMIS Patient', cell: (item: CrosswalkEntry) => item.patient ?? '-' },
  ];

  const mappingColumns = [
    { key: 'code_system', header: 'Code System', sortable: true, cell: (item: MessageMappingConfig) => item.code_system },
    { key: 'external_code', header: 'External Code', sortable: true, cell: (item: MessageMappingConfig) => item.external_code },
    { key: 'test_code', header: 'Local Test', sortable: true, cell: (item: MessageMappingConfig) => `${item.test_code} - ${item.test_name}` },
    {
      key: 'actions',
      header: '',
      cell: (item: MessageMappingConfig) => (
        <Button
          size="sm"
          variant="outline"
          className="text-red-600"
          onClick={() => deleteMappingMutation.mutate(item.id)}
          disabled={deleteMappingMutation.isPending}
        >
          <X className="mr-1 h-3 w-3" /> Delete
        </Button>
      ),
    },
  ];

  const billingInvoiceColumns = [
    {
      key: 'invoice_number',
      header: 'Invoice',
      sortable: true,
      cell: (item: StandaloneBillingInvoice) => (
        <span className="font-mono text-xs">{item.invoice_number}</span>
      ),
    },
    {
      key: 'patient_name',
      header: 'Patient',
      sortable: true,
      cell: (item: StandaloneBillingInvoice) => item.patient_name,
    },
    {
      key: 'payer_type',
      header: 'Payer',
      sortable: true,
      cell: (item: StandaloneBillingInvoice) => item.payer_type,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: StandaloneBillingInvoice) => item.status,
    },
    {
      key: 'total_amount',
      header: 'Total (KES)',
      sortable: true,
      cell: (item: StandaloneBillingInvoice) => item.total_amount,
    },
    {
      key: 'balance_due',
      header: 'Balance',
      sortable: true,
      cell: (item: StandaloneBillingInvoice) => item.balance_due,
    },
    {
      key: 'actions',
      header: '',
      cell: (item: StandaloneBillingInvoice) => (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const blob = await standaloneLisApi.downloadInvoicePdf(item.id);
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            setTimeout(() => URL.revokeObjectURL(url), 5000);
          }}
        >
          <Download className="mr-1 h-3 w-3" /> Print
        </Button>
      ),
    },
  ];

  const billingPaymentColumns = [
    {
      key: 'payment_reference',
      header: 'Payment Ref',
      sortable: true,
      cell: (item: StandaloneBillingPayment) => (
        <span className="font-mono text-xs">{item.payment_reference}</span>
      ),
    },
    {
      key: 'invoice_number',
      header: 'Invoice',
      sortable: true,
      cell: (item: StandaloneBillingPayment) => item.invoice_number,
    },
    {
      key: 'method',
      header: 'Method',
      sortable: true,
      cell: (item: StandaloneBillingPayment) => item.method,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: StandaloneBillingPayment) => item.status,
    },
    {
      key: 'amount',
      header: 'Amount',
      sortable: true,
      cell: (item: StandaloneBillingPayment) => item.amount,
    },
    {
      key: 'actions',
      header: '',
      cell: (item: StandaloneBillingPayment) => (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const blob = await standaloneLisApi.downloadPaymentReceiptPdf(item.id);
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            setTimeout(() => URL.revokeObjectURL(url), 5000);
          }}
        >
          <Download className="mr-1 h-3 w-3" /> Receipt
        </Button>
      ),
    },
  ];

  const remittanceLineColumns = [
    {
      key: 'bank_reference',
      header: 'Bank Ref',
      sortable: true,
      cell: (item: StandaloneRemittanceLine) => (
        <span className="font-mono text-xs">{item.bank_reference}</span>
      ),
    },
    {
      key: 'claim_number',
      header: 'Claim',
      sortable: true,
      cell: (item: StandaloneRemittanceLine) => item.claim_number || item.dha_claim_id,
    },
    {
      key: 'paid_amount',
      header: 'Paid',
      sortable: true,
      cell: (item: StandaloneRemittanceLine) => item.paid_amount,
    },
    {
      key: 'payment_status',
      header: 'Payment Status',
      sortable: true,
      cell: (item: StandaloneRemittanceLine) => item.payment_status || '-',
    },
    {
      key: 'is_reconciled',
      header: 'Reconciled',
      sortable: true,
      cell: (item: StandaloneRemittanceLine) => (item.is_reconciled ? 'Yes' : 'No'),
    },
  ];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="External Orders"
          helpContent="WS3 interoperability ops: review inbound orders, replay dead-letter events, monitor outbound result delivery, and validate code mappings."
        />

        <div className="grid gap-3 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="text-xs text-muted-foreground">Pending External Orders</p>
                <p className="text-2xl font-semibold">{pendingCount}</p>
              </div>
              <Inbox className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="text-xs text-muted-foreground">Dead-letter (FAILED)</p>
                <p className="text-2xl font-semibold">{failedInboundCount}</p>
              </div>
              <RotateCcw className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="text-xs text-muted-foreground">Failed Deliveries</p>
                <p className="text-2xl font-semibold">{failedDeliveryCount}</p>
              </div>
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="orders" className="gap-2">
              <Inbox className="h-4 w-4" />
              <span className="sm:hidden">Orders</span>
              <span className="hidden sm:inline">Inbound Orders</span>
            </TabsTrigger>
            <TabsTrigger value="reconciliation" className="gap-2">
              <GitBranch className="h-4 w-4" />
              <span className="sm:hidden">Ops</span>
              <span className="hidden sm:inline">Reconciliation</span>
            </TabsTrigger>
            <TabsTrigger value="commercial" className="gap-2">
              <ShieldCheck className="h-4 w-4" />
              <span className="sm:hidden">Bill</span>
              <span className="hidden sm:inline">Commercial</span>
            </TabsTrigger>
            <TabsTrigger value="mappings" className="gap-2">
              <ShieldCheck className="h-4 w-4" />
              <span className="sm:hidden">Map</span>
              <span className="hidden sm:inline">Mappings</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Default Billing Rules (on Accept)</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Default payer</Label>
                  <Input
                    value={defaultPayerType}
                    onChange={(e) =>
                      setDefaultPayerType(
                        e.target.value as
                          | 'cash'
                          | 'sha'
                          | 'private_insurance'
                          | 'corporate'
                          | 'mixed'
                      )
                    }
                    placeholder="cash | sha | private_insurance | corporate | mixed"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Diagnostic package</Label>
                  <Input
                    value={defaultPackage}
                    onChange={(e) =>
                      setDefaultPackage(
                        (e.target.value || '') as
                          | ''
                          | 'BASIC'
                          | 'COMPREHENSIVE'
                          | 'EMPLOYMENT'
                          | 'REFERRAL'
                      )
                    }
                    placeholder="BASIC | COMPREHENSIVE | EMPLOYMENT | REFERRAL"
                  />
                </div>
              </CardContent>
            </Card>

            {pendingCount > 0 && (
              <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30">
                <CardContent className="flex items-center gap-3 py-3">
                  <AlertCircle className="h-5 w-5 text-blue-600" />
                  <span className="text-sm font-medium">
                    {pendingCount} pending order{pendingCount > 1 ? 's' : ''} awaiting review
                  </span>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Inbox className="h-5 w-5" />
                  Inbound Orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveTable
                  data={data?.results || []}
                  keyExtractor={(item) => item.id}
                  columns={columns}
                  defaultSortColumn="created_at"
                  defaultSortDirection="desc"
                  isLoading={isLoading}
                  emptyMessage="No external orders received yet."
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reconciliation" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dead-letter Queue</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveTable
                  data={inboundEvents?.results || []}
                  keyExtractor={(item) => item.id}
                  columns={inboundColumns}
                  defaultSortColumn="created_at"
                  defaultSortDirection="desc"
                  isLoading={isInboundLoading}
                  emptyMessage="No inbound ingestion events yet."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Result Delivery Status</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveTable
                  data={deliveryLogs?.results || []}
                  keyExtractor={(item) => item.id}
                  columns={deliveryColumns}
                  defaultSortColumn="created_at"
                  defaultSortDirection="desc"
                  isLoading={isDeliveryLoading}
                  emptyMessage="No result delivery attempts recorded yet."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">External Patient Crosswalk</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveTable
                  data={crosswalk?.results || []}
                  keyExtractor={(item) => item.id}
                  columns={crosswalkColumns}
                  defaultSortColumn="updated_at"
                  defaultSortDirection="desc"
                  isLoading={isCrosswalkLoading}
                  emptyMessage="No crosswalk mappings available yet."
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="mappings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Message Mapping Config</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 md:grid-cols-4">
                  <Input
                    placeholder="Code system (e.g. EXT_LIS)"
                    value={mappingCodeSystem}
                    onChange={(e) => setMappingCodeSystem(e.target.value)}
                  />
                  <Input
                    placeholder="External code"
                    value={mappingExternalCode}
                    onChange={(e) => setMappingExternalCode(e.target.value)}
                  />
                  <Input
                    placeholder="Local test code"
                    value={mappingTestCode}
                    onChange={(e) => setMappingTestCode(e.target.value)}
                  />
                  <Button
                    onClick={() => addMappingMutation.mutate()}
                    disabled={
                      !mappingCodeSystem.trim() ||
                      !mappingExternalCode.trim() ||
                      !mappingTestCode.trim() ||
                      addMappingMutation.isPending
                    }
                  >
                    Save Mapping
                  </Button>
                </div>

                <ResponsiveTable
                  data={mappings || []}
                  keyExtractor={(item) => item.id}
                  columns={mappingColumns}
                  defaultSortColumn="external_code"
                  defaultSortDirection="asc"
                  isLoading={isMappingsLoading}
                  emptyMessage="No message mappings configured yet."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Mapping Validation Tool</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Label>Validation payload (JSON)</Label>
                <Textarea
                  value={mappingValidationPayload}
                  onChange={(e) => setMappingValidationPayload(e.target.value)}
                  rows={8}
                  className="font-mono text-xs"
                />
                <div className="flex justify-end">
                  <Button onClick={() => validateMappingMutation.mutate()} disabled={validateMappingMutation.isPending}>
                    Validate Mapping
                  </Button>
                </div>
                {mappingValidationResult ? (
                  <div className="rounded-md border p-3 text-sm">
                    <p className="font-medium">
                      Total: {mappingValidationResult.total_codes} | Mapped:{' '}
                      {mappingValidationResult.mapped_count} | Unmapped:{' '}
                      {mappingValidationResult.unmapped_count}
                    </p>
                    <div className="mt-2 space-y-1">
                      {mappingValidationResult.mappings.map((row, idx) => (
                        <p key={`${row.external_code}-${idx}`} className="text-xs">
                          <span className="font-mono">{row.external_code}</span> - {row.mapped ? 'mapped' : 'unmapped'} ({row.reason})
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="commercial" className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Card>
                <CardContent className="py-4">
                  <p className="text-xs text-muted-foreground">Released Tests</p>
                  <p className="text-2xl font-semibold">
                    {isBillingReconLoading ? '-' : billingReconciliation?.released_orders ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    KES {billingReconciliation?.released_amount ?? '0.00'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <p className="text-xs text-muted-foreground">Collected Payments</p>
                  <p className="text-2xl font-semibold">
                    {isBillingReconLoading ? '-' : billingReconciliation?.payments ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    KES {billingReconciliation?.collected_amount ?? '0.00'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <p className="text-xs text-muted-foreground">Outstanding</p>
                  <p className="text-2xl font-semibold">KES {billingReconciliation?.outstanding_amount ?? '0.00'}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Standalone Lab Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveTable
                  data={billingInvoices || []}
                  keyExtractor={(item) => item.id}
                  columns={billingInvoiceColumns}
                  defaultSortColumn="invoice_date"
                  defaultSortDirection="desc"
                  isLoading={isBillingInvoicesLoading}
                  emptyMessage="No standalone lab invoices yet."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Collected Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveTable
                  data={billingPayments || []}
                  keyExtractor={(item) => item.id}
                  columns={billingPaymentColumns}
                  defaultSortColumn="payment_date"
                  defaultSortDirection="desc"
                  isLoading={isBillingPaymentsLoading}
                  emptyMessage="No standalone lab payments yet."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">SHA Remittance Reconciliation</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveTable
                  data={remittanceLines || []}
                  keyExtractor={(item) => item.id}
                  columns={remittanceLineColumns}
                  defaultSortColumn="remittance_date"
                  defaultSortDirection="desc"
                  isLoading={isRemittanceLinesLoading}
                  emptyMessage="No remittance lines reconciled for standalone lab claims yet."
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Reject Dialog */}
        <Dialog open={!!rejectDialog} onOpenChange={() => setRejectDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reject Order</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Rejecting order{' '}
                <span className="font-mono">{rejectDialog?.placer_order_number}</span> from{' '}
                {rejectDialog?.sending_facility}
              </p>
              <div>
                <Label>Reason for rejection *</Label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter reason..."
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRejectDialog(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={!rejectReason.trim() || rejectMutation.isPending}
                  onClick={() =>
                    rejectDialog &&
                    rejectMutation.mutate({ id: rejectDialog.id, reason: rejectReason })
                  }
                >
                  Reject Order
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
