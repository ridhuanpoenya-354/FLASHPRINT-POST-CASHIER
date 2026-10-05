import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  Search,
  Camera,
  CameraOff,
  Barcode,
  Printer,
  Bluetooth,
  Usb,
  ShoppingCart,
  Plus,
  Minus,
  Edit3,
  CheckCircle2,
  Volume2,
  VolumeX,
  RefreshCw,
  Tag,
  Sparkles,
  FileText,
  Download,
  Zap,
  Trash2,
  Keyboard,
  X,
  Smartphone,
  QrCode,
  Wifi,
  Clock,
  Copy,
  Check,
  Monitor,
  Send,
  Maximize2,
} from 'lucide-react';
import {
  InventoryItem,
  InventoryCategory,
  InventoryUnit,
  OrderCartItem,
  PrintOrder,
  StoreSettings,
  PrintPaperSize,
  formatIDR,
  formatNumberID,
} from '../types';
import {
  generateNextAtkSku,
  renderCode128BarcodeDataUrl,
  playScannerBeepSound,
  unlockScannerAudio,
  downloadAtkReceiptPdfFallback,
  findUniqueMatchingProductByBarcode,
  formatSpacedBarcodeLabel,
} from '../utils/atkBarcodeHelpers';
import {
  DirectPrinterMode,
  getSavedBluetoothPrinter,
  saveBluetoothPrinter,
  clearSavedBluetoothPrinter,
  getSavedUsbPrinter,
  clearSavedUsbPrinter,
  getPreferredAtkPrintMode,
  setPreferredAtkPrintMode,
  isWebBluetoothSupported,
  isWebUsbSupported,
  printViaWebBluetooth,
  printViaWebUsb,
} from '../utils/atkThermalPrinter';
import { AtkBarcodeLabelModal } from './AtkBarcodeLabelModal';
import { AtkRemotePhoneScannerModal } from './AtkRemotePhoneScannerModal';
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
  getOrCreateDesktopCameraSessionCode,
  regenerateDesktopCameraSessionCode,
  saveDesktopCameraSessionCode,
  extractPairingSessionFromQrText,
  getSavedPreferredExternalCameraId,
  savePreferredExternalCameraId,
  RemotePhoneSendMode,
  getSavedRemotePhoneSendMode,
  saveRemotePhoneSendMode,
  buildRemotePhoneScannerUrl,
  sendRemoteCameraMessage,
  pullRecentRemoteCameraMessages,
  subscribeToRemoteCameraSession,
  isValidScannedBarcodeText,
  normalizeScannedBarcodeSku,
  syncDesktopCatalogToRemoteRelay,
  RemoteCameraScanMessage,
  SavedBluetoothScannerInfo,
  getSavedBluetoothScannerDevice,
  clearSavedBluetoothScannerDevice,
  isWebBluetoothScannerSupported,
  isWebSerialBluetoothSupported,
  connectBluetoothScannerOrCamera,
  connectBluetoothSerialSppScanner,
  disconnectActiveBluetoothScanner,
} from '../utils/atkRemoteCameraBridge';

interface AtkPosSubTabPanelProps {
  inventory: InventoryItem[];
  cartItems: OrderCartItem[];
  selectedMaterialId: string;
  storeSettings: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>;
  paperSize: PrintPaperSize;
  isSyncingPresets: boolean;
  isSubmittingOrder: boolean;
  lastCreatedAtkOrder: PrintOrder | null;
  onSyncInitialAtkPresets: () => Promise<void>;
  onCreateInventoryItem?: (
    itemData: Omit<InventoryItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onUpdateInventoryItem?: (
    itemId: string,
    itemData: Omit<InventoryItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onSelectAtkProductToForm: (item: InventoryItem) => void;
  onQuickAddAtkToCart: (item: InventoryItem, deltaQty: number) => void;
  onSetCartItemExactQty?: (cartItemId: string, exactQty: number) => void;
  onRemoveCartItemById?: (cartItemId: string) => void;
  onClearAllCartItems?: () => void;
  onInstantCheckoutAndPrintAtk: (
    preferredMode: DirectPrinterMode
  ) => Promise<PrintOrder | null>;
  onOpenPrintModal: (
    order: PrintOrder,
    mode: 'invoice' | 'spk',
    size?: PrintPaperSize
  ) => void;
  onDownloadOrderPng: (order: PrintOrder) => Promise<void>;
  onOpenFullscreenPos?: () => void;
}

export const AtkPosSubTabPanel: React.FC<AtkPosSubTabPanelProps> = ({
  inventory,
  cartItems,
  selectedMaterialId,
  storeSettings,
  paperSize,
  isSyncingPresets,
  isSubmittingOrder,
  lastCreatedAtkOrder,
  onSyncInitialAtkPresets,
  onCreateInventoryItem,
  onUpdateInventoryItem,
  onSelectAtkProductToForm,
  onQuickAddAtkToCart,
  onSetCartItemExactQty,
  onRemoveCartItemById,
  onClearAllCartItems,
  onInstantCheckoutAndPrintAtk,
  onOpenPrintModal,
  onDownloadOrderPng,
  onOpenFullscreenPos,
}) => {
  // Filter ATK items from inventory
  const atkItems = useMemo(() => {
    return inventory.filter(
      (i) =>
        i.category === 'ATK & Perlengkapan' ||
        i.sku.toUpperCase().startsWith('ATK-')
    );
  }, [inventory]);

  // 1. Search Bar & Filter State (Responsive Tablet, HP, & Desktop + Keyboard Shortcuts)
  const [atkSearchQuery, setAtkSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'AVAILABLE' | 'LOW' | 'IN_CART'>('ALL');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // 2. Direct Camera Scan to Cart State (html5-qrcode)
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [isCameraRunning, setIsCameraRunning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [scanToast, setScanToast] = useState<{
    item: InventoryItem;
    sku: string;
    name: string;
    price: number;
    totalInCart: number;
    timestamp: string;
    sourceLabel?: string;
  } | null>(null);
  const [scanHistoryCount, setScanHistoryCount] = useState(0);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  // Anti-Duplicate Scan: Jeda/Cooldown 2-3 detik (default 2500ms / 2.5 detik) agar tidak ada barang dobel di keranjang
  const [scanCooldownMs, setScanCooldownMs] = useState<2000 | 2500 | 3000>(2500);
  const scanCooldownMsRef = useRef<number>(2500);
  const globalLastScanMsRef = useRef<number>(0);
  const productCooldownMapRef = useRef<Record<string, number>>({});
  const [cooldownRemainingSec, setCooldownRemainingSec] = useState<number>(0);

  const [cameraDevices, setCameraDevices] = useState<
    Array<{ id: string; label: string; isExternalOrPhone: boolean }>
  >([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() =>
    getSavedPreferredExternalCameraId()
  );
  const [lastDetectedRawCode, setLastDetectedRawCode] = useState<string>('');

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
      void applyCameraOpticsConstraints('qr-reader', opticsConfig).then((caps) => {
        setOpticsCapabilities(caps);
      });
    }
  }, [opticsConfig, isCameraRunning]);

  const handleTriggerCameraRefocus = async (normPoint?: { x: number; y: number }) => {
    if (!isCameraRunning) return;
    setIsRefocusingCamera(true);
    try {
      const caps = await triggerImmediateCameraRefocus(
        'qr-reader',
        opticsConfigRef.current,
        normPoint
      );
      setOpticsCapabilities(caps);
    } finally {
      setIsRefocusingCamera(false);
    }
  };

  // Fitur Khusus Mode Web Desktop: Menu Sambungkan Kamera Ponsel / Kamera Eksternal / Kamera Barcode (Auto-Detect Tanpa Driver)
  const [showExternalCameraHub, setShowExternalCameraHub] = useState(false);
  const [autoSwitchExternalCam, setAutoSwitchExternalCam] = useState(true);
  const [globalHidBarcodeAutoDetect, setGlobalHidBarcodeAutoDetect] = useState(true);
  const [desktopSessionCode, setDesktopSessionCode] = useState<string>(() =>
    getOrCreateDesktopCameraSessionCode()
  );
  const [connectedRemotePhoneName, setConnectedRemotePhoneName] = useState<string | null>(
    null
  );
  const [lastRemoteEventBanner, setLastRemoteEventBanner] = useState<string | null>(null);
  const [copiedPairingLink, setCopiedPairingLink] = useState(false);
  const [isRemotePhoneSenderModalOpen, setIsRemotePhoneSenderModalOpen] = useState(false);
  const [remotePhoneSendMode, setRemotePhoneSendMode] = useState<RemotePhoneSendMode>(() =>
    getSavedRemotePhoneSendMode()
  );
  const manualDesktopInputRef = useRef<HTMLInputElement | null>(null);
  const manualDesktopQtyRef = useRef<HTMLInputElement | null>(null);
  const [isPullingPhoneScans, setIsPullingPhoneScans] = useState(false);

  // Sambungan Kamera Eksternal / Ponsel / Barcode Scanner via Bluetooth (Auto-Detect Tanpa Driver)
  const [savedBtScanner, setSavedBtScanner] = useState<SavedBluetoothScannerInfo | null>(
    () => getSavedBluetoothScannerDevice()
  );
  const [isBtScannerConnected, setIsBtScannerConnected] = useState(false);
  const [isConnectingBtScanner, setIsConnectingBtScanner] = useState(false);

  // 3. Dual-Mode Direct Print (Web Bluetooth Auto-Remember & WebUSB + Smart Fallback)
  const [printMode, setPrintMode] = useState<DirectPrinterMode>(() =>
    getPreferredAtkPrintMode()
  );
  const [savedBtPrinter, setSavedBtPrinter] = useState(() =>
    getSavedBluetoothPrinter()
  );
  const [savedUsbPrinter, setSavedUsbPrinter] = useState(() =>
    getSavedUsbPrinter()
  );
  const [btChunkSize, setBtChunkSize] = useState<number>(
    () => getSavedBluetoothPrinter()?.chunkByteSize || 32
  );
  const [thermalCols, setThermalCols] = useState<32 | 48>(
    () => getSavedBluetoothPrinter()?.paperColumns || 48
  );
  const [isPrintingDirect, setIsPrintingDirect] = useState(false);
  const [printerStatusBanner, setPrinterStatusBanner] = useState<{
    type: 'SUCCESS' | 'WARNING' | 'ERROR';
    text: string;
  } | null>(null);
  const [showPrinterPanel, setShowPrinterPanel] = useState(false);

  // 4. Auto-Generate SKU & Add/Edit ATK Master Stock + Label Barcode Modal
  const [showAtkStockForm, setShowAtkStockForm] = useState(false);
  const [editingAtkItem, setEditingAtkItem] = useState<InventoryItem | null>(null);
  const [formSku, setFormSku] = useState('');
  const [isFormSkuManuallyEdited, setIsFormSkuManuallyEdited] = useState(false);
  const [formSkuSalt, setFormSkuSalt] = useState(0);
  const [formName, setFormName] = useState('');
  const [formUnit, setFormUnit] = useState<InventoryUnit>('Pcs');
  const [formQtyInput, setFormQtyInput] = useState('30');
  const [formMinQtyInput, setFormMinQtyInput] = useState('5');
  const [formCostInput, setFormCostInput] = useState('2500');
  const [formSellInput, setFormSellInput] = useState('5000');
  const [formLocation, setFormLocation] = useState('Etalase Kasir ATK');
  const [isSavingStock, setIsSavingStock] = useState(false);

  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [labelModalTargetItem, setLabelModalTargetItem] = useState<InventoryItem | null>(
    null
  );

  // Keep latest callback ref for continuous camera scanner
  const latestAtkItemsRef = useRef(atkItems);
  const latestCartItemsRef = useRef(cartItems);
  const latestSoundEnabledRef = useRef(soundEnabled);
  const latestQuickAddRef = useRef(onQuickAddAtkToCart);
  const latestRemoveCartByIdRef = useRef(onRemoveCartItemById);
  const desktopCandidateFrameRef = useRef<{
    code: string;
    count: number;
    firstSeenMs: number;
    lastSeenMs: number;
  }>({ code: '', count: 0, firstSeenMs: 0, lastSeenMs: 0 });

  useEffect(() => {
    latestAtkItemsRef.current = atkItems;
    latestCartItemsRef.current = cartItems;
    latestSoundEnabledRef.current = soundEnabled;
    latestQuickAddRef.current = onQuickAddAtkToCart;
    latestRemoveCartByIdRef.current = onRemoveCartItemById;
    scanCooldownMsRef.current = scanCooldownMs;
  }, [
    atkItems,
    cartItems,
    soundEnabled,
    onQuickAddAtkToCart,
    onRemoveCartItemById,
    scanCooldownMs,
  ]);

  // Live countdown ticker for the 2-3 second anti-double-scan cooldown
  useEffect(() => {
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - globalLastScanMsRef.current;
      const rem = Math.max(0, scanCooldownMsRef.current - elapsed);
      setCooldownRemainingSec(rem > 0 ? Number((rem / 1000).toFixed(1)) : 0);
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  // Helper to classify whether a video input device is an External / USB / Bluetooth / Phone Camera vs Built-in Webcam
  const classifyIsExternalOrPhoneCamera = (label: string, idx: number): boolean => {
    const lower = (label || '').toLowerCase();
    if (
      lower.includes('usb') ||
      lower.includes('bluetooth') ||
      lower.includes('bt ') ||
      lower.includes('wireless') ||
      lower.includes('external') ||
      lower.includes('droidcam') ||
      lower.includes('iriun') ||
      lower.includes('camo') ||
      lower.includes('epoccam') ||
      lower.includes('iphone') ||
      lower.includes('android') ||
      lower.includes('phone') ||
      lower.includes('continuity') ||
      lower.includes('virtual') ||
      lower.includes('obs') ||
      lower.includes('barcode') ||
      lower.includes('scanner') ||
      lower.includes('logitech') ||
      lower.includes('2.0')
    ) {
      return true;
    }
    return idx > 0;
  };

  // Auto-Detect Kamera Eksternal / Kamera Ponsel via navigator.mediaDevices.ondevicechange (Plug & Play Tanpa Driver)
  const refreshAndAutoDetectCameras = async (triggerAutoSwitch = false) => {
    try {
      const cams = await Html5Qrcode.getCameras();
      if (Array.isArray(cams) && cams.length > 0) {
        const mapped = cams.map((c, idx) => ({
          id: c.id,
          label: c.label || `Kamera #${idx + 1}`,
          isExternalOrPhone: classifyIsExternalOrPhoneCamera(c.label || '', idx),
        }));
        setCameraDevices(mapped);

        if (triggerAutoSwitch && autoSwitchExternalCam) {
          const externalCam = mapped.find((m) => m.isExternalOrPhone);
          if (externalCam && externalCam.id !== selectedCameraId) {
            setSelectedCameraId(externalCam.id);
            savePreferredExternalCameraId(externalCam.id);
            setLastRemoteEventBanner(
              `🔌 Auto-Detect Tanpa Driver: Kamera Eksternal / Ponsel "${externalCam.label}" terdeteksi & diaktifkan otomatis.`
            );
          }
        }
      }
    } catch {
      // Ignore if camera permission not yet granted
    }
  };

  useEffect(() => {
    refreshAndAutoDetectCameras(false);
    if (
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.addEventListener === 'function'
    ) {
      const handleDeviceChange = () => {
        refreshAndAutoDetectCameras(true);
      };
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      };
    }
  }, [autoSwitchExternalCam]);

  // Desktop keyboard shortcuts: F2 or Alt+S focuses Search Bar, Alt+C toggles Camera Scan, Alt+B opens Barcode Label Modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2' || (e.altKey && e.key.toLowerCase() === 's')) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        setIsCameraScannerOpen((prev) => !prev);
      } else if (e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setLabelModalTargetItem(null);
        setLabelModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-generate specific & unique Space-Bar SKU when opening Add New ATK Product form
  const openNewAtkProductForm = () => {
    setEditingAtkItem(null);
    setIsFormSkuManuallyEdited(false);
    setFormSkuSalt(0);
    const nextSku = generateNextAtkSku(inventory, 'ATK & Perlengkapan', '', 0);
    setFormSku(nextSku);
    setFormName('');
    setFormUnit('Pcs');
    setFormQtyInput('30');
    setFormMinQtyInput('5');
    setFormCostInput('2500');
    setFormSellInput('5000');
    setFormLocation('Etalase Kasir ATK');
    setShowAtkStockForm(true);
  };

  const openEditAtkProductForm = (item: InventoryItem) => {
    setEditingAtkItem(item);
    setIsFormSkuManuallyEdited(true);
    setFormSkuSalt(0);
    setFormSku(
      item.sku ||
        generateNextAtkSku(inventory, 'ATK & Perlengkapan', item.name, 0, item.id)
    );
    setFormName(item.name);
    setFormUnit(item.unit);
    setFormQtyInput(String(item.stockQty));
    setFormMinQtyInput(String(item.minStockQty));
    setFormCostInput(String(item.costPerUnit));
    setFormSellInput(String(item.defaultSellPrice));
    setFormLocation(item.location || 'Etalase Kasir ATK');
    setShowAtkStockForm(true);
  };

  const formBarcodePreviewUrl = useMemo(() => {
    return renderCode128BarcodeDataUrl(formSku || 'ATK-HVS4-107', {
      width: 3,
      height: 52,
      displayValue: true,
      fontSize: 13,
      margin: 4,
    });
  }, [formSku]);

  const handleSaveAtkStockForm = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!formName.trim()) return;
    setIsSavingStock(true);
    try {
      const rawInputSku = formSku
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '-')
        .replace(/[^A-Z0-9\-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      const isDuplicateOrGeneric =
        !rawInputSku ||
        /^[A-Z]{2,4}-\d{1,4}$/.test(rawInputSku) ||
        inventory.some(
          (it) =>
            it.id !== editingAtkItem?.id &&
            it.sku.trim().toUpperCase() === rawInputSku
        );

      const cleanSku = isDuplicateOrGeneric
        ? generateNextAtkSku(
            inventory,
            'ATK & Perlengkapan',
            formName.trim(),
            formSkuSalt,
            editingAtkItem?.id
          )
        : rawInputSku;

      const payload: Omit<InventoryItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> = {
        sku: cleanSku,
        name: formName.trim(),
        category: 'ATK & Perlengkapan' as InventoryCategory,
        unit: formUnit,
        stockQty: Math.max(0, parseFloat(formQtyInput) || 0),
        minStockQty: Math.max(0, parseFloat(formMinQtyInput) || 0),
        costPerUnit: Math.max(0, parseInt(formCostInput, 10) || 0),
        defaultSellPrice: Math.max(0, parseInt(formSellInput, 10) || 0),
        supplierName: editingAtkItem?.supplierName || 'Grosir / Distributor ATK',
        location: formLocation.trim() || 'Etalase Kasir ATK',
      };

      if (editingAtkItem && onUpdateInventoryItem) {
        await onUpdateInventoryItem(editingAtkItem.id, payload);
      } else if (onCreateInventoryItem) {
        await onCreateInventoryItem(payload);
      }
      setShowAtkStockForm(false);
      setEditingAtkItem(null);
    } finally {
      setIsSavingStock(false);
    }
  };

  // Filtered ATK products for Grid
  const filteredAtkItems = useMemo(() => {
    return atkItems.filter((item) => {
      const inCartQty = cartItems
        .filter((c) => c.materialId === item.id || c.jobTitle === item.name)
        .reduce((acc, c) => acc + c.qty, 0);

      if (stockFilter === 'AVAILABLE' && item.stockQty <= 0) return false;
      if (stockFilter === 'LOW' && item.stockQty > item.minStockQty) return false;
      if (stockFilter === 'IN_CART' && inCartQty <= 0) return false;

      if (atkSearchQuery.trim()) {
        const q = atkSearchQuery.trim().toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q) ||
          (item.location || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [atkItems, cartItems, stockFilter, atkSearchQuery]);

  // Callback onScanSuccess(decodedText, sourceLabel):
  // Secara OTOMATIS mencari produk berdasarkan SKU/Barcode dan menambahkannya (+1 Qty) ke state Keranjang Belanja ATK (cart)
  // dengan efek suara bip native (~800Hz, 0.1s) & jeda anti-dobel 2-3 detik (2000ms - 3000ms)
  const onScanSuccess = (
    decodedText: string,
    sourceLabel = 'Kamera Scanner',
    options?: {
      deltaQty?: number;
      bypassDesktopCooldown?: boolean;
      fromCameraStream?: boolean;
      fromRemotePhone?: boolean;
      remoteItemMeta?: {
        itemName?: string;
        unitPrice?: number;
        unitCost?: number;
        unit?: string;
      };
    }
  ) => {
    // 0. Jika kamera di ponsel memindai QR Code Pairing Kasir Desktop (?atkRemoteSession=XXXXXX),
    // langsung hubungkan sesi & buka layar Kamera Scanner Ponsel!
    if (!options?.fromRemotePhone) {
      const pairedQr = extractPairingSessionFromQrText(decodedText || '');
      if (pairedQr && pairedQr.sessionCode) {
        const nextSession = pairedQr.sessionCode;
        const nextMode = pairedQr.sendMode || remotePhoneSendMode;
        setDesktopSessionCode(nextSession);
        saveDesktopCameraSessionCode(nextSession);
        if (pairedQr.sendMode) {
          setRemotePhoneSendMode(nextMode);
          saveRemotePhoneSendMode(nextMode);
        }
        if (latestSoundEnabledRef.current) {
          playScannerBeepSound('success');
        }
        setIsCameraScannerOpen(false);
        setIsRemotePhoneSenderModalOpen(true);
        void sendRemoteCameraMessage({
          sessionCode: nextSession,
          type: 'HELLO',
          sendMode: nextMode,
          deviceName: 'Kamera Ponsel (QR Auto-Connect)',
        });
        setLastRemoteEventBanner(
          `📱 QR Auto-Connect Berhasil: Terhubung ke Sesi Kasir Desktop #${nextSession}!`
        );
        return;
      }
    }

    const cleanCode = normalizeScannedBarcodeSku(decodedText || '');
    if (!cleanCode) return;

    // 1. Tolak URL QR Pairing, kode sesi 6 digit, atau noise kamera 1-2 digit
    if (!isValidScannedBarcodeText(cleanCode, desktopSessionCode)) {
      return;
    }

    const nowMs = Date.now();
    const normKey = cleanCode.toUpperCase();
    const cooldownMs = scanCooldownMsRef.current;
    const addQty = Math.max(1, options?.deltaQty ?? 1);

    if (!options?.bypassDesktopCooldown) {
      if (nowMs - globalLastScanMsRef.current < cooldownMs) {
        return;
      }
      const prevScanMs = productCooldownMapRef.current[normKey] || 0;
      if (nowMs - prevScanMs < cooldownMs) {
        return;
      }
    }

    const currentItems = latestAtkItemsRef.current;
    let matched = findUniqueMatchingProductByBarcode(
      cleanCode,
      currentItems,
      inventory
    );
    const isKnownStorePrefix = /^(ATK|PRT|IND|OUT|A3P|TNT|MAT)-/.test(normKey);

    // 2. Jika berasal dari stream video kamera langsung dan BUKAN produk toko yang sudah dikenal,
    // wajib terkonfirmasi di 2 frame kamera berturut-turut untuk kode pendek (< 6 karakter) agar noise latar belakang tidak memicu scan palsu.
    // Namun jika sudah cocok dengan SKU/Barcode produk toko atau barcode >= 6 karakter, langsung proses instan (0ms delay)!
    if (
      options?.fromCameraStream &&
      !matched &&
      !isKnownStorePrefix &&
      normKey.length < 6
    ) {
      const cand = desktopCandidateFrameRef.current;
      if (cand.code === normKey && nowMs - cand.firstSeenMs <= 1500) {
        if (nowMs - cand.lastSeenMs < 20) {
          return;
        }
        cand.count += 1;
        cand.lastSeenMs = nowMs;
        if (cand.count < 2) {
          return;
        }
        desktopCandidateFrameRef.current = {
          code: '',
          count: 0,
          firstSeenMs: 0,
          lastSeenMs: 0,
        };
      } else {
        desktopCandidateFrameRef.current = {
          code: normKey,
          count: 1,
          firstSeenMs: nowMs,
          lastSeenMs: nowMs,
        };
        return;
      }
    }

    // 3. Jika berasal dari scan Kamera Ponsel (Auto Send / Manual Send) atau memiliki metadata produk,
    // pastikan data barang SELALU masuk ke keranjang meskipun SKU baru belum tersinkron di daftar lokal
    if (
      !matched &&
      (options?.fromRemotePhone ||
        Boolean(options?.remoteItemMeta?.itemName) ||
        isKnownStorePrefix)
    ) {
      const meta = options?.remoteItemMeta;
      const validUnits: InventoryUnit[] = [
        'm2',
        'Roll',
        'Lembar',
        'Liter',
        'Pcs',
        'Pack',
      ];
      const resolvedUnit: InventoryUnit =
        meta?.unit && validUnits.includes(meta.unit as InventoryUnit)
          ? (meta.unit as InventoryUnit)
          : 'Pcs';
      const resolvedPrice =
        typeof meta?.unitPrice === 'number' && meta.unitPrice > 0
          ? meta.unitPrice
          : 5000;
      const resolvedCost =
        typeof meta?.unitCost === 'number' && meta.unitCost >= 0
          ? meta.unitCost
          : 3000;
      const resolvedName =
        meta?.itemName && meta.itemName.trim()
          ? meta.itemName.trim()
          : 'Produk ATK';

      matched = {
        id: `atk_scan_${normKey.replace(/[^A-Z0-9]/g, '_')}`,
        ownerId: '',
        sku: normKey,
        name: resolvedName,
        category: 'ATK & Perlengkapan',
        unit: resolvedUnit,
        stockQty: 100,
        minStockQty: 5,
        costPerUnit: resolvedCost,
        defaultSellPrice: resolvedPrice,
        supplierName: 'Grosir ATK',
        location: 'Etalase Kasir ATK',
      };
    }

    // Jika berasal dari stream kamera tetapi bukan SKU/Barcode produk yang terdaftar di stok, abaikan noise
    if (!matched && options?.fromCameraStream) {
      return;
    }

    if (!options?.bypassDesktopCooldown && matched) {
      const matchedSkuKey = matched.sku.toUpperCase();
      const prevMatchedMs = productCooldownMapRef.current[matchedSkuKey] || 0;
      if (nowMs - prevMatchedMs < cooldownMs) {
        return;
      }
    }

    globalLastScanMsRef.current = nowMs;
    productCooldownMapRef.current[normKey] = nowMs;
    if (matched) {
      productCooldownMapRef.current[matched.sku.toUpperCase()] = nowMs;
    }
    setCooldownRemainingSec(Number((cooldownMs / 1000).toFixed(1)));
    setLastDetectedRawCode(matched ? matched.sku : cleanCode);

    if (matched) {
      // Efek Suara Bip Native (~800Hz, durasi 0.1s) via AudioContext
      if (latestSoundEnabledRef.current) {
        playScannerBeepSound('success');
      }

      // Otomatis tambahkan Qty ke Keranjang Belanja ATK di Web Desktop
      latestQuickAddRef.current(matched, addQty);

      const prevCartQty = latestCartItemsRef.current
        .filter((c) => c.materialId === matched!.id || c.jobTitle === matched!.name)
        .reduce((acc, c) => acc + c.qty, 0);

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes()
      ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      setScanToast({
        item: matched,
        sku: matched.sku,
        name: matched.name,
        price: matched.defaultSellPrice,
        totalInCart: prevCartQty + addQty,
        timestamp: timeStr,
        sourceLabel,
      });
      setScanHistoryCount((c) => c + 1);
      setCameraError(null);
    } else {
      if (latestSoundEnabledRef.current) {
        playScannerBeepSound('error');
      }
      setCameraError(
        `Kode Barcode/SKU "${cleanCode}" terdeteksi, namun belum ada produk di Master Stok ATK.`
      );
    }
  };

  const handleProcessScannedBarcode = (rawCode: string, sourceLabel = 'Uji Cepat') => {
    // Bypass cooldown only when user explicitly clicks a manual simulation button
    const cleanCode = (rawCode || '').trim().toUpperCase();
    if (cleanCode) {
      delete productCooldownMapRef.current[cleanCode];
      globalLastScanMsRef.current = 0;
    }
    onScanSuccess(rawCode, sourceLabel);
  };

  // Keep latest onScanSuccess in a ref so camera loops and remote phone listeners always call the freshest closure
  const onScanSuccessRef = useRef(onScanSuccess);
  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  });

  // Sync live Desktop ATK catalog to Same-Origin Relay so paired Phone Camera always knows all custom products
  useEffect(() => {
    if (atkItems.length > 0) {
      void syncDesktopCatalogToRemoteRelay(desktopSessionCode, atkItems);
    }
  }, [desktopSessionCode, atkItems]);

  // Subscribe Desktop POS to Wireless Remote Phone Camera Scanner (Auto-Send & Manual-Send Tanpa Driver)
  useEffect(() => {
    const unsubscribe = subscribeToRemoteCameraSession(
      desktopSessionCode,
      (msg: RemoteCameraScanMessage) => {
        setConnectedRemotePhoneName(msg.deviceName || 'Kamera Ponsel Eksternal');
        if (msg.sendMode) {
          setRemotePhoneSendMode(msg.sendMode);
        }
        if (msg.type === 'HELLO') {
          const modeInfo =
            msg.sendMode === 'MANUAL_SEND'
              ? 'Mode Manual Send Data Scan ke Desktop'
              : 'Mode Auto Send Data Scan ke Desktop';
          setLastRemoteEventBanner(
            `📱 Terhubung Otomatis (Tanpa Driver): "${msg.deviceName}" aktif dalam ${modeInfo}.`
          );
          return;
        }
        if (msg.type === 'SCAN' && msg.sku) {
          const qtyToAdd = Math.max(1, msg.deltaQty || 1);
          const modeLabel =
            msg.sendMode === 'MANUAL_SEND' ? 'Manual Send Ponsel' : 'Auto Send Ponsel';
          onScanSuccessRef.current(
            msg.sku,
            `${modeLabel} (${msg.deviceName})`,
            {
              deltaQty: qtyToAdd,
              bypassDesktopCooldown: true,
              fromRemotePhone: true,
              remoteItemMeta: {
                itemName: msg.itemName,
                unitPrice: msg.unitPrice,
                unitCost: msg.unitCost,
                unit: msg.unit,
              },
            }
          );
          setLastRemoteEventBanner(
            `📱 ${modeLabel} dari ${msg.deviceName}: [${msg.sku}]${msg.itemName ? ` ${msg.itemName}` : ''} (+${qtyToAdd} Pcs) otomatis masuk ke Keranjang Web Desktop!`
          );
          return;
        }
        if (msg.type === 'ADJUST_DELTA' && msg.sku && typeof msg.deltaQty === 'number') {
          const matched = findUniqueMatchingProductByBarcode(
            msg.sku,
            latestAtkItemsRef.current,
            inventory
          );
          if (matched) {
            latestQuickAddRef.current(matched, msg.deltaQty);
            setLastRemoteEventBanner(
              `📱 Koreksi Qty dari ${msg.deviceName}: [${matched.sku}] (${
                msg.deltaQty > 0 ? `+${msg.deltaQty}` : msg.deltaQty
              } Pcs).`
            );
          }
          return;
        }
        if (msg.type === 'REMOVE_SKU' && msg.sku) {
          const clean = msg.sku.toUpperCase();
          const matchedProd = findUniqueMatchingProductByBarcode(
            msg.sku,
            latestAtkItemsRef.current,
            inventory
          );
          const matchedCart = latestCartItemsRef.current.find(
            (c) =>
              (matchedProd &&
                (c.materialId === matchedProd.id ||
                  c.jobTitle.toUpperCase() === matchedProd.name.toUpperCase())) ||
              (c.finishingDesc || '').toUpperCase().includes(clean) ||
              c.jobTitle.toUpperCase().includes(clean)
          );
          if (matchedCart && latestRemoveCartByIdRef.current) {
            latestRemoveCartByIdRef.current(matchedCart.id);
            setLastRemoteEventBanner(
              `🗑️ Item [${msg.sku}] dihapus dari Keranjang melalui ${msg.deviceName}.`
            );
          }
        }
      }
    );
    return () => unsubscribe();
  }, [desktopSessionCode]);

  // Handler Manual Send Data Scan ke Keranjang Web Desktop & Tarik Data Scan Ponsel
  const handleChangeRemotePhoneSendMode = (mode: RemotePhoneSendMode) => {
    setRemotePhoneSendMode(mode);
    saveRemotePhoneSendMode(mode);
    setLastRemoteEventBanner(
      mode === 'AUTO_SEND'
        ? '⚡ Mode Auto Send Data Scan ke Desktop AKTIF: Setiap scan barcode di Kamera Ponsel Lain akan otomatis dikirim & langsung masuk Keranjang Web Desktop.'
        : '📤 Mode Manual Send Data Scan ke Desktop AKTIF: Hasil scan barcode ditampung di ponsel / input manual dan dikirim ke Keranjang Web Desktop saat tombol Manual Send ditekan.'
    );
  };

  /**
   * Kolom Input Scan Barcode Instan (< 0.1 detik):
   * 1. Tanpa onChange/debounce real-time agar browser tidak lag saat HP mengirim rentetan angka barcode.
   * 2. Mendengarkan event keydown 'Enter' (Carriage Return) dengan e.preventDefault().
   * 3. Begitu produk ditemukan & masuk keranjang, langsung kosongkan kolom (input.value = '') dan beri fokus otomatis (input.focus()).
   */
  const handleInstantBarcodeInputEnter = (
    inputEl: HTMLInputElement | null,
    sourceLabel = 'Input Scan Barcode Instan'
  ) => {
    const rawVal = (inputEl?.value || '').trim();
    if (!rawVal) {
      if (atkSearchQuery) setAtkSearchQuery('');
      if (inputEl) inputEl.focus();
      return;
    }

    const currentItems = latestAtkItemsRef.current;
    const upper = rawVal.toUpperCase();

    // 1. Cari kecocokan SKU/Barcode Space-Bar spesifik atau Nama Produk secara instan
    let matched = findUniqueMatchingProductByBarcode(
      rawVal,
      currentItems,
      inventory
    );

    // Jika tidak cocok SKU persis, cek apakah kata kunci hanya menghasilkan 1 produk ATK
    if (!matched) {
      const partialMatches = currentItems.filter(
        (i) =>
          i.sku.toUpperCase().includes(upper) ||
          i.name.toUpperCase().includes(upper)
      );
      if (partialMatches.length === 1) {
        matched = partialMatches[0];
      } else if (partialMatches.length > 1) {
        // Jika banyak produk cocok dengan nama yang diketik, tampilkan hasil filter tanpa lag
        setAtkSearchQuery(rawVal);
        if (inputEl) inputEl.focus();
        return;
      }
    }

    if (matched) {
      // Langsung tambahkan ke keranjang secara instan tanpa delay/cooldown
      onScanSuccessRef.current(matched.sku, sourceLabel, {
        deltaQty: 1,
        bypassDesktopCooldown: true,
      });
      if (atkSearchQuery) setAtkSearchQuery('');
      // Kosongkan kembali isi kolom input dan berikan fokus otomatis agar siap menerima scan berikutnya
      if (inputEl) {
        inputEl.value = '';
        inputEl.focus();
      }
    } else {
      if (latestSoundEnabledRef.current) {
        playScannerBeepSound('error');
      }
      setLastRemoteEventBanner(
        `⚠️ Kode Barcode/SKU "${rawVal}" tidak ditemukan di Master Stok ATK.`
      );
      // Tetap kosongkan dan fokuskan kembali agar siap untuk scan barang berikutnya
      if (inputEl) {
        inputEl.value = '';
        inputEl.focus();
      }
    }
  };

  const handleManualSendDataScanToDesktop = (skuToUse?: string, qtyToUse?: number) => {
    unlockScannerAudio();
    const domSku = manualDesktopInputRef.current?.value.trim() || '';
    const domQty = parseInt(manualDesktopQtyRef.current?.value || '1', 10);
    const rawCandidate = (
      skuToUse ||
      domSku ||
      atkItems[0]?.sku ||
      'ATK-HVS4-107'
    )
      .trim()
      .toUpperCase();
    const matchedByCandidate = findUniqueMatchingProductByBarcode(
      rawCandidate,
      atkItems,
      inventory
    );
    const targetSku = matchedByCandidate ? matchedByCandidate.sku : rawCandidate;
    const targetQty = Math.max(1, qtyToUse ?? (Number.isNaN(domQty) ? 1 : domQty));

    // 1. Kosongkan langsung isi kolom input & berikan fokus otomatis (input.focus()) agar siap menerima scan berikutnya
    if (manualDesktopInputRef.current) {
      manualDesktopInputRef.current.value = '';
      manualDesktopInputRef.current.focus();
    }
    if (manualDesktopQtyRef.current) {
      manualDesktopQtyRef.current.value = '1';
    }

    // 2. Masukkan langsung secara instan (0ms delay) ke Keranjang Web Desktop
    onScanSuccessRef.current(targetSku, 'Manual Send ke Desktop', {
      deltaQty: targetQty,
      bypassDesktopCooldown: true,
    });
    setLastRemoteEventBanner(
      `📤 Scan Instan Berhasil: Produk [${targetSku}] (+${targetQty} Pcs) telah dimasukkan ke Keranjang Belanja Web Desktop.`
    );

    // 3. Broadcast di latar belakang tanpa menahan UI
    void sendRemoteCameraMessage({
      sessionCode: desktopSessionCode,
      type: 'SCAN',
      sku: targetSku,
      deltaQty: targetQty,
      sendMode: 'MANUAL_SEND',
      deviceName: connectedRemotePhoneName || 'Manual Send Kasir',
    });
  };

  const handlePullPhoneScansToDesktopNow = async () => {
    setIsPullingPhoneScans(true);
    try {
      const messages = await pullRecentRemoteCameraMessages(desktopSessionCode);
      let scanCount = 0;
      for (const msg of messages) {
        if (msg.type === 'SCAN' && msg.sku) {
          const qty = Math.max(1, msg.deltaQty || 1);
          onScanSuccessRef.current(
            msg.sku,
            `Tarik Manual Ponsel (${msg.deviceName})`,
            {
              deltaQty: qty,
              bypassDesktopCooldown: true,
              fromRemotePhone: true,
              remoteItemMeta: {
                itemName: msg.itemName,
                unitPrice: msg.unitPrice,
                unitCost: msg.unitCost,
                unit: msg.unit,
              },
            }
          );
          scanCount += 1;
        }
      }
      setLastRemoteEventBanner(
        scanCount > 0
          ? `✓ Berhasil menarik & memasukkan ${scanCount} data scan terbaru dari Kamera Ponsel ke Keranjang Web Desktop!`
          : '✓ Keranjang Web Desktop sudah sinkron dengan data scan terbaru dari Kamera Ponsel.'
      );
    } finally {
      setIsPullingPhoneScans(false);
    }
  };

  // Global Auto-Detect External Barcode Camera / 2D USB-Wireless Scanner on Web Desktop (Tanpa Fokus Kursor)
  useEffect(() => {
    if (!globalHidBarcodeAutoDetect) return;
    let buffer = '';
    let lastKeyTime = 0;

    const handleGlobalScannerKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const now = Date.now();
      if (e.key === 'Enter' || e.keyCode === 13) {
        if (buffer.trim().length >= 3 && now - lastKeyTime < 350) {
          e.preventDefault();
          const codeToProcess = buffer.trim();
          buffer = '';
          onScanSuccessRef.current(codeToProcess, 'Kamera Barcode Eksternal', {
            deltaQty: 1,
            bypassDesktopCooldown: true,
          });
          // Berikan fokus otomatis ke kolom input barcode utama agar siap menerima scan berikutnya
          if (searchInputRef.current) {
            searchInputRef.current.value = '';
            searchInputRef.current.focus();
          }
        } else {
          buffer = '';
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (now - lastKeyTime > 300) {
          buffer = e.key;
        } else {
          buffer += e.key;
        }
        lastKeyTime = now;
      }
    };

    window.addEventListener('keydown', handleGlobalScannerKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalScannerKeyDown);
  }, [globalHidBarcodeAutoDetect]);

  // Handler Sambungkan Kamera Eksternal / Ponsel / Barcode Scanner via Bluetooth (BLE / SPP Tanpa Driver)
  const handleConnectBluetoothScannerDevice = async (
    mode: 'BLE' | 'SPP',
    forceNewPairing = false
  ) => {
    unlockScannerAudio();
    setIsConnectingBtScanner(true);
    try {
      if (mode === 'SPP') {
        const info = await connectBluetoothSerialSppScanner({
          forceNewPort: forceNewPairing,
          onBarcodeScanned: (code, devName) => {
            onScanSuccessRef.current(code, `Bluetooth SPP: ${devName}`);
          },
          onStatusChange: (st) => {
            setIsBtScannerConnected(st.connected);
            setLastRemoteEventBanner(st.message);
          },
        });
        setSavedBtScanner(info);
        setIsBtScannerConnected(true);
      } else {
        const info = await connectBluetoothScannerOrCamera({
          forceNewPairing,
          onBarcodeScanned: (code, devName) => {
            onScanSuccessRef.current(code, `Bluetooth: ${devName}`);
          },
          onStatusChange: (st) => {
            setIsBtScannerConnected(st.connected);
            setLastRemoteEventBanner(st.message);
          },
        });
        setSavedBtScanner(info);
        setIsBtScannerConnected(true);
        // Also refresh video cameras in case a Bluetooth/Continuity camera video stream became active
        refreshAndAutoDetectCameras(true);
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Koneksi Bluetooth dibatalkan atau perangkat belum siap.';
      setLastRemoteEventBanner(
        `ℹ️ Info Sambungan Bluetooth (${msg}) — Mode Auto-Detect Bluetooth HID tetap aktif otomatis tanpa driver.`
      );
    } finally {
      setIsConnectingBtScanner(false);
    }
  };

  // Auto-Reconnect / Auto-Detect Saved Bluetooth Scanner/Camera silently on mount
  useEffect(() => {
    const saved = getSavedBluetoothScannerDevice();
    if (!saved) return;
    if (saved.protocol === 'BLE_GATT' && isWebBluetoothScannerSupported()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bt = (navigator as any).bluetooth;
      if (typeof bt?.getDevices === 'function') {
        connectBluetoothScannerOrCamera({
          forceNewPairing: false,
          onBarcodeScanned: (code, devName) => {
            onScanSuccessRef.current(code, `Bluetooth: ${devName}`);
          },
          onStatusChange: (st) => {
            setIsBtScannerConnected(st.connected);
            if (st.connected) {
              setLastRemoteEventBanner(st.message);
            }
          },
        })
          .then((info) => {
            setSavedBtScanner(info);
          })
          .catch(() => {
            // Silent fallback if device is currently off
          });
      }
    }
    return () => {
      disconnectActiveBluetoothScanner();
    };
  }, []);

  // Start / Stop html5-qrcode camera scanner + parallel full-frame & 2x macro zoom decoder
  useEffect(() => {
    let isMounted = true;
    let frameDetectorTimer: number | null = null;
    const regionId = 'qr-reader';
    const macroRegionId = 'qr-macro-helper';
    let macroScannerInstance: Html5Qrcode | null = null;

    const stopScanner = async () => {
      if (frameDetectorTimer !== null) {
        window.clearInterval(frameDetectorTimer);
        frameDetectorTimer = null;
      }
      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning) {
            await html5QrCodeRef.current.stop();
          }
          html5QrCodeRef.current.clear();
        } catch {
          // Ignore stop errors
        }
        html5QrCodeRef.current = null;
      }
      if (macroScannerInstance) {
        try {
          macroScannerInstance.clear();
        } catch {
          // Ignore clear errors
        }
        macroScannerInstance = null;
      }
      if (isMounted) {
        setIsCameraRunning(false);
      }
    };

    if (!isCameraScannerOpen) {
      stopScanner();
      return;
    }

    const startScanner = async () => {
      setCameraError(null);
      await stopScanner();

      // Wait briefly for DOM element #qr-reader to mount inside the modal
      await new Promise((r) => setTimeout(r, 150));
      if (!isMounted || !document.getElementById(regionId)) return;

      try {
        // Discover available cameras for quick switching & auto-detect external/phone cameras
        try {
          const cams = await Html5Qrcode.getCameras();
          if (isMounted && Array.isArray(cams) && cams.length > 0) {
            const mapped = cams.map((c, idx) => ({
              id: c.id,
              label: c.label || `Kamera ${idx + 1}`,
              isExternalOrPhone: classifyIsExternalOrPhoneCamera(c.label || '', idx),
            }));
            setCameraDevices(mapped);
          }
        } catch {
          // Ignore camera list error, fallback to facingMode
        }

        const formatsToSupport = [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.QR_CODE,
        ];

        // Instantiate Html5Qrcode with clean 1D/2D formats & hardware BarcodeDetector enabled
        const Html5QrcodeClass =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).Html5Qrcode || Html5Qrcode;
        const scanner: Html5Qrcode = new Html5QrcodeClass(regionId, {
          formatsToSupport,
          useBarCodeDetectorIfSupported: true,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
          verbose: false,
        });
        html5QrCodeRef.current = scanner;

        const cameraSource = selectedCameraId
          ? { deviceId: { exact: selectedCameraId } }
          : { facingMode };

        // Gunakan resolusi sensor maksimal (100% Megapiksel: 4K UHD / Full HD) agar barcode kecil 15x5mm tajam & bebas blur
        const highResVideoConstraints: MediaTrackConstraints = {
          ...(selectedCameraId
            ? { deviceId: { exact: selectedCameraId } }
            : { facingMode }),
          width: { ideal: opticsConfigRef.current.fullMegapixelEnabled ? 3840 : 1280 },
          height: { ideal: opticsConfigRef.current.fullMegapixelEnabled ? 2160 : 720 },
          frameRate: { ideal: 30 },
        };

        const qrScanConfig = {
          fps: 24,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const width = Math.max(200, Math.floor(viewfinderWidth * 0.84));
            const height = Math.min(140, Math.max(85, Math.floor(viewfinderHeight * 0.36)));
            return { width, height };
          },
          videoConstraints: highResVideoConstraints,
          disableFlip: false,
        };

        // Start continuous scanning with focused horizontal laser qrbox so adjacent barcodes don't collide
        try {
          await scanner.start(
            cameraSource,
            qrScanConfig,
            (decodedText: string) => {
              onScanSuccessRef.current(decodedText, 'Kamera Scanner (100% MP)', {
                fromCameraStream: true,
              });
            },
            () => {
              // Frame scan error ignored during continuous scanning
            }
          );
        } catch {
          // Fallback jika driver webcam tertentu menolak videoConstraints kustom
          await scanner.start(
            cameraSource,
            {
              fps: 20,
              qrbox: qrScanConfig.qrbox,
              disableFlip: false,
            },
            (decodedText: string) => {
              onScanSuccessRef.current(decodedText, 'Kamera Scanner', {
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

        // Inisialisasi helper decoder untuk stiker barcode kecil 15x5mm (Anti-Noise Macro ZXing fallback)
        if (document.getElementById(macroRegionId)) {
          try {
            macroScannerInstance = new Html5QrcodeClass(macroRegionId, {
              formatsToSupport,
              useBarCodeDetectorIfSupported: true,
              verbose: false,
            });
          } catch {
            macroScannerInstance = null;
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

        let isDetectingFrame = false;
        let frameCounter = 0;
        const cropCanvas = document.createElement('canvas');
        const denoisedMacroCanvas = document.createElement('canvas');

        frameDetectorTimer = window.setInterval(async () => {
          if (isDetectingFrame || !isMounted) return;
          const container = document.getElementById(regionId);
          const v = container?.querySelector('video') as HTMLVideoElement | null;
          if (!v || v.readyState < 2 || v.videoWidth === 0 || v.videoHeight === 0) {
            return;
          }

          isDetectingFrame = true;
          frameCounter += 1;
          try {
            if (frameCounter % 12 === 1 && isMounted) {
              setOpticsCapabilities(inspectCameraTrackCapabilities(regionId));
            }
            const decodedBest = await decodeBarcodeFromVideoMultiPass({
              videoEl: v,
              config: opticsConfigRef.current,
              rawCropCanvas: cropCanvas,
              denoisedMacroCanvas,
              nativeDetector,
              fallbackMacroScanner: macroScannerInstance,
              runFallbackZxingPass: frameCounter % 2 === 0,
            });
            if (decodedBest) {
              onScanSuccessRef.current(
                decodedBest,
                opticsConfigRef.current.denoiseMacroEnabled
                  ? 'Kamera 100% MP Macro (15×5mm)'
                  : 'Kamera Scanner',
                {
                  fromCameraStream: true,
                }
              );
            }
          } catch {
            // Ignore frame detection error
          } finally {
            isDetectingFrame = false;
          }
        }, 150);
      } catch (err) {
        if (isMounted) {
          setIsCameraRunning(false);
          setCameraError(
            err instanceof Error
              ? `Kamera belum dapat diakses (${err.message}). Pastikan izin kamera aktif atau gunakan tombol Uji Scan di bawah.`
              : 'Gagal mengakses kamera perangkat.'
          );
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, [isCameraScannerOpen, facingMode, selectedCameraId]);

  // Execute Dual-Mode Direct Print (Bluetooth / WebUSB) with Smart Fallback
  const handleDirectPrintOrder = async (
    targetOrder: PrintOrder,
    overrideMode?: DirectPrinterMode,
    forceNewPairing = false
  ) => {
    const activeMode = overrideMode || printMode;
    setIsPrintingDirect(true);
    setPrinterStatusBanner(null);

    try {
      if (activeMode === 'BLUETOOTH') {
        const result = await printViaWebBluetooth(targetOrder, storeSettings, {
          forceNewPairing,
          chunkByteSize: btChunkSize,
          paperColumns: thermalCols,
        });
        setSavedBtPrinter(result.printerInfo);
        setPrinterStatusBanner({
          type: 'SUCCESS',
          text: result.autoReconnected
            ? `Struk ATK #${targetOrder.invoiceNumber} berhasil dicetak via Auto-Reconnect Bluetooth "${result.printerInfo.deviceName}" (Chunk ${result.printerInfo.chunkByteSize} byte).`
            : `Printer Bluetooth "${result.printerInfo.deviceName}" berhasil dihubungkan, disimpan ke Auto-Remember, dan mencetak struk #${targetOrder.invoiceNumber}.`,
        });
        return;
      }

      if (activeMode === 'USB') {
        const result = await printViaWebUsb(targetOrder, storeSettings, {
          forceNewPairing,
          paperColumns: thermalCols,
        });
        setSavedUsbPrinter(result.printerInfo);
        setPrinterStatusBanner({
          type: 'SUCCESS',
          text: result.autoReconnected
            ? `Struk ATK #${targetOrder.invoiceNumber} berhasil dicetak instan via Auto-Reconnect Kabel WebUSB "${result.printerInfo.productName}".`
            : `Printer USB "${result.printerInfo.productName}" berhasil terhubung via WebUSB dan mencetak struk #${targetOrder.invoiceNumber}.`,
        });
        return;
      }

      if (activeMode === 'FALLBACK_PDF') {
        downloadAtkReceiptPdfFallback(
          targetOrder,
          storeSettings,
          thermalCols === 32 ? 58 : 80
        );
        setPrinterStatusBanner({
          type: 'SUCCESS',
          text: `Dokumen PDF Struk Thermal #${targetOrder.invoiceNumber} berhasil diunduh untuk dicetak via driver OS / aplikasi print.`,
        });
        return;
      }

      // Default FALLBACK_BROWSER -> window.print() via PrintModal
      onOpenPrintModal(
        targetOrder,
        'invoice',
        paperSize.startsWith('THERMAL') ? paperSize : 'THERMAL_80'
      );
    } catch (err) {
      // SMART FALLBACK: Automatically fall back gracefully to browser print / PDF
      const reason =
        err instanceof Error ? err.message : 'Koneksi direct printer gagal';
      setPrinterStatusBanner({
        type: 'WARNING',
        text: `Smart Fallback Aktif (${reason}) — Mengalihkan cetakan struk #${targetOrder.invoiceNumber} ke dialog cetak bawaan browser (window.print) & opsi PDF/PNG.`,
      });
      onOpenPrintModal(
        targetOrder,
        'invoice',
        paperSize.startsWith('THERMAL') ? paperSize : 'THERMAL_80'
      );
    } finally {
      setIsPrintingDirect(false);
    }
  };

  const handleCheckoutAndDirectPrintClick = async () => {
    const createdOrder = await onInstantCheckoutAndPrintAtk(printMode);
    if (createdOrder) {
      await handleDirectPrintOrder(createdOrder, printMode, false);
    }
  };

  return (
    <div className="bg-emerald-50/70 border-2 border-emerald-300 rounded-xl p-3.5 sm:p-5 space-y-4 text-xs">
      {/* =====================================================================
          HEADER & TOOLBAR UTAMA KASIR PENJUALAN ATK (RESPONSIVE HP/TABLET/PC)
         ===================================================================== */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-emerald-200 pb-3.5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 bg-emerald-800 text-white font-mono font-bold text-[10px] rounded uppercase">
              POS Ritel ATK
            </span>
            <h4 className="font-bold text-slate-900 text-sm sm:text-base">
              Kasir Cepat ATK & Perlengkapan (Scan Kamera · Direct Print BT/USB · Label Barcode)
            </h4>
          </div>
          <p className="text-[11px] text-slate-600">
            Klik kartu produk atau tombol <strong>Scan Kamera</strong> untuk otomatis menambahkan 1 pcs ke Keranjang Belanja ATK. Shortcut Desktop:{' '}
            <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded font-mono text-[10px]">
              F2 / Alt+S
            </kbd>{' '}
            Cari Cepat ·{' '}
            <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded font-mono text-[10px]">
              Alt+C
            </kbd>{' '}
            Scan Kamera ·{' '}
            <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded font-mono text-[10px]">
              Alt+B
            </kbd>{' '}
            Stiker Barcode.
          </p>
        </div>

        {/* Tombol Aksi Utama (Touch-Friendly min 44x44px) */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Tombol Khusus SCAN KAMERA (html5-qrcode) */}
          <button
            type="button"
            onClick={() => {
              unlockScannerAudio();
              setIsCameraScannerOpen(!isCameraScannerOpen);
            }}
            className={`min-h-[44px] min-w-[44px] px-4 py-2.5 rounded-lg font-bold text-xs flex items-center gap-2 transition-all shadow-xs ${
              isCameraScannerOpen
                ? 'bg-rose-600 hover:bg-rose-700 text-white ring-2 ring-rose-300'
                : 'bg-indigo-700 hover:bg-indigo-800 text-white'
            }`}
          >
            {isCameraScannerOpen ? (
              <>
                <CameraOff className="w-4 h-4 shrink-0" />
                <span>Tutup Scan Kamera</span>
              </>
            ) : (
              <>
                <Camera className="w-4 h-4 shrink-0" />
                <span>Scan Kamera (Auto +1 Cart)</span>
              </>
            )}
          </button>

          {/* 2. Tombol Khusus Mode Web Desktop: Sambungkan Kamera Ponsel / Kamera Eksternal / Kamera Barcode (Via QR / USB / Bluetooth Auto-Detect Tanpa Driver) */}
          <button
            type="button"
            onClick={() => setShowExternalCameraHub((prev) => !prev)}
            className={`min-h-[44px] min-w-[44px] px-3.5 py-2.5 rounded-lg border font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs ${
              showExternalCameraHub || connectedRemotePhoneName || isBtScannerConnected
                ? 'bg-indigo-950 text-white border-indigo-400 ring-2 ring-indigo-400/30'
                : 'bg-white text-indigo-950 border-indigo-300 hover:bg-indigo-50'
            }`}
            title="Sambungkan Kamera Ponsel Lain / Kamera Eksternal / Kamera Barcode via Bluetooth, USB, atau QR dengan Auto-Detect Tanpa Driver"
          >
            <Smartphone className="w-4 h-4 text-emerald-500 shrink-0" />
            <Bluetooth className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>
              {connectedRemotePhoneName
                ? `HP: ${connectedRemotePhoneName.slice(0, 12)}`
                : savedBtScanner
                ? `BT Cam/Scan: ${savedBtScanner.deviceName.slice(0, 12)}`
                : 'Sambungkan Kamera Eksternal / BT / HP'}
            </span>
          </button>

          {/* Tombol Kasir ATK Full Screen (Layar Penuh Khusus Desktop & Tablet) */}
          {onOpenFullscreenPos && (
            <button
              type="button"
              onClick={onOpenFullscreenPos}
              className="min-h-[44px] min-w-[44px] px-4 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
              title="Tampilkan Jendela Kasir ATK Layar Penuh / Full Screen (Khusus Tablet & Desktop)"
            >
              <Maximize2 className="w-4 h-4 text-emerald-200 shrink-0" />
              <span>Layar Penuh (Full Screen)</span>
            </button>
          )}

          {/* 3. Tombol Modul Stiker Label Barcode ATK (20x10mm & 15x5mm) */}
          <button
            type="button"
            onClick={() => {
              setLabelModalTargetItem(null);
              setLabelModalOpen(true);
            }}
            className="min-h-[44px] min-w-[44px] px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs"
          >
            <Barcode className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Stiker Barcode (20×10 & 15×5 mm)</span>
          </button>

          {/* 3. Tombol Pengaturan Printer Direct Bluetooth / WebUSB */}
          <button
            type="button"
            onClick={() => setShowPrinterPanel(!showPrinterPanel)}
            className={`min-h-[44px] min-w-[44px] px-3.5 py-2.5 rounded-lg border font-bold text-xs flex items-center gap-1.5 transition-colors ${
              showPrinterPanel || savedBtPrinter || savedUsbPrinter
                ? 'bg-white text-emerald-900 border-emerald-500'
                : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Bluetooth className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <Usb className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>
              {savedBtPrinter
                ? `BT: ${savedBtPrinter.deviceName.slice(0, 12)}`
                : savedUsbPrinter
                ? `USB: ${savedUsbPrinter.productName.slice(0, 12)}`
                : 'Set Printer BT / USB'}
            </span>
          </button>

          {/* 4. Tombol Input Produk ATK Baru (Auto SKU + Barcode) */}
          {onCreateInventoryItem && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (showAtkStockForm) {
                    setShowAtkStockForm(false);
                  } else {
                    openNewAtkProductForm();
                  }
                }}
                className="min-h-[44px] min-w-[44px] px-3.5 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>{showAtkStockForm ? 'Tutup Form ATK' : '+ Produk ATK (Auto SKU)'}</span>
              </button>

              {atkItems.length < 4 && (
                <button
                  type="button"
                  disabled={isSyncingPresets}
                  onClick={onSyncInitialAtkPresets}
                  className="min-h-[44px] min-w-[44px] px-3.5 py-2.5 rounded-lg bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-400 font-semibold text-xs"
                >
                  {isSyncingPresets ? 'Memuat...' : '+ Muat Stok Awal ATK'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* =====================================================================
          MENU & PENGATURAN KHUSUS MODE WEB DESKTOP:
          SAMBUNGKAN KAMERA PONSEL / KAMERA EKSTERNAL / KAMERA BARCODE (AUTO-DETECT TANPA DRIVER)
         ===================================================================== */}
      {lastRemoteEventBanner && (
        <div className="p-3 rounded-xl bg-indigo-950 text-white border border-indigo-400 flex items-center justify-between gap-2 text-xs shadow-sm">
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
            <span className="font-semibold">{lastRemoteEventBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setLastRemoteEventBanner(null)}
            className="text-slate-300 hover:text-white font-bold px-1.5"
          >
            ✕
          </button>
        </div>
      )}

      {showExternalCameraHub && (
        <div className="bg-white border-2 border-indigo-400 rounded-xl p-4 space-y-4 shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 bg-indigo-700 text-white font-mono font-bold text-[10px] rounded uppercase">
                  Mode Web Desktop · Plug & Play Tanpa Driver
                </span>
                <h5 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-indigo-700" />
                  <span>
                    Pengaturan Sambungkan Kamera Ponsel Lain / Kamera Eksternal / Kamera Barcode
                  </span>
                </h5>
              </div>
              <p className="text-[11px] text-slate-600">
                Fleksibel saat ponsel utama toko sedang dipakai untuk keperluan lain: gunakan <strong>kamera ponsel cadangan apa saja via QR tanpa install aplikasi/driver</strong>, <strong>kamera eksternal USB</strong>, atau <strong>kamera barcode meja</strong> dengan deteksi otomatis.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowExternalCameraHub(false)}
              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs self-end sm:self-auto"
            >
              Tutup Panel ✕
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Kolom 1: Sambungkan Kamera Eksternal / Ponsel / Barcode Scanner via BLUETOOTH (Auto-Detect Tanpa Driver) */}
            <div className="bg-sky-50/80 border-2 border-sky-400 rounded-xl p-3.5 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Bluetooth className="w-4 h-4 text-sky-700 shrink-0" />
                    1. Sambungan via Bluetooth (Auto-Detect)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-900 font-mono font-bold text-[10px]">
                    Tanpa Driver
                  </span>
                </div>

                <p className="text-[11px] text-slate-600">
                  Sambungkan <strong>Kamera Eksternal / Ponsel / Webcam / Barcode Scanner Bluetooth</strong> langsung via <em>Web Bluetooth BLE</em>, <em>Bluetooth SPP Serial</em>, atau <em>Bluetooth HID Auto-Detect</em>:
                </p>

                {savedBtScanner ? (
                  <div className="p-2.5 bg-white border border-sky-300 rounded-lg space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-800 text-[11px]">
                        ✓ Auto-Remember: {savedBtScanner.deviceName}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded font-mono text-[9.5px] font-bold ${
                          isBtScannerConnected
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {isBtScannerConnected ? 'ONLINE' : 'SIAGA AUTO'}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 flex items-center justify-between">
                      <span>Mode: {savedBtScanner.protocol}</span>
                      <button
                        type="button"
                        onClick={() => {
                          disconnectActiveBluetoothScanner();
                          clearSavedBluetoothScannerDevice();
                          setSavedBtScanner(null);
                          setIsBtScannerConnected(false);
                        }}
                        className="text-rose-600 hover:underline font-sans font-bold"
                      >
                        Lupakan
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-2.5 bg-white border border-sky-200 rounded-lg text-[11px] text-slate-600">
                    Belum ada perangkat kamera/scanner Bluetooth spesifik yang disimpan. Klik tombol di bawah untuk <strong>Pair & Auto-Detect Tanpa Driver</strong>.
                  </div>
                )}

                <div className="text-[10px] font-mono text-slate-600 bg-white/80 px-2.5 py-1.5 rounded border border-sky-200 flex items-center justify-between">
                  <span>Bluetooth HID Stream:</span>
                  <span className="font-bold text-emerald-700">✓ Auto-Detect Aktif</span>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <button
                  type="button"
                  disabled={isConnectingBtScanner}
                  onClick={() => handleConnectBluetoothScannerDevice('BLE', true)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <Bluetooth className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isConnectingBtScanner
                      ? 'Mendeteksi Bluetooth...'
                      : 'Cari & Sambungkan Bluetooth (BLE)'}
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-1.5">
                  {savedBtScanner && (
                    <button
                      type="button"
                      disabled={isConnectingBtScanner}
                      onClick={() => handleConnectBluetoothScannerDevice('BLE', false)}
                      className="min-h-[36px] px-2 py-1.5 rounded-lg bg-white hover:bg-sky-50 border border-sky-300 text-sky-900 font-bold text-[10px] flex items-center justify-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Reconnect BT</span>
                    </button>
                  )}
                  {isWebSerialBluetoothSupported() && (
                    <button
                      type="button"
                      disabled={isConnectingBtScanner}
                      onClick={() => handleConnectBluetoothScannerDevice('SPP', true)}
                      className={`min-h-[36px] px-2 py-1.5 rounded-lg bg-white hover:bg-sky-50 border border-slate-300 text-slate-800 font-semibold text-[10px] flex items-center justify-center gap-1 ${
                        savedBtScanner ? '' : 'col-span-2'
                      }`}
                    >
                      <Bluetooth className="w-3 h-3 text-indigo-600" />
                      <span>Mode Bluetooth SPP Serial</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Kolom 2: Sambungkan Kamera Ponsel Lain via QR / Kode Sesi (Wireless Tanpa Driver) + Auto Send & Manual Send ke Desktop */}
            <div className="bg-indigo-50/70 border-2 border-indigo-400 rounded-xl p-3.5 space-y-3 flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-indigo-700 shrink-0" />
                    2. Kamera Ponsel Lain (QR Auto-Connect)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-mono font-bold text-[10px]">
                    Auto & Manual Send
                  </span>
                </div>

                <p className="text-[11px] text-slate-600">
                  Scan QR ini dari <strong>ponsel mana saja</strong>. Mendukung <strong>Auto Send Data Scan ke Desktop</strong> (otomatis masuk keranjang saat scan) & <strong>Manual Send Data Scan ke Desktop</strong>:
                </p>

                {/* Pilihan Mode Pengiriman Data Scan ke Desktop: AUTO SEND vs MANUAL SEND */}
                <div className="bg-white border border-indigo-200 rounded-lg p-2 space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-700 uppercase flex items-center justify-between">
                    <span>Mode Kirim Data Scan ke Desktop:</span>
                    <span className="font-mono text-indigo-700">
                      {remotePhoneSendMode === 'AUTO_SEND' ? '⚡ AUTO SEND' : '📤 MANUAL SEND'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleChangeRemotePhoneSendMode('AUTO_SEND')}
                      className={`min-h-[36px] px-2 py-1.5 rounded-md font-bold text-[10.5px] flex items-center justify-center gap-1 border transition-all ${
                        remotePhoneSendMode === 'AUTO_SEND'
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-2xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                      title="Saat kamera ponsel memindai barcode, otomatis kirim & langsung masuk Keranjang Web Desktop"
                    >
                      <Zap className="w-3.5 h-3.5 shrink-0" />
                      <span>Auto Send ke Desktop</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChangeRemotePhoneSendMode('MANUAL_SEND')}
                      className={`min-h-[36px] px-2 py-1.5 rounded-md font-bold text-[10.5px] flex items-center justify-center gap-1 border transition-all ${
                        remotePhoneSendMode === 'MANUAL_SEND'
                          ? 'bg-indigo-700 text-white border-indigo-500 shadow-2xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                      title="Tampung hasil scan di ponsel dan kirim manual ke Keranjang Web Desktop saat ditekan"
                    >
                      <Send className="w-3.5 h-3.5 shrink-0" />
                      <span>Manual Send ke Desktop</span>
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-indigo-200 rounded-xl p-2.5 flex flex-col sm:flex-row items-center gap-2.5 overflow-hidden">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=6&data=${encodeURIComponent(
                      buildRemotePhoneScannerUrl(desktopSessionCode, remotePhoneSendMode)
                    )}`}
                    alt="QR Pairing Kamera Ponsel"
                    className="w-24 h-24 rounded-lg border border-slate-200 object-contain bg-white shrink-0"
                  />
                  <div className="space-y-1 text-center sm:text-left min-w-0 flex-1 w-full overflow-hidden">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase leading-tight break-words">
                      Kode Sesi Kasir Desktop:
                    </div>
                    <div className="font-mono font-extrabold text-base tracking-widest text-indigo-950 bg-indigo-100/80 px-2.5 py-0.5 rounded-lg border border-indigo-300 inline-block max-w-full">
                      {desktopSessionCode}
                    </div>
                    <div
                      className={`text-[10.5px] font-bold px-2 py-1 rounded-md border flex items-start justify-center sm:justify-start gap-1.5 min-w-0 w-full ${
                        connectedRemotePhoneName
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-400'
                          : 'bg-amber-50 text-amber-900 border-amber-300'
                      }`}
                    >
                      <Wifi
                        className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                          connectedRemotePhoneName ? 'text-emerald-600 animate-pulse' : 'text-amber-600'
                        }`}
                      />
                      <span className="break-words leading-snug min-w-0">
                        {connectedRemotePhoneName
                          ? `✓ TERHUBUNG: ${connectedRemotePhoneName}`
                          : 'Menunggu Scan QR dari Ponsel...'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Form & Tombol Manual Send Data Scan ke Keranjang Web Desktop */}
                <div className="bg-white border border-indigo-200 rounded-lg p-2 space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-700 flex items-center justify-between">
                    <span>Manual Send Data Scan ke Keranjang Desktop:</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      ref={manualDesktopInputRef}
                      type="text"
                      defaultValue=""
                      autoComplete="off"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.keyCode === 13) {
                          e.preventDefault();
                          e.stopPropagation();
                          handleManualSendDataScanToDesktop();
                        }
                      }}
                      placeholder={atkItems[0]?.sku ? `Scan/Ketik SKU (${atkItems[0].sku}) + Enter` : 'Scan Barcode + Enter...'}
                      className="flex-1 min-w-0 min-h-[34px] px-2 py-1 rounded border border-slate-300 font-mono font-bold text-[11px] text-slate-900"
                    />
                    <input
                      ref={manualDesktopQtyRef}
                      type="number"
                      min="1"
                      defaultValue={1}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.keyCode === 13) {
                          e.preventDefault();
                          e.stopPropagation();
                          handleManualSendDataScanToDesktop();
                        }
                      }}
                      className="w-12 min-h-[34px] px-1.5 py-1 rounded border border-slate-300 font-mono font-bold text-[11px] text-center text-slate-900"
                      title="Jumlah Qty"
                    />
                    <button
                      type="button"
                      onClick={() => handleManualSendDataScanToDesktop()}
                      className="min-h-[34px] px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10.5px] flex items-center gap-1 shrink-0"
                      title="Manual Send Data Scan langsung masuk ke Keranjang Web Desktop"
                    >
                      <Send className="w-3 h-3" />
                      <span>Kirim</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const url = buildRemotePhoneScannerUrl(
                        desktopSessionCode,
                        remotePhoneSendMode
                      );
                      navigator.clipboard?.writeText(url).catch(() => {});
                      setCopiedPairingLink(true);
                      setTimeout(() => setCopiedPairingLink(false), 2500);
                    }}
                    className="min-h-[36px] px-2 py-1 rounded-lg bg-white hover:bg-slate-100 border border-indigo-300 text-slate-800 font-bold text-[10.5px] flex items-center justify-center gap-1"
                  >
                    {copiedPairingLink ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span>Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-indigo-700 shrink-0" />
                        <span>Salin Link</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isPullingPhoneScans}
                    onClick={handlePullPhoneScansToDesktopNow}
                    className="min-h-[36px] px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-400 text-emerald-900 font-bold text-[10.5px] flex items-center justify-center gap-1"
                    title="Tarik / Sinkronkan Manual Data Scan dari Ponsel ke Keranjang Web Desktop"
                  >
                    <RefreshCw
                      className={`w-3 h-3 shrink-0 ${isPullingPhoneScans ? 'animate-spin' : ''}`}
                    />
                    <span>Tarik Scan</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setDesktopSessionCode(regenerateDesktopCameraSessionCode())
                    }
                    className="min-h-[36px] px-2 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold text-[10.5px] flex items-center justify-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3 shrink-0" />
                    <span>Kode Baru</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    unlockScannerAudio();
                    setIsRemotePhoneSenderModalOpen(true);
                  }}
                  className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white font-bold text-[11px] flex items-center justify-center gap-1.5"
                >
                  <Smartphone className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Buka Kamera Ponsel ({remotePhoneSendMode === 'AUTO_SEND' ? 'Auto Send' : 'Manual Send'})
                  </span>
                </button>
              </div>
            </div>

            {/* Kolom 3: Auto-Detect Kamera Eksternal USB / Webcam Bluetooth / Kamera Ponsel Virtual (navigator.mediaDevices) */}
            <div className="bg-emerald-50/70 border border-emerald-300 rounded-xl p-3.5 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Monitor className="w-4 h-4 text-emerald-700 shrink-0" />
                    3. Webcam / Kamera USB & BT Video
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-mono font-bold text-[10px]">
                    Auto-Detect
                  </span>
                </div>

                <p className="text-[11px] text-slate-600">
                  Mendeteksi otomatis kamera eksternal USB, Continuity Camera, atau kamera ponsel (DroidCam/Iriun/Camo) begitu dihubungkan ke PC tanpa perlu refresh atau driver web:
                </p>

                <label className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-white border border-emerald-200 cursor-pointer">
                  <span className="text-[11px] font-bold text-slate-800">
                    Auto-Switch ke Kamera Eksternal Saat Terdeteksi
                  </span>
                  <input
                    type="checkbox"
                    checked={autoSwitchExternalCam}
                    onChange={(e) => setAutoSwitchExternalCam(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600"
                  />
                </label>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-700">
                    Daftar Kamera Terdeteksi ({cameraDevices.length} Perangkat):
                  </label>
                  <select
                    value={selectedCameraId}
                    onChange={(e) => {
                      setSelectedCameraId(e.target.value);
                      savePreferredExternalCameraId(e.target.value);
                    }}
                    className="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 font-medium text-xs"
                  >
                    <option value="">
                      Otomatis Default ({facingMode === 'environment' ? 'Kamera Belakang' : 'Kamera Depan'})
                    </option>
                    {cameraDevices.map((cam) => (
                      <option key={cam.id} value={cam.id}>
                        {cam.isExternalOrPhone ? '🔌 [Eksternal/Ponsel] ' : '💻 [Internal] '}
                        {cam.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => refreshAndAutoDetectCameras(true)}
                  className="min-h-[40px] px-3 py-2 rounded-lg bg-white hover:bg-emerald-100 border border-emerald-400 text-emerald-950 font-bold text-[11px] flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Deteksi Ulang</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    unlockScannerAudio();
                    setIsCameraScannerOpen(true);
                  }}
                  className="min-h-[40px] px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[11px] flex items-center justify-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Buka Kamera</span>
                </button>
              </div>
            </div>

            {/* Kolom 4: Auto-Detect Kamera Barcode Meja 2D / USB-Wireless-BT HID Scanner & Jeda 2-3 Detik */}
            <div className="bg-amber-50/70 border border-amber-300 rounded-xl p-3.5 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Barcode className="w-4 h-4 text-amber-700 shrink-0" />
                    4. Kamera Barcode HID & Jeda 2–3s
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-mono font-bold text-[10px]">
                    Plug & Play
                  </span>
                </div>

                <p className="text-[11px] text-slate-600">
                  Menangkap otomatis hasil scan dari <strong>Kamera Barcode Meja 2D / Scanner USB / Wireless</strong> di seluruh layar Desktop meskipun kursor tidak berada di kolom pencarian:
                </p>

                <label className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-white border border-amber-200 cursor-pointer">
                  <span className="text-[11px] font-bold text-slate-800">
                    Global Auto-Detect Kamera Barcode (Tanpa Fokus Kursor)
                  </span>
                  <input
                    type="checkbox"
                    checked={globalHidBarcodeAutoDetect}
                    onChange={(e) => setGlobalHidBarcodeAutoDetect(e.target.checked)}
                    className="w-4 h-4 accent-amber-600"
                  />
                </label>

                <div className="space-y-1 pt-1">
                  <label className="block text-[10px] font-bold text-slate-700">
                    Pengaturan Jeda Anti-Dobel Scan Barcode (2–3 Detik):
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([2000, 2500, 3000] as const).map((ms) => (
                      <button
                        key={ms}
                        type="button"
                        onClick={() => setScanCooldownMs(ms)}
                        className={`min-h-[38px] rounded-lg border font-mono text-xs font-bold ${
                          scanCooldownMs === ms
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {ms / 1000} Detik
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-white border border-amber-200 text-[11px] text-slate-600 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Jeda aktif <strong>{scanCooldownMs / 1000} detik</strong> mencegah produk ter-scan ganda ke keranjang.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          FITUR 2: MODAL RESPONSIVE DIRECT CAMERA SCANNER & AUTO SCAN TO CART
          - HP & Tablet: 80vh - 90vh (90% tinggi layar), lebar min 320px - 100%
          - Desktop: Jendela modal kamera min 500x500px hingga 600x400px
          - Styling Wajib Video: #qr-reader video { width: 100% !important; height: 100% !important; object-fit: cover !important; border-radius: 12px; }
          - Tombol "Tutup Kamera" / "Close" berukuran jelas di sudut kanan atas modal
         ===================================================================== */}
      {isCameraScannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 overflow-y-auto">
          <style>{`
            #qr-reader video {
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
          <div className="bg-slate-900 text-white rounded-2xl border-2 border-indigo-400 shadow-2xl flex flex-col justify-between w-full min-w-[320px] min-h-[85vh] h-[92vh] md:w-[660px] md:min-w-[540px] md:min-h-[560px] md:h-auto md:max-h-[94vh] overflow-hidden">
            {/* Header Modal dengan Tombol Tutup Kamera / Close Jelas di Sudut Kanan Atas */}
            <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-3 h-3 rounded-full shrink-0 ${
                    cooldownRemainingSec > 0
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-emerald-400 animate-ping'
                  }`}
                />
                <div>
                  <div className="font-bold text-xs sm:text-sm flex flex-wrap items-center gap-1.5">
                    <span>Scan Kamera Barcode ATK (Auto +1 Keranjang)</span>
                    <span className="px-1.5 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-mono">
                      Jeda {scanCooldownMs / 1000}s Anti-Dobel
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Jeda scan otomatis {scanCooldownMs / 1000} detik agar tidak dobel · Bisa atur ulang / hapus Qty langsung di bawah
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCameraScannerOpen(false)}
                className="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md shrink-0 cursor-pointer"
                title="Tutup Kamera / Close"
              >
                <X className="w-4 h-4 shrink-0" />
                <span>Tutup Kamera</span>
              </button>
            </div>

            {/* Body Kamera (#qr-reader), Kontrol Jeda 2-3 Detik, Kamera Eksternal/Ponsel, & Atur Ulang/Hapus Qty Keranjang */}
            <div className="p-3 sm:p-4 flex-1 flex flex-col justify-between gap-3 overflow-y-auto">
              {/* Baris 1: Kontrol Suara Bip, Pilihan Jeda 2-3 Detik, & Sambungkan Kamera Ponsel/Eksternal */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      unlockScannerAudio();
                      const next = !soundEnabled;
                      setSoundEnabled(next);
                      if (next) {
                        playScannerBeepSound('success');
                      }
                    }}
                    className={`min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${
                      soundEnabled
                        ? 'bg-emerald-600/20 border-emerald-400 text-emerald-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    {soundEnabled ? (
                      <>
                        <Volume2 className="w-4 h-4" />
                        <span>Bip 800Hz</span>
                      </>
                    ) : (
                      <>
                        <VolumeX className="w-4 h-4" />
                        <span>Bisu</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCameraId('');
                      setFacingMode((prev) =>
                        prev === 'environment' ? 'user' : 'environment'
                      );
                    }}
                    className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-bold flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>
                      {facingMode === 'environment' ? 'Belakang' : 'Depan'}
                    </span>
                  </button>

                  {/* Selector Jeda Scan 2-3 Detik Anti-Dobel */}
                  <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg p-0.5">
                    <span className="px-2 text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-400" />
                      Jeda:
                    </span>
                    {([2000, 2500, 3000] as const).map((ms) => (
                      <button
                        key={ms}
                        type="button"
                        onClick={() => setScanCooldownMs(ms)}
                        className={`min-h-[32px] px-2 py-1 rounded-md font-mono text-[11px] font-bold transition-colors ${
                          scanCooldownMs === ms
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {ms / 1000}s
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pilihan Kamera Eksternal / Ponsel & Tombol QR Kamera Ponsel Lain */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    value={selectedCameraId}
                    onChange={(e) => {
                      setSelectedCameraId(e.target.value);
                      savePreferredExternalCameraId(e.target.value);
                    }}
                    className="min-h-[40px] max-w-[200px] px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-xs font-medium"
                  >
                    <option value="">
                      Kamera Otomatis ({facingMode === 'environment' ? 'Belakang' : 'Depan'})
                    </option>
                    {cameraDevices.map((cam) => (
                      <option key={cam.id} value={cam.id}>
                        {cam.isExternalOrPhone ? '🔌 ' : '💻 '}
                        {cam.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => handleConnectBluetoothScannerDevice('BLE', true)}
                    className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-600 border border-sky-400 text-white text-[11px] font-bold flex items-center gap-1"
                    title="Sambungkan Kamera / Ponsel / Barcode Scanner via Bluetooth Tanpa Driver"
                  >
                    <Bluetooth className="w-3.5 h-3.5 text-sky-200" />
                    <span>
                      {savedBtScanner
                        ? `BT: ${savedBtScanner.deviceName.slice(0, 8)}`
                        : 'Via Bluetooth'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowExternalCameraHub((prev) => !prev)}
                    className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-600 border border-indigo-400 text-white text-[11px] font-bold flex items-center gap-1"
                    title="Sambungkan Kamera Ponsel Lain via QR / Kamera Eksternal Tanpa Driver"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Kamera HP Lain (QR)</span>
                  </button>
                </div>
              </div>

              {/* Panel Mini QR Pairing Kamera Ponsel Lain di dalam Modal Kamera jika diklik */}
              {showExternalCameraHub && (
                <div className="p-3 rounded-xl bg-indigo-950/90 border border-indigo-400 flex flex-col gap-2.5 text-xs shrink-0">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=110x110&margin=4&data=${encodeURIComponent(
                          buildRemotePhoneScannerUrl(desktopSessionCode, remotePhoneSendMode)
                        )}`}
                        alt="QR Kamera Ponsel"
                        className="w-20 h-20 rounded-lg bg-white p-1 shrink-0"
                      />
                      <div className="space-y-1">
                        <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                          <Smartphone className="w-4 h-4" />
                          <span>Kamera Ponsel Lain (QR Auto-Connect: Auto & Manual Send)</span>
                        </div>
                        <p className="text-[11px] text-slate-300">
                          Scan QR ini dari ponsel cadangan atau gunakan Kode Sesi{' '}
                          <strong className="font-mono text-white bg-indigo-800 px-1.5 py-0.5 rounded">
                            {desktopSessionCode}
                          </strong>
                          . Saat scan barcode, produk otomatis masuk keranjang di Web Desktop.
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => handleChangeRemotePhoneSendMode('AUTO_SEND')}
                            className={`px-2.5 py-1 rounded font-bold text-[10.5px] flex items-center gap-1 ${
                              remotePhoneSendMode === 'AUTO_SEND'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-800 text-slate-300 hover:text-white'
                            }`}
                          >
                            <Zap className="w-3 h-3" />
                            <span>Auto Send ke Desktop</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleChangeRemotePhoneSendMode('MANUAL_SEND')}
                            className={`px-2.5 py-1 rounded font-bold text-[10.5px] flex items-center gap-1 ${
                              remotePhoneSendMode === 'MANUAL_SEND'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-800 text-slate-300 hover:text-white'
                            }`}
                          >
                            <Send className="w-3 h-3" />
                            <span>Manual Send ke Desktop</span>
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handlePullPhoneScansToDesktopNow}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[11px] flex items-center gap-1"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Tarik Scan HP</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => refreshAndAutoDetectCameras(true)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold text-[11px] flex items-center gap-1"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Auto-Detect USB Cam</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Panel Kontrol Flash, Mode Torch, Optimasi 100% Megapiksel Anti-Noise, Autofocus & Focus Lock */}
              <AtkCameraOpticsBar
                config={opticsConfig}
                capabilities={opticsCapabilities}
                isRefocusing={isRefocusingCamera}
                onChangeConfig={setOpticsConfig}
                onTriggerRefocus={() => void handleTriggerCameraRefocus({ x: 0.5, y: 0.5 })}
              />

              {/* Viewport Video Kamera (#qr-reader) dengan Tap-to-Focus & Iluminasi Flash/Torch */}
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
                title="Klik / Tap pada area barcode di layar untuk memicu Autofocus ke titik tersebut"
                className={`relative w-full min-h-[220px] sm:min-h-[260px] md:h-[270px] bg-black rounded-xl overflow-hidden flex items-center justify-center shrink-0 cursor-crosshair transition-all ${
                  opticsConfig.flashEnabled || opticsConfig.torchModeEnabled
                    ? 'border-4 border-amber-300 ring-8 ring-white/90 shadow-[0_0_40px_rgba(251,191,36,0.75)]'
                    : 'border-2 border-indigo-500/70'
                }`}
              >
                <div id="qr-reader" className="w-full h-full" />
                <div id="qr-macro-helper" className="hidden" />

                {/* Screen Fill-Light Illuminator Overlay saat Flash ON (membantu pencahayaan barcode 15x5mm) */}
                {opticsConfig.flashEnabled && (
                  <div className="pointer-events-none absolute inset-0 border-[14px] border-white/85 rounded-xl shadow-[inset_0_0_36px_rgba(255,255,255,0.65)] z-10" />
                )}

                {/* Indikator Titik Tap-to-Focus */}
                {tapFocusReticle && (
                  <div
                    style={{
                      left: `${tapFocusReticle.xPercent}%`,
                      top: `${tapFocusReticle.yPercent}%`,
                    }}
                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 w-14 h-14 border-2 border-amber-300 rounded-lg animate-ping z-20"
                  />
                )}

                {/* Visual Aiming Guide Overlay + Indikator Jeda 2-3 Detik Anti-Dobel + Status Fokus/Flash/100% MP */}
                {isCameraRunning && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-4 z-10">
                    <div
                      className={`w-[84%] max-w-[380px] h-[125px] sm:h-[145px] border-2 rounded-xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.28)] transition-colors ${
                        cooldownRemainingSec > 0
                          ? 'border-amber-400 bg-amber-500/15'
                          : opticsConfig.focusLocked
                          ? 'border-rose-400/95'
                          : 'border-emerald-400/90'
                      }`}
                    >
                      <div
                        className={`absolute inset-x-3 top-1/2 -translate-y-1/2 h-0.5 animate-pulse ${
                          cooldownRemainingSec > 0
                            ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
                            : 'bg-rose-500/90 shadow-[0_0_8px_#f43f5e]'
                        }`}
                      />
                      <span
                        className={`absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-0.5 rounded font-mono text-[10px] font-bold border ${
                          cooldownRemainingSec > 0
                            ? 'bg-amber-500 text-slate-950 border-amber-300'
                            : 'bg-slate-950/85 text-emerald-300 border-emerald-500/40'
                        }`}
                      >
                        {cooldownRemainingSec > 0
                          ? `⏳ JEDA ANTI-DOBEL AKTIF (${cooldownRemainingSec} DETIK)...`
                          : `ARAHKAN BARCODE 15×5mm / 20×10mm (TAP LAYAR = FOKUS)`}
                      </span>

                      {/* Status Badge Bawah Kotak Laser: Focus Lock / Autofocus / Zoom / Torch */}
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
                            : '🎯 AUTOFOCUS AKTIF'}
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
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-slate-300 text-xs bg-slate-950/80 gap-2">
                    <Camera className="w-7 h-7 text-indigo-400 animate-bounce" />
                    <span>Mengaktifkan sensor kamera 100% Megapiksel & Autofocus...</span>
                  </div>
                )}
              </div>

              {/* Notifikasi Visual Hasil Scan Terakhir + Tombol Cepat Koreksi / Kurangi / Hapus Qty */}
              {scanToast ? (
                <div className="p-3 bg-emerald-950/95 border-2 border-emerald-400 rounded-xl space-y-2 shrink-0">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-emerald-300 font-mono text-[11px]">
                    <span className="font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      BARCODE TERDETEKSI (+1 PCS) · {scanToast.sourceLabel || 'Kamera'}
                    </span>
                    <span>
                      {scanToast.timestamp} · Scan #{scanHistoryCount}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate">
                        [{scanToast.sku}] {scanToast.name}
                      </div>
                      <div className="text-xs text-emerald-200 font-mono">
                        Harga: {formatIDR(scanToast.price)} / pcs
                      </div>
                    </div>

                    {/* Kontrol Cepat Atur Ulang / Kurangi / Hapus Barang yang Baru Di-Scan */}
                    {(() => {
                      const matchingCartItem = cartItems.find(
                        (c) =>
                          c.materialId === scanToast.item.id ||
                          c.jobTitle === scanToast.item.name
                      );
                      const liveQty = matchingCartItem ? matchingCartItem.qty : 0;
                      return (
                        <div className="flex items-center gap-1.5 bg-slate-950/90 border border-emerald-500/50 rounded-lg p-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onQuickAddAtkToCart(scanToast.item, -1)}
                            disabled={liveQty <= 0}
                            className="min-h-[36px] px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold text-[11px] flex items-center gap-1"
                            title="Kurangi 1 Qty jika tidak sengaja ter-scan dobel"
                          >
                            <Minus className="w-3.5 h-3.5" />
                            <span>-1</span>
                          </button>

                          <div className="px-2 text-center font-mono">
                            <div className="text-[10px] text-slate-400">Di Keranjang</div>
                            <div className="text-xs font-extrabold text-emerald-300">
                              {liveQty} Pcs
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => onQuickAddAtkToCart(scanToast.item, 1)}
                            className="min-h-[36px] px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1"
                            title="Tambah 1 Qty"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>+1</span>
                          </button>

                          {matchingCartItem && (
                            <button
                              type="button"
                              onClick={() => {
                                if (onRemoveCartItemById) {
                                  onRemoveCartItemById(matchingCartItem.id);
                                } else {
                                  onQuickAddAtkToCart(scanToast.item, -liveQty);
                                }
                              }}
                              className="min-h-[36px] px-2.5 py-1 rounded bg-slate-800 hover:bg-rose-700 border border-rose-500/50 text-rose-300 hover:text-white font-bold text-[11px] flex items-center gap-1"
                              title="Hapus produk ini dari keranjang"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Hapus</span>
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div className="p-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-slate-300 text-xs flex items-center justify-between gap-2 shrink-0">
                  <span>
                    Pemindai aktif berkelanjutan dengan <strong>jeda anti-dobel {scanCooldownMs / 1000} detik</strong>. Arahkan kamera ke Barcode produk ATK.
                  </span>
                  {lastDetectedRawCode && (
                    <span className="font-mono text-[11px] px-2 py-0.5 bg-slate-900 rounded text-emerald-300 shrink-0">
                      Kode: {lastDetectedRawCode}
                    </span>
                  )}
                </div>
              )}

              {/* FITUR ATUR ULANG / HAPUS QTY PRODUK DI MENU KAMERA SAAT ADA BARANG DOBEL TERSCAN */}
              <div className="bg-slate-950 border border-slate-700 rounded-xl p-3 space-y-2 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <div className="font-bold text-xs text-white flex items-center gap-1.5">
                    <ShoppingCart className="w-4 h-4 text-emerald-400" />
                    <span>
                      Daftar Keranjang di Menu Kamera — Atur Ulang / Hapus Qty ({cartItems.length} Produk)
                    </span>
                  </div>
                  {cartItems.length > 0 && onClearAllCartItems && (
                    <button
                      type="button"
                      onClick={onClearAllCartItems}
                      className="px-2.5 py-1 rounded bg-rose-950 hover:bg-rose-800 border border-rose-500/50 text-rose-300 text-[10px] font-bold flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Kosongkan Keranjang</span>
                    </button>
                  )}
                </div>

                {cartItems.length === 0 ? (
                  <div className="text-[11px] text-slate-400 py-2 text-center">
                    Keranjang masih kosong. Barang yang ter-scan akan muncul di sini untuk diatur ulang atau dihapus jika ter-scan dobel.
                  </div>
                ) : (
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                    {cartItems.map((cItem) => {
                      const matchedInv = atkItems.find(
                        (i) => i.id === cItem.materialId || i.name === cItem.jobTitle
                      );
                      return (
                        <div
                          key={cItem.id}
                          className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-xs text-white truncate">
                              {cItem.jobTitle}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              {formatIDR(cItem.unitPrice)} / {cItem.unitType} · Subtotal:{' '}
                              <span className="text-emerald-300 font-bold">
                                {formatIDR(cItem.itemTotalAmount)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                            {/* Kurangi 1 Qty */}
                            <button
                              type="button"
                              onClick={() => {
                                if (onSetCartItemExactQty) {
                                  onSetCartItemExactQty(cItem.id, cItem.qty - 1);
                                } else if (matchedInv) {
                                  onQuickAddAtkToCart(matchedInv, -1);
                                }
                              }}
                              className="min-w-[36px] min-h-[36px] rounded-lg bg-slate-800 hover:bg-rose-900/70 border border-slate-600 flex items-center justify-center text-white font-bold"
                              title="Kurangi 1 Qty"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>

                            {/* Input Atur Ulang Qty Langsung */}
                            <input
                              type="number"
                              min="0"
                              value={cItem.qty}
                              onChange={(e) => {
                                const parsed = parseInt(e.target.value, 10);
                                const nextQty = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
                                if (onSetCartItemExactQty) {
                                  onSetCartItemExactQty(cItem.id, nextQty);
                                } else if (matchedInv) {
                                  onQuickAddAtkToCart(matchedInv, nextQty - cItem.qty);
                                }
                              }}
                              className="w-14 min-h-[36px] text-center rounded-lg bg-slate-950 border border-indigo-400/60 font-mono font-extrabold text-xs text-white"
                              title="Ketik untuk atur ulang jumlah Qty"
                            />

                            {/* Tambah 1 Qty */}
                            <button
                              type="button"
                              onClick={() => {
                                if (onSetCartItemExactQty) {
                                  onSetCartItemExactQty(cItem.id, cItem.qty + 1);
                                } else if (matchedInv) {
                                  onQuickAddAtkToCart(matchedInv, 1);
                                }
                              }}
                              className="min-w-[36px] min-h-[36px] rounded-lg bg-emerald-700 hover:bg-emerald-600 flex items-center justify-center text-white font-bold"
                              title="Tambah 1 Qty"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>

                            {/* Hapus Item dari Keranjang */}
                            <button
                              type="button"
                              onClick={() => {
                                if (onRemoveCartItemById) {
                                  onRemoveCartItemById(cItem.id);
                                } else if (matchedInv) {
                                  onQuickAddAtkToCart(matchedInv, -cItem.qty);
                                }
                              }}
                              className="min-h-[36px] px-2.5 py-1 rounded-lg bg-rose-600/25 hover:bg-rose-600 border border-rose-500/60 text-rose-300 hover:text-white font-bold text-[11px] flex items-center gap-1"
                              title="Hapus barang ini dari keranjang"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Hapus</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {cameraError && (
                <div className="p-2.5 bg-amber-950/90 border border-amber-500/60 rounded-lg text-amber-200 text-[11px] shrink-0">
                  {cameraError}
                </div>
              )}

              {/* Uji Cepat / Simulasi Scan Barcode Produk ATK */}
              <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-2.5 space-y-1.5 shrink-0">
                <div className="text-[10px] font-semibold text-slate-400">
                  Pintasan Uji Scan Barcode (Klik untuk tes callback onScanSuccess + Bip 800Hz):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {atkItems.slice(0, 5).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleProcessScannedBarcode(item.sku)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[11px] font-bold flex items-center gap-1.5"
                    >
                      <Barcode className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {item.sku} ({item.name.slice(0, 14)})
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          FITUR 3: PANEL DUAL-MODE DIRECT PRINT & AUTO-REMEMBER (BT & USB)
         ===================================================================== */}
      {showPrinterPanel && (
        <div className="bg-white border-2 border-indigo-200 rounded-xl p-4 space-y-3.5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div>
              <h5 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                <Printer className="w-4 h-4 text-indigo-700" />
                <span>
                  Dual-Mode Direct Print & Auto-Remember Printer (HP, Tablet, & Desktop PC/Laptop)
                </span>
              </h5>
              <p className="text-[11px] text-slate-500">
                Mendukung <strong>Web Bluetooth API</strong> (Auto-Remember ID di localStorage + Chunking 20–50 byte), <strong>WebUSB API</strong> (Kabel USB Direct), dan <strong>Smart Fallback</strong> (window.print / PDF / PNG).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPrinterPanel(false)}
              className="text-slate-400 hover:text-slate-700 font-bold text-xs self-end sm:self-auto"
            >
              Tutup Panel ✕
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
            {/* Mode 1: Web Bluetooth API (Auto-Remember + Chunking 20-50 byte) */}
            <div
              className={`rounded-lg border p-3.5 space-y-2.5 ${
                printMode === 'BLUETOOTH'
                  ? 'bg-indigo-50/70 border-indigo-500'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Bluetooth className="w-4 h-4 text-indigo-600" />
                  1. Web Bluetooth (Auto-Remember)
                </span>
                <input
                  type="radio"
                  name="atkPrintMode"
                  checked={printMode === 'BLUETOOTH'}
                  onChange={() => {
                    setPrintMode('BLUETOOTH');
                    setPreferredAtkPrintMode('BLUETOOTH');
                  }}
                />
              </div>

              <div className="text-[11px] text-slate-600">
                {savedBtPrinter ? (
                  <div className="p-2 bg-white border border-indigo-200 rounded space-y-0.5">
                    <div className="font-bold text-emerald-800">
                      ✓ Tersimpan: {savedBtPrinter.deviceName}
                    </div>
                    <div className="font-mono text-[10px] text-slate-500 truncate">
                      ID: {savedBtPrinter.deviceId} · Chunk: {savedBtPrinter.chunkByteSize}B
                    </div>
                  </div>
                ) : (
                  <span>
                    Belum ada printer Bluetooth tersimpan. Klik cetak/pair pertama kali untuk menyimpan otomatis ke <code>localStorage</code>.
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                    Chunking Data (20–50 Byte)
                  </label>
                  <select
                    value={btChunkSize}
                    onChange={(e) => {
                      const next = Number(e.target.value) || 32;
                      setBtChunkSize(next);
                      if (savedBtPrinter) {
                        const updated = { ...savedBtPrinter, chunkByteSize: next };
                        saveBluetoothPrinter(updated);
                        setSavedBtPrinter(updated);
                      }
                    }}
                    className="w-full px-2 py-1 border border-slate-300 rounded bg-white font-mono text-[11px]"
                  >
                    <option value={20}>20 Byte (Stabil Maks)</option>
                    <option value={32}>32 Byte (Rekomendasi)</option>
                    <option value={50}>50 Byte (Cepat)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                    Lebar Kertas Thermal
                  </label>
                  <select
                    value={thermalCols}
                    onChange={(e) =>
                      setThermalCols(Number(e.target.value) === 32 ? 32 : 48)
                    }
                    className="w-full px-2 py-1 border border-slate-300 rounded bg-white font-mono text-[11px]"
                  >
                    <option value={48}>80mm (48 Kolom)</option>
                    <option value={32}>58mm (32 Kolom)</option>
                  </select>
                </div>
              </div>

              {savedBtPrinter && (
                <button
                  type="button"
                  onClick={() => {
                    clearSavedBluetoothPrinter();
                    setSavedBtPrinter(null);
                  }}
                  className="text-[11px] text-rose-700 hover:underline font-semibold flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Lupakan Printer Bluetooth Tersimpan
                </button>
              )}
            </div>

            {/* Mode 2: WebUSB API (Desktop & USB OTG) */}
            <div
              className={`rounded-lg border p-3.5 space-y-2.5 ${
                printMode === 'USB'
                  ? 'bg-emerald-50/70 border-emerald-500'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Usb className="w-4 h-4 text-emerald-700" />
                  2. Direct USB (WebUSB API / OTG)
                </span>
                <input
                  type="radio"
                  name="atkPrintMode"
                  checked={printMode === 'USB'}
                  onChange={() => {
                    setPrintMode('USB');
                    setPreferredAtkPrintMode('USB');
                  }}
                />
              </div>

              <div className="text-[11px] text-slate-600">
                {savedUsbPrinter ? (
                  <div className="p-2 bg-white border border-emerald-200 rounded space-y-0.5">
                    <div className="font-bold text-emerald-800">
                      ✓ USB Tersimpan: {savedUsbPrinter.productName}
                    </div>
                    <div className="font-mono text-[10px] text-slate-500">
                      Vendor: 0x{savedUsbPrinter.vendorId.toString(16)} · Product: 0x
                      {savedUsbPrinter.productId.toString(16)}
                    </div>
                  </div>
                ) : (
                  <span>
                    Koneksi kabel USB langsung dari PC Desktop / Laptop / Tablet OTG ke printer thermal via <code>navigator.usb</code> tanpa driver tambahan.
                  </span>
                )}
              </div>

              <div className="text-[10px] font-mono text-slate-500">
                Status Browser:{' '}
                {isWebUsbSupported()
                  ? '✓ WebUSB API Tersedia'
                  : '⚠️ WebUSB Tidak Didukung (Otomatis Smart Fallback)'}
              </div>

              {savedUsbPrinter && (
                <button
                  type="button"
                  onClick={() => {
                    clearSavedUsbPrinter();
                    setSavedUsbPrinter(null);
                  }}
                  className="text-[11px] text-rose-700 hover:underline font-semibold flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Lupakan Printer USB Tersimpan
                </button>
              )}
            </div>

            {/* Mode 3: Smart Fallback (Browser window.print() / PDF / PNG) */}
            <div
              className={`rounded-lg border p-3.5 space-y-2.5 ${
                printMode === 'FALLBACK_BROWSER' || printMode === 'FALLBACK_PDF'
                  ? 'bg-amber-50/70 border-amber-500'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-amber-700" />
                  3. Smart Fallback (OS / PDF / PNG)
                </span>
                <input
                  type="radio"
                  name="atkPrintMode"
                  checked={
                    printMode === 'FALLBACK_BROWSER' || printMode === 'FALLBACK_PDF'
                  }
                  onChange={() => {
                    setPrintMode('FALLBACK_BROWSER');
                    setPreferredAtkPrintMode('FALLBACK_BROWSER');
                  }}
                />
              </div>

              <p className="text-[11px] text-slate-600">
                Jika Bluetooth/WebUSB tidak didukung atau gagal, sistem otomatis mengalihkan ke <code>window.print()</code> bawaan browser atau unduh dokumen PDF/PNG nota.
              </p>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setPrintMode('FALLBACK_BROWSER');
                    setPreferredAtkPrintMode('FALLBACK_BROWSER');
                  }}
                  className={`py-1.5 px-2 rounded border text-[11px] font-semibold ${
                    printMode === 'FALLBACK_BROWSER'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  Browser Print
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrintMode('FALLBACK_PDF');
                    setPreferredAtkPrintMode('FALLBACK_PDF');
                  }}
                  className={`py-1.5 px-2 rounded border text-[11px] font-semibold ${
                    printMode === 'FALLBACK_PDF'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {printerStatusBanner && (
        <div
          className={`p-3 rounded-lg border flex items-center justify-between gap-2 text-xs ${
            printerStatusBanner.type === 'SUCCESS'
              ? 'bg-emerald-100 border-emerald-400 text-emerald-950'
              : printerStatusBanner.type === 'WARNING'
              ? 'bg-amber-100 border-amber-400 text-amber-950'
              : 'bg-rose-100 border-rose-400 text-rose-950'
          }`}
        >
          <span className="font-medium">{printerStatusBanner.text}</span>
          <button
            type="button"
            onClick={() => setPrinterStatusBanner(null)}
            className="font-bold opacity-75 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* =====================================================================
          FITUR 4: FORM AUTO-GENERATE SKU & PREVIEW BARCODE CODE128 (JsBarcode)
         ===================================================================== */}
      {showAtkStockForm && (
        <div className="bg-white border-2 border-emerald-400 rounded-xl p-4 space-y-3.5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span className="font-bold text-slate-900 text-xs sm:text-sm">
                {editingAtkItem
                  ? `Edit Produk ATK & Barcode: ${editingAtkItem.name}`
                  : 'Input Produk ATK Baru (Auto-Generate Kode SKU Unik & Visual Barcode Code128)'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowAtkStockForm(false);
                setEditingAtkItem(null);
              }}
              className="text-slate-400 hover:text-slate-700 font-bold text-xs"
            >
              Tutup ✕
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
            <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700 text-[11px]">
                    Kode Barcode Space-Bar Unik
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const nextSalt = formSkuSalt + 1;
                      setFormSkuSalt(nextSalt);
                      setIsFormSkuManuallyEdited(false);
                      setFormSku(
                        generateNextAtkSku(
                          inventory,
                          'ATK & Perlengkapan',
                          formName,
                          nextSalt,
                          editingAtkItem?.id
                        )
                      );
                    }}
                    className="text-[10px] font-bold text-emerald-700 hover:underline"
                    title="Buat pola Space-Bar unik baru yang spesifik untuk produk ini"
                  >
                    ↻ Space-Bar Unik
                  </button>
                </div>
                <input
                  type="text"
                  value={formSku}
                  onChange={(e) => {
                    setIsFormSkuManuallyEdited(true);
                    setFormSku(e.target.value.toUpperCase());
                  }}
                  placeholder="ATK-HVS4-107"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono font-bold text-xs bg-slate-50"
                />
                <div className="mt-0.5 text-[9.5px] font-mono text-emerald-700 font-semibold">
                  Pola Spasi: {formatSpacedBarcodeLabel(formSku || 'ATK-HVS4-107')}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 text-[11px] mb-1">
                  Nama Produk ATK * (Otomatis Membentuk Space-Bar Spesifik Produk)
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => {
                    const nextName = e.target.value;
                    setFormName(nextName);
                    if (!editingAtkItem && !isFormSkuManuallyEdited) {
                      setFormSku(
                        generateNextAtkSku(
                          inventory,
                          'ATK & Perlengkapan',
                          nextName,
                          formSkuSalt
                        )
                      );
                    }
                  }}
                  placeholder="Contoh: Pulpen Standard AE7 / Kertas HVS A4 SiDU..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 text-[11px] mb-1">
                  Stok & Satuan
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min="0"
                    value={formQtyInput}
                    onChange={(e) => setFormQtyInput(e.target.value)}
                    className="w-20 px-2.5 py-2 border border-slate-300 rounded-md font-mono text-xs"
                  />
                  <select
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value as InventoryUnit)}
                    className="flex-1 px-2 py-2 border border-slate-300 rounded-md text-xs bg-white"
                  >
                    <option value="Pcs">Pcs</option>
                    <option value="Pack">Pack/Rim</option>
                    <option value="Roll">Roll</option>
                    <option value="Botol">Botol</option>
                    <option value="Lembar">Lembar</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 text-[11px] mb-1">
                  Modal HPP (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formCostInput}
                  onChange={(e) => setFormCostInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 text-[11px] mb-1">
                  Harga Jual Kasir (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formSellInput}
                  onChange={(e) => setFormSellInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono font-bold text-emerald-800 text-xs"
                />
              </div>
            </div>

            {/* Live Visual Barcode Code128 Preview via JsBarcode */}
            <div className="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-col items-center justify-between gap-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Visual Barcode (Format Code128 · JsBarcode)
              </div>
              <div className="bg-white border border-slate-200 rounded p-2 w-full flex flex-col items-center">
                {formBarcodePreviewUrl && (
                  <img
                    src={formBarcodePreviewUrl}
                    alt={formSku}
                    className="h-14 object-contain"
                  />
                )}
                <div className="text-[10px] font-semibold text-slate-700 truncate max-w-full mt-0.5">
                  {formName || 'Nama Produk ATK'} ·{' '}
                  {formatIDR(parseInt(formSellInput, 10) || 0)}
                </div>
              </div>
              <button
                type="button"
                disabled={isSavingStock || !formName.trim()}
                onClick={() => handleSaveAtkStockForm()}
                className="w-full py-2 px-4 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold rounded-lg text-xs"
              >
                {isSavingStock
                  ? 'Menyimpan...'
                  : editingAtkItem
                  ? 'Simpan Perubahan Produk ATK'
                  : 'Simpan Produk ATK & Barcode ke Stok'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          FITUR 1: KOLOM INPUT SCAN BARCODE INSTAN (TANPA LAG ONCHANGE, DETEKSI ENTER + AUTO-CLEAR & AUTO-FOCUS)
         ===================================================================== */}
      <div className="bg-white border border-emerald-200 rounded-xl p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 flex items-center gap-1.5">
          <div className="relative flex-1">
            <Barcode className="w-4 h-4 text-emerald-700 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              defaultValue=""
              autoFocus
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.keyCode === 13) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleInstantBarcodeInputEnter(
                    e.currentTarget,
                    'Kolom Scan Barcode Instan'
                  );
                }
              }}
              placeholder="Kolom Input Scan Barcode Instan (HP / Scanner) — Scan atau ketik SKU Space-Bar (cth: ATK-HVS4-107) lalu tekan Enter..."
              className="w-full pl-10 pr-24 py-2.5 text-xs border-2 border-emerald-500/80 rounded-lg focus:outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-500/20 font-mono font-bold text-slate-900"
            />
            {atkSearchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setAtkSearchQuery('');
                  if (searchInputRef.current) {
                    searchInputRef.current.value = '';
                    searchInputRef.current.focus();
                  }
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-rose-100 hover:bg-rose-200 rounded text-[10px] font-bold text-rose-700"
              >
                Reset ✕
              </button>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1 absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 pointer-events-none">
                <Keyboard className="w-3 h-3" />
                Enter = Instan +1
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() =>
              handleInstantBarcodeInputEnter(
                searchInputRef.current,
                'Kolom Scan Barcode Instan'
              )
            }
            className="min-h-[40px] px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1.5 shrink-0"
            title="Proses Scan Barcode / Cari Instan (Enter)"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Enter / Scan</span>
          </button>
        </div>

        {/* Filter Pills Touch-Friendly */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'ALL', label: `Semua ATK (${atkItems.length})` },
            {
              id: 'AVAILABLE',
              label: `Tersedia (${atkItems.filter((i) => i.stockQty > 0).length})`,
            },
            {
              id: 'IN_CART',
              label: `Di Keranjang (${
                atkItems.filter((i) =>
                  cartItems.some(
                    (c) => c.materialId === i.id || c.jobTitle === i.name
                  )
                ).length
              })`,
            },
            {
              id: 'LOW',
              label: `Stok Menipis (${
                atkItems.filter((i) => i.stockQty <= i.minStockQty).length
              })`,
            },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() =>
                setStockFilter(f.id as 'ALL' | 'AVAILABLE' | 'LOW' | 'IN_CART')
              }
              className={`min-h-[36px] px-3 py-1.5 rounded-lg font-semibold text-xs border transition-colors ${
                stockFilter === f.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* =====================================================================
          GRID PRODUK ATK RESPONSIVE (HP, TABLET, & DESKTOP)
         ===================================================================== */}
      {filteredAtkItems.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
          <div className="text-slate-500 font-medium">
            Tidak ditemukan produk ATK yang cocok dengan pencarian "{atkSearchQuery}".
          </div>
          {onCreateInventoryItem && (
            <button
              type="button"
              onClick={openNewAtkProductForm}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Tambah Produk ATK Baru (Auto-SKU)
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredAtkItems.map((atk) => {
            const isSelected = selectedMaterialId === atk.id;
            const inCartItem = cartItems.find(
              (c) => c.materialId === atk.id || c.jobTitle === atk.name
            );
            const qtyInCart = inCartItem ? inCartItem.qty : 0;
            const isLowStock = atk.stockQty <= atk.minStockQty;

            return (
              <div
                key={atk.id}
                className={`rounded-xl border p-3.5 flex flex-col justify-between gap-2.5 transition-all bg-white ${
                  qtyInCart > 0
                    ? 'border-2 border-emerald-600 shadow-sm ring-2 ring-emerald-500/15'
                    : isSelected
                    ? 'border-2 border-slate-900 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Top Row: SKU Barcode Badge + Actions */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="px-2 py-0.5 bg-slate-900 text-white font-mono font-bold text-[10px] rounded flex items-center gap-1">
                      <Barcode className="w-3 h-3 text-emerald-400" />
                      {atk.sku}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setLabelModalTargetItem(atk);
                          setLabelModalOpen(true);
                        }}
                        title="Cetak / Download Stiker Barcode (20x10mm & 15x5mm)"
                        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[10px] flex items-center gap-1"
                      >
                        <Tag className="w-3 h-3 text-indigo-700" />
                        Label
                      </button>
                      {onUpdateInventoryItem && (
                        <button
                          type="button"
                          onClick={() => openEditAtkProductForm(atk)}
                          title="Edit Produk & SKU"
                          className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectAtkProductToForm(atk)}
                    className="text-left w-full group"
                  >
                    <div className="font-bold text-slate-900 text-xs sm:text-[13px] leading-snug group-hover:text-emerald-800 line-clamp-2">
                      {atk.name}
                    </div>
                  </button>

                  <div className="flex items-baseline justify-between pt-0.5">
                    <span className="text-sm font-mono font-extrabold text-emerald-700">
                      {formatIDR(atk.defaultSellPrice)}
                      <span className="text-[10px] font-normal text-slate-500">
                        /{atk.unit}
                      </span>
                    </span>

                    <span
                      className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold ${
                        isLowStock
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      Stok: {formatNumberID(atk.stockQty)} {atk.unit}
                    </span>
                  </div>
                </div>

                {/* Touch-Friendly Bottom Controls (min 44x44px untuk akses HP/Tablet) */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  {qtyInCart > 0 ? (
                    <div className="flex items-center justify-between w-full bg-emerald-50 border border-emerald-300 rounded-lg p-1">
                      <button
                        type="button"
                        onClick={() => onQuickAddAtkToCart(atk, -1)}
                        className="min-w-[44px] min-h-[44px] rounded-md bg-white hover:bg-rose-50 border border-slate-200 flex items-center justify-center text-slate-800 font-bold shadow-2xs"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <div className="text-center font-mono">
                        <div className="font-extrabold text-emerald-950 text-xs">
                          {qtyInCart} {atk.unit}
                        </div>
                        <div className="text-[9.5px] text-emerald-700">
                          {formatIDR(qtyInCart * atk.defaultSellPrice)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (soundEnabled) playScannerBeepSound('success');
                          onQuickAddAtkToCart(atk, 1);
                        }}
                        className="min-w-[44px] min-h-[44px] rounded-md bg-emerald-700 hover:bg-emerald-800 text-white flex items-center justify-center font-bold shadow-2xs"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (soundEnabled) playScannerBeepSound('success');
                        onQuickAddAtkToCart(atk, 1);
                      }}
                      className="w-full min-h-[44px] py-2.5 px-3 rounded-lg bg-slate-900 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <ShoppingCart className="w-4 h-4" />
                      <span>+ Keranjang (1 {atk.unit})</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =====================================================================
          BAR AKSI CEPAT CHECKOUT & DIRECT PRINT TRANSAKSI ATK
         ===================================================================== */}
      <div className="bg-slate-900 text-white rounded-xl p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-300">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-xs sm:text-sm flex flex-wrap items-center gap-2">
              <span>
                Cetak Instan Transaksi ATK (Mode Aktif:{' '}
                {printMode === 'BLUETOOTH'
                  ? `Bluetooth Auto-Remember${
                      savedBtPrinter ? ` · ${savedBtPrinter.deviceName}` : ''
                    }`
                  : printMode === 'USB'
                  ? `Direct Kabel WebUSB${
                      savedUsbPrinter ? ` · ${savedUsbPrinter.productName}` : ''
                    }`
                  : printMode === 'FALLBACK_PDF'
                  ? 'Download PDF Struk'
                  : 'Browser Print / OS Driver'}
                )
              </span>
            </div>
            <p className="text-[11px] text-slate-300">
              {cartItems.length > 0
                ? `${cartItems.length} item di Keranjang Belanja ATK siap disimpan & langsung dicetak ke printer thermal.`
                : 'Pilih / scan produk ATK di atas ke Keranjang untuk cetak langsung 1 klik, atau cetak ulang transaksi ATK terakhir.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {cartItems.length > 0 && (
            <button
              type="button"
              disabled={isSubmittingOrder || isPrintingDirect}
              onClick={handleCheckoutAndDirectPrintClick}
              className="min-h-[42px] px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>
                {isSubmittingOrder || isPrintingDirect
                  ? 'Memproses & Mencetak...'
                  : `Simpan & Cetak Struk ATK (${cartItems.length} Item)`}
              </span>
            </button>
          )}

          {lastCreatedAtkOrder && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={isPrintingDirect}
                onClick={() =>
                  handleDirectPrintOrder(lastCreatedAtkOrder, 'BLUETOOTH', false)
                }
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] flex items-center gap-1.5"
              >
                <Bluetooth className="w-3.5 h-3.5" />
                Cetak BT #{lastCreatedAtkOrder.invoiceNumber}
              </button>
              <button
                type="button"
                disabled={isPrintingDirect}
                onClick={() =>
                  handleDirectPrintOrder(lastCreatedAtkOrder, 'USB', false)
                }
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold text-[11px] flex items-center gap-1.5"
              >
                <Usb className="w-3.5 h-3.5 text-emerald-400" />
                Cetak USB
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadAtkReceiptPdfFallback(lastCreatedAtkOrder, storeSettings, 80)
                }
                className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-semibold text-[11px] flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                PDF
              </button>
              <button
                type="button"
                onClick={() => onDownloadOrderPng(lastCreatedAtkOrder)}
                className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-semibold text-[11px] flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                PNG
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal Export Stiker Label Barcode ATK (20x10 mm & 15x5 mm) */}
      <AtkBarcodeLabelModal
        isOpen={labelModalOpen}
        onClose={() => setLabelModalOpen(false)}
        atkItems={atkItems}
        initialSelectedItem={labelModalTargetItem}
      />

      {/* Modal Kamera Pengirim Ponsel Cadangan (Jika dibuka langsung dari dalam aplikasi) */}
      {isRemotePhoneSenderModalOpen && (
        <AtkRemotePhoneScannerModal
          initialSessionCode={desktopSessionCode}
          initialSendMode={remotePhoneSendMode}
          atkItems={atkItems}
          onClose={() => setIsRemotePhoneSenderModalOpen(false)}
        />
      )}
    </div>
  );
};
