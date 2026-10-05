import React, { useState, useMemo, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { jsPDF } from 'jspdf';
import {
  X,
  FileText,
  Image as ImageIcon,
  Check,
  Plus,
  Minus,
  Sparkles,
  Tag,
} from 'lucide-react';
import { InventoryItem, formatIDR } from '../types';
import {
  getBarcodeSpaceBarInfo,
  formatSpacedBarcodeLabel,
} from '../utils/atkBarcodeHelpers';

export type AtkLabelSizeType = '20X10' | '15X5';
export type AtkLabelSheetFormat = 'A4' | 'F4';

interface AtkBarcodeLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  atkItems: InventoryItem[];
  initialSelectedItem?: InventoryItem | null;
}

/**
 * Synchronously renders a crisp Code128 barcode onto an HTMLCanvasElement via JsBarcode.
 * Uses exact integer module width (2px) and product-specific quiet-zone guard spaces ("space bar")
 * so camera & laser scanners decode each product uniquely without sub-pixel blur.
 */
function createBarcodeCanvasSync(sku: string, is20x10: boolean): HTMLCanvasElement {
  const bcCanvas = document.createElement('canvas');
  const spaceBarInfo = getBarcodeSpaceBarInfo(sku);
  const cleanValue = spaceBarInfo.canonicalSku;

  try {
    JsBarcode(bcCanvas, cleanValue, {
      format: 'CODE128',
      width: 2,
      height: is20x10 ? 84 : 68,
      displayValue: false,
      margin: 0,
      marginLeft: spaceBarInfo.leftGuardModules,
      marginRight: spaceBarInfo.rightGuardModules,
      marginTop: 0,
      marginBottom: 0,
      background: '#ffffff',
      lineColor: '#000000',
    });
  } catch {
    JsBarcode(bcCanvas, 'ATK-HVS4-107', {
      format: 'CODE128',
      width: 2,
      height: 80,
      displayValue: false,
      margin: 0,
      marginLeft: 14,
      marginRight: 14,
      marginTop: 0,
      marginBottom: 0,
      background: '#ffffff',
      lineColor: '#000000',
    });
  }
  return bcCanvas;
}

/**
 * Synchronously renders a single ATK Barcode Sticker onto a high-DPI HTMLCanvasElement.
 * - Ukuran 20x10 mm (2:1):
 *   - Area Atas: Nama Produk (bold, centered)
 *   - Area Tengah: Barcode Code128 tajam
 *   - Area Bawah: Kode SKU di kiri & Harga (Rp ...) bold di kanan
 * - Ukuran 15x5 mm (3:1):
 *   - Hanya Barcode Code128 dan Kode SKU saja (centered di bawah)
 */
function renderStickerCanvasSync(
  item: InventoryItem,
  size: AtkLabelSizeType,
  scale: number = 3
): HTMLCanvasElement {
  const is20x10 = size === '20X10';
  const spaceBarInfo = getBarcodeSpaceBarInfo(item.sku || 'ATK-HVS4-107');
  const bcCanvas = createBarcodeCanvasSync(spaceBarInfo.canonicalSku, is20x10);

  // Use high-definition logical dimensions with exact 2:1 (20x10mm) and 3:1 (15x5mm) aspect ratios
  // sized so bcCanvas (~382px wide at 2px/module) is drawn at exact 1:1 integer width without fractional bar distortion!
  const minRequiredW = Math.max(bcCanvas.width + 28, is20x10 ? 440 : 420);
  const baseW = is20x10
    ? Math.ceil(minRequiredW / 2) * 2
    : Math.ceil(minRequiredW / 3) * 3;
  const baseH = is20x10 ? baseW / 2 : baseW / 3;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(baseW * scale);
  canvas.height = Math.round(baseH * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = false;

  // Pure white sticker paper background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, baseW, baseH);

  // Outer clean grey cut border matching reference design
  ctx.strokeStyle = '#b8bec6';
  ctx.lineWidth = is20x10 ? 2.5 : 2;
  const inset = is20x10 ? 5 : 4;
  ctx.strokeRect(inset, inset, baseW - inset * 2, baseH - inset * 2);

  if (is20x10) {
    // 1. Area Atas: Nama Produk (Centered, Bold, Dark Navy/Black)
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 24px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const maxTextWidth = baseW - 44;
    let displayTitle = (item.name || 'Produk ATK').trim();
    if (ctx.measureText(displayTitle).width > maxTextWidth) {
      while (
        displayTitle.length > 1 &&
        ctx.measureText(`${displayTitle}…`).width > maxTextWidth
      ) {
        displayTitle = displayTitle.slice(0, -1);
      }
      displayTitle = `${displayTitle}…`;
    }
    ctx.fillText(displayTitle, baseW / 2, 16);

    // 2. Area Tengah: Gambar Barcode Code128 (Exact 1:1 integer module width -> 0% bar distortion!)
    const barcodeW = bcCanvas.width;
    const barcodeH = Math.round(baseH * 0.46);
    const barcodeX = Math.floor((baseW - barcodeW) / 2);
    const barcodeY = 50;
    ctx.drawImage(bcCanvas, barcodeX, barcodeY, barcodeW, barcodeH);

    // 3. Area Bawah: Kode SKU Space-Bar Unik di sisi kiri & Harga di sisi kanan
    const bottomY = baseH - 16;

    // Kode SKU (Left)
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 21px "Courier New", Courier, monospace, Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(spaceBarInfo.canonicalSku, 24, bottomY);

    // Harga (Right, Bold)
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 23px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(formatIDR(item.defaultSellPrice), baseW - 24, bottomY);
  } else {
    // Ukuran 15x5 mm: HANYA Barcode (Exact 1:1 integer module width) dan Kode SKU Space-Bar Unik
    // 1. Area Atas/Tengah: Gambar Barcode tanpa distorsi sub-piksel
    const barcodeW = bcCanvas.width;
    const barcodeH = Math.round(baseH * 0.56);
    const barcodeX = Math.floor((baseW - barcodeW) / 2);
    const barcodeY = 12;
    ctx.drawImage(bcCanvas, barcodeX, barcodeY, barcodeW, barcodeH);

    // 2. Area Bawah: Kode SKU Space-Bar Unik (Centered, Bold)
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 21px "Courier New", Courier, monospace, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(spaceBarInfo.spacedDisplay, baseW / 2, baseH - 11);
  }

  return canvas;
}

/**
 * Synchronously renders a full Grid Sheet of ATK Barcode Stickers onto a high-DPI HTMLCanvasElement.
 */
function renderGridSheetCanvasSync(
  stickers: Array<{ item: InventoryItem; copyIdx: number }>,
  size: AtkLabelSizeType,
  scale: number = 3
): HTMLCanvasElement {
  const is20x10 = size === '20X10';
  const cellW = is20x10 ? 220 : 180;
  const cellH = is20x10 ? 110 : 60;
  const gap = 12;
  const pad = 20;
  const cols = is20x10 ? 4 : 5;
  const rows = Math.max(1, Math.ceil(stickers.length / cols));

  const totalW = pad * 2 + cols * cellW + (cols - 1) * gap;
  const totalH = pad * 2 + rows * cellH + (rows - 1) * gap;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(totalW * scale);
  canvas.height = Math.round(totalH * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalW, totalH);

  // Cache rendered sticker canvases per item ID
  const itemCanvasCache = new Map<string, HTMLCanvasElement>();

  stickers.forEach((entry, idx) => {
    let itemStickerCanvas = itemCanvasCache.get(entry.item.id);
    if (!itemStickerCanvas) {
      itemStickerCanvas = renderStickerCanvasSync(entry.item, size, scale);
      itemCanvasCache.set(entry.item.id, itemStickerCanvas);
    }

    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = pad + col * (cellW + gap);
    const y = pad + row * (cellH + gap);

    ctx.drawImage(itemStickerCanvas, x, y, cellW, cellH);
  });

  return canvas;
}

export const AtkBarcodeLabelModal: React.FC<AtkBarcodeLabelModalProps> = ({
  isOpen,
  onClose,
  atkItems,
  initialSelectedItem,
}) => {
  const [labelSize, setLabelSize] = useState<AtkLabelSizeType>('20X10');
  const [sheetFormat, setSheetFormat] = useState<AtkLabelSheetFormat>('A4');
  const [scaleFactor, setScaleFactor] = useState<3 | 4>(4);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  // Map of itemId -> label copy count
  const [labelQtyMap, setLabelQtyMap] = useState<Record<string, number>>(() => {
    if (initialSelectedItem) {
      return { [initialSelectedItem.id]: 12 };
    }
    const first = atkItems[0];
    return first ? { [first.id]: 12 } : {};
  });

  // Ensure initialSelectedItem is selected when opened
  React.useEffect(() => {
    if (initialSelectedItem) {
      setLabelQtyMap((prev) => ({
        ...prev,
        [initialSelectedItem.id]: prev[initialSelectedItem.id] || 12,
      }));
    } else if (atkItems.length > 0 && Object.keys(labelQtyMap).length === 0) {
      setLabelQtyMap({ [atkItems[0].id]: 12 });
    }
  }, [initialSelectedItem, atkItems]);

  const singleStickerPreviewRef = useRef<HTMLDivElement | null>(null);
  const sheetGridPreviewRef = useRef<HTMLDivElement | null>(null);

  const setItemCopies = (id: string, count: number) => {
    const clamped = Math.max(0, Math.min(200, count));
    setLabelQtyMap((prev) => ({
      ...prev,
      [id]: clamped,
    }));
  };

  // Expanded list of sticker instances to print in the grid
  const expandedStickers = useMemo(() => {
    const list: Array<{
      item: InventoryItem;
      stickerDataUrl: string;
      copyIdx: number;
    }> = [];
    for (const item of atkItems) {
      const qty = labelQtyMap[item.id] || 0;
      if (qty > 0) {
        const stickerCanvas = renderStickerCanvasSync(item, labelSize, 3);
        const stickerDataUrl = stickerCanvas.toDataURL('image/png');
        for (let i = 0; i < qty; i += 1) {
          list.push({ item, stickerDataUrl, copyIdx: i + 1 });
        }
      }
    }
    return list;
  }, [atkItems, labelQtyMap, labelSize]);

  const previewTargetItem = useMemo(() => {
    if (initialSelectedItem) return initialSelectedItem;
    const firstActive = atkItems.find((it) => (labelQtyMap[it.id] || 0) > 0);
    return firstActive || atkItems[0] || null;
  }, [initialSelectedItem, atkItems, labelQtyMap]);

  const previewStickerDataUrl = useMemo(() => {
    if (!previewTargetItem) return '';
    const c = renderStickerCanvasSync(previewTargetItem, labelSize, 3);
    return c.toDataURL('image/png');
  }, [previewTargetItem, labelSize]);

  if (!isOpen) return null;

  const downloadCanvasAsPng = async (
    canvas: HTMLCanvasElement,
    filename: string
  ): Promise<void> => {
    const cleanFilename = filename.endsWith('.png') ? filename : `${filename}.png`;
    await new Promise<void>((resolve) => {
      try {
        canvas.toBlob((blob) => {
          if (blob) {
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = cleanFilename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
            resolve();
            return;
          }
          const dataUrl = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.href = dataUrl;
          link.download = cleanFilename;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          resolve();
        }, 'image/png');
      } catch {
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = cleanFilename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        resolve();
      }
    });
  };

  const handleDownloadSingleStickerPng = async () => {
    if (!previewTargetItem) return;
    setIsExportingPng(true);
    setExportFeedback(null);
    try {
      const exportedCanvas = renderStickerCanvasSync(
        previewTargetItem,
        labelSize,
        scaleFactor
      );
      await downloadCanvasAsPng(
        exportedCanvas,
        `Label-ATK-${labelSize}-${previewTargetItem.sku}.png`
      );
      setExportFeedback(
        `Gambar Stiker Tunggal (${
          labelSize === '20X10'
            ? '20×10 mm: Nama Produk, Barcode, SKU & Harga'
            : '15×5 mm: Barcode & Kode SKU'
        }) berhasil diunduh (PNG Scale ${scaleFactor}x).`
      );
    } finally {
      setIsExportingPng(false);
    }
  };

  const handleDownloadGridSheetPng = async () => {
    if (expandedStickers.length === 0) return;
    setIsExportingPng(true);
    setExportFeedback(null);
    try {
      const exportedCanvas = renderGridSheetCanvasSync(
        expandedStickers,
        labelSize,
        scaleFactor
      );
      await downloadCanvasAsPng(
        exportedCanvas,
        `Grid-Label-ATK-${labelSize}-${sheetFormat}-${expandedStickers.length}pcs.png`
      );
      setExportFeedback(
        `Lembar Grid Stiker (${expandedStickers.length} label) berhasil diunduh dalam format PNG Resolusi Tinggi (Scale ${scaleFactor}x).`
      );
    } finally {
      setIsExportingPng(false);
    }
  };

  const handleDownloadPdfGridSheet = async () => {
    if (expandedStickers.length === 0) return;
    setIsExportingPdf(true);
    setExportFeedback(null);
    try {
      const pageWidthMm = sheetFormat === 'A4' ? 210 : 215;
      const pageHeightMm = sheetFormat === 'A4' ? 297 : 330;

      const stickerW = labelSize === '20X10' ? 20 : 15;
      const stickerH = labelSize === '20X10' ? 10 : 5;
      const gapX = 2;
      const gapY = 2;
      const marginX = 8;
      const marginY = 8;

      const usableW = pageWidthMm - marginX * 2;
      const usableH = pageHeightMm - marginY * 2;
      const cols = Math.max(1, Math.floor((usableW + gapX) / (stickerW + gapX)));
      const rowsPerPage = Math.max(
        1,
        Math.floor((usableH + gapY) / (stickerH + gapY))
      );
      const labelsPerPage = cols * rowsPerPage;

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [pageWidthMm, pageHeightMm],
      });

      // Cache high-res 4x sticker PNG data URLs per item ID
      const highResDataUrlMap = new Map<string, string>();
      expandedStickers.forEach((entry) => {
        if (!highResDataUrlMap.has(entry.item.id)) {
          const c = renderStickerCanvasSync(entry.item, labelSize, 4);
          highResDataUrlMap.set(entry.item.id, c.toDataURL('image/png'));
        }
      });

      expandedStickers.forEach((entry, index) => {
        if (index > 0 && index % labelsPerPage === 0) {
          doc.addPage([pageWidthMm, pageHeightMm], 'portrait');
        }

        const indexOnPage = index % labelsPerPage;
        const col = indexOnPage % cols;
        const row = Math.floor(indexOnPage / cols);

        const x = marginX + col * (stickerW + gapX);
        const y = marginY + row * (stickerH + gapY);

        const imgDataUrl =
          highResDataUrlMap.get(entry.item.id) || entry.stickerDataUrl;

        // Place the exact rendered sticker into the 20x10mm or 15x5mm cell
        doc.addImage(imgDataUrl, 'PNG', x, y, stickerW, stickerH);
      });

      doc.save(
        `Label-Barcode-ATK-${labelSize}-${sheetFormat}-${expandedStickers.length}pcs.pdf`
      );
      setExportFeedback(
        `Dokumen PDF Grid Layout (${sheetFormat} · ${expandedStickers.length} Stiker ukuran ${
          labelSize === '20X10' ? '20×10 mm' : '15×5 mm'
        }) berhasil diunduh.`
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-5xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <Tag className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <h3 className="text-sm font-bold">
                Modul Stiker Label Barcode ATK (2 Ukuran Presisi: 20×10 mm & 15×5 mm)
              </h3>
              <p className="text-[11px] text-slate-300">
                20×10 mm: Nama Produk, Barcode, Kode SKU & Harga · 15×5 mm: Barcode & Kode SKU Saja
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs flex-1">
          {/* Top Configuration Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 1. Pilih Ukuran Presisi Label */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
              <div className="font-bold text-slate-900">
                1. Pilih Ukuran Presisi Stiker Label ATK:
              </div>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setLabelSize('20X10')}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    labelSize === '20X10'
                      ? 'bg-slate-900 text-white border-slate-900 font-semibold shadow-xs'
                      : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs">
                      A. Ukuran 20 × 10 mm (Kotak / Wadah ATK)
                    </span>
                    {labelSize === '20X10' && (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                  </div>
                  <div
                    className={`text-[10px] mt-0.5 ${
                      labelSize === '20X10' ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    Memuat: Nama Produk (Atas), Barcode (Tengah), Kode SKU (Kiri) & Harga (Kanan)
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setLabelSize('15X5')}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    labelSize === '15X5'
                      ? 'bg-slate-900 text-white border-slate-900 font-semibold shadow-xs'
                      : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs">
                      B. Ukuran 15 × 5 mm (Micro Label Fisik ATK)
                    </span>
                    {labelSize === '15X5' && (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                  </div>
                  <div
                    className={`text-[10px] mt-0.5 ${
                      labelSize === '15X5' ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    Memuat: Hanya Barcode & Kode SKU Saja (Di Bawah Barcode)
                  </div>
                </button>
              </div>
            </div>

            {/* 2. Pengaturan Kertas PDF Grid & Skala PNG */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-3">
              <div>
                <div className="font-bold text-slate-900 mb-1.5">
                  2. Ukuran Kertas Target PDF Grid Layout:
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSheetFormat('A4')}
                    className={`min-h-[40px] py-2 px-3 rounded-md border font-semibold text-xs ${
                      sheetFormat === 'A4'
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Kertas A4 (210×297 mm)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSheetFormat('F4')}
                    className={`min-h-[40px] py-2 px-3 rounded-md border font-semibold text-xs ${
                      sheetFormat === 'F4'
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Kertas F4 / Folio (215×330 mm)
                  </button>
                </div>
              </div>

              <div>
                <div className="font-bold text-slate-900 mb-1.5">
                  Resolusi Render Gambar PNG:
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setScaleFactor(3)}
                    className={`min-h-[38px] py-1.5 px-2.5 rounded border font-mono text-[11px] ${
                      scaleFactor === 3
                        ? 'bg-slate-900 text-white border-slate-900 font-bold'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    Scale 3x (High DPI)
                  </button>
                  <button
                    type="button"
                    onClick={() => setScaleFactor(4)}
                    className={`min-h-[38px] py-1.5 px-2.5 rounded border font-mono text-[11px] ${
                      scaleFactor === 4
                        ? 'bg-slate-900 text-white border-slate-900 font-bold'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    Scale 4x (Ultra Sharp)
                  </button>
                </div>
              </div>
            </div>

            {/* 3. Pratinjau Presisi Stiker Tunggal */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex flex-col justify-between items-center">
              <div className="w-full flex items-center justify-between">
                <span className="font-bold text-slate-900">
                  3. Pratinjau Stiker ({labelSize === '20X10' ? '20×10 mm' : '15×5 mm'}):
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-emerald-100 text-emerald-900 rounded font-semibold">
                  Code128
                </span>
              </div>

              {previewTargetItem && previewStickerDataUrl ? (
                <div
                  ref={singleStickerPreviewRef}
                  className="print-sheet-paper my-2 p-3 bg-slate-200/80 rounded-lg flex flex-col items-center justify-center w-full gap-1.5"
                >
                  <img
                    src={previewStickerDataUrl}
                    alt={previewTargetItem.sku}
                    style={{
                      width: labelSize === '20X10' ? '220px' : '210px',
                      height: labelSize === '20X10' ? '110px' : '70px',
                      objectFit: 'contain',
                      backgroundColor: '#ffffff',
                      display: 'block',
                    }}
                    className="shadow-sm rounded-xs"
                  />
                  <span className="text-[10px] text-slate-600 font-medium">
                    {labelSize === '20X10'
                      ? 'Ukuran 20×10 mm (Nama Produk + Barcode + SKU + Harga)'
                      : 'Ukuran 15×5 mm (Hanya Barcode + Kode SKU)'}
                  </span>
                </div>
              ) : (
                <div className="text-slate-400 py-6 text-center">
                  Pilih produk ATK di bawah untuk pratinjau.
                </div>
              )}

              <button
                type="button"
                disabled={isExportingPng || !previewTargetItem}
                onClick={handleDownloadSingleStickerPng}
                className="w-full min-h-[42px] py-2 px-3 bg-white hover:bg-slate-100 border border-slate-300 rounded-md font-bold text-[11px] text-slate-800 flex items-center justify-center gap-1.5"
              >
                <ImageIcon className="w-3.5 h-3.5 text-indigo-700" />
                Download Stiker Tunggal Ini (.PNG Scale {scaleFactor}x)
              </button>
            </div>
          </div>

          {exportFeedback && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-950 flex items-center justify-between gap-2">
              <span className="font-semibold">{exportFeedback}</span>
              <button
                type="button"
                onClick={() => setExportFeedback(null)}
                className="text-emerald-800 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Daftar Produk ATK & Jumlah Cetak Stiker */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-100 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200">
              <div className="font-bold text-slate-900">
                Pilih Produk ATK & Jumlah Copy Stiker yang Akan Dicetak ({expandedStickers.length} Total Label):
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<string, number> = {};
                    atkItems.forEach((it) => {
                      next[it.id] = 10;
                    });
                    setLabelQtyMap(next);
                  }}
                  className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded text-[11px] font-semibold text-slate-700"
                >
                  Semua @10 Label
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<string, number> = {};
                    atkItems.forEach((it) => {
                      next[it.id] = 24;
                    });
                    setLabelQtyMap(next);
                  }}
                  className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded text-[11px] font-semibold text-slate-700"
                >
                  Semua @24 Label
                </button>
                <button
                  type="button"
                  onClick={() => setLabelQtyMap({})}
                  className="px-2.5 py-1 bg-white hover:bg-rose-50 border border-rose-200 rounded text-[11px] font-semibold text-rose-700"
                >
                  Reset (0)
                </button>
              </div>
            </div>

            <div className="max-h-52 overflow-y-auto divide-y divide-slate-200 bg-white">
              {atkItems.length === 0 ? (
                <div className="p-6 text-center text-slate-500">
                  Belum ada item ATK di Master Stok. Silakan tambahkan produk ATK terlebih dahulu.
                </div>
              ) : (
                atkItems.map((item) => {
                  const count = labelQtyMap[item.id] || 0;
                  return (
                    <div
                      key={item.id}
                      className={`px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                        count > 0 ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="px-2 py-0.5 bg-slate-900 text-white font-mono font-bold text-[11px] rounded"
                          title={`Space-Bar Unik: ${formatSpacedBarcodeLabel(item.sku)}`}
                        >
                          {formatSpacedBarcodeLabel(item.sku)}
                        </span>
                        <div>
                          <div className="font-bold text-slate-900">{item.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            Harga: {formatIDR(item.defaultSellPrice)} / {item.unit} · Stok: {item.stockQty} · Space-Bar Unik Spesifik
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {[0, 1, 12, 24, 48].map((presetQty) => (
                          <button
                            key={presetQty}
                            type="button"
                            onClick={() => setItemCopies(item.id, presetQty)}
                            className={`px-2 py-1 rounded border font-mono text-[10px] ${
                              count === presetQty
                                ? 'bg-slate-900 text-white border-slate-900 font-bold'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {presetQty === 0 ? '0' : `${presetQty}x`}
                          </button>
                        ))}
                        <div className="flex items-center border border-slate-300 rounded bg-white ml-1">
                          <button
                            type="button"
                            onClick={() => setItemCopies(item.id, count - 1)}
                            className="p-1.5 text-slate-600 hover:text-slate-900"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min="0"
                            max="200"
                            value={count}
                            onChange={(e) =>
                              setItemCopies(item.id, parseInt(e.target.value, 10) || 0)
                            }
                            className="w-12 text-center font-mono font-bold text-xs focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setItemCopies(item.id, count + 1)}
                            className="p-1.5 text-slate-600 hover:text-slate-900"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Pratinjau Grid Lembar Stiker (untuk Export PNG & PDF) */}
          {expandedStickers.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">
                  Pratinjau Grid Layout Stiker ({expandedStickers.length} Stiker · Ukuran{' '}
                  {labelSize === '20X10' ? '20 × 10 mm' : '15 × 5 mm'} · Kertas {sheetFormat}):
                </span>
                <span className="text-[11px] text-slate-500">
                  Hasil unduhan PNG & PDF 100% identik dengan pratinjau di bawah
                </span>
              </div>

              <div className="bg-slate-200/70 border border-slate-300 rounded-lg p-4 overflow-x-auto max-h-72">
                <div
                  ref={sheetGridPreviewRef}
                  className="print-sheet-paper bg-white p-4 inline-block min-w-full rounded"
                >
                  <div className="flex flex-wrap gap-2.5">
                    {expandedStickers.map((entry, idx) => (
                      <img
                        key={`${entry.item.id}_${idx}`}
                        src={entry.stickerDataUrl}
                        alt={entry.item.sku}
                        style={{
                          width: labelSize === '20X10' ? '160px' : '150px',
                          height: labelSize === '20X10' ? '80px' : '50px',
                          objectFit: 'contain',
                          backgroundColor: '#ffffff',
                          display: 'block',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-600 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              Total dipilih: <strong>{expandedStickers.length} stiker</strong> (Ukuran{' '}
              <strong>{labelSize === '20X10' ? '20×10 mm' : '15×5 mm'}</strong>)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Tutup
            </button>

            <button
              type="button"
              disabled={isExportingPng || expandedStickers.length === 0}
              onClick={handleDownloadGridSheetPng}
              className="min-h-[42px] px-4 py-2 text-xs font-bold text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
            >
              <ImageIcon className="w-4 h-4 text-indigo-700" />
              {isExportingPng
                ? 'Merender PNG...'
                : `Download Gambar Grid (PNG Scale ${scaleFactor}x)`}
            </button>

            <button
              type="button"
              disabled={isExportingPdf || expandedStickers.length === 0}
              onClick={handleDownloadPdfGridSheet}
              className="min-h-[42px] px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              {isExportingPdf
                ? 'Membuat PDF...'
                : `Download PDF Grid Layout (${sheetFormat})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
