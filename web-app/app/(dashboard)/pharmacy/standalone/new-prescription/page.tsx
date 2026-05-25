'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Pill, Plus, Trash2 } from 'lucide-react';

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
import { standalonePharmacyApi } from '@/lib/api/standalone-pharmacy';
import { pharmacyApi } from '@/lib/api/pharmacy';
import type {
  StandalonePrescriptionCreateData,
  StandalonePrescriptionItem,
} from '@/lib/types/standalone-pharmacy';
import { toast } from 'sonner';

export default function NewStandalonePrescriptionPage() {
  const router = useRouter();
  const [picker, setPicker] = useState<PickedPatient>({ mode: 'inline' });
  const [formData, setFormData] = useState({
    walkin_name: '',
    walkin_phone: '',
    walkin_national_id: '',
    walkin_gender: '' as '' | 'M' | 'F' | 'O',
    prescriber_name: '',
    prescriber_license: '',
    external_prescription_number: '',
    clinical_notes: '',
  });
  const [items, setItems] = useState<StandalonePrescriptionItem[]>([
    { drug_code: '', dosage: '', frequency: '', duration: '', quantity: 1 },
  ]);

  const { data: drugCatalog } = useQuery({
    queryKey: ['drug-catalog'],
    queryFn: () => pharmacyApi.listDrugs({ page_size: 200, is_active: true }),
  });

  const createMutation = useMutation({
    mutationFn: (data: StandalonePrescriptionCreateData) =>
      standalonePharmacyApi.createStandalonePrescription(data),
    onSuccess: () => {
      toast.success('Standalone prescription created');
      router.push('/pharmacy/prescriptions');
    },
    onError: () => toast.error('Failed to create prescription'),
  });

  const addItem = () =>
    setItems([
      ...items,
      { drug_code: '', dosage: '', frequency: '', duration: '', quantity: 1 },
    ]);
  const removeItem = (index: number) =>
    setItems(items.filter((_, i) => i !== index));
  const updateItem = (
    index: number,
    field: keyof StandalonePrescriptionItem,
    value: string | number,
  ) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = items.filter(
      (i) => i.drug_code && i.dosage && i.frequency && i.duration && i.quantity > 0,
    );
    if (validItems.length === 0) {
      toast.error('Add at least one complete drug entry');
      return;
    }

    const data: StandalonePrescriptionCreateData = {
      prescriber_name: formData.prescriber_name || undefined,
      prescriber_license: formData.prescriber_license || undefined,
      external_prescription_number:
        formData.external_prescription_number || undefined,
      clinical_notes: formData.clinical_notes || undefined,
      items: validItems,
    };

    if (picker.mode === 'walkin') {
      data.walkin_customer_id = picker.walkin.id;
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
        title="New Standalone Prescription"
        helpContent="Create a prescription without a clinical encounter — for walk-in customers or external referrals."
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
              searchWalkIn={(q) => standalonePharmacyApi.listWalkInCustomers({ search: q })}
              walkInNoun="customer"
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

        {/* Prescription Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prescription Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="prescriber_name">Prescriber Name</Label>
                <Input
                  id="prescriber_name"
                  value={formData.prescriber_name}
                  onChange={(e) =>
                    setFormData({ ...formData, prescriber_name: e.target.value })
                  }
                  placeholder="Dr. Name"
                />
              </div>
              <div>
                <Label htmlFor="prescriber_license">Prescriber License</Label>
                <Input
                  id="prescriber_license"
                  value={formData.prescriber_license}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      prescriber_license: e.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div>
              <Label htmlFor="external_prescription_number">
                External Prescription #
              </Label>
              <Input
                id="external_prescription_number"
                value={formData.external_prescription_number}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    external_prescription_number: e.target.value,
                  })
                }
                placeholder="Paper rx number, if any"
              />
            </div>
            <div>
              <Label htmlFor="clinical_notes">Clinical Notes</Label>
              <Textarea
                id="clinical_notes"
                value={formData.clinical_notes}
                onChange={(e) =>
                  setFormData({ ...formData, clinical_notes: e.target.value })
                }
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Items */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Pill className="h-4 w-4" />
              Medications
            </CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={addItem}>
              <Plus className="h-3 w-3 mr-1" /> Add Item
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
                      type="drug"
                      value={item.drug_code || ''}
                      onValueChange={(v) => updateItem(index, 'drug_code', v)}
                      options={(drugCatalog?.results ?? []).map((drug) => ({
                        code: drug.code,
                        label: drug.generic_name,
                        description: `(${drug.code})`,
                      }))}
                      placeholder="Select drug..."
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
                  <Input
                    placeholder="Dosage (e.g., 500mg)"
                    value={item.dosage}
                    onChange={(e) => updateItem(index, 'dosage', e.target.value)}
                  />
                  <Input
                    placeholder="Frequency (e.g., BD)"
                    value={item.frequency}
                    onChange={(e) =>
                      updateItem(index, 'frequency', e.target.value)
                    }
                  />
                  <Input
                    placeholder="Duration (e.g., 7 days)"
                    value={item.duration}
                    onChange={(e) =>
                      updateItem(index, 'duration', e.target.value)
                    }
                  />
                  <Input
                    type="number"
                    min="1"
                    placeholder="Quantity"
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(
                        index,
                        'quantity',
                        parseInt(e.target.value, 10) || 0,
                      )
                    }
                  />
                </div>
                <Input
                  placeholder="Instructions (optional)"
                  value={item.instructions || ''}
                  onChange={(e) =>
                    updateItem(index, 'instructions', e.target.value)
                  }
                />
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
            {createMutation.isPending ? 'Creating...' : 'Create Prescription'}
          </Button>
        </div>
      </form>
    </div>
  );
}
