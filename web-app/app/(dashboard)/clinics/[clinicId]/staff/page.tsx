/**
 * Clinic Staff Management Page
 *
 * Manage staff assignments for the clinic, including role assignments,
 * primary staff designation, and staff availability.
 *
 * Route: /clinics/[clinicId]/staff
 */
'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Users,
  UserPlus,
  User,
  Crown,
  Mail,
  MoreHorizontal,
  Trash2,
  Edit,
  Shield,
  AlertCircle,
  RefreshCw,
  Search,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useClinic,
  useClinicStaff,
  useAssignStaff,
  useRemoveStaff,
} from '@/lib/hooks/use-clinics';
import { ClinicNavigation } from '@/components/clinics/clinic-navigation';
import { toast } from '@/lib/hooks/use-toast';
import type { ClinicStaff, ClinicStaffRole, ClinicStaffCreateData } from '@/lib/types/clinic';
import { cn } from '@/lib/utils/cn';

const ROLE_CONFIG: Record<ClinicStaffRole, { label: string; color: string; icon: typeof User }> = {
  LEAD: {
    label: 'Clinic Lead/In-Charge',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    icon: Crown,
  },
  DOCTOR: {
    label: 'Doctor/Clinical Officer',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    icon: User,
  },
  NURSE: {
    label: 'Nurse',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    icon: User,
  },
  COUNSELOR: {
    label: 'Counselor',
    color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
    icon: User,
  },
  NUTRITIONIST: {
    label: 'Nutritionist',
    color: 'bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-400',
    icon: User,
  },
  CLERK: {
    label: 'Clerk/Receptionist',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    icon: User,
  },
  OTHER: {
    label: 'Other',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    icon: User,
  },
};

function formatDate(dateString: string | null): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ClinicStaffPage() {
  const params = useParams();
  const clinicId = Number(params.clinicId);

  // UI State
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [removeStaffId, setRemoveStaffId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [newStaffData, setNewStaffData] = useState<Partial<ClinicStaffCreateData>>({
    role: 'DOCTOR',
    is_primary: false,
  });

  // Fetch data
  const { data: clinic, isLoading: clinicLoading } = useClinic(clinicId);
  const { data: staff, isLoading: staffLoading, refetch: refetchStaff } = useClinicStaff(clinicId);

  // Mutations
  const { mutateAsync: assignStaff, isPending: assigningStaff } = useAssignStaff();
  const { mutateAsync: removeStaff, isPending: removingStaff } = useRemoveStaff();

  // Filter staff by search query
  const filteredStaff = (staff ?? []).filter(
    (s) =>
      s.user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.user_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.role_display.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Count staff by role
  const staffCounts = {
    total: staff?.length ?? 0,
    clinicians: staff?.filter((s) => s.role === 'DOCTOR' || s.role === 'LEAD').length ?? 0,
    nurses: staff?.filter((s) => s.role === 'NURSE').length ?? 0,
    support: staff?.filter((s) => s.role === 'CLERK' || s.role === 'OTHER' || s.role === 'COUNSELOR' || s.role === 'NUTRITIONIST').length ?? 0,
  };

  const handleAssignStaff = useCallback(async () => {
    if (!newStaffData.user_id || !newStaffData.role) {
      toast({
        title: 'Error',
        description: 'Please select a staff member and role.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await assignStaff({
        clinicId,
        data: newStaffData as ClinicStaffCreateData,
      });
      toast({
        title: 'Staff Assigned',
        description: 'Staff member has been assigned to this clinic.',
      });
      setAddStaffOpen(false);
      setNewStaffData({ role: 'DOCTOR', is_primary: false });
      refetchStaff();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to assign staff. They may already be assigned.',
        variant: 'destructive',
      });
    }
  }, [clinicId, newStaffData, assignStaff, refetchStaff]);

  const handleRemoveStaff = useCallback(async () => {
    if (!removeStaffId) return;

    try {
      await removeStaff({ clinicId, userId: removeStaffId });
      toast({
        title: 'Staff Removed',
        description: 'Staff member has been removed from this clinic.',
      });
      setRemoveStaffId(null);
      refetchStaff();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove staff member.',
        variant: 'destructive',
      });
    }
  }, [clinicId, removeStaffId, removeStaff, refetchStaff]);

  if (clinicLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Clinic not found</h3>
        <Button asChild>
          <Link href="/clinics">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Clinics
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/clinics/${clinicId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              {clinic.name} - Staff Management
            </h1>
            <p className="text-muted-foreground">
              Manage staff assignments and roles for this clinic
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 items-stretch sm:flex-row sm:flex-wrap sm:items-center">
          <Button variant="outline" size="sm" onClick={() => refetchStaff()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={addStaffOpen} onOpenChange={setAddStaffOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Assign Staff
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign Staff to Clinic</DialogTitle>
                <DialogDescription>
                  Assign a staff member to work in {clinic.name}.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="user_id">Staff Member</Label>
                  <Input
                    id="user_id"
                    type="number"
                    placeholder="Enter user ID"
                    value={newStaffData.user_id || ''}
                    onChange={(e) =>
                      setNewStaffData((prev) => ({ ...prev, user_id: Number(e.target.value) }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the user ID of the staff member to assign
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={newStaffData.role}
                    onValueChange={(v) =>
                      setNewStaffData((prev) => ({ ...prev, role: v as ClinicStaffRole }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LEAD">Clinic Lead/In-Charge</SelectItem>
                      <SelectItem value="DOCTOR">Doctor/Clinical Officer</SelectItem>
                      <SelectItem value="NURSE">Nurse</SelectItem>
                      <SelectItem value="COUNSELOR">Counselor</SelectItem>
                      <SelectItem value="NUTRITIONIST">Nutritionist</SelectItem>
                      <SelectItem value="CLERK">Clerk/Receptionist</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="is_primary">Primary Staff</Label>
                    <p className="text-xs text-muted-foreground">
                      Primary staff appear first in assignments
                    </p>
                  </div>
                  <Switch
                    id="is_primary"
                    checked={newStaffData.is_primary}
                    onCheckedChange={(checked) =>
                      setNewStaffData((prev) => ({ ...prev, is_primary: checked }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Input
                    id="notes"
                    placeholder="Optional notes..."
                    value={newStaffData.notes || ''}
                    onChange={(e) =>
                      setNewStaffData((prev) => ({ ...prev, notes: e.target.value }))
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddStaffOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAssignStaff} disabled={assigningStaff}>
                  {assigningStaff ? 'Assigning...' : 'Assign Staff'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Navigation */}
      <ClinicNavigation clinicId={clinicId} />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Staff</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{staffCounts.total}</div>
            <p className="text-xs text-muted-foreground">Assigned to this clinic</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clinicians</CardTitle>
            <Shield className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{staffCounts.clinicians}</div>
            <p className="text-xs text-muted-foreground">Doctors & leads</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Nurses</CardTitle>
            <User className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{staffCounts.nurses}</div>
            <p className="text-xs text-muted-foreground">Nursing staff</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Support</CardTitle>
            <User className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{staffCounts.support}</div>
            <p className="text-xs text-muted-foreground">Administrative staff</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search staff by name, email, or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Staff Table */}
      <Card>
        <CardHeader>
          <CardTitle>Assigned Staff</CardTitle>
          <CardDescription>
            Staff members currently assigned to {clinic.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {staffLoading ? (
            <Skeleton className="h-96" />
          ) : filteredStaff.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No staff assigned</h3>
              <p className="text-muted-foreground text-center mb-4">
                {searchQuery
                  ? 'No staff members match your search.'
                  : 'Assign staff members to start managing this clinic.'}
              </p>
              {!searchQuery && (
                <Button onClick={() => setAddStaffOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Assign Staff
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStaff.map((member) => {
                    const roleConfig = ROLE_CONFIG[member.role];
                    const RoleIcon = roleConfig.icon;

                    return (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarFallback>
                                {member.user_name
                                  .split(' ')
                                  .map((n) => n[0])
                                  .join('')
                                  .toUpperCase()
                                  .slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{member.user_name}</p>
                                {member.is_primary && (
                                  <Crown className="h-4 w-4 text-yellow-500" />
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {member.user_email}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('font-normal', roleConfig.color)}>
                            <RoleIcon className="h-3 w-3 mr-1" />
                            {roleConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {member.is_active ? (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-gray-500 border-gray-500">
                              <XCircle className="h-3 w-3 mr-1" />
                              Inactive
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{formatDate(member.start_date)}</TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {member.notes || '--'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit Assignment
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => setRemoveStaffId(member.user)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remove from Clinic
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remove Staff Confirmation */}
      <AlertDialog open={!!removeStaffId} onOpenChange={() => setRemoveStaffId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Staff Member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the staff member from this clinic. They will no longer be able to
              access clinic-specific features. This action can be undone by reassigning them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveStaff}
              disabled={removingStaff}
              className="bg-red-600 hover:bg-red-700"
            >
              {removingStaff ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
