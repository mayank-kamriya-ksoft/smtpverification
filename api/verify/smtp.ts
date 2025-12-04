import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  maxDuration: 30,
};

interface VerificationResult {
  email: string;
  status: string;
  smtp_code: number;
  mx_server: string;
  attempts: number;
  is_catch_all: boolean;
  is_temporary_error: boolean;
  can_deliver: boolean | null;
  is_inbox_full: boolean | null;
  reason: string;
  time_taken_ms: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Check for backend URL configuration
  const backendUrl = process.env.SMTP_BACKEND_URL;

  if (backendUrl) {
    // Proxy to external SMTP verification backend (e.g., Replit, Railway, Fly.io)
    try {
      console.log(`Proxying SMTP verification request to: ${backendUrl}`);
      
      const response = await fetch(`${backendUrl}/api/verify/smtp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (error: any) {
      console.error('Backend proxy error:', error);
      return res.status(502).json({
        email,
        status: 'unknown',
        smtp_code: 0,
        mx_server: 'proxy_error',
        attempts: 1,
        is_catch_all: false,
        is_temporary_error: true,
        can_deliver: null,
        is_inbox_full: null,
        reason: `Backend unavailable: ${error.message}`,
        time_taken_ms: 0,
      });
    }
  }

  // Without a backend configured, return a helpful message
  // Note: Direct SMTP verification is not possible on Vercel due to port 25 restrictions
  return res.status(503).json({
    email,
    status: 'unknown',
    smtp_code: 0,
    mx_server: 'not_configured',
    attempts: 0,
    is_catch_all: false,
    is_temporary_error: true,
    can_deliver: null,
    is_inbox_full: null,
    reason: 'SMTP backend not configured. Set SMTP_BACKEND_URL environment variable to point to your SMTP verification server.',
    time_taken_ms: 0,
  } as VerificationResult);
}
