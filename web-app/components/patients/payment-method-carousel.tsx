/**
 * Payment Method Carousel Component
 *
 * A carousel-based payment method selector for patient registration.
 * Displays payment options in a swipeable carousel format.
 */
'use client';

import * as React from 'react';
import { CheckCircle2, CreditCard, Building2, Wallet } from 'lucide-react';
import { SHALogo } from '@/components/ui/sha-logo';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel';
import { cn } from '@/lib/utils';
import { type PaymentMode, PAYMENT_MODE_OPTIONS } from '@/lib/types/patient';

// Payment mode icons mapping
const PAYMENT_MODE_ICONS: Record<PaymentMode, React.ReactNode> = {
  cash: <Wallet className="h-6 w-6 text-green-600" />,
  sha: <SHALogo size="lg" />,
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
  const [api, setApi] = React.useState<CarouselApi>();
  const [currentSlide, setCurrentSlide] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Update current slide when carousel scrolls
  React.useEffect(() => {
    if (!api) return;

    const onSelect = () => {
      setCurrentSlide(api.selectedScrollSnap());
    };

    api.on('select', onSelect);
    // Set initial slide
    onSelect();

    return () => {
      api.off('select', onSelect);
    };
  }, [api]);

  // Scroll to a specific slide
  const scrollToSlide = (index: number) => {
    api?.scrollTo(index);
  };

  // Handle keyboard navigation
  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        api?.scrollPrev();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        api?.scrollNext();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        // Select the current card
        const currentOption = PAYMENT_MODE_OPTIONS[currentSlide];
        if (currentOption) {
          const isDisabled = currentOption.value === 'sha' && shaDisabled;
          if (!isDisabled) {
            onChange(currentOption.value);
          }
        }
      }
    },
    [api, currentSlide, onChange, shaDisabled]
  );

  // Focus container on mount for keyboard navigation
  React.useEffect(() => {
    containerRef.current?.focus();
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn('w-full outline-none', className)}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="group"
      aria-label="Payment method options"
    >
      <Carousel
        className="mx-auto w-full max-w-xs overflow-hidden"
        opts={{ align: 'start', loop: true }}
        setApi={setApi}
      >
        <CarouselContent>
          {PAYMENT_MODE_OPTIONS.map((option, index) => {
            const isDisabled = option.value === 'sha' && shaDisabled;
            const isSelected = value === option.value;
            const isInFocus = currentSlide === index;

            return (
              <CarouselItem key={option.value}>
                <div className="p-1">
                  <Card
                    className={cn(
                      'cursor-pointer border-2 transition-all',
                      isDisabled && 'cursor-not-allowed bg-muted text-accent-foreground opacity-50',
                      !isDisabled && !isSelected && 'hover:border-secondary/50 hover:shadow-md',
                      isSelected &&
                        !isDisabled &&
                        'border-teal-400 bg-secondary/10 text-accent-foreground shadow-lg ring-2 ring-secondary'
                    )}
                    onClick={() => {
                      if (!isDisabled) {
                        onChange(option.value);
                      }
                    }}
                  >
                    <CardContent className="flex aspect-square flex-col items-center justify-center p-6">
                      {/* Icon */}
                      <div
                        className={cn(
                          'mb-4 rounded-full p-4 transition-colors',
                          isSelected && !isDisabled ? 'bg-secondary/20' : 'bg-muted'
                        )}
                      >
                        {PAYMENT_MODE_ICONS[option.value]}
                      </div>

                      {/* Label */}
                      <div
                        className={cn(
                          'text-center text-lg font-semibold transition-colors',
                          isSelected && !isDisabled && 'text-accent-foreground'
                        )}
                      >
                        {option.label}
                      </div>

                      {/* Description */}
                      <div className="mt-2 text-center text-sm text-muted-foreground">
                        {option.description}
                      </div>

                      {/* Status area */}
                      <div className="mt-4 flex min-h-[28px] items-center justify-center">
                        {isDisabled ? (
                          <Badge
                            variant="secondary"
                            className="bg-destructive/10 text-xs text-destructive"
                          >
                            Unavailable
                          </Badge>
                        ) : isSelected ? (
                          <div className="flex items-center gap-1.5 text-green-400">
                            <CheckCircle2 className="h-5 w-5" />
                            <span className="text-sm font-medium">Selected</span>
                          </div>
                        ) : isInFocus ? (
                          <span className="animate-pulse text-xs text-accent-foreground">
                            Click to select {option.label}
                          </span>
                        ) : null}
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

      {/* Indicator dots - reflects current carousel position */}
      <div className="mt-4 flex justify-center gap-2">
        {PAYMENT_MODE_OPTIONS.map((option, index) => {
          const isSelected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={cn(
                'h-2.5 w-2.5 rounded-full transition-all',
                currentSlide === index
                  ? isSelected
                    ? 'scale-125 bg-secondary'
                    : 'scale-125 bg-muted-foreground'
                  : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
              )}
              onClick={() => scrollToSlide(index)}
              aria-label={`Go to ${option.label}`}
            />
          );
        })}
      </div>

      {/* Keyboard hint */}
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Use <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">←</kbd>{' '}
        <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">→</kbd> to browse,{' '}
        <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd> to select
      </p>
    </div>
  );
}

export default PaymentMethodCarousel;
