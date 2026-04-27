'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Timer } from 'lucide-react';

interface VitalsTimerBadgeProps {
  /** ISO timestamp of the last recorded vital */
  lastRecordedAt: string | null;
  /** Interval in seconds (default 300 = 5 min) */
  intervalSeconds?: number;
}

/**
 * Shows elapsed time since the last vital reading and prompts when
 * the next reading is overdue (default: every 5 minutes).
 */
export function VitalsTimerBadge({
  lastRecordedAt,
  intervalSeconds = 300,
}: VitalsTimerBadgeProps) {
  const [elapsed, setElapsed] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const updateElapsed = useCallback(() => {
    if (!lastRecordedAt) {
      setElapsed(0);
      return;
    }
    const diff = Math.floor((Date.now() - new Date(lastRecordedAt).getTime()) / 1000);
    setElapsed(Math.max(0, diff));
  }, [lastRecordedAt]);

  useEffect(() => {
    updateElapsed();
    const id = setInterval(updateElapsed, 1000);
    return () => clearInterval(id);
  }, [updateElapsed]);

  // Play a brief tone when overdue
  useEffect(() => {
    if (elapsed >= intervalSeconds && elapsed < intervalSeconds + 2) {
      try {
        if (!audioRef.current) {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = 880;
          osc.connect(ctx.destination);
          osc.start();
          setTimeout(() => {
            osc.stop();
            ctx.close();
          }, 200);
        }
      } catch {
        // Audio not available in this context; silently skip
      }
    }
  }, [elapsed, intervalSeconds]);

  const remaining = intervalSeconds - elapsed;
  const isOverdue = remaining <= 0;

  const formatTime = (secs: number) => {
    const abs = Math.abs(secs);
    const m = Math.floor(abs / 60);
    const s = abs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!lastRecordedAt) {
    return (
      <Badge variant="outline" size="sm" className="gap-1">
        <Timer className="h-3 w-3" />
        No vitals
      </Badge>
    );
  }

  return (
    <Badge
      variant={isOverdue ? 'destructive' : remaining <= 60 ? 'warning' : 'outline'}
      size="sm"
      className={`gap-1 ${isOverdue ? 'animate-pulse' : ''}`}
    >
      <Timer className="h-3 w-3" />
      {isOverdue
        ? `Overdue ${formatTime(remaining)}`
        : `Next in ${formatTime(remaining)}`}
    </Badge>
  );
}
