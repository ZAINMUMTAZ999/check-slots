import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import axios from 'axios';
import crypto from 'crypto';

const redis = Redis.fromEnv();
const NTFY_TOPIC = 'zain_gvcw_secure_alert_99';

export async function GET(req: Request) {
  // 1. Security check for cron-job.org
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  
  if (secret !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 2. Fetch the PUBLIC News page directly (No token required!)
    const response = await axios.get('https://pk-gr.gvcworld.eu/en/news', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
      },
      timeout: 10000,
    });

    // 3. Create a unique signature (hash) of the webpage's current exact state
    const currentWebpageData = response.data;
    const currentHash = crypto.createHash('sha256').update(currentWebpageData).digest('hex');
    
    const stateKey = 'gvcw_public_news_state';
    const previousHash = await redis.get(stateKey);

    // 4. CHECK FOR CRUD ACTIVITY (CMS Admin or Developer)
    if (previousHash && previousHash !== currentHash) {
       // ADMIN CRUD: The website changed!
       await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, 
         `⚠️ ADMIN ACTIVITY: GVCW News Page was updated! Check the site.`, 
         { headers: { 'Priority': 'urgent', 'Tags': 'newspaper,loudspeaker' }}
       );
    } else if (!previousHash) {
       // DEVELOPER CRUD: You deleted the key in Upstash!
       await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, 
         `🔄 DATABASE CRUD: News state was deleted from Redis and has been restored!`, 
         { headers: { 'Priority': 'high' }}
       );
    }

    // 5. Save the new state back to Upstash
    await redis.set(stateKey, currentHash);

    return NextResponse.json({ success: true, message: "Public page checked successfully." });

  } catch (error: any) {
    return NextResponse.json({ error: "Failed to check public site" }, { status: 500 });
  }
}