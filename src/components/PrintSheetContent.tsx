import React from 'react';
import {
  PrintOrder,
  StoreSettings,
  PrintPaperSize,
  parseA3FinishingFlags,
  extractOrderFinishingLines,
  extractItemDetailedBreakdown,
  cleanFinishingDescText,
  extractOrderPaymentDetail,
  extractOrderCartItems,
  cleanProductJobTitle,
  getOrderFinalRounding,
  calculateBannerEffectiveDimensions,
  OrderCartItem,
  formatIDR,
  formatDateID,
  formatNumberID,
} from '../types';

export interface PrintSheetContentProps {
  order: PrintOrder;
  storeSettings: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>;
  mode: 'invoice' | 'spk';
  paperSize: PrintPaperSize;
}

export function getPrintPreviewContainerStyle(paperSize: PrintPaperSize): React.CSSProperties {
  switch (paperSize) {
    case 'THERMAL_80':
      return { width: '80mm', minHeight: '100mm', boxSizing: 'border-box' };
    case 'THERMAL_100':
      return { width: '100mm', minHeight: '110mm', boxSizing: 'border-box' };
    case 'A5_LANDSCAPE':
      return {
        width: '210mm',
        height: '148mm',
        maxHeight: '148mm',
        overflow: 'hidden',
        boxSizing: 'border-box',
      };
    case 'A6_LANDSCAPE':
      return {
        width: '148mm',
        height: '105mm',
        maxHeight: '105mm',
        overflow: 'hidden',
        boxSizing: 'border-box',
      };
    case 'SIZE_210X100':
      return {
        width: '210mm',
        height: '100mm',
        maxHeight: '100mm',
        overflow: 'hidden',
        boxSizing: 'border-box',
      };
  }
}

interface FitToPageBoxProps {
  widthMm: number;
  heightMm: number;
  children: React.ReactNode;
  contentClassName?: string;
}

const FitToPageBox: React.FC<FitToPageBoxProps> = ({
  widthMm,
  heightMm,
  children,
  contentClassName = '',
}) => {
  const outerRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);

  const fitContent = React.useCallback(() => {
    const outerEl = outerRef.current;
    const innerEl = innerRef.current;
    if (!outerEl || !innerEl) return;

    const availH = outerEl.clientHeight;
    if (availH <= 0) return;

    innerEl.style.transform = 'none';
    innerEl.style.width = '100%';
    innerEl.style.minHeight = `${availH}px`;

    const naturalH = innerEl.scrollHeight;
    if (naturalH <= availH + 1) {
      return;
    }

    let scale = Math.max(0.32, Math.min(1, (availH - 2) / naturalH));
    innerEl.style.width = `${(100 / scale).toFixed(3)}%`;
    innerEl.style.minHeight = '0px';

    const widenedH = innerEl.scrollHeight;
    if (widenedH > 0) {
      scale = Math.max(0.32, Math.min(1, (availH - 2) / widenedH));
      innerEl.style.width = `${(100 / scale).toFixed(3)}%`;
      const verifyH = innerEl.scrollHeight;
      if (verifyH * scale > availH) {
        scale = Math.max(0.32, Math.min(1, (availH - 3) / verifyH));
        innerEl.style.width = `${(100 / scale).toFixed(3)}%`;
      }
      innerEl.style.minHeight = `${Math.floor((availH - 1) / scale)}px`;
    }

    innerEl.style.transformOrigin = 'top left';
    innerEl.style.transform = `scale(${scale.toFixed(4)})`;
  }, []);

  React.useLayoutEffect(() => {
    fitContent();
    const rafId = requestAnimationFrame(() => fitContent());
    const timerId = window.setTimeout(() => fitContent(), 60);

    const outerEl = outerRef.current;
    const imgs = outerEl ? Array.from(outerEl.querySelectorAll('img')) : [];
    imgs.forEach((img) => {
      if (!img.complete) {
        img.addEventListener('load', fitContent);
      }
    });

    const handleBeforePrint = () => fitContent();
    window.addEventListener('beforeprint', handleBeforePrint);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
      imgs.forEach((img) => img.removeEventListener('load', fitContent));
      window.removeEventListener('beforeprint', handleBeforePrint);
    };
  });

  return (
    <div
      ref={outerRef}
      style={{
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        maxWidth: `${widthMm}mm`,
        maxHeight: `${heightMm}mm`,
        position: 'relative',
        overflow: 'hidden',
        boxSizing: 'border-box',
        backgroundColor: '#ffffff',
      }}
    >
      <div
        ref={innerRef}
        className={contentClassName}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          boxSizing: 'border-box',
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export const PrintSheetContent: React.FC<PrintSheetContentProps> = ({
  order: rawOrder,
  storeSettings,
  mode,
  paperSize,
}) => {
  const order: PrintOrder = {
    ...rawOrder,
    customerName: (rawOrder.customerName || '').trim() || 'Pelanggan Umum',
    jobTitle: cleanProductJobTitle(rawOrder.jobTitle || rawOrder.materialName),
  };
  const remainingDebt = Math.max(0, order.totalAmount - order.paidAmount);
  const isLunas =
    order.paymentStatus === 'Lunas' || (order.totalAmount > 0 && remainingDebt === 0);
  const baseSubtotal = order.totalAreaOrQty * order.unitPrice;
  const a3Flags = parseA3FinishingFlags(order);
  const cartItems = extractOrderCartItems(order);
  const isMultiItem = cartItems.length > 1;
  const isAtkOrder =
    (order.category || '').toLowerCase().includes('atk') ||
    (cartItems.length > 0 &&
      cartItems.every((it) => (it.category || '').toLowerCase().includes('atk')));

  const finishingLines = isAtkOrder ? [] : extractOrderFinishingLines(order);
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
  const paymentDetail = extractOrderPaymentDetail(order);
  const roundingInfo = getOrderFinalRounding(order);
  const cleanOrderNotes = paymentDetail.cleanNotes;

  const cashierDisplay =
    order.cashierName ||
    storeSettings.activeCashierName ||
    storeSettings.ownerName ||
    'Admin Kasir';

  const singleBannerDims = calculateBannerEffectiveDimensions({
    unitType: order.unitType,
    widthM: order.widthM,
    heightM: order.heightM,
    qty: order.qty,
    finishingDesc: order.finishingDesc,
  });

  const formatItemDimension = (it: OrderCartItem, short = false) => {
    if (it.unitType === 'm2') {
      const dims = calculateBannerEffectiveDimensions({
        unitType: it.unitType,
        widthM: it.widthM,
        heightM: it.heightM,
        qty: it.qty,
        finishingDesc: it.finishingDesc,
      });
      if (short || (mode === 'invoice' && dims.hasHiddenAllowance)) {
        return `${formatNumberID(it.widthM)}×${formatNumberID(it.heightM)}m (${it.qty} pcs)`;
      }
      return `${formatNumberID(it.widthM)}m × ${formatNumberID(it.heightM)}m × ${it.qty} pcs (${formatNumberID(it.totalAreaOrQty)} m²)`;
    }
    return `${formatNumberID(it.qty)} ${it.unitType}`;
  };

  const formatItemInvoiceVolume = (it: OrderCartItem) => {
    if (it.unitType === 'm2') {
      const dims = calculateBannerEffectiveDimensions({
        unitType: it.unitType,
        widthM: it.widthM,
        heightM: it.heightM,
        qty: it.qty,
        finishingDesc: it.finishingDesc,
      });
      const shownArea = mode === 'invoice' && dims.hasHiddenAllowance ? dims.nominalArea : it.totalAreaOrQty;
      return `${formatNumberID(shownArea)} m²`;
    }
    return `${formatNumberID(it.totalAreaOrQty)} ${it.unitType}`;
  };

  const dimensionText =
    order.unitType === 'm2'
      ? mode === 'invoice' && singleBannerDims.hasHiddenAllowance
        ? `${formatNumberID(order.widthM)}m × ${formatNumberID(order.heightM)}m × ${order.qty} pcs`
        : `${formatNumberID(order.widthM)}m × ${formatNumberID(order.heightM)}m × ${order.qty} pcs (${formatNumberID(order.totalAreaOrQty)} m²)`
      : `${formatNumberID(order.qty)} ${order.unitType}`;

  const shortDimensionText =
    order.unitType === 'm2'
      ? `${formatNumberID(order.widthM)}×${formatNumberID(order.heightM)}m (${order.qty} pcs)`
      : `${formatNumberID(order.qty)} ${order.unitType}`;

  const renderA3SpkChecklist = (compact = false) => {
    if (!a3Flags.isA3Order) return null;
    const items = [
      { label: 'Bolak Balik (+50%)', checked: a3Flags.bolakBalik },
      { label: '1 Muka', checked: a3Flags.satuMuka || (!a3Flags.bolakBalik && a3Flags.isA3Order) },
      {
        label: a3Flags.laminasiBolakBalik
          ? 'Laminasi Glossy (Bolak Balik ×2)'
          : 'Laminasi Glossy (1 Muka)',
        checked: a3Flags.laminasiGlossy,
      },
      {
        label: a3Flags.laminasiBolakBalik
          ? 'Laminasi Doff (Bolak Balik ×2)'
          : 'Laminasi Doff (1 Muka)',
        checked: a3Flags.laminasiDoff,
      },
      { label: 'Potong Sisi Rapi', checked: a3Flags.potongSisiRapi },
      { label: 'Potong Mesin Putus Sesuai Pola (DieCut)', checked: a3Flags.potongDieCut },
      {
        label: 'Potong Mesin Setengah Putus Sesuai Pola (Kiss Cut)',
        checked: a3Flags.potongKissCut,
      },
    ];
    return (
      <div
        className={`border border-slate-900 ${
          compact ? 'p-1.5 mt-1 text-[9px]' : 'p-2 mt-1.5 text-[10px]'
        } bg-slate-50/70`}
      >
        <div className="font-bold uppercase tracking-tight mb-1 border-b border-dashed border-slate-400 pb-0.5">
          Checklist Finishing Lembar A3+:
        </div>
        <div
          className={
            compact ? 'grid grid-cols-2 gap-x-2 gap-y-0.5' : 'grid grid-cols-2 gap-x-3 gap-y-1'
          }
        >
          {items.map((it) => (
            <div
              key={it.label}
              className={`flex items-start gap-1 ${
                it.checked ? 'font-bold text-slate-950' : 'text-slate-500'
              }`}
            >
              <span className="font-mono shrink-0">{it.checked ? '[✓]' : '[ ]'}</span>
              <span>{it.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const isThermalRoll = paperSize === 'THERMAL_80' || paperSize === 'THERMAL_100';
  const isThermal100 = paperSize === 'THERMAL_100';

  return (
    <>
      {/* =====================================================================
          1 & 2. UNIFIED THERMAL PRINTER 80MM & 100MM
          (Isi, struktur tabel, rincian item, pembulatan, catatan, & tanda tangan 100% SAMA)
         ===================================================================== */}
      {isThermalRoll && (
        <div
          className={`${
            isThermal100 ? 'p-4 text-xs' : 'p-3 text-[11px]'
          } leading-snug font-sans text-slate-950 bg-white`}
        >
          {mode === 'invoice' ? (
            <div>
              {/* Store Header (Identical Content on 80mm & 100mm) */}
              <div className="text-center border-b-2 border-dashed border-slate-900 pb-2.5 mb-2.5">
                {storeSettings.logoDataUrl && (
                  <img
                    src={storeSettings.logoDataUrl}
                    alt="Logo"
                    className={`${
                      isThermal100 ? 'h-11 max-w-[140px]' : 'h-10 max-w-[120px]'
                    } object-contain mx-auto mb-1`}
                  />
                )}
                <div
                  className={`font-bold ${
                    isThermal100 ? 'text-base' : 'text-sm'
                  } uppercase tracking-tight text-slate-950`}
                >
                  {storeSettings.storeName || 'CETAKPRO DIGITAL PRINTING'}
                </div>
                {storeSettings.tagline && (
                  <div className="text-[10px] text-slate-700 mt-0.5">{storeSettings.tagline}</div>
                )}
                {storeSettings.address && (
                  <div className="text-[10px] text-slate-600 mt-0.5">{storeSettings.address}</div>
                )}
                {storeSettings.phone && (
                  <div className="text-[10px] font-mono font-semibold text-slate-800 mt-0.5">
                    Telp / WhatsApp: {storeSettings.phone}
                  </div>
                )}
                <div className="mt-1.5 inline-block border border-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  NOTA TAGIHAN / INVOICE KASIR
                </div>
              </div>

              {/* Unified Order Metadata (Maksimal 4 Baris Side-by-Side pada 80mm & 100mm) */}
              <div
                className={`border-b border-dashed border-slate-900 pb-2 mb-2 space-y-0.5 ${
                  isThermal100 ? 'text-[10px]' : 'text-[9px]'
                } leading-tight`}
              >
                {/* Baris 1: No. Nota/SPK & Nama Kasir */}
                <div className="flex items-center justify-between gap-1.5 whitespace-nowrap">
                  <div className="truncate">
                    <span className="text-slate-600">No. Nota/SPK: </span>
                    <span className="font-mono font-bold text-slate-950">
                      {order.invoiceNumber}
                    </span>
                  </div>
                  <div className="truncate text-right">
                    <span className="text-slate-600">Kasir: </span>
                    <span className="font-semibold text-slate-950">{cashierDisplay}</span>
                  </div>
                </div>

                {/* Baris 2: Tanggal Masuk & Estimasi Selesai */}
                <div className="flex items-center justify-between gap-1.5 whitespace-nowrap">
                  <div className="shrink-0">
                    <span className="text-slate-600">Tanggal Masuk: </span>
                    <span className="font-mono text-slate-900">
                      {formatDateID(order.orderDate)}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-slate-600">Estimasi Selesai: </span>
                    <span className="font-mono font-semibold text-slate-950">
                      {formatDateID(order.deadlineDate)}
                    </span>
                  </div>
                </div>

                {/* Baris 3: Pelanggan & No. Telp / WA */}
                <div className="flex items-center justify-between gap-1.5 whitespace-nowrap">
                  <div className="truncate">
                    <span className="text-slate-600">Pelanggan: </span>
                    <span className="font-bold text-slate-950">{order.customerName}</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-slate-600">No. Telp/WA: </span>
                    <span className="font-mono text-slate-900">
                      {order.customerPhone || '-'}
                    </span>
                  </div>
                </div>

                {/* Baris 4: Status & Metode Pembayaran */}
                <div className="flex items-center justify-between gap-1.5 whitespace-nowrap">
                  <div className="shrink-0">
                    <span className="text-slate-600">Status: </span>
                    {isLunas ? (
                      <span className="text-xs font-black uppercase tracking-wider text-slate-950">
                        LUNAS
                      </span>
                    ) : (
                      <span className="font-bold text-slate-950">{order.paymentStatus}</span>
                    )}
                  </div>
                  <div className="truncate text-right">
                    <span className="text-slate-600">Metode: </span>
                    <span className="font-bold text-slate-950">{paymentDetail.fullLabel}</span>
                  </div>
                </div>
              </div>

              {/* Unified Item Breakdown Table (Identical on 80mm & 100mm) */}
              <table className="w-full text-[10px] border-collapse mb-2">
                <thead>
                  <tr className="border-b border-dashed border-slate-900 text-left">
                    <th className="py-1 font-bold text-slate-950">
                      {isAtkOrder ? 'Nama Produk & Rincian Barang' : 'Item & Spesifikasi Cetak'}
                    </th>
                    <th className="py-1 text-right font-black text-slate-950">Sub Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dashed divide-slate-300">
                  {isMultiItem ? (
                    cartItems.map((it, idx) => {
                      const detail = extractItemDetailedBreakdown(it);
                      const isAtkItem =
                        (it.category || order.category || it.materialName || '')
                          .toLowerCase()
                          .includes('atk') ||
                        (it.category || '').toLowerCase().includes('perlengkapan');

                      // Format khusus "ATK & Perlengkapan": Hanya 2 baris hemat kertas
                      if (isAtkItem) {
                        const unitStr = (it.unitType || 'pcs').toLowerCase().trim() || 'pcs';
                        return (
                          <tr key={it.id || idx}>
                            <td colSpan={2} className="py-1 align-top">
                              {/* Baris 1: #1 Lakban Bening / Coklat 2 Inch */}
                              <div className="font-bold text-slate-950 text-[11px] leading-tight">
                                #{idx + 1} {cleanProductJobTitle(it.jobTitle)}
                              </div>
                              {/* Baris 2: Sub Total #1 - 2 roll × Rp 16.000/roll   Rp 32.000 */}
                              <div className="flex justify-between items-baseline gap-2 mt-0.5">
                                <span className="text-[10px] text-slate-800 font-medium leading-tight">
                                  Sub Total #{idx + 1} - {formatNumberID(it.qty)} {unitStr} × {formatIDR(it.unitPrice)}/{unitStr}
                                </span>
                                <span className="font-mono font-black text-xs sm:text-[13px] text-slate-950 tabular-nums shrink-0 whitespace-nowrap">
                                  {formatIDR(detail.itemSubtotal)}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      // Produk Cetak: Format asli lengkap tidak diubah apapun
                      return (
                        <tr key={it.id || idx}>
                          <td colSpan={2} className="py-1.5 align-top">
                            <div className="flex justify-between items-start font-bold text-slate-950 text-[11px]">
                              <span>
                                #{idx + 1} {it.jobTitle}
                              </span>
                              <span className="font-mono text-[9px] bg-slate-100 px-1 rounded">
                                {formatItemDimension(it, true)}
                              </span>
                            </div>
                            {detail.isA3Sheet && (
                              <div className="text-[9px] text-slate-700">
                                Harga Satuan A3+: {formatIDR(it.unitPrice)} / lembar
                              </div>
                            )}
                            {/* Rincian Cetak Sebelum Sub Total */}
                            <div className="flex justify-between items-baseline text-[10px] text-slate-900 font-medium mt-0.5">
                              <span className="pr-2">• {detail.basePrintLabel}</span>
                              <span className="font-mono font-bold tabular-nums shrink-0">
                                {formatIDR(detail.baseSubtotal)}
                              </span>
                            </div>
                            {/* Rincian Jasa Potong / Finishing Sebelum Sub Total */}
                            {detail.finishingLines.map((fl) => (
                              <div
                                key={fl.id}
                                className="flex justify-between items-baseline text-[9px] text-slate-800"
                              >
                                <span className="pr-2">• {fl.label}</span>
                                <span className="font-mono font-semibold tabular-nums shrink-0">
                                  {fl.amount > 0 ? `+${formatIDR(fl.amount)}` : 'Rp 0'}
                                </span>
                              </div>
                            ))}
                            {it.designFee > 0 && (
                              <div className="flex justify-between items-baseline text-[9px] text-slate-800">
                                <span>• Biaya Jasa Desain</span>
                                <span className="font-mono font-semibold tabular-nums shrink-0">
                                  +{formatIDR(it.designFee)}
                                </span>
                              </div>
                            )}
                            {(it.discount || 0) > 0 && (
                              <div className="flex justify-between items-baseline text-[9px] text-rose-700">
                                <span>• Diskon Item</span>
                                <span className="font-mono font-semibold tabular-nums shrink-0">
                                  -{formatIDR(it.discount || 0)}
                                </span>
                              </div>
                            )}
                            {/* Baris Sub Total dengan Penjumlahan Rincian */}
                            <div className="flex justify-between items-baseline text-[11px] font-black text-slate-950 pt-0.5 mt-0.5 border-t border-dotted border-slate-400">
                              <span className="font-black">
                                Sub Total #{idx + 1}
                                {detail.hasExtraComponents
                                  ? ` (${detail.subtotalFormulaNumbers})`
                                  : ''}
                              </span>
                              <span className="font-mono font-black tabular-nums shrink-0">
                                {formatIDR(detail.itemSubtotal)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : isAtkOrder ? (
                    // Single item khusus pesanan ATK: 2 baris hemat kertas
                    (() => {
                      const unitStr = (order.unitType || 'pcs').toLowerCase().trim() || 'pcs';
                      return (
                        <tr>
                          <td colSpan={2} className="py-1 align-top">
                            {/* Baris 1: #1 Lakban Bening / Coklat 2 Inch */}
                            <div className="font-bold text-slate-950 text-[11px] leading-tight">
                              #1 {cleanProductJobTitle(order.jobTitle)}
                            </div>
                            {/* Baris 2: Sub Total #1 - 2 roll × Rp 16.000/roll   Rp 32.000 */}
                            <div className="flex justify-between items-baseline gap-2 mt-0.5">
                              <span className="text-[10px] text-slate-800 font-medium leading-tight">
                                Sub Total #1 - {formatNumberID(order.qty)} {unitStr} × {formatIDR(order.unitPrice)}/{unitStr}
                              </span>
                              <span className="font-mono font-black text-xs sm:text-[13px] text-slate-950 tabular-nums shrink-0 whitespace-nowrap">
                                {formatIDR(singleItemDetail.itemSubtotal)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })()
                  ) : (
                    // Single item produk cetak: format tidak diubah apapun
                    <>
                      <tr>
                        <td className="py-1.5 pr-2 align-top">
                          <div className="font-bold text-slate-950 text-[11px]">
                            {order.jobTitle}
                          </div>
                          {singleItemDetail.isA3Sheet && (
                            <div className="text-[9px] text-slate-700">
                              Harga Satuan A3+: {formatIDR(order.unitPrice)} / lembar
                            </div>
                          )}
                          <div className="font-medium text-[10px] text-slate-900 mt-0.5">
                            • {singleItemDetail.basePrintLabel}
                          </div>
                        </td>
                        <td className="py-1.5 text-right font-mono font-bold align-bottom tabular-nums whitespace-nowrap">
                          {formatIDR(baseSubtotal)}
                        </td>
                      </tr>
                      {finishingLines.map((fl) => (
                        <tr key={fl.id}>
                          <td className="py-1 pr-2 text-[10px]">• {fl.label}</td>
                          <td className="py-1 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                            {fl.amount > 0 ? `+${formatIDR(fl.amount)}` : 'Rp 0'}
                          </td>
                        </tr>
                      ))}
                      {order.designFee > 0 && (
                        <tr>
                          <td className="py-1 pr-2 text-[10px]">• Biaya Jasa Desain & Setting</td>
                          <td className="py-1 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                            +{formatIDR(order.designFee)}
                          </td>
                        </tr>
                      )}
                      {order.discount > 0 && (
                        <tr>
                          <td className="py-1 pr-2 text-[10px] text-rose-700">
                            • Potongan Harga / Diskon Nota
                          </td>
                          <td className="py-1 text-right font-mono tabular-nums text-rose-700 whitespace-nowrap">
                            -{formatIDR(order.discount)}
                          </td>
                        </tr>
                      )}
                      <tr className="border-t border-dashed border-slate-400">
                        <td className="py-1 pr-2 text-[11px] font-black text-slate-950">
                          {singleItemDetail.subtotalLabelWithFormula}
                        </td>
                        <td className="py-1 text-right font-mono font-black text-[11px] text-slate-950 tabular-nums whitespace-nowrap">
                          {formatIDR(singleItemDetail.itemSubtotal)}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>

              {/* Unified Totals & Rounding Section */}
              <div className="border-y-2 border-dashed border-slate-900 py-2 mb-2 space-y-1 text-[10px]">
                {roundingInfo.roundingAdjustment !== 0 && (
                  <>
                    <div className="flex justify-between">
                      <span>Total Hitung Sebelum Pembulatan</span>
                      <span className="font-mono tabular-nums">
                        {formatIDR(roundingInfo.rawTotal)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pembulatan Akhir Kasir</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {roundingInfo.roundingAdjustment > 0
                          ? `+${formatIDR(roundingInfo.roundingAdjustment)}`
                          : `-${formatIDR(Math.abs(roundingInfo.roundingAdjustment))}`}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between font-bold text-xs text-slate-950">
                  <span>TOTAL TAGIHAN</span>
                  <span className="font-mono tabular-nums">{formatIDR(order.totalAmount)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>
                    Dibayar (
                    {isLunas ? (
                      <span className="text-xs font-black uppercase tracking-wide">LUNAS</span>
                    ) : (
                      order.paymentStatus
                    )}{' '}
                    · {paymentDetail.fullLabel})
                  </span>
                  <span className="font-mono font-semibold tabular-nums">
                    {formatIDR(order.paidAmount)}
                  </span>
                </div>
                <div className="flex justify-between items-center font-bold text-[11px] pt-1 border-t border-dashed border-slate-400">
                  <span>SISA TAGIHAN (PIUTANG)</span>
                  <span className="font-mono tabular-nums">{formatIDR(remainingDebt)}</span>
                </div>
                {isLunas && (
                  <div className="pt-1.5 mt-1 border-t border-dashed border-slate-900 text-center">
                    <span className="inline-block border-2 border-slate-950 px-3 py-0.5 text-base font-black uppercase tracking-widest text-slate-950">
                      LUNAS
                    </span>
                  </div>
                )}
              </div>

              {/* Unified Notes, Bank Info, Signatures & Footer */}
              <div className="space-y-1.5 text-[10px]">
                {paymentDetail.bankName && (
                  <div className="p-1.5 border border-slate-400 rounded bg-slate-50 font-semibold text-left">
                    Keterangan Pembayaran: {paymentDetail.fullLabel}
                  </div>
                )}
                {cleanOrderNotes && (
                  <div className="p-1.5 border border-slate-400 rounded text-left">
                    <span className="font-bold">Catatan: </span>
                    {cleanOrderNotes}
                  </div>
                )}
                {storeSettings.bankAccountInfo && (
                  <div className="font-mono font-semibold text-center text-slate-950">
                    Rekening Transfer: {storeSettings.bankAccountInfo}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 pt-1.5 text-center">
                  <div>
                    <div className="pb-6">Kasir / Admin</div>
                    <div className="border-t border-slate-400 pt-0.5 font-semibold truncate">
                      ( {cashierDisplay.slice(0, 20)} )
                    </div>
                  </div>
                  <div>
                    <div className="pb-6">Pelanggan</div>
                    <div className="border-t border-slate-400 pt-0.5 truncate">
                      ( {order.customerName.slice(0, 18)} )
                    </div>
                  </div>
                </div>
                {storeSettings.invoiceFooterNote && (
                  <div className="text-[9px] text-center text-slate-600 leading-tight pt-1">
                    {storeSettings.invoiceFooterNote}
                  </div>
                )}
                <div className="pt-1 text-center font-mono text-[9px] text-slate-500">
                  --- TERIMA KASIH ---
                </div>
              </div>
            </div>
          ) : (
            /* UNIFIED SPK THERMAL 80MM & 100MM */
            <div>
              <div className="text-center border-b-2 border-slate-900 pb-2 mb-2">
                <div className="text-[10px] font-mono uppercase text-slate-600">
                  WORKSHOP {storeSettings.storeName || 'CETAKPRO DIGITAL PRINTING'}
                </div>
                <div className="text-sm font-bold uppercase tracking-tight">
                  SURAT PERINTAH KERJA
                </div>
                <div className="font-mono font-bold text-xs mt-0.5">{order.invoiceNumber}</div>
              </div>

              <div
                className={`border-b border-dashed border-slate-900 pb-2 mb-2 space-y-0.5 ${
                  isThermal100 ? 'text-[10px]' : 'text-[9px]'
                } leading-tight`}
              >
                <div className="flex items-center justify-between gap-1.5 whitespace-nowrap">
                  <div className="truncate">
                    <span className="text-slate-600">No. Nota/SPK: </span>
                    <span className="font-mono font-bold text-slate-950">
                      {order.invoiceNumber}
                    </span>
                  </div>
                  <div className="truncate text-right">
                    <span className="text-slate-600">Kasir: </span>
                    <span className="font-semibold text-slate-950">{cashierDisplay}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-1.5 whitespace-nowrap">
                  <div className="shrink-0">
                    <span className="text-slate-600">Tanggal Masuk: </span>
                    <span className="font-mono text-slate-900">
                      {formatDateID(order.orderDate)}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-slate-600">Estimasi Selesai: </span>
                    <span className="font-mono font-bold text-slate-950">
                      {formatDateID(order.deadlineDate)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-1.5 whitespace-nowrap">
                  <div className="truncate">
                    <span className="text-slate-600">Pemesan: </span>
                    <span className="font-bold text-slate-950">{order.customerName}</span>
                  </div>
                  <div className="truncate text-right">
                    <span className="text-slate-600">Divisi: </span>
                    <span className="font-bold text-slate-950">{order.category}</span>
                  </div>
                </div>
              </div>

              {isMultiItem ? (
                <div className="space-y-2 mb-2">
                  <div className="text-[10px] font-bold uppercase bg-slate-900 text-white px-2 py-1">
                    Daftar Item Produksi ({cartItems.length} Produk):
                  </div>
                  {cartItems.map((it, idx) => (
                    <div
                      key={it.id || idx}
                      className="border border-slate-900 p-2 space-y-1 text-[10px]"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-bold text-xs">
                          #{idx + 1}. {it.jobTitle}
                        </span>
                        <span className="text-[9px] font-mono bg-slate-100 px-1.5 py-0.5 border border-slate-400">
                          {it.category}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-dashed border-slate-300 pt-1">
                        <span className="text-slate-600">Bahan Cetak:</span>
                        <span className="font-bold text-right">{it.materialName}</span>
                      </div>
                      <div className="flex justify-between border-t border-dashed border-slate-300 pt-1">
                        <span className="text-slate-600">Dimensi & Qty:</span>
                        <span className="font-mono font-bold tabular-nums">
                          {formatItemDimension(it)}
                        </span>
                      </div>
                      {!(it.category || '').toLowerCase().includes('atk') && (
                        <div className="border-t border-dashed border-slate-300 pt-1">
                          <span className="font-bold">Finishing: </span>
                          <span>
                            {cleanFinishingDescText(it.finishingDesc, it.category) ||
                              'Potong Pas Standar'}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-slate-900 p-2 mb-2 space-y-1.5 text-[10px]">
                  <div>
                    <div className="text-[9px] uppercase text-slate-600">
                      Judul File / Pekerjaan:
                    </div>
                    <div className="font-bold text-xs">{order.jobTitle}</div>
                  </div>
                  <div className="border-t border-dashed border-slate-400 pt-1">
                    <div className="text-[9px] uppercase text-slate-600">Bahan / Media Cetak:</div>
                    <div className="font-bold text-[11px]">{order.materialName}</div>
                  </div>
                  <div className="border-t border-dashed border-slate-400 pt-1 flex justify-between items-baseline">
                    <span className="text-[9px] uppercase text-slate-600">Ukuran & Qty:</span>
                    <span className="font-mono font-bold text-[11px] tabular-nums">
                      {dimensionText}
                    </span>
                  </div>
                  <div className="border-t border-dashed border-slate-400 pt-1 flex justify-between items-baseline">
                    <span className="text-[9px] uppercase text-slate-600">Total Volume:</span>
                    <span className="font-mono font-bold text-xs tabular-nums">
                      {formatNumberID(order.totalAreaOrQty)} {order.unitType}
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-1.5 text-[10px] border-b border-dashed border-slate-900 pb-2 mb-3">
                {!isAtkOrder && (
                  <div>
                    <span className="font-bold">Finishing: </span>
                    <span>
                      {cleanFinishingDescText(order.finishingDesc, order.category) ||
                        'Potong Pas Standar'}
                    </span>
                  </div>
                )}
                {renderA3SpkChecklist(!isThermal100)}
                <div>
                  <span className="font-bold">Catatan Operator: </span>
                  <span>{cleanOrderNotes || 'Cek nozzle & ukuran sebelum cetak.'}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-center text-[9px] pt-1">
                <div className="border border-slate-400 p-1">
                  <div className="pb-6">Desain/Rip</div>
                  <div className="border-t border-slate-400 pt-0.5">Paraf</div>
                </div>
                <div className="border border-slate-400 p-1">
                  <div className="pb-6">Operator</div>
                  <div className="border-t border-slate-400 pt-0.5">Paraf</div>
                </div>
                <div className="border border-slate-400 p-1">
                  <div className="pb-6">QC / Fin</div>
                  <div className="border-t border-slate-400 pt-0.5">Paraf</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          3. UKURAN 210 x 100 MM (Slip Horizontal 1/3 A4 / Continuous Form)
         ===================================================================== */}
      {paperSize === 'SIZE_210X100' && (
        <FitToPageBox
          widthMm={210}
          heightMm={100}
          contentClassName="pt-[3.5mm] px-2.5 pb-2.5 text-[10px] leading-tight font-sans text-slate-950 bg-white flex flex-col justify-between box-border"
        >
          {mode === 'invoice' ? (
            <>
              <div className="grid grid-cols-12 gap-2 border-b-2 border-slate-900 pb-1.5 mb-1.5 items-start">
                <div className="col-span-5 flex items-start gap-1.5">
                  {storeSettings.logoDataUrl && (
                    <img
                      src={storeSettings.logoDataUrl}
                      alt="Logo"
                      className="w-8 h-8 object-contain shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="font-bold text-xs uppercase tracking-tight truncate">
                      {storeSettings.storeName || 'CETAKPRO DIGITAL PRINTING'}
                    </div>
                    <div className="text-[9px] text-slate-700 truncate">
                      {storeSettings.address}
                    </div>
                    <div className="text-[9px] font-mono text-slate-800">
                      Telp/WA: {storeSettings.phone}
                    </div>
                  </div>
                </div>
                <div className="col-span-3 text-center">
                  <div className="inline-block border border-slate-900 px-2 py-0.5 font-bold text-[10px] uppercase tracking-wider">
                    NOTA / FAKTUR KASIR
                  </div>
                  <div className="text-[8px] font-mono mt-0.5 text-slate-600">
                    Format 210×100mm
                  </div>
                </div>
                <div className="col-span-4 text-right text-[9px] space-y-0.5">
                  <div className="font-mono font-bold text-[11px]">No: {order.invoiceNumber}</div>
                  <div>
                    Tgl: <span className="font-mono">{formatDateID(order.orderDate)}</span> ·
                    Selesai: <span className="font-mono">{formatDateID(order.deadlineDate)}</span>
                  </div>
                  <div className="font-bold text-slate-950 truncate">
                    Kepada: {order.customerName}{' '}
                    {order.customerPhone ? `(${order.customerPhone})` : ''}
                  </div>
                </div>
              </div>

              <div className="my-auto">
                <table className="w-full border-collapse border border-slate-900 text-[9.5px]">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-900 text-slate-900">
                      <th className="border-r border-slate-900 py-1 px-1.5 text-left font-bold">
                        Nama Item / Pekerjaan
                      </th>
                      <th className="border-r border-slate-900 py-1 px-1.5 text-center font-bold">
                        Dimensi / Ukuran
                      </th>
                      <th className="border-r border-slate-900 py-1 px-1.5 text-right font-bold">
                        Volume
                      </th>
                      <th className="border-r border-slate-900 py-1 px-1.5 text-right font-bold">
                        Harga Satuan
                      </th>
                      {!isAtkOrder && (
                        <th className="border-r border-slate-900 py-1 px-1.5 text-right font-bold">
                          Desain & Finishing
                        </th>
                      )}
                      <th className="py-1 px-1.5 text-right font-black">Sub Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isMultiItem ? (
                      cartItems.map((it, idx) => {
                        const detail = extractItemDetailedBreakdown(it);
                        return (
                          <tr
                            key={it.id || idx}
                            className="border-b border-slate-300 last:border-b-0"
                          >
                            <td className="border-r border-slate-900 py-1 px-1.5">
                              <div className="font-bold text-[10px]">
                                #{idx + 1}. {it.jobTitle}
                              </div>
                              <div className="text-[8.5px] text-slate-800 font-medium">
                                • {detail.basePrintLabel} ={' '}
                                <span className="font-mono font-bold">
                                  {formatIDR(detail.baseSubtotal)}
                                </span>
                              </div>
                              {detail.finishingLines.map((fl) => (
                                <div key={fl.id} className="text-[8.5px] text-slate-800">
                                  • {fl.label} ={' '}
                                  <span className="font-mono font-semibold">
                                    {fl.amount > 0 ? `+${formatIDR(fl.amount)}` : 'Rp 0'}
                                  </span>
                                </div>
                              ))}
                              {detail.hasExtraComponents && (
                                <div className="text-[9px] font-black text-slate-950">
                                  {detail.subtotalLabelWithFormula} ={' '}
                                  <span className="font-mono font-black">
                                    {formatIDR(detail.itemSubtotal)}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="border-r border-slate-900 py-1 px-1.5 text-center font-mono tabular-nums align-top">
                              {formatItemDimension(it, true)}
                            </td>
                            <td className="border-r border-slate-900 py-1 px-1.5 text-right font-mono tabular-nums align-top">
                              {formatItemInvoiceVolume(it)}
                            </td>
                            <td className="border-r border-slate-900 py-1 px-1.5 text-right font-mono tabular-nums align-top">
                              {formatIDR(it.unitPrice)}
                            </td>
                            {!isAtkOrder && (
                              <td className="border-r border-slate-900 py-1 px-1.5 text-right font-mono tabular-nums align-top">
                                {formatIDR(it.designFee + it.finishingFee)}
                                {(it.discount || 0) > 0 && (
                                  <div className="text-rose-700">
                                    Disk: -{formatIDR(it.discount || 0)}
                                  </div>
                                )}
                              </td>
                            )}
                            <td className="py-1 px-1.5 text-right font-mono font-black text-[10px] tabular-nums align-top">
                              {formatIDR(detail.itemSubtotal)}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td className="border-r border-slate-900 py-1.5 px-1.5">
                          <div className="font-bold text-[10.5px]">{order.jobTitle}</div>
                          <div className="mt-0.5 text-[8.5px] text-slate-900 font-medium">
                            • {singleItemDetail.basePrintLabel} ={' '}
                            <span className="font-mono font-bold">
                              {formatIDR(baseSubtotal)}
                            </span>
                          </div>
                          {finishingLines.length > 0 ? (
                            <div className="mt-0.5 space-y-0.5 text-[8.5px] text-slate-800">
                              {finishingLines.map((fl) => (
                                <div key={fl.id} className="flex justify-between gap-2">
                                  <span>• {fl.label}</span>
                                  <span className="font-mono font-semibold">
                                    {fl.amount > 0 ? `+${formatIDR(fl.amount)}` : 'Rp 0'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            !isAtkOrder &&
                            cleanFinishingDescText(order.finishingDesc, order.category) && (
                              <div className="text-slate-600 text-[8.5px]">
                                Finishing:{' '}
                                {cleanFinishingDescText(order.finishingDesc, order.category)}
                              </div>
                            )
                          )}
                          {singleItemDetail.hasExtraComponents && (
                            <div className="mt-0.5 text-[9px] font-black text-slate-950 border-t border-dotted border-slate-300 pt-0.5">
                              {singleItemDetail.subtotalLabelWithFormula} ={' '}
                              <span className="font-mono font-black">
                                {formatIDR(singleItemDetail.itemSubtotal)}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="border-r border-slate-900 py-1.5 px-1.5 text-center font-mono tabular-nums">
                          {order.unitType === 'm2'
                            ? `${formatNumberID(order.widthM)}m × ${formatNumberID(order.heightM)}m × ${order.qty} pcs`
                            : `${formatNumberID(order.qty)} ${order.unitType}`}
                        </td>
                        <td className="border-r border-slate-900 py-1.5 px-1.5 text-right font-mono tabular-nums">
                          {order.unitType === 'm2' && singleBannerDims.hasHiddenAllowance
                            ? `${formatNumberID(singleBannerDims.nominalArea)} m²`
                            : `${formatNumberID(order.totalAreaOrQty)} ${order.unitType}`}
                        </td>
                        <td className="border-r border-slate-900 py-1.5 px-1.5 text-right font-mono tabular-nums">
                          {formatIDR(order.unitPrice)}
                        </td>
                        {!isAtkOrder && (
                          <td className="border-r border-slate-900 py-1.5 px-1.5 text-right font-mono tabular-nums">
                            {formatIDR(order.designFee + order.finishingFee)}
                            {order.discount > 0 && (
                              <div className="text-rose-700">Disk: -{formatIDR(order.discount)}</div>
                            )}
                          </td>
                        )}
                        <td className="py-1.5 px-1.5 text-right font-mono font-black text-[10.5px] tabular-nums">
                          {formatIDR(order.totalAmount)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-12 gap-2 border-t border-slate-900 pt-1.5 mt-1.5 items-end text-[9px]">
                <div className="col-span-5 space-y-0.5">
                  {paymentDetail.bankName && (
                    <div className="font-semibold text-slate-900">
                      Ket. Pembayaran: {paymentDetail.fullLabel}
                    </div>
                  )}
                  <div className="truncate">
                    <span className="font-bold">Catatan: </span>
                    <span>{cleanOrderNotes || '-'}</span>
                  </div>
                  {storeSettings.bankAccountInfo && (
                    <div className="font-mono font-semibold truncate">
                      Transfer: {storeSettings.bankAccountInfo}
                    </div>
                  )}
                  {storeSettings.invoiceFooterNote && (
                    <div className="text-[8px] text-slate-600 line-clamp-1">
                      {storeSettings.invoiceFooterNote}
                    </div>
                  )}
                </div>

                <div className="col-span-3 grid grid-cols-2 gap-1.5 text-center">
                  <div>
                    <div className="pb-3.5">Kasir / Admin</div>
                    <div className="border-t border-slate-400 pt-0.5 font-semibold truncate">
                      ( {cashierDisplay} )
                    </div>
                  </div>
                  <div>
                    <div className="pb-3.5">Pelanggan</div>
                    <div className="border-t border-slate-400 pt-0.5">( ............. )</div>
                  </div>
                </div>

                <div className="col-span-4 border border-slate-900 p-1 space-y-0.5 bg-slate-50">
                  {roundingInfo.roundingAdjustment !== 0 && (
                    <div className="flex justify-between text-[8px] text-slate-600">
                      <span>Hitung: {formatIDR(roundingInfo.rawTotal)} | Pembulatan:</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {roundingInfo.roundingAdjustment > 0
                          ? `+${formatIDR(roundingInfo.roundingAdjustment)}`
                          : `-${formatIDR(Math.abs(roundingInfo.roundingAdjustment))}`}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-[10px]">
                    <span>TOTAL TAGIHAN:</span>
                    <span className="font-mono tabular-nums">{formatIDR(order.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Dibayar ({paymentDetail.fullLabel}):</span>
                    <span className="font-mono font-semibold tabular-nums">
                      {formatIDR(order.paidAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center font-bold border-t border-slate-300 pt-0.5">
                    <span>SISA PIUTANG:</span>
                    <span className="font-mono tabular-nums">
                      {isLunas ? (
                        <span className="text-xs font-black uppercase tracking-wider mr-1.5">
                          LUNAS
                        </span>
                      ) : null}
                      {formatIDR(remainingDebt)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2 mb-2">
                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-600">
                    WORKSHOP {storeSettings.storeName}
                  </div>
                  <div className="text-sm font-bold uppercase">
                    SURAT PERINTAH KERJA (SPK 210×100MM)
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="text-xs font-bold">{order.invoiceNumber}</div>
                  <div className="text-[10px]">
                    Masuk: {formatDateID(order.orderDate)} ·{' '}
                    <span className="font-bold">DEADLINE: {formatDateID(order.deadlineDate)}</span>
                  </div>
                </div>
              </div>

              <table className="w-full border-collapse border border-slate-900 text-[11px] my-auto">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-900">
                    <th className="border-r border-slate-900 py-1.5 px-2 text-left">
                      Pemesan & Divisi
                    </th>
                    <th className="border-r border-slate-900 py-1.5 px-2 text-left">
                      Judul File / Pekerjaan Cetak
                    </th>
                    <th className="border-r border-slate-900 py-1.5 px-2 text-left">
                      Bahan / Media
                    </th>
                    <th className="border-r border-slate-900 py-1.5 px-2 text-center">
                      Dimensi Ukuran & Qty
                    </th>
                    <th className="py-1.5 px-2 text-right">Total Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {isMultiItem ? (
                    cartItems.map((it, idx) => (
                      <tr key={it.id || idx} className="border-b border-slate-300 last:border-b-0">
                        <td className="border-r border-slate-900 py-1.5 px-2">
                          <div className="font-bold">{order.customerName}</div>
                          <div className="text-[10px] text-slate-600">{it.category}</div>
                        </td>
                        <td className="border-r border-slate-900 py-1.5 px-2">
                          <div className="font-bold text-xs">
                            #{idx + 1}. {it.jobTitle}
                          </div>
                          {!(it.category || '').toLowerCase().includes('atk') &&
                            cleanFinishingDescText(it.finishingDesc, it.category) && (
                              <div className="text-[10px] text-slate-600">
                                Fin: {cleanFinishingDescText(it.finishingDesc, it.category)}
                              </div>
                            )}
                        </td>
                        <td className="border-r border-slate-900 py-1.5 px-2 font-bold">
                          {it.materialName}
                        </td>
                        <td className="border-r border-slate-900 py-1.5 px-2 text-center font-mono font-bold tabular-nums">
                          {formatItemDimension(it, true)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono font-bold text-xs tabular-nums">
                          {formatNumberID(it.totalAreaOrQty)} {it.unitType}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="border-r border-slate-900 py-2.5 px-2">
                        <div className="font-bold">{order.customerName}</div>
                        <div className="text-[10px] text-slate-600">{order.category}</div>
                      </td>
                      <td className="border-r border-slate-900 py-2.5 px-2 font-bold text-xs">
                        {order.jobTitle}
                      </td>
                      <td className="border-r border-slate-900 py-2.5 px-2 font-bold">
                        {order.materialName}
                      </td>
                      <td className="border-r border-slate-900 py-2.5 px-2 text-center font-mono font-bold tabular-nums">
                        {shortDimensionText}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold text-xs tabular-nums">
                        {formatNumberID(order.totalAreaOrQty)} {order.unitType}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="grid grid-cols-12 gap-3 border-t border-slate-900 pt-2 mt-2 items-end text-[10px]">
                <div className="col-span-6 space-y-1">
                  {!isAtkOrder && (
                    <div>
                      <span className="font-bold">Instruksi Finishing: </span>
                      <span>
                        {cleanFinishingDescText(order.finishingDesc, order.category) ||
                          'Potong pas standar'}
                      </span>
                    </div>
                  )}
                  {renderA3SpkChecklist(true)}
                  <div>
                    <span className="font-bold">Catatan Operator Mesin: </span>
                    <span>{cleanOrderNotes || 'Periksa nozzle & ukuran sebelum cetak.'}</span>
                  </div>
                </div>
                <div className="col-span-6 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="pb-5">Desain / Setting</div>
                    <div className="border-t border-slate-400 pt-0.5">( ................... )</div>
                  </div>
                  <div>
                    <div className="pb-5">Operator Cetak</div>
                    <div className="border-t border-slate-400 pt-0.5">( ................... )</div>
                  </div>
                  <div>
                    <div className="pb-5">QC & Finishing</div>
                    <div className="border-t border-slate-400 pt-0.5">( ................... )</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </FitToPageBox>
      )}

      {/* =====================================================================
          4. A6 LANDSCAPE (148 x 105 MM — Ringkas Mendatar)
         ===================================================================== */}
      {paperSize === 'A6_LANDSCAPE' && (
        <FitToPageBox
          widthMm={148}
          heightMm={105}
          contentClassName="pt-[3.5mm] px-2 pb-2 text-[9px] leading-tight font-sans text-slate-950 bg-white flex flex-col justify-between box-border"
        >
          {mode === 'invoice' ? (
            <>
              <div className="flex justify-between items-start border-b border-slate-900 pb-1.5 mb-1.5">
                <div className="max-w-[58%] flex items-start gap-1.5">
                  {storeSettings.logoDataUrl && (
                    <img
                      src={storeSettings.logoDataUrl}
                      alt="Logo"
                      className="w-7 h-7 object-contain shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="font-bold text-[11px] uppercase tracking-tight truncate">
                      {storeSettings.storeName || 'CETAKPRO DIGITAL PRINTING'}
                    </div>
                    <div className="text-[8px] text-slate-600 line-clamp-1">
                      {storeSettings.address}
                    </div>
                    <div className="text-[8px] font-mono text-slate-700">
                      WA/Telp: {storeSettings.phone}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-[9px] uppercase">NOTA TAGIHAN (A6)</div>
                  <div className="font-mono font-bold text-[10.5px]">{order.invoiceNumber}</div>
                  <div className="text-[8px] font-mono">Tgl: {formatDateID(order.orderDate)}</div>
                </div>
              </div>

              <div className="flex justify-between items-center bg-slate-50 border border-slate-300 px-2 py-1 mb-1.5 text-[9px]">
                <div className="truncate">
                  <span className="text-slate-600">Pelanggan: </span>
                  <span className="font-bold">{order.customerName}</span>
                  {order.customerPhone ? ` (${order.customerPhone})` : ''}
                </div>
                <div className="font-semibold shrink-0 ml-2 flex items-center gap-1">
                  <span>Status:</span>
                  {isLunas ? (
                    <span className="text-xs font-black uppercase tracking-wider">LUNAS</span>
                  ) : (
                    <span>{order.paymentStatus}</span>
                  )}
                  <span>· {paymentDetail.fullLabel}</span>
                </div>
              </div>

              <table className="w-full border-collapse border border-slate-800 text-[9px] mb-1.5">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-800">
                    <th className="border-r border-slate-800 py-0.5 px-1.5 text-left">
                      Deskripsi Item / Pekerjaan
                    </th>
                    <th className="border-r border-slate-800 py-0.5 px-1.5 text-right">
                      Ukuran / Qty
                    </th>
                    <th className="border-r border-slate-800 py-0.5 px-1.5 text-right">Harga</th>
                    <th className="py-0.5 px-1.5 text-right font-black">Sub Total</th>
                  </tr>
                </thead>
                <tbody>
                  {isMultiItem ? (
                    cartItems.map((it, idx) => {
                      const detail = extractItemDetailedBreakdown(it);
                      return (
                        <tr
                          key={it.id || idx}
                          className="border-t border-slate-300 first:border-t-0"
                        >
                          <td className="border-r border-slate-800 py-1 px-1.5">
                            <div className="font-bold text-[9.5px]">
                              #{idx + 1}. {it.jobTitle}
                            </div>
                            <div className="text-[8px] text-slate-900 font-medium">
                              • {detail.basePrintLabel} ={' '}
                              <span className="font-mono font-bold">
                                {formatIDR(detail.baseSubtotal)}
                              </span>
                            </div>
                            {detail.finishingLines.map((fl) => (
                              <div key={fl.id} className="text-[8px] text-slate-800">
                                • {fl.label} ={' '}
                                <span className="font-mono font-semibold">
                                  {fl.amount > 0 ? `+${formatIDR(fl.amount)}` : 'Rp 0'}
                                </span>
                              </div>
                            ))}
                            {detail.hasExtraComponents && (
                              <div className="text-[8.5px] font-black text-slate-950">
                                {detail.subtotalLabelWithFormula} ={' '}
                                <span className="font-mono font-black">
                                  {formatIDR(detail.itemSubtotal)}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="border-r border-slate-800 py-1 px-1.5 text-right font-mono tabular-nums align-top">
                            {formatItemDimension(it, true)}
                          </td>
                          <td className="border-r border-slate-800 py-1 px-1.5 text-right font-mono tabular-nums align-top">
                            {formatIDR(it.unitPrice)}
                          </td>
                          <td className="py-1 px-1.5 text-right font-mono font-black tabular-nums align-top">
                            {formatIDR(detail.itemSubtotal)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <>
                      <tr>
                        <td className="border-r border-slate-800 py-1 px-1.5">
                          <div className="font-bold text-[9.5px]">{order.jobTitle}</div>
                          <div className="text-[8px] text-slate-900 font-medium">
                            • {singleItemDetail.basePrintLabel}
                          </div>
                        </td>
                        <td className="border-r border-slate-800 py-1 px-1.5 text-right font-mono tabular-nums">
                          {shortDimensionText}
                        </td>
                        <td className="border-r border-slate-800 py-1 px-1.5 text-right font-mono tabular-nums">
                          {formatIDR(order.unitPrice)}
                        </td>
                        <td className="py-1 px-1.5 text-right font-mono font-semibold tabular-nums">
                          {formatIDR(baseSubtotal)}
                        </td>
                      </tr>
                      {finishingLines.map((fl) => (
                        <tr key={fl.id} className="border-t border-slate-300">
                          <td
                            className="border-r border-slate-800 py-0.5 px-1.5 text-[8px]"
                            colSpan={3}
                          >
                            • {fl.label}
                          </td>
                          <td className="py-0.5 px-1.5 text-right font-mono tabular-nums">
                            {fl.amount > 0 ? `+${formatIDR(fl.amount)}` : 'Rp 0'}
                          </td>
                        </tr>
                      ))}
                      {order.designFee > 0 && (
                        <tr className="border-t border-slate-300">
                          <td
                            className="border-r border-slate-800 py-0.5 px-1.5 text-[8px]"
                            colSpan={3}
                          >
                            • Biaya Jasa Desain & Setting
                          </td>
                          <td className="py-0.5 px-1.5 text-right font-mono tabular-nums">
                            +{formatIDR(order.designFee)}
                          </td>
                        </tr>
                      )}
                      {order.discount > 0 && (
                        <tr className="border-t border-slate-300">
                          <td
                            className="border-r border-slate-800 py-0.5 px-1.5 text-[8px]"
                            colSpan={3}
                          >
                            • Potongan Diskon
                          </td>
                          <td className="py-0.5 px-1.5 text-right font-mono tabular-nums text-rose-700">
                            -{formatIDR(order.discount)}
                          </td>
                        </tr>
                      )}
                      <tr className="border-t border-slate-800 bg-slate-50">
                        <td
                          className="border-r border-slate-800 py-0.5 px-1.5 text-[9px] font-black text-slate-950"
                          colSpan={3}
                        >
                          {singleItemDetail.subtotalLabelWithFormula}
                        </td>
                        <td className="py-0.5 px-1.5 text-right font-mono text-[9px] font-black tabular-nums text-slate-950">
                          {formatIDR(singleItemDetail.itemSubtotal)}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>

              <div className="grid grid-cols-12 gap-1.5 items-end pt-1 border-t border-slate-800">
                <div className="col-span-7 space-y-0.5 text-[8px]">
                  {storeSettings.bankAccountInfo && (
                    <div className="font-mono font-semibold truncate">
                      Rekening: {storeSettings.bankAccountInfo}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-1.5 pt-0.5 text-center">
                    <div>
                      <div className="pb-3.5">Kasir</div>
                      <div className="border-t border-slate-400 pt-0.5 font-semibold truncate">
                        ( {cashierDisplay} )
                      </div>
                    </div>
                    <div>
                      <div className="pb-3.5">Pelanggan</div>
                      <div className="border-t border-slate-400 pt-0.5">( ............. )</div>
                    </div>
                  </div>
                </div>
                <div className="col-span-5 border border-slate-800 p-1 space-y-0.5 text-[9px]">
                  {roundingInfo.roundingAdjustment !== 0 && (
                    <div className="flex justify-between text-[8px] text-slate-600">
                      <span>Pembulatan ({formatIDR(roundingInfo.rawTotal)}):</span>
                      <span className="font-mono tabular-nums">
                        {roundingInfo.roundingAdjustment > 0
                          ? `+${formatIDR(roundingInfo.roundingAdjustment)}`
                          : `-${formatIDR(Math.abs(roundingInfo.roundingAdjustment))}`}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold">
                    <span>TOTAL:</span>
                    <span className="font-mono tabular-nums">{formatIDR(order.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Dibayar:</span>
                    <span className="font-mono tabular-nums">{formatIDR(order.paidAmount)}</span>
                  </div>
                  <div className="flex justify-between items-center font-bold border-t border-slate-300 pt-0.5">
                    <span>Sisa Piutang:</span>
                    <span className="font-mono tabular-nums">
                      {isLunas ? (
                        <span className="text-[11px] font-black uppercase tracking-wider mr-1">
                          LUNAS
                        </span>
                      ) : null}
                      {formatIDR(remainingDebt)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between items-start border-b-2 border-slate-900 pb-2 mb-2">
                <div>
                  <div className="text-[9px] font-mono uppercase text-slate-600">
                    WORKSHOP {storeSettings.storeName}
                  </div>
                  <div className="font-bold text-xs uppercase">SURAT PERINTAH KERJA (SPK A6)</div>
                </div>
                <div className="text-right font-mono">
                  <div className="font-bold text-xs">{order.invoiceNumber}</div>
                  <div className="text-[9px]">
                    Deadline: <span className="font-bold">{formatDateID(order.deadlineDate)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 border border-slate-800 p-2 mb-2">
                <div>
                  <span className="text-slate-500 text-[9px]">Pemesan:</span>
                  <div className="font-bold">{order.customerName}</div>
                </div>
                <div>
                  <span className="text-slate-500 text-[9px]">Divisi Mesin:</span>
                  <div className="font-bold">{order.category}</div>
                </div>
                <div className="col-span-2 border-t border-slate-200 pt-1">
                  <span className="text-slate-500 text-[9px]">Judul File / Pekerjaan:</span>
                  <div className="font-bold text-xs">{order.jobTitle}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="border border-slate-800 p-1.5">
                  <div className="text-[9px] text-slate-500">Bahan Cetak</div>
                  <div className="font-bold">{order.materialName}</div>
                </div>
                <div className="border border-slate-800 p-1.5">
                  <div className="text-[9px] text-slate-500">Ukuran & Qty</div>
                  <div className="font-mono font-bold tabular-nums">{shortDimensionText}</div>
                </div>
                <div className="border border-slate-800 p-1.5">
                  <div className="text-[9px] text-slate-500">Total Volume</div>
                  <div className="font-mono font-bold tabular-nums">
                    {formatNumberID(order.totalAreaOrQty)} {order.unitType}
                  </div>
                </div>
              </div>

              <div className="border border-slate-800 p-1.5 mb-2 text-[9px] space-y-0.5">
                {!isAtkOrder && (
                  <div>
                    <span className="font-bold">Finishing: </span>
                    {cleanFinishingDescText(order.finishingDesc, order.category) ||
                      'Potong pas standar'}
                  </div>
                )}
                {renderA3SpkChecklist(true)}
                <div>
                  <span className="font-bold">Catatan: </span>
                  {cleanOrderNotes || 'Periksa hasil cetak & ukuran.'}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-[9px] pt-1">
                <div>
                  <div className="pb-5">Desain/Setting</div>
                  <div className="border-t border-slate-400 pt-0.5">( ................. )</div>
                </div>
                <div>
                  <div className="pb-5">Operator Cetak</div>
                  <div className="border-t border-slate-400 pt-0.5">( ................. )</div>
                </div>
                <div>
                  <div className="pb-5">QC & Finishing</div>
                  <div className="border-t border-slate-400 pt-0.5">( ................. )</div>
                </div>
              </div>
            </>
          )}
        </FitToPageBox>
      )}

      {/* =====================================================================
          5. A5 LANDSCAPE (210 x 148 MM — Invoice & SPK Besar Standar)
         ===================================================================== */}
      {paperSize === 'A5_LANDSCAPE' && (
        <FitToPageBox
          widthMm={210}
          heightMm={148}
          contentClassName="pt-[3.5mm] px-3 pb-2.5 text-[10.5px] leading-tight font-sans text-slate-950 bg-white flex flex-col justify-between box-border"
        >
          {mode === 'invoice' ? (
            <>
              <div>
                <div className="flex items-start justify-between border-b-2 border-slate-900 pb-1.5 mb-1.5">
                  <div className="max-w-md flex items-start gap-2">
                    {storeSettings.logoDataUrl && (
                      <img
                        src={storeSettings.logoDataUrl}
                        alt="Logo Toko"
                        className="w-9 h-9 object-contain shrink-0"
                      />
                    )}
                    <div>
                      <h2 className="text-sm font-bold tracking-tight text-slate-950 uppercase">
                        {storeSettings.storeName || 'CETAKPRO DIGITAL PRINTING'}
                      </h2>
                      <p className="text-[9.5px] text-slate-700">{storeSettings.tagline}</p>
                      {storeSettings.address && (
                        <p className="text-[9px] text-slate-600">{storeSettings.address}</p>
                      )}
                      {storeSettings.phone && (
                        <p className="text-[9px] font-mono text-slate-700">
                          Telp / WhatsApp: {storeSettings.phone}
                          {storeSettings.customStoreUrl ? ` · ${storeSettings.customStoreUrl}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="inline-block border border-slate-900 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider">
                      FAKTUR / NOTA TAGIHAN (A5)
                    </div>
                    <div className="text-xs font-mono font-bold text-slate-950 mt-0.5">
                      {order.invoiceNumber}
                    </div>
                    <div className="text-[9px] text-slate-600">
                      Tanggal Masuk:{' '}
                      <span className="font-mono font-semibold">
                        {formatDateID(order.orderDate)}
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-600">
                      Estimasi Selesai:{' '}
                      <span className="font-mono font-semibold">
                        {formatDateID(order.deadlineDate)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-1.5 text-[10px] bg-slate-50 border border-slate-300 px-2 py-1 rounded">
                  <div>
                    <div className="text-[9px] text-slate-500">
                      Ditagihkan Kepada (Pelanggan / Pemesan):
                    </div>
                    <div className="text-[11px] font-bold text-slate-950">
                      {order.customerName}{' '}
                      <span className="font-mono font-normal text-[9.5px] text-slate-700">
                        ({order.customerPhone || '-'})
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-slate-500">Status Pembayaran & Produksi:</div>
                    <div className="text-[11px] font-bold text-slate-950">
                      {isLunas ? (
                        <span className="text-sm font-black uppercase tracking-wider">LUNAS</span>
                      ) : (
                        order.paymentStatus
                      )}{' '}
                      · {paymentDetail.fullLabel}{' '}
                      <span className="font-normal text-[9.5px] text-slate-600">
                        ({order.productionStatus})
                      </span>
                    </div>
                  </div>
                </div>

                <table className="w-full text-[10px] border-collapse border border-slate-900 mb-1.5">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-900 text-slate-900">
                      <th className="border-r border-slate-900 py-1 px-1.5 text-left font-bold">
                        Deskripsi Item / Pekerjaan
                      </th>
                      <th className="border-r border-slate-900 py-1 px-1.5 text-right font-bold">
                        Dimensi / Qty
                      </th>
                      <th className="border-r border-slate-900 py-1 px-1.5 text-right font-bold">
                        Harga Satuan
                      </th>
                      <th className="py-1 px-1.5 text-right font-black">Sub Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300">
                    {isMultiItem ? (
                      cartItems.map((it, idx) => {
                        const detail = extractItemDetailedBreakdown(it);
                        return (
                          <tr key={it.id || idx}>
                            <td className="border-r border-slate-900 py-1 px-1.5">
                              <div className="font-bold text-slate-950 text-[10.5px]">
                                #{idx + 1}. {it.jobTitle}
                              </div>
                              <div className="mt-0.5 space-y-0.5 text-[9px] text-slate-800">
                                <div className="flex justify-between font-medium text-slate-950">
                                  <span>• {detail.basePrintLabel}</span>
                                  <span className="font-mono font-bold tabular-nums">
                                    {formatIDR(detail.baseSubtotal)}
                                  </span>
                                </div>
                                {detail.finishingLines.map((fl) => (
                                  <div key={fl.id} className="flex justify-between">
                                    <span>• {fl.label}</span>
                                    <span className="font-mono font-semibold tabular-nums">
                                      {fl.amount > 0 ? `+${formatIDR(fl.amount)}` : 'Rp 0'}
                                    </span>
                                  </div>
                                ))}
                                {it.designFee > 0 && (
                                  <div className="flex justify-between">
                                    <span>• Jasa Desain</span>
                                    <span className="font-mono font-semibold tabular-nums">
                                      +{formatIDR(it.designFee)}
                                    </span>
                                  </div>
                                )}
                                {(it.discount || 0) > 0 && (
                                  <div className="flex justify-between text-rose-600">
                                    <span>• Diskon Item</span>
                                    <span className="font-mono font-semibold tabular-nums">
                                      -{formatIDR(it.discount || 0)}
                                    </span>
                                  </div>
                                )}
                                {detail.hasExtraComponents && (
                                  <div className="flex justify-between text-[9.5px] font-black text-slate-950 pt-0.5 border-t border-dashed border-slate-300">
                                    <span className="font-black">
                                      Sub Total #{idx + 1} ({detail.subtotalFormulaNumbers})
                                    </span>
                                    <span className="font-mono font-black tabular-nums">
                                      {formatIDR(detail.itemSubtotal)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="border-r border-slate-900 py-1 px-1.5 text-right font-mono tabular-nums whitespace-nowrap align-top">
                              {formatItemDimension(it)}
                            </td>
                            <td className="border-r border-slate-900 py-1 px-1.5 text-right font-mono tabular-nums whitespace-nowrap align-top">
                              {formatIDR(it.unitPrice)}
                            </td>
                            <td className="py-1 px-1.5 text-right font-mono font-black text-slate-950 tabular-nums whitespace-nowrap align-top">
                              {formatIDR(detail.itemSubtotal)}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <>
                        <tr>
                          <td className="border-r border-slate-900 py-1 px-1.5">
                            <div className="font-bold text-slate-950">{order.jobTitle}</div>
                            <div className="text-[9.5px] text-slate-900 font-medium mt-0.5">
                              • {singleItemDetail.basePrintLabel}
                            </div>
                          </td>
                          <td className="border-r border-slate-900 py-1 px-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                            {dimensionText}
                          </td>
                          <td className="border-r border-slate-900 py-1 px-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                            {formatIDR(order.unitPrice)}
                          </td>
                          <td className="py-1 px-1.5 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                            {formatIDR(baseSubtotal)}
                          </td>
                        </tr>
                        {finishingLines.map((fl) => (
                          <tr key={fl.id}>
                            <td
                              className="border-r border-slate-900 py-0.5 px-1.5 text-slate-800 text-[9.5px]"
                              colSpan={3}
                            >
                              • {fl.label}
                            </td>
                            <td className="py-0.5 px-1.5 text-right font-mono font-semibold tabular-nums">
                              {fl.amount > 0 ? `+${formatIDR(fl.amount)}` : 'Rp 0'}
                            </td>
                          </tr>
                        ))}
                        {order.designFee > 0 && (
                          <tr>
                            <td
                              className="border-r border-slate-900 py-0.5 px-1.5 text-slate-800 text-[9.5px]"
                              colSpan={3}
                            >
                              • Biaya Jasa Desain & Setting Layout
                            </td>
                            <td className="py-0.5 px-1.5 text-right font-mono font-semibold tabular-nums">
                              +{formatIDR(order.designFee)}
                            </td>
                          </tr>
                        )}
                        {order.discount > 0 && (
                          <tr>
                            <td
                              className="border-r border-slate-900 py-0.5 px-1.5 text-slate-800 text-[9.5px]"
                              colSpan={3}
                            >
                              • Potongan Harga / Diskon
                            </td>
                            <td className="py-0.5 px-1.5 text-right font-mono tabular-nums text-rose-600">
                              -{formatIDR(order.discount)}
                            </td>
                          </tr>
                        )}
                        <tr className="bg-slate-50 border-t border-slate-900">
                          <td
                            className="border-r border-slate-900 py-1 px-1.5 text-[10.5px] font-black text-slate-950"
                            colSpan={3}
                          >
                            {singleItemDetail.subtotalLabelWithFormula}
                          </td>
                          <td className="py-1 px-1.5 text-right font-mono text-[10.5px] font-black text-slate-950 tabular-nums">
                            {formatIDR(singleItemDetail.itemSubtotal)}
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-12 gap-2.5 items-end border-t border-slate-900 pt-1.5">
                <div className="col-span-5 text-[9.5px] space-y-0.5">
                  {paymentDetail.bankName && (
                    <div>
                      <span className="font-bold text-slate-800">Keterangan Transfer: </span>
                      <span className="font-semibold text-slate-950">
                        {paymentDetail.fullLabel}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="font-bold text-slate-800">Catatan: </span>
                    <span>{cleanOrderNotes || 'Tidak ada catatan khusus.'}</span>
                  </div>
                  {storeSettings.bankAccountInfo && (
                    <div>
                      <span className="font-bold text-slate-800">Rekening Transfer: </span>
                      <span className="font-mono font-semibold">
                        {storeSettings.bankAccountInfo}
                      </span>
                    </div>
                  )}
                  {storeSettings.invoiceFooterNote && (
                    <div className="text-[8.5px] text-slate-500 pt-0.5 line-clamp-1">
                      {storeSettings.invoiceFooterNote}
                    </div>
                  )}
                </div>

                <div className="col-span-3 grid grid-cols-2 gap-1.5 text-center text-[9.5px]">
                  <div>
                    <div className="pb-4">Kasir / Admin,</div>
                    <div className="border-t border-slate-400 pt-0.5 font-semibold truncate">
                      ( {cashierDisplay} )
                    </div>
                  </div>
                  <div>
                    <div className="pb-4">Penerima,</div>
                    <div className="border-t border-slate-400 pt-0.5">
                      ( {order.customerName.slice(0, 18)} )
                    </div>
                  </div>
                </div>

                <div className="col-span-4 border border-slate-900 p-1.5 bg-slate-50 space-y-0.5 text-[10px]">
                  {roundingInfo.roundingAdjustment !== 0 && (
                    <>
                      <div className="flex justify-between text-[9px] text-slate-600">
                        <span>Subtotal Sebelum Pembulatan:</span>
                        <span className="font-mono tabular-nums">
                          {formatIDR(roundingInfo.rawTotal)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-700">
                        <span>Pembulatan Akhir Kasir:</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {roundingInfo.roundingAdjustment > 0
                            ? `+${formatIDR(roundingInfo.roundingAdjustment)}`
                            : `-${formatIDR(Math.abs(roundingInfo.roundingAdjustment))}`}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between font-bold">
                    <span>Total Tagihan:</span>
                    <span className="font-mono text-[11px] tabular-nums">
                      {formatIDR(order.totalAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-0.5">
                    <span>Telah Dibayar:</span>
                    <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                      {formatIDR(order.paidAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-t border-slate-900 pt-0.5 font-bold">
                    <span>Sisa Piutang:</span>
                    <span
                      className={`font-mono tabular-nums ${
                        remainingDebt > 0 ? 'text-rose-600' : 'text-slate-950'
                      }`}
                    >
                      {isLunas && (
                        <span className="text-xs font-black uppercase tracking-wider mr-1.5">
                          LUNAS
                        </span>
                      )}
                      {formatIDR(remainingDebt)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="flex items-start justify-between border-b-2 border-slate-900 pb-3 mb-4">
                  <div>
                    <div className="text-xs font-mono text-slate-600 uppercase">
                      WORKSHOP {storeSettings.storeName || 'CETAKPRO DIGITAL PRINTING'}
                    </div>
                    <h2 className="text-lg font-bold tracking-tight text-slate-950 mt-0.5">
                      SURAT PERINTAH KERJA (SPK PRODUKSI — A5 LANDSCAPE)
                    </h2>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-mono font-bold text-slate-950">
                      {order.invoiceNumber}
                    </div>
                    <div className="text-xs text-slate-700">
                      Masuk: <span className="font-mono">{formatDateID(order.orderDate)}</span> ·
                      Deadline:{' '}
                      <span className="font-mono font-bold">
                        {formatDateID(order.deadlineDate)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border border-slate-900 p-3.5 mb-4 text-xs">
                  <div>
                    <span className="text-slate-500">Pelanggan / Pemesan:</span>
                    <div className="text-sm font-bold text-slate-950 mt-0.5">
                      {order.customerName}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Divisi / Lini Mesin:</span>
                    <div className="text-sm font-bold text-slate-950 mt-0.5">{order.category}</div>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-slate-200">
                    <span className="text-slate-500">Nama File / Judul Pekerjaan:</span>
                    <div className="text-base font-bold text-slate-950 mt-0.5">
                      {order.jobTitle}
                    </div>
                  </div>
                </div>

                {isMultiItem ? (
                  <table className="w-full text-xs border-collapse border border-slate-900 mb-4">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-900 text-slate-900">
                        <th className="border-r border-slate-900 py-2 px-2.5 text-left font-bold">
                          No & Judul Pekerjaan Cetak
                        </th>
                        <th className="border-r border-slate-900 py-2 px-2.5 text-left font-bold">
                          Divisi & Bahan Media
                        </th>
                        <th className="border-r border-slate-900 py-2 px-2.5 text-center font-bold">
                          Ukuran & Qty
                        </th>
                        {!isAtkOrder && (
                          <th className="py-2 px-2.5 text-left font-bold">Instruksi Finishing</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {cartItems.map((it, idx) => (
                        <tr key={it.id || idx}>
                          <td className="border-r border-slate-900 py-2 px-2.5 font-bold text-slate-950">
                            #{idx + 1}. {it.jobTitle}
                          </td>
                          <td className="border-r border-slate-900 py-2 px-2.5">
                            <div className="font-bold text-slate-900">{it.materialName}</div>
                            <div className="text-[10px] text-slate-600">{it.category}</div>
                          </td>
                          <td className="border-r border-slate-900 py-2 px-2.5 text-center font-mono font-bold tabular-nums">
                            {formatItemDimension(it)}
                          </td>
                          {!isAtkOrder && (
                            <td className="py-2 px-2.5 text-[11px] text-slate-800">
                              {cleanFinishingDescText(it.finishingDesc, it.category) ||
                                'Potong pas standar'}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
                    <div className="border border-slate-900 p-3">
                      <div className="text-slate-500">Bahan / Media Cetak</div>
                      <div className="font-bold text-slate-950 text-sm mt-1">
                        {order.materialName}
                      </div>
                    </div>
                    <div className="border border-slate-900 p-3">
                      <div className="text-slate-500">Dimensi Ukuran & Qty</div>
                      <div className="font-mono font-bold text-slate-950 text-sm mt-1 tabular-nums">
                        {shortDimensionText}
                      </div>
                    </div>
                    <div className="border border-slate-900 p-3">
                      <div className="text-slate-500">Total Volume Bahan</div>
                      <div className="font-mono font-bold text-slate-950 text-sm mt-1 tabular-nums">
                        {formatNumberID(order.totalAreaOrQty)} {order.unitType}
                      </div>
                    </div>
                  </div>
                )}

                <div className="border border-slate-900 p-3.5 mb-4 text-xs space-y-1.5">
                  {!isAtkOrder && (
                    <div>
                      <span className="font-bold text-slate-800">Instruksi Finishing: </span>
                      <span className="text-slate-950">
                        {cleanFinishingDescText(order.finishingDesc, order.category) ||
                          'Potong pas standar (tanpa finishing tambahan)'}
                      </span>
                    </div>
                  )}
                  {renderA3SpkChecklist(false)}
                  <div>
                    <span className="font-bold text-slate-800">Catatan Operator / Mesin: </span>
                    <span className="text-slate-950">
                      {cleanOrderNotes || 'Periksa nozzle check & ukuran sebelum cetak produksi.'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-6 pt-3 border-t border-slate-900 text-center text-xs text-slate-700">
                <div>
                  <div className="pb-10">Bagian Setting / Desain</div>
                  <div className="border-t border-slate-400 pt-1">
                    ( ............................ )
                  </div>
                </div>
                <div>
                  <div className="pb-10">Operator Mesin Cetak</div>
                  <div className="border-t border-slate-400 pt-1">
                    ( ............................ )
                  </div>
                </div>
                <div>
                  <div className="pb-10">Quality Control & Finishing</div>
                  <div className="border-t border-slate-400 pt-1">
                    ( ............................ )
                  </div>
                </div>
              </div>
            </>
          )}
        </FitToPageBox>
      )}
    </>
  );
};
