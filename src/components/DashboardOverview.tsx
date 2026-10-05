import React, { useMemo } from 'react';
import {
  Printer,
  AlertTriangle,
  ArrowRight,
  Database,
  FileText,
  TrendingUp,
  Boxes,
  Wallet,
} from 'lucide-react';
import {
  PrintOrder,
  InventoryItem,
  CashTransaction,
  SupplierPayable,
  NavTab,
  formatIDR,
  formatDateID,
  formatNumberID,
} from '../types';

interface DashboardOverviewProps {
  orders: PrintOrder[];
  inventory: InventoryItem[];
  transactions: CashTransaction[];
  payables: SupplierPayable[];
  isSeeding: boolean;
  onSeedSampleData: () => Promise<void>;
  onNavigate: (tab: NavTab) => void;
  onOpenPrintModal: (order: PrintOrder, mode: 'invoice' | 'spk') => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  orders,
  inventory,
  transactions,
  payables,
  isSeeding,
  onSeedSampleData,
  onNavigate,
  onOpenPrintModal,
}) => {
  const kpi = useMemo(() => {
    const activeOrders = orders.filter((o) => o.productionStatus !== 'Dibatalkan');
    const totalRevenue = activeOrders.reduce((s, o) => s + o.totalAmount, 0);
    const totalOrderCogs = activeOrders.reduce((s, o) => s + o.totalCogs, 0);

    let extraRev = 0;
    let extraSubconCogs = 0;
    let totalOpex = 0;
    let cashIn = 0;
    let cashOut = 0;

    transactions.forEach((tx) => {
      if (tx.type === 'Pemasukan') {
        cashIn += tx.amount;
        if (
          !tx.relatedId &&
          (tx.pnlGroup === 'Pendapatan Cetak' ||
            tx.pnlGroup === 'Pendapatan Jasa & Desain')
        ) {
          extraRev += tx.amount;
        }
      } else {
        cashOut += tx.amount;
        if (tx.pnlGroup === 'HPP Subkon & Produksi') {
          extraSubconCogs += tx.amount;
        } else if (
          tx.pnlGroup === 'Beban Gaji & Operator' ||
          tx.pnlGroup === 'Beban Listrik & Utilitas' ||
          tx.pnlGroup === 'Beban Sewa & Tempat' ||
          tx.pnlGroup === 'Beban Servis & Mesin' ||
          tx.pnlGroup === 'Beban Operasional Lainnya'
        ) {
          totalOpex += tx.amount;
        }
      }
    });

    const netRevenue = totalRevenue + extraRev;
    const totalCogs = totalOrderCogs + extraSubconCogs;
    const grossProfit = netRevenue - totalCogs;
    const netProfit = grossProfit - totalOpex;
    const netMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

    const receivables = activeOrders.reduce(
      (s, o) => s + Math.max(0, o.totalAmount - o.paidAmount),
      0
    );
    const supplierDebt = payables
      .filter((p) => p.status !== 'Lunas')
      .reduce((s, p) => s + Math.max(0, p.totalAmount - p.paidAmount), 0);

    const lowStockItems = inventory.filter((i) => i.stockQty <= i.minStockQty);
    const stockValuation = inventory.reduce(
      (s, i) => s + i.stockQty * i.costPerUnit,
      0
    );

    const inProductionOrders = activeOrders.filter(
      (o) => o.productionStatus !== 'Selesai'
    );

    return {
      netRevenue,
      totalCogs,
      grossProfit,
      totalOpex,
      netProfit,
      netMargin,
      netCash: cashIn - cashOut,
      receivables,
      supplierDebt,
      lowStockItems,
      stockValuation,
      inProductionOrders,
      activeOrderCount: activeOrders.length,
    };
  }, [orders, inventory, transactions, payables]);

  const isEmptyWorkspace =
    orders.length === 0 && inventory.length === 0 && transactions.length === 0;

  return (
    <div className="space-y-6">
      {/* Empty State / Quick Onboarding Banner */}
      {isEmptyWorkspace && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <h2 className="text-base font-bold text-slate-900">
              Mulai Pembukuan Usaha Digital Printing Anda
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Database Anda masih kosong. Anda dapat langsung memuat contoh data usaha percetakan lengkap (Stok Bahan Flexi/Vinyl/Art Paper/Tinta, Nota SPK Cetak, Jurnal Kas, Piutang Pelanggan, Hutang Supplier, & Laporan Laba Rugi) untuk menguji seluruh fitur secara instan.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onSeedSampleData}
              disabled={isSeeding}
              className="px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
            >
              <Database className="w-4 h-4" />
              {isSeeding
                ? 'Memuat Data Percetakan...'
                : 'Muat Data Contoh Percetakan Lengkap'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('ORDERS')}
              className="px-4 py-2.5 text-xs font-medium border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-lg transition-colors whitespace-nowrap"
            >
              Input SPK Baru Manual
            </button>
          </div>
        </div>
      )}

      {/* Primary Financial & Operational KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Total Omzet Pesanan Cetak</span>
            <TrendingUp className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-mono font-bold text-slate-900 mt-1.5 tabular-nums">
            {formatIDR(kpi.netRevenue)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {kpi.activeOrderCount} SPK Aktif · HPP: {formatIDR(kpi.totalCogs)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Laba Bersih Operasional</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <div
            className={`text-xl font-mono font-bold mt-1.5 tabular-nums ${
              kpi.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
            }`}
          >
            {formatIDR(kpi.netProfit)}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            Margin Bersih: {formatNumberID(kpi.netMargin, 1)}% · Beban: {formatIDR(kpi.totalOpex)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Saldo Kas & Tagihan Piutang</span>
            <Wallet className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-mono font-bold text-slate-900 mt-1.5 tabular-nums">
            {formatIDR(kpi.netCash)}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            Piutang: <span className="text-amber-700 font-medium">{formatIDR(kpi.receivables)}</span> · Hutang:{' '}
            <span className="text-rose-600 font-medium">{formatIDR(kpi.supplierDebt)}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Nilai Persediaan Bahan & Tinta</span>
            <Boxes className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-mono font-bold text-slate-900 mt-1.5 tabular-nums">
            {formatIDR(kpi.stockValuation)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {inventory.length} SKU Bahan ·{' '}
            <span
              className={
                kpi.lowStockItems.length > 0
                  ? 'text-rose-600 font-semibold'
                  : 'text-emerald-700'
              }
            >
              {kpi.lowStockItems.length} Stok Kritis
            </span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Operational Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 8 Cols: Antrean Produksi SPK & Pesanan Terbaru */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Antrean Produksi Workshop (SPK Berjalan)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Daftar pesanan cetak yang sedang dalam antrean desain, mesin cetak, finishing, atau siap diambil.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('ORDERS')}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900 inline-flex items-center gap-1 whitespace-nowrap"
            >
              Buka Kasir & SPK
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600">
                  <th className="py-2.5 px-4 text-left font-semibold">No. SPK & Deadline</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Pelanggan & Cetakan</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Tahap Produksi</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Tagihan & Status</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Cetak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      Belum ada antrean SPK pesanan cetak.
                    </td>
                  </tr>
                ) : (
                  orders.slice(0, 6).map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono font-semibold text-slate-900">
                          {order.invoiceNumber}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          Deadline: {formatDateID(order.deadlineDate)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {order.customerName}
                        </div>
                        <div className="text-slate-600 truncate max-w-xs">
                          {order.jobTitle}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`font-medium ${
                            order.productionStatus === 'Selesai'
                              ? 'text-emerald-700'
                              : order.productionStatus === 'Siap Ambil'
                              ? 'text-slate-900 font-semibold'
                              : 'text-amber-700'
                          }`}
                        >
                          {order.productionStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="font-semibold text-slate-900">
                          {formatIDR(order.totalAmount)}
                        </div>
                        <div
                          className={`text-[11px] font-sans ${
                            order.paymentStatus === 'Lunas'
                              ? 'text-emerald-700'
                              : 'text-rose-600 font-medium'
                          }`}
                        >
                          {order.paymentStatus}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => onOpenPrintModal(order, 'invoice')}
                            className="px-2 py-1 text-[11px] border border-slate-200 hover:bg-slate-100 rounded text-slate-700"
                          >
                            Nota
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenPrintModal(order, 'spk')}
                            className="px-2 py-1 text-[11px] border border-slate-200 hover:bg-slate-100 rounded text-slate-700 inline-flex items-center gap-1"
                          >
                            <Printer className="w-3 h-3" />
                            SPK
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 4 Cols: Peringatan Stok Kritis & Ikhtisar Laba Rugi Cepat */}
        <div className="lg:col-span-4 space-y-6">
          {/* Peringatan Stok Bahan Menipis */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Peringatan Stok Bahan & Tinta
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('INVENTORY')}
                className="text-xs font-semibold text-slate-700 hover:text-slate-900"
              >
                Kelola Stok
              </button>
            </div>
            <div className="divide-y divide-slate-200 text-xs">
              {kpi.lowStockItems.length === 0 ? (
                <div className="p-5 text-slate-500 text-center">
                  Seluruh stok bahan cetak & tinta dalam batas aman.
                </div>
              ) : (
                kpi.lowStockItems.map((item) => (
                  <div
                    key={item.id}
                    className="px-5 py-3 flex items-center justify-between"
                  >
                    <div className="pr-3">
                      <div className="font-semibold text-slate-900">{item.name}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Supplier: {item.supplierName}
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="font-bold text-rose-600">
                        Sisa: {formatNumberID(item.stockQty)} {item.unit}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Min: {formatNumberID(item.minStockQty)} {item.unit}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Ringkasan Laba Rugi Singkat */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-sm font-bold text-slate-900">
                Struktur Laba Rugi Cepat
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('PNL')}
                className="text-xs font-semibold text-slate-700 hover:text-slate-900 inline-flex items-center gap-1"
              >
                Detail Laba Rugi
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-600">Pendapatan Kotor (Omzet):</span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {formatIDR(kpi.netRevenue)}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-600">HPP Bahan & Produksi:</span>
              <span className="font-mono text-rose-600 tabular-nums">
                ({formatIDR(kpi.totalCogs)})
              </span>
            </div>
            <div className="flex justify-between py-1 border-t border-slate-100 font-semibold">
              <span className="text-slate-800">Laba Kotor (Gross Profit):</span>
              <span className="font-mono text-emerald-700 tabular-nums">
                {formatIDR(kpi.grossProfit)}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-600">Beban Operasional (OPEX):</span>
              <span className="font-mono text-rose-600 tabular-nums">
                ({formatIDR(kpi.totalOpex)})
              </span>
            </div>
            <div className="flex justify-between py-2 border-t border-slate-200 font-bold text-sm">
              <span className="text-slate-900">Laba Bersih Usaha:</span>
              <span
                className={`font-mono tabular-nums ${
                  kpi.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                }`}
              >
                {formatIDR(kpi.netProfit)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
