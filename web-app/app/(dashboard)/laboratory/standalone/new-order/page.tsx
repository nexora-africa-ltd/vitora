'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { FlaskConical, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { PageHeader } from '@/components/shared/page-header';
import { standaloneLisApi } from '@/lib/api/standalone-lis';
import { laboratoryApi } from '@/lib/api/laboratory';
import type { StandaloneOrderCreateData, StandaloneOrderItem } from '@/lib/types/standalone-lis';
import { toast } from 'sonner';

export default function NewStandaloneOrderPage() {
  const router = useRouter();
  const [patientMode, setPatientMode] = useState<'inline' | 'existing'>('inline');
  const [formData, setFormData] = useState({
    walkin_name: '',
    walkin_phone: '',
    walkin_national_id: '',
    walkin_gender: '' as '' | 'M' | 'F' | 'O',
    priority: 'ROUTINE' as 'ROUTINE' | 'URGENT' | 'STAT',
    clinical_notes: '',
  });
  const [items, setItems] = useState<StandaloneOrderItem[]>([{ test_code: '' }]);

  const { data: testCatalog } = useQuery({
    queryKey: ['test-catalog'],
    queryFn: () => laboratoryApi.listTests({ page_size: 200 }),
  });

  const createMutation = useMutation({
    mutationFn: (data: StandaloneOrderCreateData) => standaloneLisApi.createStandaloneOrder(data),
    onSuccess: (order) => {
      toast.success(`Order ${order.order_number} created`);
      router.push('/laboratory/orders');
    },
    onError: () => toast.error('Failed to create order'),
  });

  const addItem = () => setItems([...items, { test_code: '' }]);
  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));
  const updateItem = (index: number, code: string) => {
    const updated = [...items];
    updated[index] = { test_code: code };
    setItems(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = items.filter((i) => i.test_code);
    if (validItems.length === 0) {
      toast.error('Add at least one test');
      return;
    }

    const data: StandaloneOrderCreateData = {
      walkin_name: formData.walkin_name,
      walkin_phone: formData.walkin_phone,
      walkin_national_id: formData.walkin_national_id,
      walkin_gender: formData.walkin_gender || undefined,
      priority: formData.priority,
      clinical_notes: formData.clinical_notes,
      items: validItems,
    };

    createMutation.mutate(data);
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-2xl">
      <PageHeader
        title="New Standalone Order"
        helpContent="Create a lab order without requiring a clinical encounter. For walk-in patients, external referrals, or standalone lab operations."
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Patient Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Patient Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="walkin_name">Full Name *</Label>
                <Input
                  id="walkin_name"
                  required
                  value={formData.walkin_name}
                  onChange={(e) => setFormData({ ...formData, walkin_name: e.target.value })}
                  placeholder="Patient name"
                />
              </div>
              <div>
                <Label htmlFor="walkin_phone">Phone</Label>
                <Input
                  id="walkin_phone"
                  value={formData.walkin_phone}
                  onChange={(e) => setFormData({ ...formData, walkin_phone: e.target.value })}
                  placeholder="07XX XXX XXX"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="walkin_national_id">National ID</Label>
                <Input
                  id="walkin_national_id"
                  value={formData.walkin_national_id}
                  onChange={(e) => setFormData({ ...formData, walkin_national_id: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="walkin_gender">Gender</Label>
                <Select
                  value={formData.walkin_gender}
                  onValueChange={(v) => setFormData({ ...formData, walkin_gender: v as 'M' | 'F' | 'O' })}
                >
                  <SelectTrigger id="walkin_gender">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Male</SelectItem>
                    <SelectItem value="F">Female</SelectItem>
                    <SelectItem value="O">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Order Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(v) => setFormData({ ...formData, priority: v as 'ROUTINE' | 'URGENT' | 'STAT' })}
                >
                  <SelectTrigger id="priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ROUTINE">Routine</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                    <SelectItem value="STAT">STAT (Immediate)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="clinical_notes">Clinical Notes</Label>
              <Textarea
                id="clinical_notes"
                value={formData.clinical_notes}
                onChange={(e) => setFormData({ ...formData, clinical_notes: e.target.value })}
                placeholder="Clinical context, reason for tests..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Tests */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="h-4 w-4" />
              Tests
            </CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={addItem}>
              <Plus className="h-3 w-3 mr-1" /> Add Test
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <Select
                  value={item.test_code}
                  onValueChange={(v) => updateItem(index, v)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select test..." />
                  </SelectTrigger>
                  <SelectContent>
                    {testCatalog?.results?.map((test) => (
                      <SelectItem key={test.code} value={test.code}>
                        {test.name} ({test.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {items.length > 1 && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    onClick={() => removeItem(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create Order'}
          </Button>
        </div>
      </form>
    </div>
  );
}
