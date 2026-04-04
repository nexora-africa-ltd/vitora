'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Baby, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HelpPopover } from '@/components/shared/help-popover';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';
import { deliveriesApi } from '@/lib/api/mch';
import type {
  DeliveryCreateData,
  DeliveryType,
  DeliveryOutcome,
  PlaceOfDelivery,
  BabyGender,
} from '@/lib/types/mch';

interface DeliveryTabProps {
  registrationId: number;
}

const DELIVERY_TYPES: { value: DeliveryType; label: string }[] = [
  { value: 'SVD', label: 'SVD (Spontaneous Vaginal)' },
  { value: 'ASSISTED_VAGINAL', label: 'Assisted Vaginal' },
  { value: 'ELECTIVE_CS', label: 'Elective C-Section' },
  { value: 'EMERGENCY_CS', label: 'Emergency C-Section' },
  { value: 'VACUUM', label: 'Vacuum Extraction' },
  { value: 'FORCEPS', label: 'Forceps Delivery' },
];

const OUTCOMES: { value: DeliveryOutcome; label: string }[] = [
  { value: 'LIVE_BIRTH', label: 'Live Birth' },
  { value: 'STILLBIRTH', label: 'Stillbirth' },
  { value: 'NEONATAL_DEATH', label: 'Neonatal Death' },
  { value: 'MATERNAL_DEATH', label: 'Maternal Death' },
];

const PLACES: { value: PlaceOfDelivery; label: string }[] = [
  { value: 'FACILITY', label: 'Health Facility' },
  { value: 'HOME', label: 'Home' },
  { value: 'EN_ROUTE', label: 'En Route to Facility' },
];

const GENDERS: { value: BabyGender; label: string }[] = [
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
  { value: 'O', label: 'Other' },
];

const outcomeColors: Record<DeliveryOutcome, string> = {
  LIVE_BIRTH: 'bg-green-100 text-green-800',
  STILLBIRTH: 'bg-red-100 text-red-800',
  NEONATAL_DEATH: 'bg-red-100 text-red-800',
  MATERNAL_DEATH: 'bg-red-100 text-red-800',
};

export function DeliveryTab({ registrationId }: DeliveryTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['deliveries', registrationId],
    queryFn: () => deliveriesApi.list(registrationId),
  });

  const deliveries = data?.results || [];
  const hasDelivery = deliveries.length > 0;

  // Form state
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [deliveryTime, setDeliveryTime] = useState('');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('SVD');
  const [outcome, setOutcome] = useState<DeliveryOutcome>('LIVE_BIRTH');
  const [place, setPlace] = useState<PlaceOfDelivery>('FACILITY');
  const [babyGender, setBabyGender] = useState<BabyGender>('M');
  const [birthWeight, setBirthWeight] = useState('');
  const [apgar1, setApgar1] = useState('');
  const [apgar5, setApgar5] = useState('');
  const [apgar10, setApgar10] = useState('');
  const [resuscitation, setResuscitation] = useState(false);
  const [maternalComplications, setMaternalComplications] = useState('');
  const [neonatalComplications, setNeonatalComplications] = useState('');
  const [bloodLoss, setBloodLoss] = useState('');
  const [placentaComplete, setPlacentaComplete] = useState(true);
  const [notes, setNotes] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: DeliveryCreateData) => deliveriesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliveries', registrationId] });
      queryClient.invalidateQueries({ queryKey: ['mch-registration', registrationId] });
      queryClient.invalidateQueries({ queryKey: ['mch-registrations'] });
      toast({
        title: 'Delivery Recorded',
        description: 'Delivery recorded successfully. MCH status has been updated to Delivered and baby patient record has been created.',
      });
      setDialogOpen(false);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to record delivery.';
      toast({
        title: 'Error',
        description: message.length > 200 ? message.slice(0, 200) + '…' : message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      registration: registrationId,
      delivery_date: deliveryDate,
      delivery_time: deliveryTime || undefined,
      delivery_type: deliveryType,
      delivery_outcome: outcome,
      place_of_delivery: place,
      baby_gender: babyGender,
      birth_weight: birthWeight ? parseFloat(birthWeight) : undefined,
      apgar_score_1min: apgar1 ? parseInt(apgar1) : undefined,
      apgar_score_5min: apgar5 ? parseInt(apgar5) : undefined,
      apgar_score_10min: apgar10 ? parseInt(apgar10) : undefined,
      resuscitation_done: resuscitation,
      maternal_complications: maternalComplications,
      neonatal_complications: neonatalComplications,
      blood_loss_ml: bloodLoss ? parseInt(bloodLoss) : undefined,
      placenta_complete: placentaComplete,
      notes,
    });
  };

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (error) {
    return <div className="text-destructive">Failed to load delivery records.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Delivery</h3>
          <HelpPopover content="Record delivery details including type, outcome, baby information, and any complications." />
        </div>
        {!hasDelivery && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Record Delivery
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Record Delivery</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Delivery Date</Label>
                    <Input
                      type="date"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Delivery Time</Label>
                    <Input
                      type="time"
                      value={deliveryTime}
                      onChange={(e) => setDeliveryTime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Delivery Type</Label>
                    <Select value={deliveryType} onValueChange={(v) => setDeliveryType(v as DeliveryType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DELIVERY_TYPES.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Outcome</Label>
                    <Select value={outcome} onValueChange={(v) => setOutcome(v as DeliveryOutcome)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OUTCOMES.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Place of Delivery</Label>
                    <Select value={place} onValueChange={(v) => setPlace(v as PlaceOfDelivery)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLACES.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Baby Gender</Label>
                    <Select value={babyGender} onValueChange={(v) => setBabyGender(v as BabyGender)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GENDERS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Birth Weight (kg)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={birthWeight}
                      onChange={(e) => setBirthWeight(e.target.value)}
                      placeholder="e.g., 3.25"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Blood Loss (mL)</Label>
                    <Input
                      type="number"
                      value={bloodLoss}
                      onChange={(e) => setBloodLoss(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>APGAR Scores</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">1 min</Label>
                      <Input
                        type="number"
                        min="0"
                        max="10"
                        value={apgar1}
                        onChange={(e) => setApgar1(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">5 min</Label>
                      <Input
                        type="number"
                        min="0"
                        max="10"
                        value={apgar5}
                        onChange={(e) => setApgar5(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">10 min</Label>
                      <Input
                        type="number"
                        min="0"
                        max="10"
                        value={apgar10}
                        onChange={(e) => setApgar10(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={resuscitation} onCheckedChange={setResuscitation} />
                    <Label>Resuscitation Done</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={placentaComplete} onCheckedChange={setPlacentaComplete} />
                    <Label>Placenta Complete</Label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Maternal Complications</Label>
                  <Textarea
                    value={maternalComplications}
                    onChange={(e) => setMaternalComplications(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Neonatal Complications</Label>
                  <Textarea
                    value={neonatalComplications}
                    onChange={(e) => setNeonatalComplications(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Record Delivery
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {deliveries.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No delivery recorded yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {deliveries.map((delivery) => (
            <Card key={delivery.id}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Baby className="h-5 w-5" />
                    Delivery Record
                  </CardTitle>
                  <Badge className={outcomeColors[delivery.delivery_outcome]}>
                    {delivery.delivery_outcome.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatDate(delivery.delivery_date)}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Type:</span>{' '}
                    {delivery.delivery_type}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Gender:</span>{' '}
                    {delivery.baby_gender === 'M' ? 'Male' : delivery.baby_gender === 'F' ? 'Female' : 'Other'}
                  </div>
                  {delivery.birth_weight && (
                    <div>
                      <span className="text-muted-foreground">Weight:</span>{' '}
                      {delivery.birth_weight} kg
                    </div>
                  )}
                </div>

                {/* Alerts */}
                {delivery.alerts.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {delivery.alerts.map((alert, i) => (
                      <Badge key={i} variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {alert}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
