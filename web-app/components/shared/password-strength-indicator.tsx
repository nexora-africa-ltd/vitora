'use client';

import { useMemo } from 'react';
import { Check, X } from 'lucide-react';

const RULES = [
  { label: '8+ characters', test: (p: string) => p.length >= 8 },
  { label: 'Uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'Number', test: (p: string) => /\d/.test(p) },
  { label: 'Special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export function PasswordStrengthIndicator({ password }: { password: string }) {
  const results = useMemo(
    () => RULES.map((r) => ({ ...r, pass: r.test(password) })),
    [password],
  );

  const passCount = results.filter((r) => r.pass).length;
  const strength = passCount <= 2 ? 'weak' : passCount <= 4 ? 'fair' : 'strong';
  const barColor =
    strength === 'weak' ? 'bg-destructive' : strength === 'fair' ? 'bg-yellow-500' : 'bg-emerald-500';
  const barWidth = `${(passCount / RULES.length) * 100}%`;

  return (
    <div className="space-y-1.5 pt-1">
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: barWidth }}
          />
        </div>
        <span className={`text-xs font-medium ${
          strength === 'weak' ? 'text-destructive' : strength === 'fair' ? 'text-yellow-600 dark:text-yellow-400' : 'text-emerald-600 dark:text-emerald-400'
        }`}>
          {strength === 'weak' ? 'Weak' : strength === 'fair' ? 'Fair' : 'Strong'}
        </span>
      </div>
      {/* Rule checklist */}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {results.map((r) => (
          <li key={r.label} className="flex items-center gap-1 text-xs">
            {r.pass ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <X className="h-3 w-3 text-muted-foreground" />
            )}
            <span className={r.pass ? 'text-foreground' : 'text-muted-foreground'}>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
