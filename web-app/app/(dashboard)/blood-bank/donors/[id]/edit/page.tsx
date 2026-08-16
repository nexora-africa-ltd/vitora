/**
 * Blood donor edit page.
 * Use by navigating to /blood-bank/donors/[id]/edit in the web app.
 * Inputs: route param `id`.
 */
'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Save, X } from 'lucide-react';
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
import { useBloodDonor, useUpdateBloodDonor } from '@/lib/hooks/use-blood-bank';
import { getApiErrorMessage } from '@/lib/api/client';
import type { BloodDonorCreateData, BloodGroup } from '@/lib/types/blood-bank';

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function EditBloodDonorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const donorId = Number(id);
  const { data: donor, isLoading } = useBloodDonor(Number.isNaN(donorId) ? undefined : donorId);
  const updateMutation = useUpdateBloodDonor();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>('O+');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!donor) return;
    setFirstName(donor.first_name || '');
    setLastName(donor.last_name || '');
    setDateOfBirth(donor.date_of_birth || '');
    setGender(donor.gender || 'M');
    setBloodGroup(donor.blood_group || 'O+');
    setPhoneNumber(donor.phone_number || '');
    setNationalId(donor.national_id || '');
    setNotes(donor.notes || '');
  }, [donor]);

  const handleSubmit = useCallback(async () => {
    if (!donor) return;
    setError('');

    if (!firstName.trim() || !lastName.trim()) {
      setError('First name and last name are required');
      return;
    }
    if (!dateOfBirth) {
      setError('Date of birth is required');
      return;
    }

    const data: Partial<BloodDonorCreateData> = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      date_of_birth: dateOfBirth,
      gender,
      blood_group: bloodGroup,
      phone_number: phoneNumber.trim(),
      national_id: nationalId.trim(),
      notes: notes.trim(),
    };

    try {
      await updateMutation.mutateAsync({ id: donor.id, data });
      toast.success('Blood donor updated');
      router.push(`/blood-bank/donors/${donor.id}`);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }, [donor, firstName, lastName, dateOfBirth, gender, bloodGroup, phoneNumber, nationalId, notes, updateMutation, router]);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading donor...</div>;
  }

  if (!donor) {
    return <div className="text-sm text-muted-foreground">Donor not found.</div>;
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title={`Edit ${donor.first_name} ${donor.last_name}`}
        helpContent="Update blood donor profile details."
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
            <CardTitle className="text-base sm:text-lg">Donor Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="first-name">First Name *</Label>
                <Input id="first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="last-name">Last Name *</Label>
                <Input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="dob">Date of Birth *</Label>
                <Input id="dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
              </div>
              <div>
                <Label>Gender *</Label>
                <Select value={gender} onValueChange={(v) => setGender(v as 'M' | 'F')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Male</SelectItem>
                    <SelectItem value="F">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Blood Group *</Label>
              <Select value={bloodGroup} onValueChange={(v) => setBloodGroup(v as BloodGroup)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BLOOD_GROUPS.map((bg) => (
                    <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="national-id">National ID</Label>
              <Input id="national-id" value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => router.push(`/blood-bank/donors/${donor.id}`)}>
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
