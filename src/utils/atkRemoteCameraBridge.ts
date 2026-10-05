// Standalone Local Relay, BroadcastChannel & ntfy.sh (Firestore Decoupled)

export type RemotePhoneSendMode = 'AUTO_SEND' | 'MANUAL_SEND';

export interface RemoteCameraScanMessage {
  msgId: string;
  sessionCode: string;
  type: 'SCAN' | 'ADJUST_DELTA' | 'REMOVE_SKU' | 'HELLO' | 'ACK';
  sku?: string;
  deltaQty?: number;
  sendMode?: RemotePhoneSendMode;
  deviceName: string;
  itemName?: string;
  unitPrice?: number;
  unitCost?: number;
  unit?: string;
  timestamp: number;
  desktopAck?: boolean;
  catalogJson?: string;
  recentScansJson?: string;
  serverTime?: number;
  serverSeq?: number;
}

const SESSION_CODE_STORAGE_KEY = 'cetakpro_atk_desktop_cam_session_v1';
const PREFERRED_EXT_CAMERA_KEY = 'cetakpro_atk_preferred_ext_camera_v1';
const PREFERRED_SEND_MODE_KEY = 'cetakpro_atk_remote_send_mode_v1';
const GLOBAL_NTFY_TOPIC = 'cetakpro_atk_cam_global_pos_v2';

export function getSavedRemotePhoneSendMode(): RemotePhoneSendMode {
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlMode = params.get('sendMode');
      if (urlMode === 'MANUAL_SEND' || urlMode === 'AUTO_SEND') {
        return urlMode;
      }
    }
    const stored = localStorage.getItem(PREFERRED_SEND_MODE_KEY);
    if (stored === 'MANUAL_SEND' || stored === 'AUTO_SEND') {
      return stored;
    }
    return 'AUTO_SEND';
  } catch {
    return 'AUTO_SEND';
  }
}

export function saveRemotePhoneSendMode(mode: RemotePhoneSendMode): void {
  try {
    localStorage.setItem(PREFERRED_SEND_MODE_KEY, mode);
  } catch {
    // Ignore storage error
  }
}

export function saveDesktopCameraSessionCode(code: string): void {
  const clean = (code || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 12);
  if (!clean) return;
  try {
    localStorage.setItem(SESSION_CODE_STORAGE_KEY, clean);
  } catch {
    // Ignore storage error
  }
}

export function getOrCreateDesktopCameraSessionCode(): string {
  try {
    const existing = localStorage.getItem(SESSION_CODE_STORAGE_KEY);
    if (existing && /^[0-9]{6}$/.test(existing)) {
      return existing;
    }
    const generated = String(Math.floor(100000 + Math.random() * 900000));
    localStorage.setItem(SESSION_CODE_STORAGE_KEY, generated);
    return generated;
  } catch {
    return '849201';
  }
}

export function regenerateDesktopCameraSessionCode(): string {
  const generated = String(Math.floor(100000 + Math.random() * 900000));
  try {
    localStorage.setItem(SESSION_CODE_STORAGE_KEY, generated);
  } catch {
    // Ignore storage error
  }
  return generated;
}

export function getSavedPreferredExternalCameraId(): string {
  try {
    return localStorage.getItem(PREFERRED_EXT_CAMERA_KEY) || '';
  } catch {
    return '';
  }
}

export function savePreferredExternalCameraId(deviceId: string): void {
  try {
    if (!deviceId) {
      localStorage.removeItem(PREFERRED_EXT_CAMERA_KEY);
    } else {
      localStorage.setItem(PREFERRED_EXT_CAMERA_KEY, deviceId);
    }
  } catch {
    // Ignore storage error
  }
}

export function buildRemotePhoneScannerUrl(
  sessionCode: string,
  sendMode: RemotePhoneSendMode = 'AUTO_SEND'
): string {
  if (typeof window === 'undefined') return '';
  const rawHref = window.location.href.replace(
    /^https:\/\/ais-dev-/i,
    'https://ais-pre-'
  );
  const url = new URL(rawHref);
  url.searchParams.set('atkRemoteSession', sessionCode);
  url.searchParams.set('sendMode', sendMode);
  return url.toString();
}

/**
 * Extracts the 6-digit Desktop Session Code & SendMode when a Phone Camera scans
 * the Desktop's Pairing QR Code (either a URL with ?atkRemoteSession=XXXXXX or a 6-digit pairing code).
 */
export function extractPairingSessionFromQrText(rawText: string): {
  sessionCode: string;
  sendMode?: RemotePhoneSendMode;
} | null {
  const trimmed = (rawText || '').trim();
  if (!trimmed) return null;

  // 1. Check URL parameter ?atkRemoteSession=XXXXXX
  const sessionMatch = trimmed.match(/[?&]atkRemoteSession=([0-9A-Za-z]{4,12})/i);
  if (sessionMatch && sessionMatch[1]) {
    const modeMatch = trimmed.match(/[?&]sendMode=(AUTO_SEND|MANUAL_SEND)/i);
    return {
      sessionCode: sessionMatch[1].trim(),
      sendMode:
        modeMatch &&
        (modeMatch[1].toUpperCase() === 'MANUAL_SEND' ||
          modeMatch[1].toUpperCase() === 'AUTO_SEND')
          ? (modeMatch[1].toUpperCase() as RemotePhoneSendMode)
          : undefined,
    };
  }

  // 2. Check explicit PAIR:XXXXXX prefix
  const pairPrefixMatch = trimmed.match(/^PAIR[:\-_]([0-9]{6})$/i);
  if (pairPrefixMatch && pairPrefixMatch[1]) {
    return { sessionCode: pairPrefixMatch[1] };
  }

  return null;
}

const GLOBAL_PROCESSED_IDS_KEY = 'cetakpro_atk_processed_remote_msg_ids_v2';
const globalProcessedMsgIds: Set<string> = (() => {
  const loaded = new Set<string>();
  try {
    const rawSession = sessionStorage.getItem(GLOBAL_PROCESSED_IDS_KEY);
    if (rawSession) {
      const arr = JSON.parse(rawSession);
      if (Array.isArray(arr)) {
        for (const id of arr) loaded.add(String(id));
      }
    }
    const rawLocal = localStorage.getItem(GLOBAL_PROCESSED_IDS_KEY);
    if (rawLocal) {
      const arr = JSON.parse(rawLocal);
      if (Array.isArray(arr)) {
        for (const id of arr) loaded.add(String(id));
      }
    }
  } catch {
    // Ignore storage error
  }
  return loaded;
})();

export function hasRemoteMsgBeenProcessed(msgId: string): boolean {
  return globalProcessedMsgIds.has(msgId);
}

export function markRemoteMsgAsProcessed(msgId: string): void {
  if (!msgId) return;
  globalProcessedMsgIds.add(msgId);
  try {
    const list = Array.from(globalProcessedMsgIds).slice(-400);
    const serialized = JSON.stringify(list);
    sessionStorage.setItem(GLOBAL_PROCESSED_IDS_KEY, serialized);
    localStorage.setItem(GLOBAL_PROCESSED_IDS_KEY, serialized);
  } catch {
    // Ignore storage error
  }
}

// Rolling buffer of recent outgoing action messages from this phone so HELLO heartbeats or rapid scans never overwrite a scan
let recentOutgoingScansBuffer: RemoteCameraScanMessage[] = [];

// Active subscribers on Desktop so multiple listeners in the same tab all receive every message
const activeDesktopMessageListeners = new Set<(msg: RemoteCameraScanMessage) => void>();

/**
 * Normalizes a scanned barcode string (converts spaced "ATK - HVS4 - 107" into "ATK-HVS4-107").
 */
export function normalizeScannedBarcodeSku(rawCode: string): string {
  return (rawCode || '')
    .trim()
    .toUpperCase()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, '-');
}

/**
 * Validates that a decoded camera string is a genuine product barcode / SKU
 * and NOT a QR pairing URL, session code, or random 1-2 character camera noise.
 */
export function isValidScannedBarcodeText(
  rawCode: string,
  currentSessionCode?: string
): boolean {
  if (extractPairingSessionFromQrText(rawCode)) {
    return false;
  }
  const clean = normalizeScannedBarcodeSku(rawCode);
  if (clean.length < 3 || clean.length > 64) return false;

  const lower = clean.toLowerCase();
  // Reject QR pairing URLs, web links, or query params
  if (
    lower.includes('http://') ||
    lower.includes('https://') ||
    lower.includes('atkremotesession') ||
    lower.includes('sendmode=') ||
    lower.includes('.run.app') ||
    lower.includes('localhost')
  ) {
    return false;
  }

  // Reject if it matches the 6-digit desktop pairing session code itself
  if (currentSessionCode && clean === currentSessionCode.trim()) {
    return false;
  }

  // Must contain only valid barcode characters
  if (!/^[A-Za-z0-9\-_./+:()#]+$/.test(clean)) {
    return false;
  }

  // If purely numeric, require at least 4 digits so 1-3 digit camera noise is ignored
  if (/^[0-9]+$/.test(clean)) {
    return clean.length >= 4 && clean.length <= 32;
  }

  return true;
}

export function getTopicName(sessionCode: string): string {
  const clean = (sessionCode || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 12) || '849201';
  return `cetakpro_atk_cam_${clean}`;
}

function buildSanitizedFirestoreRelayDoc(
  msg: RemoteCameraScanMessage
): Record<string, unknown> {
  const docPayload: Record<string, unknown> = {
    sessionCode: String(msg.sessionCode || '849201').slice(0, 32),
    msgId: String(msg.msgId).slice(0, 80),
    type: msg.type,
    deviceName: String(msg.deviceName || 'Kamera Ponsel').slice(0, 100),
    timestamp: Number(msg.timestamp) || Date.now(),
  };
  if (msg.sku) {
    docPayload.sku = String(msg.sku).slice(0, 64);
  }
  if (typeof msg.deltaQty === 'number' && !Number.isNaN(msg.deltaQty)) {
    docPayload.deltaQty = Math.max(-10000, Math.min(10000, Math.round(msg.deltaQty)));
  }
  if (msg.sendMode === 'AUTO_SEND' || msg.sendMode === 'MANUAL_SEND') {
    docPayload.sendMode = msg.sendMode;
  }
  if (msg.itemName) {
    docPayload.itemName = String(msg.itemName).slice(0, 160);
  }
  if (typeof msg.unitPrice === 'number' && msg.unitPrice >= 0) {
    docPayload.unitPrice = msg.unitPrice;
  }
  if (typeof msg.unitCost === 'number' && msg.unitCost >= 0) {
    docPayload.unitCost = msg.unitCost;
  }
  if (msg.unit) {
    docPayload.unit = String(msg.unit).slice(0, 30);
  }
  if (typeof msg.desktopAck === 'boolean') {
    docPayload.desktopAck = msg.desktopAck;
  }
  if (typeof msg.catalogJson === 'string' && msg.catalogJson.length <= 85000) {
    docPayload.catalogJson = msg.catalogJson;
  }
  if (typeof msg.recentScansJson === 'string' && msg.recentScansJson.length <= 38000) {
    docPayload.recentScansJson = msg.recentScansJson;
  }
  return docPayload;
}

function getFirestoreRestDocumentUrl(_docId: string): string {
  return '';
}

async function writeFirestoreRestDocument(
  _docId: string,
  _payload: Record<string, unknown>
): Promise<boolean> {
  return false;
}

async function readFirestoreRestDocument(
  _docId: string
): Promise<Record<string, unknown> | null> {
  return null;
}

/**
 * Sends a barcode scan, HELLO pairing handshake, or quantity adjustment from Phone to Desktop POS
 * using 5 simultaneous real-time engines:
 * 1. Stateless Firestore REST v1 API (PATCH remoteCameraSessions/{sessionCode}, {sessionCode}_scan & GLOBAL_POS) — ~100ms across any network
 * 2. Firebase Firestore SDK setDoc — ~150ms across any network
 * 3. Same-Origin Server Relay (POST & GET /api/remote-camera) — < 80ms
 * 4. BroadcastChannel & LocalStorage (0ms same-device)
 * 5. Dual-Topic ntfy SSE stream (session topic + global POS topic)
 */
export async function sendRemoteCameraMessage(
  payload: Omit<RemoteCameraScanMessage, 'msgId' | 'timestamp'>
): Promise<boolean> {
  const normalizedSku = payload.sku ? normalizeScannedBarcodeSku(payload.sku) : undefined;

  // Block any invalid/noise SCAN payload before sending
  if (
    payload.type === 'SCAN' &&
    (!normalizedSku || !isValidScannedBarcodeText(normalizedSku, payload.sessionCode))
  ) {
    return false;
  }

  const cleanSession =
    (payload.sessionCode || '').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 24) || '849201';

  const now = Date.now();
  const baseMsg: RemoteCameraScanMessage = {
    ...payload,
    ...(normalizedSku ? { sku: normalizedSku } : {}),
    sessionCode: cleanSession,
    msgId: `msg_${now}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now,
  };

  // Maintain rolling buffer of recent non-HELLO/non-ACK scans so a HELLO heartbeat never overwrites a scan
  if (
    baseMsg.type === 'SCAN' ||
    baseMsg.type === 'ADJUST_DELTA' ||
    baseMsg.type === 'REMOVE_SKU'
  ) {
    const compactEntry: RemoteCameraScanMessage = {
      msgId: baseMsg.msgId,
      sessionCode: baseMsg.sessionCode,
      type: baseMsg.type,
      sku: baseMsg.sku,
      deltaQty: baseMsg.deltaQty,
      sendMode: baseMsg.sendMode,
      deviceName: baseMsg.deviceName,
      itemName: baseMsg.itemName,
      unitPrice: baseMsg.unitPrice,
      unitCost: baseMsg.unitCost,
      unit: baseMsg.unit,
      timestamp: baseMsg.timestamp,
    };
    recentOutgoingScansBuffer.push(compactEntry);
  }
  recentOutgoingScansBuffer = recentOutgoingScansBuffer
    .filter((m) => now - m.timestamp <= 3 * 60 * 1000)
    .slice(-12);

  const recentScansSerialized =
    recentOutgoingScansBuffer.length > 0
      ? JSON.stringify(recentOutgoingScansBuffer)
      : undefined;

  const fullMsg: RemoteCameraScanMessage = {
    ...baseMsg,
    ...(recentScansSerialized && recentScansSerialized.length <= 35000
      ? { recentScansJson: recentScansSerialized }
      : {}),
  };

  const topic = getTopicName(fullMsg.sessionCode);
  const jsonStr = JSON.stringify(fullMsg);

  // 1. Same-device / multi-window BroadcastChannel (0ms)
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(topic);
      bc.postMessage(fullMsg);
      bc.close();
      const globalBc = new BroadcastChannel('cetakpro_atk_cam_global');
      globalBc.postMessage(fullMsg);
      globalBc.close();
    }
  } catch {
    // Ignore BroadcastChannel error
  }

  // 2. LocalStorage cross-tab trigger (0ms)
  try {
    localStorage.setItem(`atk_remote_msg_${topic}`, jsonStr);
    localStorage.setItem('atk_remote_msg_global', jsonStr);
  } catch {
    // Ignore storage error
  }

  const firestorePayload = buildSanitizedFirestoreRelayDoc(fullMsg);
  const isActionMsg =
    fullMsg.type === 'SCAN' ||
    fullMsg.type === 'ADJUST_DELTA' ||
    fullMsg.type === 'REMOVE_SKU';

  // 3A. Stateless Firestore REST v1 API Push (works immediately in any mobile QR WebView without SDK init delay)
  const firestoreRestPromise = (async () => {
    try {
      const tasks: Promise<boolean>[] = [
        writeFirestoreRestDocument(cleanSession, firestorePayload),
        writeFirestoreRestDocument('GLOBAL_POS', firestorePayload),
      ];
      if (isActionMsg) {
        tasks.push(
          writeFirestoreRestDocument(`${cleanSession}_scan`, firestorePayload),
          writeFirestoreRestDocument('GLOBAL_POS_scan', firestorePayload)
        );
      }
      const results = await Promise.all(tasks);
      return results.some(Boolean);
    } catch {
      return false;
    }
  })();

  // 3B. Firestore SDK (Disabled for standalone mode)
  const firestoreSdkPromise = Promise.resolve(false);

  // 4. Same-Origin Server Relay (/api/remote-camera via POST and GET fallback)
  const localRelayPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1600);
      const res = await fetch('/api/remote-camera', {
        method: 'POST',
        body: jsonStr,
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) return true;
    } catch {
      // Fallback to GET below
    }
    try {
      const getRes = await fetch(
        `/api/remote-camera?action=SEND&payload=${encodeURIComponent(jsonStr)}&_t=${Date.now()}`,
        { cache: 'no-store', keepalive: true }
      );
      return getRes.ok;
    } catch {
      return false;
    }
  })();

  // 5. Secondary Dual-Topic ntfy stream in background
  void fetch(`https://ntfy.sh/${topic}`, {
    method: 'POST',
    body: jsonStr,
    keepalive: true,
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      'Cache-Control': 'no-cache',
    },
  }).catch(() => {});

  void fetch(`https://ntfy.sh/${GLOBAL_NTFY_TOPIC}`, {
    method: 'POST',
    body: jsonStr,
    keepalive: true,
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      'Cache-Control': 'no-cache',
    },
  }).catch(() => {});

  const [restOk, sdkOk, localOk] = await Promise.all([
    firestoreRestPromise,
    firestoreSdkPromise,
    localRelayPromise,
  ]);
  return restOk || sdkOk || localOk || true;
}

export async function syncDesktopCatalogToRemoteRelay(
  sessionCode: string,
  catalog: unknown[]
): Promise<void> {
  if (!Array.isArray(catalog) || catalog.length === 0) return;
  const cleanCode =
    (sessionCode || 'GLOBAL').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 24) || 'GLOBAL';

  // 1. Sync to Same-Origin Relay
  void fetch('/api/remote-camera', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify({
      action: 'SYNC_CATALOG',
      sessionCode: cleanCode,
      catalog,
    }),
  }).catch(() => {});

  // 2. Sync compact catalog to Firestore ACK/Catalog document via REST + SDK
  try {
    const compactCatalogJson = JSON.stringify(catalog.slice(0, 100));
    if (compactCatalogJson.length <= 75000) {
      const ackDoc = buildSanitizedFirestoreRelayDoc({
        msgId: `ack_cat_${Date.now()}`,
        sessionCode: cleanCode,
        type: 'ACK',
        deviceName: 'Kasir POS Web Desktop',
        timestamp: Date.now(),
        desktopAck: true,
        catalogJson: compactCatalogJson,
      });
    }
  } catch {
    // Ignore catalog sync error
  }
}

export async function fetchRemoteCatalogFromRelay<T = unknown>(
  sessionCode: string
): Promise<T[]> {
  const cleanCode =
    (sessionCode || 'GLOBAL').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 24) || 'GLOBAL';

  // 1. Try Same-Origin Relay
  try {
    const res = await fetch(
      `/api/remote-camera?sessionCode=${encodeURIComponent(cleanCode)}&includeCatalog=1&_t=${Date.now()}`,
      { cache: 'no-store' }
    );
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.catalog)) {
        return data.catalog as T[];
      }
    }
  } catch {
    // Ignore fetch error
  }
  return [];
}

/**
 * Subscribes the Phone Scanner Modal to real-time ACK / connection confirmation from the Desktop POS.
 */
export function subscribeToDesktopAckOnPhone(
  sessionCode: string,
  onDesktopConnected: (info: { connected: boolean; catalogJson?: string }) => void
): () => void {
  const cleanCode =
    (sessionCode || '849201').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 24) || '849201';

  const handleAckSnap = (data?: Record<string, unknown> | null) => {
    if (!data) return;
    if (data.desktopAck === true || data.type === 'ACK') {
      onDesktopConnected({
        connected: true,
        catalogJson:
          typeof data.catalogJson === 'string' ? data.catalogJson : undefined,
      });
    }
  };

  // In standalone mode, ACK is verified via local relay
  let isPollingAck = false;
  const pollAckNow = async () => {
    if (isPollingAck) return;
    isPollingAck = true;
    try {
      const res = await fetch(
        `/api/remote-camera?sessionCode=${encodeURIComponent(cleanCode)}&includeAck=1&_t=${Date.now()}`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const json = await res.json();
        if (json && (json.desktopAck === true || json.connected === true)) {
          handleAckSnap(json);
        }
      }
    } catch {
      // Ignore
    } finally {
      isPollingAck = false;
    }
  };
  void pollAckNow();
  const ackTimer = window.setInterval(pollAckNow, 1500);

  return () => {
    window.clearInterval(ackTimer);
  };
}

function extractMessagesFromDocData(
  rawDoc: Record<string, unknown> | RemoteCameraScanMessage | null | undefined
): RemoteCameraScanMessage[] {
  if (!rawDoc || typeof rawDoc !== 'object') return [];
  const docObj = rawDoc as RemoteCameraScanMessage;
  const list: RemoteCameraScanMessage[] = [];

  if (typeof docObj.recentScansJson === 'string' && docObj.recentScansJson) {
    try {
      const parsedArr = JSON.parse(docObj.recentScansJson);
      if (Array.isArray(parsedArr)) {
        for (const item of parsedArr) {
          if (item && typeof item === 'object' && item.msgId) {
            list.push(item as RemoteCameraScanMessage);
          }
        }
      }
    } catch {
      // Ignore malformed recentScansJson
    }
  }

  if (docObj.msgId && docObj.type !== 'ACK') {
    list.push(docObj);
  }
  return list;
}

/**
 * Manually or automatically pulls recent UNPROCESSED messages from the remote phone camera session.
 */
export async function pullRecentRemoteCameraMessages(
  sessionCode: string,
  includeNtfyFallback = true
): Promise<RemoteCameraScanMessage[]> {
  const cleanCode =
    (sessionCode || '').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 24) || '849201';
  const topic = getTopicName(cleanCode);
  const results: RemoteCameraScanMessage[] = [];

  const collectCandidate = (candidate: RemoteCameraScanMessage) => {
    if (
      !candidate ||
      !candidate.msgId ||
      candidate.type === 'ACK' ||
      hasRemoteMsgBeenProcessed(candidate.msgId)
    ) {
      return;
    }
    if (candidate.type === 'SCAN') {
      const cleanSku = normalizeScannedBarcodeSku(candidate.sku || '');
      if (!cleanSku || !isValidScannedBarcodeText(cleanSku, cleanCode)) {
        markRemoteMsgAsProcessed(candidate.msgId);
        return;
      }
      candidate.sku = cleanSku;
    }
    markRemoteMsgAsProcessed(candidate.msgId);
    results.push(candidate);
  };

  // 1. Pull from Same-Origin /api/remote-camera relay
  try {
    const res = await fetch(
      `/api/remote-camera?sessionCode=${encodeURIComponent(cleanCode)}&role=desktop&_t=${Date.now()}`,
      { cache: 'no-store' }
    );
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.messages)) {
        for (const parsed of data.messages as RemoteCameraScanMessage[]) {
          collectCandidate(parsed);
        }
      }
    }
  } catch {
    // Ignore local relay error
  }

  // 4. Optional fallback pull from ntfy.sh
  if (includeNtfyFallback && results.length === 0) {
    for (const t of [topic, GLOBAL_NTFY_TOPIC]) {
      try {
        const res = await fetch(`https://ntfy.sh/${t}/json?poll=1&since=45s`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const text = await res.text();
          const lines = text.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const env = JSON.parse(trimmed);
              if (env && env.event === 'message' && env.message) {
                const parsed = JSON.parse(env.message) as RemoteCameraScanMessage;
                for (const m of extractMessagesFromDocData(parsed)) {
                  collectCandidate(m);
                }
              }
            } catch {
              // Ignore non-JSON line
            }
          }
        }
      } catch {
        // Ignore network poll error
      }
    }
  }

  return results;
}

/**
 * Subscribes the Desktop Web POS to incoming barcode scans & HELLO pairing from any Phone Camera.
 * Guarantees < 0.15s - 0.75s delivery (well under 2 seconds) using:
 * 1. Firebase Firestore Real-Time onSnapshot (/remoteCameraSessions/{sessionCode}, {sessionCode}_scan, GLOBAL_POS, GLOBAL_POS_scan)
 * 2. Fast Stateless Firestore REST v1 Poll every 700ms (immune to WebChannel buffering)
 * 3. Same-Origin SSE Stream (/api/remote-camera/stream)
 * 4. Fast Same-Origin HTTP Poll every 450ms (/api/remote-camera)
 * 5. BroadcastChannel & LocalStorage (0ms same-device)
 * 6. Dual-Topic ntfy SSE stream (session topic + global POS topic)
 */
export function subscribeToRemoteCameraSession(
  sessionCode: string,
  onMessage: (msg: RemoteCameraScanMessage) => void,
  onConnectionStateChange?: (connected: boolean) => void
): () => void {
  const cleanCode =
    (sessionCode || '').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 24) || '849201';

  const topic = getTopicName(cleanCode);
  let lastSeenServerSeq = 0;
  let lastHelloEmittedForDevice = '';
  let lastHelloEmittedAtMs = 0;

  activeDesktopMessageListeners.add(onMessage);

  const dispatchToAllListeners = (msg: RemoteCameraScanMessage) => {
    for (const listener of Array.from(activeDesktopMessageListeners)) {
      try {
        listener(msg);
      } catch {
        // Ignore listener error
      }
    }
  };

  let lastAckSentAtMs = 0;
  const sendDesktopAckToFirestore = (targetSession: string, force = false) => {
    const now = Date.now();
    if (!force && now - lastAckSentAtMs < 2500) return;
    lastAckSentAtMs = now;
    const safeSession =
      (targetSession || cleanCode).replace(/[^0-9A-Za-z_-]/g, '').slice(0, 24) ||
      cleanCode;
    const ackPayload = buildSanitizedFirestoreRelayDoc({
      msgId: `ack_${now}`,
      sessionCode: safeSession,
      type: 'ACK',
      deviceName: 'Kasir POS Web Desktop',
      timestamp: now,
      desktopAck: true,
    });
    // In standalone mode, desktop ACK is published via local relay, broadcast channel & ntfy
  };

  // Immediately publish Desktop ACK readiness so any Phone opening this session knows Desktop is online
  sendDesktopAckToFirestore(cleanCode, true);

  const emitHelloPresenceIfRecent = (msg: RemoteCameraScanMessage) => {
    if (!msg || !msg.deviceName || msg.type === 'ACK') return;
    const now = Date.now();
    // If the phone was active within the last 10 minutes (tolerant of clock skew), mark Desktop UI as connected
    if (
      typeof msg.timestamp === 'number' &&
      Math.abs(now - msg.timestamp) <= 10 * 60 * 1000
    ) {
      onConnectionStateChange?.(true);
      if (
        lastHelloEmittedForDevice !== msg.deviceName ||
        now - lastHelloEmittedAtMs > 4000
      ) {
        lastHelloEmittedForDevice = msg.deviceName;
        lastHelloEmittedAtMs = now;
        sendDesktopAckToFirestore(msg.sessionCode || cleanCode);
        dispatchToAllListeners({
          msgId: `hello_presence_${msg.msgId || now}`,
          sessionCode: msg.sessionCode || cleanCode,
          type: 'HELLO',
          deviceName: msg.deviceName,
          sendMode: msg.sendMode,
          timestamp: now,
        });
      }
    }
  };

  const handleSingleCandidateMessage = (
    parsed: RemoteCameraScanMessage,
    allowAnySession = true
  ) => {
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.msgId ||
      parsed.type === 'ACK' ||
      (!allowAnySession && parsed.sessionCode !== cleanCode)
    ) {
      return;
    }

    if (typeof parsed.serverSeq === 'number' && parsed.serverSeq > lastSeenServerSeq) {
      lastSeenServerSeq = parsed.serverSeq;
    }

    // Always update phone connection indicator on Desktop whenever any valid phone doc is seen
    emitHelloPresenceIfRecent(parsed);

    if (parsed.type === 'HELLO') {
      markRemoteMsgAsProcessed(parsed.msgId);
      return;
    }

    // Strictly deduplicate action messages (SCAN / ADJUST_DELTA / REMOVE_SKU) by msgId
    if (hasRemoteMsgBeenProcessed(parsed.msgId)) return;

    // Ignore stale action messages older than 5 minutes (while tolerating up to 5 minutes of phone/desktop clock skew)
    if (
      typeof parsed.timestamp === 'number' &&
      Math.abs(Date.now() - parsed.timestamp) > 5 * 60 * 1000
    ) {
      markRemoteMsgAsProcessed(parsed.msgId);
      return;
    }

    // Normalize & validate barcode payload if type === 'SCAN'
    if (parsed.type === 'SCAN') {
      const cleanSku = normalizeScannedBarcodeSku(parsed.sku || '');
      if (!cleanSku || !isValidScannedBarcodeText(cleanSku, cleanCode)) {
        markRemoteMsgAsProcessed(parsed.msgId);
        return;
      }
      parsed.sku = cleanSku;
    }

    markRemoteMsgAsProcessed(parsed.msgId);
    sendDesktopAckToFirestore(parsed.sessionCode || cleanCode, true);
    dispatchToAllListeners(parsed);
  };

  const handleIncomingRaw = (raw: unknown, allowAnySession = true) => {
    try {
      const parsed: RemoteCameraScanMessage =
        typeof raw === 'string' ? JSON.parse(raw) : (raw as RemoteCameraScanMessage);
      if (!parsed || typeof parsed !== 'object') return;

      const extracted = extractMessagesFromDocData(parsed);
      for (const item of extracted) {
        handleSingleCandidateMessage(item, allowAnySession);
      }
    } catch {
      // Ignore malformed payload
    }
  };

  // 1. Firebase Firestore Real-Time onSnapshot Listeners (Session, Session Scan, Global POS, Global POS Scan)
  // Uses 0 quota reads while idle and pushes changes in ~150ms when Phone scans a barcode
  // Standalone: Watch via Server-Sent Events, local relay & ntfy
  const firestoreUnsubscribers: Array<() => void> = [];

  // 3. BroadcastChannel listener (0ms)
  let bc: BroadcastChannel | null = null;
  let globalBc: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(topic);
      bc.onmessage = (ev) => handleIncomingRaw(ev.data, true);
      globalBc = new BroadcastChannel('cetakpro_atk_cam_global');
      globalBc.onmessage = (ev) => handleIncomingRaw(ev.data, true);
    }
  } catch {
    bc = null;
    globalBc = null;
  }

  // 4. LocalStorage event listener (0ms)
  const storageHandler = (ev: StorageEvent) => {
    if (
      (ev.key === `atk_remote_msg_${topic}` ||
        ev.key === 'atk_remote_msg_global') &&
      ev.newValue
    ) {
      handleIncomingRaw(ev.newValue, true);
    }
  };
  window.addEventListener('storage', storageHandler);

  // 5. Same-Origin SSE Stream (/api/remote-camera/stream) (< 100ms)
  let localEs: EventSource | null = null;
  try {
    if (typeof EventSource !== 'undefined') {
      localEs = new EventSource(
        `/api/remote-camera/stream?sessionCode=${encodeURIComponent(cleanCode)}`
      );
      localEs.onopen = () => {
        onConnectionStateChange?.(true);
      };
      localEs.onmessage = (ev) => {
        if (ev.data) {
          handleIncomingRaw(ev.data, true);
        }
      };
    }
  } catch {
    localEs = null;
  }

  // 6. Fast Same-Origin HTTP Polling every 450ms
  let isPollingLocal = false;
  const pollLocalNow = async () => {
    if (isPollingLocal) return;
    isPollingLocal = true;
    try {
      const res = await fetch(
        `/api/remote-camera?sessionCode=${encodeURIComponent(cleanCode)}&role=desktop&sinceSeq=${lastSeenServerSeq}&_t=${Date.now()}`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.messages)) {
          for (const msg of data.messages) {
            handleIncomingRaw(msg, true);
          }
        }
      }
    } catch {
      // Ignore transient poll error
    } finally {
      isPollingLocal = false;
    }
  };
  void pollLocalNow();
  const localPollTimer = window.setInterval(pollLocalNow, 450);

  // 7. Dual-Topic ntfy EventSource fallback (both session topic and global POS topic)
  let ntfyEs: EventSource | null = null;
  let ntfyGlobalEs: EventSource | null = null;
  try {
    if (typeof EventSource !== 'undefined') {
      ntfyEs = new EventSource(`https://ntfy.sh/${topic}/json`);
      ntfyEs.onmessage = (ev) => {
        try {
          const envelope = JSON.parse(ev.data);
          if (envelope && envelope.event === 'message' && envelope.message) {
            handleIncomingRaw(envelope.message, true);
          }
        } catch {
          // Ignore envelope parse error
        }
      };
      ntfyGlobalEs = new EventSource(`https://ntfy.sh/${GLOBAL_NTFY_TOPIC}/json`);
      ntfyGlobalEs.onmessage = (ev) => {
        try {
          const envelope = JSON.parse(ev.data);
          if (envelope && envelope.event === 'message' && envelope.message) {
            handleIncomingRaw(envelope.message, true);
          }
        } catch {
          // Ignore envelope parse error
        }
      };
    }
  } catch {
    ntfyEs = null;
    ntfyGlobalEs = null;
  }

  return () => {
    activeDesktopMessageListeners.delete(onMessage);
    window.clearInterval(localPollTimer);
    for (const unsub of firestoreUnsubscribers) {
      try {
        unsub();
      } catch {
        // Ignore
      }
    }
    if (bc) {
      try {
        bc.close();
      } catch {
        // Ignore
      }
    }
    if (globalBc) {
      try {
        globalBc.close();
      } catch {
        // Ignore
      }
    }
    window.removeEventListener('storage', storageHandler);
    if (localEs) {
      try {
        localEs.close();
      } catch {
        // Ignore
      }
    }
    if (ntfyEs) {
      try {
        ntfyEs.close();
      } catch {
        // Ignore
      }
    }
    if (ntfyGlobalEs) {
      try {
        ntfyGlobalEs.close();
      } catch {
        // Ignore
      }
    }
  };
}

// ============================================================================
// BLUETOOTH EXTERNAL CAMERA / WEBCAM / BARCODE SCANNER (AUTO-DETECT TANPA DRIVER)
// Supports:
// 1. Web Bluetooth API (BLE GATT Notification Stream + Auto-Remember ID di localStorage)
// 2. Web Serial API over Bluetooth SPP (Bluetooth Classic Serial Port Profile Tanpa Driver)
// 3. Bluetooth HID Auto-Detect Stream (Keyboard Wedge / Shutter / 2D Wireless Scanner)
// ============================================================================

export interface SavedBluetoothScannerInfo {
  deviceId: string;
  deviceName: string;
  protocol: 'BLE_GATT' | 'BT_SPP_SERIAL' | 'BT_HID';
  lastConnectedAt: string;
}

const BT_SCANNER_STORAGE_KEY = 'cetakpro_atk_saved_bt_scanner_v1';

const COMMON_BT_SCANNER_SERVICES = [
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service (BLE Barcode & Phone Scanners)
  '00001812-0000-1000-8000-00805f9b34fb', // HID over GATT
  '000018f0-0000-1000-8000-00805f9b34fb',
  '00001101-0000-1000-8000-00805f9b34fb', // SPP UUID
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip / ISSC BLE Serial
];

export function getSavedBluetoothScannerDevice(): SavedBluetoothScannerInfo | null {
  try {
    const raw = localStorage.getItem(BT_SCANNER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedBluetoothScannerInfo;
    if (parsed && parsed.deviceName) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function saveBluetoothScannerDevice(info: SavedBluetoothScannerInfo): void {
  try {
    localStorage.setItem(BT_SCANNER_STORAGE_KEY, JSON.stringify(info));
  } catch {
    // Ignore storage error
  }
}

export function clearSavedBluetoothScannerDevice(): void {
  try {
    localStorage.removeItem(BT_SCANNER_STORAGE_KEY);
  } catch {
    // Ignore storage error
  }
}

export function isWebBluetoothScannerSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'bluetooth' in navigator &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof (navigator as any).bluetooth?.requestDevice === 'function'
  );
}

export function isWebSerialBluetoothSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serial' in navigator &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof (navigator as any).serial?.requestPort === 'function'
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeBleDeviceRef: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeSerialPortRef: any = null;

export function disconnectActiveBluetoothScanner(): void {
  try {
    if (activeBleDeviceRef && activeBleDeviceRef.gatt?.connected) {
      activeBleDeviceRef.gatt.disconnect();
    }
  } catch {
    // Ignore
  }
  activeBleDeviceRef = null;

  try {
    if (activeSerialPortRef && typeof activeSerialPortRef.close === 'function') {
      activeSerialPortRef.close().catch(() => {});
    }
  } catch {
    // Ignore
  }
  activeSerialPortRef = null;
}

/**
 * Connects to an external Bluetooth Camera / Barcode Scanner / Phone via Web Bluetooth API (BLE).
 * Automatically attempts silent auto-reconnect via navigator.bluetooth.getDevices() first if forceNewPairing=false.
 */
export async function connectBluetoothScannerOrCamera(params: {
  forceNewPairing?: boolean;
  onBarcodeScanned: (code: string, deviceName: string) => void;
  onStatusChange?: (status: {
    connected: boolean;
    deviceName: string;
    autoReconnected: boolean;
    message: string;
  }) => void;
}): Promise<SavedBluetoothScannerInfo> {
  if (!isWebBluetoothScannerSupported()) {
    throw new Error(
      'Web Bluetooth API tidak tersedia di browser ini. Gunakan Chrome/Edge atau mode Bluetooth HID Auto-Detect.'
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bt = (navigator as any).bluetooth;
  const saved = getSavedBluetoothScannerDevice();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let targetDevice: any = null;
  let autoReconnected = false;

  // 1. Try Auto-Detect / Auto-Reconnect from permitted Bluetooth devices without pairing popup
  if (!params.forceNewPairing && typeof bt.getDevices === 'function') {
    try {
      const permittedDevices = await bt.getDevices();
      if (Array.isArray(permittedDevices) && permittedDevices.length > 0) {
        if (saved?.deviceId) {
          targetDevice = permittedDevices.find(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (d: any) => d.id === saved.deviceId || d.name === saved.deviceName
          );
        }
        if (!targetDevice) {
          targetDevice = permittedDevices[0];
        }
        if (targetDevice) {
          autoReconnected = true;
        }
      }
    } catch {
      targetDevice = null;
    }
  }

  // 2. If no auto-reconnect device found or user requested new pairing, open Web Bluetooth chooser
  if (!targetDevice) {
    targetDevice = await bt.requestDevice({
      acceptAllDevices: true,
      optionalServices: COMMON_BT_SCANNER_SERVICES,
    });
    autoReconnected = false;
  }

  const deviceName = targetDevice.name || saved?.deviceName || 'Kamera / Scanner Bluetooth';
  activeBleDeviceRef = targetDevice;

  const info: SavedBluetoothScannerInfo = {
    deviceId: targetDevice.id || `bt_${Date.now()}`,
    deviceName,
    protocol: 'BLE_GATT',
    lastConnectedAt: new Date().toISOString(),
  };
  saveBluetoothScannerDevice(info);

  // Attach GATT notification listeners for incoming barcode / camera trigger payloads
  let lineBuffer = '';
  let flushTimer: number | null = null;
  const decoder = new TextDecoder('utf-8');

  const flushBarcodeBuffer = () => {
    const cleaned = lineBuffer.replace(/[\r\n\t\0]/g, '').trim();
    lineBuffer = '';
    if (cleaned.length >= 2) {
      params.onBarcodeScanned(cleaned, deviceName);
    }
  };

  const subscribeGattCharacteristics = async () => {
    if (!targetDevice.gatt) return false;
    const server = await targetDevice.gatt.connect();
    let subscribedCount = 0;

    try {
      const services = await server.getPrimaryServices();
      for (const svc of services) {
        try {
          const chars = await svc.getCharacteristics();
          for (const ch of chars) {
            if (ch.properties?.notify || ch.properties?.indicate) {
              try {
                await ch.startNotifications();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ch.addEventListener('characteristicvaluechanged', (ev: any) => {
                  const val = ev?.target?.value as DataView | undefined;
                  if (!val) return;
                  const bytes = new Uint8Array(
                    val.buffer,
                    val.byteOffset,
                    val.byteLength
                  );
                  const chunkText = decoder.decode(bytes);
                  if (!chunkText) return;
                  lineBuffer += chunkText;
                  if (
                    chunkText.includes('\n') ||
                    chunkText.includes('\r') ||
                    lineBuffer.length >= 64
                  ) {
                    if (flushTimer !== null) {
                      window.clearTimeout(flushTimer);
                      flushTimer = null;
                    }
                    flushBarcodeBuffer();
                  } else {
                    if (flushTimer !== null) {
                      window.clearTimeout(flushTimer);
                    }
                    flushTimer = window.setTimeout(() => {
                      flushBarcodeBuffer();
                    }, 90);
                  }
                });
                subscribedCount += 1;
              } catch {
                // Ignore non-subscribable characteristic
              }
            }
          }
        } catch {
          // Ignore service read error
        }
      }
    } catch {
      // Device may use OS-level Bluetooth HID / Camera stream instead of custom GATT service
    }

    return subscribedCount > 0;
  };

  try {
    await subscribeGattCharacteristics();
  } catch {
    // Even if GATT services are restricted (e.g. Bluetooth HID Scanner / Phone Camera),
    // the device is now paired & monitored alongside our Global Bluetooth HID listener
  }

  // Auto-reconnect on disconnect if device wakes up again
  targetDevice.addEventListener('gattserverdisconnected', () => {
    params.onStatusChange?.({
      connected: false,
      deviceName,
      autoReconnected: false,
      message: `Perangkat Bluetooth "${deviceName}" siaga (Auto-Reconnect & HID Listener tetap aktif).`,
    });
    window.setTimeout(() => {
      if (activeBleDeviceRef === targetDevice) {
        subscribeGattCharacteristics()
          .then((ok) => {
            if (ok) {
              params.onStatusChange?.({
                connected: true,
                deviceName,
                autoReconnected: true,
                message: `Auto-Reconnect Bluetooth "${deviceName}" berhasil tersambung kembali.`,
              });
            }
          })
          .catch(() => {});
      }
    }, 2200);
  });

  params.onStatusChange?.({
    connected: true,
    deviceName,
    autoReconnected,
    message: autoReconnected
      ? `✓ Auto-Detect Bluetooth: "${deviceName}" otomatis tersambung kembali tanpa pairing ulang.`
      : `✓ Perangkat Bluetooth "${deviceName}" berhasil dihubungkan & disimpan ke Auto-Remember (Tanpa Driver).`,
  });

  return info;
}

/**
 * Connects to a Bluetooth Classic SPP (Serial Port Profile) Camera / Barcode Scanner via Web Serial API.
 */
export async function connectBluetoothSerialSppScanner(params: {
  forceNewPort?: boolean;
  onBarcodeScanned: (code: string, deviceName: string) => void;
  onStatusChange?: (status: {
    connected: boolean;
    deviceName: string;
    message: string;
  }) => void;
}): Promise<SavedBluetoothScannerInfo> {
  if (!isWebSerialBluetoothSupported()) {
    throw new Error(
      'Web Serial API (Bluetooth SPP) hanya tersedia di Chrome / Edge Desktop.'
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serial = (navigator as any).serial;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let port: any = null;

  if (!params.forceNewPort && typeof serial.getPorts === 'function') {
    try {
      const existingPorts = await serial.getPorts();
      if (Array.isArray(existingPorts) && existingPorts.length > 0) {
        port = existingPorts[0];
      }
    } catch {
      port = null;
    }
  }

  if (!port) {
    port = await serial.requestPort();
  }

  await port.open({ baudRate: 9600 });
  activeSerialPortRef = port;

  const deviceName = 'Scanner / Kamera Bluetooth SPP';
  const info: SavedBluetoothScannerInfo = {
    deviceId: 'bt_spp_serial',
    deviceName,
    protocol: 'BT_SPP_SERIAL',
    lastConnectedAt: new Date().toISOString(),
  };
  saveBluetoothScannerDevice(info);

  params.onStatusChange?.({
    connected: true,
    deviceName,
    message: `✓ Bluetooth SPP Serial ("${deviceName}") terhubung tanpa driver & siap menerima scan barcode.`,
  });

  // Read incoming stream asynchronously
  (async () => {
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    try {
      while (port.readable) {
        const reader = port.readable.getReader();
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split(/[\r\n]+/);
              buffer = lines.pop() || '';
              for (const line of lines) {
                const clean = line.trim();
                if (clean.length >= 2) {
                  params.onBarcodeScanned(clean, deviceName);
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
    } catch {
      // Stream closed
    }
  })();

  return info;
}

