export type OrderCategory =
  | 'Banner & Outdoor'
  | 'Indoor & Sticker'
  | 'Print A3+ & Dokumen'
  | 'Merchandise & Display'
  | 'Offset & Kemasan'
  | 'Fotokopi, Jilid & Laminating'
  | 'Penjualan ATK'
  | 'Jasa Desain & Servis IT';

export type OrderUnitType = 'm2' | 'Lembar' | 'Roll' | 'Pcs' | 'Paket';

export type PaymentStatus = 'Lunas' | 'DP / Belum Lunas' | 'Belum Bayar';

export type PaymentMethod = 'Tunai' | 'Transfer Bank' | 'QRIS' | 'Tempo';

export type ProductionStatus =
  | 'Antrean Desain'
  | 'Proses Cetak'
  | 'Finishing'
  | 'Siap Ambil'
  | 'Selesai'
  | 'Dibatalkan';

export interface PrintOrder {
  id: string;
  ownerId: string;
  invoiceNumber: string;
  orderDate: string;
  deadlineDate: string;
  customerName: string;
  customerPhone: string;
  jobTitle: string;
  category: OrderCategory;
  materialId: string;
  materialName: string;
  unitType: OrderUnitType;
  widthM: number;
  heightM: number;
  qty: number;
  totalAreaOrQty: number;
  unitPrice: number;
  unitCost: number;
  designFee: number;
  finishingDesc: string;
  finishingFee: number;
  discount: number;
  totalAmount: number;
  totalCogs: number;
  paidAmount: number;
  paymentAmount?: number;
  changeAmount?: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  productionStatus: ProductionStatus;
  notes: string;
  cashierName?: string;
  cartItemsJson?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface OrderCartItem {
  id: string;
  jobTitle: string;
  category: OrderCategory;
  materialId: string;
  materialName: string;
  unitType: OrderUnitType;
  widthM: number;
  heightM: number;
  qty: number;
  totalAreaOrQty: number;
  unitPrice: number;
  unitCost: number;
  baseSubtotal: number;
  designFee: number;
  finishingDesc: string;
  finishingFee: number;
  discount?: number;
  itemTotalAmount: number;
  itemTotalCogs: number;
}

export type InventoryCategory =
  | 'Bahan Outdoor'
  | 'Bahan Indoor & Sticker'
  | 'Kertas A3+ & Media'
  | 'Tinta & Toner'
  | 'Display & Finishing'
  | 'ATK & Perlengkapan'
  | 'Part & Storage IT';

export type InventoryUnit = 'm2' | 'Lembar' | 'Roll' | 'Liter' | 'Botol' | 'Pcs' | 'Pack';

export interface InventoryItem {
  id: string;
  ownerId: string;
  sku: string;
  name: string;
  category: InventoryCategory;
  unit: InventoryUnit;
  stockQty: number;
  minStockQty: number;
  costPerUnit: number;
  defaultSellPrice: number;
  supplierName: string;
  location: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type TransactionType = 'Pemasukan' | 'Pengeluaran';

export type PnlGroup =
  | 'Pendapatan Cetak'
  | 'Pendapatan Jasa & Desain'
  | 'HPP Bahan & Tinta'
  | 'HPP Subkon & Produksi'
  | 'Beban Gaji & Operator'
  | 'Beban Listrik & Utilitas'
  | 'Beban Sewa & Tempat'
  | 'Beban Servis & Mesin'
  | 'Beban Operasional Lainnya'
  | 'Non-Laba Rugi / Modal';

export type CashPaymentMethod = 'Tunai' | 'Transfer Bank' | 'QRIS';

export interface CashTransaction {
  id: string;
  ownerId: string;
  txDate: string;
  referenceNo: string;
  type: TransactionType;
  pnlGroup: PnlGroup;
  description: string;
  amount: number;
  paymentMethod: CashPaymentMethod;
  relatedId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SupplierPayable {
  id: string;
  ownerId: string;
  supplierName: string;
  supplierPhone: string;
  invoiceNo: string;
  txDate: string;
  dueDate: string;
  itemSummary: string;
  totalAmount: number;
  paidAmount: number;
  status: 'Belum Lunas' | 'Lunas';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type StockMutationType =
  | 'Stok Masuk (Restock)'
  | 'Pemakaian Produksi'
  | 'Bahan Rusak / Gagal Cetak'
  | 'Penyesuaian Opname';

export interface StockMutationLog {
  id: string;
  ownerId: string;
  logDate: string;
  materialId: string;
  materialName: string;
  mutationType: StockMutationType;
  qtyDelta: number;
  resultingStock: number;
  unit: string;
  referenceInfo: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type ThemeColor = 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose';

export type ThemeMode = 'light' | 'dark';

export type PrintPaperSize =
  | 'THERMAL_80'
  | 'THERMAL_100'
  | 'A5_LANDSCAPE'
  | 'A6_LANDSCAPE'
  | 'SIZE_210X100';

export interface PrintPaperOption {
  id: PrintPaperSize;
  name: string;
  shortLabel: string;
  dimensions: string;
  group: 'THERMAL' | 'LARGE_SHEET';
  desc: string;
}

export const PRINT_PAPER_OPTIONS: PrintPaperOption[] = [
  {
    id: 'THERMAL_80',
    name: 'Thermal 80mm',
    shortLabel: '80mm Roll',
    dimensions: 'Lebar 80mm × Roll',
    group: 'THERMAL',
    desc: 'Struk kasir POS & SPK printer thermal standar 80mm',
  },
  {
    id: 'THERMAL_100',
    name: 'Thermal 100mm',
    shortLabel: '100mm Roll',
    dimensions: 'Lebar 100mm × Roll',
    group: 'THERMAL',
    desc: 'Struk lebar & label SPK printer thermal 100mm (4 inch)',
  },
  {
    id: 'A5_LANDSCAPE',
    name: 'A5 Landscape',
    shortLabel: 'A5 Landscape',
    dimensions: '210 × 148 mm',
    group: 'LARGE_SHEET',
    desc: 'Nota faktur & SPK besar ukuran setengah A4 mendatar',
  },
  {
    id: 'A6_LANDSCAPE',
    name: 'A6 Landscape',
    shortLabel: 'A6 Landscape',
    dimensions: '148 × 105 mm',
    group: 'LARGE_SHEET',
    desc: 'Nota & SPK ringkas ukuran seperempat A4 mendatar',
  },
  {
    id: 'SIZE_210X100',
    name: 'Ukuran 210×100mm',
    shortLabel: '210×100 mm',
    dimensions: '210 × 100 mm (Kertas A4/F4)',
    group: 'LARGE_SHEET',
    desc: 'Nota 210×100mm pada kertas A4 / F4 Folio (Opsi Portrait di Atas Kertas / Landscape di Tengah Halaman)',
  },
];

export type NavTab =
  | 'DASHBOARD'
  | 'ORDERS'
  | 'INVENTORY'
  | 'CASH'
  | 'PNL'
  | 'SETTINGS';

export interface StoreSettings {
  ownerId: string;
  storeName: string;
  tagline: string;
  ownerName: string;
  phone: string;
  address: string;
  bankAccountInfo: string;
  invoiceFooterNote: string;
  themeColor: ThemeColor;
  themeMode?: ThemeMode;
  logoDataUrl?: string;
  customStoreUrl?: string;
  customSlug?: string;
  activeCashierName?: string;
  cashierList?: string[];
  appAuthEmail?: string;
  appAuthPhone?: string;
  appAuthPasswordHash?: string;
  appAuthVerified?: boolean;
  autoSaveEnabled: boolean;
  lastActiveTab: NavTab;
  lastSavedLabel: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const DEFAULT_STORE_SETTINGS: Omit<
  StoreSettings,
  'ownerId' | 'createdAt' | 'updatedAt'
> = {
  storeName: 'CetakPro Digital Printing',
  tagline: 'Layanan Cetak Outdoor, Indoor, Sticker, Print A3+ & Merchandise',
  ownerName: 'Admin Produksi & Keuangan',
  phone: '0812-8899-0011',
  address: 'Jl. Percetakan Raya No. 88, Kawasan Niaga Grafika',
  bankAccountInfo: 'BCA 8820-4455-66 a.n CetakPro Digital Printing',
  invoiceFooterNote:
    'Harap periksa kembali ejaan dan ukuran sebelum naik cetak. Barang yang sudah dicetak sesuai persetujuan tidak dapat diretur.',
  themeColor: 'slate',
  themeMode: 'light',
  logoDataUrl: '',
  customStoreUrl: 'https://cetakpro-printing.id',
  customSlug: 'cetakpro-pusat',
  activeCashierName: 'Rina (Kasir Utama)',
  cashierList: ['Rina (Kasir Utama)', 'Budi (Kasir Shift Sore)', 'Dewi (Admin SPK)'],
  appAuthEmail: '',
  appAuthPhone: '',
  appAuthPasswordHash: '',
  appAuthVerified: false,
  autoSaveEnabled: true,
  lastActiveTab: 'DASHBOARD',
  lastSavedLabel: 'Belum ada penyimpanan',
};

export const THEME_OPTIONS: {
  id: ThemeColor;
  name: string;
  desc: string;
  swatchHex: string;
  btnBg: string;
  btnHover: string;
  activeBorder: string;
  activeText: string;
  badgeText: string;
}[] = [
  {
    id: 'slate',
    name: 'Slate Industrial',
    desc: 'Hitam abu-abu monokrom profesional (Default)',
    swatchHex: '#0F172A',
    btnBg: 'bg-slate-900',
    btnHover: 'hover:bg-slate-800',
    activeBorder: 'border-slate-900',
    activeText: 'text-slate-900',
    badgeText: 'text-slate-700',
  },
  {
    id: 'indigo',
    name: 'Cobalt Indigo',
    desc: 'Biru tua korporat modern berwibawa',
    swatchHex: '#3730A3',
    btnBg: 'bg-indigo-700',
    btnHover: 'hover:bg-indigo-600',
    activeBorder: 'border-indigo-700',
    activeText: 'text-indigo-700',
    badgeText: 'text-indigo-700',
  },
  {
    id: 'emerald',
    name: 'Emerald Ledger',
    desc: 'Hijau zamrud akuntansi & finansial',
    swatchHex: '#065F46',
    btnBg: 'bg-emerald-700',
    btnHover: 'hover:bg-emerald-600',
    activeBorder: 'border-emerald-700',
    activeText: 'text-emerald-700',
    badgeText: 'text-emerald-700',
  },
  {
    id: 'amber',
    name: 'Amber Creative',
    desc: 'Kuning-jingga hangat khas studio kreatif',
    swatchHex: '#B45309',
    btnBg: 'bg-amber-700',
    btnHover: 'hover:bg-amber-600',
    activeBorder: 'border-amber-700',
    activeText: 'text-amber-700',
    badgeText: 'text-amber-700',
  },
  {
    id: 'rose',
    name: 'Crimson Press',
    desc: 'Merah marun tegas khas mesin cetak offset',
    swatchHex: '#9F1239',
    btnBg: 'bg-rose-700',
    btnHover: 'hover:bg-rose-600',
    activeBorder: 'border-rose-700',
    activeText: 'text-rose-700',
    badgeText: 'text-rose-700',
  },
];

export function formatIDR(value: number): string {
  const num = Number.isFinite(value) ? Math.round(value) : 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatNumberID(value: number, maxDecimals = 2): string {
  const num = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(num);
}

export function formatDateID(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr || '-';
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
  ];
  const mIdx = parseInt(m, 10) - 1;
  return `${d} ${months[mIdx] || m} ${y}`;
}

export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function nowTimeLabel(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${todayISO()} ${hh}:${mm}:${ss}`;
}

export function clampString(val: string, maxLength: number, fallback = ''): string {
  const trimmed = (val ?? fallback).trim();
  return trimmed.slice(0, maxLength);
}

export function sanitizeCode(val: string, maxLength = 40, fallback = 'INV-001'): string {
  const cleaned = (val || fallback)
    .toUpperCase()
    .replace(/[^A-Z0-9\-/]/g, '-')
    .slice(0, maxLength);
  return cleaned.length >= 3 ? cleaned : fallback;
}

export function sanitizeSku(val: string, maxLength = 40, fallback = 'SKU-01'): string {
  const cleaned = (val || fallback)
    .toUpperCase()
    .replace(/[^A-Z0-9\-]/g, '-')
    .slice(0, maxLength);
  return cleaned.length >= 2 ? cleaned : fallback;
}

export interface OrderFinishingBreakdownLine {
  id: string;
  label: string;
  amount: number;
}

export interface ParsedA3FinishingFlags {
  isA3Order: boolean;
  bolakBalik: boolean;
  satuMuka: boolean;
  laminasiGlossy: boolean;
  laminasiDoff: boolean;
  laminasiBolakBalik: boolean;
  potongSisiRapi: boolean;
  potongDieCut: boolean;
  potongKissCut: boolean;
  multiplyByQty: boolean;
}

export function cleanFinishingDescText(rawDesc: string, category?: string): string {
  if (!rawDesc) return '';
  if ((category || '').toLowerCase().includes('atk')) {
    return '';
  }
  const cleaned = rawDesc
    .replace(/\s*\[x\d+\]\s*/gi, ' ')
    .replace(/\[#\d+\s*:\s*SKU\s*[:\-]?[^\]]*\]/gi, ' ')
    .replace(/\(\s*SKU\s*[:\-]?\s*[A-Z0-9\-_]+\s*\)/gi, ' ')
    .replace(/\[\s*SKU\s*[:\-]?\s*[A-Z0-9\-_]+\s*\]/gi, ' ')
    .replace(/\bSKU\s*[:\-]?\s*[A-Z0-9\-_]+/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;|•\-–—]+|[\s,;|•\-–—]+$/g, '')
    .trim();
  return cleaned;
}

export function parseA3FinishingFlags(order: {
  unitType?: string;
  category?: string;
  finishingDesc?: string;
}): ParsedA3FinishingFlags {
  const desc = (order.finishingDesc || '').toLowerCase();
  const unitLower = (order.unitType || '').toLowerCase();
  const catLower = (order.category || '').toLowerCase();
  const isA3Order =
    unitLower === 'lembar' ||
    catLower.includes('a3') ||
    desc.includes('diecut') ||
    desc.includes('die cut') ||
    desc.includes('kiss cut') ||
    desc.includes('kisscut') ||
    desc.includes('potong sisi rapi') ||
    desc.includes('print bolak balik');

  const bolakBalik =
    desc.includes('print bolak balik') ||
    desc.includes('cetak bolak balik') ||
    desc.includes('bolak balik (+50%)') ||
    (desc.startsWith('bolak balik') && !desc.startsWith('bolak balik laminasi'));

  const satuMuka =
    !bolakBalik &&
    (desc.includes('1 muka') || desc.includes('satu muka'));

  const laminasiGlossy = desc.includes('laminasi glossy');
  const laminasiDoff = desc.includes('laminasi doff');
  const hasExplicitSingleSidedLaminasi =
    desc.includes('laminasi 1 muka') ||
    desc.includes('glossy 1 muka') ||
    desc.includes('doff 1 muka');
  const laminasiBolakBalik =
    !hasExplicitSingleSidedLaminasi &&
    (desc.includes('laminasi glossy bolak balik') ||
      desc.includes('laminasi doff bolak balik') ||
      desc.includes('laminasi bolak balik') ||
      desc.includes('2x rp 3.000') ||
      desc.includes('2× rp 3.000') ||
      (bolakBalik && (laminasiGlossy || laminasiDoff)));

  const potongSisiRapi = desc.includes('potong sisi rapi');
  const potongDieCut =
    desc.includes('potong mesin putus') ||
    desc.includes('diecut') ||
    desc.includes('die cut');
  const potongKissCut =
    desc.includes('potong mesin setengah putus') ||
    desc.includes('kiss cut') ||
    desc.includes('kisscut');
  const multiplyByQty = true;

  return {
    isA3Order,
    bolakBalik,
    satuMuka,
    laminasiGlossy,
    laminasiDoff,
    laminasiBolakBalik,
    potongSisiRapi,
    potongDieCut,
    potongKissCut,
    multiplyByQty,
  };
}

export interface FinishingLineSource {
  unitType?: string;
  category?: string;
  qty: number;
  totalAreaOrQty: number;
  unitPrice: number;
  finishingDesc: string;
  finishingFee: number;
}

export function extractItemFinishingLines(
  order: FinishingLineSource
): OrderFinishingBreakdownLine[] {
  const catLower = (order.category || '').toLowerCase();
  if (catLower.includes('atk')) {
    return [];
  }

  const flags = parseA3FinishingFlags(order);
  const lines: OrderFinishingBreakdownLine[] = [];
  const baseSubtotal = Math.round(
    (Number(order.totalAreaOrQty) || 0) * (Number(order.unitPrice) || 0)
  );
  const qty = Math.max(1, Number(order.qty) || 1);
  const mult = qty;
  const cleanDesc = cleanFinishingDescText(order.finishingDesc || '', order.category);

  const hasAnyA3Flag =
    flags.bolakBalik ||
    flags.satuMuka ||
    flags.laminasiGlossy ||
    flags.laminasiDoff ||
    flags.potongSisiRapi ||
    flags.potongDieCut ||
    flags.potongKissCut;

  if (!hasAnyA3Flag) {
    if (order.finishingFee > 0 || cleanDesc) {
      return [
        {
          id: 'standard-finishing',
          label: `Jasa Finishing (${cleanDesc || 'Standar'})`,
          amount: Number(order.finishingFee) || 0,
        },
      ];
    }
    return [];
  }

  let accountedFee = 0;

  if (flags.bolakBalik) {
    const bbFee = Math.round(baseSubtotal * 0.5);
    accountedFee += bbFee;
    lines.push({
      id: 'print-bolak-balik',
      label:
        mult > 1
          ? `Tambahan Cetak Bolak Balik (+50% × ${mult} lembar)`
          : 'Tambahan Cetak Bolak Balik (+50% harga cetak)',
      amount: bbFee,
    });
  } else if (flags.satuMuka) {
    lines.push({
      id: 'print-1-muka',
      label: 'Sisi Cetak: 1 Muka',
      amount: 0,
    });
  }

  if (flags.laminasiGlossy) {
    const is2Sided = flags.laminasiBolakBalik;
    const fee = (is2Sided ? 6000 : 3000) * mult;
    accountedFee += fee;
    lines.push({
      id: 'laminasi-glossy',
      label: is2Sided
        ? `Jasa Laminasi Glossy Bolak Balik (${mult} × 2 × Rp 3.000)`
        : `Jasa Laminasi Glossy (${mult} × Rp 3.000)`,
      amount: fee,
    });
  }

  if (flags.laminasiDoff) {
    const is2Sided = flags.laminasiBolakBalik;
    const fee = (is2Sided ? 6000 : 3000) * mult;
    accountedFee += fee;
    lines.push({
      id: 'laminasi-doff',
      label: is2Sided
        ? `Jasa Laminasi Doff Bolak Balik (${mult} × 2 × Rp 3.000)`
        : `Jasa Laminasi Doff (${mult} × Rp 3.000)`,
      amount: fee,
    });
  }

  if (flags.potongSisiRapi) {
    lines.push({
      id: 'potong-sisi-rapi',
      label: 'Finishing Potong Sisi Rapi',
      amount: 0,
    });
  }

  if (flags.potongDieCut) {
    const fee = 3000 * mult;
    accountedFee += fee;
    lines.push({
      id: 'potong-diecut',
      label: `Jasa Potong Mesin Putus / Die Cut (${mult} × Rp 3.000)`,
      amount: fee,
    });
  }

  if (flags.potongKissCut) {
    const fee = 3000 * mult;
    accountedFee += fee;
    lines.push({
      id: 'potong-kisscut',
      label: `Jasa Potong Mesin Setengah Putus / Kiss Cut (${mult} × Rp 3.000)`,
      amount: fee,
    });
  }

  const remainder = Math.round((Number(order.finishingFee) || 0) - accountedFee);
  if (remainder > 0) {
    lines.push({
      id: 'extra-finishing',
      label: 'Biaya Finishing Tambahan Lainnya',
      amount: remainder,
    });
  }

  return lines;
}

export function extractOrderFinishingLines(order: PrintOrder): OrderFinishingBreakdownLine[] {
  return extractItemFinishingLines(order);
}

export interface BannerFinishingOption {
  id: string;
  label: string;
  desc: string;
  extraWidthM: number;
  extraHeightM: number;
  allowanceNote?: string;
}

export const BANNER_FINISHING_OPTIONS: BannerFinishingOption[] = [
  {
    id: 'PRES_TANPA_MATA_AYAM',
    label: 'Siming Lipat pres gambar tanpa keling/mata ayam',
    desc: 'Siming Lipat pres gambar tanpa keling/mata ayam',
    extraWidthM: 0,
    extraHeightM: 0,
  },
  {
    id: 'PRES_MATA_AYAM_PER_METER',
    label: 'Siming Lipat pres gambar keling/mata ayam per meter',
    desc: 'Siming Lipat pres gambar keling/mata ayam per meter',
    extraWidthM: 0,
    extraHeightM: 0,
  },
  {
    id: 'PUTIHAN_2CM',
    label: 'Siming Lipat putihan 2cm',
    desc: 'Siming Lipat putihan 2cm',
    extraWidthM: 0,
    extraHeightM: 0,
  },
  {
    id: 'PUTIHAN_2CM_MATA_AYAM_PER_METER',
    label: 'Siming Lipat putihan 2cm keling/mata ayam per meter',
    desc: 'Siming Lipat putihan 2cm keling/mata ayam per meter',
    extraWidthM: 0,
    extraHeightM: 0,
  },
  {
    id: 'KOLONG_ATAS_BAWAH',
    label: 'Siming Kolong Atas-Bawah untuk bambu/pipa',
    desc: 'Siming Kolong Atas-Bawah untuk bambu/pipa',
    extraWidthM: 0,
    extraHeightM: 0.14,
    allowanceNote: '+7cm atas & +7cm bawah (otomatis terhitung tanpa tampil di nota)',
  },
  {
    id: 'KOLONG_KANAN_KIRI',
    label: 'Siming Kolong Kanan-Kiri untuk bambu/pipa',
    desc: 'Siming Kolong Kanan-Kiri untuk bambu/pipa',
    extraWidthM: 0.14,
    extraHeightM: 0,
    allowanceNote: '+7cm kanan & +7cm kiri (otomatis terhitung tanpa tampil di nota)',
  },
  {
    id: 'POLOSAN_PUTIH_5CM',
    label: 'Polosan lebihan putih 5cm tanpa finishing',
    desc: 'Polosan lebihan putih 5cm tanpa finishing',
    extraWidthM: 0.1,
    extraHeightM: 0.1,
    allowanceNote: '+5cm keliling / +10cm panjang & tinggi (otomatis terhitung habis bahan)',
  },
];

export function calculateBannerEffectiveDimensions(params: {
  unitType?: string;
  widthM?: number;
  heightM?: number;
  qty?: number;
  finishingDesc?: string;
}): {
  nominalWidthM: number;
  nominalHeightM: number;
  effectiveWidthM: number;
  effectiveHeightM: number;
  extraWidthM: number;
  extraHeightM: number;
  hasHiddenAllowance: boolean;
  nominalArea: number;
  effectiveArea: number;
  matchedOption?: BannerFinishingOption;
} {
  const w = Math.max(0, Number(params.widthM) || 0);
  const h = Math.max(0, Number(params.heightM) || 0);
  const q = Math.max(0, Number(params.qty) || 0);
  if (params.unitType !== 'm2') {
    return {
      nominalWidthM: w,
      nominalHeightM: h,
      effectiveWidthM: w,
      effectiveHeightM: h,
      extraWidthM: 0,
      extraHeightM: 0,
      hasHiddenAllowance: false,
      nominalArea: q,
      effectiveArea: q,
    };
  }

  const descLower = (params.finishingDesc || '').toLowerCase();
  let extraW = 0;
  let extraH = 0;
  let matchedOption: BannerFinishingOption | undefined;

  if (descLower.includes('kolong atas-bawah') || descLower.includes('kolong atas bawah')) {
    extraH = 0.14;
    matchedOption = BANNER_FINISHING_OPTIONS.find((o) => o.id === 'KOLONG_ATAS_BAWAH');
  } else if (descLower.includes('kolong kanan-kiri') || descLower.includes('kolong kanan kiri')) {
    extraW = 0.14;
    matchedOption = BANNER_FINISHING_OPTIONS.find((o) => o.id === 'KOLONG_KANAN_KIRI');
  } else if (
    descLower.includes('polosan lebihan putih 5cm') ||
    descLower.includes('lebihan bahan putih 5cm') ||
    descLower.includes('lebihan putih 5cm')
  ) {
    extraW = 0.1;
    extraH = 0.1;
    matchedOption = BANNER_FINISHING_OPTIONS.find((o) => o.id === 'POLOSAN_PUTIH_5CM');
  } else {
    matchedOption = BANNER_FINISHING_OPTIONS.find(
      (o) => o.desc.toLowerCase() === descLower.trim()
    );
  }

  const effectiveWidthM = w > 0 ? Number((w + extraW).toFixed(4)) : 0;
  const effectiveHeightM = h > 0 ? Number((h + extraH).toFixed(4)) : 0;
  const nominalArea = Number((w * h * q).toFixed(4));
  const effectiveArea = Number((effectiveWidthM * effectiveHeightM * q).toFixed(4));
  const hasHiddenAllowance = extraW > 0 || extraH > 0;

  return {
    nominalWidthM: w,
    nominalHeightM: h,
    effectiveWidthM,
    effectiveHeightM,
    extraWidthM: extraW,
    extraHeightM: extraH,
    hasHiddenAllowance,
    nominalArea,
    effectiveArea,
    matchedOption,
  };
}

export interface ItemDetailedBreakdown {
  isA3Sheet: boolean;
  baseSubtotal: number;
  basePrintLabel: string;
  unitPriceLabel: string;
  dimensionText: string;
  finishingLines: OrderFinishingBreakdownLine[];
  cleanFinishingDesc: string;
  designFee: number;
  discount: number;
  itemSubtotal: number;
  hasExtraComponents: boolean;
  subtotalFormulaNumbers: string;
  subtotalLabelWithFormula: string;
}

export function extractItemDetailedBreakdown(item: {
  jobTitle?: string;
  category?: string;
  materialName?: string;
  unitType?: string;
  widthM?: number;
  heightM?: number;
  qty: number;
  totalAreaOrQty: number;
  unitPrice: number;
  designFee?: number;
  finishingDesc?: string;
  finishingFee?: number;
  discount?: number;
  itemTotalAmount?: number;
}): ItemDetailedBreakdown {
  const qty = Math.max(1, Number(item.qty) || 1);
  const bannerDims = calculateBannerEffectiveDimensions({
    unitType: item.unitType,
    widthM: item.widthM,
    heightM: item.heightM,
    qty,
    finishingDesc: item.finishingDesc,
  });
  const totalAreaOrQty =
    item.unitType === 'm2' && bannerDims.hasHiddenAllowance && bannerDims.effectiveArea > 0
      ? bannerDims.effectiveArea
      : Number(item.totalAreaOrQty) || qty;
  const unitPrice = Number(item.unitPrice) || 0;
  const baseSubtotal = Math.round(totalAreaOrQty * unitPrice);
  const catLower = (item.category || '').toLowerCase();
  const isAtkSale = catLower.includes('atk');
  const designFee = isAtkSale ? 0 : Number(item.designFee) || 0;
  const finishingFee = isAtkSale ? 0 : Number(item.finishingFee) || 0;
  const discount = Number(item.discount) || 0;
  const unitTypeRaw = item.unitType || 'Pcs';
  const unitLower = unitTypeRaw.toLowerCase();
  const matLower = `${item.jobTitle || ''} ${item.materialName || ''}`.toLowerCase();

  const isA3Sheet =
    !isAtkSale &&
    (catLower.includes('a3') ||
      (unitLower === 'lembar' &&
        !catLower.includes('fotokopi') &&
        !catLower.includes('atk') &&
        !catLower.includes('jasa')));
  const isSticker =
    matLower.includes('stiker') || matLower.includes('sticker');
  const isAtkOrService =
    isAtkSale ||
    catLower.includes('jasa') ||
    catLower.includes('fotokopi');

  const dimensionText =
    unitTypeRaw === 'm2'
      ? bannerDims.hasHiddenAllowance
        ? `${formatNumberID(Number(item.widthM) || 0)}m × ${formatNumberID(Number(item.heightM) || 0)}m × ${qty} pcs`
        : `${formatNumberID(Number(item.widthM) || 0)}m × ${formatNumberID(Number(item.heightM) || 0)}m × ${qty} pcs (${formatNumberID(totalAreaOrQty)} m²)`
      : isA3Sheet
      ? `${formatNumberID(qty)} lembar A3+`
      : `${formatNumberID(qty)} ${unitTypeRaw}`;

  const unitPriceLabel =
    unitTypeRaw === 'm2'
      ? `${formatIDR(unitPrice)} / m²`
      : isA3Sheet
      ? `${formatIDR(unitPrice)} / lembar A3+`
      : `${formatIDR(unitPrice)} / ${unitLower}`;

  const basePrintLabel =
    unitTypeRaw === 'm2'
      ? `${dimensionText} × ${formatIDR(unitPrice)}/m²`
      : isA3Sheet
      ? `${formatNumberID(qty)} lembar ${isSticker ? 'stiker ' : ''}A3+ × ${formatIDR(unitPrice)}/lembar`
      : isAtkOrService
      ? `${formatNumberID(qty)} ${unitLower} × ${formatIDR(unitPrice)}/${unitLower}`
      : `${formatNumberID(qty)} ${unitLower} × ${formatIDR(unitPrice)}/${unitLower}`;

  const finishingLines = isAtkSale
    ? []
    : extractItemFinishingLines({
        unitType: item.unitType,
        category: item.category,
        qty,
        totalAreaOrQty,
        unitPrice,
        finishingDesc: item.finishingDesc || '',
        finishingFee,
      });

  const cleanFinishingDesc = isAtkSale
    ? ''
    : cleanFinishingDescText(item.finishingDesc || '', item.category);
  const computedSubtotal = Math.max(
    0,
    baseSubtotal + designFee + finishingFee - discount
  );
  const itemSubtotal =
    typeof item.itemTotalAmount === 'number' && item.itemTotalAmount > 0
      ? item.itemTotalAmount
      : computedSubtotal;

  const positiveParts: string[] = [formatNumberID(baseSubtotal)];
  const paidFinishings = finishingLines.filter((fl) => fl.amount > 0);
  if (paidFinishings.length > 0) {
    paidFinishings.forEach((fl) => positiveParts.push(formatNumberID(fl.amount)));
  } else if (finishingFee > 0) {
    positiveParts.push(formatNumberID(finishingFee));
  }
  if (designFee > 0) {
    positiveParts.push(formatNumberID(designFee));
  }

  let subtotalFormulaNumbers = positiveParts.join(' + ');
  if (discount > 0) {
    subtotalFormulaNumbers += ` - ${formatNumberID(discount)}`;
  }

  const hasExtraComponents =
    finishingFee > 0 || designFee > 0 || discount > 0;

  const subtotalLabelWithFormula = hasExtraComponents
    ? `Sub Total (${subtotalFormulaNumbers})`
    : 'Sub Total';

  return {
    isA3Sheet,
    baseSubtotal,
    basePrintLabel,
    unitPriceLabel,
    dimensionText,
    finishingLines,
    cleanFinishingDesc,
    designFee,
    discount,
    itemSubtotal,
    hasExtraComponents,
    subtotalFormulaNumbers,
    subtotalLabelWithFormula,
  };
}

export interface BankTransferOption {
  id: string;
  name: string;
  shortLabel: string;
  category: 'UTAMA' | 'SWASTA' | 'DIGITAL' | 'DAERAH_LAINNYA';
}

export const BANK_TRANSFER_OPTIONS: BankTransferOption[] = [
  { id: 'Bank BCA', name: 'Bank BCA (Transfer / m-BCA / KlikBCA)', shortLabel: 'BCA', category: 'UTAMA' },
  { id: 'Bank Mandiri', name: "Bank Mandiri (Livin' / Kopra Mandiri)", shortLabel: 'Mandiri', category: 'UTAMA' },
  { id: 'Bank BRI', name: 'Bank BRI (BRImo / Transfer BRI)', shortLabel: 'BRI', category: 'UTAMA' },
  { id: 'Bank BNI', name: 'Bank BNI (wondr by BNI / Mobile)', shortLabel: 'BNI', category: 'UTAMA' },
  { id: 'Bank BSI', name: 'Bank BSI (Bank Syariah Indonesia / BYOND)', shortLabel: 'BSI', category: 'UTAMA' },
  { id: 'Bank CIMB Niaga', name: 'Bank CIMB Niaga (OCTO Mobile)', shortLabel: 'CIMB Niaga', category: 'SWASTA' },
  { id: 'Bank Permata', name: 'Bank Permata (PermataME)', shortLabel: 'Permata', category: 'SWASTA' },
  { id: 'Bank Danamon', name: 'Bank Danamon (D-Bank PRO)', shortLabel: 'Danamon', category: 'SWASTA' },
  { id: 'Bank BTN', name: 'Bank BTN (BTN Mobile)', shortLabel: 'BTN', category: 'UTAMA' },
  { id: 'Bank OCBC NISP', name: 'Bank OCBC Indonesia', shortLabel: 'OCBC', category: 'SWASTA' },
  { id: 'Bank Panin', name: 'Panin Bank', shortLabel: 'Panin', category: 'SWASTA' },
  { id: 'Bank Maybank', name: 'Maybank Indonesia (M2U)', shortLabel: 'Maybank', category: 'SWASTA' },
  { id: 'Bank Mega', name: 'Bank Mega (M-Smile)', shortLabel: 'Mega', category: 'SWASTA' },
  { id: 'Bank Muamalat', name: 'Bank Muamalat (Muamalat DIN)', shortLabel: 'Muamalat', category: 'SWASTA' },
  { id: 'Bank Jago', name: 'Bank Jago', shortLabel: 'Bank Jago', category: 'DIGITAL' },
  { id: 'SeaBank', name: 'SeaBank Indonesia', shortLabel: 'SeaBank', category: 'DIGITAL' },
  { id: 'Bank Neo Commerce', name: 'Bank Neo Commerce (BNC / neobank)', shortLabel: 'BNC', category: 'DIGITAL' },
  { id: 'Jenius BTPN', name: 'Jenius / Bank SMBC Indonesia', shortLabel: 'Jenius', category: 'DIGITAL' },
  { id: 'Blu BCA Digital', name: 'blu by BCA Digital', shortLabel: 'blu BCA', category: 'DIGITAL' },
  { id: 'Bank Daerah (BPD)', name: 'Bank Daerah / BPD (BJB, Bank Jatim, Bank Jateng, DKI, dll)', shortLabel: 'BPD Daerah', category: 'DAERAH_LAINNYA' },
  { id: 'MANUAL_BANK', name: 'Lainnya (Ketik Nama Bank Manual)', shortLabel: 'Bank Lainnya', category: 'DAERAH_LAINNYA' },
];

const BANK_NOTE_REGEX = /\[Transfer:\s*([^\]|]+?)(?:\s*\|\s*([^\]]+))?\]\s*/i;

export function buildOrderNotesWithBankTransfer(
  rawNotes: string,
  paymentMethod: string,
  bankName?: string,
  transferRef?: string
): string {
  const cleanedNotes = (rawNotes || '').replace(BANK_NOTE_REGEX, '').trim();
  if (paymentMethod !== 'Transfer Bank') {
    return clampString(cleanedNotes, 300, '');
  }
  const cleanBank = (bankName || 'Bank BCA').replace(/[\[\]|]/g, '').trim();
  const cleanRef = (transferRef || '').replace(/[\[\]|]/g, '').trim();
  if (!cleanBank) {
    return clampString(cleanedNotes, 300, '');
  }
  const tag = cleanRef
    ? `[Transfer: ${cleanBank} | ${cleanRef}]`
    : `[Transfer: ${cleanBank}]`;
  const combined = cleanedNotes ? `${tag} ${cleanedNotes}` : tag;
  return clampString(combined, 300, '');
}

export function composeOrderNotesWithPayment(
  rawNotes: string,
  paymentMethod: string,
  bankTransferLabel?: string
): string {
  return buildOrderNotesWithBankTransfer(rawNotes, paymentMethod, bankTransferLabel, '');
}

export interface ParsedOrderPaymentDetail {
  bankName: string;
  transferRef: string;
  paymentMethodDisplay: string;
  fullLabel: string;
  shortPaymentMethodDisplay: string;
  cleanNotes: string;
}

export function extractOrderPaymentDetail(
  order: Pick<PrintOrder, 'paymentMethod' | 'notes'>
): ParsedOrderPaymentDetail {
  const rawNotes = order.notes || '';
  const match = rawNotes.match(BANK_NOTE_REGEX);
  const cleanNotes = rawNotes.replace(BANK_NOTE_REGEX, '').trim();

  if (order.paymentMethod === 'Transfer Bank') {
    const bankName = match?.[1]?.trim() || '';
    const transferRef = match?.[2]?.trim() || '';
    if (bankName) {
      const normalizedBank = bankName.toLowerCase().startsWith('bank ')
        ? bankName
        : `Bank ${bankName}`;
      const paymentMethodDisplay = transferRef
        ? `Transfer ${normalizedBank} (${transferRef})`
        : `Transfer ${normalizedBank}`;
      return {
        bankName,
        transferRef,
        paymentMethodDisplay,
        fullLabel: paymentMethodDisplay,
        shortPaymentMethodDisplay: `Transfer ${bankName}`,
        cleanNotes,
      };
    }
    return {
      bankName: '',
      transferRef: '',
      paymentMethodDisplay: 'Transfer Bank',
      fullLabel: 'Transfer Bank',
      shortPaymentMethodDisplay: 'Transfer Bank',
      cleanNotes,
    };
  }

  return {
    bankName: '',
    transferRef: '',
    paymentMethodDisplay: order.paymentMethod,
    fullLabel: order.paymentMethod,
    shortPaymentMethodDisplay: order.paymentMethod,
    cleanNotes,
  };
}

export interface OrderPaymentAndChange {
  paymentAmount: number;
  changeAmount: number;
  isCash: boolean;
  isLunas: boolean;
  cleanNotes: string;
}

export function extractOrderPaymentAndChange(
  order: Pick<
    PrintOrder,
    'totalAmount' | 'paidAmount' | 'paymentMethod' | 'paymentStatus' | 'notes'
  > & {
    paymentAmount?: number;
    changeAmount?: number;
  }
): OrderPaymentAndChange {
  const rawNotes = order.notes || '';
  const isCash = order.paymentMethod === 'Tunai';
  const isLunas = order.paymentStatus === 'Lunas';

  const directPay = Number(order.paymentAmount);
  const directChange = Number(order.changeAmount);

  const tagRegex = /\[(?:TUNAI|BAYAR):(\d+)(?:\|(?:KEMBALIAN|KEMBALI):(\d+))?\]/i;
  const match = rawNotes.match(tagRegex);
  const notePay = match ? Number(match[1]) : NaN;
  const noteChange = match && match[2] ? Number(match[2]) : NaN;
  const cleanNotes = rawNotes.replace(tagRegex, '').trim();

  let resolvedPay = 0;
  if (!Number.isNaN(directPay) && directPay > 0) {
    resolvedPay = directPay;
  } else if (!Number.isNaN(notePay) && notePay > 0) {
    resolvedPay = notePay;
  } else if (order.paidAmount > 0) {
    resolvedPay = order.paidAmount;
  } else if (isLunas) {
    resolvedPay = order.totalAmount;
  }

  let resolvedChange = 0;
  if (!Number.isNaN(directChange) && directChange >= 0) {
    resolvedChange = directChange;
  } else if (!Number.isNaN(noteChange) && noteChange >= 0) {
    resolvedChange = noteChange;
  } else if (resolvedPay > order.totalAmount) {
    resolvedChange = Math.max(0, resolvedPay - order.totalAmount);
  }

  return {
    paymentAmount: resolvedPay,
    changeAmount: resolvedChange,
    isCash,
    isLunas,
    cleanNotes,
  };
}

export function formatWhatsAppPhone(phone: string): string {
  const digits = (phone || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) {
    return `62${digits.slice(1)}`;
  }
  if (digits.startsWith('8')) {
    return `62${digits}`;
  }
  return digits;
}

export function cleanProductJobTitle(rawTitle: string): string {
  const s = (rawTitle || '').trim();
  if (!s) return '';
  return s
    .replace(/^Penjualan\s+ATK\s*[:\-–—]?\s*/i, '')
    .replace(/^Cetak\s+Spanduk\s*\/\s*Banner\s*\((.+)\)$/i, '$1')
    .replace(/^Ganti\s*\/\s*Upgrade\s+/i, '')
    .replace(/\(\s*SKU\s*[:\-]?\s*[A-Z0-9\-_]+\s*\)/gi, '')
    .replace(/\[\s*SKU\s*[:\-]?\s*[A-Z0-9\-_]+\s*\]/gi, '')
    .replace(/\[\s*(?:ATK|PRT|IND|OUT|A3P|TNT|MAT)-[A-Z0-9\-_]+\s*\]/gi, '')
    .replace(/\bSKU\s*[:\-]?\s*[A-Z0-9\-_]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function extractOrderCartItems(
  order: Pick<
    PrintOrder,
    | 'id'
    | 'jobTitle'
    | 'category'
    | 'materialId'
    | 'materialName'
    | 'unitType'
    | 'widthM'
    | 'heightM'
    | 'qty'
    | 'totalAreaOrQty'
    | 'unitPrice'
    | 'unitCost'
    | 'designFee'
    | 'finishingDesc'
    | 'finishingFee'
    | 'totalAmount'
    | 'totalCogs'
    | 'cartItemsJson'
  >
): OrderCartItem[] {
  if (order.cartItemsJson) {
    try {
      const parsed = JSON.parse(order.cartItemsJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((it, idx) => {
          const itemCategory = (it.category as OrderCategory) || order.category;
          const isAtkItem =
            itemCategory === 'Penjualan ATK' ||
            (itemCategory || '').toLowerCase().includes('atk');
          const baseSub =
            Number(it.baseSubtotal) ||
            Math.round((Number(it.totalAreaOrQty) || 1) * (Number(it.unitPrice) || 0));
          const designFee = isAtkItem ? 0 : Number(it.designFee) || 0;
          const finishingFee = isAtkItem ? 0 : Number(it.finishingFee) || 0;
          const finishingDesc = isAtkItem
            ? ''
            : cleanFinishingDescText(String(it.finishingDesc || ''), itemCategory);
          const discount = Number(it.discount) || 0;
          return {
            id: String(it.id || `item_${idx + 1}`),
            jobTitle: cleanProductJobTitle(String(it.jobTitle || it.materialName || 'Produk')),
            category: itemCategory,
            materialId: String(it.materialId || 'MANUAL'),
            materialName: cleanProductJobTitle(String(it.materialName || 'Bahan Cetak')),
            unitType: (it.unitType as OrderUnitType) || 'Pcs',
            widthM: Number(it.widthM) || 0,
            heightM: Number(it.heightM) || 0,
            qty: Math.max(1, Number(it.qty) || 1),
            totalAreaOrQty: Number(it.totalAreaOrQty) || 1,
            unitPrice: Number(it.unitPrice) || 0,
            unitCost: Number(it.unitCost) || 0,
            baseSubtotal: baseSub,
            designFee,
            finishingDesc,
            finishingFee,
            discount,
            itemTotalAmount: isAtkItem
              ? Math.max(0, baseSub - discount)
              : Number(it.itemTotalAmount) || Math.max(0, baseSub + designFee + finishingFee - discount),
            itemTotalCogs: Number(it.itemTotalCogs) || 0,
          };
        });
      }
    } catch {
      // Fallback to single item
    }
  }

  const isAtkOrder =
    order.category === 'Penjualan ATK' ||
    (order.category || '').toLowerCase().includes('atk');
  const baseSubtotal = Math.round(
    (Number(order.totalAreaOrQty) || 0) * (Number(order.unitPrice) || 0)
  );
  const resolvedDesignFee = isAtkOrder ? 0 : Number(order.designFee) || 0;
  const resolvedFinishingFee = isAtkOrder ? 0 : Number(order.finishingFee) || 0;
  const resolvedFinishingDesc = isAtkOrder
    ? ''
    : cleanFinishingDescText(order.finishingDesc || '', order.category);
  return [
    {
      id: order.id || 'item_1',
      jobTitle: cleanProductJobTitle(order.jobTitle || order.materialName),
      category: order.category,
      materialId: order.materialId,
      materialName: cleanProductJobTitle(order.materialName),
      unitType: order.unitType,
      widthM: order.widthM,
      heightM: order.heightM,
      qty: order.qty,
      totalAreaOrQty: order.totalAreaOrQty,
      unitPrice: order.unitPrice,
      unitCost: order.unitCost,
      baseSubtotal,
      designFee: resolvedDesignFee,
      finishingDesc: resolvedFinishingDesc,
      finishingFee: resolvedFinishingFee,
      itemTotalAmount: baseSubtotal + resolvedDesignFee + resolvedFinishingFee,
      itemTotalCogs: order.totalCogs,
    },
  ];
}

export interface OrderRoundingResult {
  rawTotal: number;
  roundedTotal: number;
  roundingAdjustment: number;
  remainder: number;
  ruleExplanation: string;
}

/**
 * Aturan Pembulatan Perhitungan Akhir Kasir:
 * - Lebihan <= Rp 300 -> digenapkan ke bawah menjadi Rp 0 (contoh: 17.300 -> 17.000)
 * - Lebihan > Rp 300 s/d < Rp 600 -> digenapkan menjadi Rp 500 (contoh: 17.400 -> 17.500, 17.500 tetap 17.500)
 * - Lebihan >= Rp 600 -> digenapkan ke atas menjadi ribuan berikutnya (contoh: 17.600 -> 18.000)
 */
export function roundFinalOrderAmount(rawAmount: number): OrderRoundingResult {
  const cleanRaw = Math.max(0, Math.round(Number(rawAmount) || 0));
  if (cleanRaw === 0) {
    return {
      rawTotal: 0,
      roundedTotal: 0,
      roundingAdjustment: 0,
      remainder: 0,
      ruleExplanation: 'Rp 0',
    };
  }

  const thousandsBase = Math.floor(cleanRaw / 1000) * 1000;
  const remainder = cleanRaw - thousandsBase;

  let roundedTotal = cleanRaw;
  let ruleExplanation = 'Nominal Pas (Tanpa Pembulatan)';

  if (remainder === 0) {
    roundedTotal = thousandsBase;
    ruleExplanation = 'Nominal Pas Ribuan';
  } else if (remainder === 500) {
    roundedTotal = thousandsBase + 500;
    ruleExplanation = 'Tetap Rp 500';
  } else if (remainder <= 300) {
    roundedTotal = thousandsBase;
    ruleExplanation = `Lebihan Rp ${formatNumberID(remainder)} (≤ Rp 300) → Dibulatkan ke ${formatIDR(roundedTotal)}`;
  } else if (remainder < 600) {
    roundedTotal = thousandsBase + 500;
    ruleExplanation = `Lebihan Rp ${formatNumberID(remainder)} (> Rp 300) → Digenapkan Rp 500 jadi ${formatIDR(roundedTotal)}`;
  } else {
    roundedTotal = thousandsBase + 1000;
    ruleExplanation = `Lebihan Rp ${formatNumberID(remainder)} (≥ Rp 600) → Digenapkan ke atas jadi ${formatIDR(roundedTotal)}`;
  }

  return {
    rawTotal: cleanRaw,
    roundedTotal,
    roundingAdjustment: roundedTotal - cleanRaw,
    remainder,
    ruleExplanation,
  };
}

export function getOrderFinalRounding(
  order: Pick<
    PrintOrder,
    | 'id'
    | 'jobTitle'
    | 'category'
    | 'materialId'
    | 'materialName'
    | 'unitType'
    | 'widthM'
    | 'heightM'
    | 'qty'
    | 'totalAreaOrQty'
    | 'unitPrice'
    | 'unitCost'
    | 'designFee'
    | 'finishingDesc'
    | 'finishingFee'
    | 'discount'
    | 'totalAmount'
    | 'totalCogs'
    | 'cartItemsJson'
  >
): OrderRoundingResult {
  const cartItems = extractOrderCartItems(order);
  const rawGross =
    cartItems.length > 1
      ? cartItems.reduce((acc, it) => acc + (Number(it.itemTotalAmount) || 0), 0)
      : Math.round((Number(order.totalAreaOrQty) || 0) * (Number(order.unitPrice) || 0)) +
        (Number(order.designFee) || 0) +
        (Number(order.finishingFee) || 0);
  const rawBeforeRounding = Math.max(0, rawGross - (Number(order.discount) || 0));
  return roundFinalOrderAmount(rawBeforeRounding);
}

export type OfflineBackupTrigger =
  | 'MANUAL_LOCAL'
  | 'HOURLY_OFFLINE_AUTO'
  | 'OFFLINE_EDIT_QUEUE'
  | 'IMPORT_FILE';

export interface OfflineLocalBackupRecord {
  id: string;
  createdAtIso: string;
  timeLabel: string;
  trigger: OfflineBackupTrigger;
  triggerLabel: string;
  offlineDurationMinutes: number;
  syncedToCloud: boolean;
  syncedAtLabel?: string;
  counts: {
    orders: number;
    inventory: number;
    transactions: number;
    payables: number;
    stockLogs: number;
  };
  snapshot: {
    storeSettings: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>;
    orders: PrintOrder[];
    inventory: InventoryItem[];
    transactions: CashTransaction[];
    payables: SupplierPayable[];
    stockLogs: StockMutationLog[];
    activeTab: NavTab;
  };
}



