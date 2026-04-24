// ============================================================
// Minimal Sentry reporter for the Cloudflare Worker.
// ------------------------------------------------------------
// Avoids the @sentry/cloudflare package weight — we only need the
// /api/:project/store endpoint with the captured event payload.
// ============================================================

import type { ExecutionContext } from '@cloudflare/workers-types';

interface Env {
  SENTRY_DSN?: string;
  ENVIRONMENT?: string;
}

export function reportError(err: unknown, ctx: ExecutionContext, env: Env): void {
  if (!env.SENTRY_DSN) return;

  const u = parseDsn(env.SENTRY_DSN);
  if (!u) return;

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  const payload = {
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    environment: env.ENVIRONMENT ?? 'production',
    logger: 'worker',
    exception: {
      values: [
        {
          type: err instanceof Error ? err.name : 'Error',
          value: message,
          stacktrace: stack
            ? {
                frames: stack
                  .split('\n')
                  .slice(1)
                  .map((line) => ({ filename: line.trim() })),
              }
            : undefined,
        },
      ],
    },
  };

  ctx.waitUntil(
    fetch(`${u.scheme}://${u.host}/api/${u.projectId}/store/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${u.publicKey}, sentry_client=raagam-worker/1.0`,
      },
      body: JSON.stringify(payload),
    }).catch(() => undefined),
  );
}

function parseDsn(dsn: string): { scheme: string; host: string; publicKey: string; projectId: string } | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, '');
    return { scheme: u.protocol.replace(':', ''), host: u.host, publicKey: u.username, projectId };
  } catch {
    return null;
  }
}
