/**
 * Add Invoice Item Dialog
 * Dialog for adding a line item to an invoice
 */
'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';
import type { Service, InvoiceItemCreateData } from '@/lib/types/billing';

interface AddInvoiceItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: Service[];
  onSubmit: (data: InvoiceItemCreateData) => void;
  isLoading?: boolean;
}

export function AddInvoiceItemDialog({
  open,
  onOpenChange,
  services,
  onSubmit,
  isLoading = false,
}: AddInvoiceItemDialogProps) {
  const [serviceOpen, setServiceOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const handleServiceSelect = (service: Service) => {
    setSelectedService(service);
    setUnitPrice(service.unit_price);
    setServiceOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService) return;

    onSubmit({
      description: selectedService.name,
      service: selectedService.id,
      quantity,
      unit_price: unitPrice,
    });
  };

  const handleClose = () => {
    setSelectedService(null);
    setQuantity(1);
    setUnitPrice('');
    setSearchQuery('');
    onOpenChange(false);
  };

  const filteredServices = services.filter(
    (service) =>
      service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      service.code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalAmount = selectedService
    ? parseFloat(unitPrice || '0') * quantity
    : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Line Item</DialogTitle>
          <DialogDescription>
            Search and select a service to add to the invoice
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Service Selector */}
          <div className="space-y-2">
            <Label>Service *</Label>
            <Popover open={serviceOpen} onOpenChange={setServiceOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={serviceOpen}
                  className="w-full justify-between"
                >
                  {selectedService ? (
                    <span className="truncate">{selectedService.name}</span>
                  ) : (
                    <span className="text-secondary-foreground">Select service...</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Search services..."
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                  <CommandList>
                    <CommandEmpty>No services found.</CommandEmpty>
                    <CommandGroup>
                      {filteredServices.map((service) => (
                        <CommandItem
                          key={service.id}
                          value={service.name}
                          onSelect={() => handleServiceSelect(service)}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              selectedService?.id === service.id
                                ? 'opacity-100'
                                : 'opacity-0'
                            )}
                          />
                          <div className="flex-1">
                            <div className="font-medium">{service.name}</div>
                            {service.code && (
                              <div className="text-xs text-primary-foreground">
                                {service.code}
                              </div>
                            )}
                          </div>
                          <div className="text-sm text-secondary-foreground">
                            {formatCurrency(parseFloat(service.unit_price))}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity *</Label>
            <Input
              id="quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
            />
          </div>

          {/* Unit Price */}
          <div className="space-y-2">
            <Label htmlFor="unit_price">Unit Price (KES) *</Label>
            <Input
              id="unit_price"
              type="number"
              step="0.01"
              min={0}
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {/* Total */}
          {selectedService && (
            <div className="rounded-md bg-muted p-3">
              <div className="flex justify-between text-sm">
                <span>Total Amount:</span>
                <span className="font-semibold">
                  {formatCurrency(totalAmount)}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!selectedService || isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
