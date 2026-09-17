import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import axios from 'axios';

const redis = Redis.fromEnv();
const NTFY_TOPIC = 'zain_gvcw_secure_alert_99';
const DATES_TO_CHECK = ["07/09/2026", "08/09/2026", "01/10/2026"]; 
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function GET(req: Request) {
  // NEW: Security check for cron-job.org
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  
  if (secret !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let slotsFound = false;
  const token = await redis.get('gvcw_bearer_token');

if (!token) {
    return NextResponse.json({ status: "No token found, skipping check." }, { status: 200 });
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
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Cookie': `${token}`, 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
        },
        timeout: 10000,
      });

      const slots = response.data; 
      const currentDataString = JSON.stringify(slots);
      const stateKey = `gvcw_data_state_${date.replace(/\//g, '')}`;
      const previousDataString = await redis.get(stateKey);

      if (previousDataString && previousDataString !== currentDataString) {
         await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, 
           `⚠️ ADMIN ACTIVITY: Backend data changed for ${date}!`, 
           { headers: { 'Priority': 'high' }}
         );
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
        console.error("Token Expired! 401 Unauthorized.");
        const expCache = await redis.get('token_exp_alerted');
        if (!expCache) {
           await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, 
             `⚠️ GVCW Worker Stopped! Your session token expired (401).`, 
             { headers: { 'Title': 'TOKEN EXPIRED', 'Priority': 'high' }}
           );
           await redis.setex('token_exp_alerted', 1800, "true"); 
        }
        break; 
      }
    }

    if (i < DATES_TO_CHECK.length - 1) await sleep(2500); 
  }

  return NextResponse.json({ success: true, slotsFound });
}