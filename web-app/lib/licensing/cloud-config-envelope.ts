// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Reports whether an opaque cloud configuration envelope can be verified.
 * Use `verifyCloudConfigEnvelope(envelope)` before consuming envelope claims.
 * Inputs: an RS256 compact JWT cloud configuration envelope.
 */

export type CloudConfigEnvelopeVerification =
  | { status: 'verified'; claims: Record<string, unknown> }
  | { status: 'unavailable'; reason: string }
  | { status: 'invalid'; reason: string };

const NO_EMBEDDED_KEY_REASON =
  'Browser Web Crypto is unavailable for cloud configuration verification.';

const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2GKqp9IfMzBWWieJJugD
aOpr/ngNV+hKb05XEVQ5LTEpR8pDJrDX4DvIyKpyPv/zDMV+wlazic9ClDhunmcl
InxgbR2I8famfP+Lf9q9TpB9QzTnJfx4aNd6uMk6C3ZF8zgx+V+OE4OMK3dsi86z
xaQUkKn0Ma1P4gkb2L0iVfTVksAhTkphFjsPXi2W7vhE/sOkEALkjlEUlC5PX91r
k1aqoHPlJht0HYjFwktt9e+h8T1pozISL+FOn3kSnkLHo7gHTeUrKVW+Qt92c8IF
icK9+4P4VBB2j3mYm/rnBujCGulXlCHrpFRo/S3gLUwR5IUrpfKhZng9bVsyUTmH
VQIDAQAB
-----END PUBLIC KEY-----`;

const CLOUD_CONFIG_AUDIENCE = 'vitora-hub-cloud-config';
const CLOUD_CONFIG_TOKEN_TYPE = 'cloud_config';

export interface CloudConfigEnvelopeVerificationOptions {
  installationId: string;
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function decodeJson(value: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as Record<string, unknown>;
}

async function getLicenseVerificationKey(): Promise<CryptoKey> {
  const pem = LICENSE_PUBLIC_KEY_PEM.replace(/-----(BEGIN|END) PUBLIC KEY-----|\s/g, '');
  return crypto.subtle.importKey(
    'spki',
    toArrayBuffer(decodeBase64Url(pem)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

/**
 * Verify the pinned RS256 cloud configuration envelope and its installation
 * binding. Browsers without Web Crypto retain it as opaque and unavailable.
 */
export async function verifyCloudConfigEnvelope(
  envelope: string,
  { installationId }: CloudConfigEnvelopeVerificationOptions
): Promise<CloudConfigEnvelopeVerification> {
  if (!globalThis.crypto?.subtle) {
    return { status: 'unavailable', reason: NO_EMBEDDED_KEY_REASON };
  }

  try {
    const [encodedHeader, encodedPayload, encodedSignature, ...extraParts] = envelope.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature || extraParts.length > 0) {
      return { status: 'invalid', reason: 'Cloud configuration envelope is not a compact JWT.' };
    }

    const header = decodeJson(encodedHeader);
    const claims = decodeJson(encodedPayload);
    if (header.alg !== 'RS256') {
      return { status: 'invalid', reason: 'Cloud configuration envelope must use RS256.' };
    }

    const signatureValid = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      await getLicenseVerificationKey(),
      toArrayBuffer(decodeBase64Url(encodedSignature)),
      toArrayBuffer(new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`))
    );
    if (!signatureValid) {
      return { status: 'invalid', reason: 'Cloud configuration envelope signature is invalid.' };
    }
    if (
      claims.iss !== 'nexora-licensing' ||
      claims.aud !== CLOUD_CONFIG_AUDIENCE ||
      claims.token_type !== CLOUD_CONFIG_TOKEN_TYPE ||
      claims.installation_id !== installationId ||
      typeof claims.organization_id !== 'number' ||
      (claims.facility_id !== null && typeof claims.facility_id !== 'number') ||
      typeof claims.environment !== 'string' ||
      typeof claims.cloud_api_base_url !== 'string' ||
      typeof claims.sync_server_url !== 'string' ||
      typeof claims.exp !== 'number' ||
      claims.exp * 1000 <= Date.now()
    ) {
      return { status: 'invalid', reason: 'Cloud configuration envelope claims are invalid.' };
    }

    return { status: 'verified', claims };
  } catch {
    return { status: 'invalid', reason: 'Cloud configuration envelope could not be verified.' };
  }
}
