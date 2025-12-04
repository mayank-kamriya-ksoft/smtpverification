import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'CleanSignups SMTP Verification',
    environment: 'vercel',
    note: 'SMTP verification requires SMTP_BACKEND_URL environment variable to be set'
  });
}
