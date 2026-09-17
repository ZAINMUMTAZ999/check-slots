import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import axios from 'axios';
import crypto from 'crypto';

export const maxDuration = 60; 

const redis = Redis.fromEnv();
const NTFY_TOPIC = 'zain_gvcw_secure_alert_99';

function getDynamicDates(daysAhead: number) {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    dates.push(`${day}/${month}/${year}`);
  }
  return dates;
}

const DATES_TO_CHECK = getDynamicDates(14); 
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  
  if (secret !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ==========================================
  // PART 1: PUBLIC NEWS PAGE CHECK (No token needed)
  // ==========================================
  try {
    const newsResponse = await axios.get('https://pk-gr.gvcworld.eu/en/news', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' },
      timeout: 10000,
    });

    const currentHash = crypto.createHash('sha256').update(newsResponse.data).digest('hex');
    const newsStateKey = 'gvcw_public_news_state';
    const previousHash = await redis.get(newsStateKey);

    if (previousHash && previousHash !== currentHash) {
       await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, 
         `⚠️ ADMIN ACTIVITY: GVCW News Page was updated!`, 
         { headers: { 'Priority': 'urgent' }}
       );
    } else if (!previousHash) {
       await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, 
         `🔄 DATABASE CRUD: News state restored in Redis!`, 
         { headers: { 'Priority': 'high' }}
       );
    }
    await redis.set(newsStateKey, currentHash);
  } catch (error) {
    console.error("News check failed", error);
  }

  // ==========================================
  // PART 2: PRIVATE APPOINTMENT SLOTS CHECK
  // ==========================================
  let slotsFound = false;
  const token = await redis.get('gvcw_bearer_token');

  if (!token) {
    const missingAlerted = await redis.get('missing_token_alerted');
    if (!missingAlerted) {
      await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, 
        `🚨 DATABASE ERROR: No GVCW token found for slots!`, 
        { headers: { 'Priority': 'urgent' }}
      );
      await redis.setex('missing_token_alerted', 86400, "true"); 
    }
    return NextResponse.json({ success: true, message: "News checked, but missing token for slots." });
  } else {
    await redis.del('missing_token_alerted');
  }

  for (let i = 0; i < DATES_TO_CHECK.length; i++) {
    const date = DATES_TO_CHECK[i];

    try {
      const response = await axios.post('https://pk-gr-services.gvcworld.eu/api/v1/periodslot/slots', 
      {
        appointmentId: "undefined", bookingfor: 0, datefrom: date, 
        howmanyapplicantsareunder12: 0, id: 0, members: 1, method: 1, 
        travelpurposes: -1, type: 26, vac: { id: 137 } 
      }, 
      {
        headers: {
          'Accept': 'application/json', 'Content-Type': 'application/json',
          'Cookie': `${token}`, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
        },
        timeout: 10000,
      });

      const slots = response.data; 
      const currentDataString = JSON.stringify(slots);
      const stateKey = `gvcw_data_state_${date.replace(/\//g, '')}`;
      const previousDataString = await redis.get(stateKey);

      if (previousDataString !== currentDataString) {
         let alertMessage = `⚠️ ADMIN ACTIVITY: Backend slots changed for ${date}!`;
         if (!previousDataString) {
            alertMessage = `🔄 DATABASE CRUD: Slot data for ${date} restored!`;
         }
         await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, alertMessage, { headers: { 'Priority': 'high' }});
      }
      await redis.set(stateKey, currentDataString);

      if (slots && slots.length > 0) {
        slotsFound = true;
        const cacheKey = `notified_${date.replace(/\//g, '')}`;
        const hasBeenNotified = await redis.get(cacheKey);
        if (!hasBeenNotified) {
          await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, `🚨 SLOTS OPEN FOR ${date}!`, { headers: { 'Priority': 'urgent' }});
          await redis.setex(cacheKey, 1800, "true");
        }
      }
    } catch (error: any) {
      if (error.response && error.response.status === 401) {
        const expCache = await redis.get('token_exp_alerted');
        if (!expCache) {
           await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, 
             `⚠️ GVCW Worker Stopped! Token expired (401).`, 
             { headers: { 'Priority': 'high' }}
           );
           await redis.setex('token_exp_alerted', 1800, "true"); 
        }
        break; 
      }
    }
    if (i < DATES_TO_CHECK.length - 1) await sleep(1500); 
  }

  return NextResponse.json({ success: true, slotsFound, datesChecked: DATES_TO_CHECK.length });
}