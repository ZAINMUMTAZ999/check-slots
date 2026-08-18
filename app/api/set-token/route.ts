import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const token = searchParams.get('token');

  // Explicitly check against ADMIN_SECRET_KEY
  if (secret !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  await redis.set('gvcw_bearer_token', token);
  return NextResponse.json({ success: true, message: 'Token saved successfully!' });
}