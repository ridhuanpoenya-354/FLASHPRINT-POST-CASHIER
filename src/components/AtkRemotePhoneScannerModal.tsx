import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  Camera,
  RefreshCw,
  Volume2,
  VolumeX,
  CheckCircle2,
  Minus,
  Plus,
  Trash2,
  Smartphone,
  Wifi,
  Barcode,
  X,
  Clock,
  Send,
  Zap,
} from 'lucide-react';
import {
  playScannerBeepSound,
  unlockScannerAudio,
  ensureUniqueInventoryBarcodes,
  formatSpacedBarcodeLabel,
  findUniqueMatchingProductByBarcode,
} from '../utils/atkBarcodeHelpers';
import { InventoryItem } from '../types';
import { AtkCameraOpticsBar } from './AtkCameraOpticsBar';
import {
  CameraOpticsConfig,
  CameraOpticsCapabilities,
  DEFAULT_CAMERA_OPTICS_CONFIG,
  DEFAULT_CAMERA_CAPABILITIES,
  applyCameraOpticsConstraints,
  triggerImmediateCameraRefocus,
  inspectCameraTrackCapabilities,
  decodeBarcodeFromVideoMultiPass,
} from '../utils/atkCameraOptics';
import {
  RemotePhoneSendMode,
  getSavedRemotePhoneSendMode,
  saveRemotePhoneSendMode,
  saveDesktopCameraSessionCode,
  extractPairingSessionFromQrText,
  sendRemoteCameraMessage,
  subscribeToDesktopAckOnPhone,
  isValidScannedBarcodeText,
  normalizeScannedBarcodeSku,
  fetchRemoteCatalogFromRelay,
} from '../utils/atkRemoteCameraBridge';

interface AtkRemotePhoneScannerModalProps {
  initialSessionCode: string;
  initialSendMode?: RemotePhoneSendMode;
  atkItems?: InventoryItem[];
  onClose: () => void;
}

interface RemoteScannedEntry {
  sku: string;
  sentQty: number;
  pendingQty: number;
  lastScanTime: string;
}

export const AtkRemotePhoneScannerModal: React.FC<AtkRemotePhoneScannerModalProps> = ({
  initialSessionCode,
  initialSendMode,
  atkItems,
  onClose,
}) => {
  const [sessionCode, setSessionCode] = useState(initialSessionCode || '849201');
  const [remoteCatalog, setRemoteCatalog] = useState<InventoryItem[]>([]);

  useEffect(() => {
    let active = true;
    const pullCatalog = async () => {
      const fetched = await fetchRemoteCatalogFromRelay<InventoryItem>(sessionCode);
      if (active && Array.isArray(fetched) && fetched.length > 0) {
        setRemoteCatalog(ensureUniqueInventoryBarcodes(fetched).items);
      }
    };
    void pullCatalog();
    const timer = window.setInterval(pullCatalog, 3500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [sessionCode]);

  const localCatalogItems = React.useMemo<InventoryItem[]>(() => {
    const combined: InventoryItem[] = [];
    const seenIds = new Set<string>();
    const addList = (list?: InventoryItem[]) => {
      if (!Array.isArray(list)) return;
      for (const it of list) {
        if (it && it.sku && !seenIds.has(it.id || it.sku)) {
          seenIds.add(it.id || it.sku);
          combined.push(it);
        }
      }
    };
    addList(remoteCatalog);
    addList(atkItems);
    try {
      const raw = localStorage.getItem('cetakpro_full_state_backup_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.inventory)) {
          addList(ensureUniqueInventoryBarcodes(parsed.inventory).items);
        }
      }
    } catch {
      // Ignore storage error
    }
    return combined;
  }, [atkItems, remoteCatalog]);

  const quickAtkSkuButtons = React.useMemo(() => {
    const atkList = localCatalogItems.filter(
      (i) =>
        i.category === 'ATK & Perlengkapan' ||
        (i.sku || '').toUpperCase().startsWith('ATK-')
    );
    if (atkList.length > 0) {
      return atkList.slice(0, 6).map((it) => ({
        sku: it.sku,
        label: `${formatSpacedBarcodeLabel(it.sku)} (${it.name.slice(0, 12)})`,
      }));
    }
    return [
      { sku: 'ATK-HVS4-107', label: 'ATK - HVS4 - 107 (HVS A4)' },
      { sku: 'ATK-PEN7-204', label: 'ATK - PEN7 - 204 (Pulpen AE7)' },
      { sku: 'ATK-MAPL-301', label: 'ATK - MAPL - 301 (Map L)' },
      { sku: 'ATK-LKB2-408', label: 'ATK - LKB2 - 408 (Lakban)' },
    ];
  }, [localCatalogItems]);
  const [sendMode, setSendMode] = useState<RemotePhoneSendMode>(
    () => initialSendMode || getSavedRemotePhoneSendMode()
  );
  const [deviceName] = useState(() => {
    if (typeof navigator === 'undefined') return 'Kamera Ponsel Cadangan';
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad/i.test(ua)) return 'Kamera iPhone Cadangan';
    if (/Android/i.test(ua)) return 'Kamera Ponsel Android';
    return 'Kamera Ponsel Eksternal';
  });
  const [cooldownMs, setCooldownMs] = useState<2000 | 2500 | 3000>(2500);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isCameraRunning, setIsCameraRunning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cooldownRemainingSec, setCooldownRemainingSec] = useState<number>(0);
  const [scannedList, setScannedList] = useState<RemoteScannedEntry[]>([]);
  const [lastSentStatus, setLastSentStatus] = useState<string | null>(null);
  const manualPhoneInputRef = useRef<HTMLInputElement | null>(null);
  const manualPhoneQtyRef = useRef<HTMLInputElement | null>(null);
  const [isSendingManual, setIsSendingManual] = useState(false);

  // Optimasi 100% Megapiksel, Flash/Torch, Anti-Noise 15x5mm, Autofocus & Focus Lock
  const [opticsConfig, setOpticsConfig] = useState<CameraOpticsConfig>(
    DEFAULT_CAMERA_OPTICS_CONFIG
  );
  const opticsConfigRef = useRef<CameraOpticsConfig>(DEFAULT_CAMERA_OPTICS_CONFIG);
  const [opticsCapabilities, setOpticsCapabilities] =
    useState<CameraOpticsCapabilities>(DEFAULT_CAMERA_CAPABILITIES);
  const [isRefocusingCamera, setIsRefocusingCamera] = useState(false);
  const [tapFocusReticle, setTapFocusReticle] = useState<{
    xPercent: number;
    yPercent: number;
  } | null>(null);

  useEffect(() => {
    opticsConfigRef.current = opticsConfig;
    if (isCameraRunning) {
      void applyCameraOpticsConstraints('qr-remote-phone-reader', opticsConfig).then(
        (caps) => {
          setOpticsCapabilities(caps);
        }
      );
    }
  }, [opticsConfig, isCameraRunning]);

  const handleTriggerCameraRefocus = async (normPoint?: { x: number; y: number }) => {
    if (!isCameraRunning) return;
    setIsRefocusingCamera(true);
    try {
      const caps = await triggerImmediateCameraRefocus(
        'qr-remote-phone-reader',
        opticsConfigRef.current,
        normPoint
      );
      setOpticsCapabilities(caps);
    } finally {
      setIsRefocusingCamera(false);
    }
  };

  const html5QrRef = useRef<Html5Qrcode | null>(null);
  const lastGlobalScanMsRef = useRef<number>(0);
  const perCodeScanMsRef = useRef<Record<string, number>>({});
  const candidateFrameRef = useRef<{
    code: string;
    count: number;
    firstSeenMs: number;
    lastSeenMs: number;
  }>({ code: '', count: 0, firstSeenMs: 0, lastSeenMs: 0 });
  const cooldownMsRef = useRef(cooldownMs);
  const soundEnabledRef = useRef(soundEnabled);
  const sessionCodeRef = useRef(sessionCode);
  const deviceNameRef = useRef(deviceName);
  const sendModeRef = useRef(sendMode);

  useEffect(() => {
    cooldownMsRef.current = cooldownMs;
    soundEnabledRef.current = soundEnabled;
    sessionCodeRef.current = sessionCode;
    deviceNameRef.current = deviceName;
    sendModeRef.current = sendMode;
  }, [cooldownMs, soundEnabled, sessionCode, deviceName, sendMode]);

  const handleSelectSendMode = (mode: RemotePhoneSendMode) => {
    setSendMode(mode);
    saveRemotePhoneSendMode(mode);
  };

  // Send HELLO handshake to Desktop POS when opened and periodically every 3.2s so Desktop status is always TERHUBUNG
  useEffect(() => {
    const clean = sessionCode.trim();
    if (clean.length < 4) return;

    const sendHelloPulse = () => {
      void sendRemoteCameraMessage({
        sessionCode: clean,
        type: 'HELLO',
        sendMode,
        deviceName,
      });
    };

    sendHelloPulse();
    const t1 = window.setTimeout(sendHelloPulse, 650);
    const t2 = window.setTimeout(sendHelloPulse, 1700);
    const interval = window.setInterval(sendHelloPulse, 3200);

    const unsubAck = subscribeToDesktopAckOnPhone(clean, ({ catalogJson }) => {
      if (catalogJson) {
        try {
          const parsed = JSON.parse(catalogJson);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRemoteCatalog(ensureUniqueInventoryBarcodes(parsed).items);
          }
        } catch {
          // Ignore catalog parse error
        }
      }
    });

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearInterval(interval);
      unsubAck();
    };
  }, [sessionCode, deviceName, sendMode]);

  // Countdown ticker for 2-3s cooldown badge
  useEffect(() => {
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - lastGlobalScanMsRef.current;
      const rem = Math.max(0, cooldownMsRef.current - elapsed);
      setCooldownRemainingSec(rem > 0 ? Number((rem / 1000).toFixed(1)) : 0);
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  /**
   * Handles barcode detection from camera or quick test button.
   * - Only sends when a genuine product barcode is detected (validated & 2-frame confirmed on camera stream).
   * - If sendMode === 'AUTO_SEND' (or forceSendNow === true): immediately transmits SCAN (+qty) to Web Desktop Cart!
   * - If sendMode === 'MANUAL_SEND' (and !forceSendNow): queues item in pendingQty on phone until user clicks "Manual Send ke Desktop".
   */
  const handleRemoteScanDetected = async (
    rawCode: string,
    options?: {
      bypassCooldown?: boolean;
      forceSendNow?: boolean;
      qtyToAdd?: number;
      fromCameraStream?: boolean;
    }
  ) => {
    // 0. Check if the camera scanned a Desktop Pairing QR Code (?atkRemoteSession=XXXXXX or PAIR:XXXXXX)
    const pairedQr = extractPairingSessionFromQrText(rawCode || '');
    if (pairedQr && pairedQr.sessionCode) {
      const nowPair = Date.now();
      if (nowPair - lastGlobalScanMsRef.current < 1500 && pairedQr.sessionCode === sessionCodeRef.current) {
        return;
      }
      lastGlobalScanMsRef.current = nowPair;
      const newSession = pairedQr.sessionCode;
      const newMode = pairedQr.sendMode || sendModeRef.current;
      setSessionCode(newSession);
      sessionCodeRef.current = newSession;
      saveDesktopCameraSessionCode(newSession);
      if (pairedQr.sendMode) {
        setSendMode(newMode);
        sendModeRef.current = newMode;
        saveRemotePhoneSendMode(newMode);
      }
      if (soundEnabledRef.current) {
        playScannerBeepSound('success');
      }
      await sendRemoteCameraMessage({
        sessionCode: newSession,
        type: 'HELLO',
        sendMode: newMode,
        deviceName: deviceNameRef.current,
      });
      setLastSentStatus(
        `✓ QR Auto-Connect Berhasil! Kamera Ponsel otomatis terhubung ke Kasir Web Desktop (Sesi #${newSession}). Silakan scan barcode barang.`
      );
      return;
    }

    const normalizedRaw = normalizeScannedBarcodeSku(rawCode);
    if (!normalizedRaw) return;

    // 1. Strict validation: reject QR pairing URLs, session codes, or random 1-2 digit camera noise
    if (!isValidScannedBarcodeText(normalizedRaw, sessionCodeRef.current)) {
      return;
    }

    const matchedProduct = findUniqueMatchingProductByBarcode(
      normalizedRaw,
      localCatalogItems,
      localCatalogItems
    );
    const clean = matchedProduct ? matchedProduct.sku.toUpperCase() : normalizedRaw;
    const isKnownStorePrefix = /^(ATK|PRT|IND|OUT|A3P|TNT|MAT)-/.test(clean);

    const now = Date.now();
    const waitMs = cooldownMsRef.current;
    const addQty = Math.max(1, options?.qtyToAdd ?? 1);

    if (!options?.bypassCooldown) {
      if (now - lastGlobalScanMsRef.current < waitMs) {
        return;
      }
      const prevCodeMs = perCodeScanMsRef.current[clean] || 0;
      if (now - prevCodeMs < waitMs) {
        return;
      }
    }

    // 2. If coming from live camera video stream:
    // - Known store SKUs (ATK-..., PRT-..., matched in catalog, or >= 6 char clean barcodes) fire IMMEDIATELY on first detection (0ms lag)!
    // - Short 3-5 char unknown codes require 2 detections within 1500ms (>= 20ms apart) to block background stripe noise.
    if (
      options?.fromCameraStream &&
      !matchedProduct &&
      !isKnownStorePrefix &&
      clean.length < 6
    ) {
      const cand = candidateFrameRef.current;
      if (cand.code === clean && now - cand.firstSeenMs <= 1500) {
        if (now - cand.lastSeenMs < 20) {
          return;
        }
        cand.count += 1;
        cand.lastSeenMs = now;
        if (cand.count < 2) {
          return;
        }
        candidateFrameRef.current = {
          code: '',
          count: 0,
          firstSeenMs: 0,
          lastSeenMs: 0,
        };
      } else {
        candidateFrameRef.current = {
          code: clean,
          count: 1,
          firstSeenMs: now,
          lastSeenMs: now,
        };
        return;
      }
    }

    lastGlobalScanMsRef.current = now;
    perCodeScanMsRef.current[clean] = now;
    setCooldownRemainingSec(Number((waitMs / 1000).toFixed(1)));

    if (soundEnabledRef.current) {
      playScannerBeepSound('success');
    }

    const d = new Date();
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(
      d.getMinutes()
    ).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

    const shouldSendImmediately =
      options?.forceSendNow || sendModeRef.current === 'AUTO_SEND';

    if (shouldSendImmediately) {
      setScannedList((prev) => {
        const idx = prev.findIndex((x) => x.sku === clean);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            sentQty: next[idx].sentQty + addQty,
            lastScanTime: timeStr,
          };
          return next;
        }
        return [
          { sku: clean, sentQty: addQty, pendingQty: 0, lastScanTime: timeStr },
          ...prev,
        ];
      });

      setLastSentStatus(
        `⚡ Auto-Send Instan: Mengirim [${clean}]${matchedProduct ? ` ${matchedProduct.name}` : ''} (+${addQty} Pcs) ke Keranjang Web Desktop...`
      );
      await sendRemoteCameraMessage({
        sessionCode: sessionCodeRef.current.trim(),
        type: 'SCAN',
        sku: clean,
        deltaQty: addQty,
        sendMode: sendModeRef.current,
        deviceName: deviceNameRef.current,
        itemName: matchedProduct?.name,
        unitPrice: matchedProduct?.defaultSellPrice,
        unitCost: matchedProduct?.costPerUnit,
        unit: matchedProduct?.unit,
      });
      setLastSentStatus(
        `✓ TERKIRIM KE DESKTOP (<1d): [${clean}]${matchedProduct ? ` ${matchedProduct.name}` : ''} (+${addQty} Pcs) otomatis masuk Keranjang Web Desktop (${timeStr})`
      );
    } else {
      // MANUAL_SEND mode: queue in pendingQty first until user taps Manual Send button
      setScannedList((prev) => {
        const idx = prev.findIndex((x) => x.sku === clean);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            pendingQty: next[idx].pendingQty + addQty,
            lastScanTime: timeStr,
          };
          return next;
        }
        return [
          { sku: clean, sentQty: 0, pendingQty: addQty, lastScanTime: timeStr },
          ...prev,
        ];
      });

      setLastSentStatus(
        `📋 Mode Manual Send: [${clean}] (+${addQty} Pcs) masuk antrean ponsel. Klik "Manual Send ke Desktop" untuk memasukkan ke Keranjang Web Desktop.`
      );
    }
  };

  /**
   * Manually sends a single queued item (or +1 if already sent) to Web Desktop Cart.
   */
  const handleManualSendSingleItemToDesktop = async (entry: RemoteScannedEntry) => {
    const qtyToSend = entry.pendingQty > 0 ? entry.pendingQty : 1;
    setIsSendingManual(true);
    try {
      const d = new Date();
      const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(
        d.getMinutes()
      ).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

      setScannedList((prev) =>
        prev.map((x) =>
          x.sku === entry.sku
            ? {
                ...x,
                sentQty: x.sentQty + qtyToSend,
                pendingQty: 0,
                lastScanTime: timeStr,
              }
            : x
        )
      );

      const matchedProduct = findUniqueMatchingProductByBarcode(
        entry.sku,
        localCatalogItems,
        localCatalogItems
      );
      await sendRemoteCameraMessage({
        sessionCode: sessionCode.trim(),
        type: 'SCAN',
        sku: entry.sku,
        deltaQty: qtyToSend,
        sendMode: 'MANUAL_SEND',
        deviceName,
        itemName: matchedProduct?.name,
        unitPrice: matchedProduct?.defaultSellPrice,
        unitCost: matchedProduct?.costPerUnit,
        unit: matchedProduct?.unit,
      });

      if (soundEnabled) playScannerBeepSound('success');
      setLastSentStatus(
        `✓ Manual Send Berhasil: [${entry.sku}] (+${qtyToSend} Pcs) telah masuk ke Keranjang Web Desktop (${timeStr})`
      );
    } finally {
      setIsSendingManual(false);
    }
  };

  /**
   * Manually sends ALL pending queued items from the phone to the Web Desktop Cart at once.
   */
  const handleManualSendAllPendingToDesktop = async () => {
    const pendingItems = scannedList.filter((x) => x.pendingQty > 0);
    if (pendingItems.length === 0) return;

    setIsSendingManual(true);
    try {
      const d = new Date();
      const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(
        d.getMinutes()
      ).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

      for (const item of pendingItems) {
        const matchedProduct = findUniqueMatchingProductByBarcode(
          item.sku,
          localCatalogItems,
          localCatalogItems
        );
        await sendRemoteCameraMessage({
          sessionCode: sessionCode.trim(),
          type: 'SCAN',
          sku: item.sku,
          deltaQty: item.pendingQty,
          sendMode: 'MANUAL_SEND',
          deviceName,
          itemName: matchedProduct?.name,
          unitPrice: matchedProduct?.defaultSellPrice,
          unitCost: matchedProduct?.costPerUnit,
          unit: matchedProduct?.unit,
        });
      }

      setScannedList((prev) =>
        prev.map((x) =>
          x.pendingQty > 0
            ? {
                ...x,
                sentQty: x.sentQty + x.pendingQty,
                pendingQty: 0,
                lastScanTime: timeStr,
              }
            : x
        )
      );

      if (soundEnabled) playScannerBeepSound('success');
      const totalPcs = pendingItems.reduce((acc, i) => acc + i.pendingQty, 0);
      setLastSentStatus(
        `✓ Manual Send Semua Antrean Berhasil: ${pendingItems.length} Produk (${totalPcs} Pcs) telah masuk ke Keranjang Web Desktop (${timeStr})`
      );
    } finally {
      setIsSendingManual(false);
    }
  };

  const handleRemoteAdjustQty = async (sku: string, delta: number) => {
    const target = scannedList.find((x) => x.sku === sku);
    if (!target) return;

    // If item has unsent pendingQty in MANUAL_SEND mode, adjust pendingQty locally first
    if (target.pendingQty > 0 && target.sentQty === 0) {
      setScannedList((prev) => {
        const nextQty = target.pendingQty + delta;
        if (nextQty <= 0) return prev.filter((x) => x.sku !== sku);
        return prev.map((x) =>
          x.sku === sku ? { ...x, pendingQty: nextQty } : x
        );
      });
      return;
    }

    setScannedList((prev) => {
      const idx = prev.findIndex((x) => x.sku === sku);
      if (idx < 0) return prev;
      const nextSent = prev[idx].sentQty + delta;
      if (nextSent <= 0 && prev[idx].pendingQty <= 0) {
        return prev.filter((x) => x.sku !== sku);
      }
      const next = [...prev];
      next[idx] = { ...next[idx], sentQty: Math.max(0, nextSent) };
      return next;
    });

    await sendRemoteCameraMessage({
      sessionCode: sessionCode.trim(),
      type: 'ADJUST_DELTA',
      sku,
      deltaQty: delta,
      deviceName,
    });
    setLastSentStatus(
      `✓ Koreksi Qty [${sku}] (${delta > 0 ? `+${delta}` : delta}) dikirim ke Keranjang Kasir Desktop`
    );
  };

  const handleRemoteRemoveItem = async (sku: string) => {
    const target = scannedList.find((x) => x.sku === sku);
    setScannedList((prev) => prev.filter((x) => x.sku !== sku));
    if (target && target.sentQty > 0) {
      await sendRemoteCameraMessage({
        sessionCode: sessionCode.trim(),
        type: 'REMOVE_SKU',
        sku,
        deviceName,
      });
      setLastSentStatus(`🗑️ Perintah Hapus [${sku}] dikirim ke Keranjang Kasir Desktop`);
    } else {
      setLastSentStatus(`🗑️ Antrean [${sku}] dihapus dari daftar ponsel.`);
    }
  };

  const handleScanRef = useRef(handleRemoteScanDetected);
  useEffect(() => {
    handleScanRef.current = handleRemoteScanDetected;
  });

  useEffect(() => {
    let isMounted = true;
    let frameTimer: number | null = null;
    const regionId = 'qr-remote-phone-reader';
    const macroHelperRegionId = 'qr-remote-phone-macro-helper';
    let macroHelperScanner: Html5Qrcode | null = null;

    const stopScanner = async () => {
      if (frameTimer !== null) {
        window.clearInterval(frameTimer);
        frameTimer = null;
      }
      if (html5QrRef.current) {
        try {
          if (html5QrRef.current.isScanning) {
            await html5QrRef.current.stop();
          }
          html5QrRef.current.clear();
        } catch {
          // Ignore
        }
        html5QrRef.current = null;
      }
      if (macroHelperScanner) {
        try {
          macroHelperScanner.clear();
        } catch {
          // Ignore
        }
        macroHelperScanner = null;
      }
      if (isMounted) setIsCameraRunning(false);
    };

    const startScanner = async () => {
      setCameraError(null);
      await stopScanner();
      await new Promise((r) => setTimeout(r, 150));
      if (!isMounted || !document.getElementById(regionId)) return;

      try {
        // Use clean, checksummed barcode formats (excluding ITF/CODABAR which cause false positives on background lines)
        const formatsToSupport = [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.QR_CODE,
        ];

        const scanner = new Html5Qrcode(regionId, {
          formatsToSupport,
          useBarCodeDetectorIfSupported: true,
          verbose: false,
        });
        html5QrRef.current = scanner;

        const highResVideoConstraints: MediaTrackConstraints = {
          facingMode,
          width: { ideal: opticsConfigRef.current.fullMegapixelEnabled ? 3840 : 1280 },
          height: { ideal: opticsConfigRef.current.fullMegapixelEnabled ? 2160 : 720 },
          frameRate: { ideal: 30 },
        };

        try {
          await scanner.start(
            { facingMode },
            {
              fps: 24,
              qrbox: (vw, vh) => ({
                width: Math.max(190, Math.floor(vw * 0.82)),
                height: Math.max(84, Math.floor(vh * 0.35)),
              }),
              videoConstraints: highResVideoConstraints,
              disableFlip: false,
            },
            (decodedText) => {
              handleScanRef.current(decodedText, {
                bypassCooldown: false,
                fromCameraStream: true,
              });
            },
            () => {}
          );
        } catch {
          await scanner.start(
            { facingMode },
            {
              fps: 20,
              qrbox: (vw, vh) => ({
                width: Math.max(190, Math.floor(vw * 0.82)),
                height: Math.max(84, Math.floor(vh * 0.35)),
              }),
              disableFlip: false,
            },
            (decodedText) => {
              handleScanRef.current(decodedText, {
                bypassCooldown: false,
                fromCameraStream: true,
              });
            },
            () => {}
          );
        }

        if (!isMounted) {
          await stopScanner();
          return;
        }
        setIsCameraRunning(true);

        // Terapkan 100% Megapiksel Sensor, Flash/Torch, Continuous Autofocus / Focus Lock, & Ketajaman Hardware
        const appliedCaps = await applyCameraOpticsConstraints(
          regionId,
          opticsConfigRef.current
        );
        if (isMounted) {
          setOpticsCapabilities(appliedCaps);
        }

        if (document.getElementById(macroHelperRegionId)) {
          try {
            macroHelperScanner = new Html5Qrcode(macroHelperRegionId, {
              formatsToSupport,
              useBarCodeDetectorIfSupported: true,
              verbose: false,
            });
          } catch {
            macroHelperScanner = null;
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const NativeBarcodeDetector = (window as any).BarcodeDetector;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let nativeDetector: any = null;
        if (NativeBarcodeDetector) {
          try {
            nativeDetector = new NativeBarcodeDetector({
              formats: [
                'code_128',
                'code_39',
                'code_93',
                'ean_13',
                'ean_8',
                'upc_a',
                'qr_code',
              ],
            });
          } catch {
            nativeDetector = null;
          }
        }

        let busy = false;
        let frameCounter = 0;
        const cropCanvas = document.createElement('canvas');
        const denoisedMacroCanvas = document.createElement('canvas');

        frameTimer = window.setInterval(async () => {
          if (busy || !isMounted) return;
          const v = document
            .getElementById(regionId)
            ?.querySelector('video') as HTMLVideoElement | null;
          if (!v || v.readyState < 2 || v.videoWidth === 0 || v.videoHeight === 0) return;
          busy = true;
          frameCounter += 1;
          try {
            if (frameCounter % 12 === 1 && isMounted) {
              setOpticsCapabilities(inspectCameraTrackCapabilities(regionId));
            }
            const bestRaw = await decodeBarcodeFromVideoMultiPass({
              videoEl: v,
              config: opticsConfigRef.current,
              rawCropCanvas: cropCanvas,
              denoisedMacroCanvas,
              nativeDetector,
              fallbackMacroScanner: macroHelperScanner,
              runFallbackZxingPass: frameCounter % 2 === 0,
            });
            if (bestRaw) {
              handleScanRef.current(bestRaw, {
                bypassCooldown: false,
                fromCameraStream: true,
              });
            }
          } catch {
            // Ignore
          } finally {
            busy = false;
          }
        }, 150);
      } catch (err) {
        if (isMounted) {
          setCameraError(
            err instanceof Error
              ? `Kamera belum dapat diakses (${err.message}). Gunakan tombol kirim cepat di bawah atau izinkan akses kamera.`
              : 'Gagal membuka kamera ponsel.'
          );
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, [facingMode]);

  const totalPendingCount = scannedList.reduce((acc, x) => acc + x.pendingQty, 0);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col justify-between overflow-y-auto">
      <style>{`
        #qr-remote-phone-reader video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          border-radius: 12px;
          transform: scale(${opticsConfig.macroZoom});
          transform-origin: center center;
          transition: transform 0.18s ease-out;
          filter: ${
            opticsConfig.denoiseMacroEnabled
              ? 'contrast(1.16) brightness(1.04) saturate(0.9)'
              : 'none'
          };
        }
      `}</style>

      {/* Top Header */}
      <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-xs sm:text-sm flex flex-wrap items-center gap-1.5">
              <span>Kamera Scanner Ponsel Lain (QR Auto-Connect)</span>
              <span
                className={`px-1.5 py-0.5 rounded font-mono text-[10px] text-white ${
                  sendMode === 'AUTO_SEND' ? 'bg-emerald-600' : 'bg-indigo-600'
                }`}
              >
                {sendMode === 'AUTO_SEND' ? '⚡ AUTO SEND AKTIF' : '👆 MANUAL SEND AKTIF'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Terhubung ke Kasir Web Desktop · Jeda Anti-Dobel {cooldownMs / 1000} Detik
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shrink-0"
        >
          <X className="w-4 h-4" />
          <span>Tutup</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="p-3 sm:p-4 max-w-xl w-full mx-auto flex-1 flex flex-col gap-3">
        {/* Pilihan Mode Pengiriman Data Scan ke Desktop: AUTO SEND vs MANUAL SEND */}
        <div className="bg-slate-900 border-2 border-indigo-500/60 rounded-xl p-3 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5 text-emerald-400" />
              Pilih Mode Kirim Data Scan ke Keranjang Web Desktop:
            </span>
            <span className="text-[10px] font-mono text-emerald-300">
              Sesi #{sessionCode}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleSelectSendMode('AUTO_SEND')}
              className={`min-h-[48px] p-2.5 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                sendMode === 'AUTO_SEND'
                  ? 'bg-emerald-950/90 border-2 border-emerald-400 text-white shadow-sm'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  sendMode === 'AUTO_SEND' ? 'text-emerald-400' : 'text-slate-500'
                }`}
              />
              <div>
                <div className="font-extrabold text-xs flex items-center gap-1.5">
                  <span>1. Auto Send ke Desktop</span>
                  {sendMode === 'AUTO_SEND' && (
                    <span className="px-1.5 py-0.2 bg-emerald-500 text-slate-950 rounded text-[9px] font-mono font-extrabold">
                      AKTIF
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-300 mt-0.5">
                  Begitu barcode ter-scan kamera ponsel, produk <strong>otomatis langsung masuk Keranjang di Web Desktop</strong> (+1 Pcs).
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectSendMode('MANUAL_SEND')}
              className={`min-h-[48px] p-2.5 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                sendMode === 'MANUAL_SEND'
                  ? 'bg-indigo-950/90 border-2 border-indigo-400 text-white shadow-sm'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Send
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  sendMode === 'MANUAL_SEND' ? 'text-indigo-300' : 'text-slate-500'
                }`}
              />
              <div>
                <div className="font-extrabold text-xs flex items-center gap-1.5">
                  <span>2. Manual Send ke Desktop</span>
                  {sendMode === 'MANUAL_SEND' && (
                    <span className="px-1.5 py-0.2 bg-indigo-400 text-slate-950 rounded text-[9px] font-mono font-extrabold">
                      AKTIF
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-300 mt-0.5">
                  Tampung hasil scan di ponsel dulu, atur Qty, lalu klik tombol <strong>Manual Send ke Desktop</strong> untuk masuk keranjang.
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Session Pairing & Cooldown Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div>
            <label className="block text-[10px] text-slate-400 font-semibold mb-1">
              Kode Sesi Kasir Desktop (6 Digit):
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={sessionCode}
                onChange={(e) => setSessionCode(e.target.value.trim())}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-indigo-400 font-mono font-extrabold text-sm text-emerald-300 tracking-widest"
                placeholder="849201"
              />
              <span className="px-2.5 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-[10px] flex items-center gap-1 shrink-0">
                <Wifi className="w-3.5 h-3.5" />
                Terhubung
              </span>
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 font-semibold mb-1">
              Jeda Scan Anti-Dobel (2–3 Detik):
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {([2000, 2500, 3000] as const).map((ms) => (
                <button
                  key={ms}
                  type="button"
                  onClick={() => setCooldownMs(ms)}
                  className={`min-h-[38px] rounded-lg border font-mono text-xs font-bold ${
                    cooldownMs === ms
                      ? 'bg-emerald-600 text-white border-emerald-400'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  {ms / 1000} Detik
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Camera Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                unlockScannerAudio();
                setSoundEnabled(!soundEnabled);
              }}
              className={`min-h-[42px] px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 ${
                soundEnabled
                  ? 'bg-emerald-600/20 border-emerald-400 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span>{soundEnabled ? 'Bip Aktif' : 'Bip Bisu'}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
              }
              className="min-h-[42px] px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold flex items-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Kamera {facingMode === 'environment' ? 'Belakang' : 'Depan'}</span>
            </button>
          </div>

          {cooldownRemainingSec > 0 ? (
            <span className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-mono font-extrabold text-xs flex items-center gap-1.5 animate-pulse">
              <Clock className="w-4 h-4" />
              Jeda Anti-Dobel: {cooldownRemainingSec}s
            </span>
          ) : (
            <span className="px-3 py-1.5 rounded-lg bg-emerald-950 border border-emerald-500/50 text-emerald-300 font-mono font-bold text-xs">
              ✓ Siap Scan ({sendMode === 'AUTO_SEND' ? 'Auto-Send' : 'Manual-Send'})
            </span>
          )}
        </div>

        {/* Panel Kontrol Flash, Mode Torch, Optimasi 100% Megapiksel Anti-Noise, Autofocus & Focus Lock */}
        <AtkCameraOpticsBar
          config={opticsConfig}
          capabilities={opticsCapabilities}
          isRefocusing={isRefocusingCamera}
          onChangeConfig={setOpticsConfig}
          onTriggerRefocus={() => void handleTriggerCameraRefocus({ x: 0.5, y: 0.5 })}
        />

        {/* Camera Viewport dengan Tap-to-Focus & Iluminasi Flash/Torch */}
        <div
          onClick={(e) => {
            if (!isCameraRunning) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const normX = (e.clientX - rect.left) / Math.max(1, rect.width);
            const normY = (e.clientY - rect.top) / Math.max(1, rect.height);
            setTapFocusReticle({
              xPercent: Math.round(normX * 100),
              yPercent: Math.round(normY * 100),
            });
            window.setTimeout(() => setTapFocusReticle(null), 900);
            void handleTriggerCameraRefocus({ x: normX, y: normY });
          }}
          title="Tap pada layar kamera untuk memicu Autofocus ke titik barcode"
          className={`relative w-full h-[240px] sm:h-[280px] bg-black rounded-xl overflow-hidden flex items-center justify-center cursor-crosshair transition-all ${
            opticsConfig.flashEnabled || opticsConfig.torchModeEnabled
              ? 'border-4 border-amber-300 ring-8 ring-white/90 shadow-[0_0_40px_rgba(251,191,36,0.75)]'
              : 'border-2 border-indigo-500/80'
          }`}
        >
          <div id="qr-remote-phone-reader" className="w-full h-full" />
          <div id="qr-remote-phone-macro-helper" className="hidden" />

          {opticsConfig.flashEnabled && (
            <div className="pointer-events-none absolute inset-0 border-[14px] border-white/85 rounded-xl shadow-[inset_0_0_36px_rgba(255,255,255,0.65)] z-10" />
          )}

          {tapFocusReticle && (
            <div
              style={{
                left: `${tapFocusReticle.xPercent}%`,
                top: `${tapFocusReticle.yPercent}%`,
              }}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 w-14 h-14 border-2 border-amber-300 rounded-lg animate-ping z-20"
            />
          )}

          {isCameraRunning && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 z-10">
              <div
                className={`w-[84%] max-w-[340px] h-[130px] border-2 rounded-xl relative transition-colors ${
                  cooldownRemainingSec > 0
                    ? 'border-amber-400 bg-amber-500/10'
                    : opticsConfig.focusLocked
                    ? 'border-rose-400'
                    : 'border-emerald-400'
                }`}
              >
                <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 h-0.5 bg-rose-500 animate-pulse" />
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap flex items-center gap-1.5">
                  <span
                    className={`px-2 py-0.5 rounded font-mono text-[9.5px] font-bold border ${
                      opticsConfig.focusLocked
                        ? 'bg-rose-600 text-white border-rose-300'
                        : 'bg-slate-950/90 text-sky-300 border-sky-500/40'
                    }`}
                  >
                    {isRefocusingCamera
                      ? '🎯 MENGUNCI FOKUS...'
                      : opticsConfig.focusLocked
                      ? '🔒 FOCUS LOCK AKTIF'
                      : '🎯 AUTOFOCUS (TAP = FOKUS)'}
                  </span>
                  {(opticsConfig.flashEnabled || opticsConfig.torchModeEnabled) && (
                    <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-mono text-[9.5px] font-extrabold">
                      {opticsConfig.torchModeEnabled ? '🔦 TORCH ON' : '⚡ FLASH ON'}
                    </span>
                  )}
                  {opticsConfig.macroZoom > 1 && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-mono text-[9.5px] font-extrabold">
                      🔍 {opticsConfig.macroZoom}x MACRO
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          {!isCameraRunning && !cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 gap-2 text-xs text-slate-300">
              <Camera className="w-7 h-7 text-indigo-400 animate-bounce" />
              <span>Mengaktifkan sensor kamera 100% Megapiksel & Autofocus...</span>
            </div>
          )}
        </div>

        {/* Tombol Besar MANUAL SEND SEMUA ANTREAN jika ada item pending */}
        {totalPendingCount > 0 && (
          <button
            type="button"
            disabled={isSendingManual}
            onClick={handleManualSendAllPendingToDesktop}
            className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg animate-pulse cursor-pointer"
          >
            <Send className="w-4 h-4 shrink-0" />
            <span>
              MANUAL SEND KE DESKTOP SEKARANG ({totalPendingCount} Pcs Menunggu Dikirim)
            </span>
          </button>
        )}

        {lastSentStatus && (
          <div className="p-2.5 rounded-xl bg-emerald-950 border border-emerald-400 text-emerald-200 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{lastSentStatus}</span>
          </div>
        )}

        {cameraError && (
          <div className="p-2.5 rounded-xl bg-amber-950/90 border border-amber-500/60 text-amber-200 text-[11px]">
            {cameraError}
          </div>
        )}

        {/* Manual Send SKU / Quick Barcode Buttons (Tanpa onChange lag, Enter = Instan + Auto-Focus) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
          <div className="text-[11px] font-bold text-slate-200 flex items-center justify-between">
            <span>Kolom Input Scan Barcode Instan / Manual Send ke Desktop:</span>
            <span className="text-[10px] text-emerald-400 font-mono">
              Enter = Instan Masuk Keranjang Desktop
            </span>
          </div>
          <div className="flex flex-wrap sm:flex-nowrap gap-1.5">
            <input
              ref={manualPhoneInputRef}
              type="text"
              defaultValue=""
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.keyCode === 13) {
                  e.preventDefault();
                  e.stopPropagation();
                  const val = (manualPhoneInputRef.current?.value || '').trim();
                  const qty = Math.max(
                    1,
                    parseInt(manualPhoneQtyRef.current?.value || '1', 10) || 1
                  );
                  if (val) {
                    if (manualPhoneInputRef.current) {
                      manualPhoneInputRef.current.value = '';
                      manualPhoneInputRef.current.focus();
                    }
                    if (manualPhoneQtyRef.current) {
                      manualPhoneQtyRef.current.value = '1';
                    }
                    void handleRemoteScanDetected(val, {
                      bypassCooldown: true,
                      forceSendNow: true,
                      qtyToAdd: qty,
                    });
                  }
                }
              }}
              placeholder="Scan / Ketik Barcode SKU Unik (cth: ATK-HVS4-107) lalu tekan Enter..."
              className="flex-1 min-w-[140px] px-3 py-2 rounded-lg bg-slate-950 border border-emerald-500/70 font-mono font-bold text-xs text-white focus:outline-none focus:border-emerald-400"
            />
            <input
              ref={manualPhoneQtyRef}
              type="number"
              min="1"
              max="999"
              defaultValue={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.keyCode === 13) {
                  e.preventDefault();
                  e.stopPropagation();
                  const val = (manualPhoneInputRef.current?.value || '').trim();
                  const qty = Math.max(
                    1,
                    parseInt(manualPhoneQtyRef.current?.value || '1', 10) || 1
                  );
                  if (val) {
                    if (manualPhoneInputRef.current) {
                      manualPhoneInputRef.current.value = '';
                      manualPhoneInputRef.current.focus();
                    }
                    if (manualPhoneQtyRef.current) {
                      manualPhoneQtyRef.current.value = '1';
                    }
                    void handleRemoteScanDetected(val, {
                      bypassCooldown: true,
                      forceSendNow: true,
                      qtyToAdd: qty,
                    });
                  }
                }
              }}
              className="w-16 px-2 py-2 rounded-lg bg-slate-950 border border-slate-700 font-mono font-bold text-center text-xs text-emerald-300"
              title="Jumlah Qty"
            />
            <button
              type="button"
              onClick={() => {
                const val = (manualPhoneInputRef.current?.value || '').trim();
                const qty = Math.max(
                  1,
                  parseInt(manualPhoneQtyRef.current?.value || '1', 10) || 1
                );
                if (val) {
                  if (manualPhoneInputRef.current) {
                    manualPhoneInputRef.current.value = '';
                    manualPhoneInputRef.current.focus();
                  }
                  if (manualPhoneQtyRef.current) {
                    manualPhoneQtyRef.current.value = '1';
                  }
                  void handleRemoteScanDetected(val, {
                    bypassCooldown: true,
                    forceSendNow: true,
                    qtyToAdd: qty,
                  });
                }
              }}
              className="min-h-[42px] px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Manual Send ke Desktop</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {quickAtkSkuButtons.map((btn) => (
              <button
                key={btn.sku}
                type="button"
                onClick={() =>
                  handleRemoteScanDetected(btn.sku, {
                    bypassCooldown: true,
                  })
                }
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold flex items-center gap-1"
              >
                <Barcode className="w-3.5 h-3.5" />
                <span>
                  {btn.label} ({sendMode === 'AUTO_SEND' ? 'Auto Send' : 'Masuk Antrean'})
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Daftar Barang Ter-scan: Atur Ulang / Hapus Qty & Tombol Manual Send per Item */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-xs text-white">
              Daftar Scan Ponsel — Atur Qty / Manual Send ({scannedList.length} Produk):
            </span>
            {totalPendingCount > 0 && (
              <button
                type="button"
                onClick={handleManualSendAllPendingToDesktop}
                className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 font-extrabold text-[11px] flex items-center gap-1"
              >
                <Send className="w-3 h-3" />
                <span>Kirim Semua ({totalPendingCount} Pcs)</span>
              </button>
            )}
          </div>

          {scannedList.length === 0 ? (
            <div className="text-[11px] text-slate-400 py-3 text-center">
              Belum ada barang di-scan pada sesi ponsel ini.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {scannedList.map((entry) => (
                <div
                  key={entry.sku}
                  className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-emerald-300">
                        {entry.sku}
                      </span>
                      {entry.sentQty > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-500/50 text-emerald-300 font-mono text-[10px]">
                          ✓ Terkirim: {entry.sentQty} Pcs
                        </span>
                      )}
                      {entry.pendingQty > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400 text-amber-300 font-mono font-bold text-[10px]">
                          ⏳ Antrean: {entry.pendingQty} Pcs
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Scan terakhir: {entry.lastScanTime}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Tombol Manual Send ke Desktop */}
                    <button
                      type="button"
                      disabled={isSendingManual}
                      onClick={() => handleManualSendSingleItemToDesktop(entry)}
                      className={`min-h-[38px] px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1 ${
                        entry.pendingQty > 0
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                          : 'bg-indigo-700 hover:bg-indigo-600 text-white'
                      }`}
                      title="Kirim Manual ke Keranjang Web Desktop"
                    >
                      <Send className="w-3 h-3" />
                      <span>
                        {entry.pendingQty > 0
                          ? `Manual Send (+${entry.pendingQty})`
                          : 'Manual Send (+1)'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemoteAdjustQty(entry.sku, -1)}
                      className="min-w-[38px] min-h-[38px] rounded-lg bg-slate-800 hover:bg-rose-900/60 border border-slate-700 flex items-center justify-center text-white"
                      title="Kurangi 1 Qty"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="min-w-[32px] text-center font-mono font-extrabold text-xs text-white">
                      {entry.sentQty + entry.pendingQty}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoteAdjustQty(entry.sku, 1)}
                      className="min-w-[38px] min-h-[38px] rounded-lg bg-emerald-700 hover:bg-emerald-600 flex items-center justify-center text-white"
                      title="Tambah 1 Qty"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoteRemoveItem(entry.sku)}
                      className="min-w-[38px] min-h-[38px] px-2 rounded-lg bg-rose-600/20 hover:bg-rose-600 border border-rose-500/50 text-rose-300 hover:text-white flex items-center justify-center gap-1 text-[11px] font-bold"
                      title="Hapus produk ini dari keranjang"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
