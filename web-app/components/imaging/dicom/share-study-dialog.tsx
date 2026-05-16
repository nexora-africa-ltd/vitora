/**
 * Share Study Dialog
 * Phase E: Create & manage study share links with PIN/expiry/download options.
 */
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { imagingApi } from '@/lib/api/imaging';
import { CreateShareLinkData, StudyShareLink } from '@/lib/types/imaging';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HelpPopover } from '@/components/shared/help-popover';
import { Copy, ExternalLink, Trash2, Link2, Clock, Eye, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils/format';

interface ShareStudyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studyUid: string;
  studyDescription?: string;
}

const PURPOSE_OPTIONS = [
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'PATIENT_COPY', label: 'Patient Copy' },
  { value: 'RESEARCH', label: 'Research' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'OTHER', label: 'Other' },
] as const;

export function ShareStudyDialog({
  open,
  onOpenChange,
  studyUid,
  studyDescription,
}: ShareStudyDialogProps) {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Form state
  const [purpose, setPurpose] = useState<CreateShareLinkData['purpose']>('REFERRAL');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [pin, setPin] = useState('');
  const [expiresInHours, setExpiresInHours] = useState(168); // 7 days default
  const [maxViews, setMaxViews] = useState(0); // unlimited
  const [allowDownload, setAllowDownload] = useState(true);

  // Fetch existing links
  const { data: links = [], isLoading } = useQuery({
    queryKey: ['study-share-links', studyUid],
    queryFn: () => imagingApi.listShareLinks(studyUid),
    enabled: open,
  });

  // Create link mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateShareLinkData) =>
      imagingApi.createShareLink(studyUid, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['study-share-links', studyUid] });
      setShowCreateForm(false);
      resetForm();
      toast.success('Share link created');
    },
    onError: () => {
      toast.error('Failed to create share link');
    },
  });

  // Revoke mutation
  const revokeMutation = useMutation({
    mutationFn: (linkId: number) =>
      imagingApi.revokeShareLink(studyUid, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['study-share-links', studyUid] });
      toast.success('Share link revoked');
    },
    onError: () => {
      toast.error('Failed to revoke share link');
    },
  });

  const resetForm = () => {
    setPurpose('REFERRAL');
    setRecipientName('');
    setRecipientEmail('');
    setPin('');
    setExpiresInHours(168);
    setMaxViews(0);
    setAllowDownload(true);
  };

  const handleCreate = () => {
    const data: CreateShareLinkData = {
      purpose,
      allow_download: allowDownload,
      expires_in_hours: expiresInHours,
    };
    if (recipientName) data.recipient_name = recipientName;
    if (recipientEmail) data.recipient_email = recipientEmail;
    if (pin) data.pin = pin;
    if (maxViews > 0) data.max_views = maxViews;
    createMutation.mutate(data);
  };

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard');
  };

  const activeLinks = links.filter((l) => !l.revoked_at);
  const revokedLinks = links.filter((l) => l.revoked_at);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Share Study</DialogTitle>
            <HelpPopover content="Create secure share links with optional PIN protection, expiry, and view limits. Recipients can view the study without logging in." />
          </div>
          <DialogDescription className="sr-only">
            Create and manage share links for this DICOM study.
          </DialogDescription>
          {studyDescription && (
            <p className="text-sm text-muted-foreground truncate">{studyDescription}</p>
          )}
        </DialogHeader>

        {/* Active links */}
        {activeLinks.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Active Links ({activeLinks.length})</h4>
            {activeLinks.map((link) => (
              <ShareLinkCard
                key={link.id}
                link={link}
                onCopy={copyToClipboard}
                onRevoke={(id) => revokeMutation.mutate(id)}
                revoking={revokeMutation.isPending}
              />
            ))}
          </div>
        )}

        {/* Create form */}
        {showCreateForm ? (
          <div className="space-y-4 border rounded-lg p-4">
            <h4 className="text-sm font-medium">New Share Link</h4>

            <div className="grid gap-3">
              <div>
                <Label>Purpose</Label>
                <Select value={purpose} onValueChange={(v) => setPurpose(v as typeof purpose)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PURPOSE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Recipient Name</Label>
                  <Input
                    placeholder="Dr. Smith"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Recipient Email</Label>
                  <Input
                    type="email"
                    placeholder="doctor@hospital.com"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label className="flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5" />
                  PIN Protection
                </Label>
                <Input
                  type="password"
                  placeholder="Optional 4-8 digit PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  maxLength={8}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Expires In
                  </Label>
                  <Select
                    value={String(expiresInHours)}
                    onValueChange={(v) => setExpiresInHours(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 hour</SelectItem>
                      <SelectItem value="24">1 day</SelectItem>
                      <SelectItem value="72">3 days</SelectItem>
                      <SelectItem value="168">7 days</SelectItem>
                      <SelectItem value="336">14 days</SelectItem>
                      <SelectItem value="720">30 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" />
                    Max Views
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={1000}
                    placeholder="0 = unlimited"
                    value={maxViews || ''}
                    onChange={(e) => setMaxViews(Number(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={allowDownload}
                  onCheckedChange={setAllowDownload}
                />
                <span className="text-sm font-medium">
                  {allowDownload ? 'Download allowed' : 'View only'}
                </span>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCreateForm(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Link'}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowCreateForm(true)}
          >
            <Link2 className="h-4 w-4 mr-2" />
            Create New Share Link
          </Button>
        )}

        {/* Revoked links */}
        {revokedLinks.length > 0 && (
          <div className="space-y-2 mt-4 opacity-60">
            <h4 className="text-xs font-medium text-muted-foreground">
              Revoked ({revokedLinks.length})
            </h4>
            {revokedLinks.slice(0, 3).map((link) => (
              <div
                key={link.id}
                className="text-xs text-muted-foreground flex items-center gap-2 px-2 py-1"
              >
                <Badge variant="outline" className="text-[10px]">
                  {link.purpose}
                </Badge>
                <span className="truncate">{link.recipient_name || 'Anonymous'}</span>
                <span>• {link.view_count} views</span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ShareLinkCard({
  link,
  onCopy,
  onRevoke,
  revoking,
}: {
  link: StudyShareLink;
  onCopy: (url: string) => void;
  onRevoke: (id: number) => void;
  revoking: boolean;
}) {
  const shareUrl = link.token
    ? `${window.location.origin}/imaging/share/${link.token}`
    : '';

  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {link.purpose.replace('_', ' ')}
          </Badge>
          {link.recipient_name && (
            <span className="text-xs text-muted-foreground">{link.recipient_name}</span>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onCopy(shareUrl)}
            title="Copy link"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => window.open(shareUrl, '_blank')}
            title="Open link"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive"
            onClick={() => onRevoke(link.id)}
            disabled={revoking}
            title="Revoke link"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Eye className="h-3 w-3" />
          {link.view_count}{link.max_views > 0 ? `/${link.max_views}` : ''} views
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Expires {formatDate(link.expires_at)}
        </span>
        {link.allow_download && (
          <Badge variant="outline" className="text-[10px] h-4">DL</Badge>
        )}
      </div>
    </div>
  );
}
