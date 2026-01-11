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
  type CarouselApi,
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
      role="listbox"
      aria-label="Payment method options"
    >
      <Carousel 
        className="w-full max-w-xs mx-auto overflow-hidden" 
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
                      'transition-all cursor-pointer border-2',
                      isDisabled && 'cursor-not-allowed opacity-50 bg-muted text-accent-foreground',
                      !isDisabled && !isSelected && 'hover:border-secondary/50 hover:shadow-md',
                      isSelected && !isDisabled && 'border-teal-400 bg-secondary/10 ring-2 ring-secondary shadow-lg text-accent-foreground'
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
                          'rounded-full p-4 mb-4 transition-colors',
                          isSelected && !isDisabled ? 'bg-secondary/20' : 'bg-muted'
                        )}
                      >
                        {PAYMENT_MODE_ICONS[option.value]}
                      </div>

                      {/* Label */}
                      <div className={cn(
                        "font-semibold text-lg text-center transition-colors",
                        isSelected && !isDisabled && "text-accent-foreground"
                      )}>
                        {option.label}
                      </div>

                      {/* Description */}
                      <div className="text-sm text-muted-foreground text-center mt-2">
                        {option.description}
                      </div>

                      {/* Status area */}
                      <div className="mt-4 min-h-[28px] flex items-center justify-center">
                        {isDisabled ? (
                          <Badge variant="secondary" className="text-xs bg-destructive/10 text-destructive">
                            Unavailable
                          </Badge>
                        ) : isSelected ? (
                          <div className="flex items-center gap-1.5 text-green-400">
                            <CheckCircle2 className="h-5 w-5" />
                            <span className="text-sm font-medium">Selected</span>
                          </div>
                        ) : isInFocus ? (
                          <span className="text-xs text-accent-foreground animate-pulse">
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
      <div className="flex justify-center gap-2 mt-4">
        {PAYMENT_MODE_OPTIONS.map((option, index) => {
          const isSelected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={cn(
                'w-2.5 h-2.5 rounded-full transition-all',
                currentSlide === index 
                  ? isSelected 
                    ? 'bg-secondary scale-125' 
                    : 'bg-muted-foreground scale-125'
                  : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
              )}
              onClick={() => scrollToSlide(index)}
              aria-label={`Go to ${option.label}`}
            />
          );
        })}
      </div>

      {/* Keyboard hint */}
      <p className="text-xs text-muted-foreground text-center mt-3">
        Use <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">←</kbd> <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">→</kbd> to browse, <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Enter</kbd> to select
      </p>
    </div>
  );
}

export default PaymentMethodCarousel;
