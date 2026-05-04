'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Save, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { PatientSearchInput } from '@/components/patients/patient-search-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useCreateBloodDonor } from '@/lib/hooks/use-blood-bank';
import { getApiErrorMessage } from '@/lib/api/client';
import type { BloodDonorCreateData, BloodGroup } from '@/lib/types/blood-bank';

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function NewBloodDonorPage() {
  const router = useRouter();
  const createMutation = useCreateBloodDonor();

  const [patientId, setPatientId] = useState<number | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>('O+');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async () => {
    setError('');

    if (!firstName.trim() || !lastName.trim()) {
      setError('First name and last name are required');
      return;
    }
    if (!dateOfBirth) {
      setError('Date of birth is required');
      return;
    }

    const data: BloodDonorCreateData = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      date_of_birth: dateOfBirth,
      gender,
      blood_group: bloodGroup,
    };
    if (patientId) data.patient = patientId;
    if (phoneNumber.trim()) data.phone_number = phoneNumber.trim();
    if (nationalId.trim()) data.national_id = nationalId.trim();
    if (notes.trim()) data.notes = notes.trim();

    try {
      const donor = await createMutation.mutateAsync(data);
      toast.success('Blood donor registered');
      router.push(`/blood-bank/donors`);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }, [firstName, lastName, dateOfBirth, gender, bloodGroup, patientId, phoneNumber, nationalId, notes, createMutation, router]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Register Blood Donor"
        helpContent="Register a new blood donor. Link to an existing patient record if available."
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
                <Input
                  id="first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                />
              </div>
              <div>
                <Label htmlFor="last-name">Last Name *</Label>
                <Input
                  id="last-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="dob">Date of Birth *</Label>
                <Input
                  id="dob"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <Label>Gender *</Label>
                <Select value={gender} onValueChange={(v) => setGender(v as 'M' | 'F')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Contact &amp; Linkage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Link to Patient (optional)</Label>
              <PatientSearchInput
                value={patientId}
                onChange={setPatientId}
                placeholder="Search patient by name or MRN..."
              />
            </div>

            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="e.g., 0712345678"
              />
            </div>

            <div>
              <Label htmlFor="national-id">National ID</Label>
              <Input
                id="national-id"
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                placeholder="ID number"
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any relevant notes about the donor..."
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
          {createMutation.isPending ? 'Saving...' : 'Register Donor'}
        </Button>
      </div>
    </div>
  );
}
