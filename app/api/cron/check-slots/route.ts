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

    // THE MAGIC: Regex that precisely extracts only the Dates and Titles of the news articles
    const newsRegex = /(\d{2}\/\d{2}\/\d{4})\s+(.*?)\s+READ ARTICLE/g;
    const newsItems = [];
    let match;
    
    while ((match = newsRegex.exec(rawText)) !== null) {
      newsItems.push({
        date: match[1],
        title: match[2].trim()
      });
    }

    const stateKey = 'gvcw_public_news_list';
    
    // Upstash SDK automatically parses saved JSON back into a JavaScript Array
    const previousData = await redis.get(stateKey); 
    
    // Convert both to strings to check for exact changes
    const previousString = previousData ? JSON.stringify(previousData) : null;
    const currentString = JSON.stringify(newsItems);

    if (previousString && previousString !== currentString) {
       await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, 
         `⚠️ ADMIN ACTIVITY: GVCW News Page articles were updated!`, 
         { headers: { 'Priority': 'urgent', 'Tags': 'newspaper,loudspeaker' }}
       );
    } else if (!previousString) {
       await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, 
         `🔄 DATABASE CRUD: Structured news list was restored in Redis!`, 
         { headers: { 'Priority': 'high' }}
       );
    }

    // Save the array directly. Upstash will format it beautifully!
    await redis.set(stateKey, newsItems);
    
    return NextResponse.json({ success: true, message: "News list parsed and saved beautifully!" });

  } catch (error: any) {
    return NextResponse.json({ error: "Failed to check public site" }, { status: 500 });
  }
}