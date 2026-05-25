'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ScanLine, Plus, Trash2 } from 'lucide-react';

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
import { CatalogCombobox } from '@/components/shared/catalog-combobox';
import {
  StandalonePatientPicker,
  type PickedPatient,
} from '@/components/shared/standalone-patient-picker';
import { standaloneImagingApi } from '@/lib/api/standalone-imaging';
import { imagingApi } from '@/lib/api/imaging';
import type {
  StandaloneImagingOrderCreateData,
  StandaloneImagingOrderItem,
} from '@/lib/types/standalone-imaging';
import { toast } from 'sonner';

export default function NewStandaloneImagingOrderPage() {
  const router = useRouter();
  const [picker, setPicker] = useState<PickedPatient>({ mode: 'inline' });
  const [formData, setFormData] = useState({
    walkin_name: '',
    walkin_phone: '',
    walkin_national_id: '',
    walkin_gender: '' as '' | 'M' | 'F' | 'O',
    priority: 'ROUTINE' as 'ROUTINE' | 'URGENT' | 'STAT',
    clinical_indication: '',
    relevant_clinical_history: '',
  });
  const [items, setItems] = useState<StandaloneImagingOrderItem[]>([
    { procedure_code: '', laterality: 'NA' },
  ]);

  const { data: procedureCatalog } = useQuery({
    queryKey: ['imaging-procedure-catalog'],
    queryFn: () => imagingApi.listProcedures({ page_size: 200, is_active: true }),
  });

  const createMutation = useMutation({
    mutationFn: (data: StandaloneImagingOrderCreateData) =>
      standaloneImagingApi.createStandaloneOrder(data),
    onSuccess: () => {
      toast.success('Standalone imaging order created');
      router.push('/imaging/orders');
    },
    onError: () => toast.error('Failed to create order'),
  });

  const addItem = () =>
    setItems([...items, { procedure_code: '', laterality: 'NA' }]);
  const removeItem = (index: number) =>
    setItems(items.filter((_, i) => i !== index));
  const updateItem = (
    index: number,
    field: keyof StandaloneImagingOrderItem,
    value: string,
  ) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value } as StandaloneImagingOrderItem;
    setItems(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = items.filter((i) => i.procedure_code);
    if (validItems.length === 0) {
      toast.error('Add at least one procedure');
      return;
    }
    if (!formData.clinical_indication.trim()) {
      toast.error('Clinical indication is required');
      return;
    }

    const data: StandaloneImagingOrderCreateData = {
      priority: formData.priority,
      clinical_indication: formData.clinical_indication,
      relevant_clinical_history:
        formData.relevant_clinical_history || undefined,
      items: validItems,
    };

    if (picker.mode === 'walkin') {
      data.walkin_patient_id = picker.walkin.id;
    } else if (picker.mode === 'patient') {
      data.patient_id = picker.patient.id;
    } else {
      if (!formData.walkin_name.trim()) {
        toast.error('Patient name is required');
        return;
      }
      data.walkin_name = formData.walkin_name;
      data.walkin_phone = formData.walkin_phone;
      data.walkin_national_id = formData.walkin_national_id;
      data.walkin_gender = formData.walkin_gender || undefined;
    }

    createMutation.mutate(data);
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-2xl mx-auto">
      <PageHeader
        title="New Standalone Imaging Order"
        helpContent="Create an imaging order without requiring a clinical encounter — for walk-in patients or external referrals."
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Patient Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Patient Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <StandalonePatientPicker
              value={picker}
              onChange={setPicker}
              searchWalkIn={(q) => standaloneImagingApi.listWalkInPatients({ search: q })}
              walkInNoun="patient"
            />
            {picker.mode === 'inline' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="walkin_name">Full Name *</Label>
                    <Input
                      id="walkin_name"
                      required
                      value={formData.walkin_name}
                      onChange={(e) =>
                        setFormData({ ...formData, walkin_name: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="walkin_phone">Phone</Label>
                    <Input
                      id="walkin_phone"
                      value={formData.walkin_phone}
                      onChange={(e) =>
                        setFormData({ ...formData, walkin_phone: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="walkin_national_id">National ID</Label>
                    <Input
                      id="walkin_national_id"
                      value={formData.walkin_national_id}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          walkin_national_id: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="walkin_gender">Gender</Label>
                    <Select
                      value={formData.walkin_gender}
                      onValueChange={(v) =>
                        setFormData({
                          ...formData,
                          walkin_gender: v as 'M' | 'F' | 'O',
                        })
                      }
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
              </>
            )}
          </CardContent>
        </Card>

        {/* Order Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={(v) =>
                  setFormData({
                    ...formData,
                    priority: v as 'ROUTINE' | 'URGENT' | 'STAT',
                  })
                }
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
            <div>
              <Label htmlFor="clinical_indication">
                Clinical Indication *
              </Label>
              <Textarea
                id="clinical_indication"
                required
                value={formData.clinical_indication}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    clinical_indication: e.target.value,
                  })
                }
                placeholder="Why is this imaging being requested?"
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="relevant_clinical_history">
                Relevant Clinical History
              </Label>
              <Textarea
                id="relevant_clinical_history"
                value={formData.relevant_clinical_history}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    relevant_clinical_history: e.target.value,
                  })
                }
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Procedures */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ScanLine className="h-4 w-4" />
              Procedures
            </CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={addItem}>
              <Plus className="h-3 w-3 mr-1" /> Add Procedure
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((item, index) => (
              <div
                key={index}
                className="space-y-2 p-3 rounded-lg border bg-muted/30"
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <CatalogCombobox
                      type="procedure"
                      value={item.procedure_code}
                      onValueChange={(v) => updateItem(index, 'procedure_code', v)}
                      options={(procedureCatalog?.results ?? []).map((proc) => ({
                        code: proc.code,
                        label: proc.name,
                        description: `(${proc.modality} · ${proc.code})`,
                      }))}
                      placeholder="Select procedure..."
                    />
                  </div>
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
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={item.laterality || 'NA'}
                    onValueChange={(v) => updateItem(index, 'laterality', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Laterality" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NA">N/A</SelectItem>
                      <SelectItem value="LEFT">Left</SelectItem>
                      <SelectItem value="RIGHT">Right</SelectItem>
                      <SelectItem value="BILATERAL">Bilateral</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Specific instructions"
                    value={item.specific_instructions || ''}
                    onChange={(e) =>
                      updateItem(
                        index,
                        'specific_instructions',
                        e.target.value,
                      )
                    }
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
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
