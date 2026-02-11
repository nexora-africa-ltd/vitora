'use client';

import { useState, useEffect, useCallback } from 'react';
import { LabResultsBadge } from './lab-results-badge';
import { LabResult } from '@/lib/types/laboratory';
import {
  useLabOrderSocket,
  type LabResultVerifiedEvent,
  type LabWebSocketMessage,
} from '@/lib/hooks/use-websocket';

interface LabResultsBadgeLiveProps {
  /** The order ID to subscribe to for real-time updates */
  orderId: number;
  /** The order number (for cache invalidation) */
  orderNumber?: string;
  /** The encounter ID (for cache invalidation) */
  encounterId?: number;
  /** Initial result data (optional - badge shows "Pending" if not provided) */
  initialResult?: LabResult | null;
  /** Whether to show the result value in the badge */
  showValue?: boolean;
}

/**
 * Real-time wrapper for LabResultsBadge.
 *
 * Subscribes to WebSocket events for the given lab order and updates
 * the badge display when results are verified. This enables instant
 * badge updates without requiring a full page refresh.
 *
 * Usage:
 * ```tsx
 * <LabResultsBadgeLive
 *   orderId={order.id}
 *   orderNumber={order.order_number}
 *   initialResult={item.result}
 * />
 * ```
 */
export function LabResultsBadgeLive({
  orderId,
  orderNumber,
  encounterId,
  initialResult,
  showValue = false,
}: LabResultsBadgeLiveProps) {
  // Local state tracks result data with real-time updates
  const [result, setResult] = useState<LabResult | null | undefined>(initialResult);

  // Sync initial result when props change (e.g., after React Query refetch)
  useEffect(() => {
    setResult(initialResult);
  }, [initialResult]);

  // Handle WebSocket messages
  const handleMessage = useCallback((message: unknown) => {
    const labMessage = message as LabWebSocketMessage;
    
    if (labMessage.event === 'result_verified') {
      const eventData = labMessage.data as LabResultVerifiedEvent;

      // Update result state with verified event data
      // We merge the event data with existing result or create a minimal result object
      setResult((prev) => {
        const updatedResult: LabResult = {
          // Preserve existing result data if available
          ...(prev || {
            id: eventData.result_id,
            order_item: 0, // Will be filled by React Query refresh
            numeric_value: null,
            text_value: null,
            option_value: null,
            result_unit: null,
            reference_low: null,
            reference_high: null,
            reference_range_text: null,
            interpretation: null,
            method: null,
            equipment: null,
            entered_by: 0,
            entered_at: '',
            is_amended: false,
            is_external_result: false,
            created_at: '',
            updated_at: '',
          }),
          // Update with verified event data
          id: eventData.result_id,
          is_critical_result: eventData.is_critical,
          result_flag: eventData.result_flag as LabResult['result_flag'],
          verification_status: 'VERIFIED',
          verified_by_name: eventData.verified_by,
          verified_at: eventData.verified_at,
        };
        return updatedResult;
      });
    } else if (labMessage.event === 'result_entered') {
      // A new result was entered - mark as having a result but unverified
      setResult((prev) => {
        if (prev) return prev; // Don't override existing result

        // Create minimal result to show "Complete" badge
        return {
          id: 0,
          order_item: 0,
          numeric_value: null,
          text_value: null,
          option_value: null,
          result_unit: null,
          reference_low: null,
          reference_high: null,
          reference_range_text: null,
          result_flag: null,
          interpretation: null,
          is_critical_result: false,
          method: null,
          equipment: null,
          verification_status: 'UNVERIFIED',
          verified_by: null,
          verified_by_name: null,
          verified_at: null,
          entered_by: 0,
          entered_at: new Date().toISOString(),
          is_amended: false,
          is_external_result: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      });
    }
  }, []);

  // Subscribe to WebSocket for this order
  useLabOrderSocket(orderId, {
    orderNumber,
    encounterId,
    onMessage: handleMessage,
  });

  return (
    <LabResultsBadge
      hasResult={!!result}
      result={result}
      showValue={showValue}
    />
  );
}
