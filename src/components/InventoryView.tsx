import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  PackagePlus,
  SlidersHorizontal,
  Trash2,
  AlertTriangle,
  History,
  Boxes,
  Barcode,
  Edit3,
  Tag,
} from 'lucide-react';
import {
  InventoryItem,
  InventoryCategory,
  InventoryUnit,
  StockMutationLog,
  CashPaymentMethod,
  formatIDR,
  formatNumberID,
  formatDateID,
  todayISO,
} from '../types';
import {
  generateNextAtkSku,
  renderCode128BarcodeDataUrl,
  formatSpacedBarcodeLabel,
} from '../utils/atkBarcodeHelpers';
import { AtkBarcodeLabelModal } from './AtkBarcodeLabelModal';

interface InventoryViewProps {
  inventory: InventoryItem[];
  stockLogs: StockMutationLog[];
  onCreateItem: (
    itemData: Omit<InventoryItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onUpdateItem?: (
    itemId: string,
    itemData: Omit<InventoryItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onRestockItem: (params: {
    item: InventoryItem;
    addedQty: number;
    newCostPerUnit: number;
    paymentMode: 'CASH' | 'PAYABLE' | 'NONE';
    cashMethod: CashPaymentMethod;
    invoiceNo: string;
    dueDate: string;
  }) => Promise<void>;
  onAdjustStock: (params: {
    item: InventoryItem;
    deltaQty: number;
    mutationType: 'Bahan Rusak / Gagal Cetak' | 'Penyesuaian Opname';
    reason: string;
  }) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
}

const INV_CATEGORIES: InventoryCategory[] = [
  'Bahan Outdoor',
  'Bahan Indoor & Sticker',
  'Kertas A3+ & Media',
  'Tinta & Toner',
  'Display & Finishing',
  'ATK & Perlengkapan',
  'Part & Storage IT',
];

const INV_UNITS: InventoryUnit[] = [
  'm2',
  'Lembar',
  'Roll',
  'Liter',
  'Botol',
  'Pcs',
  'Pack',
];

export const InventoryView: React.FC<InventoryViewProps> = ({
  inventory,
  stockLogs,
  onCreateItem,
  onUpdateItem,
  onRestockItem,
  onAdjustStock,
  onDeleteItem,
}) => {
  const [subTab, setSubTab] = useState<'MASTER' | 'LOGS'>('MASTER');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [labelModalTargetItem, setLabelModalTargetItem] = useState<InventoryItem | null>(
    null
  );
  const [restockTarget, setRestockTarget] = useState<InventoryItem | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<InventoryItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add Item State
  const [sku, setSku] = useState('');
  const [isSkuManuallyEdited, setIsSkuManuallyEdited] = useState(false);
  const [skuRandomSalt, setSkuRandomSalt] = useState(0);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<InventoryCategory>('Bahan Outdoor');
  const [unit, setUnit] = useState<InventoryUnit>('m2');
  const [stockQty, setStockQtyState] = useState<number>(100);
  const [stockQtyInput, setStockQtyInput] = useState<string>('100');
  const setStockQty = (val: number) => {
    setStockQtyState(val);
    setStockQtyInput(String(val));
  };
  const [minStockQty, setMinStockQtyState] = useState<number>(30);
  const [minStockQtyInput, setMinStockQtyInput] = useState<string>('30');
  const setMinStockQty = (val: number) => {
    setMinStockQtyState(val);
    setMinStockQtyInput(String(val));
  };
  const [costPerUnit, setCostPerUnitState] = useState<number>(10000);
  const [costPerUnitInput, setCostPerUnitInput] = useState<string>('10000');
  const setCostPerUnit = (val: number) => {
    setCostPerUnitState(val);
    setCostPerUnitInput(String(val));
  };
  const [defaultSellPrice, setDefaultSellPriceState] = useState<number>(25000);
  const [defaultSellPriceInput, setDefaultSellPriceInput] = useState<string>('25000');
  const setDefaultSellPrice = (val: number) => {
    setDefaultSellPriceState(val);
    setDefaultSellPriceInput(String(val));
  };
  const [supplierName, setSupplierName] = useState('');
  const [location, setLocation] = useState('Rak Gudang Utama');

  // Restock State
  const [addedQty, setAddedQtyState] = useState<number>(50);
  const [addedQtyInput, setAddedQtyInput] = useState<string>('50');
  const setAddedQty = (val: number) => {
    setAddedQtyState(val);
    setAddedQtyInput(String(val));
  };
  const [newCostPerUnit, setNewCostPerUnitState] = useState<number>(0);
  const [newCostPerUnitInput, setNewCostPerUnitInput] = useState<string>('0');
  const setNewCostPerUnit = (val: number) => {
    setNewCostPerUnitState(val);
    setNewCostPerUnitInput(String(val));
  };
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'PAYABLE' | 'NONE'>('CASH');
  const [cashMethod, setCashMethod] = useState<CashPaymentMethod>('Transfer Bank');
  const [invoiceNo, setInvoiceNo] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>(todayISO());

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

  // Adjust / Waste State
  const [adjustDelta, setAdjustDelta] = useState<number>(-5);
  const [adjustType, setAdjustType] = useState<
    'Bahan Rusak / Gagal Cetak' | 'Penyesuaian Opname'
  >('Bahan Rusak / Gagal Cetak');
  const [adjustReason, setAdjustReason] = useState<string>(
    'Bahan gagal cetak / head strike mesin outdoor'
  );

  const metrics = useMemo(() => {
    const totalValuation = inventory.reduce(
      (acc, item) => acc + item.stockQty * item.costPerUnit,
      0
    );
    const lowStockItems = inventory.filter((i) => i.stockQty <= i.minStockQty);
    return {
      totalSkus: inventory.length,
      totalValuation,
      lowStockCount: lowStockItems.length,
    };
  }, [inventory]);

  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q) ||
          item.supplierName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [inventory, categoryFilter, searchQuery]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !supplierName.trim()) return;
    setIsSubmitting(true);
    try {
      const cleanTypedSku = sku
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '-')
        .replace(/[^A-Z0-9\-]/g, '-');
      const isCollidingOrGeneric =
        !cleanTypedSku ||
        /^[A-Z]{2,4}-\d{1,4}$/.test(cleanTypedSku) ||
        inventory.some(
          (it) =>
            it.id !== editingItem?.id &&
            it.sku.trim().toUpperCase() === cleanTypedSku
        );
      const autoSku = isCollidingOrGeneric
        ? generateNextAtkSku(
            inventory,
            category,
            name.trim(),
            skuRandomSalt,
            editingItem?.id
          )
        : cleanTypedSku;

      const payload = {
        sku: autoSku,
        name: name.trim(),
        category,
        unit,
        stockQty: Math.max(0, Number(stockQty) || 0),
        minStockQty: Math.max(0, Number(minStockQty) || 0),
        costPerUnit: Math.max(0, Number(costPerUnit) || 0),
        defaultSellPrice: Math.max(0, Number(defaultSellPrice) || 0),
        supplierName: supplierName.trim(),
        location: location.trim(),
      };
      if (editingItem && onUpdateItem) {
        await onUpdateItem(editingItem.id, payload);
      } else {
        await onCreateItem(payload);
      }
      setName('');
      setSku('');
      setIsSkuManuallyEdited(false);
      setEditingItem(null);
      setShowAddModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openAddInventoryModal = (defaultCat: InventoryCategory = 'ATK & Perlengkapan') => {
    setEditingItem(null);
    setIsSkuManuallyEdited(false);
    setSkuRandomSalt(0);
    setCategory(defaultCat);
    setUnit(defaultCat === 'ATK & Perlengkapan' ? 'Pcs' : 'm2');
    setName('');
    setSku(generateNextAtkSku(inventory, defaultCat, '', 0));
    setStockQty(defaultCat === 'ATK & Perlengkapan' ? 30 : 100);
    setMinStockQty(defaultCat === 'ATK & Perlengkapan' ? 5 : 30);
    setCostPerUnit(defaultCat === 'ATK & Perlengkapan' ? 2500 : 10000);
    setDefaultSellPrice(defaultCat === 'ATK & Perlengkapan' ? 5000 : 25000);
    setSupplierName(defaultCat === 'ATK & Perlengkapan' ? 'Grosir ATK' : '');
    setLocation(defaultCat === 'ATK & Perlengkapan' ? 'Etalase Kasir ATK' : 'Rak Gudang Utama');
    setShowAddModal(true);
  };

  const openEditInventoryModal = (item: InventoryItem) => {
    setEditingItem(item);
    setIsSkuManuallyEdited(true);
    setSkuRandomSalt(0);
    setCategory(item.category);
    setUnit(item.unit);
    setSku(
      item.sku ||
        generateNextAtkSku(inventory, item.category, item.name, 0, item.id)
    );
    setName(item.name);
    setStockQty(item.stockQty);
    setMinStockQty(item.minStockQty);
    setCostPerUnit(item.costPerUnit);
    setDefaultSellPrice(item.defaultSellPrice);
    setSupplierName(item.supplierName);
    setLocation(item.location);
    setShowAddModal(true);
  };

  const modalBarcodePreviewUrl = useMemo(() => {
    const code =
      sku.trim().toUpperCase() ||
      generateNextAtkSku(
        inventory,
        category,
        name,
        skuRandomSalt,
        editingItem?.id
      );
    return renderCode128BarcodeDataUrl(code, {
      width: 3,
      height: 50,
      displayValue: true,
      fontSize: 13,
      margin: 4,
    });
  }, [sku, category, name, skuRandomSalt, editingItem, inventory]);

  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockTarget || addedQty <= 0) return;
    setIsSubmitting(true);
    try {
      await onRestockItem({
        item: restockTarget,
        addedQty: Number(addedQty),
        newCostPerUnit: Number(newCostPerUnit) || restockTarget.costPerUnit,
        paymentMode,
        cashMethod,
        invoiceNo:
          invoiceNo.trim() || `FAK-${Date.now().toString().slice(-5)}`,
        dueDate,
      });
      setRestockTarget(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget || adjustDelta === 0) return;
    setIsSubmitting(true);
    try {
      await onAdjustStock({
        item: adjustTarget,
        deltaQty: Number(adjustDelta),
        mutationType: adjustType,
        reason: adjustReason.trim() || 'Penyesuaian stok opname',
      });
      setAdjustTarget(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Summary Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Manajemen Stok Bahan Cetak, Tinta & Kartu Stok
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Pantau persediaan roll bahan outdoor/indoor, kertas A3+, tinta literan, restock supplier, dan waste gagal cetak.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setSubTab('MASTER')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                subTab === 'MASTER'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Boxes className="w-3.5 h-3.5" />
              Master Stok Bahan ({inventory.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('LOGS')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                subTab === 'LOGS'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Riwayat Kartu Stok ({stockLogs.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setLabelModalTargetItem(null);
              setLabelModalOpen(true);
            }}
            className="px-3.5 py-2 text-xs font-semibold text-slate-900 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Barcode className="w-4 h-4 text-emerald-800" />
            Stiker Label Barcode ATK
          </button>

          <button
            type="button"
            onClick={() => openAddInventoryModal('ATK & Perlengkapan')}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Tambah Bahan / ATK Baru
          </button>
        </div>
      </div>

      {/* Ringkasan Valuasi Inventori */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Total SKU Bahan & Media</div>
          <div className="text-xl font-mono font-bold text-slate-900 mt-1 tabular-nums">
            {metrics.totalSkus} Item Bahan
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Outdoor · Indoor · Kertas A3+ · Tinta · Display
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Nilai Aset Persediaan (Valuasi HPP)</div>
          <div className="text-xl font-mono font-bold text-slate-900 mt-1 tabular-nums">
            {formatIDR(metrics.totalValuation)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Dihitung dari Saldo Stok × Harga Pokok Beli
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Status Stok Kritis / Perlu Restock</div>
          <div
            className={`text-xl font-mono font-bold mt-1 tabular-nums ${
              metrics.lowStockCount > 0 ? 'text-rose-600' : 'text-emerald-700'
            }`}
          >
            {metrics.lowStockCount} Bahan Menipis
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {metrics.lowStockCount > 0
              ? 'Segera lakukan pemesanan ulang (Restock) ke supplier'
              : 'Seluruh stok bahan berada di atas batas minimum'}
          </div>
        </div>
      </div>

      {subTab === 'MASTER' ? (
        <>
          {/* Filter Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg p-3.5">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari kode SKU, nama bahan, kertas, tinta, atau supplier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md">
              <button
                type="button"
                onClick={() => setCategoryFilter('ALL')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  categoryFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua Kategori
              </button>
              {INV_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    categoryFilter === cat
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Tabel Master Stok */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600">
                    <th className="py-3 px-4 text-left font-semibold">SKU & Nama Bahan</th>
                    <th className="py-3 px-4 text-left font-semibold">Kategori & Supplier</th>
                    <th className="py-3 px-4 text-right font-semibold">Stok Tersedia</th>
                    <th className="py-3 px-4 text-right font-semibold">Min. Stok</th>
                    <th className="py-3 px-4 text-right font-semibold">HPP / Satuan</th>
                    <th className="py-3 px-4 text-right font-semibold">Harga Jual Dasar</th>
                    <th className="py-3 px-4 text-right font-semibold">Nilai Persediaan</th>
                    <th className="py-3 px-4 text-right font-semibold">Aksi Stok</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredInventory.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-500">
                        Tidak ada data bahan baku yang sesuai pencarian.
                      </td>
                    </tr>
                  ) : (
                    filteredInventory.map((item) => {
                      const isLow = item.stockQty <= item.minStockQty;
                      const totalVal = item.stockQty * item.costPerUnit;
                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="font-mono text-[11px] text-slate-500">
                              {item.sku} · {item.location || 'Gudang'}
                            </div>
                            <div className="font-semibold text-slate-900 mt-0.5">
                              {item.name}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-slate-800 font-medium">
                              {item.category}
                            </div>
                            <div className="text-slate-500 text-[11px] mt-0.5">
                              Supplier: {item.supplierName}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                            <div
                              className={`font-bold ${
                                isLow ? 'text-rose-600' : 'text-slate-900'
                              }`}
                            >
                              {formatNumberID(item.stockQty)} {item.unit}
                            </div>
                            <div className="text-[11px] mt-0.5">
                              {isLow ? (
                                <span className="text-rose-600 font-medium inline-flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  Stok Menipis
                                </span>
                              ) : (
                                <span className="text-emerald-700">Stok Aman</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-500 tabular-nums whitespace-nowrap">
                            {formatNumberID(item.minStockQty)} {item.unit}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-800 tabular-nums whitespace-nowrap">
                            {formatIDR(item.costPerUnit)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-emerald-700 font-medium tabular-nums whitespace-nowrap">
                            {formatIDR(item.defaultSellPrice)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                            {formatIDR(totalVal)}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {(item.category === 'ATK & Perlengkapan' ||
                                item.sku.toUpperCase().startsWith('ATK-')) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLabelModalTargetItem(item);
                                    setLabelModalOpen(true);
                                  }}
                                  className="px-2 py-1 text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded transition-colors flex items-center gap-1 whitespace-nowrap"
                                  title="Cetak Stiker Label Barcode 20x10mm & 15x5mm"
                                >
                                  <Tag className="w-3 h-3" />
                                  Label
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openEditInventoryModal(item)}
                                className="px-2 py-1 text-[11px] font-medium border border-slate-200 hover:bg-slate-100 text-slate-700 rounded transition-colors flex items-center gap-1 whitespace-nowrap"
                                title="Edit Item & Barcode SKU"
                              >
                                <Edit3 className="w-3 h-3" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRestockTarget(item);
                                  setAddedQty(50);
                                  setNewCostPerUnit(item.costPerUnit);
                                  setPaymentMode('CASH');
                                }}
                                className="px-2.5 py-1 text-[11px] font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded transition-colors flex items-center gap-1 whitespace-nowrap"
                              >
                                <PackagePlus className="w-3 h-3" />
                                Restock
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setAdjustTarget(item);
                                  setAdjustDelta(-1);
                                  setAdjustType('Bahan Rusak / Gagal Cetak');
                                }}
                                className="px-2 py-1 text-[11px] font-medium border border-slate-200 hover:bg-slate-100 text-slate-700 rounded transition-colors flex items-center gap-1 whitespace-nowrap"
                              >
                                <SlidersHorizontal className="w-3 h-3" />
                                Opname/Waste
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteItem(item.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                title="Hapus Bahan"
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
        </>
      ) : (
        /* Tabel Riwayat Kartu Stok */
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600">
                  <th className="py-3 px-4 text-left font-semibold">Tanggal</th>
                  <th className="py-3 px-4 text-left font-semibold">Nama Bahan Baku</th>
                  <th className="py-3 px-4 text-left font-semibold">Jenis Mutasi</th>
                  <th className="py-3 px-4 text-right font-semibold">Perubahan (Masuk/Keluar)</th>
                  <th className="py-3 px-4 text-right font-semibold">Saldo Akhir</th>
                  <th className="py-3 px-4 text-left font-semibold">Referensi SPK / Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {stockLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500">
                      Belum ada riwayat mutasi kartu stok.
                    </td>
                  </tr>
                ) : (
                  stockLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {formatDateID(log.logDate)}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {log.materialName}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-medium ${
                            log.qtyDelta > 0
                              ? 'text-emerald-700'
                              : log.mutationType === 'Bahan Rusak / Gagal Cetak'
                              ? 'text-rose-600'
                              : 'text-amber-700'
                          }`}
                        >
                          {log.mutationType}
                        </span>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                          log.qtyDelta > 0 ? 'text-emerald-700' : 'text-rose-600'
                        }`}
                      >
                        {log.qtyDelta > 0 ? `+${formatNumberID(log.qtyDelta)}` : formatNumberID(log.qtyDelta)}{' '}
                        {log.unit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-800 tabular-nums whitespace-nowrap">
                        {formatNumberID(log.resultingStock)} {log.unit}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{log.referenceInfo}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Tambah Bahan Baru */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <form
            onSubmit={handleCreateSubmit}
            className="bg-white border border-slate-200 rounded-lg max-w-lg w-full p-6 space-y-4 shadow-lg"
          >
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              {editingItem
                ? `Edit Master Stok & Barcode SKU: ${editingItem.name}`
                : 'Tambah Master Bahan Baku / Produk ATK Baru (Auto-SKU & Barcode)'}
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-medium text-slate-700">
                    Kode Barcode Space-Bar Unik
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const nextSalt = skuRandomSalt + 1;
                      setSkuRandomSalt(nextSalt);
                      setIsSkuManuallyEdited(false);
                      setSku(
                        generateNextAtkSku(
                          inventory,
                          category,
                          name,
                          nextSalt,
                          editingItem?.id
                        )
                      );
                    }}
                    className="text-[10px] font-bold text-emerald-700 hover:underline"
                    title="Buat pola Space-Bar Barcode spesifik dan unik baru agar tidak tertukar dengan produk lain"
                  >
                    ↻ Buat Space-Bar Unik
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Contoh: ATK-HVS4-107"
                  value={sku}
                  onChange={(e) => {
                    setIsSkuManuallyEdited(true);
                    setSku(e.target.value.toUpperCase());
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono font-bold text-xs"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Kategori Inventori
                </label>
                <select
                  value={category}
                  onChange={(e) => {
                    const nextCat = e.target.value as InventoryCategory;
                    setCategory(nextCat);
                    if (!editingItem) {
                      setIsSkuManuallyEdited(false);
                      setSku(
                        generateNextAtkSku(
                          inventory,
                          nextCat,
                          name,
                          skuRandomSalt
                        )
                      );
                      if (nextCat === 'ATK & Perlengkapan') {
                        setUnit('Pcs');
                      }
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs bg-white"
                >
                  {INV_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 bg-slate-50 border border-emerald-300 rounded-md p-2.5 flex flex-col items-center justify-center gap-1">
                <div className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                  <span>Visual Barcode Space-Bar Unik (Code128 Spesifik)</span>
                  <span className="font-mono bg-emerald-100 text-emerald-900 px-1.5 py-0.5 rounded">
                    {formatSpacedBarcodeLabel(sku || 'ATK-HVS4-107')}
                  </span>
                </div>
                {modalBarcodePreviewUrl && (
                  <img
                    src={modalBarcodePreviewUrl}
                    alt={sku || 'ATK-HVS4-107'}
                    className="h-14 object-contain bg-white px-2 py-1 rounded border border-slate-200"
                  />
                )}
                <div className="text-[10px] text-slate-500 text-center">
                  Pola celah putih & batang (Space-Bar) dibuat spesifik dari kombinasi nama produk + kode cek unik agar tidak pernah tertukar saat di-scan.
                </div>
              </div>
              <div className="col-span-2">
                <label className="block font-medium text-slate-700 mb-1">
                  Nama Lengkap Bahan / Produk ATK *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Spidol Snowman Boardmarker Hitam / Flexi 340gr"
                  value={name}
                  onChange={(e) => {
                    const nextName = e.target.value;
                    setName(nextName);
                    if (!editingItem && !isSkuManuallyEdited) {
                      setSku(
                        generateNextAtkSku(
                          inventory,
                          category,
                          nextName,
                          skuRandomSalt
                        )
                      );
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Satuan Ukur Stok
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as InventoryUnit)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs bg-white"
                >
                  {INV_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Lokasi Rak / Gudang
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-medium text-slate-700">
                    Stok Awal ({unit})
                  </label>
                  {(stockQty > 0 || stockQtyInput !== '') && (
                    <button
                      type="button"
                      onClick={() => {
                        setStockQtyInput('');
                        setStockQtyState(0);
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
                  step="0.01"
                  placeholder="0"
                  value={stockQtyInput}
                  onChange={(e) =>
                    handleCleanNumberChange(e, setStockQtyInput, setStockQtyState, true)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs tabular-nums"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-medium text-slate-700">
                    Batas Minimum Stok ({unit})
                  </label>
                  {(minStockQty > 0 || minStockQtyInput !== '') && (
                    <button
                      type="button"
                      onClick={() => {
                        setMinStockQtyInput('');
                        setMinStockQtyState(0);
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
                  step="0.01"
                  placeholder="0"
                  value={minStockQtyInput}
                  onChange={(e) =>
                    handleCleanNumberChange(e, setMinStockQtyInput, setMinStockQtyState, true)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs tabular-nums"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-medium text-slate-700">
                    Harga Beli / HPP per {unit} (Rp)
                  </label>
                  {(costPerUnit > 0 || costPerUnitInput !== '') && (
                    <button
                      type="button"
                      onClick={() => {
                        setCostPerUnitInput('');
                        setCostPerUnitState(0);
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
                  value={costPerUnitInput}
                  onChange={(e) =>
                    handleCleanNumberChange(e, setCostPerUnitInput, setCostPerUnitState, false)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs tabular-nums"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-medium text-slate-700">
                    Harga Jual Dasar per {unit} (Rp)
                  </label>
                  {(defaultSellPrice > 0 || defaultSellPriceInput !== '') && (
                    <button
                      type="button"
                      onClick={() => {
                        setDefaultSellPriceInput('');
                        setDefaultSellPriceState(0);
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
                  value={defaultSellPriceInput}
                  onChange={(e) =>
                    handleCleanNumberChange(
                      e,
                      setDefaultSellPriceInput,
                      setDefaultSellPriceState,
                      false
                    )
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs tabular-nums"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-medium text-slate-700 mb-1">
                  Nama Supplier Utama *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: PT Sumber Media Printindo"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setEditingItem(null);
                }}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md"
              >
                {isSubmitting
                  ? 'Menyimpan...'
                  : editingItem
                  ? 'Simpan Perubahan'
                  : 'Simpan Bahan Baru'}
              </button>
            </div>
          </form>
        </div>
      )}

      <AtkBarcodeLabelModal
        isOpen={labelModalOpen}
        onClose={() => setLabelModalOpen(false)}
        atkItems={inventory.filter(
          (i) =>
            i.category === 'ATK & Perlengkapan' ||
            i.sku.toUpperCase().startsWith('ATK-')
        )}
        initialSelectedItem={labelModalTargetItem}
      />

      {/* Modal Restock / Kulakan Bahan */}
      {restockTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleRestockSubmit}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-lg text-xs"
          >
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              Restock / Pembelian Bahan Baku: {restockTarget.name}
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-medium text-slate-700">
                    Jumlah Masuk ({restockTarget.unit})
                  </label>
                  {(addedQty > 0 || addedQtyInput !== '') && (
                    <button
                      type="button"
                      onClick={() => {
                        setAddedQtyInput('');
                        setAddedQtyState(0);
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
                  step="0.01"
                  placeholder="0"
                  value={addedQtyInput}
                  onChange={(e) =>
                    handleCleanNumberChange(e, setAddedQtyInput, setAddedQtyState, true)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono tabular-nums"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-medium text-slate-700">
                    Harga Beli / {restockTarget.unit} (Rp)
                  </label>
                  {(newCostPerUnit > 0 || newCostPerUnitInput !== '') && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewCostPerUnitInput('');
                        setNewCostPerUnitState(0);
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
                  value={newCostPerUnitInput}
                  onChange={(e) =>
                    handleCleanNumberChange(
                      e,
                      setNewCostPerUnitInput,
                      setNewCostPerUnitState,
                      false
                    )
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-md border border-slate-200 flex justify-between items-center">
              <span className="text-slate-600 font-medium">Total Nilai Belanja:</span>
              <span className="text-sm font-mono font-bold text-slate-900 tabular-nums">
                {formatIDR((Number(addedQty) || 0) * (Number(newCostPerUnit) || 0))}
              </span>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Pencatatan Pembukuan Pembelian
              </label>
              <select
                value={paymentMode}
                onChange={(e) =>
                  setPaymentMode(e.target.value as 'CASH' | 'PAYABLE' | 'NONE')
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white font-medium"
              >
                <option value="CASH">Bayar Lunas (Catat Pengeluaran Kas HPP)</option>
                <option value="PAYABLE">Beli Tempo (Catat ke Daftar Hutang Supplier)</option>
                <option value="NONE">Hanya Tambah Stok (Tanpa Jurnal Kas/Hutang)</option>
              </select>
            </div>

            {paymentMode === 'CASH' && (
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Metode Bayar Kas/Bank
                </label>
                <select
                  value={cashMethod}
                  onChange={(e) => setCashMethod(e.target.value as CashPaymentMethod)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                >
                  <option value="Transfer Bank">Transfer Bank</option>
                  <option value="Tunai">Kas Tunai</option>
                  <option value="QRIS">QRIS</option>
                </select>
              </div>
            )}

            {paymentMode === 'PAYABLE' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    No. Faktur Supplier
                  </label>
                  <input
                    type="text"
                    placeholder="FAK-SUP-001"
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Jatuh Tempo Hutang
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRestockTarget(null)}
                className="px-4 py-2 font-medium text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md"
              >
                {isSubmitting ? 'Memproses...' : 'Simpan Restock'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Opname / Bahan Rusak (Waste) */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleAdjustSubmit}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-lg text-xs"
          >
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              Penyesuaian Stok / Bahan Rusak (Waste): {adjustTarget.name}
            </h3>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Kategori Penyesuaian
              </label>
              <select
                value={adjustType}
                onChange={(e) =>
                  setAdjustType(
                    e.target.value as
                      | 'Bahan Rusak / Gagal Cetak'
                      | 'Penyesuaian Opname'
                  )
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
              >
                <option value="Bahan Rusak / Gagal Cetak">
                  Bahan Rusak / Gagal Cetak (Waste Produksi)
                </option>
                <option value="Penyesuaian Opname">
                  Penyesuaian Selisih Stok Opname Fisik
                </option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Perubahan Kuantitas ({adjustTarget.unit}) — Gunakan minus (-) untuk pengurangan
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono tabular-nums"
              />
              <div className="text-[11px] text-slate-500 mt-1">
                Stok Saat Ini: {adjustTarget.stockQty} {adjustTarget.unit} → Stok Setelah Penyesuaian:{' '}
                <span className="font-mono font-semibold text-slate-900">
                  {Math.max(0, adjustTarget.stockQty + (Number(adjustDelta) || 0))}{' '}
                  {adjustTarget.unit}
                </span>
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Keterangan / Alasan *
              </label>
              <input
                type="text"
                required
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdjustTarget(null)}
                className="px-4 py-2 font-medium text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md"
              >
                {isSubmitting ? 'Menyimpan...' : 'Simpan Penyesuaian Stok'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
