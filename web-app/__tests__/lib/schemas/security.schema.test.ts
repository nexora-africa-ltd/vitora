// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Purpose: Validate audit integrity schemas against the backend API contract.
 * Usage: Run with `cd web-app && npx jest "__tests__/lib/schemas/security.schema.test.ts" --runInBand`.
 * Inputs: Zod parsing for chain status and verification responses.
 */

import { AuditChainStatusSchema, AuditIntegrityResultSchema } from '@/lib/schemas/security.schema';

describe('security.schema audit integrity', () => {
  it('parses chain status using backend contract fields', () => {
    const parsed = AuditChainStatusSchema.parse({
      total_entries: 120,
      chained_entries: 118,
      unchained_entries: 2,
      last_sequence_number: 118,
      last_entry_hash: 'abc123',
      last_entry_timestamp: '2026-09-18T09:20:00Z',
      last_verified_at: '2026-09-18T09:15:00Z',
      last_verification_valid: true,
      tamper_alerts_count: 0,
    });

    expect(parsed.chained_entries).toBe(118);
    expect(parsed.unchained_entries).toBe(2);
  });

  it('rejects deprecated frontend-only chain status fields', () => {
    expect(() =>
      AuditChainStatusSchema.parse({
        total_entries: 120,
        chain_length: 118,
        last_verified_at: null,
        last_verification_valid: null,
        tamper_alerts_count: 0,
        entries_with_hashes: 118,
        entries_without_hashes: 2,
      })
    ).toThrow();
  });

  it('parses verify response using backend contract fields', () => {
    const parsed = AuditIntegrityResultSchema.parse({
      valid: false,
      entries_checked: 30,
      first_mismatch_seq: 18,
      first_mismatch_detail: 'Hash mismatch at seq 18',
      errors: ['Hash mismatch at seq 18'],
      checked_at: '2026-09-18T10:20:00Z',
    });

    expect(parsed.first_mismatch_detail).toBe('Hash mismatch at seq 18');
    expect(parsed.errors).toEqual(['Hash mismatch at seq 18']);
  });

  it('accepts null checked_at in verify response', () => {
    const parsed = AuditIntegrityResultSchema.parse({
      valid: true,
      entries_checked: 10,
      first_mismatch_seq: null,
      first_mismatch_detail: '',
      errors: [],
      checked_at: null,
    });

    expect(parsed.checked_at).toBeNull();
  });
});
