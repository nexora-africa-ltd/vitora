/**
 * Payment Method Carousel Component
 * 
 * A carousel-based payment method selector for patient registration.
 * Displays payment options in a swipeable carousel format.
 */
'use client';

import * as React from 'react';
import { CheckCircle2, CreditCard, Shield, Building2, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { cn } from '@/lib/utils';
import { type PaymentMode, PAYMENT_MODE_OPTIONS } from '@/lib/types/patient';

// Payment mode icons mapping
const PAYMENT_MODE_ICONS: Record<PaymentMode, React.ReactNode> = {
  cash: <Wallet className="h-6 w-6 text-green-600" />,
  sha: <Shield className="h-6 w-6 text-blue-600" />,
  insurance_private: <CreditCard className="h-6 w-6 text-purple-600" />,
  insurance_corporate: <Building2 className="h-6 w-6 text-orange-600" />,
};

interface PaymentMethodCarouselProps {
  /** Currently selected payment mode */
  value?: PaymentMode;
  /** Callback when payment mode changes */
  onChange: (value: PaymentMode) => void;
  /** Whether SHA option is disabled */
  shaDisabled?: boolean;
  /** Reason why SHA is disabled */
  shaDisabledReason?: string;
  /** Custom class name */
  className?: string;
}

export function PaymentMethodCarousel({
  value,
  onChange,
  shaDisabled = false,
  shaDisabledReason,
  className,
}: PaymentMethodCarouselProps) {
  return (
    <div className={cn('w-full', className)}>
      <Carousel className="w-full max-w-xs overflow-hidden" opts={{ loop: true }}>
        <CarouselContent>
          {PAYMENT_MODE_OPTIONS.map((option) => {
            const isDisabled = option.value === 'sha' && shaDisabled;
            const isSelected = value === option.value;

            return (
              <CarouselItem key={option.value}>
                <div className="p-1">
                  <Card
                    className={cn(
                      'transition-all cursor-pointer',
                      isDisabled && 'cursor-not-allowed opacity-50 bg-muted',
                      !isDisabled && 'hover:border-primary hover:shadow-md',
                      isSelected && !isDisabled && 'border-primary bg-primary/5 ring-2 ring-primary'
                    )}
                    onClick={() => {
                      if (!isDisabled) {
                        onChange(option.value);
                      }
                    }}
                  >
                    <CardContent className="flex flex-col items-center justify-center aspect-square p-6">
                      {/* Icon */}
                      <div
                        className={cn(
                          'rounded-full p-4 mb-4',
                          isSelected && !isDisabled ? 'bg-primary/20' : 'bg-muted'
                        )}
                      >
                        {PAYMENT_MODE_ICONS[option.value]}
                      </div>

                      {/* Label */}
                      <div className="font-semibold text-lg text-center">
                        {option.label}
                      </div>

                      {/* Description */}
                      <div className="text-sm text-muted-foreground text-center mt-2">
                        {option.description}
                      </div>

                      {/* Status badges */}
                      <div className="mt-4 h-6 flex items-center">
                        {isDisabled && (
                          <Badge variant="secondary" className="text-xs bg-red-100 text-red-800">
                            Unavailable
                          </Badge>
                        )}
                        {isSelected && !isDisabled && (
                          <CheckCircle2 className="h-6 w-6 text-primary" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CarouselItem>
            );
          })}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>

      {/* Indicator dots */}
      <div className="flex justify-center gap-2 mt-4">
        {PAYMENT_MODE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cn(
              'w-2 h-2 rounded-full transition-colors',
              value === option.value ? 'bg-primary' : 'bg-muted-foreground/30'
            )}
            onClick={() => {
              const isDisabled = option.value === 'sha' && shaDisabled;
              if (!isDisabled) {
                onChange(option.value);
              }
            }}
            aria-label={`Select ${option.label}`}
          />
        ))}
      </div>
    </div>
  );
}

export default PaymentMethodCarousel;
