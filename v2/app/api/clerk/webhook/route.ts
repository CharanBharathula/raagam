import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

// Clerk webhook -> seed D1 users row on user.created.
// Configure:
//   1. In Clerk dashboard, add endpoint pointing to /api/clerk/webhook
//   2. Subscribe to user.created (and user.updated if you want name sync)
//   3. Put the signing secret into CLERK_WEBHOOK_SECRET (server env)

interface ClerkEvent {
  type: string;
  data: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    email_addresses?: Array<{ email_address: string; id: string }>;
    primary_email_address_id?: string | null;
  };
}

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 503 });
  }

  const h = await headers();
  const svixId = h.get('svix-id');
  const svixTs = h.get('svix-timestamp');
  const svixSig = h.get('svix-signature');
  if (!svixId || !svixTs || !svixSig) {
    return NextResponse.json({ error: 'missing_svix_headers' }, { status: 400 });
  }

  const raw = await req.text();
  let evt: ClerkEvent;
  try {
    const wh = new Webhook(secret);
    evt = wh.verify(raw, {
      'svix-id': svixId,
      'svix-timestamp': svixTs,
      'svix-signature': svixSig,
    }) as ClerkEvent;
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  if (evt.type !== 'user.created' && evt.type !== 'user.updated') {
    return NextResponse.json({ ok: true, ignored: evt.type });
  }

  const d = evt.data;
  const email =
    d.email_addresses?.find((e) => e.id === d.primary_email_address_id)?.email_address ??
    d.email_addresses?.[0]?.email_address ??
    null;
  const displayName =
    [d.first_name, d.last_name].filter(Boolean).join(' ').trim() || d.username || null;

  // Forward to the Worker's internal /__admin/user endpoint with a shared secret.
  const worker = process.env.NEXT_PUBLIC_WORKER_URL || 'http://127.0.0.1:8787';
  const adminSecret = process.env.WORKER_ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json({ error: 'worker_admin_secret_missing' }, { status: 503 });
  }
  const r = await fetch(`${worker}/__admin/user`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-secret': adminSecret },
    body: JSON.stringify({ id: d.id, email, display_name: displayName }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    return NextResponse.json({ error: 'worker_upsert_failed', detail: txt }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
