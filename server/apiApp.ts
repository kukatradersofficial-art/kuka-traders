import dotenv from 'dotenv';
import express, { type Express } from 'express';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

if (!process.env.VERCEL) {
  dotenv.config();
}

const DEFAULT_ADMIN_EMAILS = [
  'mursaleewandroo@gmail.com',
  'kukatraders.official@gmail.com',
];

function getAuthorizedAdminEmails(): Set<string> {
  const extra = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_ADMIN_EMAILS, ...extra]);
}

function getFirebaseApiKey(): string {
  const envKey =
    process.env.FIREBASE_API_KEY?.trim() ||
    process.env.VITE_FIREBASE_API_KEY?.trim();
  if (envKey) return envKey;

  const candidatePaths = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(process.cwd(), '..', 'firebase-applet-config.json'),
    '/var/task/firebase-applet-config.json',
  ];
  if (typeof __dirname === 'string') {
    candidatePaths.push(path.resolve(__dirname, '..', 'firebase-applet-config.json'));
  }

  for (const configPath of candidatePaths) {
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw) as { apiKey?: string };
        if (parsed.apiKey) return parsed.apiKey;
      }
    } catch {
      // Try next path
    }
  }
  return '';
}

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

interface CatalogItemContext {
  name: string;
  brand: string;
  packSize: string;
  sellingPrice: number;
  priceStatus: string;
  stockQuantity: number;
  categoryName: string;
}

export function createApiApp(): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // 1. Health Check
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'kuka-traders-server',
      runtime: process.env.VERCEL ? 'vercel-serverless' : 'node-express',
      timestamp: new Date().toISOString(),
    });
  });

  // 2. Server-side Admin Session Verification (Firebase Auth REST verification)
  app.post('/api/admin/verify-session', async (req, res) => {
    try {
      const { idToken } = (req.body || {}) as { idToken?: string };
      if (!idToken || typeof idToken !== 'string') {
        res.status(401).json({ authorized: false, error: 'Missing Firebase ID token.' });
        return;
      }

      const apiKey = getFirebaseApiKey();
      if (!apiKey) {
        res.status(500).json({ authorized: false, error: 'Firebase configuration missing on server.' });
        return;
      }

      const lookupRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        }
      );

      if (!lookupRes.ok) {
        res.status(401).json({ authorized: false, error: 'Invalid or expired authentication session.' });
        return;
      }

      const lookupData = (await lookupRes.json()) as {
        users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
      };
      const fbUser = lookupData.users?.[0];
      if (!fbUser || !fbUser.email || !fbUser.emailVerified) {
        res.status(403).json({
          authorized: false,
          error: 'Verified email authentication is required for admin access.',
        });
        return;
      }

      const normalizedEmail = fbUser.email.trim().toLowerCase();
      const authorizedEmails = getAuthorizedAdminEmails();
      if (!authorizedEmails.has(normalizedEmail)) {
        res.status(403).json({
          authorized: false,
          error:
            'Access denied. Only authorized KUKA TRADERS administrator accounts may access the Admin Dashboard.',
        });
        return;
      }

      res.json({
        authorized: true,
        uid: fbUser.localId,
        email: normalizedEmail,
      });
    } catch (err) {
      console.error('Admin verification error:', err);
      res.status(500).json({
        authorized: false,
        error: err instanceof Error ? err.message : 'Failed to verify admin session.',
      });
    }
  });

  const resolveSafeHttpsUrl = (candidate: unknown, fallback: string): string => {
    if (typeof candidate === 'string' && candidate.trim()) {
      try {
        const parsed = new URL(candidate.trim());
        if (parsed.protocol === 'https:') {
          return parsed.toString();
        }
      } catch {
        // Fall through to fallback
      }
    }
    return fallback;
  };

  // 3. Payment Gateway Configuration Status (never exposes secrets)
  app.get('/api/payments/status', (_req, res) => {
    const zapApiKey = Boolean(process.env.ZAP_UPI_API_KEY && process.env.ZAP_UPI_API_KEY.trim());
    const zapSecret = Boolean(process.env.ZAP_UPI_SECRET_KEY && process.env.ZAP_UPI_SECRET_KEY.trim());
    const zapMerchant = Boolean(process.env.ZAP_UPI_MERCHANT_ID && process.env.ZAP_UPI_MERCHANT_ID.trim());
    const zapCreateUrl = Boolean(process.env.ZAP_UPI_CREATE_URL && process.env.ZAP_UPI_CREATE_URL.trim());
    const zapVerifyUrl = Boolean(process.env.ZAP_UPI_VERIFY_URL && process.env.ZAP_UPI_VERIFY_URL.trim());
    const gatewayKey = Boolean(process.env.PAYMENT_GATEWAY_KEY_ID && process.env.PAYMENT_GATEWAY_KEY_SECRET);

    res.json({
      runtime: process.env.VERCEL ? 'vercel-serverless' : 'node-express',
      zapUpiConfigured: zapApiKey && zapSecret,
      zapUpiMerchantConfigured: zapMerchant,
      otherGatewayConfigured: gatewayKey,
      vars: {
        ZAP_UPI_API_KEY: zapApiKey,
        ZAP_UPI_SECRET_KEY: zapSecret,
        ZAP_UPI_MERCHANT_ID: zapMerchant,
        ZAP_UPI_CREATE_URL: zapCreateUrl,
        ZAP_UPI_VERIFY_URL: zapVerifyUrl,
        PAYMENT_GATEWAY_KEY_ID: Boolean(process.env.PAYMENT_GATEWAY_KEY_ID?.trim()),
        PAYMENT_GATEWAY_KEY_SECRET: Boolean(process.env.PAYMENT_GATEWAY_KEY_SECRET?.trim()),
      },
      missingVars: [
        ...(!zapApiKey ? ['ZAP_UPI_API_KEY'] : []),
        ...(!zapSecret ? ['ZAP_UPI_SECRET_KEY'] : []),
        ...(!zapMerchant ? ['ZAP_UPI_MERCHANT_ID'] : []),
      ],
    });
  });

  // 4. Create Zap UPI Payment Order (Disabled until credentials configured)
  app.post('/api/payments/create-zap-order', async (req, res) => {
    const zapApiKey = process.env.ZAP_UPI_API_KEY?.trim();
    const zapSecret = process.env.ZAP_UPI_SECRET_KEY?.trim();

    if (!zapApiKey || !zapSecret) {
      res.status(503).json({
        configured: false,
        error:
          'Zap UPI API credentials are not configured on the server. Automated UPI payment verification is disabled until ZAP_UPI_API_KEY and ZAP_UPI_SECRET_KEY are set in Vercel/server environment variables.',
      });
      return;
    }

    const { orderNumber, amount, customerPhone, customerName, merchantId, createUrl: customCreateUrl } =
      (req.body || {}) as {
        orderNumber?: string;
        amount?: number;
        customerPhone?: string;
        customerName?: string;
        merchantId?: string;
        createUrl?: string;
      };

    if (!orderNumber || typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({ configured: true, error: 'Invalid order number or amount.' });
      return;
    }

    try {
      const createUrl = resolveSafeHttpsUrl(
        process.env.ZAP_UPI_CREATE_URL || customCreateUrl,
        'https://api.zapupi.com/api/create-order'
      );
      const resolvedMerchantId =
        process.env.ZAP_UPI_MERCHANT_ID?.trim() || (typeof merchantId === 'string' ? merchantId.trim() : '');
      const upstream = await fetch(createUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token_key: zapApiKey,
          secret_key: zapSecret,
          ...(resolvedMerchantId ? { merchant_id: resolvedMerchantId } : {}),
          amount: amount.toFixed(2),
          order_id: orderNumber,
          customer_mobile: customerPhone || '',
          remark: `KUKA TRADERS Order ${orderNumber} (${customerName || 'Customer'})`,
        }),
      });

      const data = await upstream.json();
      if (!upstream.ok) {
        res.status(502).json({
          configured: true,
          error: 'Zap UPI provider rejected order creation.',
          providerResponse: data,
        });
        return;
      }

      res.json({ configured: true, providerResponse: data });
    } catch (err) {
      res.status(502).json({
        configured: true,
        error: err instanceof Error ? err.message : 'Unable to reach Zap UPI gateway.',
      });
    }
  });

  // 5. Server-Side UPI Transaction Verification (Never fakes payment success)
  app.post('/api/payments/verify-upi', async (req, res) => {
    const zapApiKey = process.env.ZAP_UPI_API_KEY?.trim();
    const zapSecret = process.env.ZAP_UPI_SECRET_KEY?.trim();
    const { orderNumber, utrNumber, merchantId, verifyUrl: customVerifyUrl } = (req.body || {}) as {
      orderNumber?: string;
      utrNumber?: string;
      merchantId?: string;
      verifyUrl?: string;
    };

    if (!orderNumber) {
      res.status(400).json({ verified: false, error: 'Order number is required.' });
      return;
    }

    if (!zapApiKey || !zapSecret) {
      res.status(503).json({
        verified: false,
        configured: false,
        status: 'PAYMENT_GATEWAY_NOT_CONFIGURED',
        message:
          'Automated Zap UPI verification is disabled because ZAP_UPI_API_KEY and ZAP_UPI_SECRET_KEY are not configured in Vercel/server environment variables. Orders remain Pending until verified by the store admin.',
      });
      return;
    }

    try {
      const verifyUrl = resolveSafeHttpsUrl(
        process.env.ZAP_UPI_VERIFY_URL || customVerifyUrl,
        'https://api.zapupi.com/api/check-order-status'
      );
      const resolvedMerchantId =
        process.env.ZAP_UPI_MERCHANT_ID?.trim() || (typeof merchantId === 'string' ? merchantId.trim() : '');
      const upstream = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token_key: zapApiKey,
          secret_key: zapSecret,
          ...(resolvedMerchantId ? { merchant_id: resolvedMerchantId } : {}),
          order_id: orderNumber,
          utr: utrNumber || undefined,
        }),
      });

      const payload = (await upstream.json()) as {
        status?: string;
        data?: { status?: string; utr?: string };
      };
      const txStatus = (payload?.data?.status || payload?.status || '').toUpperCase();
      const isPaid = txStatus === 'SUCCESS' || txStatus === 'PAID' || txStatus === 'COMPLETED';

      res.json({
        verified: isPaid,
        configured: true,
        status: txStatus || 'PENDING',
        utr: payload?.data?.utr || utrNumber || '',
        message: isPaid
          ? 'Payment verified with Zap UPI.'
          : 'Transaction is not confirmed as paid by Zap UPI yet.',
      });
    } catch (err) {
      res.status(502).json({
        verified: false,
        configured: true,
        error: err instanceof Error ? err.message : 'Failed to verify payment with Zap UPI.',
      });
    }
  });

  // 6. Multi-Turn Gemini Store Assistant Chatbot (models/gemini-4-hydrogen)
  app.post('/api/chat', async (req, res) => {
    const ai = getGenAIClient();
    if (!ai) {
      res.status(503).json({
        error: 'Gemini API key is not configured on the server. Please configure GEMINI_API_KEY in environment settings.',
      });
      return;
    }

    try {
      const { message, history = [], catalogContext = [], language = 'en' } = (req.body || {}) as {
        message?: string;
        history?: ChatTurn[];
        catalogContext?: CatalogItemContext[];
        language?: 'en' | 'ur';
      };

      if (!message || typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: 'Message is required.' });
        return;
      }

      const catalogLines = catalogContext
        .slice(0, 60)
        .map((p) => {
          const priceStr =
            p.priceStatus === 'approved' && p.sellingPrice > 0
              ? `₹${p.sellingPrice}`
              : 'Admin Price Required (call/WhatsApp +91 7006183435)';
          const stockStr = p.stockQuantity > 0 ? `${p.stockQuantity} in stock` : 'Out of stock';
          return `- ${p.name} (${p.brand}, ${p.packSize}) [${p.categoryName}]: ${priceStr} | ${stockStr}`;
        })
        .join('\n');

      const systemInstruction = `You are the helpful, polite customer shopping assistant for KUKA TRADERS, a local Indian grocery, kitchen essentials, household supplies, and cattle feed store located at Main Bazar, near Jamia Masjid, Sopore, Baramulla, Jammu & Kashmir (PIN 193201).

Strict rules:
1. Only discuss products, prices, and categories from KUKA TRADERS. Never invent meat, fish, chicken, eggs, cheese, yogurt, or fresh produce—KUKA TRADERS does not carry those items.
2. Never invent or guess a price that is not in the live catalog below. If an item is marked "Admin Price Required" or not listed, tell the customer honestly and offer our official WhatsApp (+91 7006183435) for an instant Sopore shop quote.
3. Payment methods supported: Cash on Delivery (when enabled by admin) and UPI (with merchant verification). Never claim an order is paid unless verified.
4. Keep responses concise, warm, practical, and easy to scan (under 150 words unless asked for a list).
5. Preferred language: ${language === 'ur' ? 'Urdu (with polite Kashmiri/Sopore hospitality) or simple English if customer writes in English' : 'Clear English (and politely understand Urdu/Kashmiri grocery terms like Noon Chai, Rajma, Atta, Haldi, Gur)'}.

Live KUKA TRADERS Catalog Snapshot:
${catalogLines || '(Catalog is loading — direct customer to browse categories or WhatsApp +91 7006183435)'}`;

      const formattedHistory = history
        .filter((turn) => turn && typeof turn.text === 'string' && turn.text.trim())
        .slice(-16)
        .map((turn) => ({
          role: turn.role === 'model' ? 'model' : 'user',
          parts: [{ text: turn.text }],
        }));

      const chat = ai.chats.create({
        model: 'gemini-4-hydrogen',
        history: formattedHistory,
        config: {
          systemInstruction,
        },
      });

      const response = await chat.sendMessage({ message: message.trim() });
      const replyText = response.text;

      if (!replyText) {
        res.status(502).json({ error: 'Assistant returned an empty response.' });
        return;
      }

      res.json({ reply: replyText });
    } catch (err) {
      console.error('Gemini chat error:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to process chat request right now.',
      });
    }
  });

  return app;
}
