'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { HelpPopover } from '@/components/shared/help-popover';
import { inventoryApi } from '@/lib/api/inventory';
import { useToast } from '@/lib/hooks/use-toast';
import { getApiErrorMessage } from '@/lib/api/client';
import type { PaymentTerm, PaymentTermCreateData } from '@/lib/types/inventory';

export function BillingSettingsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<PaymentTerm | null>(null);
  const [formData, setFormData] = useState<PaymentTermCreateData>({
    code: '',
    name: '',
    days: 30,
  });

  const { data: paymentTerms = [], isLoading } = useQuery({
    queryKey: ['payment-terms'],
    queryFn: () => inventoryApi.listPaymentTerms(),
  });

  const createMutation = useMutation({
    mutationFn: (data: PaymentTermCreateData) => inventoryApi.createPaymentTerm(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-terms'] });
      toast({ variant: 'success', title: 'Payment term created' });
      closeDialog();
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Failed to create', description: getApiErrorMessage(err) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<PaymentTermCreateData> }) =>
      inventoryApi.updatePaymentTerm(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-terms'] });
      toast({ variant: 'success', title: 'Payment term updated' });
      closeDialog();
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Failed to update', description: getApiErrorMessage(err) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => inventoryApi.deletePaymentTerm(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-terms'] });
      toast({ variant: 'success', title: 'Payment term deleted' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Failed to delete', description: getApiErrorMessage(err) });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      inventoryApi.updatePaymentTerm(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-terms'] });
    },
  });

  function openCreateDialog() {
    setEditingTerm(null);
    setFormData({ code: '', name: '', days: 30 });
    setDialogOpen(true);
  }

  function openEditDialog(term: PaymentTerm) {
    setEditingTerm(term);
    setFormData({ code: term.code, name: term.name, days: term.days });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingTerm(null);
  }

  function handleSubmit() {
    if (!formData.code || !formData.name) return;
    if (editingTerm) {
      updateMutation.mutate({ id: editingTerm.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base sm:text-lg">Payment Terms</CardTitle>
            <HelpPopover content="Configure payment term options that appear in supplier forms. Each term defines how many days until payment is due." />
          </div>
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Term
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : paymentTerms.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground mb-3">
              No payment terms configured yet. Add common terms like &quot;Net 30&quot; or &quot;Cash on Delivery&quot;.
            </p>
            <Button variant="outline" size="sm" onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add First Term
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {paymentTerms.map((term) => (
              <div
                key={term.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{term.name}</p>
                      <Badge variant="outline" className="text-xs font-mono">
                        {term.code}
                      </Badge>
                      {!term.is_active && (
                        <Badge variant="secondary" className="text-xs">Inactive</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {term.days === 0 ? 'Due immediately' : `Due in ${term.days} days`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={term.is_active}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ id: term.id, is_active: checked })
                    }
                    aria-label={`Toggle ${term.name}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEditDialog(term)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(term.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTerm ? 'Edit Payment Term' : 'Add Payment Term'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="term-code">Code</Label>
              <Input
                id="term-code"
                placeholder="e.g. NET30"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="term-name">Display Name</Label>
              <Input
                id="term-name"
                placeholder="e.g. Net 30 Days"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="term-days">Days Until Due</Label>
              <Input
                id="term-days"
                type="number"
                min={0}
                value={formData.days}
                onChange={(e) => setFormData({ ...formData, days: parseInt(e.target.value) || 0 })}
              />
              <p className="text-xs text-muted-foreground">
                0 = payment due immediately (Cash on Delivery)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSaving || !formData.code || !formData.name}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingTerm ? 'Save Changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
