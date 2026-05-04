'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Save, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useCreateBloodUnit, useBloodDonors } from '@/lib/hooks/use-blood-bank';
import { getApiErrorMessage } from '@/lib/api/client';
import type { BloodUnitCreateData, BloodGroup, BloodComponent } from '@/lib/types/blood-bank';

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const COMPONENTS: { value: BloodComponent; label: string }[] = [
  { value: 'WHOLE_BLOOD', label: 'Whole Blood' },
  { value: 'PACKED_RBC', label: 'Packed RBCs' },
  { value: 'PLATELETS', label: 'Platelets' },
  { value: 'FFP', label: 'Fresh Frozen Plasma' },
  { value: 'CRYOPRECIPITATE', label: 'Cryoprecipitate' },
];

export default function NewBloodUnitPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createMutation = useCreateBloodUnit();

  const donorParam = searchParams.get('donor');

  const [donorId, setDonorId] = useState<string>(donorParam || '');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>('O+');
  const [component, setComponent] = useState<BloodComponent>('WHOLE_BLOOD');
  const [collectionDate, setCollectionDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiryDate, setExpiryDate] = useState('');
  const [volumeMl, setVolumeMl] = useState('450');
  const [storageLocation, setStorageLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [donorSearch, setDonorSearch] = useState('');
  const [error, setError] = useState('');

  // Fetch donors for dropdown
  const { data: donorsData } = useBloodDonors({ search: donorSearch, page_size: 20 });

  const handleSubmit = useCallback(async () => {
    setError('');

    if (!donorId) {
      setError('Donor is required');
      return;
    }
    if (!expiryDate) {
      setError('Expiry date is required');
      return;
    }

    const data: BloodUnitCreateData = {
      donor: Number(donorId),
      blood_group: bloodGroup,
      component,
      expiry_date: expiryDate,
    };
    if (collectionDate) data.collection_date = collectionDate;
    if (volumeMl) data.volume_ml = Number(volumeMl);
    if (storageLocation.trim()) data.storage_location = storageLocation.trim();
    if (notes.trim()) data.notes = notes.trim();

    try {
      await createMutation.mutateAsync(data);
      toast.success('Blood unit registered');
      router.push('/blood-bank/units');
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }, [donorId, bloodGroup, component, collectionDate, expiryDate, volumeMl, storageLocation, notes, createMutation, router]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Register Blood Unit"
        helpContent="Register a new blood unit collected from a donor. The unit will go through testing before becoming available."
      />

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Unit Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Donor *</Label>
              <Select value={donorId} onValueChange={setDonorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select donor..." />
                </SelectTrigger>
                <SelectContent>
                  {donorsData?.results?.map((donor) => (
                    <SelectItem key={donor.id} value={String(donor.id)}>
                      {donor.donor_number} — {donor.first_name} {donor.last_name} ({donor.blood_group})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Blood Group *</Label>
                <Select value={bloodGroup} onValueChange={(v) => setBloodGroup(v as BloodGroup)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BLOOD_GROUPS.map((bg) => (
                      <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Component *</Label>
                <Select value={component} onValueChange={(v) => setComponent(v as BloodComponent)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPONENTS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="collection-date">Collection Date</Label>
                <Input
                  id="collection-date"
                  type="date"
                  value={collectionDate}
                  onChange={(e) => setCollectionDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <Label htmlFor="expiry-date">Expiry Date *</Label>
                <Input
                  id="expiry-date"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Storage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="volume">Volume (ml)</Label>
              <Input
                id="volume"
                type="number"
                value={volumeMl}
                onChange={(e) => setVolumeMl(e.target.value)}
                placeholder="450"
                min="0"
              />
            </div>

            <div>
              <Label htmlFor="storage-location">Storage Location</Label>
              <Input
                id="storage-location"
                value={storageLocation}
                onChange={(e) => setStorageLocation(e.target.value)}
                placeholder="e.g., Fridge A, Shelf 3"
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any relevant notes..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => router.back()}>
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={createMutation.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {createMutation.isPending ? 'Saving...' : 'Register Unit'}
        </Button>
      </div>
    </div>
  );
}
