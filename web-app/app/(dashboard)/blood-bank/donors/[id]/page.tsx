/**
 * Blood donor detail page.
 * Use by navigating to /blood-bank/donors/[id] in the web app.
 * Inputs: route param `id`.
 */
'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Droplets, Pencil, Plus, User } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useBloodDonor } from '@/lib/hooks/use-blood-bank';
import { formatDate } from '@/lib/utils/format';

export default function BloodDonorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const donorId = Number(id);
  const { data: donor, isLoading } = useBloodDonor(Number.isNaN(donorId) ? undefined : donorId);

  if (isLoading) {
    return <Skeleton className="h-80 w-full" />;
  }

  if (!donor) {
    return (
      <div className="space-y-4">
        <PageHeader title="Blood Donor" />
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Donor not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${donor.first_name} ${donor.last_name}`}
        helpContent="View blood donor profile, eligibility, and donation history fields."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push(`/blood-bank/donors/${donor.id}/edit`)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button asChild>
              <Link href={`/blood-bank/units/new?donor=${donor.id}`}>
                <Plus className="mr-2 h-4 w-4" />
                Register Unit
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" /> Donor Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Donor Number:</span> {donor.donor_number}
            </p>
            <p>
              <span className="font-medium">Name:</span> {donor.first_name} {donor.last_name}
            </p>
            <p>
              <span className="font-medium">DOB:</span> {formatDate(donor.date_of_birth)}
            </p>
            <p>
              <span className="font-medium">Gender:</span>{' '}
              {donor.gender === 'M' ? 'Male' : 'Female'}
            </p>
            <p>
              <span className="font-medium">Blood Group:</span>{' '}
              <Badge variant="outline" className="ml-1 font-bold">
                {donor.blood_group}
              </Badge>
            </p>
            <p>
              <span className="font-medium">Status:</span>{' '}
              <Badge variant={donor.is_active ? 'default' : 'secondary'} className="ml-1">
                {donor.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Droplets className="h-4 w-4" /> Donation Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Eligible to Donate:</span>{' '}
              {donor.eligible_to_donate ? 'Yes' : 'No'}
            </p>
            <p>
              <span className="font-medium">Total Donations:</span> {donor.total_donations}
            </p>
            <p>
              <span className="font-medium">Last Donation:</span>{' '}
              {donor.last_donation_date ? formatDate(donor.last_donation_date) : 'None recorded'}
            </p>
            <p>
              <span className="font-medium">Phone:</span> {donor.phone_number || 'Not provided'}
            </p>
            <p>
              <span className="font-medium">National ID:</span>{' '}
              {donor.national_id || 'Not provided'}
            </p>
            {donor.notes && (
              <p>
                <span className="font-medium">Notes:</span> {donor.notes}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
