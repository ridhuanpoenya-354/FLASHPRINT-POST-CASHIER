import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Trash2,
  CheckCircle2,
  Receipt,
  Building2,
} from 'lucide-react';
import {
  CashTransaction,
  PrintOrder,
  SupplierPayable,
  TransactionType,
  PnlGroup,
  CashPaymentMethod,
  BANK_TRANSFER_OPTIONS,
  extractOrderPaymentDetail,
  formatIDR,
  formatDateID,
  todayISO,
} from '../types';

interface CashAndDebtsViewProps {
  transactions: CashTransaction[];
  orders: PrintOrder[];
  payables: SupplierPayable[];
  onCreateTransaction: (
    txData: Omit<CashTransaction, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onDeleteTransaction: (txId: string) => Promise<void>;
  onSettleOrderPayment: (
    order: PrintOrder,
    payAmount: number,
    method: CashPaymentMethod,
    bankTransferLabel?: string
  ) => Promise<void>;
  onCreatePayable: (
    payData: Omit<SupplierPayable, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onPaySupplierPayable: (
    payable: SupplierPayable,
    payAmount: number,
    method: CashPaymentMethod
  ) => Promise<void>;
  onDeletePayable: (payableId: string) => Promise<void>;
}

const PNL_GROUPS_IN: PnlGroup[] = [
  'Pendapatan Cetak',
  'Pendapatan Jasa & Desain',
  'Non-Laba Rugi / Modal',
];

const PNL_GROUPS_OUT: PnlGroup[] = [
  'Beban Listrik & Utilitas',
  'Beban Gaji & Operator',
  'Beban Sewa & Tempat',
  'Beban Servis & Mesin',
  'HPP Bahan & Tinta',
  'HPP Subkon & Produksi',
  'Beban Operasional Lainnya',
  'Non-Laba Rugi / Modal',
];

export const CashAndDebtsView: React.FC<CashAndDebtsViewProps> = ({
  transactions,
  orders,
  payables,
  onCreateTransaction,
  onDeleteTransaction,
  onSettleOrderPayment,
  onCreatePayable,
  onPaySupplierPayable,
  onDeletePayable,
}) => {
  const [activeTab, setActiveTab] = useState<'CASH' | 'RECEIVABLES' | 'PAYABLES'>('CASH');
  const [searchQuery, setSearchQuery] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<'ALL' | 'Pemasukan' | 'Pengeluaran'>('ALL');

  // Modals
  const [showAddTxModal, setShowAddTxModal] = useState(false);
  const [showAddPayableModal, setShowAddPayableModal] = useState(false);
  const [settlingOrder, setSettlingOrder] = useState<PrintOrder | null>(null);
  const [payingPayable, setPayingPayable] = useState<SupplierPayable | null>(null);
  const [payAmountInput, setPayAmountInput] = useState<number>(0);
  const [payMethodInput, setPayMethodInput] = useState<CashPaymentMethod>('Transfer Bank');
  const [settleBankName, setSettleBankName] = useState<string>('Bank BCA');
  const [settleBankCustom, setSettleBankCustom] = useState<string>('');
  const [settleBankNote, setSettleBankNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add Tx Form State
  const [txDate, setTxDate] = useState(todayISO());
  const [txType, setTxType] = useState<TransactionType>('Pengeluaran');
  const [pnlGroup, setPnlGroup] = useState<PnlGroup>('Beban Listrik & Utilitas');
  const [referenceNo, setReferenceNo] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number>(250000);
  const [paymentMethod, setPaymentMethod] = useState<CashPaymentMethod>('Tunai');
  const [txBankName, setTxBankName] = useState<string>('Bank BCA');
  const [txBankCustom, setTxBankCustom] = useState<string>('');
  const [txBankNote, setTxBankNote] = useState<string>('');

  // Add Payable Form State
  const [supName, setSupName] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supInvoice, setSupInvoice] = useState('');
  const [supTxDate, setSupTxDate] = useState(todayISO());
  const [supDueDate, setSupDueDate] = useState(todayISO());
  const [supItemSummary, setSupItemSummary] = useState('');
  const [supTotalAmount, setSupTotalAmount] = useState<number>(1500000);
  const [supPaidAmount, setSupPaidAmount] = useState<number>(0);

  // Summary metrics
  const summary = useMemo(() => {
    let cashIn = 0;
    let cashOut = 0;
    let balTunai = 0;
    let balBank = 0;
    let balQris = 0;

    transactions.forEach((tx) => {
      if (tx.type === 'Pemasukan') {
        cashIn += tx.amount;
        if (tx.paymentMethod === 'Tunai') balTunai += tx.amount;
        else if (tx.paymentMethod === 'Transfer Bank') balBank += tx.amount;
        else balQris += tx.amount;
      } else {
        cashOut += tx.amount;
        if (tx.paymentMethod === 'Tunai') balTunai -= tx.amount;
        else if (tx.paymentMethod === 'Transfer Bank') balBank -= tx.amount;
        else balQris -= tx.amount;
      }
    });

    const unpaidOrders = orders.filter(
      (o) =>
        o.productionStatus !== 'Dibatalkan' &&
        o.totalAmount - o.paidAmount > 0
    );
    const totalReceivables = unpaidOrders.reduce(
      (acc, o) => acc + Math.max(0, o.totalAmount - o.paidAmount),
      0
    );

    const unpaidPayables = payables.filter(
      (p) => p.status !== 'Lunas' && p.totalAmount - p.paidAmount > 0
    );
    const totalPayables = unpaidPayables.reduce(
      (acc, p) => acc + Math.max(0, p.totalAmount - p.paidAmount),
      0
    );

    return {
      cashIn,
      cashOut,
      netCash: cashIn - cashOut,
      balTunai,
      balBank,
      balQris,
      unpaidOrders,
      totalReceivables,
      unpaidPayables,
      totalPayables,
    };
  }, [transactions, orders, payables]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (txTypeFilter !== 'ALL' && t.type !== txTypeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          t.description.toLowerCase().includes(q) ||
          t.referenceNo.toLowerCase().includes(q) ||
          t.pnlGroup.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [transactions, txTypeFilter, searchQuery]);

  const handleTxTypeSelect = (newType: TransactionType) => {
    setTxType(newType);
    if (newType === 'Pemasukan') {
      setPnlGroup('Pendapatan Cetak');
    } else {
      setPnlGroup('Beban Listrik & Utilitas');
    }
  };

  const handleCreateTxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || amount <= 0) return;
    setIsSubmitting(true);
    try {
      const autoRef =
        referenceNo.trim() ||
        `KAS-${txType === 'Pemasukan' ? 'IN' : 'OUT'}-${String(
          transactions.length + 1
        ).padStart(4, '0')}`;
      const chosenBank =
        txBankName === 'MANUAL_BANK'
          ? txBankCustom.trim() || 'Bank Transfer'
          : txBankName;
      const bankSuffix =
        paymentMethod === 'Transfer Bank'
          ? ` [Transfer ${chosenBank}${txBankNote.trim() ? ` - ${txBankNote.trim()}` : ''}]`
          : '';
      await onCreateTransaction({
        txDate,
        referenceNo: autoRef,
        type: txType,
        pnlGroup,
        description: `${description.trim()}${bankSuffix}`,
        amount: Number(amount),
        paymentMethod,
        relatedId: '',
      });
      setDescription('');
      setReferenceNo('');
      setTxBankNote('');
      setShowAddTxModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreatePayableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supName.trim() || !supItemSummary.trim() || supTotalAmount <= 0) return;
    setIsSubmitting(true);
    try {
      const paid = Math.min(supTotalAmount, Math.max(0, Number(supPaidAmount) || 0));
      await onCreatePayable({
        supplierName: supName.trim(),
        supplierPhone: supPhone.trim(),
        invoiceNo:
          supInvoice.trim() || `FAK-SUP-${String(payables.length + 1).padStart(3, '0')}`,
        txDate: supTxDate,
        dueDate: supDueDate,
        itemSummary: supItemSummary.trim(),
        totalAmount: Number(supTotalAmount),
        paidAmount: paid,
        status: paid >= supTotalAmount ? 'Lunas' : 'Belum Lunas',
      });
      setSupName('');
      setSupItemSummary('');
      setSupInvoice('');
      setShowAddPayableModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSettleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlingOrder || payAmountInput <= 0) return;
    setIsSubmitting(true);
    try {
      const chosenBank =
        settleBankName === 'MANUAL_BANK'
          ? settleBankCustom.trim() || 'Bank Transfer'
          : settleBankName;
      const bankLabel =
        payMethodInput === 'Transfer Bank'
          ? `${chosenBank}${settleBankNote.trim() ? ` (${settleBankNote.trim()})` : ''}`
          : undefined;
      await onSettleOrderPayment(
        settlingOrder,
        payAmountInput,
        payMethodInput,
        bankLabel
      );
      setSettlingOrder(null);
      setSettleBankNote('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaySupplierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingPayable || payAmountInput <= 0) return;
    setIsSubmitting(true);
    try {
      await onPaySupplierPayable(payingPayable, payAmountInput, payMethodInput);
      setPayingPayable(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Navigation Sub-Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Jurnal Kas, Beban Operasional & Piutang-Hutang
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Kelola arus kas masuk/keluar, biaya operasional workshop (listrik, gaji, servis mesin), piutang pelanggan, dan hutang supplier bahan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('CASH')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'CASH'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              Jurnal Kas & Biaya ({transactions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('RECEIVABLES')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'RECEIVABLES'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              Piutang Pelanggan ({summary.unpaidOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('PAYABLES')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'PAYABLES'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Hutang Supplier ({summary.unpaidPayables.length})
            </button>
          </div>

          {activeTab === 'CASH' && (
            <button
              type="button"
              onClick={() => setShowAddTxModal(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Catat Kas Masuk / Pengeluaran
            </button>
          )}
          {activeTab === 'PAYABLES' && (
            <button
              type="button"
              onClick={() => setShowAddPayableModal(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Catat Faktur Hutang Supplier
            </button>
          )}
        </div>
      </div>

      {/* Ringkasan Kas, Piutang & Hutang */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Saldo Kas & Bank Bersih</div>
          <div className="text-xl font-mono font-bold text-slate-900 mt-1 tabular-nums">
            {formatIDR(summary.netCash)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
            Tunai: {formatIDR(summary.balTunai)} · Bank: {formatIDR(summary.balBank)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Total Kas Masuk vs Keluar</div>
          <div className="text-sm font-mono font-semibold text-emerald-700 mt-1 tabular-nums">
            Masuk: +{formatIDR(summary.cashIn)}
          </div>
          <div className="text-xs font-mono text-rose-600 mt-0.5 tabular-nums">
            Keluar: -{formatIDR(summary.cashOut)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Total Piutang Pelanggan (Belum Lunas)</div>
          <div className="text-xl font-mono font-bold text-amber-700 mt-1 tabular-nums">
            {formatIDR(summary.totalReceivables)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Dari {summary.unpaidOrders.length} nota SPK DP / Tempo
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Total Hutang Supplier Bahan</div>
          <div className="text-xl font-mono font-bold text-rose-600 mt-1 tabular-nums">
            {formatIDR(summary.totalPayables)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Dari {summary.unpaidPayables.length} faktur kulakan belum lunas
          </div>
        </div>
      </div>

      {/* Content per Active Tab */}
      {activeTab === 'CASH' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg p-3.5">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari keterangan transaksi, nomor bukti, atau pos akun..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md text-xs">
              {(['ALL', 'Pemasukan', 'Pengeluaran'] as const).map((tp) => (
                <button
                  key={tp}
                  type="button"
                  onClick={() => setTxTypeFilter(tp)}
                  className={`px-3 py-1 font-medium rounded transition-colors whitespace-nowrap ${
                    txTypeFilter === tp
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tp === 'ALL' ? 'Semua Mutasi Kas' : tp}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600">
                    <th className="py-3 px-4 text-left font-semibold">Tanggal & No. Bukti</th>
                    <th className="py-3 px-4 text-left font-semibold">Keterangan Transaksi</th>
                    <th className="py-3 px-4 text-left font-semibold">Pos Akun Laba Rugi</th>
                    <th className="py-3 px-4 text-left font-semibold">Metode Kas/Bank</th>
                    <th className="py-3 px-4 text-right font-semibold">Nominal (Rp)</th>
                    <th className="py-3 px-4 text-right font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500">
                        Belum ada catatan transaksi kas yang sesuai filter.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-mono font-semibold text-slate-900">
                            {tx.referenceNo}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                            {formatDateID(tx.txDate)}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">
                          {tx.description}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{tx.pnlGroup}</td>
                        <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                          {tx.type} · {tx.paymentMethod}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                            tx.type === 'Pemasukan'
                              ? 'text-emerald-700'
                              : 'text-rose-600'
                          }`}
                        >
                          <span className="inline-flex items-center gap-1">
                            {tx.type === 'Pemasukan' ? (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowDownRight className="w-3.5 h-3.5" />
                            )}
                            {tx.type === 'Pemasukan' ? '+' : '-'}
                            {formatIDR(tx.amount)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => onDeleteTransaction(tx.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            title="Hapus Transaksi"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'RECEIVABLES' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600">
                  <th className="py-3 px-4 text-left font-semibold">No. SPK & Tanggal</th>
                  <th className="py-3 px-4 text-left font-semibold">Pelanggan & Kontak</th>
                  <th className="py-3 px-4 text-left font-semibold">Pekerjaan Cetak</th>
                  <th className="py-3 px-4 text-right font-semibold">Total Nota</th>
                  <th className="py-3 px-4 text-right font-semibold">Sudah Dibayar (DP)</th>
                  <th className="py-3 px-4 text-right font-semibold">Sisa Piutang</th>
                  <th className="py-3 px-4 text-right font-semibold">Aksi Penagihan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {summary.unpaidOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-500">
                      Seluruh pesanan cetak pelanggan sudah lunas (Tidak ada piutang tertunggak).
                    </td>
                  </tr>
                ) : (
                  summary.unpaidOrders.map((o) => {
                    const remaining = Math.max(0, o.totalAmount - o.paidAmount);
                    const payDetail = extractOrderPaymentDetail(o);
                    return (
                      <tr key={o.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-mono font-semibold text-slate-900">
                            {o.invoiceNumber}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">
                            Tgl: {formatDateID(o.orderDate)}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">
                            {o.customerName}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {o.customerPhone || '-'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-800">{o.jobTitle}</div>
                          <div className="text-[11px] text-slate-500">
                            Tahap: {o.productionStatus} · {payDetail.fullLabel}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                          {formatIDR(o.totalAmount)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-700 tabular-nums whitespace-nowrap">
                          {formatIDR(o.paidAmount)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-rose-600 tabular-nums whitespace-nowrap">
                          {formatIDR(remaining)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setSettlingOrder(o);
                              setPayAmountInput(remaining);
                              setPayMethodInput('Transfer Bank');
                            }}
                            className="px-3 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded transition-colors inline-flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Terima Pelunasan
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'PAYABLES' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600">
                  <th className="py-3 px-4 text-left font-semibold">No. Faktur & Jatuh Tempo</th>
                  <th className="py-3 px-4 text-left font-semibold">Nama Supplier Bahan</th>
                  <th className="py-3 px-4 text-left font-semibold">Rincian Pembelian Bahan</th>
                  <th className="py-3 px-4 text-right font-semibold">Total Faktur</th>
                  <th className="py-3 px-4 text-right font-semibold">Sudah Dibayar</th>
                  <th className="py-3 px-4 text-right font-semibold">Sisa Hutang</th>
                  <th className="py-3 px-4 text-right font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {payables.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-500">
                      Belum ada catatan hutang supplier bahan baku.
                    </td>
                  </tr>
                ) : (
                  payables.map((p) => {
                    const remaining = Math.max(0, p.totalAmount - p.paidAmount);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-mono font-semibold text-slate-900">
                            {p.invoiceNo}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">
                            Jatuh Tempo: {formatDateID(p.dueDate)}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">
                            {p.supplierName}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {p.supplierPhone || '-'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-800">{p.itemSummary}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                          {formatIDR(p.totalAmount)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-700 tabular-nums whitespace-nowrap">
                          {formatIDR(p.paidAmount)}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                            remaining > 0 ? 'text-rose-600' : 'text-slate-900'
                          }`}
                        >
                          {formatIDR(remaining)} ({p.status})
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {p.status !== 'Lunas' && remaining > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPayingPayable(p);
                                  setPayAmountInput(remaining);
                                  setPayMethodInput('Transfer Bank');
                                }}
                                className="px-2.5 py-1 text-[11px] font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded transition-colors"
                              >
                                Bayar Hutang
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onDeletePayable(p.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded"
                              title="Hapus Catatan Hutang"
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
      )}

      {/* Modal Catat Transaksi Kas Manual */}
      {showAddTxModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleCreateTxSubmit}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-lg text-xs"
          >
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              Catat Jurnal Kas Masuk / Pengeluaran Usaha
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Jenis Aliran Kas
                </label>
                <select
                  value={txType}
                  onChange={(e) => handleTxTypeSelect(e.target.value as TransactionType)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white font-semibold"
                >
                  <option value="Pengeluaran">Pengeluaran (Biaya / Belanja)</option>
                  <option value="Pemasukan">Pemasukan (Pendapatan / Modal)</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Tanggal Transaksi
                </label>
                <input
                  type="date"
                  required
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Pos Akun Laporan Laba Rugi
              </label>
              <select
                value={pnlGroup}
                onChange={(e) => setPnlGroup(e.target.value as PnlGroup)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
              >
                {(txType === 'Pemasukan' ? PNL_GROUPS_IN : PNL_GROUPS_OUT).map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Keterangan Detail Transaksi *
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: Bayar Listrik Workshop / Gaji Operator / Beli Tinta"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Nominal (Rp) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Akun Kas / Bank
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as CashPaymentMethod)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                >
                  <option value="Tunai">Kas Tunai</option>
                  <option value="Transfer Bank">Transfer Bank</option>
                  <option value="QRIS">QRIS</option>
                </select>
              </div>
            </div>

            {paymentMethod === 'Transfer Bank' && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2.5">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Pilih Nama Bank Transfer
                  </label>
                  <select
                    value={txBankName}
                    onChange={(e) => setTxBankName(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white font-semibold"
                  >
                    {BANK_TRANSFER_OPTIONS.map((bank) => (
                      <option key={bank.id} value={bank.id}>
                        {bank.name}
                      </option>
                    ))}
                  </select>
                </div>
                {txBankName === 'MANUAL_BANK' && (
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Ketik Nama Bank Lainnya
                    </label>
                    <input
                      type="text"
                      value={txBankCustom}
                      onChange={(e) => setTxBankCustom(e.target.value)}
                      placeholder="Contoh: Bank Mega / Bank Muamalat"
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
                    />
                  </div>
                )}
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Keterangan Transfer (a.n. Pengirim / No. Rek / Ref)
                  </label>
                  <input
                    type="text"
                    value={txBankNote}
                    onChange={(e) => setTxBankNote(e.target.value)}
                    placeholder="Contoh: a.n. Budi / Ref #88291"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Nomor Bukti / Referensi (Opsional)
              </label>
              <input
                type="text"
                placeholder="Otomatis jika dikosongkan"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddTxModal(false)}
                className="px-4 py-2 font-medium text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md"
              >
                {isSubmitting ? 'Menyimpan...' : 'Simpan Jurnal Kas'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Tambah Faktur Hutang Supplier */}
      {showAddPayableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleCreatePayableSubmit}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-lg text-xs"
          >
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              Catat Faktur Hutang Supplier Bahan
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Nama Supplier *
                </label>
                <input
                  type="text"
                  required
                  placeholder="PT Sumber Media Printindo"
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Kontak Telepon / WA
                </label>
                <input
                  type="text"
                  placeholder="021-xxxx / 0812-xxxx"
                  value={supPhone}
                  onChange={(e) => setSupPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Nomor Faktur Pembelian
                </label>
                <input
                  type="text"
                  placeholder="FAK-SMP-001"
                  value={supInvoice}
                  onChange={(e) => setSupInvoice(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Tanggal Jatuh Tempo
                </label>
                <input
                  type="date"
                  required
                  value={supDueDate}
                  onChange={(e) => setSupDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Rincian Barang / Bahan yang Dibeli *
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: 5 Roll Flexi 280gr + 4 Liter Tinta Eco-Solvent"
                value={supItemSummary}
                onChange={(e) => setSupItemSummary(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Total Tagihan Faktur (Rp) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={supTotalAmount}
                  onChange={(e) => setSupTotalAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  DP Awal Dibayar (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  value={supPaidAmount}
                  onChange={(e) => setSupPaidAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddPayableModal(false)}
                className="px-4 py-2 font-medium text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md"
              >
                {isSubmitting ? 'Menyimpan...' : 'Simpan Hutang Supplier'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Pelunasan Piutang Pelanggan */}
      {settlingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSettleOrderSubmit}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-lg text-xs"
          >
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              Terima Pelunasan Piutang: {settlingOrder.invoiceNumber}
            </h3>
            <div className="bg-slate-50 p-3 rounded border border-slate-200 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Pelanggan:</span>
                <span className="font-semibold text-slate-900">{settlingOrder.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Sisa Piutang:</span>
                <span className="font-mono font-bold text-rose-600 tabular-nums">
                  {formatIDR(Math.max(0, settlingOrder.totalAmount - settlingOrder.paidAmount))}
                </span>
              </div>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Nominal Diterima (Rp)
              </label>
              <input
                type="number"
                required
                min="1"
                max={Math.max(0, settlingOrder.totalAmount - settlingOrder.paidAmount)}
                value={payAmountInput}
                onChange={(e) => setPayAmountInput(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Metode Kas/Bank
              </label>
              <select
                value={payMethodInput}
                onChange={(e) => setPayMethodInput(e.target.value as CashPaymentMethod)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
              >
                <option value="Transfer Bank">Transfer Bank</option>
                <option value="Tunai">Kas Tunai</option>
                <option value="QRIS">QRIS</option>
              </select>
            </div>
            {payMethodInput === 'Transfer Bank' && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2.5">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Pilih Nama Bank Transfer Pelunasan
                  </label>
                  <select
                    value={settleBankName}
                    onChange={(e) => setSettleBankName(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white font-semibold"
                  >
                    {BANK_TRANSFER_OPTIONS.map((bank) => (
                      <option key={bank.id} value={bank.id}>
                        {bank.name}
                      </option>
                    ))}
                  </select>
                </div>
                {settleBankName === 'MANUAL_BANK' && (
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Ketik Nama Bank Lainnya
                    </label>
                    <input
                      type="text"
                      value={settleBankCustom}
                      onChange={(e) => setSettleBankCustom(e.target.value)}
                      placeholder="Contoh: Bank Mega / Bank Muamalat"
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
                    />
                  </div>
                )}
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Keterangan Pengirim / No. Rekening / Ref (Opsional)
                  </label>
                  <input
                    type="text"
                    value={settleBankNote}
                    onChange={(e) => setSettleBankNote(e.target.value)}
                    placeholder="Contoh: a.n. Hendra / M-Banking BCA"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSettlingOrder(null)}
                className="px-4 py-2 font-medium text-slate-600"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-md"
              >
                {isSubmitting ? 'Memproses...' : 'Konfirmasi Pelunasan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Bayar Hutang Supplier */}
      {payingPayable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handlePaySupplierSubmit}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-lg text-xs"
          >
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              Bayar Hutang Supplier: {payingPayable.invoiceNo}
            </h3>
            <div className="bg-slate-50 p-3 rounded border border-slate-200 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Supplier:</span>
                <span className="font-semibold text-slate-900">{payingPayable.supplierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Sisa Hutang:</span>
                <span className="font-mono font-bold text-rose-600 tabular-nums">
                  {formatIDR(Math.max(0, payingPayable.totalAmount - payingPayable.paidAmount))}
                </span>
              </div>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Nominal Pembayaran ke Supplier (Rp)
              </label>
              <input
                type="number"
                required
                min="1"
                max={Math.max(0, payingPayable.totalAmount - payingPayable.paidAmount)}
                value={payAmountInput}
                onChange={(e) => setPayAmountInput(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Keluar dari Akun Kas/Bank
              </label>
              <select
                value={payMethodInput}
                onChange={(e) => setPayMethodInput(e.target.value as CashPaymentMethod)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
              >
                <option value="Transfer Bank">Transfer Bank</option>
                <option value="Tunai">Kas Tunai</option>
                <option value="QRIS">QRIS</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayingPayable(null)}
                className="px-4 py-2 font-medium text-slate-600"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md"
              >
                {isSubmitting ? 'Memproses...' : 'Bayar & Catat Pengeluaran Kas'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
