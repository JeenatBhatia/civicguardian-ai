// app/api/cron/sla-check/route.js
import { NextResponse } from 'next/server';
import { runSlaSweep } from '@/lib/slaCheck';

export const runtime = 'nodejs';        // Firebase client SDK needs Node, not edge
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const auth = req.headers.get('authorization') || '';
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const result = await runSlaSweep();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('cron sla-check failed', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}