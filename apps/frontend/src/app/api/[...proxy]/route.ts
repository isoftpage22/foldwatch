import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001';

async function proxyRequest(req: NextRequest) {
  const path = req.nextUrl.pathname.replace(/^\/api/, '');
  const url = `${BACKEND_URL}/api${path}${req.nextUrl.search}`;

  const headers = new Headers();
  headers.set('Content-Type', 'application/json');

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const body = await req.text();
    if (body) init.body = body;
  }

  const res = await fetch(url, init);
  const data = await res.text();

  return new NextResponse(data, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
