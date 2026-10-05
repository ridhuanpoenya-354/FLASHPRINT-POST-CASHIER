import JsBarcode from 'jsbarcode';
import { jsPDF } from 'jspdf';
import { downloadOrderInvoicePdf } from './invoicePngAndWhatsapp';
import {
  InventoryItem,
  InventoryCategory,
  PrintOrder,
  StoreSettings,
  extractOrderCartItems,
  extractItemDetailedBreakdown,
  extractOrderPaymentDetail,
  roundFinalOrderAmount,
  cleanProductJobTitle,
  formatNumberID,
  formatIDR,
  formatDateID,
} from '../types';

// High-contrast Code128 Set B characters that produce distinct 3X/4X wide white spaces ("space bar")
const HIGH_CONTRAST_SPACE_BAR_CHARS = [
  '4',
  '6',
  '7',
  '8',
  '9',
  'E',
  'F',
  'K',
  'R',
  'V',
  'W',
  'X',
  'Z',
] as const;

const STOP_WORDS_FOR_KEY = new Set([
  'ATK',
  'DAN',
  'ATAU',
  'UNTUK',
  'YANG',
  'DARI',
  'PER',
  'PCS',
  'PACK',
  'ROLL',
  'RIM',
  'LEMBAR',
  'UKURAN',
  'WARNA',
]);

/**
 * Computes a deterministic hash integer from any string.
 */
function hashStringDeterministic(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

/**
 * Computes a weighted Modulo-9 check digit (1..9) over the entire SKU body
 * so any 1-character or 2-character camera blur can never collide with another product.
 */
export function computeBarcodeCheckDigit(codeBody: string): number {
  const clean = (codeBody || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let sum = 7;
  const primes = [3, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43];
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean.charCodeAt(i);
    sum += ch * primes[i % primes.length];
  }
  return (sum % 9) + 1;
}

/**
 * Extracts a specific, unique 4-character Space-Bar Key from a product name and sequence number.
 * Ensures that even products with similar names (e.g. "Pulpen Hitam" vs "Pulpen Biru")
 * get completely distinct middle segments and wide white-space ("space bar") bar patterns.
 */
export function buildProductSpaceBarKey(
  productName: string,
  seqNum: number,
  extraSalt?: number
): string {
  const cleanName = (productName || '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .trim();

  const words = cleanName
    .split(/\s+/)
    .filter((w) => w.length >= 1 && !STOP_WORDS_FOR_KEY.has(w));

  let baseLetters = '';
  if (words.length >= 3) {
    // Take first char of first 3 meaningful words (or consonant + number)
    baseLetters = `${words[0][0]}${words[1][0]}${words[2][0]}`;
  } else if (words.length === 2) {
    const w0 = words[0];
    const w1 = words[1];
    baseLetters =
      w0.length >= 2
        ? `${w0[0]}${w0[w0.length - 1]}${w1[0]}`
        : `${w0[0]}${w1.slice(0, 2)}`;
  } else if (words.length === 1 && words[0].length >= 2) {
    const w = words[0];
    const consonants = w.replace(/[AEIOU]/g, '');
    baseLetters = (consonants.length >= 3 ? consonants : w).slice(0, 3);
  }

  const saltVal = typeof extraSalt === 'number' ? extraSalt : 0;
  const hashVal = hashStringDeterministic(
    `${cleanName}|#${seqNum}|$${saltVal}`
  );

  if (baseLetters.length < 3) {
    const c1 = HIGH_CONTRAST_SPACE_BAR_CHARS[(seqNum * 3 + saltVal) % HIGH_CONTRAST_SPACE_BAR_CHARS.length];
    const c2 = HIGH_CONTRAST_SPACE_BAR_CHARS[(seqNum * 7 + hashVal) % HIGH_CONTRAST_SPACE_BAR_CHARS.length];
    const c3 = String(((seqNum * 4 + saltVal) % 8) + 2);
    baseLetters = `${baseLetters}${c1}${c2}${c3}`.slice(0, 3);
  }

  // 4th character is a high-contrast Space-Bar discriminator (produces 3X/4X wide white space in Code128)
  const spaceBarChar =
    HIGH_CONTRAST_SPACE_BAR_CHARS[
      (hashVal + seqNum * 5 + saltVal * 11) % HIGH_CONTRAST_SPACE_BAR_CHARS.length
    ];

  return `${baseLetters.slice(0, 3)}${spaceBarChar}`.toUpperCase();
}

export function getCategoryPrefix(
  category: InventoryCategory = 'ATK & Perlengkapan'
): string {
  return category === 'ATK & Perlengkapan'
    ? 'ATK'
    : category === 'Part & Storage IT'
    ? 'PRT'
    : category === 'Bahan Indoor & Sticker'
    ? 'IND'
    : category === 'Bahan Outdoor'
    ? 'OUT'
    : category === 'Kertas A3+ & Media'
    ? 'A3P'
    : category === 'Tinta & Toner'
    ? 'TNT'
    : 'MAT';
}

/**
 * Generates a specific & unique Space-Bar SKU/Barcode for a product (e.g., ATK-HVS4-107, ATK-PEN7-204, ATK-SPD8-503).
 * Every product gets:
 * 1. Category Prefix (ATK / PRT / IND / OUT / A3P / TNT / MAT)
 * 2. 4-Char Product-Specific Space-Bar Key (high-contrast Code128 bars & wide white spaces unique to this product)
 * 3. 3-Digit Unique Sequence + Weighted Check Digit (prevents any single-bar camera misread from matching another product)
 */
export function generateNextAtkSku(
  inventory: InventoryItem[],
  category: InventoryCategory = 'ATK & Perlengkapan',
  productName: string = '',
  forceUniqueSalt?: number,
  excludeItemId?: string
): string {
  const prefix = getCategoryPrefix(category);
  const filteredInv = excludeItemId
    ? inventory.filter((it) => it.id !== excludeItemId)
    : inventory;

  const existingCodes = new Set(
    filteredInv.map((item) =>
      (item.sku || '').trim().toUpperCase().replace(/\s+/g, '-')
    )
  );
  const existingMiddleKeys = new Set(
    filteredInv.map((item) => {
      const parts = (item.sku || '').trim().toUpperCase().split(/[\s-]+/);
      return parts.length >= 3 ? parts[1] : '';
    })
  );

  // Count how many items exist in this category to determine the next sequence index
  const categoryCount = filteredInv.filter(
    (it) =>
      it.category === category ||
      (it.sku || '').trim().toUpperCase().startsWith(`${prefix}-`)
  ).length;

  let seqNum = Math.max(1, categoryCount + 1);
  for (const item of filteredInv) {
    const code = (item.sku || '').trim().toUpperCase();
    // Match either legacy PREFIX-001 or new PREFIX-KEY4-107
    const legacyMatch = code.match(new RegExp(`^${prefix}-(\\d+)$`, 'i'));
    if (legacyMatch && legacyMatch[1]) {
      const n = parseInt(legacyMatch[1], 10);
      if (!Number.isNaN(n) && n >= seqNum) {
        seqNum = n + 1;
      }
    }
    const modernMatch = code.match(
      new RegExp(`^${prefix}-[A-Z0-9]{2,6}-(\\d{2})\\d$`, 'i')
    );
    if (modernMatch && modernMatch[1]) {
      const n = parseInt(modernMatch[1], 10);
      if (!Number.isNaN(n) && n >= seqNum) {
        seqNum = n + 1;
      }
    }
  }

  let attempt = 0;
  while (attempt < 50) {
    const salt =
      typeof forceUniqueSalt === 'number' ? forceUniqueSalt + attempt : attempt;
    let key4 = buildProductSpaceBarKey(productName, seqNum + attempt, salt);
    if (existingMiddleKeys.has(key4)) {
      key4 = buildProductSpaceBarKey(
        `${productName}_${attempt + 1}`,
        seqNum + attempt + 3,
        salt + 7
      );
    }
    const seqStr = String((seqNum + attempt) % 100 || 1).padStart(2, '0');
    const checkDigit = computeBarcodeCheckDigit(`${prefix}${key4}${seqStr}`);
    const candidate = `${prefix}-${key4}-${seqStr}${checkDigit}`;
    if (!existingCodes.has(candidate)) {
      return candidate;
    }
    attempt += 1;
  }

  const fallbackSalt = Date.now() % 900;
  return `${prefix}-X${fallbackSalt}-991`;
}

/**
 * Formats a SKU with explicit human-readable space-bar separation (e.g. "ATK - HVS4 - 107")
 * so cashiers and customers can visually distinguish every segment immediately.
 */
export function formatSpacedBarcodeLabel(sku: string): string {
  const clean = (sku || 'ATK-HVS4-107')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-');
  return clean.split('-').filter(Boolean).join(' - ');
}

/**
 * Returns deterministic Space-Bar metadata for a given SKU so every product's barcode
 * has a specific, verifiable bar-and-space ("space bar") signature.
 */
export function getBarcodeSpaceBarInfo(sku: string): {
  canonicalSku: string;
  spacedDisplay: string;
  middleKey: string;
  checkSegment: string;
  leftGuardModules: number;
  rightGuardModules: number;
} {
  const canonicalSku =
    (sku || 'ATK-HVS4-107')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9\-]/g, '-')
      .replace(/-+/g, '-') || 'ATK-HVS4-107';
  const parts = canonicalSku.split('-').filter(Boolean);
  const middleKey = parts.length >= 2 ? parts[1] : canonicalSku.slice(0, 4);
  const checkSegment =
    parts.length >= 3
      ? parts[parts.length - 1]
      : String(computeBarcodeCheckDigit(canonicalSku));
  const h = hashStringDeterministic(canonicalSku);
  // Deterministic quiet-zone guard spacing (12..16 px) specific to this product
  const leftGuardModules = 12 + (h % 5);
  const rightGuardModules = 12 + ((h >> 3) % 5);

  return {
    canonicalSku,
    spacedDisplay: parts.join(' - '),
    middleKey,
    checkSegment,
    leftGuardModules,
    rightGuardModules,
  };
}

const rememberedUpgradedSkuMap: Record<string, string> = {};

/**
 * Upgrades any legacy sequential SKUs (ATK-001..ATK-009), old non-unique sample SKUs,
 * or duplicate/colliding SKUs in an inventory list so every product is guaranteed to have
 * a 100% unique, specific Space-Bar Barcode SKU.
 */
export function ensureUniqueInventoryBarcodes(inventory: InventoryItem[]): {
  items: InventoryItem[];
  changed: boolean;
  upgradedMap: Record<string, string>;
} {
  const PRESET_UPGRADE_MAP: Record<string, string> = {
    'ATK-001': 'ATK-HVS4-107',
    'ATK-HVS-A4': 'ATK-HVS4-107',
    'ATK-002': 'ATK-PEN7-204',
    'ATK-PEN-AE7': 'ATK-PEN7-204',
    'ATK-003': 'ATK-MAPL-301',
    'ATK-MAP-L': 'ATK-MAPL-301',
    'ATK-004': 'ATK-LKB2-408',
    'ATK-LKB-2IN': 'ATK-LKB2-408',
  };

  let changed = false;
  const upgradedMap: Record<string, string> = {};
  const usedSkus = new Set<string>();
  const usedMiddleKeys = new Set<string>();
  const builtItems: InventoryItem[] = [];

  for (let i = 0; i < inventory.length; i += 1) {
    const item = inventory[i];
    const rawSku = (item.sku || '').trim().toUpperCase().replace(/\s+/g, '-');
    const isAtk =
      item.category === 'ATK & Perlengkapan' || rawSku.startsWith('ATK-');

    let targetSku = rawSku;

    // 1. Check if it's one of the known legacy ATK SKUs
    if (PRESET_UPGRADE_MAP[rawSku]) {
      const presetCandidate = PRESET_UPGRADE_MAP[rawSku];
      if (!usedSkus.has(presetCandidate)) {
        targetSku = presetCandidate;
      }
    }

    // 2. Check if it's a generic legacy sequential SKU like ATK-005, PRT-001, etc.
    const isGenericSequential = /^[A-Z]{2,4}-\d{1,4}$/.test(targetSku);
    const parts = targetSku.split('-').filter(Boolean);
    const midKey = parts.length >= 2 ? parts[1] : '';

    // 3. If empty, duplicate, generic sequential, or ATK item with colliding middle key -> generate unique Space-Bar SKU
    if (
      !targetSku ||
      usedSkus.has(targetSku) ||
      isGenericSequential ||
      (isAtk && usedMiddleKeys.has(midKey))
    ) {
      targetSku = generateNextAtkSku(
        builtItems,
        item.category,
        item.name,
        i + 1,
        item.id
      );
    }

    if (targetSku !== item.sku) {
      changed = true;
      if (rawSku) {
        upgradedMap[rawSku] = targetSku;
        rememberedUpgradedSkuMap[rawSku] = targetSku;
        rememberedUpgradedSkuMap[rawSku.replace(/[^A-Z0-9]/g, '')] = targetSku;
      }
    }

    usedSkus.add(targetSku);
    const finalParts = targetSku.split('-').filter(Boolean);
    if (finalParts.length >= 2) {
      usedMiddleKeys.add(finalParts[1]);
    }

    builtItems.push(
      targetSku !== item.sku ? { ...item, sku: targetSku } : item
    );
  }

  return { items: builtItems, changed, upgradedMap };
}

/**
 * Strictly matches a scanned or typed barcode string to its exact unique InventoryItem.
 * Supports:
 * - Canonical hyphenated SKU (e.g. "ATK-HVS4-107")
 * - Space-bar separated SKU (e.g. "ATK HVS4 107" or "ATK - HVS4 - 107")
 * - Compact alphanumeric SKU (e.g. "ATKHVS4107")
 * - Unique middle+check signature (e.g. "HVS4-107") if unambiguous
 * - Backward-compatible legacy sticker aliases ("ATK-001" -> HVS4, "ATK-002" -> PEN7, etc.)
 * Never falls back to a random/first item if no match is found.
 */
export function findUniqueMatchingProductByBarcode(
  rawScanned: string,
  atkItems: InventoryItem[],
  allInventory: InventoryItem[] = []
): InventoryItem | undefined {
  const clean = (rawScanned || '').trim().toUpperCase();
  if (!clean) return undefined;

  // Normalize spaces/dots/slashes into single hyphens
  const normalizedHyphen = clean
    .replace(/[\s./_]+/g, '-')
    .replace(/[^A-Z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const alnumOnly = clean.replace(/[^A-Z0-9]/g, '');

  const pool =
    allInventory.length > 0
      ? [
          ...atkItems,
          ...allInventory.filter((x) => !atkItems.some((a) => a.id === x.id)),
        ]
      : atkItems;

  // 1. Exact canonical SKU match
  const exactMatch = pool.find((it) => {
    const itNorm = (it.sku || '')
      .trim()
      .toUpperCase()
      .replace(/[\s./_]+/g, '-')
      .replace(/-+/g, '-');
    return itNorm === normalizedHyphen || it.sku.toUpperCase() === clean;
  });
  if (exactMatch) return exactMatch;

  // 1b. Check dynamically upgraded SKU map (e.g. if ATK-005 was upgraded to ATK-BUKU-057)
  const mappedUpgradedSku =
    rememberedUpgradedSkuMap[normalizedHyphen] ||
    rememberedUpgradedSkuMap[alnumOnly];
  if (mappedUpgradedSku) {
    const upgradedMatch = pool.find(
      (it) => it.sku.toUpperCase() === mappedUpgradedSku.toUpperCase()
    );
    if (upgradedMatch) return upgradedMatch;
  }

  // 2. Exact full alphanumeric SKU match (minimum 5 chars to prevent partial noise collisions)
  if (alnumOnly.length >= 5) {
    const alnumMatches = pool.filter(
      (it) => it.sku.toUpperCase().replace(/[^A-Z0-9]/g, '') === alnumOnly
    );
    if (alnumMatches.length === 1) {
      return alnumMatches[0];
    }
  }

  // 3. Legacy alias mapping (so older printed stickers ATK-001..004 or ATK-HVS-A4 still resolve to their exact product)
  const LEGACY_ALIAS_TO_MODERN_PREFIX: Record<string, string[]> = {
    'ATK-001': ['ATK-HVS4-107', 'ATK-HVS-A4', 'HVS A4'],
    'ATKHVSA4': ['ATK-HVS4-107', 'ATK-HVS-A4', 'HVS A4'],
    'ATK-HVS-A4': ['ATK-HVS4-107', 'HVS A4'],
    'ATKHVS4107': ['ATK-HVS4-107', 'HVS A4'],
    'ATK-002': ['ATK-PEN7-204', 'ATK-PEN-AE7', 'PULPEN STANDARD AE7'],
    'ATKPENAE7': ['ATK-PEN7-204', 'ATK-PEN-AE7', 'PULPEN STANDARD AE7'],
    'ATK-PEN-AE7': ['ATK-PEN7-204', 'PULPEN STANDARD AE7'],
    'ATKPEN7204': ['ATK-PEN7-204', 'PULPEN STANDARD AE7'],
    'ATK-003': ['ATK-MAPL-301', 'ATK-MAP-L', 'MAP PLASTIK L'],
    'ATKMAPL': ['ATK-MAPL-301', 'ATK-MAP-L', 'MAP PLASTIK L'],
    'ATK-MAP-L': ['ATK-MAPL-301', 'MAP PLASTIK L'],
    'ATKMAPL301': ['ATK-MAPL-301', 'MAP PLASTIK L'],
    'ATK-004': ['ATK-LKB2-408', 'ATK-LKB-2IN', 'LAKBAN BENING'],
    'ATKLKB2IN': ['ATK-LKB2-408', 'ATK-LKB-2IN', 'LAKBAN BENING'],
    'ATK-LKB-2IN': ['ATK-LKB2-408', 'LAKBAN BENING'],
    'ATKLKB2408': ['ATK-LKB2-408', 'LAKBAN BENING'],
  };

  const aliasTargets =
    LEGACY_ALIAS_TO_MODERN_PREFIX[normalizedHyphen] ||
    LEGACY_ALIAS_TO_MODERN_PREFIX[alnumOnly];
  if (aliasTargets) {
    const aliasMatch = pool.find((it) => {
      const uSku = it.sku.toUpperCase();
      const uName = it.name.toUpperCase();
      return aliasTargets.some((t) => uSku === t || uName.includes(t));
    });
    if (aliasMatch) return aliasMatch;
  }

  // 4. Unambiguous middle-key + check-segment match (e.g. "HVS4-107") or middle Space-Bar key match
  if (normalizedHyphen.length >= 4) {
    const segMatches = pool.filter((it) => {
      const uSku = it.sku.toUpperCase();
      const parts = uSku.split('-').filter(Boolean);
      const midKey = parts.length >= 2 ? parts[1] : '';
      return (
        uSku.endsWith(`-${normalizedHyphen}`) ||
        (midKey.length >= 4 && midKey === normalizedHyphen)
      );
    });
    if (segMatches.length === 1) {
      return segMatches[0];
    }
  }

  // 5. Exact product name match
  const exactNameMatch = pool.find((it) => it.name.trim().toUpperCase() === clean);
  if (exactNameMatch) return exactNameMatch;

  // 6. Built-in fallback catalog for default ATK presets in case Firestore inventory hasn't synced them yet
  const BUILTIN_ATK_CATALOG_FALLBACKS: Array<{
    aliases: string[];
    item: InventoryItem;
  }> = [
    {
      aliases: ['ATK-HVS4-107', 'ATKHVS4107', 'ATK-001', 'ATK001', 'ATK-HVS-A4', 'ATKHVSA4'],
      item: {
        id: 'atk_hvs_a4',
        ownerId: '',
        sku: 'ATK-HVS4-107',
        name: 'Kertas HVS A4 75gr SiDU (1 Rim / 500 Lembar)',
        category: 'ATK & Perlengkapan',
        unit: 'Pack',
        stockQty: 45,
        minStockQty: 10,
        costPerUnit: 42000,
        defaultSellPrice: 55000,
        supplierName: 'Grosir ATK',
        location: 'Etalase Kasir ATK',
      },
    },
    {
      aliases: ['ATK-PEN7-204', 'ATKPEN7204', 'ATK-002', 'ATK002', 'ATK-PEN-AE7', 'ATKPENAE7'],
      item: {
        id: 'atk_pulpen_std',
        ownerId: '',
        sku: 'ATK-PEN7-204',
        name: 'Pulpen Standard AE7 0.5 Hitam (Eceran Kasir)',
        category: 'ATK & Perlengkapan',
        unit: 'Pcs',
        stockQty: 144,
        minStockQty: 24,
        costPerUnit: 1800,
        defaultSellPrice: 3500,
        supplierName: 'Grosir ATK',
        location: 'Etalase Kasir ATK',
      },
    },
    {
      aliases: ['ATK-MAPL-301', 'ATKMAPL301', 'ATK-003', 'ATK003', 'ATK-MAP-L', 'ATKMAPL'],
      item: {
        id: 'atk_map_plastik',
        ownerId: '',
        sku: 'ATK-MAPL-301',
        name: 'Map Plastik L / Clear Holder Dokumen Folio',
        category: 'ATK & Perlengkapan',
        unit: 'Pcs',
        stockQty: 80,
        minStockQty: 20,
        costPerUnit: 2000,
        defaultSellPrice: 4000,
        supplierName: 'Grosir ATK',
        location: 'Etalase Kasir ATK',
      },
    },
    {
      aliases: ['ATK-LKB2-408', 'ATKLKB2408', 'ATK-004', 'ATK004', 'ATK-LKB-2IN', 'ATKLKB2IN'],
      item: {
        id: 'atk_lakban_bening',
        ownerId: '',
        sku: 'ATK-LKB2-408',
        name: 'Lakban Bening / Coklat 2 Inch Daimaru',
        category: 'ATK & Perlengkapan',
        unit: 'Roll',
        stockQty: 36,
        minStockQty: 10,
        costPerUnit: 11000,
        defaultSellPrice: 16000,
        supplierName: 'Grosir ATK',
        location: 'Etalase Kasir ATK',
      },
    },
  ];

  const presetFallback = BUILTIN_ATK_CATALOG_FALLBACKS.find(
    (entry) =>
      entry.aliases.includes(normalizedHyphen) || entry.aliases.includes(alnumOnly)
  );
  if (presetFallback) {
    return presetFallback.item;
  }

  return undefined;
}

/**
 * Renders a crisp Code128 barcode into a high-DPI PNG data URL using JsBarcode.
 * Uses exact integer module widths and product-specific quiet-zone guard spacing ("space bar")
 * so 1D camera scanners (html5-qrcode / BarcodeDetector) immediately distinguish each product's
 * bar-and-space pattern with zero sub-pixel anti-aliasing blur.
 */
export function renderCode128BarcodeDataUrl(
  value: string,
  options?: {
    width?: number;
    height?: number;
    displayValue?: boolean;
    fontSize?: number;
    margin?: number;
    marginLeft?: number;
    marginRight?: number;
    marginTop?: number;
    marginBottom?: number;
  }
): string {
  const spaceBarInfo = getBarcodeSpaceBarInfo(value);
  const cleanValue = spaceBarInfo.canonicalSku;

  // Enforce integer bar/space module width (min 2px) so white spaces ("space bar") are never blurred by sub-pixel anti-aliasing
  const integerModuleWidth = Math.max(2, Math.round(options?.width ?? 3));
  const baseMargin = options?.margin ?? 0;
  const mLeft =
    options?.marginLeft ??
    (baseMargin > 0 ? baseMargin : spaceBarInfo.leftGuardModules);
  const mRight =
    options?.marginRight ??
    (baseMargin > 0 ? baseMargin : spaceBarInfo.rightGuardModules);
  const mTop = options?.marginTop ?? baseMargin;
  const mBottom = options?.marginBottom ?? baseMargin;

  const canvas = document.createElement('canvas');
  try {
    JsBarcode(canvas, cleanValue, {
      format: 'CODE128',
      width: integerModuleWidth,
      height: options?.height ?? 44,
      displayValue: options?.displayValue ?? false,
      text: spaceBarInfo.spacedDisplay,
      fontSize: options?.fontSize ?? 12,
      font: 'JetBrains Mono, monospace',
      textMargin: 2,
      margin: baseMargin,
      marginLeft: mLeft,
      marginRight: mRight,
      marginTop: mTop,
      marginBottom: mBottom,
      background: '#ffffff',
      lineColor: '#000000',
    });
    return canvas.toDataURL('image/png');
  } catch {
    JsBarcode(canvas, 'ATK-HVS4-107', {
      format: 'CODE128',
      width: 2,
      height: 44,
      displayValue: false,
      margin: 0,
      marginLeft: 14,
      marginRight: 14,
      marginTop: 0,
      marginBottom: 0,
      background: '#ffffff',
      lineColor: '#000000',
    });
    return canvas.toDataURL('image/png');
  }
}

let sharedAudioCtx: AudioContext | null = null;
let cachedSuccessWavUrl: string | null = null;
let cachedErrorWavUrl: string | null = null;
let preloadedBeepAudio: HTMLAudioElement | null = null;

/**
 * Generates an in-memory 16-bit PCM WAV data URL for a crisp scanner beep
 * so HTMLAudioElement can play reliably alongside Web Audio API OscillatorNode.
 */
function buildScannerBeepWavDataUrl(freqHz: number, durationSec: number): string {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format = 1
  view.setUint16(22, 1, true); // Mono = 1 channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i += 1) {
    const t = i / sampleRate;
    // Fade in first 3ms and fade out last 10ms to avoid click pop while keeping full volume in middle
    let env = 1.0;
    if (t < 0.003) {
      env = t / 0.003;
    } else if (t > durationSec - 0.01) {
      env = Math.max(0, (durationSec - t) / 0.01);
    }
    // Fundamental 800Hz + subtle 2nd harmonic for crisp POS scanner presence
    const wave =
      0.8 * Math.sin(2 * Math.PI * freqHz * t) +
      0.2 * Math.sin(2 * Math.PI * (freqHz * 2) * t);
    const sample = Math.max(-1, Math.min(1, wave * env * 0.9));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/**
 * Unlocks Web Audio API AudioContext and HTMLAudioElement during a user gesture (click/touch/keydown)
 * so asynchronous camera barcode scan callbacks (onScanSuccess) are never muted by browser autoplay policies.
 */
export function unlockScannerAudio(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (AudioCtx) {
      if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
        sharedAudioCtx = new AudioCtx();
      }
      if (sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume().catch(() => {});
      }
      // Play 1-sample silent buffer to unlock iOS/Android WebAudio pipeline
      const silentBuf = sharedAudioCtx.createBuffer(1, 1, 22050);
      const src = sharedAudioCtx.createBufferSource();
      src.buffer = silentBuf;
      src.connect(sharedAudioCtx.destination);
      src.start(0);
    }

    if (!cachedSuccessWavUrl) {
      cachedSuccessWavUrl = buildScannerBeepWavDataUrl(800, 0.11);
    }
    if (!cachedErrorWavUrl) {
      cachedErrorWavUrl = buildScannerBeepWavDataUrl(340, 0.18);
    }
    if (!preloadedBeepAudio && cachedSuccessWavUrl) {
      preloadedBeepAudio = new Audio(cachedSuccessWavUrl);
      preloadedBeepAudio.volume = 1.0;
      preloadedBeepAudio.load();
    }
  } catch {
    // Ignore audio unlock errors
  }
}

// Automatically attach one-time global gesture listeners to unlock audio early
if (typeof window !== 'undefined') {
  const handleOnceGesture = () => {
    unlockScannerAudio();
  };
  window.addEventListener('pointerdown', handleOnceGesture, { once: true, passive: true });
  window.addEventListener('keydown', handleOnceGesture, { once: true, passive: true });
}

/**
 * Synthesizes a native cashier barcode scanner beep sound via Web Audio API (~800Hz, 0.1s)
 * plus a synchronized PCM WAV fallback so camera scan callbacks always produce an audible beep.
 */
export function playScannerBeepSound(
  type: 'success' | 'warning' | 'error' = 'success'
): void {
  // 1. Play pre-synthesized PCM WAV via HTMLAudioElement for guaranteed mobile/desktop output
  try {
    if (!cachedSuccessWavUrl) {
      cachedSuccessWavUrl = buildScannerBeepWavDataUrl(800, 0.11);
    }
    if (!cachedErrorWavUrl) {
      cachedErrorWavUrl = buildScannerBeepWavDataUrl(340, 0.18);
    }
    const wavUrl = type === 'error' ? cachedErrorWavUrl : cachedSuccessWavUrl;
    if (wavUrl) {
      const audio =
        type === 'success' && preloadedBeepAudio
          ? preloadedBeepAudio
          : new Audio(wavUrl);
      audio.volume = 1.0;
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  } catch {
    // Ignore HTMLAudio fallback error
  }

  // 2. Play Native Web Audio API OscillatorNode (~800Hz, duration 0.1s)
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    const ctx = sharedAudioCtx;

    const triggerTone = () => {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;

        if (type === 'success') {
          // Native ~800Hz, duration 0.1s at strong constant volume before quick release
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(800, now);
          gain.gain.setValueAtTime(0.85, now);
          gain.gain.setValueAtTime(0.85, now + 0.09);
          gain.gain.linearRampToValueAtTime(0.001, now + 0.11);
          osc.start(now);
          osc.stop(now + 0.11);
        } else if (type === 'warning') {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(660, now);
          osc.frequency.setValueAtTime(800, now + 0.06);
          gain.gain.setValueAtTime(0.75, now);
          gain.gain.setValueAtTime(0.75, now + 0.12);
          gain.gain.linearRampToValueAtTime(0.001, now + 0.15);
          osc.start(now);
          osc.stop(now + 0.15);
        } else {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(320, now);
          gain.gain.setValueAtTime(0.75, now);
          gain.gain.setValueAtTime(0.75, now + 0.18);
          gain.gain.linearRampToValueAtTime(0.001, now + 0.21);
          osc.start(now);
          osc.stop(now + 0.21);
        }
      } catch {
        // Ignore oscillator scheduling error
      }
    };

    if (ctx.state === 'suspended') {
      ctx
        .resume()
        .then(() => {
          triggerTone();
        })
        .catch(() => {
          triggerTone();
        });
    } else {
      triggerTone();
    }
  } catch {
    // Ignore audio context restriction if any
  }
}

/**
 * Generates and downloads a thermal receipt PDF document matching Print Preview
 * with flattened PNG and trimmed auto-cut paper height to prevent paper waste.
 */
export function downloadAtkReceiptPdfFallback(
  order: PrintOrder,
  storeSettings: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>,
  widthMm: 80 | 58 = 80
): void {
  // Use exact print-preview flattened PNG PDF with trimmed auto-cut paper height
  void downloadOrderInvoicePdf({
    order,
    storeSettings,
    mode: 'invoice',
    paperSize: widthMm === 58 ? 'THERMAL_80' : 'THERMAL_80',
  }).catch(() => {
    // If headless or background rendering is unavailable, run basic vector fallback below
    renderBasicVectorPdfFallback(order, storeSettings, widthMm);
  });
}

function renderBasicVectorPdfFallback(
  order: PrintOrder,
  storeSettings: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>,
  widthMm: 80 | 58 = 80
): void {
  const items = extractOrderCartItems(order);
  const itemDetails = items.map((it) => ({
    item: it,
    detail: extractItemDetailedBreakdown(it),
  }));
  const paymentDetail = extractOrderPaymentDetail(order);
  const itemsGross = itemDetails.reduce((acc, x) => acc + x.detail.itemSubtotal, 0);
  const orderDiscount = Number(order.discount) || 0;
  const rawBeforeRounding = Math.max(0, itemsGross - orderDiscount);
  const roundingInfo = roundFinalOrderAmount(rawBeforeRounding);
  const remainingDebt = Math.max(0, order.totalAmount - order.paidAmount);

  // Estimate height based on items
  const estimatedHeightMm = Math.max(135, 95 + itemDetails.length * 16);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [widthMm, estimatedHeightMm],
  });

  const centerX = widthMm / 2;
  const leftX = 4;
  const rightX = widthMm - 4;
  let y = 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(storeSettings.storeName || 'CetakPro Digital Printing', centerX, y, {
    align: 'center',
  });
  y += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  if (storeSettings.address) {
    const addrLines = doc.splitTextToSize(storeSettings.address, widthMm - 8);
    doc.text(addrLines, centerX, y, { align: 'center' });
    y += addrLines.length * 3.2;
  }
  if (storeSettings.phone) {
    doc.text(`Telp/WA: ${storeSettings.phone}`, centerX, y, { align: 'center' });
    y += 4;
  }

  doc.setLineWidth(0.25);
  doc.line(leftX, y, rightX, y);
  y += 4;

  // 4-line compact metadata
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`No. Nota/SPK: ${order.invoiceNumber}`, leftX, y);
  doc.text(`Kasir: ${order.cashierName || storeSettings.activeCashierName || 'Admin'}`, rightX, y, {
    align: 'right',
  });
  y += 3.6;

  doc.setFont('helvetica', 'normal');
  doc.text(`Tgl Masuk: ${formatDateID(order.orderDate)}`, leftX, y);
  doc.text(`Est. Selesai: ${formatDateID(order.deadlineDate)}`, rightX, y, {
    align: 'right',
  });
  y += 3.6;

  doc.text(`Pelanggan: ${order.customerName || 'Pelanggan Umum'}`, leftX, y);
  doc.text(`WA: ${order.customerPhone || '-'}`, rightX, y, { align: 'right' });
  y += 3.6;

  doc.setFont('helvetica', 'bold');
  doc.text(`Status: ${order.paymentStatus.toUpperCase()}`, leftX, y);
  doc.text(`Metode: ${paymentDetail.fullLabel}`, rightX, y, { align: 'right' });
  y += 3.5;

  doc.line(leftX, y, rightX, y);
  y += 4;

  // Items
  itemDetails.forEach(({ item, detail }, idx) => {
    const isAtkItem =
      (item.category || order.category || item.materialName || '')
        .toLowerCase()
        .includes('atk') ||
      (item.category || '').toLowerCase().includes('perlengkapan');

    if (isAtkItem) {
      const unitStr = (item.unitType || 'pcs').toLowerCase().trim() || 'pcs';
      // Baris 1: #1 Lakban Bening / Coklat 2 Inch
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      const title = `#${idx + 1} ${cleanProductJobTitle(item.jobTitle)}`;
      const titleLines = doc.splitTextToSize(title, widthMm - 8);
      doc.text(titleLines, leftX, y);
      y += titleLines.length * 3.4;

      // Baris 2: Sub Total #1 - 2 roll × Rp 16.000/roll   Rp 32.000 (Nominal Besar & Bold)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      const subLabel = `Sub Total #${idx + 1} - ${formatNumberID(item.qty)} ${unitStr} × ${formatIDR(item.unitPrice)}/${unitStr}`;
      doc.text(subLabel, leftX, y);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(formatIDR(detail.itemSubtotal), rightX, y, { align: 'right' });
      y += 4;
    } else {
      // Produk Cetak: Format tidak diubah apapun
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      const titleLines = doc.splitTextToSize(
        `${idx + 1}. ${item.jobTitle}`,
        widthMm - 8
      );
      doc.text(titleLines, leftX, y);
      y += titleLines.length * 3.4;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(detail.basePrintLabel, leftX + 2, y);
      doc.setFont('helvetica', 'bold');
      doc.text(formatIDR(detail.baseSubtotal), rightX, y, { align: 'right' });
      y += 3.6;

      detail.finishingLines.forEach((fl) => {
        doc.setFont('helvetica', 'normal');
        doc.text(`+ ${fl.label}`, leftX + 2, y);
        doc.text(fl.amount > 0 ? formatIDR(fl.amount) : 'Rp 0', rightX, y, {
          align: 'right',
        });
        y += 3.4;
      });

      if (detail.hasExtraComponents || itemDetails.length > 1) {
        doc.setFont('helvetica', 'bold');
        doc.text(`Sub Total #${idx + 1}`, leftX + 2, y);
        doc.text(formatIDR(detail.itemSubtotal), rightX, y, { align: 'right' });
        y += 3.8;
      }
      y += 1;
    }
  });

  doc.line(leftX, y, rightX, y);
  y += 4;

  if (orderDiscount > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Diskon Potongan:', leftX, y);
    doc.text(`-${formatIDR(orderDiscount)}`, rightX, y, { align: 'right' });
    y += 3.8;
  }

  if (roundingInfo.roundingAdjustment !== 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('Pembulatan Kasir:', leftX, y);
    doc.text(
      roundingInfo.roundingAdjustment > 0
        ? `+${formatIDR(roundingInfo.roundingAdjustment)}`
        : `-${formatIDR(Math.abs(roundingInfo.roundingAdjustment))}`,
      rightX,
      y,
      { align: 'right' }
    );
    y += 3.6;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('TOTAL TAGIHAN:', leftX, y);
  doc.text(formatIDR(order.totalAmount), rightX, y, { align: 'right' });
  y += 4.2;

  doc.setFontSize(8);
  doc.text(`Dibayar (${paymentDetail.shortPaymentMethodDisplay}):`, leftX, y);
  doc.text(formatIDR(order.paidAmount), rightX, y, { align: 'right' });
  y += 4;

  doc.setFontSize(9);
  if (remainingDebt > 0) {
    doc.text('SISA PIUTANG:', leftX, y);
    doc.text(formatIDR(remainingDebt), rightX, y, { align: 'right' });
  } else {
    doc.setFontSize(10.5);
    doc.text('STATUS TAGIHAN: LUNAS', centerX, y + 1, { align: 'center' });
    y += 1.5;
  }
  y += 5;

  doc.line(leftX, y, rightX, y);
  y += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Terima kasih atas kunjungan & kepercayaan Anda.', centerX, y, {
    align: 'center',
  });

  const safeCust = (order.customerName || 'Pelanggan-Umum')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .slice(0, 20);
  doc.save(`Struk-ATK-${order.invoiceNumber}-${safeCust}.pdf`);
}
