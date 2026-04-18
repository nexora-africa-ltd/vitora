/**
 * Join Organization Page
 * Allows authenticated users to request to join an organization they're not a member of.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Search,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
} from '@/components/ui/dialog';
import { useToast } from '@/lib/hooks/use-toast';
import { useAuth } from '@/lib/auth/context';
import { organizationsApi } from '@/lib/api/organizations';
import { rolesApi } from '@/lib/api/rbac';
import { joinRequestsApi } from '@/lib/api/join-requests';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrganizationListItem } from '@/lib/types/organization';

export default function JoinOrganizationPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<OrganizationListItem | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: orgsData, isLoading: isLoadingOrgs } = useQuery({
    queryKey: ['organizations-list', search],
    queryFn: () => organizationsApi.list({ search: search || undefined, page_size: 50 }),
    staleTime: 30 * 1000,
  });

  const { data: rolesData } = useQuery({
    queryKey: ['roles-list'],
    queryFn: () => rolesApi.list({ page_size: 100 }),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch user's existing join requests
  const { data: myRequests } = useQuery({
    queryKey: ['my-join-requests'],
    queryFn: () => joinRequestsApi.list({ page_size: 100 }),
  });

  const memberships = user?.memberships ?? [];
  const memberOrgIds = new Set(memberships.map(m => m.organization_id));
  const pendingRequestOrgIds = new Set(
    (myRequests?.results ?? [])
      .filter(r => r.status === 'PENDING')
      .map(r => r.organization)
  );

  // Filter out orgs user is already a member of
  const organizations = (orgsData?.results ?? []).filter(
    org => !memberOrgIds.has(org.id)
  );

  const handleSubmit = async () => {
    if (!selectedOrg) return;
    setIsSubmitting(true);
    try {
      await joinRequestsApi.create({
        organization: selectedOrg.id,
        requested_role: selectedRole ? Number(selectedRole) : undefined,
        message: message || undefined,
      });
      toast({
        title: 'Request submitted',
        description: `Your request to join ${selectedOrg.name} has been submitted for review.`,
      });
      await queryClient.invalidateQueries({ queryKey: ['my-join-requests'] });
      setSelectedOrg(null);
      setSelectedRole('');
      setMessage('');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to submit',
        description: error instanceof Error ? error.message : 'Could not submit join request',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Join Organization"
        helpContent="Browse organizations and request to join. An administrator will review your request and assign you a role."
      />

      {/* My pending requests */}
      {myRequests && myRequests.results.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">My Requests</CardTitle>
            <CardDescription>Your recent join requests and their status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {myRequests.results.map((req) => (
                <div key={req.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{req.organization_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(req.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <Badge
                    variant={
                      req.status === 'PENDING' ? 'default' :
                      req.status === 'APPROVED' ? 'secondary' :
                      req.status === 'REJECTED' ? 'destructive' : 'outline'
                    }
                    className="gap-1 shrink-0"
                  >
                    {req.status === 'PENDING' && <Clock className="h-3 w-3" />}
                    {req.status === 'APPROVED' && <CheckCircle2 className="h-3 w-3" />}
                    {req.status === 'REJECTED' && <XCircle className="h-3 w-3" />}
                    {req.status === 'CANCELLED' && <AlertCircle className="h-3 w-3" />}
                    {req.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search organizations */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Available Organizations</CardTitle>
          <CardDescription>Organizations you can request to join</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search organizations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoadingOrgs ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading organizations…</p>
          ) : organizations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {search ? 'No organizations found matching your search.' : 'No organizations available to join.'}
            </p>
          ) : (
            <div className="space-y-2">
              {organizations.map((org) => {
                const hasPendingRequest = pendingRequestOrgIds.has(org.id);
                return (
                  <div
                    key={org.id}
                    className="flex items-center justify-between py-3 px-4 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{org.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {org.subscription_tier}
                        </p>
                      </div>
                    </div>
                    {hasPendingRequest ? (
                      <Badge variant="outline" className="gap-1 shrink-0">
                        <Clock className="h-3 w-3" />
                        Pending
                      </Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedOrg(org)}
                      >
                        <Send className="h-3.5 w-3.5 mr-1" />
                        Request
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Join request dialog */}
      <Dialog open={!!selectedOrg} onOpenChange={() => { setSelectedOrg(null); setSelectedRole(''); setMessage(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request to Join {selectedOrg?.name}</DialogTitle>
            <DialogDescription>
              Submit a request to join this organization. An administrator will review your request and assign you a role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="join-role">Preferred Role (optional)</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger id="join-role">
                  <SelectValue placeholder="Select a role (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {rolesData?.results?.map((role) => (
                    <SelectItem key={role.id} value={String(role.id)}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="join-message">Message (optional)</Label>
              <Textarea
                id="join-message"
                placeholder="Tell the admins why you'd like to join…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground text-right">{message.length}/1000</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSelectedOrg(null); setSelectedRole(''); setMessage(''); }}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Submitting…' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
