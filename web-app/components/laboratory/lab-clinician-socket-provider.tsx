'use client';

/**
 * Lab Clinician Socket Provider
 *
 * Provides real-time WebSocket connectivity for lab critical alerts.
 * This component should wrap the laboratory layout to ensure all lab pages
 * receive critical result notifications.
 *
 * Critical alerts are shown as toast notifications with extended duration.
 */

import { useLabClinicianSocket, getConnectionStatusColor } from '@/lib/hooks';
import type { LabCriticalAlertEvent, LabWebSocketMessage } from '@/lib/hooks';

interface LabClinicianSocketProviderProps {
  children: React.ReactNode;
}

export function LabClinicianSocketProvider({
  children,
}: LabClinicianSocketProviderProps) {
  // Connect to the clinician WebSocket channel for critical alerts
  // This hook automatically:
  // - Shows toast notifications for critical lab results
  // - Invalidates React Query cache on lab events
  const { isConnected, connectionState } = useLabClinicianSocket({
    onMessage: (message) => {
      // Additional handling can be added here if needed
      // The hook already handles critical_alert toast notifications
      console.log('[LabClinicianSocket] Received message:', message.event);
    },
  });

  return <>{children}</>;
}
