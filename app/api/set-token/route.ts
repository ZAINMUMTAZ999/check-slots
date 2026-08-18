import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const newToken = searchParams.get('token');
  const secretKey = searchParams.get('secret');

  // Basic security so strangers can't overwrite your token
  if (secretKey !== 'my_secret_password_123') {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!newToken) {
    return NextResponse.json({ error: "No token provided" }, { status: 400 });
  }

  try {
    // Save the new token to Redis
    await redis.set('gvcw_active_token', newToken);
    
    // Clear the expiration alert block so the worker runs normally again
    await redis.del('token_exp_alerted');

    return NextResponse.json({ 
      success: true, 
      message: "GVCW Token successfully updated in Redis! Worker resumed." 
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save to Redis" }, { status: 500 });
  }
}