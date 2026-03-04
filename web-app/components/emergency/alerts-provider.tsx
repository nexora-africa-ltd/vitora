/**
 * Emergency Alerts Provider
 *
 * Context provider that listens for WebSocket breach/escalation events
 * and shows toast notifications with optional audio alerts.
 *
 * Audio alerts are configurable via localStorage setting
 * 'vitora-emergency-audio-alerts' (default: true).
 *
 * Phase 4: Auto-Escalation & Alerts
 */
'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/lib/hooks/use-toast';
import { useEmergencySocket } from '@/lib/hooks/use-websocket';
import { BREACH_SEVERITY_CONFIG } from '@/lib/types/triage';
import type { BreachSeverity } from '@/lib/types/triage';

// =============================================================================
// Types
// =============================================================================

interface BreachAlertData {
  id: number;
  patient_name: string;
  patient_mrn: string;
  triage_category: string;
  severity: BreachSeverity;
  target_wait_minutes: number;
  actual_wait_minutes: number;
  assigned_area: string;
}

interface EscalationAlertData {
  id: number;
  patient_name: string;
  patient_mrn: string;
  escalation_type: string;
  escalation_type_display: string;
  reason: string;
  triage_category: string;
  assigned_area: string;
}

interface EmergencyAlertsContextValue {
  /** Whether audio alerts are enabled */
  audioEnabled: boolean;
  /** Toggle audio alerts */
  setAudioEnabled: (enabled: boolean) => void;
  /** Count of active unacknowledged breaches pushed via WS */
  pendingBreachCount: number;
  /** Most recent breach event data */
  lastBreachEvent: { breaches: BreachAlertData[]; timestamp: string } | null;
  /** Most recent escalation event data */
  lastEscalationEvent: { escalation: EscalationAlertData; timestamp: string } | null;
}

const EmergencyAlertsContext = createContext<EmergencyAlertsContextValue>({
  audioEnabled: true,
  setAudioEnabled: () => {},
  pendingBreachCount: 0,
  lastBreachEvent: null,
  lastEscalationEvent: null,
});

export const useEmergencyAlerts = () => useContext(EmergencyAlertsContext);

// =============================================================================
// Audio Helper
// =============================================================================

const AUDIO_STORAGE_KEY = 'vitora-emergency-audio-alerts';

function getStoredAudioPref(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(AUDIO_STORAGE_KEY);
  return stored !== 'false'; // default true
}

/**
 * Play an alert tone using the Web Audio API.
 * Uses a short beep pattern:
 *   CRITICAL: 3 rapid high beeps
 *   URGENT: 2 medium beeps
 *   WARNING: 1 low beep
 *   INFO: no sound
 */
function playAlertTone(severity: BreachSeverity): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const toneConfig: Record<string, { freq: number; count: number; duration: number }> = {
      CRITICAL: { freq: 880, count: 3, duration: 0.12 },
      URGENT: { freq: 660, count: 2, duration: 0.15 },
      WARNING: { freq: 440, count: 1, duration: 0.2 },
    };

    const config = toneConfig[severity];
    if (!config) return;

    for (let i = 0; i < config.count; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = config.freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, now + i * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.25 + config.duration);
      osc.start(now + i * 0.25);
      osc.stop(now + i * 0.25 + config.duration + 0.05);
    }

    // Clean up context after tones complete
    setTimeout(() => ctx.close(), config.count * 250 + 500);
  } catch {
    // Audio playback errors are non-critical — swallow silently
  }
}

// =============================================================================
// Provider Component
// =============================================================================

export function EmergencyAlertsProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [audioEnabled, setAudioEnabledState] = useState(getStoredAudioPref);
  const [pendingBreachCount, setPendingBreachCount] = useState(0);
  const [lastBreachEvent, setLastBreachEvent] = useState<{ breaches: BreachAlertData[]; timestamp: string } | null>(null);
  const [lastEscalationEvent, setLastEscalationEvent] = useState<{ escalation: EscalationAlertData; timestamp: string } | null>(null);

  // Track processed breach IDs to prevent duplicate toasts
  const processedBreachIds = useRef(new Set<number>());

  const setAudioEnabled = useCallback((enabled: boolean) => {
    setAudioEnabledState(enabled);
    localStorage.setItem(AUDIO_STORAGE_KEY, String(enabled));
  }, []);

  // Handle breach alerts from WebSocket
  const handleBreachAlert = useCallback(
    (data: { breaches: unknown[]; count: number; timestamp: string }) => {
      const breaches = data.breaches as BreachAlertData[];
      setLastBreachEvent({ breaches, timestamp: data.timestamp });
      setPendingBreachCount((prev) => prev + data.count);

      // Show toast for each new breach
      for (const breach of breaches) {
        if (processedBreachIds.current.has(breach.id)) continue;
        processedBreachIds.current.add(breach.id);

        const severityConfig = BREACH_SEVERITY_CONFIG[breach.severity];
        const variant = breach.severity === 'CRITICAL' ? 'destructive' as const : 'default' as const;

        toast({
          title: `${severityConfig.label}: Wait Time Breach`,
          description: `${breach.patient_name} (${breach.patient_mrn}) — ${breach.triage_category} category, waiting ${breach.actual_wait_minutes}m (target: ${breach.target_wait_minutes}m)`,
          variant,
          duration: breach.severity === 'CRITICAL' ? 15000 : 8000,
        });

        // Play audio for non-INFO severities
        if (audioEnabled && breach.severity !== 'INFO') {
          playAlertTone(breach.severity);
        }
      }
    },
    [toast, audioEnabled],
  );

  // Handle escalation events from WebSocket
  const handleEscalationEvent = useCallback(
    (data: { escalation: unknown; timestamp: string }) => {
      const escalation = data.escalation as EscalationAlertData;
      setLastEscalationEvent({ escalation, timestamp: data.timestamp });

      toast({
        title: `Escalation: ${escalation.escalation_type_display}`,
        description: `${escalation.patient_name} (${escalation.patient_mrn}) — ${escalation.reason}`,
        variant: 'default',
        duration: 10000,
      });
    },
    [toast],
  );

  // Connect to emergency WebSocket with breach/escalation handlers
  useEmergencySocket({
    onWaitTimeBreach: handleBreachAlert,
    onEscalationEvent: handleEscalationEvent,
  });

  // Clear processed IDs periodically to prevent memory leak
  useEffect(() => {
    const interval = setInterval(() => {
      if (processedBreachIds.current.size > 100) {
        processedBreachIds.current.clear();
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const value = useMemo(
    () => ({
      audioEnabled,
      setAudioEnabled,
      pendingBreachCount,
      lastBreachEvent,
      lastEscalationEvent,
    }),
    [audioEnabled, setAudioEnabled, pendingBreachCount, lastBreachEvent, lastEscalationEvent],
  );

  return (
    <EmergencyAlertsContext.Provider value={value}>
      {children}
    </EmergencyAlertsContext.Provider>
  );
}
