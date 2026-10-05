import React, { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import {
  Printer,
  X,
  FileText,
  Wrench,
  Receipt,
  Maximize2,
  Download,
  Share2,
  Copy,
  Send,
  CheckCircle2,
  Scissors,
  Bluetooth,
  Usb,
} from 'lucide-react';
import {
  PrintOrder,
  StoreSettings,
  PrintPaperSize,
  PRINT_PAPER_OPTIONS,
  extractOrderPaymentDetail,
} from '../types';
import {
  downloadOrderInvoicePng,
  downloadOrderInvoicePdf,
  copyOrderPngToClipboard,
  shareOrderPngViaWebShare,
  buildOrderWhatsappMessage,
  buildWhatsappUrl,
} from '../utils/invoicePngAndWhatsapp';
import {
  PrintSheetContent,
  getPrintPreviewContainerStyle,
} from './PrintSheetContent';
import {
  printViaWebBluetooth,
  printViaWebUsb,
  getSavedBluetoothPrinter,
  getSavedUsbPrinter,
} from '../utils/atkThermalPrinter';
import { downloadAtkReceiptPdfFallback } from '../utils/atkBarcodeHelpers';

export type PrintOrientation210x100 = 'portrait' | 'landscape';

interface PrintModalProps {
  order: PrintOrder | null;
  storeSettings: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>;
  mode: 'invoice' | 'spk';
  paperSize: PrintPaperSize;
  onClose: () => void;
  onSwitchMode: (mode: 'invoice' | 'spk') => void;
  onChangePaperSize: (size: PrintPaperSize) => void;
}

function getDynamicPageCss(
  paperSize: PrintPaperSize,
  orientation210x100: PrintOrientation210x100
): string {
  switch (paperSize) {
    case 'THERMAL_80':
      return `
        @media print {
          @page {
            size: 80mm auto;
            margin: 0mm;
          }
          .print-sheet-wrapper {
            width: 78mm !important;
            max-width: 78mm !important;
            margin: 0 !important;
            padding: 3mm !important;
            border: none !important;
            box-shadow: none !important;
          }
        }
      `;
    case 'THERMAL_100':
      return `
        @media print {
          @page {
            size: 100mm auto;
            margin: 0mm;
          }
          .print-sheet-wrapper {
            width: 98mm !important;
            max-width: 98mm !important;
            margin: 0 !important;
            padding: 4mm !important;
            border: none !important;
            box-shadow: none !important;
          }
        }
      `;
    case 'A5_LANDSCAPE':
    case 'A6_LANDSCAPE':
    case 'SIZE_210X100': {
      const sheetWidth =
        paperSize === 'A6_LANDSCAPE' ? '148mm' : '210mm';
      const sheetHeight =
        paperSize === 'A5_LANDSCAPE'
          ? '148mm'
          : paperSize === 'A6_LANDSCAPE'
          ? '105mm'
          : '100mm';

      if (orientation210x100 === 'landscape') {
        const isCentered210x100 = paperSize === 'SIZE_210X100';
        return `
          @page {
            size: landscape;
            margin: 0;
          }
          @media print {
            html,
            body,
            #root,
            .app-theme-root,
            .app-theme-root[data-color-mode="dark"],
            .app-theme-root[data-color-mode="light"],
            .print-modal-backdrop,
            .print-modal-shell {
              width: 100% !important;
              height: ${isCentered210x100 ? '100vh' : 'auto'} !important;
              max-height: ${isCentered210x100 ? '100vh' : 'none'} !important;
              min-height: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: ${isCentered210x100 ? 'hidden' : 'visible'} !important;
              background: #ffffff !important;
              background-color: #ffffff !important;
              color: #0f172a !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .print-preview-stage {
              width: ${isCentered210x100 ? '100vw' : '100%'} !important;
              height: ${isCentered210x100 ? '100vh' : 'auto'} !important;
              max-height: ${isCentered210x100 ? '100vh' : 'none'} !important;
              min-height: 0 !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: ${isCentered210x100 ? 'center' : 'flex-start'} !important;
              align-items: center !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: ${isCentered210x100 ? 'hidden' : 'visible'} !important;
              background: #ffffff !important;
              background-color: #ffffff !important;
              page-break-after: avoid !important;
              break-after: avoid !important;
            }
            .print-sheet-wrapper {
              width: ${sheetWidth} !important;
              max-width: ${sheetWidth} !important;
              height: ${sheetHeight} !important;
              max-height: ${sheetHeight} !important;
              margin: ${isCentered210x100 ? 'auto' : '3.5mm auto 0 auto'} !important;
              padding: 0 !important;
              box-sizing: border-box !important;
              background: #ffffff !important;
              background-color: #ffffff !important;
              border: 1px dashed #0f172a !important;
              box-shadow: none !important;
              overflow: hidden !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
          }
        `;
      }
      return `
        @page {
          size: portrait;
          margin: 0;
        }
        @media print {
          html,
          body,
          #root,
          .app-theme-root,
          .app-theme-root[data-color-mode="dark"],
          .app-theme-root[data-color-mode="light"],
          .print-modal-backdrop,
          .print-modal-shell {
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            background-color: #ffffff !important;
            color: #0f172a !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-preview-stage {
            width: 100% !important;
            min-height: 0 !important;
            height: auto !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: flex-start !important;
            align-items: center !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            background-color: #ffffff !important;
            overflow: visible !important;
          }
          .print-sheet-wrapper {
            width: ${sheetWidth} !important;
            max-width: ${sheetWidth} !important;
            height: ${sheetHeight} !important;
            max-height: ${sheetHeight} !important;
            margin: 3.5mm auto 0 auto !important;
            padding: 0 !important;
            box-sizing: border-box !important;
            background: #ffffff !important;
            background-color: #ffffff !important;
            border: 1px dashed #0f172a !important;
            box-shadow: none !important;
            overflow: hidden !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `;
    }
  }
}

export const PrintModal: React.FC<PrintModalProps> = ({
  order,
  storeSettings,
  mode,
  paperSize,
  onClose,
  onSwitchMode,
  onChangePaperSize,
}) => {
  const [showWaPanel, setShowWaPanel] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [waMessage, setWaMessage] = useState('');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isGeneratingPng, setIsGeneratingPng] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [orientation210x100, setOrientation210x100] =
    useState<PrintOrientation210x100>('portrait');
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dynamicStyleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    if (order) {
      setWaPhone(order.customerPhone || '');
      setWaMessage(
        buildOrderWhatsappMessage(
          order,
          storeSettings,
          mode === 'spk' ? 'SPK' : 'INVOICE'
        )
      );
    }
  }, [order, storeSettings, mode]);

  if (!order) return null;

  const paymentDetail = extractOrderPaymentDetail(order);
  const activePaperMeta =
    PRINT_PAPER_OPTIONS.find((p) => p.id === paperSize) || PRINT_PAPER_OPTIONS[0];

  const triggerNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => {
      setActionNotice((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      await downloadOrderInvoicePdf({
        order,
        storeSettings,
        mode,
        paperSize,
        sourceElement: sheetRef.current,
      });
      triggerNotice(
        `File PDF (${mode === 'invoice' ? 'Invoice' : 'SPK'} — ${activePaperMeta.name}) berhasil di-flatten dari Print Preview dengan ukuran pas (hemat kertas auto-cut)!`
      );
    } catch (err) {
      triggerNotice(
        `Gagal mengunduh PDF: ${err instanceof Error ? err.message : 'Terjadi kesalahan'}`
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownloadPng = async () => {
    setIsGeneratingPng(true);
    try {
      await downloadOrderInvoicePng({
        order,
        storeSettings,
        mode,
        paperSize,
        sourceElement: sheetRef.current,
      });
      triggerNotice(
        `File PNG (${mode === 'invoice' ? 'Invoice' : 'SPK'} — ${activePaperMeta.name}) berhasil di-flatten & diunduh sesuai Print Preview!`
      );
    } finally {
      setIsGeneratingPng(false);
    }
  };

  const handleCopyPngClipboard = async () => {
    setIsGeneratingPng(true);
    try {
      const copied = await copyOrderPngToClipboard({
        order,
        storeSettings,
        mode,
        paperSize,
        sourceElement: sheetRef.current,
      });
      if (copied) {
        triggerNotice(
          'Gambar PNG (sesuai Print Preview) berhasil disalin ke Clipboard! Silakan tekan Ctrl+V (Paste) di chat WhatsApp.'
        );
      } else {
        await downloadOrderInvoicePng({
          order,
          storeSettings,
          mode,
          paperSize,
          sourceElement: sheetRef.current,
        });
        triggerNotice(
          'Browser mengunduh file PNG secara otomatis. Silakan lampirkan ke chat WhatsApp.'
        );
      }
    } finally {
      setIsGeneratingPng(false);
    }
  };

  const handleShareViaWhatsapp = async (alsoDownloadPng: boolean) => {
    if (alsoDownloadPng) {
      await handleDownloadPng();
    }
    const shared = await shareOrderPngViaWebShare(
      { order, storeSettings, mode, paperSize, sourceElement: sheetRef.current },
      waMessage
    );
    if (!shared) {
      const url = buildWhatsappUrl(waPhone, waMessage);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handlePrintWithOrientation = (targetOrientation?: PrintOrientation210x100) => {
    const resolvedOrientation = targetOrientation || orientation210x100;
    if (targetOrientation && targetOrientation !== orientation210x100) {
      flushSync(() => {
        setOrientation210x100(targetOrientation);
      });
    }
    if (dynamicStyleRef.current) {
      dynamicStyleRef.current.textContent = getDynamicPageCss(
        paperSize,
        resolvedOrientation
      );
    }
    window.print();
  };

  const handlePrint = () => {
    handlePrintWithOrientation(orientation210x100);
  };

  const handleDirectBluetoothPrint = async () => {
    if (!order) return;
    try {
      const res = await printViaWebBluetooth(order, storeSettings, {
        paperColumns: 48,
      });
      triggerNotice(
        res.autoReconnected
          ? `Struk berhasil dicetak via Auto-Reconnect Bluetooth "${res.printerInfo.deviceName}" (${res.printerInfo.chunkByteSize} byte chunk).`
          : `Printer Bluetooth "${res.printerInfo.deviceName}" terhubung & disimpan otomatis ke Auto-Remember.`
      );
    } catch (err) {
      triggerNotice(
        `Smart Fallback: Koneksi Bluetooth gagal (${
          err instanceof Error ? err.message : 'Tidak didukung'
        }). Mengalihkan ke window.print()...`
      );
      setTimeout(() => handlePrint(), 400);
    }
  };

  const handleDirectUsbPrint = async () => {
    if (!order) return;
    try {
      const res = await printViaWebUsb(order, storeSettings, {
        paperColumns: 48,
      });
      triggerNotice(
        `Struk berhasil dicetak via Kabel Direct WebUSB "${res.printerInfo.productName}".`
      );
    } catch (err) {
      triggerNotice(
        `Smart Fallback: Koneksi WebUSB gagal (${
          err instanceof Error ? err.message : 'Tidak didukung'
        }). Mengalihkan ke window.print()...`
      );
      setTimeout(() => handlePrint(), 400);
    }
  };

  return (
    <div className="print-modal-backdrop fixed inset-0 z-50 flex items-start justify-center bg-slate-900/70 p-3 sm:p-6 overflow-y-auto">
      {/* Dynamic @page CSS rule for selected paper size & orientation */}
      <style ref={dynamicStyleRef}>
        {getDynamicPageCss(paperSize, orientation210x100)}
      </style>

      <div className="print-modal-shell bg-slate-100 border border-slate-300 rounded-lg w-full max-w-5xl shadow-xl overflow-hidden my-auto">
        {/* Top Control Bar (hidden when printing) */}
        <div className="no-print bg-slate-900 text-white px-5 py-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Document Type Switcher */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSwitchMode('invoice')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  mode === 'invoice'
                    ? 'bg-white text-slate-900'
                    : 'text-slate-300 hover:text-white bg-slate-800/70'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Nota Tagihan / Invoice Kasir
              </button>
              <button
                type="button"
                onClick={() => onSwitchMode('spk')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  mode === 'spk'
                    ? 'bg-white text-slate-900'
                    : 'text-slate-300 hover:text-white bg-slate-800/70'
                }`}
              >
                <Wrench className="w-3.5 h-3.5" />
                SPK Operator Produksi
              </button>
            </div>

            {/* Print, Download PNG, Share WhatsApp & Close */}
            <div className="flex flex-wrap items-center gap-2">
              {paperSize === 'SIZE_210X100' ||
              paperSize === 'A5_LANDSCAPE' ||
              paperSize === 'A6_LANDSCAPE' ? (
                <>
                  <button
                    type="button"
                    onClick={() => handlePrintWithOrientation('portrait')}
                    title={`Terapkan @page { size: portrait; margin: 0; } — Nota ${activePaperMeta.name} di bagian atas kertas (margin atas 3,5mm)`}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                      orientation210x100 === 'portrait'
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-xs'
                        : 'bg-emerald-700 hover:bg-emerald-600 text-white'
                    }`}
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Cetak Portrait (Margin Atas 3,5mm)
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintWithOrientation('landscape')}
                    title={`Terapkan @page { size: landscape; margin: 0; } — Nota ${activePaperMeta.name} orientasi Landscape (margin atas 3,5mm)`}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                      orientation210x100 === 'landscape'
                        ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-xs'
                        : 'bg-slate-700 hover:bg-slate-600 text-white border border-slate-500'
                    }`}
                  >
                    <Printer className="w-3.5 h-3.5" />
                    {paperSize === 'SIZE_210X100'
                      ? 'Cetak Landscape (Tengah Halaman)'
                      : 'Cetak Landscape (Margin Atas 3,5mm)'}
                  </button>
                  <button
                    type="button"
                    disabled={isGeneratingPdf}
                    onClick={handleDownloadPdf}
                    title={`Download Dokumen PDF (${activePaperMeta.name}) Sesuai Print Preview`}
                    className="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-md transition-colors flex items-center gap-1 whitespace-nowrap disabled:opacity-60"
                  >
                    <FileText className="w-3.5 h-3.5 text-rose-400" />
                    {isGeneratingPdf ? 'Membuat PDF...' : 'Download PDF'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Cetak ({activePaperMeta.name})
                  </button>
                  <button
                    type="button"
                    onClick={handleDirectBluetoothPrint}
                    title={`Cetak Struk Langsung via Web Bluetooth Auto-Remember (${
                      getSavedBluetoothPrinter()?.deviceName || 'Pair / Auto-Connect'
                    })`}
                    className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Bluetooth className="w-3.5 h-3.5" />
                    {getSavedBluetoothPrinter()
                      ? `Direct BT (${getSavedBluetoothPrinter()?.deviceName.slice(0, 10)})`
                      : 'Direct BT'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDirectUsbPrint}
                    title={`Cetak Struk Langsung via Kabel WebUSB (${
                      getSavedUsbPrinter()?.productName || 'Desktop / USB OTG'
                    })`}
                    className="px-3 py-1.5 text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white border border-slate-500 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Usb className="w-3.5 h-3.5 text-emerald-400" />
                    Direct USB
                  </button>
                  <button
                    type="button"
                    disabled={isGeneratingPdf}
                    onClick={handleDownloadPdf}
                    title={`Download Struk Thermal PDF (${activePaperMeta.name}) — 100% Sesuai Print Preview, Flattened PNG & Ukuran Pas Hemat Kertas Auto-Cut`}
                    className="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-md transition-colors flex items-center gap-1 whitespace-nowrap disabled:opacity-60"
                  >
                    <FileText className="w-3.5 h-3.5 text-rose-400" />
                    {isGeneratingPdf ? 'Membuat PDF...' : 'PDF (Auto-Cut)'}
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={isGeneratingPng}
                onClick={handleDownloadPng}
                className="px-3.5 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60"
              >
                <Download className="w-3.5 h-3.5" />
                {isGeneratingPng
                  ? 'Membuat PNG...'
                  : `Download PNG (${mode === 'invoice' ? 'Invoice' : 'SPK'} — ${activePaperMeta.name})`}
              </button>
              <button
                type="button"
                onClick={() => setShowWaPanel((v) => !v)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  showWaPanel
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-emerald-700 hover:bg-emerald-600 text-white'
                }`}
              >
                <Share2 className="w-3.5 h-3.5" />
                Bagikan via WhatsApp
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-md transition-colors"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {actionNotice && (
            <div className="px-3 py-2 bg-emerald-950/90 border border-emerald-500/60 rounded-md text-xs text-emerald-200 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                {actionNotice}
              </span>
              <button
                type="button"
                onClick={() => setActionNotice(null)}
                className="text-emerald-300 hover:text-white text-[11px]"
              >
                Tutup
              </button>
            </div>
          )}

          {showWaPanel && (
            <div className="p-3.5 bg-slate-800 border border-slate-700 rounded-lg space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 pb-2">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <Share2 className="w-4 h-4" />
                  Kirim {mode === 'invoice' ? 'Nota Invoice' : 'SPK Produksi'} ({activePaperMeta.name}) + Gambar PNG via WhatsApp
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyPngClipboard}
                    className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    Salin Gambar PNG (Paste WA)
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadPng}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    Unduh File PNG
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-4 space-y-2">
                  <div>
                    <label className="block text-[11px] text-slate-300 mb-1">
                      Nomor WhatsApp Tujuan (Pelanggan / Operator):
                    </label>
                    <input
                      type="text"
                      value={waPhone}
                      onChange={(e) => setWaPhone(e.target.value)}
                      placeholder="Contoh: 081234567890"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-600 rounded text-white font-mono text-xs"
                    />
                  </div>
                  <div className="p-2 bg-slate-900/80 border border-slate-700 rounded text-[11px] text-slate-300 leading-relaxed">
                    <strong>Info Pembayaran Nota:</strong>
                    <div className="text-emerald-300 font-semibold mt-0.5">
                      {order.paymentStatus} — {paymentDetail.fullLabel}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleShareViaWhatsapp(true)}
                    className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Download PNG & Kirim ke WhatsApp
                  </button>
                </div>
                <div className="md:col-span-8">
                  <label className="block text-[11px] text-slate-300 mb-1">
                    Pesan WhatsApp Otomatis (Dapat Diedit):
                  </label>
                  <textarea
                    rows={5}
                    value={waMessage}
                    onChange={(e) => setWaMessage(e.target.value)}
                    className="w-full p-2.5 bg-slate-900 border border-slate-600 rounded text-white font-mono text-[11px] leading-relaxed"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Paper Size Selector Bar (Thermal 80mm, 100mm, A5 Landscape, A6 Landscape, 210x100mm) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2.5 border-t border-slate-800 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-slate-400 font-medium mr-1 inline-flex items-center gap-1">
                <Receipt className="w-3.5 h-3.5" />
                Thermal Roll:
              </span>
              {PRINT_PAPER_OPTIONS.filter((o) => o.group === 'THERMAL').map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangePaperSize(opt.id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                    paperSize === opt.id
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  {opt.name} ({opt.dimensions})
                </button>
              ))}

              <span className="text-slate-600 mx-1 hidden sm:inline">|</span>

              <span className="text-slate-400 font-medium mr-1 inline-flex items-center gap-1">
                <Maximize2 className="w-3.5 h-3.5" />
                Nota / SPK Besar:
              </span>
              {PRINT_PAPER_OPTIONS.filter((o) => o.group === 'LARGE_SHEET').map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangePaperSize(opt.id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                    paperSize === opt.id
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  {opt.name} ({opt.dimensions})
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic Orientation Selector Bar for A5, A6, and 210x100mm */}
          {(paperSize === 'SIZE_210X100' ||
            paperSize === 'A5_LANDSCAPE' ||
            paperSize === 'A6_LANDSCAPE') && (
            <div className="p-2.5 bg-slate-800/90 border border-slate-700 rounded-md flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 text-xs">
              <div className="space-y-0.5">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5" />
                  <span>
                    Pengaturan Orientasi Cetak Nota {activePaperMeta.name} (Margin Atas 3,5 mm)
                  </span>
                </div>
                <div className="text-[11px] text-slate-300">
                  Isi nota tetap sesuai ukuran <strong>{activePaperMeta.name}</strong> dengan margin atas <strong>3,5 mm</strong> & garis batas potong presisi. Pilih orientasi kertas printer:
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setOrientation210x100('portrait')}
                  className={`px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${
                    orientation210x100 === 'portrait'
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-white'
                  }`}
                >
                  1. Opsi Portrait (Margin Atas 3,5mm)
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation210x100('landscape')}
                  className={`px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${
                    orientation210x100 === 'landscape'
                      ? 'bg-amber-400 text-slate-950 border-amber-300'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-white'
                  }`}
                >
                  {paperSize === 'SIZE_210X100'
                    ? '2. Opsi Landscape (Tengah Halaman)'
                    : '2. Opsi Landscape (Margin Atas 3,5mm)'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Info Banner on Screen Preview */}
        <div className="no-print px-5 py-2 bg-slate-200/80 border-b border-slate-300 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
          <div>
            Pratinjau Kertas Aktif:{' '}
            <span className="font-semibold text-slate-900">
              {activePaperMeta.name} — {activePaperMeta.dimensions}
            </span>{' '}
            {paperSize === 'SIZE_210X100' ||
            paperSize === 'A5_LANDSCAPE' ||
            paperSize === 'A6_LANDSCAPE' ? (
              <span className="font-semibold text-indigo-800">
                · Mode Cetak:{' '}
                {orientation210x100 === 'portrait'
                  ? 'Portrait (@page { size: portrait; margin: 0; } — Margin Atas 3,5mm)'
                  : paperSize === 'SIZE_210X100'
                  ? 'Landscape (@page { size: landscape; margin: 0; } — Posisi Tepat di Tengah Halaman)'
                  : 'Landscape (@page { size: landscape; margin: 0; } — Margin Atas 3,5mm)'}
              </span>
            ) : (
              `(${activePaperMeta.desc})`
            )}
          </div>
          <div className="font-mono text-slate-500">
            {paperSize === 'SIZE_210X100' ||
            paperSize === 'A5_LANDSCAPE' ||
            paperSize === 'A6_LANDSCAPE'
              ? `Margin atas 3,5mm · Garis putus-putus menampilkan batas potong presisi ${activePaperMeta.shortLabel}`
              : 'Hasil Download PNG di-flatten otomatis sama persis dengan tampilan Print Preview ini'}
          </div>
        </div>

        {/* Preview Stage */}
        <div
          className={`print-preview-stage p-4 sm:p-6 overflow-x-auto flex bg-slate-200/50 ${
            paperSize === 'SIZE_210X100' && orientation210x100 === 'landscape'
              ? 'min-h-[460px] items-center justify-center'
              : 'items-start justify-center'
          }`}
        >
          <div
            ref={sheetRef}
            data-print-sheet={`${order.id}_${mode}_${paperSize}`}
            style={getPrintPreviewContainerStyle(paperSize)}
            className={`print-sheet-wrapper print-sheet-paper bg-white text-slate-950 shadow-sm shrink-0 box-border ${
              paperSize === 'SIZE_210X100' ||
              paperSize === 'A5_LANDSCAPE' ||
              paperSize === 'A6_LANDSCAPE'
                ? 'border border-dashed border-slate-900'
                : 'border border-slate-300'
            }`}
          >
            <PrintSheetContent
              order={order}
              storeSettings={storeSettings}
              mode={mode}
              paperSize={paperSize}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
