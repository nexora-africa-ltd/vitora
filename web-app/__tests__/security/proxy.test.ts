// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Verifies the browser security policy emitted by the Next.js request proxy.
 * Run with: npm test -- __tests__/security/proxy.test.ts
 * Inputs: NEXT_PUBLIC_API_URL and NEXT_PUBLIC_MEDIA_BASE_URL when configured.
 */
import { createContentSecurityPolicy } from '@/proxy';

describe('createContentSecurityPolicy', () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
  const originalMediaBaseUrl = process.env.NEXT_PUBLIC_MEDIA_BASE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.vitora.digital';
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL = 'https://vitorareleasessa.blob.core.windows.net/vitora-media';
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL = originalMediaBaseUrl;
  });

  it('limits images to configured media origins instead of every HTTPS host', () => {
    const policy = createContentSecurityPolicy('test-nonce');

    expect(policy).toContain(
      "img-src 'self' data: blob: https://api.vitora.digital https://vitorareleasessa.blob.core.windows.net"
    );
    expect(policy).not.toContain("img-src 'self' data: blob: https:;");
  });

  it('allows style attributes without allowing inline style elements', () => {
    const policy = createContentSecurityPolicy('test-nonce');

    expect(policy).toContain("style-src 'self'");
    expect(policy).toContain("style-src-attr 'unsafe-inline'");
    expect(policy).not.toContain("style-src 'self' 'unsafe-inline'");
  });
});
