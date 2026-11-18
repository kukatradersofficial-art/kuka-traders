import type { IncomingMessage, ServerResponse } from 'http';
import { createApiApp } from '../server/apiApp.js';

let cachedApp: ReturnType<typeof createApiApp> | null = null;

export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (!cachedApp) {
      cachedApp = createApiApp();
    }
    return cachedApp(req as Parameters<typeof cachedApp>[0], res as Parameters<typeof cachedApp>[1]);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server initialization failed.';
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ authorized: false, error: message }));
  }
}

