// ============================================================
// Clerk JWT verification — runs inside the Cloudflare Worker.
// ------------------------------------------------------------
// Uses Web Crypto (SubtleCrypto) for RS256 verification; JWKS is
// cached in KV for 10 minutes. No external deps.
// ============================================================

import type { Env } from './types';

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
}

interface JwksDoc {
  keys: Jwk[];
}

interface JwtHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

interface JwtPayload {
  sub: string;
  iss: string;
  iat: number;
  exp: number;
  nbf?: number;
  azp?: string;
}

const JWKS_TTL = 600; // 10 minutes
const CLOCK_SKEW = 30; // seconds

export async function verifyClerkToken(token: string, env: Env): Promise<string | null> {
  if (!token || !env.CLERK_JWT_ISSUER) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  const header = safeB64Json<JwtHeader>(headerB64);
  const payload = safeB64Json<JwtPayload>(payloadB64);
  if (!header || !payload) return null;
  if (header.alg !== 'RS256') return null;
  if (!header.kid) return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp + CLOCK_SKEW < now) return null;
  if (payload.nbf && payload.nbf - CLOCK_SKEW > now) return null;
  if (!payload.iss.startsWith(env.CLERK_JWT_ISSUER)) return null;
  if (!payload.sub) return null;

  const jwk = await getJwk(env, header.kid);
  if (!jwk) return null;

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk as JsonWebKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = b64UrlToBytes(sigB64);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data);
  return ok ? payload.sub : null;
}

async function getJwk(env: Env, kid: string): Promise<Jwk | null> {
  const cacheKey = 'clerk:jwks:v1';
  let doc: JwksDoc | null = null;

  const cached = await env.CACHE.get(cacheKey);
  if (cached) {
    doc = JSON.parse(cached) as JwksDoc;
  } else {
    const r = await fetch(`${env.CLERK_JWT_ISSUER}/.well-known/jwks.json`);
    if (!r.ok) return null;
    doc = (await r.json()) as JwksDoc;
    await env.CACHE.put(cacheKey, JSON.stringify(doc), { expirationTtl: JWKS_TTL });
  }

  return doc.keys.find((k) => k.kid === kid) ?? null;
}

function safeB64Json<T>(s: string): T | null {
  try {
    const bytes = b64UrlToBytes(s);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

function b64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
