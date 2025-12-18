// Cron API Route - Process Escrow Events
// 
// Called periodically to scan for and process EscrowClosed events.
// 
// DEPLOYMENT:
// - Vercel Cron: Add to vercel.json
// - Railway: Use cron job feature
// - Manual: Call via curl or scheduler
// 
// vercel.json example:
// {
//   "crons": [{
//     "path": "/api/cron/process-events",
//     "schedule": "every 5 minutes"
//   }]
// }

import { NextRequest, NextResponse } from 'next/server';
import { runEventScan } from '@/lib/event-listener';

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Verify authorization
  const authHeader = request.headers.get('authorization');
  
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[CRON] Starting escrow event scan...');
    
    const result = await runEventScan();
    
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('[CRON] Event scan failed:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// Also support POST for flexibility
export async function POST(request: NextRequest) {
  return GET(request);
}
