import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Printer,
  CheckCircle2,
  Trash2,
  Calculator,
  Wallet,
  FileText,
  Receipt,
  Maximize2,
  UserCheck,
  UserPlus,
  X,
  CheckSquare,
  Layers,
  Download,
  Share2,
  Landmark,
  Copy,
  Send,
  Image as ImageIcon,
  ShoppingCart,
  Edit3,
} from 'lucide-react';
import {
  PrintOrder,
  OrderCartItem,
  InventoryItem,
  InventoryCategory,
  InventoryUnit,
  OrderCategory,
  OrderUnitType,
  PaymentMethod,
  PaymentStatus,
  ProductionStatus,
  CashPaymentMethod,
  PrintPaperSize,
  PRINT_PAPER_OPTIONS,
  StoreSettings,
  DEFAULT_STORE_SETTINGS,
  BANK_TRANSFER_OPTIONS,
  BANNER_FINISHING_OPTIONS,
  calculateBannerEffectiveDimensions,
  buildOrderNotesWithBankTransfer,
  extractOrderPaymentDetail,
  extractOrderFinishingLines,
  extractItemDetailedBreakdown,
  extractOrderCartItems,
  cleanProductJobTitle,
  roundFinalOrderAmount,
  formatWhatsAppPhone,
  formatIDR,
  formatDateID,
  formatNumberID,
  todayISO,
  clampString,
} from '../types';
import {
  generateOrderInvoicePngDataUrl,
  triggerDownloadPng,
  buildWhatsAppOrderMessage,
  WhatsAppMessageTemplate,
} from '../utils/invoicePngAndWhatsapp';
import { AtkPosSubTabPanel } from './AtkPosSubTabPanel';
import { AtkFullscreenPosModal } from './AtkFullscreenPosModal';
import { generateNextAtkSku } from '../utils/atkBarcodeHelpers';

interface OrdersPosViewProps {
  orders: PrintOrder[];
  inventory: InventoryItem[];
  storeSettings?: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>;
  paperSize: PrintPaperSize;
  onChangePaperSize: (size: PrintPaperSize) => void;
  activeCashierName: string;
  cashierList: string[];
  onChangeActiveCashier: (name: string) => void;
  onAddCashierName: (name: string) => void;
  onRemoveCashierName: (name: string) => void;
  onCreateOrder: (
    orderData: Omit<PrintOrder, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
    deductStock: boolean,
    recordCashTx: boolean
  ) => Promise<PrintOrder | void>;
  onCreateInventoryItem?: (
    itemData: Omit<InventoryItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onUpdateInventoryItem?: (
    itemId: string,
    itemData: Omit<InventoryItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onUpdateProductionStatus: (order: PrintOrder, nextStatus: ProductionStatus) => Promise<void>;
  onSettleOrderPayment: (
    order: PrintOrder,
    payAmount: number,
    method: CashPaymentMethod,
    bankTransferDetail?: string
  ) => Promise<void>;
  onDeleteOrder: (orderId: string) => Promise<void>;
  onOpenPrintModal: (
    order: PrintOrder,
    mode: 'invoice' | 'spk',
    size?: PrintPaperSize
  ) => void;
}

const CATEGORIES: OrderCategory[] = [
  'Banner & Outdoor',
  'Indoor & Sticker',
  'Print A3+ & Dokumen',
  'Merchandise & Display',
  'Offset & Kemasan',
  'Fotokopi, Jilid & Laminating',
  'Penjualan ATK',
  'Jasa Desain & Servis IT',
];

type PosServiceTabId =
  | 'OUTDOOR_BANNER'
  | 'INDOOR_HIRES'
  | 'PRINT_A3'
  | 'PRINT_OFFSET'
  | 'FOTOKOPI_JILID'
  | 'ATK_RETAIL'
  | 'JASA_IT_DESAIN';

interface PosServiceTabConfig {
  id: PosServiceTabId;
  shortTitle: string;
  fullTitle: string;
  subtitle: string;
  orderCategory: OrderCategory;
  defaultUnit: OrderUnitType;
  badgeText: string;
}

const POS_SERVICE_TABS: PosServiceTabConfig[] = [
  {
    id: 'OUTDOOR_BANNER',
    shortTitle: '1. Outdoor Banner',
    fullTitle: 'Outdoor Banner & Baliho',
    subtitle: 'Spanduk Flexi 280gr / 340gr / Korea 440gr / Backlite (Hitungan m²)',
    orderCategory: 'Banner & Outdoor',
    defaultUnit: 'm2',
    badgeText: 'Meteran (m²)',
  },
  {
    id: 'INDOOR_HIRES',
    shortTitle: '2. Indoor HiRes',
    fullTitle: 'Indoor HiRes (Stiker Ritrama / Orajet / Inflex, Albatros, One Way)',
    subtitle: 'Stiker Indoor Ritrama, Orajet, Inflex, Albatros, & One Way Stiker (Hitungan m²)',
    orderCategory: 'Indoor & Sticker',
    defaultUnit: 'm2',
    badgeText: 'Indoor HiRes',
  },
  {
    id: 'PRINT_A3',
    shortTitle: '3. Print A3+',
    fullTitle: 'Print A3+ (Stiker A3+, Kartu Tasyakuran Warna, Art Carton, Brosur)',
    subtitle: 'Lembaran A3+ + Checklist Otomatis DieCut / KissCut / Laminasi / Bolak Balik',
    orderCategory: 'Print A3+ & Dokumen',
    defaultUnit: 'Lembar',
    badgeText: 'Per Lembar A3+',
  },
  {
    id: 'PRINT_OFFSET',
    shortTitle: '4. Offset & Undangan',
    fullTitle: 'Offset, Undangan & Selebaran Tasyakuran Partai',
    subtitle: 'Undangan Blangko/Custom, Selebaran Tasyakuran, Nota NCR, Brosur Rim & Kemasan',
    orderCategory: 'Offset & Kemasan',
    defaultUnit: 'Paket',
    badgeText: 'Offset & Undangan',
  },
  {
    id: 'FOTOKOPI_JILID',
    shortTitle: '5. Fotokopi, Jilid & Laminating',
    fullTitle: 'Fotokopi, Print HVS, Selebaran Tasyakuran, Jilid & Laminating',
    subtitle: 'Fotokopi A4/F4, Selebaran Tasyakuran HVS, Jilid Lakban/Spiral/Hardcover & Laminating',
    orderCategory: 'Fotokopi, Jilid & Laminating',
    defaultUnit: 'Lembar',
    badgeText: 'Copy · Jilid · Laminating',
  },
  {
    id: 'ATK_RETAIL',
    shortTitle: '6. ATK & Perlengkapan',
    fullTitle: 'ATK & Perlengkapan (Terkoneksi Stok Barang)',
    subtitle: 'Kertas HVS, Pulpen, Map, Lakban, Amplop — Otomatis Potong Stok Gudang',
    orderCategory: 'Penjualan ATK',
    defaultUnit: 'Pcs',
    badgeText: 'Potong Stok Otomatis',
  },
  {
    id: 'JASA_IT_DESAIN',
    shortTitle: '7. Desain & PC/Laptop',
    fullTitle: 'Desain Grafis & Servis / Upgrade Storage PC & Laptop',
    subtitle: 'Desain Cetak + Instal Ulang / Upgrade & Ganti Storage SSD/HDD PC & Laptop',
    orderCategory: 'Jasa Desain & Servis IT',
    defaultUnit: 'Paket',
    badgeText: 'Desain & Servis IT',
  },
];

const INDOOR_HIRES_PRESETS = [
  {
    key: 'ritrama',
    sku: 'IND-VNL-RTR',
    label: 'Stiker Indoor Ritrama',
    fullName: 'Stiker Indoor Ritrama HiRes (Glossy/Doff)',
    defaultPrice: 65000,
    defaultCost: 25000,
    defaultJob: 'Stiker Indoor Ritrama HiRes (Glossy/Doff)',
  },
  {
    key: 'orajet',
    sku: 'IND-VNL-ORJ',
    label: 'Stiker Indoor Orajet',
    fullName: 'Stiker Indoor Orajet HiRes',
    defaultPrice: 70000,
    defaultCost: 28000,
    defaultJob: 'Stiker Indoor Orajet HiRes',
  },
  {
    key: 'inflex',
    sku: 'IND-VNL-INF',
    label: 'Stiker Indoor Inflex',
    fullName: 'Stiker Indoor Inflex HiRes',
    defaultPrice: 55000,
    defaultCost: 20000,
    defaultJob: 'Stiker Indoor Inflex HiRes',
  },
  {
    key: 'albatros',
    sku: 'IND-ALB-180',
    label: 'Albatros HiRes',
    fullName: 'Albatros Indoor HiRes 180gsm',
    defaultPrice: 60000,
    defaultCost: 22000,
    defaultJob: 'Albatros Indoor HiRes 180gsm',
  },
  {
    key: 'oneway',
    sku: 'IND-OWV-140',
    label: 'One Way Stiker',
    fullName: 'One Way Stiker / One Way Vision Indoor HiRes',
    defaultPrice: 80000,
    defaultCost: 32000,
    defaultJob: 'One Way Stiker / One Way Vision Indoor HiRes',
  },
];

const DESIGN_SERVICE_PRESETS = [
  {
    label: 'Desain Banner / Spanduk / Baliho',
    jobTitle: 'Desain Banner / Spanduk / Baliho',
    materialName: 'Desain & Setting Layout Siap Cetak',
    price: 35000,
    notes: 'Desain custom dari nol sesuai konsep pelanggan',
  },
  {
    label: 'Desain Stiker Label & Pola DieCut A3+',
    jobTitle: 'Desain Stiker Label & Pola DieCut A3+',
    materialName: 'Desain Grafis & Pola Potong',
    price: 30000,
    notes: 'Desain label produk + garis pola potong mesin',
  },
  {
    label: 'Desain Brosur / Flyer / Daftar Menu',
    jobTitle: 'Desain Brosur / Flyer / Daftar Menu',
    materialName: 'Desain Grafis & Layout',
    price: 75000,
    notes: 'Desain layout full color siap cetak',
  },
  {
    label: 'Desain Logo & Identitas Usaha',
    jobTitle: 'Desain Logo & Identitas Usaha',
    materialName: 'Desain Grafis Master Vector',
    price: 150000,
    notes: 'Termasuk file master cetak & format PNG transparan',
  },
  {
    label: 'Setting Ulang / Trace File Pecah',
    jobTitle: 'Setting Ulang / Trace File Pecah',
    materialName: 'Pracetak & Setting File',
    price: 20000,
    notes: 'Perbaikan resolusi / ukuran file sebelum naik cetak',
  },
];

const IT_SERVICE_PRESETS = [
  {
    label: 'Instal Ulang Windows 10/11 + Aplikasi',
    jobTitle: 'Instal Ulang Windows 10/11 + Aplikasi',
    materialName: 'Instalasi Software PC/Laptop',
    price: 100000,
    finishingDesc: 'Full Driver + MS Office + Aplikasi Standar',
  },
  {
    label: 'Upgrade / Ganti Storage + Cloning OS',
    jobTitle: 'Upgrade / Ganti Storage SSD/HDD PC & Laptop + Cloning OS',
    materialName: 'Bongkar Pasang Storage & Migrasi Sistem',
    price: 75000,
    finishingDesc: 'Pasang Storage Baru + Copy/Cloning Data & Windows',
  },
  {
    label: 'Ganti Storage + Instal Ulang Full',
    jobTitle: 'Ganti Storage PC/Laptop + Instal Ulang Windows Baru',
    materialName: 'Pasang Storage & Instalasi OS',
    price: 125000,
    finishingDesc: 'Pasang SSD/HDD + Partisi + Instal Windows & Aplikasi',
  },
  {
    label: 'Cleaning Fan + Ganti Thermal Paste',
    jobTitle: 'Cleaning Kipas Heatsink & Ganti Thermal Paste Laptop/PC',
    materialName: 'Perawatan Hardware PC/Laptop',
    price: 85000,
    finishingDesc: 'Pembersihan debu + pasta prosesor baru',
  },
  {
    label: 'Backup & Pindah Data Storage Lama',
    jobTitle: 'Backup & Pindah Data Harddisk / SSD PC & Laptop',
    materialName: 'Penyelamatan & Transfer Data Storage',
    price: 100000,
    finishingDesc: 'Backup data penting ke storage baru',
  },
];

const PRODUCTION_STAGES: ProductionStatus[] = [
  'Antrean Desain',
  'Proses Cetak',
  'Finishing',
  'Siap Ambil',
  'Selesai',
  'Dibatalkan',
];

export const OrdersPosView: React.FC<OrdersPosViewProps> = ({
  orders,
  inventory,
  storeSettings = DEFAULT_STORE_SETTINGS,
  paperSize,
  onChangePaperSize,
  activeCashierName,
  cashierList,
  onChangeActiveCashier,
  onAddCashierName,
  onRemoveCashierName,
  onCreateOrder,
  onCreateInventoryItem,
  onUpdateInventoryItem,
  onUpdateProductionStatus,
  onSettleOrderPayment,
  onDeleteOrder,
  onOpenPrintModal,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Quick Add New Stock Item directly from Kasir (for ATK, Indoor HiRes, or Storage IT)
  const [showQuickStockAdd, setShowQuickStockAdd] = useState(false);
  const [quickStockName, setQuickStockName] = useState('');
  const [quickStockCategory, setQuickStockCategory] =
    useState<InventoryCategory>('ATK & Perlengkapan');
  const [quickStockUnit, setQuickStockUnit] = useState<InventoryUnit>('Pcs');
  const [quickStockQty, setQuickStockQtyState] = useState<number>(20);
  const [quickStockQtyInput, setQuickStockQtyInput] = useState<string>('20');
  const setQuickStockQty = (val: number) => {
    setQuickStockQtyState(val);
    setQuickStockQtyInput(String(val));
  };
  const [quickStockCost, setQuickStockCostState] = useState<number>(10000);
  const [quickStockCostInput, setQuickStockCostInput] = useState<string>('10000');
  const setQuickStockCost = (val: number) => {
    setQuickStockCostState(val);
    setQuickStockCostInput(String(val));
  };
  const [quickStockSellPrice, setQuickStockSellPriceState] = useState<number>(15000);
  const [quickStockSellPriceInput, setQuickStockSellPriceInput] = useState<string>('15000');
  const setQuickStockSellPrice = (val: number) => {
    setQuickStockSellPriceState(val);
    setQuickStockSellPriceInput(String(val));
  };
  const [isAddingQuickStock, setIsAddingQuickStock] = useState(false);
  const [posServiceTab, setPosServiceTab] = useState<PosServiceTabId>('OUTDOOR_BANNER');
  // Full-Screen POS Modal State (Khusus Penjualan ATK & Perlengkapan untuk Tablet & Desktop)
  const [isAtkFullscreenOpen, setIsAtkFullscreenOpen] = useState(false);
  const [isAtkFullscreenMinimized, setIsAtkFullscreenMinimized] = useState(false);
  const [isSyncingPresets, setIsSyncingPresets] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [afterSavePrintAction, setAfterSavePrintAction] = useState<
    'NONE' | 'INVOICE' | 'SPK' | 'DOWNLOAD_PNG' | 'SHARE_WA'
  >('INVOICE');

  // Cashier Quick-Add State in Kasir & SPK Menu
  const [showAddCashierBox, setShowAddCashierBox] = useState(false);
  const [newCashierNameInput, setNewCashierNameInput] = useState('');
  const [cashierFilter, setCashierFilter] = useState<string>('ALL');

  const handleQuickSaveCashier = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleaned = clampString(newCashierNameInput, 60, '');
    if (!cleaned) return;
    onAddCashierName(cleaned);
    setNewCashierNameInput('');
    setShowAddCashierBox(false);
  };

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [prodFilter, setProdFilter] = useState<string>('ALL');
  const [payFilter, setPayFilter] = useState<string>('ALL');

  // Settlement modal state
  const [settlingOrder, setSettlingOrder] = useState<PrintOrder | null>(null);
  const [settleAmount, setSettleAmountState] = useState<number>(0);
  const [settleAmountInput, setSettleAmountInput] = useState<string>('0');
  const setSettleAmount = (val: number) => {
    setSettleAmountState(val);
    setSettleAmountInput(String(val));
  };
  const [settleMethod, setSettleMethod] = useState<CashPaymentMethod>('Transfer Bank');
  const [settleBankChoice, setSettleBankChoice] = useState<string>('Bank BCA');
  const [settleCustomBank, setSettleCustomBank] = useState<string>('');
  const [settleTransferRef, setSettleTransferRef] = useState<string>('');

  // WhatsApp & PNG Share Modal State
  const [waModalOrder, setWaModalOrder] = useState<PrintOrder | null>(null);
  const [waPhoneInput, setWaPhoneInput] = useState<string>('');
  const [waTemplate, setWaTemplate] = useState<WhatsAppMessageTemplate>('INVOICE');
  const [waMessageText, setWaMessageText] = useState<string>('');
  const [waDocMode, setWaDocMode] = useState<'invoice' | 'spk'>('invoice');
  const [waPngPreviewUrl, setWaPngPreviewUrl] = useState<string>('');
  const [isGeneratingPng, setIsGeneratingPng] = useState<boolean>(false);
  const [waActionFeedback, setWaActionFeedback] = useState<string | null>(null);

  // New Order Form State
  const nextInvoiceNo = useMemo(() => {
    const seq = String(orders.length + 1).padStart(4, '0');
    const year = new Date().getFullYear();
    return `SPK-${year}-${seq}`;
  }, [orders.length]);

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [orderDate, setOrderDate] = useState(todayISO());
  const [deadlineDate, setDeadlineDate] = useState(todayISO());
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [category, setCategory] = useState<OrderCategory>('Banner & Outdoor');
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>(
    inventory[0]?.id || 'MANUAL'
  );
  const [customMaterialName, setCustomMaterialName] = useState('Flexi Frontlite 280gr');
  const [unitType, setUnitType] = useState<OrderUnitType>(
    (inventory[0]?.unit as OrderUnitType) || 'm2'
  );
  const [widthM, setWidthMState] = useState<number>(3);
  const [widthMInput, setWidthMInput] = useState<string>('3');
  const setWidthM = (val: number) => {
    setWidthMState(val);
    setWidthMInput(String(val));
  };
  const [heightM, setHeightMState] = useState<number>(1);
  const [heightMInput, setHeightMInput] = useState<string>('1');
  const setHeightM = (val: number) => {
    setHeightMState(val);
    setHeightMInput(String(val));
  };
  const [qty, setQtyState] = useState<number>(1);
  const [qtyInput, setQtyInput] = useState<string>('1');
  const setQty = (val: number) => {
    setQtyState(val);
    setQtyInput(String(val));
  };
  const initialSellPrice = inventory[0]?.defaultSellPrice || 22000;
  const initialCostPrice = inventory[0]?.costPerUnit || 8500;
  const [unitPrice, setUnitPriceState] = useState<number>(initialSellPrice);
  const [unitPriceInput, setUnitPriceInput] = useState<string>(String(initialSellPrice));
  const setUnitPrice = (val: number) => {
    setUnitPriceState(val);
    setUnitPriceInput(String(val));
  };
  const [unitCost, setUnitCostState] = useState<number>(initialCostPrice);
  const [unitCostInput, setUnitCostInput] = useState<string>(String(initialCostPrice));
  const setUnitCost = (val: number) => {
    setUnitCostState(val);
    setUnitCostInput(String(val));
  };
  const [designFee, setDesignFeeState] = useState<number>(0);
  const [designFeeInput, setDesignFeeInput] = useState<string>('0');
  const setDesignFee = (val: number) => {
    setDesignFeeState(val);
    setDesignFeeInput(String(val));
  };
  const [finishingDesc, setFinishingDesc] = useState<string>(
    'Siming Lipat pres gambar tanpa keling/mata ayam'
  );
  const [finishingFee, setFinishingFeeState] = useState<number>(0);
  const [finishingFeeInput, setFinishingFeeInput] = useState<string>('0');
  const setFinishingFee = (val: number) => {
    setFinishingFeeState(val);
    setFinishingFeeInput(String(val));
  };
  const [discount, setDiscountState] = useState<number>(0);
  const [discountInput, setDiscountInput] = useState<string>('0');
  const setDiscount = (val: number) => {
    setDiscountState(val);
    setDiscountInput(String(val));
  };
  const [paymentTypeChoice, setPaymentTypeChoice] = useState<'LUNAS' | 'DP' | 'TEMPO'>('LUNAS');
  const [dpAmount, setDpAmountState] = useState<number>(0);
  const [dpAmountInput, setDpAmountInput] = useState<string>('0');
  const setDpAmount = (val: number) => {
    setDpAmountState(val);
    setDpAmountInput(String(val));
  };

  // Helper agar kolom angka (HPP, Harga Jual, Qty, dll.) bisa dihapus dengan Backspace/Delete,
  // bisa di-nol-kan, dan tidak menyisakan angka 0 di depan saat diketik manual.
  const handleCleanNumberChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setStr: (s: string) => void,
    setNum: (n: number) => void,
    allowDecimal = false
  ) => {
    const raw = e.target.value;
    if (raw === '') {
      setStr('');
      setNum(0);
      return;
    }
    const normalized = allowDecimal
      ? raw.replace(/^0+(?=\d)/, '')
      : raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
    if (e.target.value !== normalized) {
      e.target.value = normalized;
    }
    if (normalized === '') {
      setStr('');
      setNum(0);
      return;
    }
    const parsed = allowDecimal ? parseFloat(normalized) : parseInt(normalized, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      setStr('');
      setNum(0);
      return;
    }
    setStr(allowDecimal ? normalized : String(parsed));
    setNum(parsed);
  };
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Tunai');
  const [selectedBankName, setSelectedBankName] = useState<string>('Bank BCA');
  const [customBankName, setCustomBankName] = useState<string>('');
  const [bankTransferRef, setBankTransferRef] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [deductStock, setDeductStock] = useState<boolean>(true);
  const [recordCashTx, setRecordCashTx] = useState<boolean>(true);

  const effectiveBankName =
    selectedBankName === 'MANUAL_BANK'
      ? customBankName.trim() || 'Bank Transfer'
      : selectedBankName;

  const openWhatsAppAndPngModal = async (
    targetOrder: PrintOrder,
    initialMode: 'invoice' | 'spk' = 'invoice'
  ) => {
    setWaModalOrder(targetOrder);
    setWaDocMode(initialMode);
    const defaultTpl: WhatsAppMessageTemplate =
      initialMode === 'spk'
        ? 'SPK_OPERATOR'
        : targetOrder.productionStatus === 'Siap Ambil'
        ? 'READY_PICKUP'
        : 'INVOICE';
    setWaTemplate(defaultTpl);
    setWaPhoneInput(formatWhatsAppPhone(targetOrder.customerPhone));
    setWaMessageText(
      buildWhatsAppOrderMessage(targetOrder, storeSettings, defaultTpl)
    );
    setWaActionFeedback(null);
    setIsGeneratingPng(true);
    try {
      const dataUrl = await generateOrderInvoicePngDataUrl(
        targetOrder,
        storeSettings,
        initialMode,
        paperSize
      );
      setWaPngPreviewUrl(dataUrl);
    } finally {
      setIsGeneratingPng(false);
    }
  };

  const handleQuickDownloadOrderPng = async (
    targetOrder: PrintOrder,
    docMode: 'invoice' | 'spk' = 'invoice',
    targetSize: PrintPaperSize = paperSize
  ) => {
    setIsGeneratingPng(true);
    try {
      const dataUrl = await generateOrderInvoicePngDataUrl(
        targetOrder,
        storeSettings,
        docMode,
        targetSize
      );
      const safeCust = (targetOrder.customerName || 'Pelanggan-Umum')
        .replace(/[^a-zA-Z0-9]/g, '-')
        .slice(0, 24);
      const prefix = docMode === 'spk' ? 'SPK' : 'Invoice';
      triggerDownloadPng(
        dataUrl,
        `${prefix}-${targetOrder.invoiceNumber}-${safeCust}.png`
      );
    } finally {
      setIsGeneratingPng(false);
    }
  };

  // Checklist Finishing Khusus Lembar A3+ / Plano & Tambahan Harga Otomatis (hanya aktif di Tab Print A3+)
  const [a3BolakBalik, setA3BolakBalik] = useState<boolean>(false);
  const [a3SatuMuka, setA3SatuMuka] = useState<boolean>(false);
  const [a3LaminasiGlossy, setA3LaminasiGlossy] = useState<boolean>(false);
  const [a3LaminasiDoff, setA3LaminasiDoff] = useState<boolean>(false);
  const [a3LaminasiBolakBalik, setA3LaminasiBolakBalik] = useState<boolean>(false);
  const [a3PotongSisiRapi, setA3PotongSisiRapi] = useState<boolean>(false);
  const [a3PotongDieCut, setA3PotongDieCut] = useState<boolean>(false);
  const [a3PotongKissCut, setA3PotongKissCut] = useState<boolean>(false);

  // Keranjang Multi-Produk dalam 1 Nota / SPK
  const [cartItems, setCartItems] = useState<OrderCartItem[]>([]);
  const [cartNotice, setCartNotice] = useState<string | null>(null);
  const [lastCreatedAtkOrder, setLastCreatedAtkOrder] = useState<PrintOrder | null>(
    null
  );

  const ensureLembarUnitActive = () => {
    if (unitType !== 'Lembar') {
      setUnitType('Lembar');
      if (finishingDesc === 'Mata ayam pojok') {
        setFinishingDesc('');
      }
    }
  };

  const handleMaterialChange = (matId: string) => {
    setSelectedMaterialId(matId);
    const found = inventory.find((i) => i.id === matId);
    if (found) {
      const mappedUnit: OrderUnitType =
        found.unit === 'm2' ||
        found.unit === 'Lembar' ||
        found.unit === 'Roll' ||
        found.unit === 'Pcs'
          ? (found.unit as OrderUnitType)
          : 'Paket';
      setUnitType(mappedUnit);
      setUnitPrice(found.defaultSellPrice);
      setUnitCost(found.costPerUnit);
      setJobTitle(found.name);
      if (mappedUnit === 'Lembar' && finishingDesc === 'Mata ayam pojok') {
        setFinishingDesc('');
      }
      if (posServiceTab === 'ATK_RETAIL') {
        setFinishingDesc('');
      }
    }
  };

  const handleQuickCreateStockItem = async () => {
    if (!onCreateInventoryItem || !quickStockName.trim()) return;
    setIsAddingQuickStock(true);
    try {
      const autoSku = generateNextAtkSku(inventory, quickStockCategory);
      await onCreateInventoryItem({
        sku: autoSku,
        name: quickStockName.trim(),
        category: quickStockCategory,
        unit: quickStockUnit,
        stockQty: Math.max(1, Number(quickStockQty) || 1),
        minStockQty: 5,
        costPerUnit: Math.max(0, Number(quickStockCost) || 0),
        defaultSellPrice: Math.max(0, Number(quickStockSellPrice) || 0),
        supplierName: 'Supplier Toko / Distributor',
        location:
          quickStockCategory === 'ATK & Perlengkapan'
            ? 'Etalase Kasir ATK'
            : quickStockCategory === 'Part & Storage IT'
            ? 'Etalase Servis IT'
            : 'Rak Bahan Indoor',
      });
      setQuickStockName('');
      setShowQuickStockAdd(false);
    } finally {
      setIsAddingQuickStock(false);
    }
  };

  const resetA3Checkboxes = () => {
    setA3BolakBalik(false);
    setA3SatuMuka(false);
    setA3LaminasiGlossy(false);
    setA3LaminasiDoff(false);
    setA3LaminasiBolakBalik(false);
    setA3PotongSisiRapi(false);
    setA3PotongDieCut(false);
    setA3PotongKissCut(false);
  };

  const handleSelectPosServiceTab = (tabId: PosServiceTabId) => {
    setPosServiceTab(tabId);
    setShowForm(true);
    const tabCfg = POS_SERVICE_TABS.find((t) => t.id === tabId);
    if (!tabCfg) return;

    setCategory(tabCfg.orderCategory);
    setUnitType(tabCfg.defaultUnit);

    if (tabId !== 'PRINT_A3') {
      resetA3Checkboxes();
    } else {
      setA3SatuMuka(true);
    }

    if (tabId === 'OUTDOOR_BANNER') {
      const outMat = inventory.find((i) => i.category === 'Bahan Outdoor');
      if (outMat) {
        handleMaterialChange(outMat.id);
        setJobTitle(outMat.name);
      } else {
        setSelectedMaterialId('MANUAL');
        setCustomMaterialName('Flexi Frontlite China 280gr');
        setJobTitle('Flexi Frontlite China 280gr');
        setUnitType('m2');
        setUnitPrice(22000);
        setUnitCost(8500);
      }
      setFinishingDesc('Siming Lipat pres gambar tanpa keling/mata ayam');
      setFinishingFee(0);
    } else if (tabId === 'INDOOR_HIRES') {
      const indMat =
        inventory.find(
          (i) =>
            i.category === 'Bahan Indoor & Sticker' ||
            i.name.toLowerCase().includes('ritrama') ||
            i.name.toLowerCase().includes('orajet') ||
            i.name.toLowerCase().includes('inflex') ||
            i.name.toLowerCase().includes('albatros') ||
            i.name.toLowerCase().includes('one way')
        );
      if (indMat) {
        handleMaterialChange(indMat.id);
        setJobTitle(indMat.name);
      } else {
        setSelectedMaterialId('MANUAL');
        setCustomMaterialName('Stiker Indoor Ritrama HiRes (Glossy/Doff)');
        setJobTitle('Stiker Indoor Ritrama HiRes (Glossy/Doff)');
        setUnitType('m2');
        setUnitPrice(65000);
        setUnitCost(25000);
      }
      setFinishingDesc('Laminasi Dingin Glossy / Standar');
      setFinishingFee(0);
    } else if (tabId === 'PRINT_A3') {
      const a3Mat = inventory.find((i) => i.category === 'Kertas A3+ & Media');
      if (a3Mat) {
        handleMaterialChange(a3Mat.id);
        setJobTitle(a3Mat.name);
      } else {
        setSelectedMaterialId('MANUAL');
        setCustomMaterialName('Stiker Vinyl / Chromo A3+');
        setJobTitle('Stiker Vinyl / Chromo A3+');
        setUnitType('Lembar');
        setUnitPrice(9000);
        setUnitCost(2500);
      }
      setFinishingDesc('');
      setFinishingFee(0);
    } else if (tabId === 'PRINT_OFFSET') {
      setSelectedMaterialId('MANUAL');
      setCustomMaterialName('Blangko Undangan / Kertas NCR / Art Paper');
      setJobTitle('Undangan Blangko (Erba/Cantik/Byar/Hepi)');
      setUnitType('Pcs');
      setUnitPrice(2000);
      setUnitCost(900);
      setFinishingDesc('Lipat Rapi + Plastik OPP + Label Nama');
      setFinishingFee(0);
    } else if (tabId === 'FOTOKOPI_JILID') {
      setSelectedMaterialId('MANUAL');
      setCustomMaterialName('Kertas HVS A4/F4 75gr');
      setJobTitle('Fotokopi HVS A4/F4 Hitam Putih');
      setUnitType('Lembar');
      setUnitPrice(500);
      setUnitCost(200);
      setDesignFee(0);
      setFinishingDesc('');
      setFinishingFee(0);
    } else if (tabId === 'ATK_RETAIL') {
      setSelectedMaterialId('MANUAL');
      setCustomMaterialName('');
      setJobTitle('');
      setUnitType('Pcs');
      setQty(0);
      setUnitPrice(0);
      setUnitCost(0);
      setDesignFee(0);
      setFinishingDesc('');
      setFinishingFee(0);
      setDeductStock(true);
      if (typeof window !== 'undefined' && window.innerWidth >= 768) {
        setIsAtkFullscreenOpen(true);
        setIsAtkFullscreenMinimized(false);
      }
    } else if (tabId === 'JASA_IT_DESAIN') {
      setSelectedMaterialId('MANUAL');
      setCustomMaterialName('Desain Grafis / Servis PC & Laptop');
      setJobTitle('Desain Banner / Spanduk / Baliho');
      setUnitType('Paket');
      setQty(1);
      setUnitPrice(50000);
      setUnitCost(0);
      setDesignFee(0);
      setFinishingDesc('');
      setFinishingFee(0);
    }
  };

  const handleSelectIndoorHiResPreset = (
    preset: (typeof INDOOR_HIRES_PRESETS)[number]
  ) => {
    setCategory('Indoor & Sticker');
    setUnitType('m2');
    const matched = inventory.find(
      (i) =>
        i.sku === preset.sku ||
        i.name.toLowerCase().includes(preset.key)
    );
    if (matched) {
      handleMaterialChange(matched.id);
      setJobTitle(matched.name);
    } else {
      setSelectedMaterialId('MANUAL');
      setCustomMaterialName(preset.fullName);
      setUnitPrice(preset.defaultPrice);
      setUnitCost(preset.defaultCost);
      setJobTitle(preset.defaultJob);
    }
  };

  const handleSyncMissingPresetsToInventory = async (
    group: 'INDOOR' | 'ATK' | 'IT'
  ) => {
    if (!onCreateInventoryItem) return;
    setIsSyncingPresets(true);
    try {
      const itemsToCreate: Array<
        Omit<InventoryItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
      > =
        group === 'INDOOR'
          ? [
              {
                sku: 'IND-VNL-RTR',
                name: 'Stiker Indoor Ritrama HiRes (Glossy/Doff)',
                category: 'Bahan Indoor & Sticker',
                unit: 'm2',
                stockQty: 100,
                minStockQty: 30,
                costPerUnit: 25000,
                defaultSellPrice: 65000,
                supplierName: 'Supplier Bahan Indoor',
                location: 'Rak Roll Indoor B-01',
              },
              {
                sku: 'IND-VNL-ORJ',
                name: 'Stiker Indoor Orajet HiRes',
                category: 'Bahan Indoor & Sticker',
                unit: 'm2',
                stockQty: 80,
                minStockQty: 30,
                costPerUnit: 28000,
                defaultSellPrice: 70000,
                supplierName: 'Supplier Bahan Indoor',
                location: 'Rak Roll Indoor B-02',
              },
              {
                sku: 'IND-VNL-INF',
                name: 'Stiker Indoor Inflex HiRes',
                category: 'Bahan Indoor & Sticker',
                unit: 'm2',
                stockQty: 100,
                minStockQty: 30,
                costPerUnit: 20000,
                defaultSellPrice: 55000,
                supplierName: 'Supplier Bahan Indoor',
                location: 'Rak Roll Indoor B-03',
              },
              {
                sku: 'IND-ALB-180',
                name: 'Albatros Indoor HiRes 180gsm',
                category: 'Bahan Indoor & Sticker',
                unit: 'm2',
                stockQty: 60,
                minStockQty: 20,
                costPerUnit: 22000,
                defaultSellPrice: 60000,
                supplierName: 'Supplier Bahan Indoor',
                location: 'Rak Roll Indoor B-04',
              },
              {
                sku: 'IND-OWV-140',
                name: 'One Way Stiker / One Way Vision Indoor HiRes',
                category: 'Bahan Indoor & Sticker',
                unit: 'm2',
                stockQty: 60,
                minStockQty: 20,
                costPerUnit: 32000,
                defaultSellPrice: 80000,
                supplierName: 'Supplier Bahan Indoor',
                location: 'Rak Roll Indoor B-05',
              },
            ]
          : group === 'ATK'
          ? [
              {
                sku: 'ATK-HVS4-107',
                name: 'Kertas HVS A4 75gr SiDU (1 Rim)',
                category: 'ATK & Perlengkapan',
                unit: 'Pack',
                stockQty: 40,
                minStockQty: 10,
                costPerUnit: 42000,
                defaultSellPrice: 55000,
                supplierName: 'Grosir ATK',
                location: 'Etalase ATK',
              },
              {
                sku: 'ATK-PEN7-204',
                name: 'Pulpen Standard AE7 Hitam',
                category: 'ATK & Perlengkapan',
                unit: 'Pcs',
                stockQty: 120,
                minStockQty: 24,
                costPerUnit: 1800,
                defaultSellPrice: 3500,
                supplierName: 'Grosir ATK',
                location: 'Etalase ATK',
              },
              {
                sku: 'ATK-MAPL-301',
                name: 'Map Plastik L / Clear Holder Dokumen',
                category: 'ATK & Perlengkapan',
                unit: 'Pcs',
                stockQty: 80,
                minStockQty: 20,
                costPerUnit: 2000,
                defaultSellPrice: 4000,
                supplierName: 'Grosir ATK',
                location: 'Etalase ATK',
              },
              {
                sku: 'ATK-LKB2-408',
                name: 'Lakban Bening / Coklat 2 Inch',
                category: 'ATK & Perlengkapan',
                unit: 'Roll',
                stockQty: 36,
                minStockQty: 10,
                costPerUnit: 11000,
                defaultSellPrice: 16000,
                supplierName: 'Grosir ATK',
                location: 'Etalase ATK',
              },
            ]
          : [
              {
                sku: 'IT-SSD-256',
                name: 'SSD SATA 2.5" 256GB (Upgrade Storage PC/Laptop)',
                category: 'Part & Storage IT',
                unit: 'Pcs',
                stockQty: 8,
                minStockQty: 2,
                costPerUnit: 285000,
                defaultSellPrice: 395000,
                supplierName: 'Distributor Komputer',
                location: 'Etalase IT & Storage',
              },
              {
                sku: 'IT-NVME-512',
                name: 'SSD M.2 NVMe 512GB (Upgrade Storage PC/Laptop)',
                category: 'Part & Storage IT',
                unit: 'Pcs',
                stockQty: 6,
                minStockQty: 2,
                costPerUnit: 520000,
                defaultSellPrice: 680000,
                supplierName: 'Distributor Komputer',
                location: 'Etalase IT & Storage',
              },
              {
                sku: 'IT-CAD-95',
                name: 'HDD Caddy / Enclosure USB 3.0 External',
                category: 'Part & Storage IT',
                unit: 'Pcs',
                stockQty: 10,
                minStockQty: 3,
                costPerUnit: 45000,
                defaultSellPrice: 85000,
                supplierName: 'Distributor Komputer',
                location: 'Etalase IT & Storage',
              },
            ];

      for (const candidate of itemsToCreate) {
        const exists = inventory.some(
          (inv) =>
            inv.sku.toLowerCase() === candidate.sku.toLowerCase() ||
            inv.name.toLowerCase() === candidate.name.toLowerCase()
        );
        if (!exists) {
          await onCreateInventoryItem(candidate);
        }
      }
      setCartNotice(
        'Item katalog berhasil disinkronkan ke Stok Gudang dan siap digunakan di Kasir.'
      );
    } finally {
      setIsSyncingPresets(false);
    }
  };

  const hasAnyA3ChecklistSelected =
    a3BolakBalik ||
    a3LaminasiGlossy ||
    a3LaminasiDoff ||
    a3PotongSisiRapi ||
    a3PotongDieCut ||
    a3PotongKissCut ||
    (unitType === 'Lembar' && a3SatuMuka);

  const isA3SheetMode =
    posServiceTab === 'PRINT_A3' &&
    (category === 'Print A3+ & Dokumen' ||
      unitType === 'Lembar' ||
      hasAnyA3ChecklistSelected);

  // Automatic calculation for Digital Printing dimensions, Banner Finishing Allowances, A3+ Finishing & COGS
  const calculated = useMemo(() => {
    const w = unitType === 'm2' ? Math.max(0.01, Number(widthM) || 0) : 0;
    const h = unitType === 'm2' ? Math.max(0.01, Number(heightM) || 0) : 0;
    const q = Math.max(0, Number(qty) || 0);
    const bannerDims = calculateBannerEffectiveDimensions({
      unitType,
      widthM: w,
      heightM: h,
      qty: q,
      finishingDesc,
    });
    const totalAreaOrQty =
      unitType === 'm2' ? bannerDims.effectiveArea : q;
    const baseSubtotal = Math.round(totalAreaOrQty * (Number(unitPrice) || 0));

    // Kalkulasi harga otomatis pilihan checklist Lembar A3+ (Harga Per Lembar × Jumlah Lembar)
    const qtyMult = q;
    const qtySuffix = qtyMult > 1 ? ` × ${qtyMult} Lembar` : ' / Lembar';
    const lamSidesMult = a3LaminasiBolakBalik ? 2 : 1;

    const bolakBalikFee =
      isA3SheetMode && a3BolakBalik ? Math.round(baseSubtotal * 0.5) : 0;
    const laminasiGlossyFee =
      isA3SheetMode && a3LaminasiGlossy ? 3000 * lamSidesMult * qtyMult : 0;
    const laminasiDoffFee =
      isA3SheetMode && a3LaminasiDoff ? 3000 * lamSidesMult * qtyMult : 0;
    const dieCutFee =
      isA3SheetMode && a3PotongDieCut ? 3000 * qtyMult : 0;
    const kissCutFee =
      isA3SheetMode && a3PotongKissCut ? 3000 * qtyMult : 0;

    const a3AutoFinishingFee =
      bolakBalikFee +
      laminasiGlossyFee +
      laminasiDoffFee +
      dieCutFee +
      kissCutFee;

    const a3BreakdownItems: { label: string; amount: number }[] = [];
    const a3DescParts: string[] = [];

    if (isA3SheetMode) {
      if (a3BolakBalik) {
        a3DescParts.push('Print Bolak Balik (+50%)');
        a3BreakdownItems.push({
          label:
            qtyMult > 1
              ? `Print Bolak Balik (+50% harga cetak × ${qtyMult} Lembar)`
              : 'Print Bolak Balik (+50% dari harga total cetak)',
          amount: bolakBalikFee,
        });
      } else if (a3SatuMuka) {
        a3DescParts.push('1 Muka');
        a3BreakdownItems.push({
          label: 'Sisi Cetak: 1 Muka',
          amount: 0,
        });
      }

      if (a3LaminasiGlossy) {
        if (a3LaminasiBolakBalik) {
          a3DescParts.push('Laminasi Glossy Bolak Balik (2x Rp 3.000)');
          a3BreakdownItems.push({
            label: `Laminasi Glossy Bolak Balik (2× Rp 3.000${qtySuffix})`,
            amount: laminasiGlossyFee,
          });
        } else {
          a3DescParts.push('Laminasi Glossy 1 Muka (Rp 3.000)');
          a3BreakdownItems.push({
            label: `Laminasi Glossy 1 Muka (Rp 3.000${qtySuffix})`,
            amount: laminasiGlossyFee,
          });
        }
      }

      if (a3LaminasiDoff) {
        if (a3LaminasiBolakBalik) {
          a3DescParts.push('Laminasi Doff Bolak Balik (2x Rp 3.000)');
          a3BreakdownItems.push({
            label: `Laminasi Doff Bolak Balik (2× Rp 3.000${qtySuffix})`,
            amount: laminasiDoffFee,
          });
        } else {
          a3DescParts.push('Laminasi Doff 1 Muka (Rp 3.000)');
          a3BreakdownItems.push({
            label: `Laminasi Doff 1 Muka (Rp 3.000${qtySuffix})`,
            amount: laminasiDoffFee,
          });
        }
      }

      if (a3PotongSisiRapi) {
        a3DescParts.push('Potong Sisi Rapi');
        a3BreakdownItems.push({
          label: 'Potong Sisi Rapi',
          amount: 0,
        });
      }

      if (a3PotongDieCut) {
        a3DescParts.push('Potong Mesin Putus Sesuai Pola (DieCut)');
        a3BreakdownItems.push({
          label: `Potong Mesin Putus Sesuai Pola (DieCut) (Rp 3.000${qtySuffix})`,
          amount: dieCutFee,
        });
      }

      if (a3PotongKissCut) {
        a3DescParts.push('Potong Mesin Setengah Putus Sesuai Pola (Kiss Cut)');
        a3BreakdownItems.push({
          label: `Potong Mesin Setengah Putus Sesuai Pola (Kiss Cut) (Rp 3.000${qtySuffix})`,
          amount: kissCutFee,
        });
      }

      if (q > 1 && (a3LaminasiGlossy || a3LaminasiDoff || a3PotongDieCut || a3PotongKissCut)) {
        a3DescParts.push('[xQty]');
      }
    }

    const manualExtraDesc = finishingDesc.trim();
    const effectiveFinishingDesc = isA3SheetMode
      ? [
          ...a3DescParts,
          manualExtraDesc && manualExtraDesc !== 'Mata ayam pojok' ? manualExtraDesc : '',
        ]
          .filter(Boolean)
          .join(', ')
      : manualExtraDesc;

    const effectiveFinishingFee = isA3SheetMode
      ? a3AutoFinishingFee + (Number(finishingFee) || 0)
      : Number(finishingFee) || 0;

    const currentItemSubtotal =
      baseSubtotal + (Number(designFee) || 0) + effectiveFinishingFee;
    const currentItemCogs = Math.round(totalAreaOrQty * (Number(unitCost) || 0));

    const hasDraftInForm = Boolean(jobTitle.trim());
    const includeCurrentFormInOrder = hasDraftInForm;

    const cartSumAmount = cartItems.reduce((acc, it) => acc + it.itemTotalAmount, 0);
    const cartSumCogs = cartItems.reduce((acc, it) => acc + it.itemTotalCogs, 0);
    const cartSumDesign = cartItems.reduce((acc, it) => acc + it.designFee, 0);
    const cartSumFinishing = cartItems.reduce((acc, it) => acc + it.finishingFee, 0);
    const cartTotalQty = cartItems.reduce((acc, it) => acc + (Number(it.qty) || 0), 0);

    const combinedGrossAmount =
      cartSumAmount + (includeCurrentFormInOrder ? currentItemSubtotal : 0);
    const rawTotalBeforeRounding = Math.max(
      0,
      combinedGrossAmount - (Number(discount) || 0)
    );
    const roundingInfo = roundFinalOrderAmount(rawTotalBeforeRounding);
    const totalAmount = roundingInfo.roundedTotal;
    const totalCogs =
      cartSumCogs + (includeCurrentFormInOrder ? currentItemCogs : 0);
    const estGrossProfit = totalAmount - totalCogs;

    let paidAmount = totalAmount;
    let paymentStatus: PaymentStatus = 'Lunas';
    let finalMethod: PaymentMethod = paymentMethod === 'Tempo' ? 'Tunai' : paymentMethod;

    if (paymentTypeChoice === 'DP') {
      paidAmount = Math.min(totalAmount, Math.max(0, Number(dpAmount) || 0));
      paymentStatus =
        paidAmount >= totalAmount
          ? 'Lunas'
          : paidAmount > 0
          ? 'DP / Belum Lunas'
          : 'Belum Bayar';
    } else if (paymentTypeChoice === 'TEMPO') {
      paidAmount = 0;
      paymentStatus = 'Belum Bayar';
      finalMethod = 'Tempo';
    }

    return {
      bannerDims,
      totalAreaOrQty,
      baseSubtotal,
      a3AutoFinishingFee,
      a3BreakdownItems,
      effectiveFinishingDesc,
      effectiveFinishingFee,
      currentItemSubtotal,
      currentItemCogs,
      cartSumAmount,
      cartSumCogs,
      cartSumDesign,
      cartSumFinishing,
      cartTotalQty,
      includeCurrentFormInOrder,
      rawTotalBeforeRounding,
      roundingInfo,
      totalAmount,
      totalCogs,
      estGrossProfit,
      paidAmount,
      paymentStatus,
      finalMethod,
    };
  }, [
    unitType,
    widthM,
    heightM,
    qty,
    unitPrice,
    unitCost,
    designFee,
    finishingFee,
    finishingDesc,
    discount,
    paymentTypeChoice,
    dpAmount,
    paymentMethod,
    isA3SheetMode,
    a3BolakBalik,
    a3SatuMuka,
    a3LaminasiGlossy,
    a3LaminasiDoff,
    a3LaminasiBolakBalik,
    a3PotongSisiRapi,
    a3PotongDieCut,
    a3PotongKissCut,
    cartItems,
    jobTitle,
  ]);

  const buildCurrentFormCartItem = (customTitle?: string): OrderCartItem => {
    const selectedMat = inventory.find((m) => m.id === selectedMaterialId);
    const matName = selectedMat
      ? selectedMat.name
      : customMaterialName || 'Bahan Cetak Manual';
    const cleanTitle = cleanProductJobTitle(customTitle || jobTitle) || matName;
    const isAtkSale =
      category === 'Penjualan ATK' || posServiceTab === 'ATK_RETAIL';
    const itemDesignFee = isAtkSale ? 0 : Number(designFee) || 0;
    const itemFinishingFee = isAtkSale ? 0 : calculated.effectiveFinishingFee;
    const itemFinishingDesc = isAtkSale ? '' : calculated.effectiveFinishingDesc;
    return {
      id: `cart_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      jobTitle: cleanTitle,
      category,
      materialId: selectedMat ? selectedMat.id : 'MANUAL',
      materialName: matName,
      unitType,
      widthM: unitType === 'm2' ? Number(widthM) || 1 : 0,
      heightM: unitType === 'm2' ? Number(heightM) || 1 : 0,
      qty: Math.max(1, Number(qty) || 1),
      totalAreaOrQty: calculated.totalAreaOrQty,
      unitPrice: Number(unitPrice) || 0,
      unitCost: Number(unitCost) || 0,
      baseSubtotal: calculated.baseSubtotal,
      designFee: itemDesignFee,
      finishingDesc: itemFinishingDesc,
      finishingFee: itemFinishingFee,
      itemTotalAmount: calculated.baseSubtotal + itemDesignFee + itemFinishingFee,
      itemTotalCogs: calculated.currentItemCogs,
    };
  };

  const resetProductFormFields = () => {
    setJobTitle('');
    setDesignFee(0);
    setFinishingFee(0);
    setA3BolakBalik(false);
    setA3SatuMuka(true);
    setA3LaminasiGlossy(false);
    setA3LaminasiDoff(false);
    setA3LaminasiBolakBalik(false);
    setA3PotongSisiRapi(false);
    setA3PotongDieCut(false);
    setA3PotongKissCut(false);
  };

  const handleAddToCart = () => {
    const titleClean = jobTitle.trim();
    if (!titleClean) {
      setCartNotice(
        'Mohon isi "Judul Pekerjaan / Nama File Cetak" terlebih dahulu sebelum menambahkan produk ke keranjang.'
      );
      return;
    }
    if ((Number(qty) || 0) <= 0) {
      setCartNotice(
        'Mohon isi "Jumlah (Qty)" minimal 1 terlebih dahulu sebelum menambahkan produk ke keranjang.'
      );
      return;
    }
    const newItem = buildCurrentFormCartItem(titleClean);
    const nextCart = [...cartItems, newItem];
    setCartItems(nextCart);
    resetProductFormFields();
    setCartNotice(
      `Produk "${newItem.jobTitle}" berhasil ditambahkan ke Keranjang (${nextCart.length} produk dalam 1 Nota/SPK). Silakan input produk berikutnya atau klik Simpan Pesanan.`
    );
  };

  const handleEditCartItem = (item: OrderCartItem) => {
    setCartItems((prev) => prev.filter((c) => c.id !== item.id));
    setJobTitle(item.jobTitle);
    setCategory(item.category);
    setSelectedMaterialId(item.materialId);
    if (item.materialId === 'MANUAL') {
      setCustomMaterialName(item.materialName);
    }
    setUnitType(item.unitType);
    setWidthM(item.widthM || 1);
    setHeightM(item.heightM || 1);
    setQty(item.qty || 1);
    setUnitPrice(item.unitPrice);
    setUnitCost(item.unitCost);
    setDesignFee(item.designFee);
    setFinishingDesc(item.finishingDesc);
    setFinishingFee(0);
    setA3BolakBalik(false);
    setA3SatuMuka(true);
    setA3LaminasiGlossy(false);
    setA3LaminasiDoff(false);
    setA3LaminasiBolakBalik(false);
    setA3PotongSisiRapi(false);
    setA3PotongDieCut(false);
    setA3PotongKissCut(false);
    setCartNotice(
      `Produk "${item.jobTitle}" dikembalikan ke form untuk diedit. Klik "+ Tambahkan ke Keranjang" setelah selesai mengubah.`
    );
  };

  const handleRemoveCartItem = (id: string) => {
    setCartItems((prev) => prev.filter((c) => c.id !== id));
  };

  // Handler khusus Kasir ATK: Tambah / Kurangi 1 Pcs langsung ke Keranjang Belanja ATK (dari Klik Grid / Scan Kamera / Barcode)
  const handleQuickAddAtkToCart = (item: InventoryItem, deltaQty = 1) => {
    if (!showForm) {
      setShowForm(true);
    }
    if (posServiceTab !== 'ATK_RETAIL') {
      setPosServiceTab('ATK_RETAIL');
      setCategory('Penjualan ATK');
    }

    const mappedUnit: OrderUnitType =
      item.unit === 'm2' ||
      item.unit === 'Lembar' ||
      item.unit === 'Roll' ||
      item.unit === 'Pcs'
        ? (item.unit as OrderUnitType)
        : 'Paket';

    // Clear form draft if it matches the default prefilled ATK item so it won't double-count
    if (jobTitle.trim()) {
      setJobTitle('');
    }

    setCartItems((prev) => {
      const existingIdx = prev.findIndex(
        (c) =>
          c.materialId === item.id ||
          (c.category === 'Penjualan ATK' && c.jobTitle === item.name)
      );

      if (existingIdx >= 0) {
        const current = prev[existingIdx];
        const nextQty = current.qty + deltaQty;
        if (nextQty <= 0) {
          return prev.filter((_, i) => i !== existingIdx);
        }
        const nextBase = Math.round(nextQty * current.unitPrice);
        const nextTotal =
          nextBase + (Number(current.designFee) || 0) + (Number(current.finishingFee) || 0);
        const nextCogs = Math.round(nextQty * current.unitCost);
        const updated = [...prev];
        updated[existingIdx] = {
          ...current,
          qty: nextQty,
          totalAreaOrQty: nextQty,
          baseSubtotal: nextBase,
          itemTotalAmount: nextTotal,
          itemTotalCogs: nextCogs,
        };
        return updated;
      }

      if (deltaQty <= 0) return prev;

      const addQty = Math.max(1, deltaQty);
      const baseSub = Math.round(addQty * item.defaultSellPrice);
      const cogsSub = Math.round(addQty * item.costPerUnit);
      const newCartItem: OrderCartItem = {
        id: `cart_atk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        jobTitle: cleanProductJobTitle(item.name),
        category: 'Penjualan ATK',
        materialId: item.id,
        materialName: cleanProductJobTitle(item.name),
        unitType: mappedUnit,
        widthM: 0,
        heightM: 0,
        qty: addQty,
        totalAreaOrQty: addQty,
        unitPrice: item.defaultSellPrice,
        unitCost: item.costPerUnit,
        baseSubtotal: baseSub,
        designFee: 0,
        finishingDesc: '',
        finishingFee: 0,
        itemTotalAmount: baseSub,
        itemTotalCogs: cogsSub,
      };
      return [...prev, newCartItem];
    });

    if (deltaQty > 0) {
      setCartNotice(
        `✅ [${item.sku}] ${item.name} (+${deltaQty} ${item.unit}) berhasil masuk ke Keranjang Belanja ATK.`
      );
    }
  };

  // Handler khusus Simpan & Cetak Struk ATK Instan (Direct Bluetooth / WebUSB / Smart Fallback)
  const handleInstantCheckoutAndPrintAtk = async (): Promise<PrintOrder | null> => {
    const finalCartItems: OrderCartItem[] = [...cartItems];
    if (finalCartItems.length === 0 && jobTitle.trim()) {
      finalCartItems.push(buildCurrentFormCartItem(jobTitle.trim()));
    }
    if (finalCartItems.length === 0) {
      setCartNotice('Keranjang ATK masih kosong. Silakan pilih atau scan produk ATK terlebih dahulu.');
      return null;
    }

    setIsSubmitting(true);
    try {
      const combinedNotesWithBank = buildOrderNotesWithBankTransfer(
        notes,
        calculated.finalMethod,
        effectiveBankName,
        bankTransferRef
      );
      const sanitizedAtkCartItems: OrderCartItem[] = finalCartItems.map((it) => ({
        ...it,
        jobTitle: cleanProductJobTitle(it.jobTitle),
        materialName: cleanProductJobTitle(it.materialName),
        designFee: 0,
        finishingDesc: '',
        finishingFee: 0,
      }));
      const primaryItem = sanitizedAtkCartItems[0];
      const isMultiItem = sanitizedAtkCartItems.length > 1;

      const summaryJobTitle = isMultiItem
        ? clampString(
            sanitizedAtkCartItems.map((it, idx) => `${idx + 1}. ${it.jobTitle}`).join(' | '),
            160,
            primaryItem.jobTitle
          )
        : primaryItem.jobTitle;

      const summaryMaterialName = isMultiItem
        ? clampString(
            Array.from(new Set(sanitizedAtkCartItems.map((it) => it.materialName))).join(', '),
            120,
            primaryItem.materialName
          )
        : primaryItem.materialName;

      const totalGross = sanitizedAtkCartItems.reduce(
        (acc, it) => acc + (Number(it.itemTotalAmount) || 0),
        0
      );
      const rawTotalBeforeRounding = Math.max(0, totalGross - (Number(discount) || 0));
      const finalRoundingInfo = roundFinalOrderAmount(rawTotalBeforeRounding);
      const finalTotalAmount = finalRoundingInfo.roundedTotal;
      const finalTotalCogs = sanitizedAtkCartItems.reduce(
        (acc, it) => acc + (Number(it.itemTotalCogs) || 0),
        0
      );

      let finalPaidAmount = finalTotalAmount;
      let finalPayStatus: PaymentStatus = 'Lunas';
      let finalPayMethod: PaymentMethod =
        paymentMethod === 'Tempo' ? 'Tunai' : paymentMethod;

      if (paymentTypeChoice === 'DP') {
        finalPaidAmount = Math.min(
          finalTotalAmount,
          Math.max(0, Number(dpAmount) || 0)
        );
        finalPayStatus =
          finalPaidAmount >= finalTotalAmount
            ? 'Lunas'
            : finalPaidAmount > 0
            ? 'DP / Belum Lunas'
            : 'Belum Bayar';
      } else if (paymentTypeChoice === 'TEMPO') {
        finalPaidAmount = 0;
        finalPayStatus = 'Belum Bayar';
        finalPayMethod = 'Tempo';
      }

      const newOrderPayload: Omit<
        PrintOrder,
        'id' | 'ownerId' | 'createdAt' | 'updatedAt'
      > = {
        invoiceNumber: (invoiceNumber.trim() || nextInvoiceNo).toUpperCase(),
        orderDate,
        deadlineDate,
        customerName: customerName.trim() || 'Pelanggan Umum',
        customerPhone: customerPhone.trim(),
        jobTitle: summaryJobTitle,
        category: 'Penjualan ATK',
        materialId: primaryItem.materialId,
        materialName: summaryMaterialName,
        unitType: primaryItem.unitType,
        widthM: 0,
        heightM: 0,
        qty: sanitizedAtkCartItems.reduce((acc, it) => acc + it.qty, 0),
        totalAreaOrQty: sanitizedAtkCartItems.reduce((acc, it) => acc + it.totalAreaOrQty, 0),
        unitPrice: primaryItem.unitPrice,
        unitCost: primaryItem.unitCost,
        designFee: 0,
        finishingDesc: '',
        finishingFee: 0,
        discount: Number(discount) || 0,
        totalAmount: finalTotalAmount,
        totalCogs: finalTotalCogs,
        paidAmount: finalPaidAmount,
        paymentStatus: finalPayStatus,
        paymentMethod: finalPayMethod,
        productionStatus: 'Selesai',
        notes: combinedNotesWithBank,
        cashierName: clampString(
          activeCashierName || cashierList[0] || 'Admin Kasir',
          60,
          'Admin Kasir'
        ),
        ...(sanitizedAtkCartItems.length > 1
          ? { cartItemsJson: clampString(JSON.stringify(sanitizedAtkCartItems), 10000, '') }
          : {}),
      };

      const hasAnyStockMaterial = finalCartItems.some(
        (it) => it.materialId && it.materialId !== 'MANUAL'
      );

      const created = await onCreateOrder(
        newOrderPayload,
        deductStock && hasAnyStockMaterial,
        recordCashTx && finalPaidAmount > 0
      );

      const printableOrder: PrintOrder =
        created || {
          id: `temp_atk_${Date.now()}`,
          ownerId: '',
          ...newOrderPayload,
        };

      setLastCreatedAtkOrder(printableOrder);
      setCustomerName('');
      setCustomerPhone('');
      setJobTitle('');
      setInvoiceNumber('');
      setCartItems([]);
      setCartNotice(
        `Transaksi ATK #${printableOrder.invoiceNumber} (${formatIDR(
          printableOrder.totalAmount
        )}) berhasil disimpan.`
      );
      return printableOrder;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    const finalCartItems: OrderCartItem[] = [...cartItems];
    if (jobTitle.trim()) {
      if ((Number(qty) || 0) <= 0) {
        setCartNotice(
          'Mohon isi "Jumlah (Qty)" minimal 1 terlebih dahulu sebelum menyimpan pesanan.'
        );
        return;
      }
      finalCartItems.push(buildCurrentFormCartItem(jobTitle.trim()));
    }
    if (finalCartItems.length === 0) {
      setCartNotice(
        'Mohon isi minimal 1 produk cetakan atau tambahkan produk ke keranjang terlebih dahulu.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const combinedNotesWithBank = buildOrderNotesWithBankTransfer(
        notes,
        calculated.finalMethod,
        effectiveBankName,
        bankTransferRef
      );
      const primaryItem = finalCartItems[0];
      const isMultiItem = finalCartItems.length > 1;

      const summaryJobTitle = isMultiItem
        ? clampString(
            finalCartItems
              .map((it, idx) => `${idx + 1}. ${it.jobTitle}`)
              .join(' | '),
            160,
            primaryItem.jobTitle
          )
        : primaryItem.jobTitle;

      const summaryMaterialName = isMultiItem
        ? clampString(
            Array.from(new Set(finalCartItems.map((it) => it.materialName))).join(
              ', '
            ),
            120,
            primaryItem.materialName
          )
        : primaryItem.materialName;

      const summaryFinishingDesc =
        primaryItem.category === 'Penjualan ATK' &&
        finalCartItems.every((it) => it.category === 'Penjualan ATK')
          ? ''
          : isMultiItem
          ? clampString(
              finalCartItems
                .map((it, idx) =>
                  it.finishingDesc && it.category !== 'Penjualan ATK'
                    ? `[#${idx + 1}: ${it.finishingDesc}]`
                    : ''
                )
                .filter(Boolean)
                .join(' '),
              160,
              primaryItem.category === 'Penjualan ATK' ? '' : primaryItem.finishingDesc
            )
          : primaryItem.category === 'Penjualan ATK'
          ? ''
          : primaryItem.finishingDesc;

      const totalDesignFee = finalCartItems.reduce(
        (acc, it) =>
          acc + (it.category === 'Penjualan ATK' ? 0 : Number(it.designFee) || 0),
        0
      );
      const totalFinishingFee = finalCartItems.reduce(
        (acc, it) =>
          acc + (it.category === 'Penjualan ATK' ? 0 : Number(it.finishingFee) || 0),
        0
      );
      const totalGross = finalCartItems.reduce(
        (acc, it) => acc + (Number(it.itemTotalAmount) || 0),
        0
      );
      const rawTotalBeforeRounding = Math.max(0, totalGross - (Number(discount) || 0));
      const finalRoundingInfo = roundFinalOrderAmount(rawTotalBeforeRounding);
      const finalTotalAmount = finalRoundingInfo.roundedTotal;
      const finalTotalCogs = finalCartItems.reduce(
        (acc, it) => acc + (Number(it.itemTotalCogs) || 0),
        0
      );

      let finalPaidAmount = finalTotalAmount;
      let finalPayStatus: PaymentStatus = 'Lunas';
      let finalPayMethod: PaymentMethod =
        paymentMethod === 'Tempo' ? 'Tunai' : paymentMethod;

      if (paymentTypeChoice === 'DP') {
        finalPaidAmount = Math.min(
          finalTotalAmount,
          Math.max(0, Number(dpAmount) || 0)
        );
        finalPayStatus =
          finalPaidAmount >= finalTotalAmount
            ? 'Lunas'
            : finalPaidAmount > 0
            ? 'DP / Belum Lunas'
            : 'Belum Bayar';
      } else if (paymentTypeChoice === 'TEMPO') {
        finalPaidAmount = 0;
        finalPayStatus = 'Belum Bayar';
        finalPayMethod = 'Tempo';
      }

      const isInstantCompletedOrder = finalCartItems.every(
        (it) =>
          it.category === 'Penjualan ATK' ||
          it.category === 'Jasa Desain & Servis IT' ||
          it.category === 'Fotokopi, Jilid & Laminating'
      );

      const newOrderPayload: Omit<
        PrintOrder,
        'id' | 'ownerId' | 'createdAt' | 'updatedAt'
      > = {
        invoiceNumber: (invoiceNumber.trim() || nextInvoiceNo).toUpperCase(),
        orderDate,
        deadlineDate,
        customerName: customerName.trim() || 'Pelanggan Umum',
        customerPhone: customerPhone.trim(),
        jobTitle: summaryJobTitle,
        category: primaryItem.category,
        materialId: primaryItem.materialId,
        materialName: summaryMaterialName,
        unitType: primaryItem.unitType,
        widthM: primaryItem.widthM,
        heightM: primaryItem.heightM,
        qty: isMultiItem
          ? finalCartItems.reduce((acc, it) => acc + it.qty, 0)
          : primaryItem.qty,
        totalAreaOrQty: isMultiItem
          ? Number(
              finalCartItems
                .reduce((acc, it) => acc + it.totalAreaOrQty, 0)
                .toFixed(2)
            )
          : primaryItem.totalAreaOrQty,
        unitPrice: isMultiItem
          ? Math.round(
              finalCartItems.reduce((acc, it) => acc + it.baseSubtotal, 0) /
                Math.max(
                  1,
                  finalCartItems.reduce((acc, it) => acc + it.totalAreaOrQty, 0)
                )
            )
          : primaryItem.unitPrice,
        unitCost: primaryItem.unitCost,
        designFee: totalDesignFee,
        finishingDesc: summaryFinishingDesc,
        finishingFee: totalFinishingFee,
        discount: Number(discount) || 0,
        totalAmount: finalTotalAmount,
        totalCogs: finalTotalCogs,
        paidAmount: finalPaidAmount,
        paymentStatus: finalPayStatus,
        paymentMethod: finalPayMethod,
        productionStatus: isInstantCompletedOrder ? 'Selesai' : 'Antrean Desain',
        notes: combinedNotesWithBank,
        cashierName: clampString(
          activeCashierName || cashierList[0] || 'Admin Kasir',
          60,
          'Admin Kasir'
        ),
        ...(finalCartItems.length > 1
          ? { cartItemsJson: clampString(JSON.stringify(finalCartItems), 10000, '') }
          : {}),
      };

      const hasAnyStockMaterial = finalCartItems.some(
        (it) => it.materialId && it.materialId !== 'MANUAL'
      );

      const createdOrder = await onCreateOrder(
        newOrderPayload,
        deductStock && hasAnyStockMaterial,
        recordCashTx && finalPaidAmount > 0
      );
      setCustomerName('');
      setCustomerPhone('');
      setJobTitle('');
      setInvoiceNumber('');
      setBankTransferRef('');
      setNotes('');
      setCartItems([]);
      setCartNotice(null);
      setShowForm(false);

      if (afterSavePrintAction !== 'NONE') {
        const printableOrder: PrintOrder =
          createdOrder || {
            id: `temp_${Date.now()}`,
            ownerId: '',
            ...newOrderPayload,
          };
        if (afterSavePrintAction === 'DOWNLOAD_PNG') {
          await handleQuickDownloadOrderPng(printableOrder, 'invoice', paperSize);
        } else if (afterSavePrintAction === 'SHARE_WA') {
          await openWhatsAppAndPngModal(printableOrder, 'invoice');
        } else {
          onOpenPrintModal(
            printableOrder,
            afterSavePrintAction === 'SPK' ? 'spk' : 'invoice',
            paperSize
          );
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (categoryFilter !== 'ALL' && o.category !== categoryFilter) return false;
      if (prodFilter !== 'ALL' && o.productionStatus !== prodFilter) return false;
      if (payFilter !== 'ALL' && o.paymentStatus !== payFilter) return false;
      if (cashierFilter !== 'ALL' && (o.cashierName || 'Admin Kasir') !== cashierFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          o.invoiceNumber.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.jobTitle.toLowerCase().includes(q) ||
          o.materialName.toLowerCase().includes(q) ||
          (o.cashierName || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [orders, categoryFilter, prodFilter, payFilter, cashierFilter, searchQuery]);

  const handleConfirmSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlingOrder || settleAmount <= 0) return;
    setIsSubmitting(true);
    try {
      const chosenSettleBank =
        settleBankChoice === 'MANUAL_BANK'
          ? settleCustomBank.trim() || 'Bank Transfer'
          : settleBankChoice;
      const bankDetailStr =
        settleMethod === 'Transfer Bank'
          ? settleTransferRef.trim()
            ? `${chosenSettleBank} | ${settleTransferRef.trim()}`
            : chosenSettleBank
          : undefined;
      await onSettleOrderPayment(
        settlingOrder,
        settleAmount,
        settleMethod,
        bankDetailStr
      );
      setSettlingOrder(null);
      setSettleTransferRef('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Kasir Pesanan Cetak & Antrean SPK Produksi
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Kalkulator otomatis luas bahan (m² / lembar), HPP cetak, piutang DP pelanggan, dan cetak Surat Perintah Kerja.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setIsAtkFullscreenOpen(true);
              setIsAtkFullscreenMinimized(false);
            }}
            className="px-3.5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-600 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
            title="Buka Jendela Kasir ATK Layar Penuh / Full Screen (Desktop & Tablet)"
          >
            <Maximize2 className="w-3.5 h-3.5 text-emerald-200" />
            <span>Kasir ATK (Full Screen)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (posServiceTab === 'ATK_RETAIL' || category === 'Penjualan ATK') {
                if (typeof window !== 'undefined' && window.innerWidth >= 768) {
                  setIsAtkFullscreenOpen(true);
                  setIsAtkFullscreenMinimized(false);
                  return;
                }
              }
              if (!showForm && inventory.length > 0 && selectedMaterialId === 'MANUAL') {
                handleMaterialChange(inventory[0].id);
              }
              setShowForm(!showForm);
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            {showForm ? 'Tutup Form Kasir SPK' : 'Buat Pesanan Cetak (SPK Baru)'}
          </button>
        </div>
      </div>

      {/* Bar Kasir Bertugas: Pilih, Tambah & Simpan Nama Kasir yang Melakukan Transaksi */}
      <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-3 text-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <span className="font-bold text-slate-900">
                Kasir / Petugas SPK yang Melakukan Transaksi:
              </span>{' '}
              <span className="font-semibold text-emerald-700">
                {activeCashierName || cashierList[0] || 'Admin Kasir'}
              </span>
              <span className="text-slate-500 ml-1.5 hidden sm:inline">
                (Tercatat otomatis pada transaksi kasir, tabel SPK & cetakan Nota)
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {cashierList.map((cName) => {
              const isSelected = (activeCashierName || cashierList[0]) === cName;
              return (
                <div
                  key={cName}
                  className={`inline-flex items-center rounded-md border text-xs transition-colors ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onChangeActiveCashier(cName)}
                    className="px-2.5 py-1.5 whitespace-nowrap"
                  >
                    {cName}
                  </button>
                  {cashierList.length > 1 && !isSelected && (
                    <button
                      type="button"
                      onClick={() => onRemoveCashierName(cName)}
                      title={`Hapus kasir ${cName}`}
                      className="pr-2 pl-0.5 py-1.5 text-slate-400 hover:text-rose-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => setShowAddCashierBox(!showAddCashierBox)}
              className="px-2.5 py-1.5 rounded-md border border-dashed border-slate-300 text-slate-700 hover:border-slate-900 hover:text-slate-900 font-semibold flex items-center gap-1 whitespace-nowrap"
            >
              <UserPlus className="w-3.5 h-3.5" />
              {showAddCashierBox ? 'Tutup Input' : '+ Tambah & Simpan Kasir'}
            </button>
          </div>
        </div>

        {showAddCashierBox && (
          <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={newCashierNameInput}
              onChange={(e) => setNewCashierNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleQuickSaveCashier();
                }
              }}
              placeholder="Ketik nama kasir / admin SPK baru (misal: Siska - Kasir Pagi)..."
              className="flex-1 px-3 py-1.5 border border-slate-300 rounded-md text-xs focus:outline-none focus:border-slate-900"
            />
            <button
              type="button"
              onClick={() => handleQuickSaveCashier()}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-md flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Simpan Nama Kasir & Gunakan Sekarang
            </button>
          </div>
        )}
      </div>

      {/* Bar Pilihan Ukuran Kertas Cetak (Thermal 80mm, 100mm, A5 Landscape, A6 Landscape, 210x100mm) */}
      <div className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col xl:flex-row xl:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Printer className="w-4 h-4 text-slate-700 shrink-0" />
          <div>
            <span className="font-bold text-slate-900">
              Format Ukuran Cetak Nota Kasir & SPK:
            </span>{' '}
            <span className="text-slate-500">
              Pilih ukuran kertas printer sebelum menekan tombol cetak Nota atau SPK
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-500 mr-1 inline-flex items-center gap-1">
            <Receipt className="w-3.5 h-3.5" />
            Thermal:
          </span>
          {PRINT_PAPER_OPTIONS.filter((o) => o.group === 'THERMAL').map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChangePaperSize(opt.id)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap border ${
                paperSize === opt.id
                  ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {opt.name} <span className="opacity-75 font-mono text-[10px]">({opt.shortLabel})</span>
            </button>
          ))}

          <span className="text-slate-300 mx-1 hidden sm:inline">|</span>

          <span className="text-[11px] font-semibold text-slate-500 mr-1 inline-flex items-center gap-1">
            <Maximize2 className="w-3.5 h-3.5" />
            Invoice Besar:
          </span>
          {PRINT_PAPER_OPTIONS.filter((o) => o.group === 'LARGE_SHEET').map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChangePaperSize(opt.id)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap border ${
                paperSize === opt.id
                  ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {opt.name}{' '}
              <span className="opacity-75 font-mono text-[10px]">({opt.dimensions})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Bar 7 Sub-Tab Layanan Kasir & SPK */}
      <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-2.5 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="font-bold text-slate-900">
              Pilih Sub-Tab Layanan Kasir & SPK (7 Divisi Terintegrasi Stok & Keranjang):
            </span>{' '}
            <span className="text-slate-500">
              Klik salah satu tab di bawah untuk membuka kasir sesuai jenis pesanan (semua tab berbagi 1 Keranjang Nota yang sama)
            </span>
          </div>
          {cartItems.length > 0 && (
            <span className="px-2.5 py-1 bg-indigo-950 text-white font-mono font-bold rounded text-[11px] whitespace-nowrap">
              🛒 {cartItems.length} Item di Keranjang ({formatIDR(calculated.cartSumAmount)})
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2">
          {POS_SERVICE_TABS.map((tab) => {
            const isActive = showForm && posServiceTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectPosServiceTab(tab.id)}
                className={`p-2.5 rounded-lg border text-left transition-all flex flex-col justify-between gap-1 ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                }`}
              >
                <div className="font-bold text-xs leading-snug">{tab.shortTitle}</div>
                <div className="flex items-center justify-between gap-1 pt-1">
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      isActive
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                        : 'bg-white text-slate-600 border border-slate-200'
                    }`}
                  >
                    {tab.badgeText}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Form Input Kasir / SPK Baru */}
      <form
        onSubmit={handleSubmitOrder}
        className={`bg-white border border-slate-200 rounded-lg p-6 space-y-6 ${
          showForm ? 'block' : 'hidden'
        }`}
      >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-slate-700 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {POS_SERVICE_TABS.find((t) => t.id === posServiceTab)?.fullTitle ||
                    'Input Nota & Kalkulator Harga Cetak Digital Printing'}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {POS_SERVICE_TABS.find((t) => t.id === posServiceTab)?.subtitle}
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-slate-500 whitespace-nowrap">
              Nomor Nota / SPK: {invoiceNumber || nextInvoiceNo}
            </span>
          </div>

          {/* PANEL KHUSUS SESUAI SUB-TAB YANG AKTIF (1 s/d 6) */}
          {posServiceTab === 'OUTDOOR_BANNER' && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2.5 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="font-bold text-slate-900">
                  Pilih Cepat Bahan Cetak Outdoor Banner (Stok Gudang):
                </span>
                <span className="text-[11px] text-slate-500">
                  Satuan otomatis Meter Persegi (Panjang × Lebar × Qty)
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {inventory
                  .filter((i) => i.category === 'Bahan Outdoor')
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        handleMaterialChange(item.id);
                        setCategory('Banner & Outdoor');
                        setUnitType('m2');
                        setJobTitle(item.name);
                      }}
                      className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                        selectedMaterialId === item.id
                          ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {item.name}{' '}
                      <span className="font-mono text-[10px] opacity-80">
                        ({formatIDR(item.defaultSellPrice)}/m² · Stok: {item.stockQty})
                      </span>
                    </button>
                  ))}
              </div>
              <div className="space-y-1.5 pt-1.5 border-t border-slate-200/80">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-[11px] font-bold text-slate-800">
                    Pilihan Finishing Banner:
                  </span>
                  {calculated.bannerDims.hasHiddenAllowance && (
                    <span className="text-[10.5px] font-mono font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded">
                      Ukuran Nota: {formatNumberID(calculated.bannerDims.nominalWidthM)}×{formatNumberID(calculated.bannerDims.nominalHeightM)}m → Hitungan Akhir Otomatis: {formatNumberID(calculated.bannerDims.effectiveWidthM)}×{formatNumberID(calculated.bannerDims.effectiveHeightM)}m ({formatNumberID(calculated.bannerDims.effectiveArea)} m² · Tanpa Ditampilkan di Nota)
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {BANNER_FINISHING_OPTIONS.map((fin) => {
                    const isSelected = finishingDesc === fin.desc;
                    return (
                      <button
                        key={fin.id}
                        type="button"
                        onClick={() => {
                          setFinishingDesc(fin.desc);
                        }}
                        className={`px-2.5 py-1.5 rounded border text-left text-[11px] transition-colors ${
                          isSelected
                            ? 'bg-emerald-700 text-white border-emerald-700 font-semibold shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div>{fin.label}</div>
                        {fin.allowanceNote && (
                          <div
                            className={`text-[9.5px] mt-0.5 font-normal ${
                              isSelected ? 'text-emerald-100' : 'text-slate-500'
                            }`}
                          >
                            {fin.allowanceNote}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {posServiceTab === 'INDOOR_HIRES' && (
            <div className="bg-sky-50/70 border border-sky-200 rounded-lg p-3.5 space-y-3 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-slate-900">
                    Pilih Cepat Bahan Cetak Indoor HiRes (Ritrama / Orajet / Inflex / Albatros / One Way):
                  </span>
                  <p className="text-[11px] text-slate-600">
                    Klik bahan di bawah untuk mengisi harga & menghubungkan ke stok gudang otomatis.
                  </p>
                </div>
                {onCreateInventoryItem && (
                  <button
                    type="button"
                    disabled={isSyncingPresets}
                    onClick={() => handleSyncMissingPresetsToInventory('INDOOR')}
                    className="px-3 py-1.5 rounded-md bg-sky-900 hover:bg-sky-800 text-white font-semibold text-[11px] whitespace-nowrap"
                  >
                    {isSyncingPresets
                      ? 'Menyimpan ke Stok...'
                      : '+ Sinkronkan 5 Bahan Indoor HiRes ke Stok Gudang'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                {INDOOR_HIRES_PRESETS.map((preset) => {
                  const matchedInv = inventory.find(
                    (i) =>
                      i.sku === preset.sku ||
                      i.name.toLowerCase().includes(preset.key)
                  );
                  const isSelected =
                    (matchedInv && selectedMaterialId === matchedInv.id) ||
                    (selectedMaterialId === 'MANUAL' &&
                      customMaterialName === preset.fullName);
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => handleSelectIndoorHiResPreset(preset)}
                      className={`p-2.5 rounded-md border text-left transition-colors ${
                        isSelected
                          ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                          : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="font-bold text-xs">{preset.label}</div>
                      <div className="text-[10px] font-mono mt-0.5 opacity-90">
                        {formatIDR(matchedInv ? matchedInv.defaultSellPrice : preset.defaultPrice)} / m²
                      </div>
                      <div
                        className={`text-[10px] mt-1 font-mono ${
                          isSelected ? 'text-emerald-300' : 'text-emerald-700'
                        }`}
                      >
                        {matchedInv
                          ? `Stok: ${matchedInv.stockQty} ${matchedInv.unit}`
                          : 'Klik Sinkron Stok / Manual'}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-sky-200/80">
                <span className="text-[11px] font-semibold text-slate-700">
                  Finishing Indoor HiRes:
                </span>
                {[
                  { label: 'Laminasi Dingin Glossy', desc: 'Laminasi Dingin Glossy + Potong Rapi', fee: 0 },
                  { label: 'Laminasi Dingin Doff', desc: 'Laminasi Dingin Doff + Potong Rapi', fee: 0 },
                  { label: 'Tanpa Laminasi (Potong Pas)', desc: 'Tanpa Laminasi (Potong Pas Ukuran)', fee: 0 },
                  { label: '+ Rangka X-Banner 60×160', desc: 'Mata Ayam 4 Sudut + Rangka X-Banner 60x160', fee: 45000 },
                  { label: '+ Rangka Roll Up 85×200', desc: 'Pasang Rangka Roll Up Aluminium 85x200', fee: 200000 },
                ].map((fin) => (
                  <button
                    key={fin.label}
                    type="button"
                    onClick={() => {
                      setFinishingDesc(fin.desc);
                      setFinishingFee(fin.fee);
                    }}
                    className={`px-2.5 py-1 rounded border text-[11px] ${
                      finishingDesc === fin.desc
                        ? 'bg-sky-800 text-white border-sky-800 font-semibold'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {fin.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {posServiceTab === 'PRINT_A3' && (
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-3.5 space-y-2.5 text-xs">
              <div className="font-bold text-slate-900">
                Preset Cepat Print A3+ (Stiker A3+, Kartu Tasyakuran Warna, Undangan Art Carton & Brosur):
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  {
                    label: 'Stiker Chromo A3+ (Label / Kotak Nasi Tasyakuran)',
                    job: 'Stiker Chromo A3+',
                    mat: 'Sticker Chromo A3+ Lintec',
                    price: 9000,
                    cost: 2200,
                  },
                  {
                    label: 'Stiker Vinyl A3+ Tahan Air',
                    job: 'Stiker Vinyl A3+',
                    mat: 'Sticker Vinyl A3+ Glossy/Doff',
                    price: 12000,
                    cost: 3800,
                  },
                  {
                    label: 'Kartu Tasyakuran / Berkat Art Carton 260gr A3+ (Potong Rapi)',
                    job: 'Kartu Tasyakuran / Berkat Art Carton 260gr A3+',
                    mat: 'Art Carton 260gr A3+ (1 Lembar isi 4/6/9 Kartu)',
                    price: 6000,
                    cost: 1600,
                    potongRapi: true,
                  },
                  {
                    label: 'Undangan Custom Art Carton / Jasmine A3+',
                    job: 'Undangan Custom Full Color A3+',
                    mat: 'Kertas Jasmine / Art Carton 260gr A3+',
                    price: 8000,
                    cost: 2500,
                    potongRapi: true,
                  },
                  {
                    label: 'Brosur / Selebaran Warna Art Paper 150gr A3+',
                    job: 'Selebaran / Brosur Warna Art Paper 150gr A3+',
                    mat: 'Art Paper 150gr A3+',
                    price: 5000,
                    cost: 1400,
                    potongRapi: true,
                  },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setCategory('Print A3+ & Dokumen');
                      setUnitType('Lembar');
                      setSelectedMaterialId('MANUAL');
                      setCustomMaterialName(p.mat);
                      setJobTitle(p.job);
                      setUnitPrice(p.price);
                      setUnitCost(p.cost);
                      if (p.potongRapi) {
                        setA3PotongSisiRapi(true);
                      }
                    }}
                    className="px-3 py-1.5 rounded-md bg-white hover:bg-emerald-100 border border-emerald-300 text-slate-800 font-medium text-xs"
                  >
                    {p.label} ({formatIDR(p.price)}/lbr)
                  </button>
                ))}
              </div>
            </div>
          )}

          {posServiceTab === 'PRINT_OFFSET' && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3.5 space-y-3 text-xs">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="bg-white border border-amber-200 rounded-md p-3 space-y-2">
                  <div className="font-bold text-slate-900">
                    A. Preset Cetak Undangan & Selebaran Tasyakuran Partai:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      {
                        label: 'Undangan Blangko (Erba/Cantik/Byar/Hepi) per Pcs',
                        job: 'Undangan Blangko (Erba/Cantik/Byar/Hepi)',
                        mat: 'Blangko Undangan + Plastik OPP + Label Nama',
                        unit: 'Pcs' as OrderUnitType,
                        price: 2000,
                        cost: 950,
                        fin: 'Termasuk Plastik OPP & Stiker Label Nama',
                      },
                      {
                        label: 'Undangan Custom Softcover Art Carton (per Pcs)',
                        job: 'Undangan Custom Softcover Full Color',
                        mat: 'Art Carton 260gr + Lipat Rel + Plastik OPP',
                        unit: 'Pcs' as OrderUnitType,
                        price: 3500,
                        cost: 1600,
                        fin: 'Pond Lipat + Plastik OPP',
                      },
                      {
                        label: 'Selebaran Tasyakuran / Aqiqah / Berkat (1 Rim / Paket)',
                        job: 'Selebaran Tasyakuran / Kotak Nasi (1 Rim)',
                        mat: 'Kertas HVS / Art Paper + Potong Bagi 2 atau 4',
                        unit: 'Paket' as OrderUnitType,
                        price: 120000,
                        cost: 55000,
                        fin: 'Potong Rapi Siap Masuk Kotak Berkat',
                      },
                      {
                        label: 'Selebaran Tasyakuran Warna Eceran (per Lembar/Pcs)',
                        job: 'Selebaran Tasyakuran / Aqiqah Warna',
                        mat: 'Kertas HVS / Brief Card / Art Paper',
                        unit: 'Pcs' as OrderUnitType,
                        price: 1000,
                        cost: 350,
                        fin: 'Potong Rapi',
                      },
                    ].map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setCategory('Offset & Kemasan');
                          setSelectedMaterialId('MANUAL');
                          setCustomMaterialName(p.mat);
                          setJobTitle(p.job);
                          setUnitType(p.unit);
                          setUnitPrice(p.price);
                          setUnitCost(p.cost);
                          setFinishingDesc(p.fin);
                        }}
                        className="px-2.5 py-1.5 rounded-md bg-amber-50/70 hover:bg-amber-100 border border-amber-300 text-slate-900 font-medium text-[11px] text-left"
                      >
                        {p.label} · <span className="font-mono font-bold">{formatIDR(p.price)}/{p.unit}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white border border-amber-200 rounded-md p-3 space-y-2">
                  <div className="font-bold text-slate-900">
                    B. Preset Cetak Offset, Nota NCR, Brosur & Kemasan:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      {
                        label: 'Nota NCR 2 Ply (1 Rim / 40 Buku)',
                        job: 'Nota NCR 2 Ply (1 Rim)',
                        mat: 'Kertas NCR 2 Ply + Jilid Porporasi',
                        unit: 'Paket' as OrderUnitType,
                        price: 350000,
                        cost: 210000,
                        fin: 'Jilid Buku + Porporasi + Numerator',
                      },
                      {
                        label: 'Brosur A4 Art Paper 150gr (1 Rim / 500 Lbr)',
                        job: 'Brosur A4 Art Paper 150gr (1 Rim)',
                        mat: 'Art Paper 150gr Offset',
                        unit: 'Paket' as OrderUnitType,
                        price: 450000,
                        cost: 280000,
                        fin: 'Potong Sisir Rapi',
                      },
                      {
                        label: 'Kartu Nama 1 Box (100 Pcs)',
                        job: 'Kartu Nama 1 Box (100 Pcs)',
                        mat: 'Art Carton 260gr',
                        unit: 'Paket' as OrderUnitType,
                        price: 35000,
                        cost: 15000,
                        fin: 'Potong + Box Kartu Nama',
                      },
                      {
                        label: 'Box Kemasan Produk Custom (Pcs)',
                        job: 'Box Kemasan Duplex / Ivory',
                        mat: 'Ivory 310gr + Pond Kemasan',
                        unit: 'Pcs' as OrderUnitType,
                        price: 4500,
                        cost: 2500,
                        fin: 'Pisau Pond + Lem Kemasan',
                      },
                    ].map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setCategory('Offset & Kemasan');
                          setSelectedMaterialId('MANUAL');
                          setCustomMaterialName(p.mat);
                          setJobTitle(p.job);
                          setUnitType(p.unit);
                          setUnitPrice(p.price);
                          setUnitCost(p.cost);
                          setFinishingDesc(p.fin);
                        }}
                        className="px-2.5 py-1.5 rounded-md bg-slate-50 hover:bg-amber-100 border border-slate-200 text-slate-800 font-medium text-[11px] text-left"
                      >
                        {p.label} · <span className="font-mono font-bold">{formatIDR(p.price)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {posServiceTab === 'FOTOKOPI_JILID' && (
            <div className="bg-violet-50/70 border border-violet-200 rounded-lg p-3.5 space-y-3 text-xs">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {/* 1. Fotokopi, Print HVS & Selebaran Tasyakuran */}
                <div className="bg-white border border-violet-200 rounded-md p-3 space-y-2">
                  <div className="font-bold text-slate-900">
                    A. Fotokopi, Print HVS & Selebaran Tasyakuran
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      {
                        label: 'Fotokopi HVS A4/F4 Hitam Putih (per Lembar)',
                        job: 'Fotokopi HVS A4/F4 Hitam Putih',
                        mat: 'Kertas HVS A4/F4 75gr',
                        unit: 'Lembar' as OrderUnitType,
                        price: 500,
                        cost: 150,
                        fin: '',
                      },
                      {
                        label: 'Fotokopi Bolak-Balik A4/F4 (per Lembar)',
                        job: 'Fotokopi Bolak-Balik A4/F4',
                        mat: 'Kertas HVS A4/F4 75gr (2 Sisi)',
                        unit: 'Lembar' as OrderUnitType,
                        price: 800,
                        cost: 220,
                        fin: 'Fotokopi 2 Sisi (Bolak-Balik)',
                      },
                      {
                        label: 'Print / Fotokopi Selebaran Tasyakuran HVS (per Lembar)',
                        job: 'Selebaran Tasyakuran / Berkat HVS',
                        mat: 'Kertas HVS A4/F4 (Potong Bagi 2 / Bagi 4)',
                        unit: 'Lembar' as OrderUnitType,
                        price: 1000,
                        cost: 250,
                        fin: 'Termasuk Potong Bagi 2 / Bagi 4 Rapi',
                      },
                      {
                        label: 'Print Dokumen HVS Hitam Putih (per Lembar)',
                        job: 'Dokumen HVS A4/F4 Hitam Putih',
                        mat: 'Kertas HVS A4/F4 75gr',
                        unit: 'Lembar' as OrderUnitType,
                        price: 1000,
                        cost: 250,
                        fin: '',
                      },
                      {
                        label: 'Print Dokumen HVS Warna (per Lembar)',
                        job: 'Dokumen HVS A4/F4 Warna',
                        mat: 'Kertas HVS A4/F4 75gr Full Color',
                        unit: 'Lembar' as OrderUnitType,
                        price: 2000,
                        cost: 500,
                        fin: '',
                      },
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          setCategory('Fotokopi, Jilid & Laminating');
                          setSelectedMaterialId('MANUAL');
                          setCustomMaterialName(item.mat);
                          setJobTitle(item.job);
                          setUnitType(item.unit);
                          setUnitPrice(item.price);
                          setUnitCost(item.cost);
                          setFinishingDesc(item.fin);
                          setFinishingFee(0);
                        }}
                        className="px-2.5 py-1.5 rounded border border-violet-200 bg-violet-50/50 hover:bg-violet-100 text-slate-900 font-medium text-[11px] text-left"
                      >
                        {item.label} · <span className="font-mono font-bold">{formatIDR(item.price)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Jasa Jilid Dokumen / Buku / Skripsi */}
                <div className="bg-white border border-violet-200 rounded-md p-3 space-y-2">
                  <div className="font-bold text-slate-900">
                    B. Jasa Jilid Makalah / Laporan / Buku
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      {
                        label: 'Jilid Lakban Biasa (Mika + Buffalo)',
                        job: 'Jilid Lakban (Sampul Mika + Kertas Buffalo)',
                        mat: 'Mika Bening + Kertas Buffalo + Lakban Jilid',
                        unit: 'Pcs' as OrderUnitType,
                        price: 5000,
                        cost: 1500,
                        fin: 'Jilid Lakban Rapi',
                      },
                      {
                        label: 'Jilid Spiral Kawat / Plastik',
                        job: 'Jilid Spiral Kawat / Plastik + Mika Buffalo',
                        mat: 'Ring Spiral + Mika + Buffalo',
                        unit: 'Pcs' as OrderUnitType,
                        price: 15000,
                        cost: 4500,
                        fin: 'Lubang & Ring Spiral',
                      },
                      {
                        label: 'Jilid Softcover Lem Panas (Direct / Buku)',
                        job: 'Jilid Softcover Lem Panas (Cover Art Carton)',
                        mat: 'Cover Art Carton 260gr + Lem Panas',
                        unit: 'Pcs' as OrderUnitType,
                        price: 20000,
                        cost: 6000,
                        fin: 'Jilid Lem Panas + Potong 3 Sisi',
                      },
                      {
                        label: 'Jilid Hardcover Skripsi / Laporan / Yasin',
                        job: 'Jilid Hardcover Skripsi / Laporan / Yasin',
                        mat: 'Board Hardcover + Cover + Pita Pembatas',
                        unit: 'Pcs' as OrderUnitType,
                        price: 35000,
                        cost: 12000,
                        fin: 'Jilid Hardcover Rapi',
                      },
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          setCategory('Fotokopi, Jilid & Laminating');
                          setSelectedMaterialId('MANUAL');
                          setCustomMaterialName(item.mat);
                          setJobTitle(item.job);
                          setUnitType(item.unit);
                          setUnitPrice(item.price);
                          setUnitCost(item.cost);
                          setFinishingDesc(item.fin);
                          setFinishingFee(0);
                        }}
                        className="px-2.5 py-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-violet-100 text-slate-900 font-medium text-[11px] text-left"
                      >
                        {item.label} · <span className="font-mono font-bold">{formatIDR(item.price)}/buku</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Jasa Laminating Panas */}
                <div className="bg-white border border-violet-200 rounded-md p-3 space-y-2">
                  <div className="font-bold text-slate-900">
                    C. Jasa Laminating Panas (KTP / A4 / F4 / A3)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      {
                        label: 'Laminating Ukuran KTP / Kartu',
                        job: 'Laminating Ukuran KTP / Kartu',
                        mat: 'Plastik Laminating Kaku KTP 100 Micron',
                        unit: 'Lembar' as OrderUnitType,
                        price: 3000,
                        cost: 500,
                        fin: 'Laminating Panas KTP',
                      },
                      {
                        label: 'Laminating A4 / F4 (Ijazah / Akta / KK)',
                        job: 'Laminating A4 / F4 (Ijazah / Akta / KK)',
                        mat: 'Plastik Laminating Panas A4/F4 100 Micron',
                        unit: 'Lembar' as OrderUnitType,
                        price: 5000,
                        cost: 1200,
                        fin: 'Laminating Panas A4/F4',
                      },
                      {
                        label: 'Laminating Besar A3 (Poster / Sertifikat)',
                        job: 'Laminating Besar A3 (Poster / Sertifikat)',
                        mat: 'Plastik Laminating Panas A3 100 Micron',
                        unit: 'Lembar' as OrderUnitType,
                        price: 10000,
                        cost: 2500,
                        fin: 'Laminating Panas A3',
                      },
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          setCategory('Fotokopi, Jilid & Laminating');
                          setSelectedMaterialId('MANUAL');
                          setCustomMaterialName(item.mat);
                          setJobTitle(item.job);
                          setUnitType(item.unit);
                          setUnitPrice(item.price);
                          setUnitCost(item.cost);
                          setFinishingDesc(item.fin);
                          setFinishingFee(0);
                        }}
                        className="px-2.5 py-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-violet-100 text-slate-900 font-medium text-[11px] text-left"
                      >
                        {item.label} · <span className="font-mono font-bold">{formatIDR(item.price)}/lbr</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className={posServiceTab === 'ATK_RETAIL' ? 'block' : 'hidden'}>
            <AtkPosSubTabPanel
              inventory={inventory}
              cartItems={cartItems}
              selectedMaterialId={selectedMaterialId}
              storeSettings={storeSettings}
              paperSize={paperSize}
              isSyncingPresets={isSyncingPresets}
              isSubmittingOrder={isSubmitting}
              lastCreatedAtkOrder={lastCreatedAtkOrder}
              onSyncInitialAtkPresets={() => handleSyncMissingPresetsToInventory('ATK')}
              onCreateInventoryItem={onCreateInventoryItem}
              onUpdateInventoryItem={onUpdateInventoryItem}
              onOpenFullscreenPos={() => {
                setIsAtkFullscreenOpen(true);
                setIsAtkFullscreenMinimized(false);
              }}
              onSelectAtkProductToForm={(atk) => {
                setCategory('Penjualan ATK');
                handleMaterialChange(atk.id);
                setJobTitle(atk.name);
                setDesignFee(0);
                setFinishingDesc('');
                setFinishingFee(0);
                setDeductStock(true);
              }}
              onQuickAddAtkToCart={handleQuickAddAtkToCart}
              onSetCartItemExactQty={(cartItemId, exactQty) => {
                setCartItems((prev) => {
                  const idx = prev.findIndex((c) => c.id === cartItemId);
                  if (idx < 0) return prev;
                  if (exactQty <= 0) {
                    return prev.filter((c) => c.id !== cartItemId);
                  }
                  const target = prev[idx];
                  const nextBase = Math.round(exactQty * target.unitPrice);
                  const nextTotal =
                    nextBase +
                    (Number(target.designFee) || 0) +
                    (Number(target.finishingFee) || 0);
                  const nextCogs = Math.round(exactQty * target.unitCost);
                  const updated = [...prev];
                  updated[idx] = {
                    ...target,
                    qty: exactQty,
                    totalAreaOrQty: exactQty,
                    baseSubtotal: nextBase,
                    itemTotalAmount: nextTotal,
                    itemTotalCogs: nextCogs,
                  };
                  return updated;
                });
              }}
              onRemoveCartItemById={(cartItemId) => {
                setCartItems((prev) => prev.filter((c) => c.id !== cartItemId));
              }}
              onClearAllCartItems={() => {
                setCartItems([]);
              }}
              onInstantCheckoutAndPrintAtk={handleInstantCheckoutAndPrintAtk}
              onOpenPrintModal={onOpenPrintModal}
              onDownloadOrderPng={(ord) =>
                handleQuickDownloadOrderPng(ord, 'invoice', paperSize)
              }
            />
          </div>

          {posServiceTab === 'JASA_IT_DESAIN' && (
            <div className="bg-indigo-50/70 border border-indigo-200 rounded-lg p-3.5 space-y-3.5 text-xs">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                {/* Sub-Panel A: Jasa Desain Grafis */}
                <div className="bg-white border border-slate-200 rounded-md p-3 space-y-2">
                  <div className="font-bold text-slate-900">
                    A. Jasa Desain Grafis (Pelanggan Cetak yang Belum Punya Desain)
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Klik jasa desain di bawah lalu klik "+ Tambahkan ke Keranjang" untuk digabung dengan nota cetak pelanggan:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {DESIGN_SERVICE_PRESETS.map((ds) => (
                      <button
                        key={ds.label}
                        type="button"
                        onClick={() => {
                          setCategory('Jasa Desain & Servis IT');
                          setSelectedMaterialId('MANUAL');
                          setCustomMaterialName(ds.materialName);
                          setJobTitle(ds.jobTitle);
                          setUnitType('Paket');
                          setQty(1);
                          setUnitPrice(ds.price);
                          setUnitCost(0);
                          setDesignFee(0);
                          setFinishingDesc(ds.notes);
                          setFinishingFee(0);
                        }}
                        className="px-2.5 py-1.5 rounded border border-indigo-200 bg-indigo-50/60 hover:bg-indigo-100 text-slate-900 font-medium text-[11px] text-left"
                      >
                        {ds.label} · <span className="font-mono font-bold">{formatIDR(ds.price)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sub-Panel B: Jasa Instal Ulang & Upgrade / Ganti Storage PC & Laptop */}
                <div className="bg-white border border-slate-200 rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">
                      B. Jasa Instal Ulang & Upgrade / Ganti Storage PC / Laptop
                    </span>
                    {onCreateInventoryItem && (
                      <button
                        type="button"
                        disabled={isSyncingPresets}
                        onClick={() => handleSyncMissingPresetsToInventory('IT')}
                        className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white font-semibold text-[10px] whitespace-nowrap"
                      >
                        + Stok Awal SSD/Storage
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {IT_SERVICE_PRESETS.map((srv) => (
                      <button
                        key={srv.label}
                        type="button"
                        onClick={() => {
                          setCategory('Jasa Desain & Servis IT');
                          setSelectedMaterialId('MANUAL');
                          setCustomMaterialName(srv.materialName);
                          setJobTitle(srv.jobTitle);
                          setUnitType('Paket');
                          setQty(1);
                          setUnitPrice(srv.price);
                          setUnitCost(0);
                          setDesignFee(0);
                          setFinishingDesc(srv.finishingDesc);
                          setFinishingFee(0);
                        }}
                        className="px-2.5 py-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-900 font-medium text-[11px] text-left"
                      >
                        {srv.label} · <span className="font-mono font-bold">{formatIDR(srv.price)}</span>
                      </button>
                    ))}
                  </div>

                  {/* Pilihan Komponen Storage / SSD dari Stok Gudang */}
                  {inventory.some(
                    (i) =>
                      i.category === 'Part & Storage IT' ||
                      i.sku.toUpperCase().startsWith('IT-')
                  ) && (
                    <div className="pt-2 border-t border-slate-100 space-y-1">
                      <div className="text-[11px] font-semibold text-emerald-800">
                        Pilih Unit Storage SSD / HDD / Part dari Stok Gudang (Otomatis Potong Stok):
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {inventory
                          .filter(
                            (i) =>
                              i.category === 'Part & Storage IT' ||
                              i.sku.toUpperCase().startsWith('IT-')
                          )
                          .map((part) => (
                            <button
                              key={part.id}
                              type="button"
                              onClick={() => {
                                setCategory('Jasa Desain & Servis IT');
                                handleMaterialChange(part.id);
                                setJobTitle(part.name);
                                setFinishingDesc('Termasuk Pemasangan Unit Storage');
                                setDeductStock(true);
                              }}
                              className={`px-2.5 py-1 rounded border text-[11px] font-medium ${
                                selectedMaterialId === part.id
                                  ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                                  : 'bg-emerald-50 text-emerald-950 border-emerald-300 hover:bg-emerald-100'
                              }`}
                            >
                              {part.name} ({formatIDR(part.defaultSellPrice)} · Stok: {part.stockQty})
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                No. Nota / SPK
              </label>
              <input
                type="text"
                placeholder={nextInvoiceNo}
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs focus:outline-none focus:border-slate-900"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Nama Kasir Transaksi *
              </label>
              <select
                value={activeCashierName || cashierList[0] || 'Admin Kasir'}
                onChange={(e) => onChangeActiveCashier(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs bg-white font-semibold focus:outline-none focus:border-slate-900"
              >
                {cashierList.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Tanggal Pesan
              </label>
              <input
                type="date"
                required
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs focus:outline-none focus:border-slate-900"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Deadline Selesai
              </label>
              <input
                type="date"
                required
                value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs focus:outline-none focus:border-slate-900"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Kategori Lini Mesin
              </label>
              <select
                value={category}
                onChange={(e) => {
                  const nextCat = e.target.value as OrderCategory;
                  setCategory(nextCat);
                  if (nextCat === 'Penjualan ATK') {
                    setPosServiceTab('ATK_RETAIL');
                    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
                      setIsAtkFullscreenOpen(true);
                      setIsAtkFullscreenMinimized(false);
                    }
                  } else if (nextCat === 'Print A3+ & Dokumen') {
                    setUnitType('Lembar');
                    if (finishingDesc === 'Mata ayam pojok') {
                      setFinishingDesc('');
                    }
                  }
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs bg-white focus:outline-none focus:border-slate-900"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-medium text-slate-700">
                  Nama Pelanggan / Instansi{' '}
                  <span className="text-slate-400 font-normal">(Opsional)</span>
                </label>
                {!customerName.trim() && (
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                    Otomatis: Pelanggan Umum
                  </span>
                )}
              </div>
              <input
                type="text"
                placeholder="Kosongkan = Pelanggan Umum (atau ketik nama manual)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-slate-900"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                No. WhatsApp / Telepon
              </label>
              <input
                type="text"
                placeholder="0812-xxxx-xxxx"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs focus:outline-none focus:border-slate-900"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Judul Pekerjaan / Nama File Cetak {cartItems.length === 0 ? '*' : '(Produk Berikutnya)'}
              </label>
              <input
                type="text"
                required={cartItems.length === 0}
                placeholder={
                  cartItems.length > 0
                    ? 'Ketik produk berikutnya untuk ditambah ke keranjang (atau kosongkan jika selesai)...'
                    : 'Contoh: Spanduk Promo 4x1.5m + Mata Ayam'
                }
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-slate-900"
              />
            </div>
          </div>

          {/* Spesifikasi Bahan & Dimensi Ukuran */}
          <div className="border-t border-slate-100 pt-4 grid grid-cols-1 md:grid-cols-6 gap-4 text-xs">
            <div className="md:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">
                Pilih Bahan Baku (Terkoneksi Stok)
              </label>
              <select
                value={selectedMaterialId}
                onChange={(e) => handleMaterialChange(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs bg-white focus:outline-none focus:border-slate-900"
              >
                {inventory.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} (Stok: {item.stockQty} {item.unit})
                  </option>
                ))}
                <option value="MANUAL">-- Input Bahan Manual / Non-Stok --</option>
              </select>
              {selectedMaterialId === 'MANUAL' && (
                <input
                  type="text"
                  placeholder="Ketik nama bahan manual..."
                  value={customMaterialName}
                  onChange={(e) => setCustomMaterialName(e.target.value)}
                  className="mt-2 w-full px-3 py-1.5 border border-slate-200 rounded-md text-xs"
                />
              )}
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Satuan Hitung
              </label>
              <select
                value={unitType}
                onChange={(e) => {
                  const nextU = e.target.value as OrderUnitType;
                  setUnitType(nextU);
                  if (nextU === 'Lembar' && finishingDesc === 'Mata ayam pojok') {
                    setFinishingDesc('');
                  }
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs bg-white focus:outline-none focus:border-slate-900"
              >
                <option value="m2">Meter Persegi (m²)</option>
                <option value="Lembar">Lembar (A3+ / Plano)</option>
                <option value="Pcs">Pcs / Unit</option>
                <option value="Roll">Roll</option>
                <option value="Paket">Paket</option>
              </select>
            </div>

            {unitType === 'm2' && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-medium text-slate-700">
                      Panjang / Lebar (m)
                    </label>
                    {(widthM > 0 || widthMInput !== '') && (
                      <button
                        type="button"
                        onClick={() => {
                          setWidthMInput('');
                          setWidthMState(0);
                        }}
                        className="text-[10px] font-semibold text-slate-500 hover:text-rose-600"
                      >
                        Hapus / 0
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    value={widthMInput}
                    onChange={(e) =>
                      handleCleanNumberChange(e, setWidthMInput, setWidthMState, true)
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs tabular-nums"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-medium text-slate-700">
                      Tinggi (m)
                    </label>
                    {(heightM > 0 || heightMInput !== '') && (
                      <button
                        type="button"
                        onClick={() => {
                          setHeightMInput('');
                          setHeightMState(0);
                        }}
                        className="text-[10px] font-semibold text-slate-500 hover:text-rose-600"
                      >
                        Hapus / 0
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    value={heightMInput}
                    onChange={(e) =>
                      handleCleanNumberChange(e, setHeightMInput, setHeightMState, true)
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs tabular-nums"
                  />
                </div>
              </>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-medium text-slate-700">
                  Jumlah (Qty {unitType === 'm2' ? 'Pcs' : unitType})
                </label>
                {(qty > 0 || qtyInput !== '') && (
                  <button
                    type="button"
                    onClick={() => {
                      setQtyInput('');
                      setQtyState(0);
                    }}
                    className="text-[10px] font-semibold text-slate-500 hover:text-rose-600"
                    title="Kosongkan / Nol-kan Qty"
                  >
                    Hapus / 0
                  </button>
                )}
              </div>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={qtyInput}
                onChange={(e) =>
                  handleCleanNumberChange(e, setQtyInput, setQtyState, false)
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs tabular-nums focus:outline-none focus:border-slate-900"
              />
            </div>
          </div>

          {/* ========================================================================
              CHECKLIST FINISHING LEMBAR (A3+ / PLANO) & TAMBAHAN HARGA OTOMATIS
              (Hanya khusus ditampilkan pada Sub Tab Print A3+ agar tab lain ringkas)
             ======================================================================== */}
          {posServiceTab === 'PRINT_A3' && (
          <div
            className={`rounded-lg border p-4 space-y-3.5 text-xs transition-colors ${
              isA3SheetMode
                ? 'bg-emerald-50/60 border-emerald-300'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
              <div className="flex items-start sm:items-center gap-2">
                <CheckSquare className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5 sm:mt-0" />
                <div>
                  <span className="font-bold text-slate-900">
                    Checklist Finishing Lembar (A3+ / Plano) & Tambahan Harga Otomatis
                  </span>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Pilih opsi cetak & finishing A3+ di bawah ini — biaya tambahan otomatis dihitung dan muncul terperinci di Nota / Invoice / Struk & SPK.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {unitType !== 'Lembar' && (
                  <button
                    type="button"
                    onClick={() => {
                      setUnitType('Lembar');
                      setCategory('Print A3+ & Dokumen');
                      if (finishingDesc === 'Mata ayam pojok') {
                        setFinishingDesc('');
                      }
                    }}
                    className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-semibold text-[11px] flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Aktifkan Satuan Lembar (A3+ / Plano)
                  </button>
                )}

                <div className="inline-flex items-center gap-1.5 bg-emerald-100/80 border border-emerald-300 text-emerald-950 rounded-md px-3 py-1 text-[11px] font-semibold">
                  <span>Tarif Per Lembar × Jumlah Cetak:</span>
                  <span className="font-mono font-bold px-1.5 py-0.5 bg-white rounded border border-emerald-300">
                    × {Math.max(1, qty)} Lembar
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* 1. Pilihan Sisi Cetak A3+ (Bolak Balik vs 1 Muka) */}
              <div className="bg-white border border-slate-200 rounded-md p-3 space-y-2">
                <div className="font-bold text-slate-900 flex items-center justify-between">
                  <span>1. Sisi Cetak Lembar A3+</span>
                  <span className="text-[10px] font-mono text-emerald-700 font-semibold">
                    {a3BolakBalik ? '+50% Harga Total' : 'Standar 1 Muka'}
                  </span>
                </div>

                <label
                  className={`flex items-start justify-between gap-2 p-2 rounded border cursor-pointer transition-colors ${
                    a3BolakBalik
                      ? 'bg-emerald-50 border-emerald-500 font-semibold text-slate-900'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={a3BolakBalik}
                      onChange={(e) => {
                        ensureLembarUnitActive();
                        const checked = e.target.checked;
                        setA3BolakBalik(checked);
                        if (checked) {
                          setA3SatuMuka(false);
                          setA3LaminasiBolakBalik(true);
                        }
                      }}
                      className="mt-0.5 rounded border-slate-300 text-slate-900"
                    />
                    <div>
                      <div>Bolak Balik</div>
                      <div className="text-[10px] text-slate-500 font-normal">
                        +50% dari harga total cetak ({Math.max(1, qty)} lembar)
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-emerald-700 whitespace-nowrap">
                    +{formatIDR(Math.round(calculated.baseSubtotal * 0.5))}
                  </span>
                </label>

                <label
                  className={`flex items-start justify-between gap-2 p-2 rounded border cursor-pointer transition-colors ${
                    a3SatuMuka && !a3BolakBalik
                      ? 'bg-slate-900/5 border-slate-900 font-semibold text-slate-900'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={a3SatuMuka && !a3BolakBalik}
                      onChange={(e) => {
                        ensureLembarUnitActive();
                        const checked = e.target.checked;
                        setA3SatuMuka(checked);
                        if (checked) {
                          setA3BolakBalik(false);
                          setA3LaminasiBolakBalik(false);
                        }
                      }}
                      className="mt-0.5 rounded border-slate-300 text-slate-900"
                    />
                    <div>
                      <div>1 Muka</div>
                      <div className="text-[10px] text-slate-500 font-normal">
                        Cetak 1 sisi standar (tanpa biaya tambahan sisi)
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500 whitespace-nowrap">
                    Rp 0
                  </span>
                </label>
              </div>

              {/* 2. Pilihan Laminasi A3+ (Glossy / Doff & Bolak Balik x2) */}
              <div className="bg-white border border-slate-200 rounded-md p-3 space-y-2">
                <div className="font-bold text-slate-900 flex items-center justify-between">
                  <span>2. Laminasi Lembar A3+</span>
                  <span className="text-[10px] font-mono text-emerald-700 font-semibold">
                    {a3LaminasiBolakBalik
                      ? `2× Rp 3.000 × ${Math.max(1, qty)} lbr`
                      : `Rp 3.000 × ${Math.max(1, qty)} lbr`}
                  </span>
                </div>

                <label
                  className={`flex items-start justify-between gap-2 p-2 rounded border cursor-pointer transition-colors ${
                    a3LaminasiGlossy
                      ? 'bg-emerald-50 border-emerald-500 font-semibold text-slate-900'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={a3LaminasiGlossy}
                      onChange={(e) => {
                        ensureLembarUnitActive();
                        setA3LaminasiGlossy(e.target.checked);
                      }}
                      className="mt-0.5 rounded border-slate-300 text-slate-900"
                    />
                    <div>
                      <div>Laminasi Glossy</div>
                      <div className="text-[10px] text-slate-500 font-normal">
                        {a3LaminasiBolakBalik
                          ? `Rp 6.000/lbr × ${Math.max(1, qty)} lembar`
                          : `Rp 3.000/lbr × ${Math.max(1, qty)} lembar`}
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-emerald-700 whitespace-nowrap">
                    +{formatIDR((a3LaminasiBolakBalik ? 6000 : 3000) * Math.max(1, qty))}
                  </span>
                </label>

                <label
                  className={`flex items-start justify-between gap-2 p-2 rounded border cursor-pointer transition-colors ${
                    a3LaminasiDoff
                      ? 'bg-emerald-50 border-emerald-500 font-semibold text-slate-900'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={a3LaminasiDoff}
                      onChange={(e) => {
                        ensureLembarUnitActive();
                        setA3LaminasiDoff(e.target.checked);
                      }}
                      className="mt-0.5 rounded border-slate-300 text-slate-900"
                    />
                    <div>
                      <div>Laminasi Doff</div>
                      <div className="text-[10px] text-slate-500 font-normal">
                        {a3LaminasiBolakBalik
                          ? `Rp 6.000/lbr × ${Math.max(1, qty)} lembar`
                          : `Rp 3.000/lbr × ${Math.max(1, qty)} lembar`}
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-emerald-700 whitespace-nowrap">
                    +{formatIDR((a3LaminasiBolakBalik ? 6000 : 3000) * Math.max(1, qty))}
                  </span>
                </label>

                <div className="pt-1 border-t border-slate-100">
                  <label className="flex items-center justify-between gap-2 cursor-pointer text-[11px] text-slate-800 bg-slate-50 px-2.5 py-1.5 rounded border border-slate-200">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={a3LaminasiBolakBalik}
                        onChange={(e) => {
                          ensureLembarUnitActive();
                          setA3LaminasiBolakBalik(e.target.checked);
                        }}
                        className="rounded border-slate-300 text-slate-900"
                      />
                      <span className="font-semibold">
                        Laminasi Bolak Balik (×2 harga 1 muka)
                      </span>
                    </div>
                    <span className="font-mono font-bold text-emerald-700">
                      {formatIDR(6000 * Math.max(1, qty))}
                    </span>
                  </label>
                </div>
              </div>

              {/* 3. Pilihan Potong & Cutting Pola A3+ */}
              <div className="bg-white border border-slate-200 rounded-md p-3 space-y-2">
                <div className="font-bold text-slate-900 flex items-center justify-between">
                  <span>3. Checklist Potong & Cutting Pola</span>
                  <span className="text-[10px] font-mono text-emerald-700 font-semibold">
                    Rp 3.000 × {Math.max(1, qty)} lbr
                  </span>
                </div>

                <label
                  className={`flex items-start justify-between gap-2 p-2 rounded border cursor-pointer transition-colors ${
                    a3PotongSisiRapi
                      ? 'bg-emerald-50 border-emerald-500 font-semibold text-slate-900'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={a3PotongSisiRapi}
                      onChange={(e) => {
                        ensureLembarUnitActive();
                        setA3PotongSisiRapi(e.target.checked);
                      }}
                      className="mt-0.5 rounded border-slate-300 text-slate-900"
                    />
                    <div>
                      <div>Potong Sisi Rapi</div>
                      <div className="text-[10px] text-slate-500 font-normal">
                        Potong lurus rapi pinggir kertas A3+
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-slate-600 whitespace-nowrap">
                    Rp 0
                  </span>
                </label>

                <label
                  className={`flex items-start justify-between gap-2 p-2 rounded border cursor-pointer transition-colors ${
                    a3PotongDieCut
                      ? 'bg-emerald-50 border-emerald-500 font-semibold text-slate-900'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={a3PotongDieCut}
                      onChange={(e) => {
                        ensureLembarUnitActive();
                        setA3PotongDieCut(e.target.checked);
                      }}
                      className="mt-0.5 rounded border-slate-300 text-slate-900"
                    />
                    <div>
                      <div>Potong Mesin Putus Sesuai Pola (DieCut)</div>
                      <div className="text-[10px] text-slate-500 font-normal">
                        Rp 3.000/lbr × {Math.max(1, qty)} lembar
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-emerald-700 whitespace-nowrap">
                    +{formatIDR(3000 * Math.max(1, qty))}
                  </span>
                </label>

                <label
                  className={`flex items-start justify-between gap-2 p-2 rounded border cursor-pointer transition-colors ${
                    a3PotongKissCut
                      ? 'bg-emerald-50 border-emerald-500 font-semibold text-slate-900'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={a3PotongKissCut}
                      onChange={(e) => {
                        ensureLembarUnitActive();
                        setA3PotongKissCut(e.target.checked);
                      }}
                      className="mt-0.5 rounded border-slate-300 text-slate-900"
                    />
                    <div>
                      <div>Potong Mesin Setengah Putus Sesuai Pola (Kiss Cut)</div>
                      <div className="text-[10px] text-slate-500 font-normal">
                        Rp 3.000/lbr × {Math.max(1, qty)} lembar
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-emerald-700 whitespace-nowrap">
                    +{formatIDR(3000 * Math.max(1, qty))}
                  </span>
                </label>
              </div>
            </div>

            {/* Ringkasan Otomatis Checklist A3+ yang Akan Tercetak di Nota / Struk */}
            <div className="bg-white border border-emerald-200 rounded-md px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="text-[11px] text-slate-700">
                <span className="font-bold text-slate-900">
                  Tercetak di Nota / Invoice / Struk:{' '}
                </span>
                <span className="font-medium text-emerald-800">
                  {calculated.effectiveFinishingDesc || 'Belum ada finishing dipilih'}
                </span>
              </div>
              <div className="font-mono text-xs font-bold text-emerald-700 whitespace-nowrap">
                Total Tambahan Otomatis A3+: +{formatIDR(calculated.a3AutoFinishingFee)}
              </div>
            </div>
          </div>
          )}

          {/* Harga, HPP, Desain, Finishing */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-medium text-slate-700">
                  Harga Jual / {unitType} (Rp)
                </label>
                {(unitPrice > 0 || unitPriceInput !== '') && (
                  <button
                    type="button"
                    onClick={() => {
                      setUnitPriceInput('');
                      setUnitPriceState(0);
                    }}
                    className="text-[10px] font-semibold text-slate-500 hover:text-rose-600"
                    title="Kosongkan / Nol-kan Harga Jual"
                  >
                    Hapus / 0
                  </button>
                )}
              </div>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={unitPriceInput}
                onChange={(e) =>
                  handleCleanNumberChange(e, setUnitPriceInput, setUnitPriceState, false)
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs tabular-nums focus:outline-none focus:border-slate-900"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-medium text-slate-700">
                  Modal HPP / {unitType} (Rp)
                </label>
                {(unitCost > 0 || unitCostInput !== '') && (
                  <button
                    type="button"
                    onClick={() => {
                      setUnitCostInput('');
                      setUnitCostState(0);
                    }}
                    className="text-[10px] font-semibold text-slate-500 hover:text-rose-600"
                    title="Kosongkan / Nol-kan Modal HPP"
                  >
                    Hapus / 0
                  </button>
                )}
              </div>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={unitCostInput}
                onChange={(e) =>
                  handleCleanNumberChange(e, setUnitCostInput, setUnitCostState, false)
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs tabular-nums focus:outline-none focus:border-slate-900"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-medium text-slate-700">
                  Biaya Jasa Desain (Rp)
                </label>
                {(designFee > 0 || designFeeInput !== '') && (
                  <button
                    type="button"
                    onClick={() => {
                      setDesignFeeInput('');
                      setDesignFeeState(0);
                    }}
                    className="text-[10px] font-semibold text-slate-500 hover:text-rose-600"
                  >
                    Hapus / 0
                  </button>
                )}
              </div>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={designFeeInput}
                onChange={(e) =>
                  handleCleanNumberChange(e, setDesignFeeInput, setDesignFeeState, false)
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs tabular-nums focus:outline-none focus:border-slate-900"
              />
            </div>
            {posServiceTab !== 'ATK_RETAIL' && category !== 'Penjualan ATK' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-medium text-slate-700">
                    {isA3SheetMode
                      ? 'Biaya Finishing Manual (Rp)'
                      : 'Biaya Finishing (Rp)'}
                  </label>
                  {(finishingFee > 0 || finishingFeeInput !== '') && (
                    <button
                      type="button"
                      onClick={() => {
                        setFinishingFeeInput('');
                        setFinishingFeeState(0);
                      }}
                      className="text-[10px] font-semibold text-slate-500 hover:text-rose-600"
                    >
                      Hapus / 0
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={finishingFeeInput}
                  onChange={(e) =>
                    handleCleanNumberChange(e, setFinishingFeeInput, setFinishingFeeState, false)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs tabular-nums focus:outline-none focus:border-slate-900"
                />
                {isA3SheetMode && calculated.a3AutoFinishingFee > 0 && (
                  <div className="text-[10px] font-mono text-emerald-700 mt-0.5">
                    + Otomatis A3+: {formatIDR(calculated.a3AutoFinishingFee)}
                  </div>
                )}
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-medium text-slate-700">
                  Diskon Potongan (Rp)
                </label>
                {(discount > 0 || discountInput !== '') && (
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountInput('');
                      setDiscountState(0);
                    }}
                    className="text-[10px] font-semibold text-slate-500 hover:text-rose-600"
                  >
                    Hapus / 0
                  </button>
                )}
              </div>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={discountInput}
                onChange={(e) =>
                  handleCleanNumberChange(e, setDiscountInput, setDiscountState, false)
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs tabular-nums focus:outline-none focus:border-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {posServiceTab !== 'ATK_RETAIL' && category !== 'Penjualan ATK' && (
              <div className="space-y-1.5">
                <label className="block font-medium text-slate-700">
                  {isA3SheetMode
                    ? 'Catatan Tambahan Finishing (Di Luar Checklist A3+)'
                    : unitType === 'm2'
                    ? 'Pilihan / Rincian Finishing Banner & Spanduk'
                    : 'Rincian Finishing (Mata Ayam / Laminasi / Cutting / Lipat)'}
                </label>
                {unitType === 'm2' && !isA3SheetMode && (
                  <select
                    value={
                      BANNER_FINISHING_OPTIONS.some((o) => o.desc === finishingDesc)
                        ? finishingDesc
                        : '__CUSTOM__'
                    }
                    onChange={(e) => {
                      if (e.target.value !== '__CUSTOM__') {
                        setFinishingDesc(e.target.value);
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-slate-50 font-semibold text-slate-900 focus:outline-none focus:border-slate-900"
                  >
                    {BANNER_FINISHING_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.desc}>
                        {opt.label}
                      </option>
                    ))}
                    <option value="__CUSTOM__">-- Ketik Finishing Manual di Bawah --</option>
                  </select>
                )}
                <input
                  type="text"
                  placeholder={
                    isA3SheetMode
                      ? 'Opsional: ketik catatan tambahan finishing jika ada...'
                      : 'Pilih dari daftar di atas atau ketik rincian finishing...'
                  }
                  value={finishingDesc}
                  onChange={(e) => setFinishingDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs"
                />
                {unitType === 'm2' && calculated.bannerDims.hasHiddenAllowance && (
                  <div className="px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded text-[11px] text-emerald-900 font-medium">
                    <strong>Hitungan Otomatis Banner:</strong> Tertulis di Nota{' '}
                    <span className="font-mono font-bold">
                      {formatNumberID(calculated.bannerDims.nominalWidthM)}×
                      {formatNumberID(calculated.bannerDims.nominalHeightM)}m
                    </span>{' '}
                    → Dihitung Akhir{' '}
                    <span className="font-mono font-bold">
                      {formatNumberID(calculated.bannerDims.effectiveWidthM)}×
                      {formatNumberID(calculated.bannerDims.effectiveHeightM)}m (
                      {formatNumberID(calculated.bannerDims.effectiveArea)} m²)
                    </span>{' '}
                    <span className="text-[10px] text-emerald-700">
                      (Tambahan ukuran otomatis terhitung tanpa ditampilkan di nota)
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className={posServiceTab === 'ATK_RETAIL' || category === 'Penjualan ATK' ? 'md:col-span-2' : ''}>
              <label className="block font-medium text-slate-700 mb-1">
                Catatan Produksi / Instruksi Operator Mesin
              </label>
              <input
                type="text"
                placeholder="Contoh: Warna profil CMYK High Pass, lebihan bahan 5cm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs"
              />
            </div>
          </div>

          {/* Menu: Tambahkan ke Keranjang (Multi-Produk dalam 1 Nota Invoice & SPK) */}
          <div className="bg-indigo-50/70 border-2 border-indigo-200 rounded-lg p-4 space-y-3.5 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-indigo-700" />
                  <h4 className="font-bold text-slate-900 text-xs sm:text-sm">
                    Keranjang Pesanan Multi-Produk (1 Invoice & SPK untuk Beberapa Produk Berbeda)
                  </h4>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase bg-indigo-700 text-white rounded">
                    {cartItems.length} Produk di Keranjang
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Jika pelanggan memesan beberapa produk berbeda (misal Banner + Stiker A3+ + Kartu Nama), klik tombol{' '}
                  <strong>"Tambahkan ke Keranjang"</strong> di kanan agar semua produk masuk ke dalam <strong>1 Nota Invoice & SPK yang sama</strong>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  <ShoppingCart className="w-4 h-4" />
                  + Tambahkan ke Keranjang ({formatIDR(calculated.currentItemSubtotal)})
                </button>
                {cartItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setCartItems([]);
                      setCartNotice(null);
                    }}
                    className="px-3 py-2 text-xs font-medium text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Kosongkan Keranjang
                  </button>
                )}
              </div>
            </div>

            {cartNotice && (
              <div className="p-2.5 bg-white border border-indigo-300 rounded-md text-indigo-950 flex items-center justify-between gap-2 text-[11px]">
                <span className="font-medium">{cartNotice}</span>
                <button
                  type="button"
                  onClick={() => setCartNotice(null)}
                  className="text-slate-400 hover:text-slate-700 font-bold"
                >
                  ✕
                </button>
              </div>
            )}

            {cartItems.length > 0 && (
              <div className="bg-white border border-indigo-200 rounded-md overflow-hidden">
                <div className="px-3.5 py-2 bg-indigo-900 text-white flex items-center justify-between text-[11px] font-semibold">
                  <span>
                    Daftar Produk di Keranjang Nota #{invoiceNumber || nextInvoiceNo} ({cartItems.length} Item)
                  </span>
                  <span className="font-mono">
                    Subtotal Keranjang: {formatIDR(calculated.cartSumAmount)}
                  </span>
                </div>
                <div className="divide-y divide-slate-200">
                  {cartItems.map((cItem, index) => {
                    const detail = extractItemDetailedBreakdown(cItem);
                    return (
                      <div
                        key={cItem.id}
                        className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 bg-slate-900 text-white font-mono font-bold text-[10px] rounded">
                              #{index + 1}
                            </span>
                            <span className="font-bold text-slate-900 text-xs">
                              {cItem.jobTitle}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600">
                              {cItem.category}
                            </span>
                          </div>
                          {detail.isA3Sheet && (
                            <div className="text-[11px] text-slate-600">
                              Harga/Lembar A3+: {formatIDR(cItem.unitPrice)}
                            </div>
                          )}
                          <div className="text-[11px] text-slate-800 font-mono">
                            • {detail.basePrintLabel} = <strong>{formatIDR(detail.baseSubtotal)}</strong>
                          </div>
                          {detail.finishingLines.map((fl) => (
                            <div key={fl.id} className="text-[11px] text-emerald-800 font-mono">
                              • {fl.label} = <strong>{fl.amount > 0 ? `+${formatIDR(fl.amount)}` : 'Rp 0'}</strong>
                            </div>
                          ))}
                          {cItem.designFee > 0 && (
                            <div className="text-[11px] text-emerald-800 font-mono">
                              • Jasa Desain = <strong>+{formatIDR(cItem.designFee)}</strong>
                            </div>
                          )}
                          {detail.hasExtraComponents && (
                            <div className="text-[11px] font-bold text-indigo-950 font-mono pt-0.5">
                              {detail.subtotalLabelWithFormula} = {formatIDR(detail.itemSubtotal)}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                          <div className="text-right font-mono">
                            <div className="font-bold text-slate-900 text-xs tabular-nums">
                              {formatIDR(cItem.itemTotalAmount)}
                            </div>
                            <div className="text-[10px] text-slate-500 tabular-nums">
                              HPP: {formatIDR(cItem.itemTotalCogs)}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleEditCartItem(cItem)}
                              title="Edit Produk Ini"
                              className="px-2 py-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded flex items-center gap-1"
                            >
                              <Edit3 className="w-3 h-3" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveCartItem(cItem.id)}
                              title="Hapus dari Keranjang"
                              className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Pembayaran & Ringkasan Kalkulasi */}
          <div className="border-t border-slate-200 pt-4 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Skema Pembayaran
                  </label>
                  <select
                    value={paymentTypeChoice}
                    onChange={(e) =>
                      setPaymentTypeChoice(e.target.value as 'LUNAS' | 'DP' | 'TEMPO')
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs bg-white font-medium"
                  >
                    <option value="LUNAS">Bayar Lunas Sekarang</option>
                    <option value="DP">Uang Muka (DP / Cicil)</option>
                    <option value="TEMPO">Tagihan Tempo (Piutang)</option>
                  </select>
                </div>

                {paymentTypeChoice === 'DP' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-medium text-slate-700">
                        Nominal DP Diterima (Rp)
                      </label>
                      {(dpAmount > 0 || dpAmountInput !== '') && (
                        <button
                          type="button"
                          onClick={() => {
                            setDpAmountInput('');
                            setDpAmountState(0);
                          }}
                          className="text-[10px] font-semibold text-slate-500 hover:text-rose-600"
                        >
                          Hapus / 0
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      max={calculated.totalAmount}
                      value={dpAmountInput}
                      onChange={(e) =>
                        handleCleanNumberChange(e, setDpAmountInput, setDpAmountState, false)
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs tabular-nums"
                    />
                  </div>
                )}

                {paymentTypeChoice !== 'TEMPO' && (
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Metode Pembayaran
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs bg-white font-semibold"
                    >
                      <option value="Tunai">Kas Tunai</option>
                      <option value="Transfer Bank">Transfer Bank (Pilih Nama Bank)</option>
                      <option value="QRIS">QRIS / E-Wallet</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Pilihan Keterangan Pembayaran Transfer Berbagai Nama Bank */}
              {paymentTypeChoice !== 'TEMPO' && paymentMethod === 'Transfer Bank' && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900">
                      <Landmark className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Pilih Nama Bank & Keterangan Pembayaran Transfer</span>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-700 font-semibold">
                      Tercatat: Transfer {effectiveBankName}
                      {bankTransferRef.trim() ? ` (${bankTransferRef.trim()})` : ''}
                    </span>
                  </div>

                  {/* Tombol Cepat Bank Populer */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {BANK_TRANSFER_OPTIONS.filter((b) => b.id !== 'MANUAL_BANK')
                      .slice(0, 10)
                      .map((b) => {
                        const isSelected = selectedBankName === b.id;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => setSelectedBankName(b.id)}
                            className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors whitespace-nowrap ${
                              isSelected
                                ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {b.shortLabel}
                          </button>
                        );
                      })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        Daftar Lengkap Nama Bank
                      </label>
                      <select
                        value={selectedBankName}
                        onChange={(e) => setSelectedBankName(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs bg-white font-medium"
                      >
                        {BANK_TRANSFER_OPTIONS.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                      {selectedBankName === 'MANUAL_BANK' && (
                        <input
                          type="text"
                          placeholder="Ketik nama bank (misal: Bank Nagari / Sumsel / Kalbar)..."
                          value={customBankName}
                          onChange={(e) => setCustomBankName(e.target.value)}
                          className="mt-2 w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs bg-white"
                        />
                      )}
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        Keterangan Transfer / Pengirim / No. Ref (Opsional)
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: a.n. Budi / Ke Rek BCA Toko / Ref 8821"
                        value={bankTransferRef}
                        onChange={(e) => setBankTransferRef(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={deductStock}
                    onChange={(e) => setDeductStock(e.target.checked)}
                    className="rounded border-slate-300 text-slate-900"
                  />
                  <span>Potong stok bahan otomatis ({formatNumberID(calculated.totalAreaOrQty)} {unitType})</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={recordCashTx}
                    onChange={(e) => setRecordCashTx(e.target.checked)}
                    className="rounded border-slate-300 text-slate-900"
                  />
                  <span>Catat pembayaran otomatis ke Jurnal Kas</span>
                </label>
              </div>

              {/* Opsi Output Print Otomatis Setelah Simpan */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Output Cetak / Download / WhatsApp Setelah Simpan
                  </label>
                  <select
                    value={afterSavePrintAction}
                    onChange={(e) =>
                      setAfterSavePrintAction(
                        e.target.value as
                          | 'NONE'
                          | 'INVOICE'
                          | 'SPK'
                          | 'DOWNLOAD_PNG'
                          | 'SHARE_WA'
                      )
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs bg-white font-medium"
                  >
                    <option value="INVOICE">Simpan & Buka Cetak Nota Tagihan (Invoice)</option>
                    <option value="SPK">Simpan & Buka Cetak SPK Operator Produksi</option>
                    <option value="DOWNLOAD_PNG">Simpan & Download Invoice Format PNG (.png)</option>
                    <option value="SHARE_WA">Simpan & Bagikan Nota via WhatsApp + PNG</option>
                    <option value="NONE">Simpan Saja (Tanpa Buka Layar Cetak)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Ukuran Kertas Printer Output
                  </label>
                  <select
                    value={paperSize}
                    onChange={(e) => onChangePaperSize(e.target.value as PrintPaperSize)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs bg-white font-medium"
                  >
                    {PRINT_PAPER_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name} — {opt.dimensions}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Kotak Kalkulasi Total & Estimasi Margin */}
            <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 text-xs">
              {cartItems.length > 0 && (
                <div className="p-2.5 bg-indigo-950 text-white rounded-md space-y-1">
                  <div className="flex justify-between items-center font-bold">
                    <span className="flex items-center gap-1.5">
                      <ShoppingCart className="w-3.5 h-3.5 text-indigo-300" />
                      Total {cartItems.length} Produk di Keranjang:
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatIDR(calculated.cartSumAmount)}
                    </span>
                  </div>
                  {calculated.includeCurrentFormInOrder && (
                    <div className="flex justify-between text-[11px] text-indigo-200 pt-1 border-t border-indigo-800">
                      <span>+ Produk di Form ({jobTitle.trim()}):</span>
                      <span className="font-mono tabular-nums">
                        +{formatIDR(calculated.currentItemSubtotal)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between text-slate-600">
                <span>Volume Item Form Saat Ini:</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {cartItems.length === 0
                    ? ''
                    : calculated.includeCurrentFormInOrder
                    ? `${formatNumberID(calculated.totalAreaOrQty)} ${unitType}`
                    : `${formatNumberID(calculated.cartTotalQty)} ${
                        cartItems[cartItems.length - 1]?.unitType || unitType
                      }`}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>
                  {cartItems.length === 0
                    ? 'Harga Cetak:'
                    : calculated.includeCurrentFormInOrder
                    ? `Harga Cetak (${formatNumberID(calculated.totalAreaOrQty)} ${unitType} × ${formatIDR(
                        Number(unitPrice) || 0
                      )}):`
                    : cartItems.length === 1
                    ? `Harga Cetak (${formatNumberID(cartItems[0].totalAreaOrQty)} ${cartItems[0].unitType} × ${formatIDR(
                        cartItems[0].unitPrice
                      )}):`
                    : `Harga Cetak (${cartItems.length} Produk / ${formatNumberID(
                        calculated.cartTotalQty
                      )} Item):`}
                </span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {cartItems.length === 0
                    ? ''
                    : calculated.includeCurrentFormInOrder
                    ? formatIDR(calculated.baseSubtotal)
                    : formatIDR(calculated.cartSumAmount)}
                </span>
              </div>

              {cartItems.length > 0 &&
                isA3SheetMode &&
                calculated.a3BreakdownItems.length > 0 && (
                  <div className="border-y border-dashed border-slate-200 py-1.5 space-y-1">
                    <div className="text-[10px] font-bold uppercase text-slate-500">
                      Rincian Jasa Potong & Finishing A3+:
                    </div>
                    {calculated.a3BreakdownItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between text-[11px] text-slate-700"
                      >
                        <span>• {item.label}</span>
                        <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                          {item.amount > 0 ? `+${formatIDR(item.amount)}` : 'Rp 0'}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between text-[11px] font-bold text-slate-900 pt-1 border-t border-dotted border-slate-300">
                      <span>
                        Sub Total Item (
                        {[
                          formatNumberID(calculated.baseSubtotal),
                          ...calculated.a3BreakdownItems
                            .filter((x) => x.amount > 0)
                            .map((x) => formatNumberID(x.amount)),
                          ...(Number(designFee) > 0
                            ? [formatNumberID(Number(designFee))]
                            : []),
                        ].join(' + ')}
                        ):
                      </span>
                      <span className="font-mono tabular-nums">
                        {formatIDR(calculated.currentItemSubtotal)}
                      </span>
                    </div>
                  </div>
                )}

              <div className="flex justify-between text-slate-600">
                <span>Estimasi Total HPP Bahan:</span>
                <span className="font-mono text-slate-700 tabular-nums">
                  {cartItems.length === 0 ? '' : formatIDR(calculated.totalCogs)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Estimasi Laba Kotor Order:</span>
                <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                  {cartItems.length === 0 ? '' : `+${formatIDR(calculated.estGrossProfit)}`}
                </span>
              </div>

              {/* Rincian Pembulatan Akhir Otomatis */}
              <div className="border-t border-dashed border-slate-300 pt-2 space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Total Hitung Sebelum Pembulatan:</span>
                  <span className="font-mono font-semibold text-slate-800 tabular-nums">
                    {cartItems.length === 0
                      ? ''
                      : formatIDR(calculated.rawTotalBeforeRounding)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-600">
                    Pembulatan Akhir Kasir:
                  </span>
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      cartItems.length === 0
                        ? 'text-slate-400'
                        : calculated.roundingInfo.roundingAdjustment > 0
                        ? 'text-emerald-700'
                        : calculated.roundingInfo.roundingAdjustment < 0
                        ? 'text-amber-700'
                        : 'text-slate-600'
                    }`}
                  >
                    {cartItems.length === 0
                      ? ''
                      : calculated.roundingInfo.roundingAdjustment > 0
                      ? `+${formatIDR(calculated.roundingInfo.roundingAdjustment)}`
                      : calculated.roundingInfo.roundingAdjustment < 0
                      ? `-${formatIDR(Math.abs(calculated.roundingInfo.roundingAdjustment))}`
                      : 'Rp 0 (Pas)'}
                  </span>
                </div>
                <div className="px-2 py-1 bg-amber-50/80 border border-amber-200 rounded text-[10px] text-amber-900 font-medium leading-snug">
                  <div>
                    <strong>Status Pembulatan:</strong>{' '}
                    {cartItems.length === 0
                      ? ''
                      : calculated.roundingInfo.ruleExplanation}
                  </div>
                  <div className="text-[9px] text-amber-800 mt-0.5">
                    Aturan: ≤ Rp 300 → .000 | &gt; Rp 300 → Rp 500 (500 tetap 500) | ≥ Rp 600 → +1.000
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-2 flex justify-between items-baseline">
                <span className="font-bold text-slate-900">
                  {cartItems.length === 0
                    ? 'TOTAL TAGIHAN AKHIR:'
                    : `TOTAL TAGIHAN AKHIR (${
                        cartItems.length + (calculated.includeCurrentFormInOrder ? 1 : 0)
                      } PRODUK):`}
                </span>
                <span className="text-base font-mono font-bold text-slate-900 tabular-nums">
                  {cartItems.length === 0 ? '' : formatIDR(calculated.totalAmount)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>
                  {cartItems.length === 0
                    ? 'Dibayar Saat Ini:'
                    : `Dibayar Saat Ini (${calculated.paymentStatus} · ${
                        calculated.finalMethod === 'Transfer Bank'
                          ? `Transfer ${effectiveBankName}`
                          : calculated.finalMethod
                      }):`}
                </span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {cartItems.length === 0 ? '' : formatIDR(calculated.paidAmount)}
                </span>
              </div>
              <div className="pt-2 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-colors flex items-center gap-1 whitespace-nowrap"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  + Tambah ke Keranjang
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {isSubmitting
                    ? 'Menyimpan SPK...'
                    : cartItems.length > 0
                    ? `Simpan Nota & SPK (${cartItems.length + (jobTitle.trim() ? 1 : 0)} Produk)`
                    : 'Simpan Pesanan & Buat SPK'}
                </button>
              </div>
            </div>
          </div>
      </form>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-3">
        {/* Filter Cepat Berdasarkan 6 Tab Layanan */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-2.5 text-xs">
          <span className="font-bold text-slate-700 mr-1">Filter Tabel SPK:</span>
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`px-2.5 py-1 rounded-md font-medium border transition-colors ${
              categoryFilter === 'ALL'
                ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Semua ({orders.length})
          </button>
          {POS_SERVICE_TABS.map((t) => {
            const count = orders.filter((o) => o.category === t.orderCategory).length;
            const active = categoryFilter === t.orderCategory;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setCategoryFilter(t.orderCategory)}
                className={`px-2.5 py-1 rounded-md font-medium border transition-colors ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {t.shortTitle} ({count})
              </button>
            );
          })}
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari No. SPK, pelanggan, judul cetakan, atau bahan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-700 font-semibold"
            >
              <option value="ALL">Semua Kategori Layanan (6 Tab)</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  Kategori: {cat}
                </option>
              ))}
            </select>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            {(['ALL', 'Lunas', 'DP / Belum Lunas', 'Belum Bayar'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setPayFilter(status)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  payFilter === status
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {status === 'ALL' ? 'Semua Tagihan' : status}
              </button>
            ))}
          </div>

          <select
            value={cashierFilter}
            onChange={(e) => setCashierFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-700"
          >
            <option value="ALL">Semua Kasir</option>
            {cashierList.map((c) => (
              <option key={c} value={c}>
                Kasir: {c}
              </option>
            ))}
          </select>

          <select
            value={prodFilter}
            onChange={(e) => setProdFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-700"
          >
            <option value="ALL">Semua Tahap Produksi</option>
            {PRODUCTION_STAGES.map((st) => (
              <option key={st} value={st}>
                Tahap: {st}
              </option>
            ))}
          </select>
        </div>
        </div>
      </div>

      {/* Tabel Daftar Pesanan (SPK) */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-800">
                <th className="py-3 px-4 text-left font-bold">No. SPK & Tanggal</th>
                <th className="py-3 px-4 text-left font-bold">Pelanggan & Pekerjaan</th>
                <th className="py-3 px-4 text-left font-bold">Spesifikasi Bahan & Ukuran</th>
                <th className="py-3 px-4 text-right font-bold">Tagihan & HPP</th>
                <th className="py-3 px-4 text-right font-bold">Status Bayar / Piutang</th>
                <th className="py-3 px-4 text-left font-bold">Tahap Produksi</th>
                <th className="py-3 px-4 text-right font-bold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    Belum ada data pesanan cetak (SPK) yang sesuai filter. Klik tombol{' '}
                    <span className="font-semibold text-slate-800">
                      "Buat Pesanan Cetak (SPK Baru)"
                    </span>{' '}
                    di kanan atas.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const debt = Math.max(0, order.totalAmount - order.paidAmount);
                  const margin = order.totalAmount - order.totalCogs;
                  const finishingLines = extractOrderFinishingLines(order);
                  const paymentDetail = extractOrderPaymentDetail(order);
                  const orderItems = extractOrderCartItems(order);
                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-slate-50/70 transition-colors align-top"
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono font-semibold text-slate-900">
                          {order.invoiceNumber}
                        </div>
                        {orderItems.length > 1 && (
                          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 mt-0.5 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded text-[10px] font-semibold">
                            <ShoppingCart className="w-2.5 h-2.5" />
                            {orderItems.length} Produk
                          </div>
                        )}
                        <div className="text-slate-500 font-mono text-[11px] mt-0.5">
                          Masuk: {formatDateID(order.orderDate)}
                        </div>
                        <div className="text-slate-500 font-mono text-[11px]">
                          Selesai: {formatDateID(order.deadlineDate)}
                        </div>
                        <div className="text-emerald-700 font-medium text-[11px] mt-0.5">
                          Kasir: {order.cashierName || activeCashierName || 'Admin Kasir'}
                        </div>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-semibold text-slate-900">
                          {order.customerName}
                        </div>
                        {orderItems.length > 1 ? (
                          <div className="mt-1 space-y-1">
                            {orderItems.map((it, idx) => (
                              <div key={it.id} className="text-[11px] text-slate-800">
                                <span className="font-mono font-bold text-indigo-700">
                                  #{idx + 1}{' '}
                                </span>
                                <span className="font-medium">{it.jobTitle}</span>
                                <span className="text-slate-500"> ({it.category})</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <>
                            <div className="text-slate-700 mt-0.5">
                              {cleanProductJobTitle(order.jobTitle)}
                            </div>
                            <div className="text-slate-500 text-[11px] mt-0.5">
                              {order.category}
                              {order.customerPhone ? ` · ${order.customerPhone}` : ''}
                            </div>
                          </>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {orderItems.length > 1 ? (
                          <div className="space-y-1.5">
                            {orderItems.map((it, idx) => (
                              <div
                                key={it.id}
                                className="p-1.5 bg-slate-50 border border-slate-200 rounded text-[11px]"
                              >
                                <div className="flex justify-between gap-2 font-medium text-slate-900">
                                  <span>
                                    #{idx + 1} {it.materialName}
                                  </span>
                                  <span className="font-mono font-semibold text-slate-800">
                                    {formatIDR(it.itemTotalAmount)}
                                  </span>
                                </div>
                                <div className="font-mono text-[10px] text-slate-600">
                                  {it.unitType === 'm2'
                                    ? `${formatNumberID(it.widthM)}m × ${formatNumberID(it.heightM)}m × ${it.qty} pcs (${formatNumberID(it.totalAreaOrQty)} m²)`
                                    : `${formatNumberID(it.qty)} ${it.unitType}`}{' '}
                                  @ {formatIDR(it.unitPrice)}
                                </div>
                                {it.finishingDesc && it.category !== 'Penjualan ATK' && (
                                  <div className="text-[10px] text-emerald-700">
                                    Finishing: {it.finishingDesc}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <>
                            <div className="font-medium text-slate-800">
                              {cleanProductJobTitle(order.materialName)}
                            </div>
                            <div className="font-mono text-slate-600 text-[11px] mt-0.5 tabular-nums">
                              {order.unitType === 'm2'
                                ? `${formatNumberID(order.widthM)}m × ${formatNumberID(order.heightM)}m × ${order.qty} pcs = ${formatNumberID(order.totalAreaOrQty)} m²`
                                : `${formatNumberID(order.qty)} ${order.unitType}`}
                            </div>
                            {finishingLines.length > 0 ? (
                              <div className="mt-1 space-y-0.5">
                                {finishingLines.map((fl) => (
                                  <div
                                    key={fl.id}
                                    className="text-[11px] text-slate-600 flex items-center justify-between gap-2"
                                  >
                                    <span>• {fl.label}</span>
                                    {fl.amount > 0 && (
                                      <span className="font-mono text-emerald-700 font-semibold tabular-nums">
                                        +{formatIDR(fl.amount)}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              order.finishingDesc &&
                              order.category !== 'Penjualan ATK' && (
                                <div className="text-slate-500 text-[11px] mt-0.5">
                                  Finishing: {order.finishingDesc}
                                </div>
                              )
                            )}
                          </>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="font-bold text-slate-900">
                          {formatIDR(order.totalAmount)}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          HPP: {formatIDR(order.totalCogs)}
                        </div>
                        <div className="text-[11px] text-emerald-700 font-medium">
                          Laba: +{formatIDR(margin)}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div
                          className={`font-semibold ${
                            order.paymentStatus === 'Lunas'
                              ? 'text-emerald-700'
                              : order.paymentStatus === 'DP / Belum Lunas'
                              ? 'text-amber-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {order.paymentStatus} · {paymentDetail.paymentMethodDisplay}
                        </div>
                        <div className="font-mono text-[11px] text-slate-600 mt-0.5 tabular-nums">
                          Dibayar: {formatIDR(order.paidAmount)}
                        </div>
                        {debt > 0 && (
                          <div className="font-mono text-[11px] font-semibold text-rose-600 tabular-nums">
                            Sisa Piutang: {formatIDR(debt)}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <select
                          disabled={order.productionStatus === 'Dibatalkan'}
                          value={order.productionStatus}
                          onChange={(e) =>
                            onUpdateProductionStatus(
                              order,
                              e.target.value as ProductionStatus
                            )
                          }
                          className="px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-md bg-white text-slate-800 focus:outline-none focus:border-slate-900"
                        >
                          {PRODUCTION_STAGES.map((stage) => (
                            <option key={stage} value={stage}>
                              {stage}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {debt > 0 && order.productionStatus !== 'Dibatalkan' && (
                            <button
                              type="button"
                              onClick={() => {
                                setSettlingOrder(order);
                                setSettleAmount(debt);
                                setSettleMethod('Transfer Bank');
                                setSettleBankChoice(paymentDetail.bankName || 'Bank BCA');
                                setSettleTransferRef(paymentDetail.transferRef || '');
                              }}
                              title="Terima Pelunasan Piutang"
                              className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors flex items-center gap-1 whitespace-nowrap"
                            >
                              <Wallet className="w-3 h-3" />
                              Lunasi
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenPrintModal(order, 'invoice', paperSize)}
                            title={`Cetak Nota / Invoice (${
                              PRINT_PAPER_OPTIONS.find((p) => p.id === paperSize)?.name || ''
                            })`}
                            className="px-2.5 py-1 text-[11px] font-medium border border-slate-200 hover:bg-slate-100 text-slate-700 rounded transition-colors flex items-center gap-1 whitespace-nowrap"
                          >
                            <FileText className="w-3 h-3" />
                            Nota ({PRINT_PAPER_OPTIONS.find((p) => p.id === paperSize)?.shortLabel})
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenPrintModal(order, 'spk', paperSize)}
                            title={`Cetak SPK Produksi (${
                              PRINT_PAPER_OPTIONS.find((p) => p.id === paperSize)?.name || ''
                            })`}
                            className="px-2.5 py-1 text-[11px] font-medium border border-slate-200 hover:bg-slate-100 text-slate-700 rounded transition-colors flex items-center gap-1 whitespace-nowrap"
                          >
                            <Printer className="w-3 h-3" />
                            SPK ({PRINT_PAPER_OPTIONS.find((p) => p.id === paperSize)?.shortLabel})
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleQuickDownloadOrderPng(order, 'invoice', paperSize)
                            }
                            title="Download Invoice Format PNG (.png)"
                            className="px-2.5 py-1 text-[11px] font-semibold border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded transition-colors flex items-center gap-1 whitespace-nowrap"
                          >
                            <Download className="w-3 h-3" />
                            PNG
                          </button>
                          <button
                            type="button"
                            onClick={() => openWhatsAppAndPngModal(order, 'invoice')}
                            title="Bagikan Nota / Invoice via WhatsApp & Download PNG"
                            className="px-2.5 py-1 text-[11px] font-semibold border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded transition-colors flex items-center gap-1 whitespace-nowrap"
                          >
                            <Share2 className="w-3 h-3" />
                            WhatsApp
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteOrder(order.id)}
                            title="Hapus Pesanan"
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Pelunasan Piutang Order */}
      {settlingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleConfirmSettle}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-lg"
          >
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Terima Pembayaran / Pelunasan Piutang
              </h3>
            </div>

            <div className="text-xs space-y-1.5 bg-slate-50 p-3.5 rounded-md border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Nomor SPK:</span>
                <span className="font-mono font-semibold text-slate-900">
                  {settlingOrder.invoiceNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pelanggan:</span>
                <span className="font-semibold text-slate-900">
                  {settlingOrder.customerName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Tagihan:</span>
                <span className="font-mono tabular-nums">
                  {formatIDR(settlingOrder.totalAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Sudah Dibayar:</span>
                <span className="font-mono tabular-nums text-emerald-700">
                  {formatIDR(settlingOrder.paidAmount)}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold">
                <span className="text-slate-800">Sisa Piutang:</span>
                <span className="font-mono text-rose-600 tabular-nums">
                  {formatIDR(Math.max(0, settlingOrder.totalAmount - settlingOrder.paidAmount))}
                </span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-medium text-slate-700">
                    Nominal Pembayaran Diterima (Rp)
                  </label>
                  {(settleAmount > 0 || settleAmountInput !== '') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSettleAmountInput('');
                        setSettleAmountState(0);
                      }}
                      className="text-[10px] font-semibold text-slate-500 hover:text-rose-600"
                    >
                      Hapus / 0
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  required
                  min="0"
                  placeholder="0"
                  max={Math.max(0, settlingOrder.totalAmount - settlingOrder.paidAmount)}
                  value={settleAmountInput}
                  onChange={(e) =>
                    handleCleanNumberChange(e, setSettleAmountInput, setSettleAmountState, false)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs tabular-nums"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Masuk ke Akun Kas / Bank
                </label>
                <select
                  value={settleMethod}
                  onChange={(e) => setSettleMethod(e.target.value as CashPaymentMethod)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs bg-white font-semibold"
                >
                  <option value="Tunai">Kas Tunai</option>
                  <option value="Transfer Bank">Transfer Bank (Pilih Nama Bank)</option>
                  <option value="QRIS">QRIS / E-Wallet</option>
                </select>
              </div>

              {settleMethod === 'Transfer Bank' && (
                <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2.5">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Pilih Nama Bank Transfer Pelunasan
                    </label>
                    <select
                      value={settleBankChoice}
                      onChange={(e) => setSettleBankChoice(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs bg-white font-medium"
                    >
                      {BANK_TRANSFER_OPTIONS.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    {settleBankChoice === 'MANUAL_BANK' && (
                      <input
                        type="text"
                        placeholder="Ketik nama bank..."
                        value={settleCustomBank}
                        onChange={(e) => setSettleCustomBank(e.target.value)}
                        className="mt-2 w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs bg-white"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Keterangan Transfer / Pengirim / No. Ref (Opsional)
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: a.n. Pelanggan / Rek BCA Toko"
                      value={settleTransferRef}
                      onChange={(e) => setSettleTransferRef(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs bg-white"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSettlingOrder(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-md transition-colors"
              >
                {isSubmitting ? 'Memproses...' : 'Simpan Pelunasan & Catat Kas'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================
          MODAL MENU BAGIKAN VIA WHATSAPP & DOWNLOAD INVOICE FORMAT PNG (.PNG)
         ======================================================================== */}
      {waModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full shadow-xl overflow-hidden my-auto">
            {/* Header */}
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Share2 className="w-4 h-4 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold">
                    Menu Bagikan via WhatsApp & Download Invoice Format PNG
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    No. Nota: <span className="font-mono font-bold">{waModalOrder.invoiceNumber}</span> · Pelanggan:{' '}
                    <span className="font-semibold">{waModalOrder.customerName}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWaModalOrder(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 text-xs">
              {/* Left Column: PNG Preview & Download / Copy Actions */}
              <div className="lg:col-span-6 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-indigo-600" />
                    <span>Gambar Invoice / SPK (.PNG)</span>
                  </div>

                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md">
                    <button
                      type="button"
                      onClick={async () => {
                        setWaDocMode('invoice');
                        setIsGeneratingPng(true);
                        try {
                          const url = await generateOrderInvoicePngDataUrl(
                            waModalOrder,
                            storeSettings,
                            'invoice',
                            paperSize
                          );
                          setWaPngPreviewUrl(url);
                        } finally {
                          setIsGeneratingPng(false);
                        }
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                        waDocMode === 'invoice'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      Nota Invoice
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setWaDocMode('spk');
                        setIsGeneratingPng(true);
                        try {
                          const url = await generateOrderInvoicePngDataUrl(
                            waModalOrder,
                            storeSettings,
                            'spk',
                            paperSize
                          );
                          setWaPngPreviewUrl(url);
                        } finally {
                          setIsGeneratingPng(false);
                        }
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                        waDocMode === 'spk'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      SPK Produksi
                    </button>
                  </div>
                </div>

                {/* Format Kertas PNG Selector */}
                <div className="flex flex-wrap items-center gap-1">
                  {PRINT_PAPER_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={async () => {
                        onChangePaperSize(opt.id);
                        setIsGeneratingPng(true);
                        try {
                          const url = await generateOrderInvoicePngDataUrl(
                            waModalOrder,
                            storeSettings,
                            waDocMode,
                            opt.id
                          );
                          setWaPngPreviewUrl(url);
                        } finally {
                          setIsGeneratingPng(false);
                        }
                      }}
                      className={`px-2 py-1 rounded text-[10px] font-medium border ${
                        paperSize === opt.id
                          ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {opt.name}
                    </button>
                  ))}
                </div>

                {/* Image Preview Container */}
                <div className="border border-slate-200 rounded-lg bg-slate-100 p-3 max-h-80 overflow-y-auto flex items-center justify-center">
                  {isGeneratingPng ? (
                    <div className="py-16 text-slate-500 font-medium">
                      Menyiapkan gambar PNG resolusi tinggi...
                    </div>
                  ) : waPngPreviewUrl ? (
                    <img
                      src={waPngPreviewUrl}
                      alt="Preview Invoice PNG"
                      className="max-w-full h-auto rounded shadow-xs border border-slate-300"
                    />
                  ) : (
                    <div className="py-12 text-slate-400">Preview gambar PNG</div>
                  )}
                </div>

                {/* PNG Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const safeCust = (waModalOrder.customerName || 'Pelanggan-Umum')
                        .replace(/[^a-zA-Z0-9]/g, '-')
                        .slice(0, 24);
                      const prefix = waDocMode === 'spk' ? 'SPK' : 'Invoice';
                      triggerDownloadPng(
                        waPngPreviewUrl,
                        `${prefix}-${waModalOrder.invoiceNumber}-${safeCust}.png`
                      );
                      setWaActionFeedback(
                        'File gambar PNG berhasil diunduh ke perangkat Anda!'
                      );
                    }}
                    className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-md flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Format PNG (.png)
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        if (!waPngPreviewUrl) return;
                        const res = await fetch(waPngPreviewUrl);
                        const blob = await res.blob();
                        await navigator.clipboard.write([
                          new ClipboardItem({ 'image/png': blob }),
                        ]);
                        setWaActionFeedback(
                          'Gambar PNG disalin! Silakan tekan Ctrl+V (Paste) langsung di ruang chat WhatsApp.'
                        );
                      } catch {
                        setWaActionFeedback(
                          'Browser tidak mengizinkan salin gambar langsung, silakan klik tombol "Download Format PNG (.png)".'
                        );
                      }
                    }}
                    className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-md flex items-center justify-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Salin Gambar PNG (Paste ke WA)
                  </button>
                </div>
              </div>

              {/* Right Column: WhatsApp Recipient, Template & Send */}
              <div className="lg:col-span-6 space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div>
                    <label className="block font-bold text-slate-900 mb-1">
                      Nomor WhatsApp Tujuan (Pelanggan / Operator)
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: 6281234567890"
                      value={waPhoneInput}
                      onChange={(e) => setWaPhoneInput(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono text-xs focus:outline-none focus:border-slate-900"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Otomatis menggunakan awalan kode negara 62 (Indonesia).
                    </p>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-900 mb-1">
                      Pilih Template Pesan WhatsApp
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'INVOICE', label: 'Nota Tagihan' },
                          { id: 'READY_PICKUP', label: 'Siap Ambil' },
                          { id: 'SPK_OPERATOR', label: 'SPK Operator' },
                        ] as const
                      ).map((tpl) => (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => {
                            setWaTemplate(tpl.id);
                            setWaMessageText(
                              buildWhatsAppOrderMessage(
                                waModalOrder,
                                storeSettings,
                                tpl.id
                              )
                            );
                          }}
                          className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold border transition-colors ${
                            waTemplate === tpl.id
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {tpl.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-900 mb-1">
                      Isi Pesan Nota WhatsApp (Dapat Diedit)
                    </label>
                    <textarea
                      rows={9}
                      value={waMessageText}
                      onChange={(e) => setWaMessageText(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono text-[11px] leading-relaxed focus:outline-none focus:border-slate-900"
                    />
                  </div>
                </div>

                {waActionFeedback && (
                  <div className="px-3 py-2 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium">
                    {waActionFeedback}
                  </div>
                )}

                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(waMessageText);
                          setWaActionFeedback(
                            'Teks pesan WhatsApp berhasil disalin ke clipboard!'
                          );
                        } catch {
                          // ignore
                        }
                      }}
                      className="px-3.5 py-2 border border-slate-300 hover:bg-slate-100 text-slate-800 font-semibold rounded-md flex items-center justify-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Salin Teks Pesan WA
                    </button>

                    <a
                      href={`https://wa.me/${formatWhatsAppPhone(waPhoneInput)}?text=${encodeURIComponent(
                        waMessageText
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-md flex items-center justify-center gap-1.5 text-center"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Kirim ke WhatsApp Sekarang
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Jendela Layar Penuh Kasir ATK & Perlengkapan (Khusus Mode Desktop & Tablet) */}
      <AtkFullscreenPosModal
        isOpen={isAtkFullscreenOpen}
        isMinimized={isAtkFullscreenMinimized}
        onClose={() => {
          setIsAtkFullscreenOpen(false);
          setIsAtkFullscreenMinimized(false);
        }}
        onMinimize={() => setIsAtkFullscreenMinimized(true)}
        onRestore={() => setIsAtkFullscreenMinimized(false)}
        inventory={inventory}
        activeCashierName={activeCashierName}
        cashierList={cashierList}
        storeSettings={
          storeSettings || {
            storeName: 'CetakPro Digital Printing',
            address: '',
            phone: '',
            email: '',
            footerNotes: '',
            activeCashierName: activeCashierName || 'Admin Kasir',
          }
        }
        paperSize={paperSize}
        nextInvoiceNo={nextInvoiceNo}
        onCreateOrder={onCreateOrder}
        onOpenPrintModal={onOpenPrintModal}
      />
    </div>
  );
};
