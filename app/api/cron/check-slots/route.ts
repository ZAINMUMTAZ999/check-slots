import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import axios from 'axios';

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

    // 1. Remove hidden scripts, styles, and HTML tags to get pure, readable sentences
    const currentText = response.data
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]*>?/gm, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // We changed the key name so it doesn't conflict with the old hash
    const stateKey = 'gvcw_public_news_text';
    const previousText = await redis.get(stateKey);

    // 2. CHECK FOR CRUD ACTIVITY (Using real text now)
    if (previousText && previousText !== currentText) {
       await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, 
         `⚠️ ADMIN ACTIVITY: GVCW News Page words were updated! Check the site.`, 
         { headers: { 'Priority': 'urgent', 'Tags': 'newspaper,loudspeaker' }}
       );
    } else if (!previousText) {
       await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, 
         `🔄 DATABASE CRUD: News text was deleted from Redis and has been restored!`, 
         { headers: { 'Priority': 'high' }}
       );
    }

    // 3. Save the readable text into Upstash so you can see it!
    await redis.set(stateKey, currentText);
    
    return NextResponse.json({ success: true, message: "Public page text checked and saved successfully!" });

  } catch (error: any) {
    return NextResponse.json({ error: "Failed to check public site" }, { status: 500 });
  }
}