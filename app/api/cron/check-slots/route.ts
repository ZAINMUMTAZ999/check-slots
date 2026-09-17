import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import axios from 'axios';
import crypto from 'crypto';

// THE MAGIC FIX: Forces Vercel to actually run the code every single time instead of using memory!
export const dynamic = 'force-dynamic';

const redis = Redis.fromEnv();
const NTFY_TOPIC = 'zain_gvcw_secure_alert_99';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  
  if (secret !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await axios.get('https://pk-gr.gvcworld.eu/en/news', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
      },
      timeout: 10000,
    });

    const currentWebpageData = response.data;
    const currentHash = crypto.createHash('sha256').update(currentWebpageData).digest('hex');
    
    const stateKey = 'gvcw_public_news_state';
    const previousHash = await redis.get(stateKey);

    if (previousHash && previousHash !== currentHash) {
       await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, 
         `⚠️ ADMIN ACTIVITY: GVCW News Page was updated! Check the site.`, 
         { headers: { 'Priority': 'urgent', 'Tags': 'newspaper,loudspeaker' }}
       );
    } else if (!previousHash) {
       await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, 
         `🔄 DATABASE CRUD: News state was deleted from Redis and has been restored!`, 
         { headers: { 'Priority': 'high' }}
       );
    }

    await redis.set(stateKey, currentHash);
    return NextResponse.json({ success: true, message: "Public page checked and saved successfully!" });

  } catch (error: any) {
    return NextResponse.json({ error: "Failed to check public site" }, { status: 500 });
  }
}