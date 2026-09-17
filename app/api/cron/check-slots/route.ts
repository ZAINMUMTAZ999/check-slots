

import { NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { Redis } from '@upstash/redis';
import axios from 'axios';

const redis = Redis.fromEnv();
const NTFY_TOPIC = 'zain_gvcw_secure_alert_99';
const DATES_TO_CHECK = ["09/16/2026", "10/01/2026"];
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const POST = verifySignatureAppRouter(async (req: Request) => {
  let slotsFound = false;

  // 1. Fetch the active token from Redis instead of process.env
  const token = await redis.get('gvcw_active_token');

  if (!token) {
    console.error("No GVCW token found in Redis!");
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
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
          'Authorization': `Bearer ${token}`, 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
        },
        timeout: 10000,
      });

      const slots = response.data; 

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
        // 2. THE TOKEN EXPIRED! Alert your phone immediately
        console.error("Token Expired! 401 Unauthorized.");
        
        // Prevent spamming the expiration alert every 3 minutes
        const expCache = await redis.get('token_exp_alerted');
        if (!expCache) {
           await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, 
             `⚠️ GVCW Worker Stopped! Your session token expired (401). Please update the token in Redis.`, 
             { headers: { 'Title': 'TOKEN EXPIRED', 'Priority': 'high' }}
           );
           await redis.setex('token_exp_alerted', 1800, "true"); // Silence alert for 30 mins
        }
        break; // Stop checking the other dates if the token is dead
      }
    }

    if (i < DATES_TO_CHECK.length - 1) await sleep(2500); 
  }

  return NextResponse.json({ success: true, slotsFound });
});