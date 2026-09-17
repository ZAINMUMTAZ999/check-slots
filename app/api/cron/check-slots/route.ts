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

    const rawText = response.data
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]*>?/gm, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const newsRegex = /(\d{2}\/\d{2}\/\d{4})\s+(.*?)\s+READ ARTICLE/g;
    
    // Build the exact UI layout matching the website image
    let formattedWebpageLayout = "News\n\n";
    let match;
    
    while ((match = newsRegex.exec(rawText)) !== null) {
      // Recreates the visual gaps and the horizontal divider line
      formattedWebpageLayout += `${match[1]}\n\n${match[2].trim()}\n\nREAD ARTICLE\n\n─────────────────────────────────────────────────────────\n\n`;
    }

    const stateKey = 'gvcw_public_news_layout';
    const previousLayout = await redis.get(stateKey); 

    // Check for exact text changes in this visual layout
    if (previousLayout && previousLayout !== formattedWebpageLayout) {
       await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, 
         `⚠️ ADMIN ACTIVITY: GVCW News Page articles were updated!`, 
         { headers: { 'Priority': 'urgent', 'Tags': 'newspaper,loudspeaker' }}
       );
    } else if (!previousLayout) {
       await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, 
         `🔄 DATABASE CRUD: Visual news layout was restored in Redis!`, 
         { headers: { 'Priority': 'high' }}
       );
    }

    // Save the raw text block. Upstash will render the line breaks natively.
    await redis.set(stateKey, formattedWebpageLayout);
    
    return NextResponse.json({ success: true, message: "News layout parsed and saved to match the website!" });

  } catch (error: any) {
    return NextResponse.json({ error: "Failed to check public site" }, { status: 500 });
  }
}