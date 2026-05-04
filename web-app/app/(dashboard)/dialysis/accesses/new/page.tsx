'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { useCreateVascularAccess } from '@/lib/hooks/use-dialysis';
import { getApiErrorMessage } from '@/lib/api/client';
import type { VascularAccessCreateData } from '@/lib/types/dialysis';

export default function NewVascularAccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createMutation = useCreateVascularAccess();

  const patientParam = searchParams.get('patient');

  const [patientId, setPatientId] = useState<number | null>(
    patientParam ? Number(patientParam) : null
  );
  const [accessType, setAccessType] = useState<string>('AVF');
  const [site, setSite] = useState('');
  const [placedDate, setPlacedDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async () => {
    setError('');

    if (!patientId) {
      setError('Patient is required');
      return;
    }
    if (!site.trim()) {
      setError('Access site is required');
      return;
    }
    if (!placedDate) {
      setError('Placed date is required');
      return;
    }

    const data: VascularAccessCreateData = {
      patient: patientId,
      access_type: accessType as VascularAccessCreateData['access_type'],
      site: site.trim(),
      placed_date: placedDate,
    };
    if (notes.trim()) data.notes = notes.trim();

    try {
      await createMutation.mutateAsync(data);
      toast.success('Vascular access recorded');
      router.push('/dialysis/accesses');
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }, [patientId, accessType, site, placedDate, notes, createMutation, router]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="New Vascular Access"
        helpContent="Record a new vascular access for dialysis. Track the type, site, and placement date for ongoing monitoring."
      />

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Access Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Patient *</Label>
            <PatientSearchInput
              value={patientId}
              onChange={setPatientId}
              placeholder="Search by name or MRN..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Access Type *</Label>
              <Select value={accessType} onValueChange={setAccessType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AVF">AV Fistula (AVF)</SelectItem>
                  <SelectItem value="AVG">AV Graft (AVG)</SelectItem>
                  <SelectItem value="CVC_TEMPORARY">Temporary CVC</SelectItem>
                  <SelectItem value="CVC_TUNNELED">Tunneled CVC</SelectItem>
                  <SelectItem value="PD_CATHETER">PD Catheter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="placed-date">Placed Date *</Label>
              <Input
                id="placed-date"
                type="date"
                value={placedDate}
                onChange={(e) => setPlacedDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="site">Site / Location *</Label>
            <Input
              id="site"
              value={site}
              onChange={(e) => setSite(e.target.value)}
              placeholder="e.g., Left forearm, Right internal jugular"
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Procedure notes, maturation status, complications..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end max-w-2xl">
        <Button variant="outline" onClick={() => router.back()}>
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={createMutation.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {createMutation.isPending ? 'Saving...' : 'Record Access'}
        </Button>
      </div>
    </div>
  );
}
