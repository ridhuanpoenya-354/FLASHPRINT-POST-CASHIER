import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import {
  PrintOrder,
  StoreSettings,
  PrintPaperSize,
  PRINT_PAPER_OPTIONS,
  extractOrderFinishingLines,
  extractItemDetailedBreakdown,
  cleanFinishingDescText,
  extractOrderPaymentDetail,
  extractOrderCartItems,
  cleanProductJobTitle,
  getOrderFinalRounding,
  parseA3FinishingFlags,
  formatWhatsAppPhone,
  formatIDR,
  formatDateID,
  formatNumberID,
} from '../types';
import {
  PrintSheetContent,
  getPrintPreviewContainerStyle,
} from '../components/PrintSheetContent';

export type WhatsAppMessageTemplate = 'INVOICE' | 'READY_PICKUP' | 'SPK_OPERATOR';

export function buildWhatsAppOrderMessage(
  rawOrder: PrintOrder,
  storeSettings: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>,
  template: WhatsAppMessageTemplate = 'INVOICE'
): string {
  const order: PrintOrder = {
    ...rawOrder,
    customerName: (rawOrder.customerName || '').trim() || 'Pelanggan Umum',
    jobTitle: cleanProductJobTitle(rawOrder.jobTitle || rawOrder.materialName),
  };
  const storeName = storeSettings.storeName || 'CetakPro Digital Printing';
  const cashierDisplay =
    order.cashierName ||
    storeSettings.activeCashierName ||
    storeSettings.ownerName ||
    'Admin Kasir';
  const baseSubtotal = Math.round(order.totalAreaOrQty * order.unitPrice);
  const remainingDebt = Math.max(0, order.totalAmount - order.paidAmount);
  const paymentDetail = extractOrderPaymentDetail(order);
  const cartItems = extractOrderCartItems(order);
  const isMultiItem = cartItems.length > 1;
  const isAtkOrder =
    (order.category || '').toLowerCase().includes('atk') ||
    (cartItems.length > 0 &&
      cartItems.every((it) => (it.category || '').toLowerCase().includes('atk')));
  const finishingLines = isAtkOrder ? [] : extractOrderFinishingLines(order);
  const roundingInfo = getOrderFinalRounding(order);
  const dimensionText =
    order.unitType === 'm2'
      ? `${formatNumberID(order.widthM)}m × ${formatNumberID(order.heightM)}m × ${order.qty} pcs (${formatNumberID(order.totalAreaOrQty)} m²)`
      : `${formatNumberID(order.qty)} ${order.unitType}`;

  const multiItemsInvoiceBlock = isMultiItem
    ? cartItems
        .map((it, idx) => {
          const detail = extractItemDetailedBreakdown(it);
          const isAtkItem = (it.category || '').toLowerCase().includes('atk');
          const sub = [
            `  *${idx + 1}. ${it.jobTitle}*`,
            ...(detail.isA3Sheet
              ? [`     • Harga Per Lembar A3+: ${formatIDR(it.unitPrice)}/lembar`]
              : []),
            `     • ${detail.basePrintLabel}: *${formatIDR(detail.baseSubtotal)}*`,
          ];
          if (!isAtkItem) {
            detail.finishingLines.forEach((fl) => {
              sub.push(
                `     • ${fl.label}: *${fl.amount > 0 ? `+${formatIDR(fl.amount)}` : 'Rp 0'}*`
              );
            });
            if (it.designFee > 0) sub.push(`     • Jasa Desain: *+${formatIDR(it.designFee)}*`);
          }
          if ((it.discount || 0) > 0)
            sub.push(`     • Diskon: *-${formatIDR(it.discount || 0)}*`);
          sub.push(
            `     • *Sub Total #${idx + 1}${
              detail.hasExtraComponents ? ` (${detail.subtotalFormulaNumbers})` : ''
            }: ${formatIDR(detail.itemSubtotal)}*`
          );
          return sub.join('\n');
        })
        .join('\n\n')
    : '';

  const multiItemsSpkBlock = isMultiItem
    ? cartItems
        .map((it, idx) => {
          const isAtkItem = (it.category || '').toLowerCase().includes('atk');
          const dim =
            it.unitType === 'm2'
              ? `${formatNumberID(it.widthM)}m × ${formatNumberID(it.heightM)}m × ${it.qty} pcs (${formatNumberID(it.totalAreaOrQty)} m²)`
              : `${formatNumberID(it.qty)} ${it.unitType}`;
          return [
            `*#${idx + 1}. ${it.jobTitle}*`,
            `  • Divisi & Bahan: ${it.category} — ${it.materialName}`,
            `  • Ukuran & Qty: *${dim}*`,
            ...(!isAtkItem
              ? [
                  `  • Finishing: ${
                    cleanFinishingDescText(it.finishingDesc, it.category) ||
                    'Potong Pas Standar'
                  }`,
                ]
              : []),
          ].join('\n');
        })
        .join('\n\n')
    : '';

  const singleItemDetail = extractItemDetailedBreakdown({
    jobTitle: order.jobTitle,
    category: order.category,
    materialName: order.materialName,
    unitType: order.unitType,
    widthM: order.widthM,
    heightM: order.heightM,
    qty: order.qty,
    totalAreaOrQty: order.totalAreaOrQty,
    unitPrice: order.unitPrice,
    designFee: isAtkOrder ? 0 : order.designFee,
    finishingDesc: isAtkOrder ? '' : order.finishingDesc,
    finishingFee: isAtkOrder ? 0 : order.finishingFee,
    discount: order.discount,
    itemTotalAmount: Math.max(
      0,
      baseSubtotal +
        (isAtkOrder ? 0 : order.designFee + order.finishingFee) -
        order.discount
    ),
  });

  const cleanedOrderFinDesc = cleanFinishingDescText(order.finishingDesc, order.category);
  const finishingSection = isAtkOrder
    ? ''
    : finishingLines.length > 0
    ? finishingLines
        .map(
          (fl) =>
            `  • ${fl.label}: *${fl.amount > 0 ? formatIDR(fl.amount) : 'Rp 0'}*`
        )
        .join('\n')
    : cleanedOrderFinDesc
    ? `  • Finishing (${cleanedOrderFinDesc}): *${formatIDR(order.finishingFee)}*`
    : '';

  if (template === 'READY_PICKUP') {
    const lines = [
      `Halo *${order.customerName}*,`,
      `Kami dari *${storeName}* menginformasikan bahwa pesanan cetak Anda telah *SELESAI & SIAP DIAMBIL*:`,
      ``,
      `📄 *No. Nota / SPK:* ${order.invoiceNumber}`,
      ...(isMultiItem
        ? [`🖨️ *Daftar Produk Pesanan (${cartItems.length} Item):*`, multiItemsInvoiceBlock]
        : [
            `🖨️ *Pekerjaan:* ${order.jobTitle}`,
            `📐 *Spesifikasi:* ${singleItemDetail.dimensionText}`,
            ...(finishingSection ? [`✂️ *Finishing:*`, finishingSection] : []),
          ]),
      ``,
      `💰 *Total Tagihan:* ${formatIDR(order.totalAmount)}`,
      `✅ *Sudah Dibayar:* ${formatIDR(order.paidAmount)} (${paymentDetail.paymentMethodDisplay})`,
      ...(remainingDebt > 0
        ? [
            `⚠️ *Sisa Pelunasan:* *${formatIDR(remainingDebt)}*`,
            ...(storeSettings.bankAccountInfo
              ? [`🏦 *Info Rekening Transfer:* ${storeSettings.bankAccountInfo}`]
              : []),
          ]
        : [`🎉 *Status Pembayaran:* *LUNAS*`]),
      ``,
      `📍 *Alamat Pengambilan:* ${storeSettings.address || '-'}`,
      `Terima kasih atas kepercayaan Anda mencetak di *${storeName}*! 🙏`,
    ];
    return lines.join('\n');
  }

  if (template === 'SPK_OPERATOR') {
    const a3Flags = parseA3FinishingFlags(order);
    const a3ChecklistText = a3Flags.isA3Order
      ? [
          `📋 *Checklist Finishing Lembar A3+:*`,
          `  [${a3Flags.bolakBalik ? '✓' : ' '}] Bolak Balik (+50%)`,
          `  [${a3Flags.satuMuka || !a3Flags.bolakBalik ? '✓' : ' '}] 1 Muka`,
          `  [${a3Flags.laminasiGlossy ? '✓' : ' '}] Laminasi Glossy (${a3Flags.laminasiBolakBalik ? 'Bolak Balik ×2' : '1 Muka'})`,
          `  [${a3Flags.laminasiDoff ? '✓' : ' '}] Laminasi Doff (${a3Flags.laminasiBolakBalik ? 'Bolak Balik ×2' : '1 Muka'})`,
          `  [${a3Flags.potongSisiRapi ? '✓' : ' '}] Potong Sisi Rapi`,
          `  [${a3Flags.potongDieCut ? '✓' : ' '}] Potong Mesin Putus (DieCut)`,
          `  [${a3Flags.potongKissCut ? '✓' : ' '}] Potong Mesin Setengah Putus (Kiss Cut)`,
        ].join('\n')
      : '';

    const lines = [
      `🛠️ *SURAT PERINTAH KERJA (SPK PRODUKSI)*`,
      `*${storeName.toUpperCase()}*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📌 *No. SPK:* *${order.invoiceNumber}*`,
      `📅 *Tgl Masuk:* ${formatDateID(order.orderDate)}`,
      `⏰ *DEADLINE:* *${formatDateID(order.deadlineDate)}*`,
      `👤 *Pemesan:* ${order.customerName}`,
      `👩‍💻 *Kasir / Admin:* ${cashierDisplay}`,
      `🏭 *Divisi Mesin:* ${order.category}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      ...(isMultiItem
        ? [
            `📂 *Daftar Item Produksi (${cartItems.length} Produk):*`,
            multiItemsSpkBlock,
          ]
        : [
            `📂 *Judul File / Pekerjaan:*`,
            `*${order.jobTitle}*`,
            `🧱 *Bahan Cetak:* ${order.materialName}`,
            `📏 *Ukuran & Qty:* *${dimensionText}*`,
            `📊 *Total Volume:* *${formatNumberID(order.totalAreaOrQty)} ${order.unitType}*`,
            `✂️ *Instruksi Finishing:* ${order.finishingDesc || 'Potong Pas Standar'}`,
          ]),
      ...(a3ChecklistText ? [a3ChecklistText] : []),
      `📝 *Catatan Operator:* ${paymentDetail.cleanNotes || 'Periksa profil warna & ukuran sebelum cetak.'}`,
    ];
    return lines.join('\n');
  }

  // Default: INVOICE (Nota Tagihan Kasir)
  const lines = [
    `🧾 *NOTA TAGIHAN / INVOICE RESMI*`,
    `*${storeName.toUpperCase()}*`,
    ...(storeSettings.address ? [storeSettings.address] : []),
    ...(storeSettings.phone ? [`Telp/WA: ${storeSettings.phone}`] : []),
    `━━━━━━━━━━━━━━━━━━━━`,
    `📄 *No. Nota/SPK:* *${order.invoiceNumber}* | *Kasir:* ${cashierDisplay}`,
    `📅 *Tanggal Masuk:* ${formatDateID(order.orderDate)} | *Estimasi Selesai:* ${formatDateID(order.deadlineDate)}`,
    `👤 *Pelanggan:* *${order.customerName}* | *Telp/WA:* ${order.customerPhone || '-'}`,
    `💳 *Status:* *${remainingDebt === 0 && order.totalAmount > 0 ? 'LUNAS' : order.paymentStatus}* | *Metode:* ${paymentDetail.fullLabel}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🖨️ *Rincian Pesanan Cetak${isMultiItem ? ` (${cartItems.length} Produk)` : ''}:*`,
    ...(isMultiItem
      ? [multiItemsInvoiceBlock]
      : [
          `*${order.jobTitle}*`,
          ...(singleItemDetail.isA3Sheet
            ? [`  • Harga Per Lembar A3+: ${formatIDR(order.unitPrice)}/lembar`]
            : []),
          `  • ${singleItemDetail.basePrintLabel}: *${formatIDR(baseSubtotal)}*`,
          ...(finishingSection ? [finishingSection] : []),
          ...(order.designFee > 0
            ? [`  • Biaya Jasa Desain: *+${formatIDR(order.designFee)}*`]
            : []),
          ...(order.discount > 0
            ? [`  • Potongan Diskon: *-${formatIDR(order.discount)}*`]
            : []),
          `  • *${singleItemDetail.subtotalLabelWithFormula}: ${formatIDR(singleItemDetail.itemSubtotal)}*`,
        ]),
    `━━━━━━━━━━━━━━━━━━━━`,
    ...(roundingInfo.roundingAdjustment !== 0
      ? [
          `🧮 *Subtotal Hitung:* ${formatIDR(roundingInfo.rawTotal)}`,
          `🔄 *Pembulatan Akhir:* ${
            roundingInfo.roundingAdjustment > 0
              ? `+${formatIDR(roundingInfo.roundingAdjustment)}`
              : `-${formatIDR(Math.abs(roundingInfo.roundingAdjustment))}`
          }`,
        ]
      : []),
    `💰 *TOTAL TAGIHAN:* *${formatIDR(order.totalAmount)}*`,
    `💳 *Dibayar (${order.paymentStatus}):* *${formatIDR(order.paidAmount)}*`,
    `🏦 *Metode / Bank:* *${paymentDetail.paymentMethodDisplay}*`,
    `📌 *SISA PIUTANG:* *${formatIDR(remainingDebt)}*`,
    ...(paymentDetail.cleanNotes
      ? [`📝 *Catatan:* ${paymentDetail.cleanNotes}`]
      : []),
    ...(storeSettings.bankAccountInfo
      ? [
          ``,
          `🏧 *Rekening Pembayaran Transfer:*`,
          `*${storeSettings.bankAccountInfo}*`,
        ]
      : []),
    ...(storeSettings.invoiceFooterNote
      ? [``, `_${storeSettings.invoiceFooterNote}_`]
      : []),
    ``,
    `Terima kasih telah mencetak di *${storeName}*! 🙏`,
  ];
  return lines.join('\n');
}

async function waitForImagesInElement(el: HTMLElement): Promise<void> {
  const imgs = Array.from(el.querySelectorAll('img'));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        })
    )
  );
}

/**
 * Trims excess bottom white pixels from a canvas so thermal receipts do not waste paper
 * when printed using mobile/tablet thermal printer apps with auto-cut enabled.
 */
export function trimCanvasBottomWhitespace(
  sourceCanvas: HTMLCanvasElement,
  bottomPaddingPx = 16
): HTMLCanvasElement {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  if (width <= 0 || height <= 0) return sourceCanvas;

  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return sourceCanvas;

  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    let lastContentY = -1;
    // Scan from the bottom row upwards to find the last row containing actual ink/content
    for (let y = height - 1; y >= 0; y--) {
      const rowOffset = y * width * 4;
      for (let x = 0; x < width; x++) {
        const idx = rowOffset + x * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];

        // Any non-white or non-transparent pixel (antialiasing threshold: < 245)
        if (a > 30 && (r < 245 || g < 245 || b < 245)) {
          lastContentY = y;
          break;
        }
      }
      if (lastContentY !== -1) {
        break;
      }
    }

    if (lastContentY <= 0) {
      return sourceCanvas;
    }

    const trimmedHeight = Math.min(height, Math.max(60, lastContentY + bottomPaddingPx));
    if (trimmedHeight >= height - 4) {
      return sourceCanvas;
    }

    const trimmedCanvas = document.createElement('canvas');
    trimmedCanvas.width = width;
    trimmedCanvas.height = trimmedHeight;
    const trimmedCtx = trimmedCanvas.getContext('2d');
    if (!trimmedCtx) return sourceCanvas;

    trimmedCtx.fillStyle = '#ffffff';
    trimmedCtx.fillRect(0, 0, width, trimmedHeight);
    trimmedCtx.drawImage(
      sourceCanvas,
      0, 0, width, trimmedHeight,
      0, 0, width, trimmedHeight
    );
    return trimmedCanvas;
  } catch {
    return sourceCanvas;
  }
}

function canvasFromDataUrl(dataUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || img.width;
      c.height = img.naturalHeight || img.height;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
      }
      resolve(c);
    };
    img.onerror = () => reject(new Error('Gagal memuat gambar ke canvas'));
    img.src = dataUrl;
  });
}

export interface FlattenedCanvasResult {
  dataUrl: string;
  canvas: HTMLCanvasElement;
  widthMm: number;
  heightMm: number;
}

/**
 * Renders the exact PrintSheetContent DOM (identical to PrintModal Preview),
 * flattens it into a high-resolution canvas/PNG, and trims excess bottom blank space
 * for thermal roll printers to prevent paper waste on auto-cut devices.
 */
export async function generateOrderInvoiceFlattenedCanvas(
  order: PrintOrder,
  storeSettings: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>,
  mode: 'invoice' | 'spk' = 'invoice',
  paperSize: PrintPaperSize = 'THERMAL_80',
  sourceElement?: HTMLElement | null
): Promise<FlattenedCanvasResult> {
  const isThermal = paperSize === 'THERMAL_80' || paperSize === 'THERMAL_100';
  const standardWidthMm = paperSize === 'THERMAL_100' ? 100 : 80;

  const sheetKey = `${order.id}_${mode}_${paperSize}`;
  const existingLiveElement =
    sourceElement ||
    (typeof document !== 'undefined'
      ? (document.querySelector(`[data-print-sheet="${sheetKey}"]`) as HTMLElement | null)
      : null);

  let rawDataUrl = '';

  if (existingLiveElement) {
    try {
      await waitForImagesInElement(existingLiveElement);
      rawDataUrl = await toPng(existingLiveElement, {
        pixelRatio: 2.5,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });
    } catch {
      // Fall through to offscreen mount
    }
  }

  if (!rawDataUrl && typeof document !== 'undefined') {
    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-10000px';
    host.style.top = '0';
    host.style.zIndex = '-1';
    host.style.pointerEvents = 'none';
    host.style.background = '#ffffff';
    document.body.appendChild(host);

    const sheetEl = document.createElement('div');
    const previewStyle = getPrintPreviewContainerStyle(paperSize);
    if (previewStyle.width) sheetEl.style.width = String(previewStyle.width);
    if (previewStyle.height) sheetEl.style.height = String(previewStyle.height);
    // For thermal roll, do NOT apply artificial minHeight in offscreen capture so it wraps content naturally
    if (!isThermal && previewStyle.minHeight) sheetEl.style.minHeight = String(previewStyle.minHeight);
    if (previewStyle.maxHeight) sheetEl.style.maxHeight = String(previewStyle.maxHeight);
    if (previewStyle.overflow) sheetEl.style.overflow = String(previewStyle.overflow);
    sheetEl.style.boxSizing = 'border-box';
    sheetEl.className =
      'print-sheet-wrapper print-sheet-paper bg-white text-slate-950 border border-slate-300 box-border';
    host.appendChild(sheetEl);

    const root = createRoot(sheetEl);
    try {
      flushSync(() => {
        root.render(
          React.createElement(PrintSheetContent, {
            order,
            storeSettings,
            mode,
            paperSize,
          })
        );
      });
      await waitForImagesInElement(sheetEl);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      rawDataUrl = await toPng(sheetEl, {
        pixelRatio: 2.5,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });
    } finally {
      root.unmount();
      if (host.parentNode) {
        host.parentNode.removeChild(host);
      }
    }
  }

  if (!rawDataUrl) {
    throw new Error('Tidak dapat membuat flattened image dari Print Preview');
  }

  // Load into canvas to perform precise whitespace trimming
  const initialCanvas = await canvasFromDataUrl(rawDataUrl);
  let canvas = initialCanvas;

  if (isThermal) {
    // Trim extra bottom white space to prevent wasting paper on mobile/tablet auto-cut printers
    canvas = trimCanvasBottomWhitespace(initialCanvas, 18);
  }

  const finalDataUrl = canvas.toDataURL('image/png');

  // Calculate millimeter dimensions
  let calculatedWidthMm = standardWidthMm;
  let calculatedHeightMm = 100;

  if (isThermal) {
    calculatedWidthMm = standardWidthMm;
    calculatedHeightMm = Math.max(
      35,
      Math.round(((canvas.height / canvas.width) * calculatedWidthMm) * 10) / 10
    );
  } else {
    switch (paperSize) {
      case 'A5_LANDSCAPE':
        calculatedWidthMm = 210;
        calculatedHeightMm = 148;
        break;
      case 'A6_LANDSCAPE':
        calculatedWidthMm = 148;
        calculatedHeightMm = 105;
        break;
      case 'SIZE_210X100':
        calculatedWidthMm = 210;
        calculatedHeightMm = 100;
        break;
      default:
        calculatedWidthMm = standardWidthMm;
        calculatedHeightMm = Math.max(
          35,
          Math.round(((canvas.height / canvas.width) * calculatedWidthMm) * 10) / 10
        );
    }
  }

  return {
    dataUrl: finalDataUrl,
    canvas,
    widthMm: calculatedWidthMm,
    heightMm: calculatedHeightMm,
  };
}

/**
 * Flattens the exact PrintSheetContent DOM (identical to PrintModal Preview)
 * into a crisp PNG data URL so that Print Preview and Downloaded PNG are 100% identical.
 */
export async function generateOrderInvoicePngDataUrl(
  order: PrintOrder,
  storeSettings: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>,
  mode: 'invoice' | 'spk' = 'invoice',
  paperSize: PrintPaperSize = 'A5_LANDSCAPE',
  sourceElement?: HTMLElement | null
): Promise<string> {
  const result = await generateOrderInvoiceFlattenedCanvas(
    order,
    storeSettings,
    mode,
    paperSize,
    sourceElement
  );
  return result.dataUrl;
}

export function triggerDownloadPng(dataUrl: string, filename: string): void {
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export interface OrderPngGenerationArgs {
  order: PrintOrder;
  storeSettings: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>;
  mode: 'invoice' | 'spk';
  paperSize: PrintPaperSize;
  sourceElement?: HTMLElement | null;
}

export async function downloadOrderInvoicePng({
  order,
  storeSettings,
  mode,
  paperSize,
  sourceElement,
}: OrderPngGenerationArgs): Promise<string> {
  const result = await generateOrderInvoiceFlattenedCanvas(
    order,
    storeSettings,
    mode,
    paperSize,
    sourceElement
  );
  const prefix = mode === 'spk' ? 'SPK' : 'INVOICE';
  const cleanInv = (order.invoiceNumber || 'NOTA').replace(/[^A-Za-z0-9-_]/g, '_');
  const cleanCust = (order.customerName || 'Pelanggan')
    .replace(/[^A-Za-z0-9-_]/g, '_')
    .slice(0, 24);
  const paperMeta =
    PRINT_PAPER_OPTIONS.find((p) => p.id === paperSize) || PRINT_PAPER_OPTIONS[0];
  triggerDownloadPng(
    result.dataUrl,
    `${prefix}_${cleanInv}_${cleanCust}_${paperMeta.shortLabel.replace(/[^A-Za-z0-9-_]/g, '')}.png`
  );
  return result.dataUrl;
}

/**
 * Downloads a flattened PDF document that is 100% identical to the Print Preview.
 * For thermal roll printers, page height matches the exact trimmed content height (in mm)
 * so mobile/tablet auto-cut printers cut paper immediately without wasting blank space.
 */
export async function downloadOrderInvoicePdf({
  order,
  storeSettings,
  mode = 'invoice',
  paperSize = 'THERMAL_80',
  sourceElement,
}: OrderPngGenerationArgs): Promise<Blob> {
  const flattened = await generateOrderInvoiceFlattenedCanvas(
    order,
    storeSettings,
    mode,
    paperSize,
    sourceElement
  );

  if (!flattened || !flattened.dataUrl) {
    throw new Error('Gagal merender flattened PNG dari Print Preview');
  }

  const { dataUrl, widthMm, heightMm } = flattened;
  const isLandscape = widthMm > heightMm;

  const pdf = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [widthMm, heightMm],
    compress: true,
  });

  pdf.addImage(dataUrl, 'PNG', 0, 0, widthMm, heightMm, undefined, 'FAST');

  const prefix = mode === 'spk' ? 'SPK' : 'INVOICE';
  const cleanInv = (order.invoiceNumber || 'NOTA').replace(/[^A-Za-z0-9-_]/g, '_');
  const cleanCust = (order.customerName || 'Pelanggan')
    .replace(/[^A-Za-z0-9-_]/g, '_')
    .slice(0, 24);
  const paperMeta =
    PRINT_PAPER_OPTIONS.find((p) => p.id === paperSize) || PRINT_PAPER_OPTIONS[0];

  const filename = `${prefix}_${cleanInv}_${cleanCust}_${paperMeta.shortLabel.replace(/[^A-Za-z0-9-_]/g, '')}_AutoCut.pdf`;

  pdf.save(filename);
  return pdf.output('blob');
}

export async function copyOrderPngToClipboard(
  args: OrderPngGenerationArgs
): Promise<boolean> {
  try {
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      return false;
    }
    const dataUrl = await generateOrderInvoicePngDataUrl(
      args.order,
      args.storeSettings,
      args.mode,
      args.paperSize,
      args.sourceElement
    );
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

export async function shareOrderPngViaWebShare(
  args: OrderPngGenerationArgs,
  messageText: string
): Promise<boolean> {
  try {
    if (typeof navigator.share === 'undefined' || typeof navigator.canShare === 'undefined') {
      return false;
    }
    const dataUrl = await generateOrderInvoicePngDataUrl(
      args.order,
      args.storeSettings,
      args.mode,
      args.paperSize,
      args.sourceElement
    );
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const cleanInv = (args.order.invoiceNumber || 'NOTA').replace(/[^A-Za-z0-9-_]/g, '_');
    const file = new File(
      [blob],
      `${args.mode === 'spk' ? 'SPK' : 'INVOICE'}_${cleanInv}.png`,
      { type: 'image/png' }
    );
    if (!navigator.canShare({ files: [file] })) {
      return false;
    }
    await navigator.share({
      title: `${args.mode === 'spk' ? 'SPK' : 'Invoice'} ${args.order.invoiceNumber}`,
      text: messageText,
      files: [file],
    });
    return true;
  } catch {
    return false;
  }
}

export function buildOrderWhatsappMessage(
  order: PrintOrder,
  storeSettings: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>,
  docType: 'INVOICE' | 'SPK' | 'READY_PICKUP' = 'INVOICE'
): string {
  const mappedTemplate: WhatsAppMessageTemplate =
    docType === 'SPK'
      ? 'SPK_OPERATOR'
      : docType === 'READY_PICKUP'
      ? 'READY_PICKUP'
      : 'INVOICE';
  return buildWhatsAppOrderMessage(order, storeSettings, mappedTemplate);
}

export function buildWhatsappUrl(phone: string, message: string): string {
  const formattedPhone = formatWhatsAppPhone(phone);
  const encodedText = encodeURIComponent(message || '');
  return formattedPhone
    ? `https://wa.me/${formattedPhone}?text=${encodedText}`
    : `https://wa.me/?text=${encodedText}`;
}
