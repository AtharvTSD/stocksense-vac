import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const ids = new Set(['reliance', 'tcs', 'apple', 'microsoft']);
async function proxy(request: NextRequest, segments: string[]) {
  const isGet = request.method === 'GET';
  const refresh = segments[0] === 'refresh';
  const allowed = isGet ? segments.join('/') === 'status' || segments.join('/') === 'stocks' || (segments[0] === 'stocks' && segments.length === 2 && ids.has(segments[1])) || (refresh && segments.length === 2 && /^web-(India|US)-[a-f0-9]{32}$/.test(segments[1])) : (refresh && segments.length === 1) || (segments[0] === 'stocks' && ids.has(segments[1]) && segments[2] === 'ask' && segments.length === 3);
  if (!allowed) return NextResponse.json({ error: 'route-not-allowed' }, { status: 404 });
  const configured = process.env.BACKEND_URL || (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8000' : '');
  if (!configured) return NextResponse.json({ error: 'backend-not-configured' }, { status: 503 });
  try {
    const url = new URL(configured);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
    let body: string | undefined;
    if (!isGet) {
      if (Number(request.headers.get('content-length') || 0) > 4096) return NextResponse.json({ error: 'question-too-large' }, { status: 413 });
      const input = await request.json();
      if (refresh) {
        if (!['India', 'US'].includes(input.market)) return NextResponse.json({ error: 'invalid-market' }, { status: 422 });
        body = JSON.stringify({ market: input.market });
      } else {
        if (typeof input.question !== 'string' || input.question.length < 3 || input.question.length > 600 || (input.scope !== undefined && !['stock', 'market'].includes(input.scope))) return NextResponse.json({ error: 'invalid-question' }, { status: 422 });
        body = JSON.stringify({ question: input.question, scope: input.scope || 'stock' });
      }
    }
    const upstream = await fetch(new URL('/v1/' + segments.join('/'), url), { method: request.method, headers: { 'Content-Type': 'application/json' }, body, cache: 'no-store', signal: AbortSignal.timeout(50_000) });
    const data = await upstream.json();
    if (!upstream.ok) return NextResponse.json({ error: typeof data.error === 'string' && /^[a-z0-9-]+$/.test(data.error) ? data.error : 'backend-unavailable' }, { status: upstream.status });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'backend-warming-or-unavailable' }, { status: 503, headers: { 'Retry-After': '10' } });
  }
}
export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) { return proxy(request, (await context.params).path); }
export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) { return proxy(request, (await context.params).path); }
