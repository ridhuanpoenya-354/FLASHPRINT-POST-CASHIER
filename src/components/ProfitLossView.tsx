import React, { useState, useMemo } from 'react';
import { Printer, Download, Calendar } from 'lucide-react';
import {
  PrintOrder,
  CashTransaction,
  OrderCategory,
  formatIDR,
  formatNumberID,
  todayISO,
} from '../types';

interface ProfitLossViewProps {
  orders: PrintOrder[];
  transactions: CashTransaction[];
}

export const ProfitLossView: React.FC<ProfitLossViewProps> = ({
  orders,
  transactions,
}) => {
  const [periodPreset, setPeriodPreset] = useState<'ALL' | 'THIS_MONTH' | 'CUSTOM'>('ALL');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [endDate, setEndDate] = useState<string>(todayISO());

  const inRange = (dateStr: string) => {
    if (periodPreset === 'ALL') return true;
    if (periodPreset === 'THIS_MONTH') {
      const ym = todayISO().slice(0, 7);
      return dateStr.startsWith(ym);
    }
    return dateStr >= startDate && dateStr <= endDate;
  };

  const report = useMemo(() => {
    const validOrders = orders.filter(
      (o) => o.productionStatus !== 'Dibatalkan' && inRange(o.orderDate)
    );
    const validTxs = transactions.filter((t) => inRange(t.txDate));

    // 1. Revenue Breakdown from Orders + Direct Non-Order Revenue Txs
    let revBannerOutdoor = 0;
    let revIndoorSticker = 0;
    let revA3Document = 0;
    let revMerchDisplay = 0;
    let revOffsetPack = 0;
    let revAtkRetail = 0;
    let revJasaItService = 0;
    let revDesignFinishing = 0;
    let totalDiscounts = 0;
    let orderCogs = 0;

    const categoryStats: Record<
      OrderCategory,
      { count: number; revenue: number; cogs: number }
    > = {
      'Banner & Outdoor': { count: 0, revenue: 0, cogs: 0 },
      'Indoor & Sticker': { count: 0, revenue: 0, cogs: 0 },
      'Print A3+ & Dokumen': { count: 0, revenue: 0, cogs: 0 },
      'Merchandise & Display': { count: 0, revenue: 0, cogs: 0 },
      'Offset & Kemasan': { count: 0, revenue: 0, cogs: 0 },
      'Fotokopi, Jilid & Laminating': { count: 0, revenue: 0, cogs: 0 },
      'Penjualan ATK': { count: 0, revenue: 0, cogs: 0 },
      'Jasa Desain & Servis IT': { count: 0, revenue: 0, cogs: 0 },
    };

    validOrders.forEach((o) => {
      const basePrintRev = o.totalAreaOrQty * o.unitPrice;
      if (o.category === 'Banner & Outdoor') revBannerOutdoor += basePrintRev;
      else if (o.category === 'Indoor & Sticker') revIndoorSticker += basePrintRev;
      else if (o.category === 'Print A3+ & Dokumen' || o.category === 'Fotokopi, Jilid & Laminating') revA3Document += basePrintRev;
      else if (o.category === 'Merchandise & Display') revMerchDisplay += basePrintRev;
      else if (o.category === 'Penjualan ATK') revAtkRetail += basePrintRev;
      else if (o.category === 'Jasa Desain & Servis IT') revJasaItService += basePrintRev;
      else revOffsetPack += basePrintRev;

      revDesignFinishing += (o.designFee || 0) + (o.finishingFee || 0);
      totalDiscounts += o.discount || 0;
      orderCogs += o.totalCogs || 0;

      if (categoryStats[o.category]) {
        categoryStats[o.category].count += 1;
        categoryStats[o.category].revenue += o.totalAmount;
        categoryStats[o.category].cogs += o.totalCogs;
      }
    });

    // Direct cash revenue not linked to an order
    let extraServiceRev = 0;
    let extraMaterialPurchaseCogs = 0;
    let extraSubconCogs = 0;
    let opexSalary = 0;
    let opexElectricity = 0;
    let opexRent = 0;
    let opexMaintenance = 0;
    let opexOther = 0;

    validTxs.forEach((tx) => {
      if (tx.type === 'Pemasukan' && !tx.relatedId) {
        if (
          tx.pnlGroup === 'Pendapatan Cetak' ||
          tx.pnlGroup === 'Pendapatan Jasa & Desain'
        ) {
          extraServiceRev += tx.amount;
        }
      } else if (tx.type === 'Pengeluaran') {
        if (tx.pnlGroup === 'HPP Bahan & Tinta') {
          extraMaterialPurchaseCogs += tx.amount;
        } else if (tx.pnlGroup === 'HPP Subkon & Produksi') {
          extraSubconCogs += tx.amount;
        } else if (tx.pnlGroup === 'Beban Gaji & Operator') {
          opexSalary += tx.amount;
        } else if (tx.pnlGroup === 'Beban Listrik & Utilitas') {
          opexElectricity += tx.amount;
        } else if (tx.pnlGroup === 'Beban Sewa & Tempat') {
          opexRent += tx.amount;
        } else if (tx.pnlGroup === 'Beban Servis & Mesin') {
          opexMaintenance += tx.amount;
        } else if (tx.pnlGroup === 'Beban Operasional Lainnya') {
          opexOther += tx.amount;
        }
      }
    });

    const grossRevenue =
      revBannerOutdoor +
      revIndoorSticker +
      revA3Document +
      revMerchDisplay +
      revOffsetPack +
      revAtkRetail +
      revJasaItService +
      revDesignFinishing +
      extraServiceRev;

    const netRevenue = Math.max(0, grossRevenue - totalDiscounts);
    const totalCogs = orderCogs + extraSubconCogs;
    const grossProfit = netRevenue - totalCogs;
    const grossMarginPct = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

    const totalOpex =
      opexSalary + opexElectricity + opexRent + opexMaintenance + opexOther;
    const netProfit = grossProfit - totalOpex;
    const netMarginPct = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

    return {
      orderCount: validOrders.length,
      revBannerOutdoor,
      revIndoorSticker,
      revA3Document,
      revMerchDisplay,
      revOffsetPack,
      revAtkRetail,
      revJasaItService,
      revDesignFinishing,
      extraServiceRev,
      totalDiscounts,
      netRevenue,
      orderCogs,
      extraMaterialPurchaseCogs,
      extraSubconCogs,
      totalCogs,
      grossProfit,
      grossMarginPct,
      opexSalary,
      opexElectricity,
      opexRent,
      opexMaintenance,
      opexOther,
      totalOpex,
      netProfit,
      netMarginPct,
      categoryStats,
    };
  }, [orders, transactions, periodPreset, startDate, endDate]);

  const handleExportCSV = () => {
    const rows = [
      ['POS LAPORAN LABA RUGI USAHA DIGITAL PRINTING', 'NOMINAL (IDR)'],
      ['Pendapatan Cetak Banner & Outdoor', String(report.revBannerOutdoor)],
      ['Pendapatan Cetak Indoor & Sticker', String(report.revIndoorSticker)],
      ['Pendapatan Print A3+ & Dokumen', String(report.revA3Document)],
      ['Pendapatan Merchandise & Display', String(report.revMerchDisplay)],
      ['Pendapatan Offset & Kemasan', String(report.revOffsetPack)],
      ['Pendapatan Jasa Desain & Finishing', String(report.revDesignFinishing + report.extraServiceRev)],
      ['Potongan Harga / Diskon Penjualan', String(-report.totalDiscounts)],
      ['TOTAL PENDAPATAN BERSIH (OMZET)', String(report.netRevenue)],
      ['HPP Pemakaian Bahan Baku & Tinta Produksi (SPK)', String(report.orderCogs)],
      ['HPP Subkon & Biaya Produksi Langsung', String(report.extraSubconCogs)],
      ['TOTAL HARGA POKOK PRODUKSI (HPP)', String(report.totalCogs)],
      ['LABA KOTOR (GROSS PROFIT)', String(report.grossProfit)],
      ['Beban Gaji, Upah & Komisi Operator', String(report.opexSalary)],
      ['Beban Listrik 3-Phase, Air & Internet', String(report.opexElectricity)],
      ['Beban Sewa Ruko / Workshop', String(report.opexRent)],
      ['Beban Pemeliharaan & Servis Mesin Cetak', String(report.opexMaintenance)],
      ['Beban Operasional & Administrasi Lainnya', String(report.opexOther)],
      ['TOTAL BEBAN OPERASIONAL', String(report.totalOpex)],
      ['LABA BERSIH USAHA (NET PROFIT)', String(report.netProfit)],
    ];

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Laporan_Laba_Rugi_DigitalPrinting_${todayISO()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Bar */}
      <div className="no-print flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Laporan Laba Rugi (Income Statement) & Margin Produksi
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Perhitungan akuntansi pendapatan cetak, HPP pemakaian bahan/tinta, beban operasional workshop, dan laba bersih.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setPeriodPreset('ALL')}
              className={`px-3 py-1.5 font-medium rounded-md transition-colors whitespace-nowrap ${
                periodPreset === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua Periode
            </button>
            <button
              type="button"
              onClick={() => setPeriodPreset('THIS_MONTH')}
              className={`px-3 py-1.5 font-medium rounded-md transition-colors whitespace-nowrap ${
                periodPreset === 'THIS_MONTH'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Bulan Ini
            </button>
            <button
              type="button"
              onClick={() => setPeriodPreset('CUSTOM')}
              className={`px-3 py-1.5 font-medium rounded-md transition-colors flex items-center gap-1 whitespace-nowrap ${
                periodPreset === 'CUSTOM'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Rentang Tanggal
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2 text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Ekspor CSV
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            Cetak Laporan
          </button>
        </div>
      </div>

      {periodPreset === 'CUSTOM' && (
        <div className="no-print flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-3.5 text-xs">
          <span className="font-medium text-slate-700">Filter Periode Tanggal:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-md font-mono"
          />
          <span className="text-slate-500">s/d</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-md font-mono"
          />
        </div>
      )}

      {/* KPI Ringkasan Laba Rugi */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Pendapatan Bersih (Omzet)</div>
          <div className="text-xl font-mono font-bold text-slate-900 mt-1 tabular-nums">
            {formatIDR(report.netRevenue)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Dari {report.orderCount} pesanan cetak (SPK)
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Total HPP Produksi (Bahan & Tinta)</div>
          <div className="text-xl font-mono font-bold text-slate-800 mt-1 tabular-nums">
            {formatIDR(report.totalCogs)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Belanja restock bahan: {formatIDR(report.extraMaterialPurchaseCogs)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Laba Kotor (Gross Profit)</div>
          <div className="text-xl font-mono font-bold text-emerald-700 mt-1 tabular-nums">
            {formatIDR(report.grossProfit)}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            Margin Kotor: {formatNumberID(report.grossMarginPct, 1)}%
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Laba Bersih Operasional (Net Profit)</div>
          <div
            className={`text-xl font-mono font-bold mt-1 tabular-nums ${
              report.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
            }`}
          >
            {formatIDR(report.netProfit)}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            Net Profit Margin: {formatNumberID(report.netMarginPct, 1)}%
          </div>
        </div>
      </div>

      {/* Lembar Laporan Laba Rugi Standar Akuntansi */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b-2 border-slate-900 pb-4 mb-6">
          <div>
            <h3 className="text-base font-bold tracking-tight text-slate-900">
              LAPORAN LABA RUGI (INCOME STATEMENT) — USAHA DIGITAL PRINTING
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Periode Laporan:{' '}
              {periodPreset === 'ALL'
                ? 'Seluruh Periode Pembukuan'
                : periodPreset === 'THIS_MONTH'
                ? `Bulan Berjalan (${todayISO().slice(0, 7)})`
                : `${startDate} s/d ${endDate}`}
            </p>
          </div>
          <div className="text-xs font-mono text-slate-500 mt-2 sm:mt-0">
            Mata Uang: Rupiah (IDR)
          </div>
        </div>

        <div className="space-y-6 text-xs">
          {/* I. PENDAPATAN USAHA */}
          <div>
            <div className="font-bold text-slate-900 border-b border-slate-200 pb-2 mb-2">
              I. PENDAPATAN USAHA (REVENUE)
            </div>
            <div className="divide-y divide-slate-100">
              <div className="flex justify-between py-2">
                <span className="text-slate-700 pl-3">
                  4101 · Pendapatan Cetak Banner & Outdoor (Flexi / Korcin / Baliho)
                </span>
                <span className="font-mono tabular-nums text-slate-900">
                  {formatIDR(report.revBannerOutdoor)}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-700 pl-3">
                  4102 · Pendapatan Cetak Indoor & Sticker (Vinyl / Albatros / Luster)
                </span>
                <span className="font-mono tabular-nums text-slate-900">
                  {formatIDR(report.revIndoorSticker)}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-700 pl-3">
                  4103 · Pendapatan Print A3+ & Dokumen (Art Carton / Brosur / Sticker Chromo)
                </span>
                <span className="font-mono tabular-nums text-slate-900">
                  {formatIDR(report.revA3Document)}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-700 pl-3">
                  4104 · Pendapatan Merchandise, Display & Offset Kemasan
                </span>
                <span className="font-mono tabular-nums text-slate-900">
                  {formatIDR(report.revMerchDisplay + report.revOffsetPack)}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-700 pl-3">
                  4105 · Pendapatan Jasa Setting Desain & Finishing (Mata Ayam / Laminasi / Cutting)
                </span>
                <span className="font-mono tabular-nums text-slate-900">
                  {formatIDR(report.revDesignFinishing + report.extraServiceRev)}
                </span>
              </div>
              {report.totalDiscounts > 0 && (
                <div className="flex justify-between py-2 text-rose-600">
                  <span className="pl-3">
                    4109 · Potongan Harga / Diskon Penjualan Pelanggan
                  </span>
                  <span className="font-mono tabular-nums">
                    ({formatIDR(report.totalDiscounts)})
                  </span>
                </div>
              )}
            </div>
            <div className="flex justify-between py-2.5 px-3 bg-slate-50 border-t border-slate-200 font-bold text-slate-900 mt-1">
              <span>TOTAL PENDAPATAN BERSIH (NET REVENUE)</span>
              <span className="font-mono tabular-nums">{formatIDR(report.netRevenue)}</span>
            </div>
          </div>

          {/* II. HARGA POKOK PRODUKSI */}
          <div>
            <div className="font-bold text-slate-900 border-b border-slate-200 pb-2 mb-2">
              II. HARGA POKOK PRODUKSI (HPP / COST OF GOODS SOLD)
            </div>
            <div className="divide-y divide-slate-100">
              <div className="flex justify-between py-2">
                <span className="text-slate-700 pl-3">
                  5101 · HPP Pemakaian Bahan Baku, Kertas, Vinyl & Tinta Produksi (Dari SPK)
                </span>
                <span className="font-mono tabular-nums text-slate-900">
                  {formatIDR(report.orderCogs)}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-700 pl-3">
                  5102 · Biaya Subkon Cetak / Makloon & Produksi Langsung Lainnya
                </span>
                <span className="font-mono tabular-nums text-slate-900">
                  {formatIDR(report.extraSubconCogs)}
                </span>
              </div>
            </div>
            <div className="flex justify-between py-2.5 px-3 bg-slate-50 border-t border-slate-200 font-bold text-slate-900 mt-1">
              <span>TOTAL HARGA POKOK PRODUKSI (HPP)</span>
              <span className="font-mono tabular-nums">({formatIDR(report.totalCogs)})</span>
            </div>
          </div>

          {/* LABA KOTOR */}
          <div className="flex justify-between items-center py-3 px-4 bg-slate-900 text-white rounded-md">
            <div>
              <div className="font-bold text-sm">LABA KOTOR PRODUKSI (GROSS PROFIT)</div>
              <div className="text-[11px] text-slate-300">
                Pendapatan Bersih dikurangi Harga Pokok Produksi (Margin Kotor:{' '}
                {formatNumberID(report.grossMarginPct, 1)}%)
              </div>
            </div>
            <div className="font-mono text-base font-bold tabular-nums">
              {formatIDR(report.grossProfit)}
            </div>
          </div>

          {/* III. BEBAN OPERASIONAL */}
          <div>
            <div className="font-bold text-slate-900 border-b border-slate-200 pb-2 mb-2">
              III. BEBAN OPERASIONAL WORKSHOP & ADMINISTRASI (OPEX)
            </div>
            <div className="divide-y divide-slate-100">
              <div className="flex justify-between py-2">
                <span className="text-slate-700 pl-3">
                  6101 · Beban Gaji, Upah & Lembur Operator Mesin / Desainer Setting
                </span>
                <span className="font-mono tabular-nums text-slate-900">
                  {formatIDR(report.opexSalary)}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-700 pl-3">
                  6102 · Beban Listrik Workshop 3-Phase, Air & Internet
                </span>
                <span className="font-mono tabular-nums text-slate-900">
                  {formatIDR(report.opexElectricity)}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-700 pl-3">
                  6103 · Beban Sewa Tempat / Ruko Workshop
                </span>
                <span className="font-mono tabular-nums text-slate-900">
                  {formatIDR(report.opexRent)}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-700 pl-3">
                  6104 · Beban Pemeliharaan, Sparepart & Servis Printhead Mesin
                </span>
                <span className="font-mono tabular-nums text-slate-900">
                  {formatIDR(report.opexMaintenance)}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-700 pl-3">
                  6105 · Beban Operasional, ATK, Kemasan & Administrasi Lainnya
                </span>
                <span className="font-mono tabular-nums text-slate-900">
                  {formatIDR(report.opexOther)}
                </span>
              </div>
            </div>
            <div className="flex justify-between py-2.5 px-3 bg-slate-50 border-t border-slate-200 font-bold text-slate-900 mt-1">
              <span>TOTAL BEBAN OPERASIONAL (OPEX)</span>
              <span className="font-mono tabular-nums">({formatIDR(report.totalOpex)})</span>
            </div>
          </div>

          {/* LABA BERSIH */}
          <div
            className={`flex justify-between items-center py-4 px-4 rounded-md border ${
              report.netProfit >= 0
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                : 'bg-rose-50/70 border-rose-200 text-rose-950'
            }`}
          >
            <div>
              <div className="font-bold text-sm">
                LABA BERSIH USAHA SEBELUM PAJAK (NET PROFIT / LOSS)
              </div>
              <div className="text-xs opacity-80 mt-0.5">
                Rasio Laba Bersih (Net Profit Margin): {formatNumberID(report.netMarginPct, 1)}%
              </div>
            </div>
            <div className="font-mono text-lg font-bold tabular-nums">
              {formatIDR(report.netProfit)}
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown Margin per Lini Mesin / Kategori Cetak */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900">
            Analitik Kontribusi Laba Kotor per Lini Layanan Cetak
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Perbandingan performa omzet, HPP bahan, dan laba kotor untuk setiap divisi mesin cetak.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600">
                <th className="py-3 px-4 text-left font-semibold">Lini Layanan / Kategori Mesin</th>
                <th className="py-3 px-4 text-right font-semibold">Jumlah SPK</th>
                <th className="py-3 px-4 text-right font-semibold">Total Omzet</th>
                <th className="py-3 px-4 text-right font-semibold">Total HPP Bahan</th>
                <th className="py-3 px-4 text-right font-semibold">Laba Kotor</th>
                <th className="py-3 px-4 text-right font-semibold">Margin (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {(Object.keys(report.categoryStats) as OrderCategory[]).map((cat) => {
                const st = report.categoryStats[cat];
                const gp = st.revenue - st.cogs;
                const margin = st.revenue > 0 ? (gp / st.revenue) * 100 : 0;
                return (
                  <tr key={cat} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-semibold text-slate-900">{cat}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {st.count} SPK
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatIDR(st.revenue)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600 tabular-nums">
                      {formatIDR(st.cogs)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                      {formatIDR(gp)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatNumberID(margin, 1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
