import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  ShoppingCart,
  Trash2,
  Edit2,
  X,
  Minus,
  Maximize2,
  RotateCcw,
  Send,
  CheckCircle2,
  Printer,
} from 'lucide-react';
import {
  InventoryItem,
  OrderCartItem,
  PrintOrder,
  StoreSettings,
  PrintPaperSize,
  OrderUnitType,
  PaymentMethod,
  PaymentStatus,
  formatIDR,
  roundFinalOrderAmount,
  cleanProductJobTitle,
  todayISO,
  clampString,
} from '../types';
import {
  findUniqueMatchingProductByBarcode,
  playScannerBeepSound,
} from '../utils/atkBarcodeHelpers';
import {
  getOrCreateDesktopCameraSessionCode,
  subscribeToRemoteCameraSession,
  RemoteCameraScanMessage,
} from '../utils/atkRemoteCameraBridge';

export interface AtkFullscreenPosModalProps {
  isOpen: boolean;
  isMinimized: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onRestore: () => void;
  inventory: InventoryItem[];
  activeCashierName: string;
  cashierList: string[];
  storeSettings: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>;
  paperSize: PrintPaperSize;
  nextInvoiceNo: string;
  onCreateOrder: (
    orderData: Omit<PrintOrder, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
    deductStock: boolean,
    recordCashTx: boolean
  ) => Promise<PrintOrder | void>;
  onOpenPrintModal: (
    order: PrintOrder,
    mode: 'invoice' | 'spk',
    size?: PrintPaperSize
  ) => void;
}

interface PosCartItem {
  id: string;
  materialId: string;
  barcode: string;
  name: string;
  unit: OrderUnitType;
  price: number;
  cost: number;
  qty: number;
  discount: number;
}

export const AtkFullscreenPosModal: React.FC<AtkFullscreenPosModalProps> = ({
  isOpen,
  isMinimized,
  onClose,
  onMinimize,
  onRestore,
  inventory,
  activeCashierName,
  cashierList,
  paperSize,
  nextInvoiceNo,
  onCreateOrder,
  onOpenPrintModal,
}) => {
  // 1. Transaction Header State
  const [orderDate, setOrderDate] = useState(todayISO());
  const [cashier, setCashier] = useState(
    activeCashierName || cashierList[0] || 'Admin Kasir'
  );
  const [customerName, setCustomerName] = useState('Umum');
  const [customerPhone, setCustomerPhone] = useState('');
  const [invoiceNo, setInvoiceNo] = useState(nextInvoiceNo);

  // 2. Barcode Input & Scanner State
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [qtyInput, setQtyInput] = useState<number>(1);
  const [selectedProduct, setSelectedProduct] = useState<InventoryItem | null>(null);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  const suggestionListRef = useRef<HTMLDivElement | null>(null);

  // 3. Cart Items
  const [cart, setCart] = useState<PosCartItem[]>([]);

  // 4. Item Edit Modal State
  const [editingItem, setEditingItem] = useState<PosCartItem | null>(null);
  const [editQty, setEditQty] = useState<number>(1);
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editDiscount, setEditDiscount] = useState<number>(0);

  // 5. Bottom Summary & Payment State
  const [globalDiscountInput, setGlobalDiscountInput] = useState<string>('0');
  const [cashPaymentInput, setCashPaymentInput] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Tunai');
  const [notes, setNotes] = useState('');

  // 6. Feedback & Submitting State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successToast, setSuccessToast] = useState<{
    invoice: string;
    total: number;
    createdOrder: PrintOrder;
  } | null>(null);

  // Live Toast for Scanned Barcode Events
  const [scanFeedback, setScanFeedback] = useState<{
    text: string;
    type: 'success' | 'warning' | 'error';
  } | null>(null);

  // 7. Last Scanned Item for large prominent display
  const [lastScannedItem, setLastScannedItem] = useState<{
    name: string;
    barcode: string;
    price: number;
    qty: number;
    unit: string;
    total: number;
  } | null>(null);

  // Sync next invoice number and auto-focus when modal opens
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setInvoiceNo(nextInvoiceNo);
      setOrderDate(todayISO());
      setCashier(activeCashierName || cashierList[0] || 'Admin Kasir');
      const timer = setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isMinimized, nextInvoiceNo, activeCashierName, cashierList]);

  // Filter only ATK inventory items for lookup (prioritized)
  const atkInventory = useMemo(() => {
    return inventory.filter(
      (item) =>
        item.category === 'ATK & Perlengkapan' ||
        item.category === ('Penjualan ATK' as unknown) ||
        (item.category || '').toLowerCase().includes('atk') ||
        (item.sku && item.sku.toUpperCase().startsWith('ATK-'))
    );
  }, [inventory]);

  // Filtered dropdown suggestions
  const productSuggestions = useMemo(() => {
    if (!barcodeQuery.trim()) return [];
    const q = barcodeQuery.toLowerCase().trim();
    const primary = atkInventory.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.sku && item.sku.toLowerCase().includes(q))
    );
    if (primary.length >= 10) {
      return primary.slice(0, 10);
    }
    const secondary = inventory.filter(
      (item) =>
        !primary.some((p) => p.id === item.id) &&
        (item.name.toLowerCase().includes(q) ||
          (item.sku && item.sku.toLowerCase().includes(q)))
    );
    return [...primary, ...secondary].slice(0, 10);
  }, [atkInventory, inventory, barcodeQuery]);

  // Kelola indeks pilihan aktif saat suggestions berubah
  useEffect(() => {
    if (productSuggestions.length > 0) {
      setHighlightedIndex((prev) => {
        if (prev >= 0 && prev < productSuggestions.length) return prev;
        return 0;
      });
    } else {
      setHighlightedIndex(-1);
    }
  }, [productSuggestions]);

  // Otomatis scroll item yang disorot dengan panah keyboard agar selalu terlihat
  useEffect(() => {
    if (highlightedIndex >= 0 && suggestionListRef.current) {
      const items = suggestionListRef.current.querySelectorAll<HTMLElement>('[data-suggestion-item]');
      const activeEl = items[highlightedIndex];
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  // Live Matched Item for prominent price display
  const matchedItem = useMemo(() => {
    if (!barcodeQuery.trim()) return null;
    const q = barcodeQuery.toLowerCase().trim();
    return (
      atkInventory.find((item) => item.sku.toLowerCase() === q) ||
      selectedProduct ||
      inventory.find((item) => item.sku.toLowerCase() === q) ||
      atkInventory.find((item) => item.name.toLowerCase() === q) ||
      (productSuggestions.length === 1 ? productSuggestions[0] : null) ||
      null
    );
  }, [atkInventory, barcodeQuery, selectedProduct, productSuggestions, inventory]);

  // Add Item to Cart Helper
  const addItemToCart = (item: InventoryItem, qty = 1) => {
    if (qty <= 0) return;
    playScannerBeepSound('success');

    setCart((prev) => {
      const existingIdx = prev.findIndex((p) => p.materialId === item.id);
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = {
          ...next[existingIdx],
          qty: next[existingIdx].qty + qty,
        };
        return next;
      }
      const mappedUnit: OrderUnitType =
        item.unit === 'm2' ||
        item.unit === 'Lembar' ||
        item.unit === 'Roll' ||
        item.unit === 'Pcs'
          ? (item.unit as OrderUnitType)
          : 'Pcs';

      const newItem: PosCartItem = {
        id: `pos_item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        materialId: item.id,
        barcode: item.sku || 'ATK',
        name: cleanProductJobTitle(item.name),
        unit: mappedUnit,
        price: Number(item.defaultSellPrice) || 0,
        cost: Number(item.costPerUnit) || 0,
        qty,
        discount: 0,
      };
      return [...prev, newItem];
    });

    const itemSellPrice = Number(item.defaultSellPrice) || 0;
    setLastScannedItem({
      name: cleanProductJobTitle(item.name),
      barcode: item.sku || 'ATK',
      price: itemSellPrice,
      qty,
      unit: item.unit || 'Pcs',
      total: itemSellPrice * qty,
    });

    setScanFeedback({
      text: `✓ Masuk Keranjang: ${cleanProductJobTitle(item.name)} (${qty} ${item.unit || 'pcs'} @ ${formatIDR(itemSellPrice)})`,
      type: 'success',
    });
    setTimeout(() => {
      setScanFeedback((curr) => (curr?.type === 'success' ? null : curr));
    }, 3000);

    setBarcodeQuery('');
    setSelectedProduct(null);
    setQtyInput(1);
    setShowProductDropdown(false);
    setHighlightedIndex(-1);
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 50);
  };

  // Core Barcode Processor
  const processScannedCode = (rawCode: string, qty = 1) => {
    const query = (rawCode || '').trim();
    if (!query) return;

    // 1. Match via robust barcode helper (supports hyphenated, spaced, and compact alphanumeric)
    const matched =
      findUniqueMatchingProductByBarcode(query, atkInventory, inventory) ||
      inventory.find((it) => (it.sku || '').toUpperCase() === query.toUpperCase()) ||
      inventory.find(
        (it) =>
          (it.sku || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() ===
          query.replace(/[^A-Z0-9]/gi, '').toUpperCase()
      ) ||
      selectedProduct ||
      inventory.find((it) => it.name.toLowerCase() === query.toLowerCase()) ||
      atkInventory.find((it) => it.name.toLowerCase().includes(query.toLowerCase())) ||
      inventory.find((it) => it.name.toLowerCase().includes(query.toLowerCase()));

    if (matched) {
      addItemToCart(matched, qty);
      return;
    }

    // 2. Fallback: If not found in database, inform cashier with clear audio/visual feedback
    playScannerBeepSound('error');
    setScanFeedback({
      text: `⚠️ Barcode "${query}" tidak terdaftar di database Master Stok! Pastikan produk sudah terdaftar.`,
      type: 'error',
    });
    setTimeout(() => {
      setScanFeedback((curr) => (curr?.type === 'error' ? null : curr));
    }, 4500);

    setBarcodeQuery('');
    setSelectedProduct(null);
    setShowProductDropdown(false);
    setHighlightedIndex(-1);
    barcodeInputRef.current?.focus();
  };

  // Handle Scan / Enter in Barcode Input
  const handleBarcodeSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (selectedProduct) {
      addItemToCart(selectedProduct, qtyInput);
      return;
    }
    const query = barcodeQuery.trim();
    if (!query) return;
    processScannedCode(query, qtyInput);
  };

  // Global Hardware Barcode Gun & Wireless Scanner Keystroke Listener
  useEffect(() => {
    if (!isOpen || isMinimized) return;

    let scanBuffer = '';
    let lastKeyTime = Date.now();

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const isInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT');

      const isBarcodeInput = activeEl === barcodeInputRef.current;
      const now = Date.now();
      const timeDiff = now - lastKeyTime;
      lastKeyTime = now;

      // Handle Enter (scan completion)
      if (e.key === 'Enter') {
        if (isBarcodeInput) {
          // Biarkan event Enter ditangani oleh handler onKeyDown pada input barcode
          // agar pemilihan autocomplete produk dengan panah keyboard berjalan mulus
          return;
        }

        // Scanner finished scanning while focus was not on barcode input
        if (scanBuffer.trim().length >= 2 && timeDiff < 300) {
          e.preventDefault();
          const code = scanBuffer.trim();
          scanBuffer = '';
          processScannedCode(code, 1);
          barcodeInputRef.current?.focus();
          return;
        }

        scanBuffer = '';
        return;
      }

      // Collect single characters
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (!isInput) {
          if (timeDiff > 250) {
            scanBuffer = e.key;
          } else {
            scanBuffer += e.key;
          }
        } else if (!isBarcodeInput && timeDiff < 60 && scanBuffer.length >= 2) {
          scanBuffer += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown, true);
    return () => window.removeEventListener('keydown', handleWindowKeyDown, true);
  }, [isOpen, isMinimized, barcodeQuery, qtyInput, atkInventory, inventory, selectedProduct]);

  // Subscribe to Wireless Remote Phone Camera Scanner
  useEffect(() => {
    if (!isOpen || isMinimized) return;

    const desktopSessionCode = getOrCreateDesktopCameraSessionCode();
    const unsubscribe = subscribeToRemoteCameraSession(
      desktopSessionCode,
      (msg: RemoteCameraScanMessage) => {
        if (msg.type === 'SCAN' && msg.sku) {
          processScannedCode(msg.sku, Math.max(1, msg.deltaQty || 1));
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [isOpen, isMinimized, atkInventory, inventory]);

  // Calculations
  const subTotal = useMemo(() => {
    return cart.reduce((acc, item) => {
      const itemSub = Math.max(0, item.price * item.qty - (item.discount || 0));
      return acc + itemSub;
    }, 0);
  }, [cart]);

  const globalDiscount = Math.max(0, Number(globalDiscountInput) || 0);
  const rawGrandTotal = Math.max(0, subTotal - globalDiscount);
  const roundingInfo = roundFinalOrderAmount(rawGrandTotal);
  const grandTotal = roundingInfo.roundedTotal;

  const cashPaid = Number(cashPaymentInput) || 0;
  const changeAmount = Math.max(0, cashPaid - grandTotal);

  // Delete Cart Item
  const handleDeleteItem = (id: string) => {
    setCart((prev) => prev.filter((it) => it.id !== id));
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  };

  // Open Edit Item Dialog
  const handleOpenEditItem = (item: PosCartItem) => {
    setEditingItem(item);
    setEditQty(item.qty);
    setEditPrice(item.price);
    setEditDiscount(item.discount || 0);
  };

  // Save Edited Item
  const handleSaveEditItem = () => {
    if (!editingItem) return;
    setCart((prev) =>
      prev.map((it) => {
        if (it.id !== editingItem.id) return it;
        return {
          ...it,
          qty: Math.max(1, editQty),
          price: Math.max(0, editPrice),
          discount: Math.max(0, editDiscount),
        };
      })
    );
    setEditingItem(null);
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  };

  // Reset / Cancel Form
  const handleResetForm = () => {
    if (cart.length > 0 && !window.confirm('Kosongkan keranjang transaksi penjualan ATK?')) {
      return;
    }
    setCart([]);
    setBarcodeQuery('');
    setQtyInput(1);
    setGlobalDiscountInput('0');
    setCashPaymentInput('');
    setNotes('');
    setCustomerName('Umum');
    setCustomerPhone('');
    setLastScannedItem(null);
    setScanFeedback(null);
    barcodeInputRef.current?.focus();
  };

  // Final Checkout & Payment Process
  const handleProcessPayment = async () => {
    if (cart.length === 0) {
      alert('Keranjang belanja masih kosong! Silakan scan atau masukkan produk ATK terlebih dahulu.');
      barcodeInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      const sanitizedCartItems: OrderCartItem[] = cart.map((cItem, idx) => {
        const itemBase = Math.round(cItem.price * cItem.qty);
        const itemTotal = Math.max(0, itemBase - (cItem.discount || 0));
        const itemCogs = Math.round(cItem.cost * cItem.qty);
        return {
          id: cItem.id || `cart_atk_${idx + 1}`,
          jobTitle: cleanProductJobTitle(cItem.name),
          category: 'Penjualan ATK',
          materialId: cItem.materialId,
          materialName: cleanProductJobTitle(cItem.name),
          unitType: cItem.unit,
          widthM: 0,
          heightM: 0,
          qty: cItem.qty,
          totalAreaOrQty: cItem.qty,
          unitPrice: cItem.price,
          unitCost: cItem.cost,
          baseSubtotal: itemBase,
          designFee: 0,
          finishingDesc: '',
          finishingFee: 0,
          discount: cItem.discount || 0,
          itemTotalAmount: itemTotal,
          itemTotalCogs: itemCogs,
        };
      });

      const primary = sanitizedCartItems[0];
      const isMulti = sanitizedCartItems.length > 1;

      const summaryTitle = isMulti
        ? clampString(
            sanitizedCartItems.map((it, idx) => `${idx + 1}. ${it.jobTitle}`).join(' | '),
            160,
            primary.jobTitle
          )
        : primary.jobTitle;

      const summaryMat = isMulti
        ? clampString(
            Array.from(new Set(sanitizedCartItems.map((it) => it.materialName))).join(', '),
            120,
            primary.materialName
          )
        : primary.materialName;

      const totalCogs = sanitizedCartItems.reduce((acc, it) => acc + it.itemTotalCogs, 0);
      const rawCashPaid = Number(cashPaymentInput) || 0;
      const actualPayment =
        paymentMethod === 'Tempo'
          ? 0
          : rawCashPaid > 0
          ? rawCashPaid
          : grandTotal;
      const resolvedChange =
        paymentMethod === 'Tempo'
          ? 0
          : Math.max(0, actualPayment - grandTotal);
      const isLunas = paymentMethod !== 'Tempo' && (rawCashPaid === 0 || rawCashPaid >= grandTotal);
      const finalPaid =
        paymentMethod === 'Tempo'
          ? 0
          : rawCashPaid > 0
          ? Math.min(grandTotal, rawCashPaid)
          : grandTotal;
      const finalStatus: PaymentStatus = isLunas ? 'Lunas' : 'Belum Bayar';

      const backupPaymentTag =
        paymentMethod === 'Tunai' || actualPayment > grandTotal
          ? `[TUNAI:${actualPayment}|KEMBALIAN:${resolvedChange}]`
          : '';
      const finalNotes = notes.trim()
        ? `${notes.trim()} ${backupPaymentTag}`.trim()
        : backupPaymentTag;

      const payload: Omit<PrintOrder, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> = {
        invoiceNumber: (invoiceNo.trim() || nextInvoiceNo).toUpperCase(),
        orderDate,
        deadlineDate: orderDate,
        customerName: customerName.trim() || 'Pelanggan Umum',
        customerPhone: customerPhone.trim(),
        jobTitle: summaryTitle,
        category: 'Penjualan ATK',
        materialId: primary.materialId,
        materialName: summaryMat,
        unitType: primary.unitType,
        widthM: 0,
        heightM: 0,
        qty: sanitizedCartItems.reduce((acc, it) => acc + it.qty, 0),
        totalAreaOrQty: sanitizedCartItems.reduce((acc, it) => acc + it.totalAreaOrQty, 0),
        unitPrice: primary.unitPrice,
        unitCost: primary.unitCost,
        designFee: 0,
        finishingDesc: '',
        finishingFee: 0,
        discount: globalDiscount,
        totalAmount: grandTotal,
        totalCogs,
        paidAmount: finalPaid,
        paymentAmount: actualPayment,
        changeAmount: resolvedChange,
        paymentStatus: finalStatus,
        paymentMethod,
        productionStatus: 'Selesai',
        notes: finalNotes,
        cashierName: clampString(cashier || 'Admin Kasir', 60, 'Admin Kasir'),
        ...(isMulti
          ? { cartItemsJson: clampString(JSON.stringify(sanitizedCartItems), 10000, '') }
          : {}),
      };

      const created = await onCreateOrder(payload, true, finalPaid > 0);

      const resolvedOrder: PrintOrder =
        created || {
          id: `temp_atk_${Date.now()}`,
          ownerId: '',
          ...payload,
        };

      setSuccessToast({
        invoice: resolvedOrder.invoiceNumber,
        total: resolvedOrder.totalAmount,
        createdOrder: resolvedOrder,
      });

      // Clear for next customer transaction
      setCart([]);
      setBarcodeQuery('');
      setQtyInput(1);
      setGlobalDiscountInput('0');
      setCashPaymentInput('');
      setNotes('');
      setCustomerName('Umum');
      setCustomerPhone('');
      setLastScannedItem(null);
      setScanFeedback(null);
      setInvoiceNo(`SPK-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 8999) + 1000)}`);
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    } catch (err) {
      alert(`Gagal memproses transaksi: ${err instanceof Error ? err.message : 'Error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Minimized Floating Widget Bar
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-[#0f172a] text-white rounded-xl shadow-2xl p-3 border border-slate-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <div className="text-xs">
            <span className="font-bold text-emerald-400">Kasir ATK Aktif:</span>{' '}
            <span className="font-mono text-slate-300">#{invoiceNo}</span> ·{' '}
            <span className="font-semibold">{cart.length} Produk</span> ·{' '}
            <span className="font-mono font-bold text-emerald-400">{formatIDR(grandTotal)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 pl-2 border-l border-slate-700">
          <button
            type="button"
            onClick={onRestore}
            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-bold flex items-center gap-1 transition-colors"
            title="Perbesar Layar Penuh (Maximize)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Maximize</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-rose-400 rounded transition-colors"
            title="Tutup Kasir ATK"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#0a0f1d] text-slate-100 font-sans p-3 sm:p-5 lg:p-6 flex flex-col justify-between select-none"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target && !['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'A', 'OPTION'].includes(target.tagName)) {
          barcodeInputRef.current?.focus();
        }
      }}
    >
      {/* =====================================================================
          1. HEADER: Sales Penjualan · Breadcrumb · Minimize & Close (High Contrast Dark)
         ===================================================================== */}
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-700/80">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Sales</h1>
          <span className="text-xl sm:text-2xl font-bold text-emerald-400">Penjualan</span>
          <span className="ml-2 hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-950/80 text-emerald-300 border border-emerald-500/40">
            POS Retail Mode
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Breadcrumb Navigation */}
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 font-semibold">
            <span className="text-base leading-none">🏠</span>
            <span className="text-emerald-400 font-bold">&gt;</span>
            <span className="hover:text-slate-200 transition-colors">Transaction</span>
            <span className="text-emerald-400 font-bold">&gt;</span>
            <span className="text-white font-bold bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
              Sales
            </span>
          </div>

          {/* Window Control Buttons: Minimize & Close */}
          <div className="flex items-center gap-1.5 pl-3 border-l border-slate-700">
            <button
              type="button"
              onClick={onMinimize}
              title="Minimize Jendela Kasir ATK"
              className="w-8 h-8 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 flex items-center justify-center transition-colors shadow-xs"
            >
              <Minus className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Tutup Jendela Kasir ATK (Kembali ke Daftar Pesanan)"
              className="w-8 h-8 rounded-lg bg-slate-800/90 hover:bg-rose-600 text-slate-200 hover:text-white border border-slate-700 hover:border-rose-500 flex items-center justify-center transition-colors shadow-xs"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Live Scan Notification Toast */}
      {scanFeedback && (
        <div
          className={`my-2 p-3 rounded-lg shadow-lg flex items-center justify-between text-xs font-semibold animate-in slide-in-from-top-2 border ${
            scanFeedback.type === 'success'
              ? 'bg-emerald-950/95 text-emerald-200 border-emerald-500 shadow-emerald-950/50'
              : 'bg-rose-950/95 text-rose-200 border-rose-500 shadow-rose-950/50'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {scanFeedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <span className="text-lg leading-none shrink-0">⚠️</span>
            )}
            <span>{scanFeedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setScanFeedback(null)}
            className="p-1 hover:bg-white/10 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Success Checkout Toast Notification */}
      {successToast && (
        <div className="my-2 p-3 bg-emerald-950 text-emerald-100 border border-emerald-500 rounded-lg shadow-lg flex items-center justify-between text-xs animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>
              Transaksi penjualan ATK <strong>#{successToast.invoice}</strong> (
              {formatIDR(successToast.total)}) berhasil disimpan dan stok gudang otomatis terpotong!
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenPrintModal(successToast.createdOrder, 'invoice', paperSize)}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded flex items-center gap-1 transition-colors shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              Cetak Struk Thermal
            </button>
            <button
              type="button"
              onClick={() => setSuccessToast(null)}
              className="p-1 hover:bg-emerald-800 rounded text-emerald-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          2. TOP SECTION: 3 HIGH CONTRAST DARK CARDS
          (Date/Kasir/Customer | Barcode/Qty/Add | Invoice/Big Price)
         ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 mt-3">
        {/* Card 1: Date, Kasir, Customer */}
        <div className="lg:col-span-4 bg-[#111827] rounded-lg shadow-lg shadow-black/25 border border-slate-700/80 p-4 space-y-3 text-xs">
          {/* Date Row */}
          <div className="flex items-center">
            <label className="w-24 font-bold text-slate-200">Date</label>
            <input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="flex-1 px-3 py-1.5 border border-slate-600 rounded bg-[#0b101c] text-white font-mono text-xs focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
            />
          </div>

          {/* Kasir Row */}
          <div className="flex items-center">
            <label className="w-24 font-bold text-slate-200">Kasir</label>
            {cashierList && cashierList.length > 1 ? (
              <select
                value={cashier}
                onChange={(e) => setCashier(e.target.value)}
                className="flex-1 px-3 py-1.5 border border-slate-600 rounded bg-[#0b101c] text-white font-medium text-xs focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
              >
                {cashierList.map((c) => (
                  <option key={c} value={c} className="bg-[#111827] text-white">
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                readOnly
                value={cashier}
                className="flex-1 px-3 py-1.5 border border-slate-700 rounded bg-[#0b101c]/80 text-slate-300 font-medium text-xs"
              />
            )}
          </div>

          {/* Customer Row */}
          <div className="flex items-center">
            <label className="w-24 font-bold text-slate-200">Customer</label>
            <div className="flex-1 flex gap-1.5">
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Umum / Nama Pembeli"
                className="flex-1 px-3 py-1.5 border border-slate-600 rounded bg-[#0b101c] text-white font-medium text-xs placeholder:text-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
              />
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="No. WA (opsional)"
                className="w-28 px-2.5 py-1.5 border border-slate-600 rounded text-[11px] font-mono bg-[#0b101c] text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
              />
            </div>
          </div>
        </div>

        {/* Card 2: Barcode, Qty, Add Button */}
        <div className="lg:col-span-4 bg-[#111827] rounded-lg shadow-lg shadow-black/25 border border-slate-700/80 p-4 space-y-3 text-xs relative">
          {/* Barcode Search Row */}
          <div className="flex items-center relative">
            <label className="w-24 font-bold text-slate-200">Barcode</label>
            <div className="flex-1 flex gap-1.5">
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeQuery}
                onChange={(e) => {
                  setBarcodeQuery(e.target.value);
                  setShowProductDropdown(true);
                }}
                onFocus={() => {
                  if (barcodeQuery.trim() && productSuggestions.length > 0) {
                    setShowProductDropdown(true);
                  }
                }}
                onBlur={() => {
                  // Berikan jeda agar interaksi klik mouse pada item dropdown tetap tereksekusi
                  setTimeout(() => {
                    setShowProductDropdown(false);
                  }, 200);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (!showProductDropdown && productSuggestions.length > 0) {
                      setShowProductDropdown(true);
                      setHighlightedIndex(0);
                    } else if (productSuggestions.length > 0) {
                      setHighlightedIndex((prev) =>
                        prev < productSuggestions.length - 1 ? prev + 1 : 0
                      );
                    }
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (!showProductDropdown && productSuggestions.length > 0) {
                      setShowProductDropdown(true);
                      setHighlightedIndex(productSuggestions.length - 1);
                    } else if (productSuggestions.length > 0) {
                      setHighlightedIndex((prev) =>
                        prev > 0 ? prev - 1 : productSuggestions.length - 1
                      );
                    }
                    return;
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setShowProductDropdown(false);
                    setHighlightedIndex(-1);
                    return;
                  }
                  if (e.key === 'Tab') {
                    if (
                      showProductDropdown &&
                      productSuggestions.length > 0 &&
                      highlightedIndex >= 0 &&
                      highlightedIndex < productSuggestions.length
                    ) {
                      e.preventDefault();
                      const item = productSuggestions[highlightedIndex];
                      setSelectedProduct(item);
                      setBarcodeQuery(item.name);
                      setShowProductDropdown(false);
                      setHighlightedIndex(-1);
                      addItemToCart(item, qtyInput);
                      return;
                    }
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (
                      showProductDropdown &&
                      productSuggestions.length > 0 &&
                      highlightedIndex >= 0 &&
                      highlightedIndex < productSuggestions.length
                    ) {
                      const item = productSuggestions[highlightedIndex];
                      setSelectedProduct(item);
                      setBarcodeQuery(item.name);
                      setShowProductDropdown(false);
                      setHighlightedIndex(-1);
                      addItemToCart(item, qtyInput);
                      return;
                    }
                    handleBarcodeSubmit();
                  }
                }}
                placeholder="Scan Barcode / Ketik Nama Barang..."
                className="flex-1 px-3 py-1.5 border-2 border-emerald-500/80 rounded bg-[#0b101c] text-emerald-300 font-mono font-bold text-xs tracking-wide placeholder:text-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30"
              />
              <button
                type="button"
                onClick={() => handleBarcodeSubmit()}
                title="Cari / Masukkan ke Keranjang (Enter)"
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded transition-colors shadow-sm flex items-center justify-center shrink-0"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Autocomplete Suggestions Dropdown dengan Navigasi Panah Keyboard */}
          {showProductDropdown && productSuggestions.length > 0 && (
            <div
              ref={suggestionListRef}
              onMouseDown={(e) => {
                // Cegah input blur saat berinteraksi dengan dropdown
                e.preventDefault();
              }}
              className="absolute left-4 sm:left-28 right-4 top-13 z-30 bg-[#0f172a] border border-slate-600 rounded-lg shadow-2xl max-h-64 overflow-y-auto divide-y divide-slate-800"
            >
              {/* Petunjuk Pintasan Navigasi Keyboard */}
              <div className="px-3 py-1.5 bg-[#080d19] text-[10px] text-slate-400 flex flex-wrap items-center justify-between gap-1 border-b border-slate-700/80 sticky top-0 z-10 backdrop-blur">
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-mono font-bold border border-slate-600">↑</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-mono font-bold border border-slate-600">↓</span>
                  <span>Gunakan Panah Keyboard untuk Pilih Barang</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-mono font-bold">↵ Enter</span>
                  <span>= Masukkan ke Keranjang</span>
                </div>
              </div>

              {productSuggestions.map((item, index) => {
                const isHighlighted = index === highlightedIndex;
                return (
                  <button
                    key={item.id}
                    data-suggestion-item
                    type="button"
                    onClick={() => {
                      setSelectedProduct(item);
                      setBarcodeQuery(item.name);
                      setShowProductDropdown(false);
                      setHighlightedIndex(-1);
                      addItemToCart(item, qtyInput);
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`w-full px-3.5 py-2.5 text-left text-xs flex items-center justify-between transition-colors ${
                      isHighlighted
                        ? 'bg-emerald-950/90 border-l-4 border-l-emerald-400 text-emerald-100 ring-1 ring-emerald-500/50'
                        : 'hover:bg-slate-800/80 text-white border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="flex-1 pr-3 min-w-0">
                      <div className="font-bold text-white text-xs sm:text-sm leading-snug break-words">
                        {item.name}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-[11px]">
                        <span className="font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30 text-[10px] whitespace-nowrap">
                          {item.sku}
                        </span>
                        <span className="text-slate-400 whitespace-nowrap">
                          Stok: <strong className="text-slate-200">{item.stockQty}</strong> {item.unit}
                        </span>
                        {item.category && (
                          <span className="text-slate-500 italic text-[10px] truncate max-w-[140px]">
                            ({item.category})
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 pl-2 flex flex-col items-end justify-center">
                      <span className="font-mono font-black text-emerald-400 text-sm block whitespace-nowrap">
                        {formatIDR(item.defaultSellPrice)}
                      </span>
                      {isHighlighted ? (
                        <span className="mt-1 px-2 py-0.5 rounded bg-emerald-500 text-slate-950 text-[10px] font-black uppercase tracking-wider shadow-sm flex items-center gap-1 animate-pulse whitespace-nowrap">
                          ↵ Enter (Pilih)
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-mono mt-0.5 whitespace-nowrap">
                          Pilihan (↑ / ↓)
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Qty Row */}
          <div className="flex items-center">
            <label className="w-24 font-bold text-slate-200">Qty</label>
            <input
              type="number"
              min="1"
              value={qtyInput}
              onChange={(e) => setQtyInput(Math.max(1, parseInt(e.target.value) || 1))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleBarcodeSubmit();
                }
              }}
              className="w-24 px-3 py-1.5 border border-slate-600 rounded bg-[#0b101c] text-white font-mono font-bold text-xs focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
            />
          </div>

          {/* Matched / Scanned Item Price Banner */}
          {matchedItem && (
            <div className="bg-emerald-950/80 border border-emerald-500/80 rounded-lg p-2.5 flex items-center justify-between shadow-inner animate-in fade-in">
              <div className="min-w-0 pr-2">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                  Scan: {matchedItem.sku}
                </span>
                <span className="font-bold text-white text-xs truncate block" title={matchedItem.name}>
                  {matchedItem.name}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Stok: {matchedItem.stockQty} {matchedItem.unit}
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] font-bold text-emerald-300 uppercase block">Harga Satuan</span>
                <span className="text-2xl font-black text-emerald-400 font-mono tracking-tight">
                  {formatIDR(matchedItem.defaultSellPrice)}
                </span>
              </div>
            </div>
          )}

          {/* Add Button */}
          <div className="flex items-center justify-between pt-0.5">
            <div className="w-24" />
            <button
              type="button"
              onClick={() => handleBarcodeSubmit()}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-md shadow-blue-950/40 transition-colors"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>
        </div>

        {/* Card 3: Invoice Number & Big Nominal Price Display */}
        <div className="lg:col-span-4 bg-[#111827] rounded-lg shadow-lg shadow-black/25 border border-slate-700/80 p-4 flex flex-col justify-between text-right">
          {/* Top Line: Invoice Number */}
          <div className="flex items-center justify-between text-xs text-slate-300 pb-2 border-b border-slate-700/60">
            <span className="font-semibold text-slate-400 text-[11px]">
              {lastScannedItem ? (
                <span className="text-emerald-400 font-bold truncate max-w-[170px] inline-block align-bottom" title={lastScannedItem.name}>
                  ✓ {lastScannedItem.name}
                </span>
              ) : (
                'Total Kasir POS'
              )}
            </span>
            <div className="text-xs">
              Invoice <strong className="font-mono text-emerald-400 font-bold">{invoiceNo}</strong>
            </div>
          </div>

          {/* Large Bold Nominal Cash Register Display */}
          <div className="my-auto py-3">
            <div className="text-5xl sm:text-6xl xl:text-7xl font-black text-emerald-400 tracking-tight font-mono select-all leading-none drop-shadow-sm">
              {formatIDR(grandTotal)},-
            </div>
            {lastScannedItem ? (
              <div className="text-xs text-emerald-300 font-semibold mt-2.5 flex items-center justify-end gap-1.5 flex-wrap bg-emerald-950/60 border border-emerald-800/80 rounded px-2.5 py-1">
                <span className="text-slate-400 text-[11px]">Harga Hasil Scan:</span>
                <span className="font-mono font-black text-base text-emerald-400">
                  {formatIDR(lastScannedItem.price)}
                </span>
                <span className="text-slate-300 text-[11px] font-bold">
                  × {lastScannedItem.qty} {lastScannedItem.unit} = {formatIDR(lastScannedItem.total)}
                </span>
              </div>
            ) : (
              <div className="text-[11px] text-slate-400 font-mono mt-2">
                {cart.length > 0 ? `${cart.length} item terdaftar di kasir` : 'Belum ada produk di kasir'}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-700/60 font-mono">
            <span>Kasir: <strong className="text-white">{cashier}</strong></span>
            <span>{cart.length} item terdaftar</span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          3. MIDDLE SECTION: CART ITEMS TABLE
         ===================================================================== */}
      <div className="bg-[#111827] rounded-lg shadow-lg shadow-black/25 border border-slate-700/80 my-3.5 overflow-hidden flex-1 flex flex-col min-h-[220px]">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-[#0b101c] text-slate-200 border-b border-slate-700 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-3 w-10 text-center">#</th>
                <th className="py-3 px-3 w-32">Barcode</th>
                <th className="py-3 px-3">Product Item</th>
                <th className="py-3 px-3 w-28 text-right">Price</th>
                <th className="py-3 px-3 w-20 text-center">Qty</th>
                <th className="py-3 px-3 w-28 text-right">Discount Item</th>
                <th className="py-3 px-3 w-32 text-right">Total</th>
                <th className="py-3 px-3 w-36 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {cart.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <ShoppingCart className="w-10 h-10 text-slate-600" />
                      <span className="font-bold text-slate-300 text-sm">
                        Keranjang penjualan ATK masih kosong
                      </span>
                      <span className="text-xs text-slate-400 max-w-md">
                        Scan barcode produk menggunakan scanner (USB/Bluetooth/Ponsel) atau ketik nama/barcode di kolom atas.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                cart.map((item, idx) => {
                  const itemTotal = Math.max(0, item.price * item.qty - (item.discount || 0));
                  return (
                    <tr key={item.id} className="hover:bg-slate-800/60 transition-colors">
                      <td className="py-3 px-3 text-center font-mono font-medium text-slate-400">
                        {idx + 1}.
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                        {item.barcode}
                      </td>
                      <td className="py-3 px-3 font-semibold text-white">
                        {item.name}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-200">
                        {formatIDR(item.price)}
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-white">
                        {item.qty} {item.unit || 'pcs'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-amber-300">
                        {item.discount > 0 ? formatIDR(item.discount) : '-'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-emerald-400 tabular-nums text-sm">
                        {formatIDR(itemTotal)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditItem(item)}
                            className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-[11px] font-bold flex items-center gap-1 transition-colors shadow-2xs"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Update</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id)}
                            className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-bold flex items-center gap-1 transition-colors shadow-2xs"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
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

      {/* =====================================================================
          4. BOTTOM SECTION: 4 PANELS
          (SubTotal/Discount/GrandTotal | Cash/Change | Note | Cancel/Process Payment)
         ===================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 text-xs">
        {/* Column 1: Sub Total, Discount, Grand Total */}
        <div className="md:col-span-3 bg-[#111827] rounded-lg shadow-lg shadow-black/25 border border-slate-700/80 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="w-24 font-bold text-slate-200">Sub Total</label>
            <input
              type="text"
              readOnly
              value={formatIDR(subTotal)}
              className="flex-1 px-3 py-1.5 border border-slate-700 rounded bg-[#0b101c] font-mono font-bold text-slate-200 text-right"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="w-24 font-bold text-slate-200">Discount</label>
            <input
              type="number"
              min="0"
              value={globalDiscountInput}
              onChange={(e) => setGlobalDiscountInput(e.target.value)}
              placeholder="0"
              className="flex-1 px-3 py-1.5 border border-slate-600 rounded bg-[#0b101c] font-mono font-bold text-amber-300 text-right focus:outline-none focus:border-amber-400"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="w-24 font-bold text-slate-200">Grand Total</label>
            <input
              type="text"
              readOnly
              value={formatIDR(grandTotal)}
              className="flex-1 px-3 py-1.5 border-2 border-emerald-500/80 rounded bg-[#070b14] font-mono font-black text-emerald-400 text-right text-sm shadow-inner"
            />
          </div>
        </div>

        {/* Column 2: Tunai & Kembalian */}
        <div className="md:col-span-3 bg-[#111827] rounded-lg shadow-lg shadow-black/25 border border-slate-700/80 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="w-20 font-bold text-slate-200">Tunai</label>
            <input
              type="number"
              min="0"
              value={cashPaymentInput}
              onChange={(e) => setCashPaymentInput(e.target.value)}
              placeholder="0"
              className="flex-1 px-3 py-1.5 border border-slate-600 rounded bg-[#0b101c] font-mono font-bold text-white text-right focus:outline-none focus:border-emerald-400"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="w-20 font-bold text-slate-200">Kembalian</label>
            <input
              type="text"
              readOnly
              value={formatIDR(changeAmount)}
              className="flex-1 px-3 py-1.5 border border-emerald-600/60 rounded bg-[#070b14] font-mono font-bold text-emerald-300 text-right text-xs"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="w-20 font-bold text-slate-200">Metode</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="flex-1 px-2.5 py-1.5 border border-slate-600 rounded bg-[#0b101c] font-semibold text-white focus:outline-none focus:border-emerald-400"
            >
              <option value="Tunai">Tunai</option>
              <option value="Transfer Bank">Transfer Bank</option>
              <option value="QRIS">QRIS</option>
              <option value="Tempo">Tempo (Piutang)</option>
            </select>
          </div>
        </div>

        {/* Column 3: Note */}
        <div className="md:col-span-3 bg-[#111827] rounded-lg shadow-lg shadow-black/25 border border-slate-700/80 p-3.5 flex flex-col">
          <label className="font-bold text-slate-200 mb-1.5">Note</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Catatan tambahan nota penjualan ATK..."
            rows={3}
            className="flex-1 p-2 border border-slate-600 rounded bg-[#0b101c] text-white text-xs resize-none focus:outline-none focus:border-emerald-400 placeholder:text-slate-500"
          />
        </div>

        {/* Column 4: Action Buttons (Cancel & Process Payment) */}
        <div className="md:col-span-3 flex flex-col justify-between gap-2.5">
          <button
            type="button"
            onClick={handleResetForm}
            className="w-full py-2.5 px-4 bg-[#d97706] hover:bg-amber-600 text-white font-bold rounded-lg shadow-md flex items-center justify-center gap-1.5 text-xs transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Cancel</span>
          </button>

          <button
            type="button"
            disabled={isSubmitting || cart.length === 0}
            onClick={handleProcessPayment}
            className="w-full py-3.5 px-4 bg-[#059669] hover:bg-emerald-600 text-white font-bold rounded-lg shadow-xl shadow-emerald-950/50 flex items-center justify-center gap-2 text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            <span>{isSubmitting ? 'Memproses...' : 'Process Payment'}</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          5. MODAL UPDATE ITEM (Qty, Price, Discount)
         ===================================================================== */}
      {editingItem && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#111827] rounded-xl shadow-2xl border border-slate-700 max-w-sm w-full p-4.5 space-y-4 text-xs text-white">
            <div className="flex items-center justify-between border-b border-slate-700 pb-2.5">
              <h3 className="font-bold text-sm text-white">
                Update Produk #{editingItem.barcode}
              </h3>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nama Produk</label>
                <input
                  type="text"
                  readOnly
                  value={editingItem.name}
                  className="w-full px-3 py-1.5 border border-slate-700 rounded bg-[#0b101c] text-slate-300"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Jumlah (Qty)</label>
                <input
                  type="number"
                  min="1"
                  value={editQty}
                  onChange={(e) => setEditQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-1.5 border border-slate-600 rounded bg-[#0b101c] text-white font-mono font-bold focus:border-emerald-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Harga Satuan (Rp)</label>
                <input
                  type="number"
                  min="0"
                  value={editPrice}
                  onChange={(e) => setEditPrice(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-1.5 border border-slate-600 rounded bg-[#0b101c] text-emerald-400 font-mono font-bold focus:border-emerald-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Diskon Item (Rp)</label>
                <input
                  type="number"
                  min="0"
                  value={editDiscount}
                  onChange={(e) => setEditDiscount(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-1.5 border border-slate-600 rounded bg-[#0b101c] text-amber-300 font-mono focus:border-amber-400"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-700">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveEditItem}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-xs"
              >
                Simpan Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
