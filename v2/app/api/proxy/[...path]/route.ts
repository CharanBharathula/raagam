import { auth } from '@clerk/nextjs/server';
import { type NextRequest, NextResponse } from 'next/server';

const WORKER = process.env.NEXT_PUBLIC_WORKER_URL || 'http://127.0.0.1:8787';

// ---------------------------------------------------------------
// Thin auth-forwarding proxy from the Next.js app to the Cloudflare
// Worker. The browser never sees the Worker URL directly — every
// client-side API call goes through `/api/proxy/...` so that we can
// attach the Clerk session token server-side.
// ---------------------------------------------------------------

async function forward(req: NextRequest, segments: string[]): Promise<Response> {
  const { getToken } = await auth();
  const token = await getToken().catch(() => null);

  const path = segments.join('/');
  const search = req.nextUrl.search || '';
  const target = `${WORKER}/${path}${search}`;

  const headers = new Headers();
  headers.set('accept', 'application/json');
  const contentType = req.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  if (token) headers.set('authorization', `Bearer ${token}`);
  // Pass through a small subset of useful headers
  const ua = req.headers.get('user-agent');
  if (ua) headers.set('user-agent', ua);

  const body =
    req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();

  const r = await fetch(target, {
    method: req.method,
    headers,
    body,
    cache: 'no-store',
  });

  // Stream the response back
  const respHeaders = new Headers(r.headers);
  respHeaders.delete('content-encoding');
  respHeaders.delete('content-length');
  return new NextResponse(r.body, { status: r.status, headers: respHeaders });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, path);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, path);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, path);
}
