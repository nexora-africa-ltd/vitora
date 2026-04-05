'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Plus,
  AlertTriangle,
  Package,
  ArrowDownToLine,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { HelpPopover } from '@/components/shared/help-popover';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';
import { vaccineStockApi, vaccineDefinitionsApi } from '@/lib/api/immunizations';
import type {
  VaccineStockListItem,
  StockIssueData,
} from '@/lib/types/immunizations';

type IssueTransactionType = StockIssueData['transaction_type'];

export default function StockPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { refresh, isRefreshing } = usePageRefresh();

  // Receive dialog
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [receiveTouched, setReceiveTouched] = useState<Record<string, boolean>>({});
  const [vaccineId, setVaccineId] = useState<string>('');
  const [batchNumber, setBatchNumber] = useState('');
  const [quantity, setQuantity] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0]!);
  const [manufacturer, setManufacturer] = useState('');
  const [supplier, setSupplier] = useState('');
  const [storageLocation, setStorageLocation] = useState('');
  const [vvmStatus, setVvmStatus] = useState('');
  const [minStockLevel, setMinStockLevel] = useState('');
  const [receiveNotes, setReceiveNotes] = useState('');

  // Issue dialog
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [issueTouched, setIssueTouched] = useState<Record<string, boolean>>({});
  const [issueStockId, setIssueStockId] = useState<number | null>(null);
  const [issueQty, setIssueQty] = useState('');
  const [issueType, setIssueType] = useState<IssueTransactionType>('WASTAGE');
  const [issueReason, setIssueReason] = useState('');

  // Fetch stock
  const { data, isLoading } = useQuery({
    queryKey: ['vaccine-stock'],
    queryFn: () => vaccineStockApi.list({ page_size: 100, ordering: 'expiry_date' }),
  });

  // Fetch vaccines for receive form
  const { data: vaccines } = useQuery({
    queryKey: ['vaccine-defs-all'],
    queryFn: () => vaccineDefinitionsApi.list(),
  });

  const stocks = data?.results || [];

  // Stats
  const lowStockCount = stocks.filter((s) => s.is_low_stock).length;
  const expiredCount = stocks.filter((s) => s.is_expired).length;
  const nearExpiryCount = stocks.filter((s) => s.is_near_expiry && !s.is_expired).length;
  const totalDoses = stocks.reduce((sum, s) => sum + s.quantity_on_hand, 0);

  // Receive mutation
  const receiveMutation = useMutation({
    mutationFn: () =>
      vaccineStockApi.create({
        vaccine: parseInt(vaccineId, 10),
        batch_number: batchNumber,
        quantity_received: parseInt(quantity, 10),
        expiry_date: expiryDate,
        received_date: receivedDate,
        manufacturer: manufacturer || undefined,
        supplier: supplier || undefined,
        storage_location: storageLocation || undefined,
        vvm_status: vvmStatus || undefined,
        min_stock_level: minStockLevel ? parseInt(minStockLevel, 10) : undefined,
        notes: receiveNotes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vaccine-stock'] });
      toast({ title: 'Stock Received', description: 'Vaccine batch has been recorded.' });
      setReceiveDialogOpen(false);
      resetReceiveForm();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to receive stock.', variant: 'destructive' });
    },
  });

  // Issue mutation
  const issueMutation = useMutation({
    mutationFn: () =>
      vaccineStockApi.issue(issueStockId!, {
        quantity: parseInt(issueQty, 10),
        transaction_type: issueType,
        reason: issueReason || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vaccine-stock'] });
      toast({ title: 'Stock Updated', description: 'Transaction recorded.' });
      setIssueDialogOpen(false);
      resetIssueForm();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to process transaction.', variant: 'destructive' });
    },
  });

  function resetReceiveForm() {
    setReceiveTouched({});
    setVaccineId('');
    setBatchNumber('');
    setQuantity('');
    setExpiryDate('');
    setReceivedDate(new Date().toISOString().split('T')[0]!);
    setManufacturer('');
    setSupplier('');
    setStorageLocation('');
    setVvmStatus('');
    setMinStockLevel('');
    setReceiveNotes('');
  }

  function resetIssueForm() {
    setIssueTouched({});
    setIssueStockId(null);
    setIssueQty('');
    setIssueType('WASTAGE');
    setIssueReason('');
  }

  function openIssueDialog(stockId: number) {
    setIssueStockId(stockId);
    setIssueDialogOpen(true);
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Vaccine Stock"
          helpContent="Track vaccine inventory by batch. Receive new stock, record wastage, transfers, and adjustments. Monitor expiry dates and VVM status."
          actions={
            <Button size="sm" onClick={() => setReceiveDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Receive Stock</span>
              <span className="sm:hidden">Receive</span>
            </Button>
          }
        />

        {/* Summary stats */}
        {stocks.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="relative overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
              <CardContent className="relative pt-3 pb-3">
                <p className="text-2xl font-bold">{totalDoses.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Doses</p>
              </CardContent>
            </Card>
            <Card className="relative overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
              <CardContent className="relative pt-3 pb-3">
                <p className="text-2xl font-bold">{stocks.length}</p>
                <p className="text-xs text-muted-foreground">Batches</p>
              </CardContent>
            </Card>
            {lowStockCount > 0 && (
              <Card className="border-orange-200">
                <CardContent className="pt-3 pb-3">
                  <p className="text-2xl font-bold text-orange-600">{lowStockCount}</p>
                  <p className="text-xs text-muted-foreground">Low Stock</p>
                </CardContent>
              </Card>
            )}
            {(expiredCount > 0 || nearExpiryCount > 0) && (
              <Card className="border-red-200">
                <CardContent className="pt-3 pb-3">
                  <p className="text-2xl font-bold text-destructive">{expiredCount + nearExpiryCount}</p>
                  <p className="text-xs text-muted-foreground">
                    {expiredCount > 0 ? `${expiredCount} expired` : ''}
                    {expiredCount > 0 && nearExpiryCount > 0 ? ', ' : ''}
                    {nearExpiryCount > 0 ? `${nearExpiryCount} near expiry` : ''}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Stock table */}
        <ResponsiveTable
          data={stocks}
          keyExtractor={(s) => s.id}
          isLoading={isLoading}
          emptyMessage="No vaccine stock recorded yet."
          defaultSortColumn="expiry_date"
          defaultSortDirection="asc"
          columns={[
            {
              key: 'vaccine_name',
              header: 'Vaccine',
              sortable: true,
              cell: (s) => (
                <div>
                  <p className="font-medium">{s.vaccine_name}</p>
                  <p className="text-xs text-muted-foreground">{s.batch_number}</p>
                </div>
              ),
            },
            {
              key: 'quantity_on_hand',
              header: 'Qty',
              sortable: true,
              sortType: 'number',
              cell: (s) => (
                <div className="flex items-center gap-1">
                  <span className="font-medium">{s.quantity_on_hand}</span>
                  {s.is_low_stock && <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />}
                </div>
              ),
            },
            {
              key: 'expiry_date',
              header: 'Expiry',
              sortable: true,
              sortType: 'date',
              cell: (s) => (
                <span className={`text-sm ${s.is_expired ? 'text-destructive font-medium' : s.is_near_expiry ? 'text-orange-600' : ''}`}>
                  {formatDate(s.expiry_date)}
                </span>
              ),
              hideOnMobile: true,
            },
            {
              key: 'storage_location',
              header: 'Location',
              sortable: true,
              cell: (s) => <span className="text-sm">{s.storage_location || '—'}</span>,
              hideOnMobile: true,
            },
            {
              key: 'status',
              header: 'Status',
              cell: (s) => (
                <div className="flex flex-wrap gap-1">
                  {s.is_expired && <Badge variant="destructive" className="text-xs">Expired</Badge>}
                  {s.is_near_expiry && !s.is_expired && <Badge className="bg-orange-100 text-orange-800 text-xs">Near Expiry</Badge>}
                  {s.is_low_stock && <Badge className="bg-yellow-100 text-yellow-800 text-xs">Low</Badge>}
                  {!s.is_expired && !s.is_near_expiry && !s.is_low_stock && <Badge className="bg-green-100 text-green-800 text-xs">OK</Badge>}
                </div>
              ),
            },
            {
              key: 'actions',
              header: '',
              cell: (s) => (
                <Button size="sm" variant="ghost" onClick={() => openIssueDialog(s.id)}>
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                </Button>
              ),
            },
          ]}
          mobileCard={(s: VaccineStockListItem) => (
            <Card className="p-3">
              <div className="flex justify-between items-start">
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.vaccine_name}</p>
                  <p className="text-xs text-muted-foreground">{s.batch_number}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Qty: {s.quantity_on_hand} • Exp: {formatDate(s.expiry_date)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {s.is_expired && <Badge variant="destructive" className="text-xs">Expired</Badge>}
                  {s.is_low_stock && <Badge className="bg-yellow-100 text-yellow-800 text-xs">Low</Badge>}
                  {!s.is_expired && !s.is_low_stock && <Badge className="bg-green-100 text-green-800 text-xs">OK</Badge>}
                  <Button size="sm" variant="ghost" onClick={() => openIssueDialog(s.id)}>
                    <ArrowDownToLine className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          )}
        />

        {/* Receive Stock Dialog */}
        <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>Receive Vaccine Stock</DialogTitle>
                <HelpPopover content="Record a new vaccine batch received from a supplier. Include batch and lot details for traceability." />
              </div>
            </DialogHeader>
            <div className="space-y-3 sm:space-y-4 pt-2">
              <div>
                <Label>Vaccine <span className="text-destructive">*</span></Label>
                <Select value={vaccineId} onValueChange={(v) => { setVaccineId(v); setReceiveTouched((t) => ({ ...t, vaccine: true })); }}>
                  <SelectTrigger className={receiveTouched.vaccine && !vaccineId ? 'border-destructive focus-visible:ring-destructive' : ''}>
                    <SelectValue placeholder="Select vaccine" />
                  </SelectTrigger>
                  <SelectContent>
                    {(vaccines || []).map((v) => (
                      <SelectItem key={v.id} value={v.id.toString()}>
                        {v.name} ({v.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {receiveTouched.vaccine && !vaccineId && <p className="text-xs text-destructive mt-1">Vaccine is required</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <Label>Batch Number <span className="text-destructive">*</span></Label>
                  <Input
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                    onBlur={() => setReceiveTouched((t) => ({ ...t, batchNumber: true }))}
                    placeholder="e.g. BCG-2026-001"
                    className={receiveTouched.batchNumber && !batchNumber ? 'border-destructive focus-visible:ring-destructive' : ''}
                  />
                  {receiveTouched.batchNumber && !batchNumber && <p className="text-xs text-destructive mt-1">Batch number is required</p>}
                </div>
                <div>
                  <Label>Quantity (doses) <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    onBlur={() => setReceiveTouched((t) => ({ ...t, quantity: true }))}
                    placeholder="e.g. 500"
                    className={receiveTouched.quantity && !quantity ? 'border-destructive focus-visible:ring-destructive' : ''}
                  />
                  {receiveTouched.quantity && !quantity && <p className="text-xs text-destructive mt-1">Quantity is required</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <Label>Expiry Date <span className="text-destructive">*</span></Label>
                  <Input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    onBlur={() => setReceiveTouched((t) => ({ ...t, expiryDate: true }))}
                    className={receiveTouched.expiryDate && !expiryDate ? 'border-destructive focus-visible:ring-destructive' : ''}
                  />
                  {receiveTouched.expiryDate && !expiryDate && <p className="text-xs text-destructive mt-1">Expiry date is required</p>}
                </div>
                <div>
                  <Label>Min Stock Level</Label>
                  <Input type="number" value={minStockLevel} onChange={(e) => setMinStockLevel(e.target.value)} placeholder="Alert threshold" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <Label>Received Date <span className="text-destructive">*</span></Label>
                  <Input
                    type="date"
                    value={receivedDate}
                    onChange={(e) => setReceivedDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <Label>Manufacturer</Label>
                  <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
                </div>
                <div>
                  <Label>Supplier</Label>
                  <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <Label>Storage Location</Label>
                  <Input value={storageLocation} onChange={(e) => setStorageLocation(e.target.value)} placeholder="e.g. Main Fridge" />
                </div>
                <div>
                  <Label>VVM Status</Label>
                  <Select value={vvmStatus} onValueChange={setVvmStatus}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STAGE_1">Stage 1 (Good)</SelectItem>
                      <SelectItem value="STAGE_2">Stage 2 (Use soon)</SelectItem>
                      <SelectItem value="STAGE_3">Stage 3 (Discard)</SelectItem>
                      <SelectItem value="STAGE_4">Stage 4 (Expired)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={receiveNotes} onChange={(e) => setReceiveNotes(e.target.value)} rows={2} />
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <Button variant="outline" onClick={() => setReceiveDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => receiveMutation.mutate()}
                  disabled={!vaccineId || !batchNumber || !quantity || !expiryDate || receiveMutation.isPending}
                >
                  {receiveMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Receive
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Issue/Wastage Dialog */}
        <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>Record Stock Transaction</DialogTitle>
                <HelpPopover content="Record wastage, adjustment, transfer, or expiry for this batch." />
              </div>
            </DialogHeader>
            <div className="space-y-3 sm:space-y-4 pt-2">
              <div>
                <Label>Transaction Type <span className="text-destructive">*</span></Label>
                <Select value={issueType} onValueChange={(v) => setIssueType(v as IssueTransactionType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WASTAGE">Wastage</SelectItem>
                    <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
                    <SelectItem value="TRANSFER_OUT">Transfer Out</SelectItem>
                    <SelectItem value="EXPIRED">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantity <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  value={issueQty}
                  onChange={(e) => setIssueQty(e.target.value)}
                  onBlur={() => setIssueTouched((t) => ({ ...t, qty: true }))}
                  placeholder="Number of doses"
                  className={issueTouched.qty && !issueQty ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {issueTouched.qty && !issueQty && <p className="text-xs text-destructive mt-1">Quantity is required</p>}
              </div>
              <div>
                <Label>Reason</Label>
                <Textarea value={issueReason} onChange={(e) => setIssueReason(e.target.value)} rows={2} placeholder="Reason for this transaction..." />
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <Button variant="outline" onClick={() => setIssueDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => issueMutation.mutate()}
                  disabled={!issueQty || issueMutation.isPending}
                >
                  {issueMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Submit
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
