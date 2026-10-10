// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Tests cloud configuration envelope verification state.
 * Run with: npx jest __tests__/lib/licensing/cloud-config-envelope.test.ts.
 * Inputs: opaque RS256 cloud configuration envelope strings.
 */

import { verifyCloudConfigEnvelope } from '@/lib/licensing/cloud-config-envelope';

describe('verifyCloudConfigEnvelope', () => {
  it('returns verified claims only after signature and binding checks pass', async () => {
    const originalCrypto = globalThis.crypto;
    const claims = {
      iss: 'nexora-licensing',
      aud: 'vitora-hub-cloud-config',
      token_type: 'cloud_config',
      installation_id: 'hub-1',
      organization_id: 7,
      facility_id: null,
      environment: 'staging',
      cloud_api_base_url: 'https://cloud.example.test',
      sync_server_url: 'https://cloud.example.test/api/sync',
      exp: Math.floor(Date.now() / 1000) + 60,
    };
    const toBase64Url = (value: object) =>
      btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const envelope = `${toBase64Url({ alg: 'RS256' })}.${toBase64Url(claims)}.c2ln`;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        subtle: {
          importKey: jest.fn().mockResolvedValue({}),
          verify: jest.fn().mockResolvedValue(true),
        },
      },
    });

    try {
      await expect(
        verifyCloudConfigEnvelope(envelope, { installationId: 'hub-1' })
      ).resolves.toEqual({
        status: 'verified',
        claims,
      });
    } finally {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto });
    }
  });

  it('keeps an opaque envelope unavailable when Web Crypto is unavailable', async () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });

    try {
      await expect(
        verifyCloudConfigEnvelope('header.payload.signature', { installationId: 'hub-1' })
      ).resolves.toEqual({
        status: 'unavailable',
        reason: 'Browser Web Crypto is unavailable for cloud configuration verification.',
      });
    } finally {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto });
    }
  });

  it('rejects a malformed envelope before claims can be used', async () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { subtle: {} },
    });

    try {
      await expect(
        verifyCloudConfigEnvelope('not-a-jwt', { installationId: 'hub-1' })
      ).resolves.toEqual({
        status: 'invalid',
        reason: 'Cloud configuration envelope is not a compact JWT.',
      });
    } finally {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto });
    }
  });
});
