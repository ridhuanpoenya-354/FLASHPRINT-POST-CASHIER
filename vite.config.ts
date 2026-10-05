import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

interface RelayStoredMessage {
  msgId: string;
  sessionCode: string;
  type: string;
  sku?: string;
  deltaQty?: number;
  sendMode?: string;
  deviceName?: string;
  itemName?: string;
  unitPrice?: number;
  unitCost?: number;
  unit?: string;
  timestamp: number;
  serverTime: number;
  serverSeq: number;
}

function createRemoteCameraRelayPlugin(): Plugin {
  let globalSeq = 1;
  let globalCatalog: unknown[] = [];
  let globalMessages: RelayStoredMessage[] = [];
  let lastDesktopSeenMs = 0;
  const globalSseClients = new Set<ServerResponse>();

  const sessionStore = new Map<
    string,
    {
      messages: RelayStoredMessage[];
      sseClients: Set<ServerResponse>;
      catalog: unknown[];
      lastDesktopSeenMs: number;
    }
  >();

  const getOrCreateSession = (code: string) => {
    let entry = sessionStore.get(code);
    if (!entry) {
      entry = {
        messages: [],
        sseClients: new Set(),
        catalog: [],
        lastDesktopSeenMs: 0,
      };
      sessionStore.set(code, entry);
    }
    return entry;
  };

  const storeAndBroadcastMessage = (payload: Record<string, unknown>) => {
    const sessionCode = String(payload.sessionCode || 'GLOBAL').trim();
    const session = getOrCreateSession(sessionCode);
    const now = Date.now();
    const msgId = String(payload.msgId || '');

    let stored =
      session.messages.find((m) => m.msgId === msgId) ||
      globalMessages.find((m) => m.msgId === msgId);

    if (!stored) {
      stored = {
        ...(payload as unknown as RelayStoredMessage),
        msgId,
        sessionCode,
        serverTime: now,
        serverSeq: ++globalSeq,
      };
      session.messages.push(stored);
      session.messages = session.messages
        .filter((m) => now - m.serverTime <= 5 * 60 * 1000)
        .slice(-120);

      globalMessages.push(stored);
      globalMessages = globalMessages
        .filter((m) => now - m.serverTime <= 5 * 60 * 1000)
        .slice(-160);

      const sseData = `data: ${JSON.stringify(stored)}\n\n`;
      const notifiedClients = new Set<ServerResponse>();
      for (const client of Array.from(session.sseClients)) {
        try {
          client.write(sseData);
          notifiedClients.add(client);
        } catch {
          session.sseClients.delete(client);
        }
      }
      for (const client of Array.from(globalSseClients)) {
        if (notifiedClients.has(client)) continue;
        try {
          client.write(sseData);
        } catch {
          globalSseClients.delete(client);
        }
      }
    }
    return stored;
  };

  const attachMiddleware = (
    middlewares: {
      use: (
        fn: (
          req: IncomingMessage,
          res: ServerResponse,
          next: () => void
        ) => void
      ) => void;
    }
  ) => {
    middlewares.use((req, res, next) => {
      const rawUrl = req.url || '';
      if (!rawUrl.startsWith('/api/remote-camera')) {
        next();
        return;
      }

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      const parsedUrl = new URL(rawUrl, 'http://localhost');

      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += String(chunk);
          if (body.length > 256000) {
            body = body.slice(0, 256000);
          }
        });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}');
            const sessionCode = String(payload.sessionCode || 'GLOBAL').trim();

            if (payload.action === 'SYNC_CATALOG' && Array.isArray(payload.catalog)) {
              const session = getOrCreateSession(sessionCode);
              session.catalog = payload.catalog.slice(0, 300);
              globalCatalog = session.catalog;
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  ok: true,
                  catalogCount: session.catalog.length,
                })
              );
              return;
            }

            if (!payload.msgId) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'Missing msgId' }));
              return;
            }

            const stored = storeAndBroadcastMessage(payload);
            const session = getOrCreateSession(sessionCode);
            const now = Date.now();
            const isDesktopActive =
              session.sseClients.size > 0 ||
              globalSseClients.size > 0 ||
              now - session.lastDesktopSeenMs < 15000 ||
              now - lastDesktopSeenMs < 15000;

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: true,
                serverSeq: stored.serverSeq,
                serverTime: stored.serverTime,
                desktopConnected: isDesktopActive,
              })
            );
          } catch {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
          }
        });
        return;
      }

      if (req.method === 'GET' && parsedUrl.pathname === '/api/remote-camera/stream') {
        const sessionCode = (parsedUrl.searchParams.get('sessionCode') || 'GLOBAL').trim();

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.write(`: connected session=${sessionCode}\n\n`);

        const session = getOrCreateSession(sessionCode);
        const now = Date.now();
        session.lastDesktopSeenMs = now;
        lastDesktopSeenMs = now;

        const recentToSend = new Map<string, RelayStoredMessage>();
        for (const msg of globalMessages) {
          if (now - msg.serverTime <= 90000) {
            recentToSend.set(msg.msgId, msg);
          }
        }
        for (const msg of session.messages) {
          if (now - msg.serverTime <= 90000) {
            recentToSend.set(msg.msgId, msg);
          }
        }
        for (const msg of recentToSend.values()) {
          res.write(`data: ${JSON.stringify(msg)}\n\n`);
        }

        session.sseClients.add(res);
        globalSseClients.add(res);
        const keepAliveTimer = setInterval(() => {
          try {
            const tickNow = Date.now();
            session.lastDesktopSeenMs = tickNow;
            lastDesktopSeenMs = tickNow;
            res.write(': ping\n\n');
          } catch {
            clearInterval(keepAliveTimer);
            session.sseClients.delete(res);
            globalSseClients.delete(res);
          }
        }, 12000);

        req.on('close', () => {
          clearInterval(keepAliveTimer);
          session.sseClients.delete(res);
          globalSseClients.delete(res);
        });
        return;
      }

      if (req.method === 'GET') {
        const action = parsedUrl.searchParams.get('action') || '';
        if (action === 'SEND') {
          try {
            const rawPayload = parsedUrl.searchParams.get('payload') || '{}';
            const payload = JSON.parse(rawPayload);
            if (!payload.msgId) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'Missing msgId' }));
              return;
            }
            const sessionCode = String(payload.sessionCode || 'GLOBAL').trim();
            const stored = storeAndBroadcastMessage(payload);
            const session = getOrCreateSession(sessionCode);
            const now = Date.now();
            const isDesktopActive =
              session.sseClients.size > 0 ||
              globalSseClients.size > 0 ||
              now - session.lastDesktopSeenMs < 15000 ||
              now - lastDesktopSeenMs < 15000;

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: true,
                serverSeq: stored.serverSeq,
                serverTime: stored.serverTime,
                desktopConnected: isDesktopActive,
              })
            );
          } catch {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'Invalid payload' }));
          }
          return;
        }

        const sessionCode = (parsedUrl.searchParams.get('sessionCode') || 'GLOBAL').trim();
        const role = parsedUrl.searchParams.get('role') || '';
        const sinceSeq = parseInt(parsedUrl.searchParams.get('sinceSeq') || '0', 10) || 0;
        const includeCatalog = parsedUrl.searchParams.get('includeCatalog') === '1';
        const session = getOrCreateSession(sessionCode);
        const now = Date.now();

        if (role === 'desktop') {
          session.lastDesktopSeenMs = now;
          lastDesktopSeenMs = now;
        }

        const mergedMap = new Map<string, RelayStoredMessage>();
        for (const m of globalMessages) {
          if (
            now - m.serverTime <= 120000 &&
            (sinceSeq <= 0 || m.serverSeq > sinceSeq)
          ) {
            mergedMap.set(m.msgId, m);
          }
        }
        for (const m of session.messages) {
          if (
            now - m.serverTime <= 120000 &&
            (sinceSeq <= 0 || m.serverSeq > sinceSeq)
          ) {
            mergedMap.set(m.msgId, m);
          }
        }
        const recent = Array.from(mergedMap.values()).sort(
          (a, b) => a.serverSeq - b.serverSeq
        );
        const catalogToReturn =
          includeCatalog
            ? session.catalog.length > 0
              ? session.catalog
              : globalCatalog
            : undefined;

        const isDesktopActive =
          session.sseClients.size > 0 ||
          globalSseClients.size > 0 ||
          now - session.lastDesktopSeenMs < 15000 ||
          now - lastDesktopSeenMs < 15000;

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            ok: true,
            serverNow: now,
            desktopConnected: isDesktopActive,
            messages: recent,
            ...(includeCatalog ? { catalog: catalogToReturn || [] } : {}),
          })
        );
        return;
      }

      next();
    });
  };

  return {
    name: 'cetakpro-remote-camera-relay',
    configureServer(server) {
      attachMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), createRemoteCameraRelayPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
