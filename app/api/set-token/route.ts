import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const token = searchParams.get('token');

  // Check against your exact Vercel environment variable
  if (secret !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: 'Unauthorized', receivedSecret: secret }, { status: 401 });
  }

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  // Save the session cookie/token to Redis
  await redis.set('gvcw_bearer_token', token);
  return NextResponse.json({ success: true, message: 'Token saved successfully!' });
}