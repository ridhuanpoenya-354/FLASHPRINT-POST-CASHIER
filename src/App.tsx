/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  User,
} from 'firebase/auth';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Printer,
  LogOut,
  LogIn,
  Database,
  AlertCircle,
  Save,
  Sun,
  Moon,
  AlertTriangle,
  KeyRound,
  ShieldCheck,
  Mail,
  MessageSquare,
  CheckCircle2,
  X,
  Lock,
  HardDrive,
  Wifi,
  WifiOff,
  RefreshCw,
  Clock,
} from 'lucide-react';
import {
  db,
  initAuth,
  googleSignIn,
  subscribeAccessToken,
  logout,
  OperationType,
  handleFirestoreError,
} from './firebase';
import {
  DriveSettingsSyncPayload,
} from './utils/googleDriveSync';
import {
  getOrCreateDesktopCameraSessionCode,
  saveDesktopCameraSessionCode,
  getSavedPreferredExternalCameraId,
  savePreferredExternalCameraId,
  getSavedRemotePhoneSendMode,
  saveRemotePhoneSendMode,
} from './utils/atkRemoteCameraBridge';
import {
  PrintOrder,
  InventoryItem,
  CashTransaction,
  SupplierPayable,
  StockMutationLog,
  ProductionStatus,
  PaymentStatus,
  CashPaymentMethod,
  StoreSettings,
  DEFAULT_STORE_SETTINGS,
  NavTab,
  PrintPaperSize,
  OfflineBackupTrigger,
  OfflineLocalBackupRecord,
  clampString,
  sanitizeCode,
  sanitizeSku,
  todayISO,
  nowTimeLabel,
  extractOrderPaymentDetail,
  composeOrderNotesWithPayment,
  extractOrderCartItems,
} from './types';
import { getSampleDataset } from './seedData';
import {
  ensureUniqueInventoryBarcodes,
  generateNextAtkSku,
} from './utils/atkBarcodeHelpers';
import { DashboardOverview } from './components/DashboardOverview';
import { OrdersPosView } from './components/OrdersPosView';
import { InventoryView } from './components/InventoryView';
import { CashAndDebtsView } from './components/CashAndDebtsView';
import { ProfitLossView } from './components/ProfitLossView';
import {
  SettingsView,
  ResetTargets,
  hashAppPassword,
} from './components/SettingsView';
import { PrintModal } from './components/PrintModal';
import { AtkRemotePhoneScannerModal } from './components/AtkRemotePhoneScannerModal';

interface StoredAppAuth {
  email: string;
  phone: string;
  passwordHash: string;
  verified: boolean;
  storeName?: string;
}

const LOCAL_STATE_KEY = 'cetakpro_full_state_backup_v1';
const LOCAL_APP_AUTH_KEY = 'cetakpro_app_auth';
const LOCAL_OFFLINE_BACKUPS_KEY = 'cetakpro_offline_backups_v1';
const LOCAL_PENDING_SYNC_KEY = 'cetakpro_pending_cloud_sync_v1';
const LOCAL_OFFLINE_SINCE_KEY = 'cetakpro_offline_since_ms';
const LOCAL_LAST_AUTOBACKUP_KEY = 'cetakpro_last_offline_autobackup_ms';
const LOCAL_AUTOBACKUP_ENABLED_KEY = 'cetakpro_offline_autobackup_enabled';
const ONE_HOUR_MS = 60 * 60 * 1000; // 1 jam (3.600.000 ms)

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [driveAccessToken, setDriveAccessToken] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('DASHBOARD');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  // App-Specific Email & Password Session State
  const [appPasswordSessionEmail, setAppPasswordSessionEmail] = useState<
    string | null
  >(() => {
    try {
      return sessionStorage.getItem('cetakpro_active_app_session');
    } catch {
      return null;
    }
  });
  const [isScreenLocked, setIsScreenLocked] = useState(false);
  const [remoteScannerSessionFromUrl, setRemoteScannerSessionFromUrl] = useState<string | null>(
    () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('atkRemoteSession');
        return code && code.trim() ? code.trim() : null;
      } catch {
        return null;
      }
    }
  );
  const [remoteScannerSendModeFromUrl] = useState<'AUTO_SEND' | 'MANUAL_SEND' | undefined>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const mode = params.get('sendMode');
      if (mode === 'MANUAL_SEND') return 'MANUAL_SEND';
      if (mode === 'AUTO_SEND') return 'AUTO_SEND';
      return undefined;
    } catch {
      return undefined;
    }
  });

  // Login Screen Form State (Email & Password Khusus Aplikasi + Verifikasi Email/WA)
  const [loginCardTab, setLoginCardTab] = useState<
    'LOGIN_APP' | 'REGISTER_APP' | 'GOOGLE_CLOUD'
  >('LOGIN_APP');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regVerifyMethod, setRegVerifyMethod] = useState<'WHATSAPP' | 'EMAIL'>(
    'WHATSAPP'
  );
  const [regOtpSent, setRegOtpSent] = useState<string | null>(null);
  const [regOtpInput, setRegOtpInput] = useState('');
  const [loginInfoBanner, setLoginInfoBanner] = useState<string | null>(null);

  // Exit Warning Modal ("Peringatan untuk menyimpan semua keadaan sebelum keluar")
  const [showExitWarningModal, setShowExitWarningModal] = useState(false);
  const [isSavingBeforeExit, setIsSavingBeforeExit] = useState(false);

  // Collections State
  const [orders, setOrders] = useState<PrintOrder[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [payables, setPayables] = useState<SupplierPayable[]>([]);
  const [stockLogs, setStockLogs] = useState<StockMutationLog[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Store Settings & Autosave State
  const [storeSettings, setStoreSettings] = useState<
    Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>
  >(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.storeSettings) {
          return { ...DEFAULT_STORE_SETTINGS, ...parsed.storeSettings };
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_STORE_SETTINGS;
  });
  const [settingsDocExists, setSettingsDocExists] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    'IDLE' | 'SAVING' | 'SAVED' | 'UNSAVED'
  >('IDLE');
  const initialTabRestoredRef = useRef(false);
  const pendingLocalEditRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Offline Local Save, 1-Hour Offline Autobackup & Auto-Cloud Sync State
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [offlineSinceMs, setOfflineSinceMs] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_OFFLINE_SINCE_KEY);
      if (saved) return Number(saved) || Date.now();
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const now = Date.now();
        localStorage.setItem(LOCAL_OFFLINE_SINCE_KEY, String(now));
        return now;
      }
    } catch {
      // ignore
    }
    return null;
  });
  const [lastOfflineAutoBackupMs, setLastOfflineAutoBackupMs] = useState<
    number | null
  >(() => {
    try {
      const saved = localStorage.getItem(LOCAL_LAST_AUTOBACKUP_KEY);
      return saved ? Number(saved) || null : null;
    } catch {
      return null;
    }
  });
  const [offlineAutoBackupEnabled, setOfflineAutoBackupEnabled] =
    useState<boolean>(() => {
      try {
        return localStorage.getItem(LOCAL_AUTOBACKUP_ENABLED_KEY) !== 'false';
      } catch {
        return true;
      }
    });
  const [pendingCloudSync, setPendingCloudSync] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LOCAL_PENDING_SYNC_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [cloudSyncStatus, setCloudSyncStatus] = useState<
    'IDLE' | 'SYNCING' | 'SYNCED' | 'OFFLINE_QUEUED' | 'ERROR'
  >(() => {
    try {
      return localStorage.getItem(LOCAL_PENDING_SYNC_KEY) === 'true'
        ? 'OFFLINE_QUEUED'
        : 'IDLE';
    } catch {
      return 'IDLE';
    }
  });
  const [offlineBackupHistory, setOfflineBackupHistory] = useState<
    OfflineLocalBackupRecord[]
  >(() => {
    try {
      const raw = localStorage.getItem(LOCAL_OFFLINE_BACKUPS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [offlineSyncNotice, setOfflineSyncNotice] = useState<{
    type: 'INFO' | 'SUCCESS' | 'WARNING';
    text: string;
  } | null>(null);
  const [offlineTickNowMs, setOfflineTickNowMs] = useState<number>(() =>
    Date.now()
  );
  const isSyncingCloudRef = useRef(false);

  // Print Modal State
  const [printOrderTarget, setPrintOrderTarget] = useState<PrintOrder | null>(null);
  const [printMode, setPrintMode] = useState<'invoice' | 'spk'>('invoice');
  const [printPaperSize, setPrintPaperSize] = useState<PrintPaperSize>(() => {
    try {
      const saved = localStorage.getItem(
        'cetakpro_paper_size'
      ) as PrintPaperSize | null;
      if (
        saved === 'THERMAL_80' ||
        saved === 'THERMAL_100' ||
        saved === 'A5_LANDSCAPE' ||
        saved === 'A6_LANDSCAPE' ||
        saved === 'SIZE_210X100'
      ) {
        return saved;
      }
    } catch {
      // ignore storage errors
    }
    return 'A5_LANDSCAPE';
  });

  const handleChangePaperSize = (size: PrintPaperSize) => {
    setPrintPaperSize(size);
    try {
      localStorage.setItem('cetakpro_paper_size', size);
    } catch {
      // ignore storage errors
    }
  };

  // Save full snapshot to localStorage as well so state is never lost
  const saveLocalSnapshot = useCallback(
    (
      nextSettings: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>,
      nextOrders = orders,
      nextInv = inventory,
      nextTx = transactions,
      nextPay = payables,
      nextLogs = stockLogs
    ) => {
      try {
        localStorage.setItem(
          LOCAL_STATE_KEY,
          JSON.stringify({
            storeSettings: nextSettings,
            orders: nextOrders,
            inventory: nextInv,
            transactions: nextTx,
            payables: nextPay,
            stockLogs: nextLogs,
            savedAt: nowTimeLabel(),
          })
        );
      } catch {
        // ignore quota errors
      }
    },
    [orders, inventory, transactions, payables, stockLogs]
  );

  // Browser beforeunload warning ("peringatan untuk menyimpan semua keadaan sebelum keluar")
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (
        saveStatus === 'UNSAVED' ||
        saveStatus === 'SAVING' ||
        pendingLocalEditRef.current
      ) {
        e.preventDefault();
        e.returnValue =
          'Ada perubahan pembukuan atau pengaturan yang belum disimpan. Simpan semua keadaan sebelum keluar?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveStatus]);

  // Pre-fill login email if stored in localStorage
  useEffect(() => {
    try {
      const savedAuth = localStorage.getItem(LOCAL_APP_AUTH_KEY);
      if (savedAuth) {
        const parsed = JSON.parse(savedAuth) as StoredAppAuth;
        if (parsed.email) {
          setLoginEmail(parsed.email);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // 1. Auth & In-Memory Google Drive OAuth Token Listener
  useEffect(() => {
    const unsubToken = subscribeAccessToken((token) => {
      setDriveAccessToken(token);
    });
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setDriveAccessToken(token);
        setIsAuthReady(true);
      },
      () => {
        setUser(null);
        setDriveAccessToken(null);
        setIsAuthReady(true);
      }
    );
    return () => {
      unsubToken();
      unsubscribe();
    };
  }, []);

  // 2. Load Local Dataset on mount (Standalone Offline-First Mode)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.orders) && parsed.orders.length > 0) {
          const upgradedInv = ensureUniqueInventoryBarcodes(
            parsed.inventory || []
          );
          setOrders(parsed.orders);
          setInventory(upgradedInv.items);
          setTransactions(parsed.transactions || []);
          setPayables(parsed.payables || []);
          setStockLogs(parsed.stockLogs || []);
          if (parsed.storeSettings) {
            setStoreSettings((prev) => ({ ...prev, ...parsed.storeSettings }));
          }
          setDataLoading(false);
          return;
        }
      }
    } catch {
      // ignore
    }
    // Initialize with sample dataset if empty
    const sample = getSampleDataset('app_local_owner');
    setOrders(sample.orders as PrintOrder[]);
    setInventory(sample.inventory as InventoryItem[]);
    setTransactions(sample.transactions as CashTransaction[]);
    setPayables(sample.payables as SupplierPayable[]);
    setStockLogs(sample.stockLogs as StockMutationLog[]);
    setDataLoading(false);
  }, []);

  // 3. Real-time Firestore Listeners (Bypassed if db is not connected)
  useEffect(() => {
    if (!db || !isAuthReady || !user) {
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    const uid = user.uid;

    const unsubOrders = onSnapshot(
      query(collection(db, 'orders'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as PrintOrder)
        );
        list.sort((a, b) => b.orderDate.localeCompare(a.orderDate));
        setOrders(list);
        setDataLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'orders')
    );

    const unsubInventory = onSnapshot(
      query(collection(db, 'inventory'), where('ownerId', '==', uid)),
      (snap) => {
        const rawList = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as InventoryItem)
        );
        rawList.sort((a, b) => a.sku.localeCompare(b.sku));
        const upgraded = ensureUniqueInventoryBarcodes(rawList);
        setInventory(upgraded.items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'inventory')
    );

    const unsubTransactions = onSnapshot(
      query(collection(db, 'transactions'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as CashTransaction)
        );
        list.sort((a, b) => b.txDate.localeCompare(a.txDate));
        setTransactions(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'transactions')
    );

    const unsubPayables = onSnapshot(
      query(collection(db, 'payables'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as SupplierPayable)
        );
        list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        setPayables(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'payables')
    );

    const unsubStockLogs = onSnapshot(
      query(collection(db, 'stockLogs'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as StockMutationLog)
        );
        list.sort((a, b) => b.logDate.localeCompare(a.logDate));
        setStockLogs(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'stockLogs')
    );

    const unsubSettings = onSnapshot(
      doc(db, 'settings', uid),
      (snap) => {
        if (snap.exists()) {
          setSettingsDocExists(true);
          const data = snap.data() as StoreSettings;
          if (!pendingLocalEditRef.current) {
            const loadedSettings: Omit<
              StoreSettings,
              'ownerId' | 'createdAt' | 'updatedAt'
            > = {
              storeName: data.storeName || DEFAULT_STORE_SETTINGS.storeName,
              tagline: data.tagline ?? DEFAULT_STORE_SETTINGS.tagline,
              ownerName: data.ownerName ?? DEFAULT_STORE_SETTINGS.ownerName,
              phone: data.phone ?? DEFAULT_STORE_SETTINGS.phone,
              address: data.address ?? DEFAULT_STORE_SETTINGS.address,
              bankAccountInfo:
                data.bankAccountInfo ?? DEFAULT_STORE_SETTINGS.bankAccountInfo,
              invoiceFooterNote:
                data.invoiceFooterNote ?? DEFAULT_STORE_SETTINGS.invoiceFooterNote,
              themeColor: data.themeColor || 'slate',
              themeMode: data.themeMode === 'dark' ? 'dark' : 'light',
              logoDataUrl: data.logoDataUrl ?? '',
              customStoreUrl:
                data.customStoreUrl ?? DEFAULT_STORE_SETTINGS.customStoreUrl,
              customSlug: data.customSlug ?? DEFAULT_STORE_SETTINGS.customSlug,
              activeCashierName:
                data.activeCashierName ??
                DEFAULT_STORE_SETTINGS.activeCashierName,
              cashierList:
                Array.isArray(data.cashierList) && data.cashierList.length > 0
                  ? data.cashierList
                  : DEFAULT_STORE_SETTINGS.cashierList,
              appAuthEmail: data.appAuthEmail ?? '',
              appAuthPhone: data.appAuthPhone ?? '',
              appAuthPasswordHash: data.appAuthPasswordHash ?? '',
              appAuthVerified: Boolean(data.appAuthVerified),
              autoSaveEnabled:
                typeof data.autoSaveEnabled === 'boolean'
                  ? data.autoSaveEnabled
                  : true,
              lastActiveTab: data.lastActiveTab || 'DASHBOARD',
              lastSavedLabel: data.lastSavedLabel || 'Tersimpan di Cloud',
            };
            setStoreSettings(loadedSettings);

            // Sync appAuth credentials to localStorage so App Login screen always recognizes them
            if (data.appAuthEmail && data.appAuthPasswordHash) {
              try {
                localStorage.setItem(
                  LOCAL_APP_AUTH_KEY,
                  JSON.stringify({
                    email: data.appAuthEmail,
                    phone: data.appAuthPhone || '',
                    passwordHash: data.appAuthPasswordHash,
                    verified: Boolean(data.appAuthVerified),
                    storeName: data.storeName,
                  })
                );
              } catch {
                // ignore
              }
            }

            if (!initialTabRestoredRef.current && data.lastActiveTab) {
              setActiveTab(data.lastActiveTab);
              initialTabRestoredRef.current = true;
            }
          }
        } else {
          setSettingsDocExists(false);
          initialTabRestoredRef.current = true;
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `settings/${uid}`)
    );

    return () => {
      unsubOrders();
      unsubInventory();
      unsubTransactions();
      unsubPayables();
      unsubStockLogs();
      unsubSettings();
    };
  }, [isAuthReady, user, appPasswordSessionEmail]);

  // Persist StoreSettings to Firebase & LocalStorage (Manual or Autosave)
  const persistSettingsToFirestore = useCallback(
    async (
      settingsToSave: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>,
      existsFlag: boolean
    ) => {
      setSaveStatus('SAVING');
      const timestampLabel = nowTimeLabel();
      const safeCashierList = (
        Array.isArray(settingsToSave.cashierList) &&
        settingsToSave.cashierList.length > 0
          ? settingsToSave.cashierList
          : DEFAULT_STORE_SETTINGS.cashierList || ['Admin Kasir']
      )
        .map((c) => clampString(String(c), 60, 'Kasir'))
        .filter(Boolean)
        .slice(0, 30);

      const sanitizedPayload = {
        storeName: clampString(
          settingsToSave.storeName,
          120,
          DEFAULT_STORE_SETTINGS.storeName
        ),
        tagline: clampString(settingsToSave.tagline, 180, ''),
        ownerName: clampString(settingsToSave.ownerName, 120, ''),
        phone: clampString(settingsToSave.phone, 40, ''),
        address: clampString(settingsToSave.address, 250, ''),
        bankAccountInfo: clampString(settingsToSave.bankAccountInfo, 200, ''),
        invoiceFooterNote: clampString(settingsToSave.invoiceFooterNote, 250, ''),
        themeColor: settingsToSave.themeColor || 'slate',
        themeMode: settingsToSave.themeMode === 'dark' ? 'dark' : 'light',
        logoDataUrl: clampString(settingsToSave.logoDataUrl || '', 145000, ''),
        customStoreUrl: clampString(settingsToSave.customStoreUrl || '', 200, ''),
        customSlug: clampString(settingsToSave.customSlug || '', 80, ''),
        activeCashierName: clampString(
          settingsToSave.activeCashierName || safeCashierList[0] || 'Admin Kasir',
          60,
          'Admin Kasir'
        ),
        cashierList: safeCashierList,
        appAuthEmail: clampString(settingsToSave.appAuthEmail || '', 120, ''),
        appAuthPhone: clampString(settingsToSave.appAuthPhone || '', 40, ''),
        appAuthPasswordHash: clampString(
          settingsToSave.appAuthPasswordHash || '',
          120,
          ''
        ),
        appAuthVerified: Boolean(settingsToSave.appAuthVerified),
        autoSaveEnabled: Boolean(settingsToSave.autoSaveEnabled),
        lastActiveTab: settingsToSave.lastActiveTab || 'DASHBOARD',
        lastSavedLabel: clampString(timestampLabel, 80, timestampLabel),
      };

      // Always save to local snapshot
      saveLocalSnapshot({
        ...settingsToSave,
        ...sanitizedPayload,
        themeMode: sanitizedPayload.themeMode as 'light' | 'dark',
      });

      if (!db || !user || !isOnline) {
        pendingLocalEditRef.current = false;
        setStoreSettings((prev) => ({
          ...prev,
          lastSavedLabel: `${timestampLabel} (Tersimpan Lokal)`,
        }));
        setSaveStatus('SAVED');
        return;
      }

      try {
        if (existsFlag) {
          await updateDoc(doc(db, 'settings', user.uid), {
            ...sanitizedPayload,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(doc(db, 'settings', user.uid), {
            ownerId: user.uid,
            ...sanitizedPayload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          setSettingsDocExists(true);
        }
        pendingLocalEditRef.current = false;
        setStoreSettings((prev) => ({
          ...prev,
          lastSavedLabel: timestampLabel,
        }));
        setSaveStatus('SAVED');
      } catch (error) {
        setPendingCloudSync(true);
        setCloudSyncStatus('OFFLINE_QUEUED');
        try {
          localStorage.setItem(LOCAL_PENDING_SYNC_KEY, 'true');
        } catch {
          // ignore
        }
        setStoreSettings((prev) => ({
          ...prev,
          lastSavedLabel: `${timestampLabel} (Tersimpan Lokal — Menunggu Cloud)`,
        }));
        setSaveStatus('SAVED');
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          handleFirestoreError(error, OperationType.WRITE, `settings/${user.uid}`);
        }
      }
    },
    [user, isOnline, saveLocalSnapshot]
  );

  // Helper to mark pending cloud sync in state & localStorage
  const markPendingCloudSync = useCallback((flag: boolean) => {
    setPendingCloudSync(flag);
    setCloudSyncStatus(flag ? 'OFFLINE_QUEUED' : 'SYNCED');
    try {
      localStorage.setItem(LOCAL_PENDING_SYNC_KEY, flag ? 'true' : 'false');
    } catch {
      // ignore
    }
  }, []);

  // Create an Offline Local Backup Snapshot (Manual Local Save or 1-Hour Offline Autobackup)
  const createOfflineLocalBackupSnapshot = useCallback(
    (
      trigger: OfflineBackupTrigger = 'MANUAL_LOCAL',
      customState?: {
        settings?: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>;
        ordersList?: PrintOrder[];
        inventoryList?: InventoryItem[];
        txList?: CashTransaction[];
        payablesList?: SupplierPayable[];
        logsList?: StockMutationLog[];
      }
    ) => {
      const targetSettings = customState?.settings || storeSettings;
      const targetOrders = customState?.ordersList || orders;
      const targetInventory = customState?.inventoryList || inventory;
      const targetTx = customState?.txList || transactions;
      const targetPayables = customState?.payablesList || payables;
      const targetLogs = customState?.logsList || stockLogs;

      const nowMs = Date.now();
      const timeLabel = nowTimeLabel();
      const offlineMins = offlineSinceMs
        ? Math.max(0, Math.floor((nowMs - offlineSinceMs) / 60000))
        : 0;

      const triggerLabel =
        trigger === 'HOURLY_OFFLINE_AUTO'
          ? 'Autobackup Offline 1 Jam'
          : trigger === 'IMPORT_FILE'
          ? 'Restore File Backup'
          : 'Simpan Offline Manual';

      const updatedSettings = {
        ...targetSettings,
        lastActiveTab: activeTab,
        lastSavedLabel: `${timeLabel} (${triggerLabel})`,
      };

      setStoreSettings(updatedSettings);
      saveLocalSnapshot(
        updatedSettings,
        targetOrders,
        targetInventory,
        targetTx,
        targetPayables,
        targetLogs
      );

      const newRecord: OfflineLocalBackupRecord = {
        id: `bkp_${nowMs}`,
        createdAtIso: new Date(nowMs).toISOString(),
        timeLabel,
        trigger,
        triggerLabel,
        offlineDurationMinutes: offlineMins,
        syncedToCloud: Boolean(isOnline && user && !pendingCloudSync),
        syncedAtLabel:
          isOnline && user && !pendingCloudSync ? timeLabel : undefined,
        counts: {
          orders: targetOrders.length,
          inventory: targetInventory.length,
          transactions: targetTx.length,
          payables: targetPayables.length,
          stockLogs: targetLogs.length,
        },
        snapshot: {
          storeSettings: updatedSettings,
          orders: targetOrders,
          inventory: targetInventory,
          transactions: targetTx,
          payables: targetPayables,
          stockLogs: targetLogs,
          activeTab,
        },
      };

      setOfflineBackupHistory((prev) => {
        const nextHistory = [newRecord, ...prev].slice(0, 12);
        try {
          localStorage.setItem(
            LOCAL_OFFLINE_BACKUPS_KEY,
            JSON.stringify(nextHistory)
          );
        } catch {
          // If quota tight, keep latest 5
          try {
            localStorage.setItem(
              LOCAL_OFFLINE_BACKUPS_KEY,
              JSON.stringify(nextHistory.slice(0, 5))
            );
          } catch {
            // ignore
          }
        }
        return nextHistory;
      });

      if (!isOnline || !user) {
        markPendingCloudSync(true);
      }

      if (trigger === 'HOURLY_OFFLINE_AUTO') {
        setLastOfflineAutoBackupMs(nowMs);
        try {
          localStorage.setItem(LOCAL_LAST_AUTOBACKUP_KEY, String(nowMs));
        } catch {
          // ignore
        }
        setOfflineSyncNotice({
          type: 'WARNING',
          text: `Autobackup Lokal Offline (1 Jam) berhasil disimpan otomatis (${timeLabel}). Seluruh data akan otomatis disimpan ke Cloud Firebase saat koneksi internet terdeteksi kembali.`,
        });
      } else if (trigger === 'MANUAL_LOCAL') {
        setOfflineSyncNotice({
          type: 'INFO',
          text: isOnline
            ? `Keadaan aplikasi berhasil disimpan ke Memori Offline Lokal (${timeLabel}).`
            : `Keadaan aplikasi berhasil disimpan ke Memori Offline Lokal (${timeLabel}) dan masuk antrean sinkronisasi otomatis ke Cloud Firebase saat internet kembali normal.`,
        });
      }
      setSaveStatus('SAVED');
    },
    [
      storeSettings,
      orders,
      inventory,
      transactions,
      payables,
      stockLogs,
      activeTab,
      offlineSinceMs,
      isOnline,
      user,
      pendingCloudSync,
      saveLocalSnapshot,
      markPendingCloudSync,
    ]
  );

  // Sync Local State & Offline Backups Automatically to Cloud Firebase when Internet Returns
  const syncLocalStateToFirebaseCloud = useCallback(
    async (reason: 'AUTO_RECONNECT' | 'MANUAL_SYNC' = 'MANUAL_SYNC') => {
      if (!db || !user || !navigator.onLine || isSyncingCloudRef.current) {
        setCloudSyncStatus('IDLE');
        return;
      }
      isSyncingCloudRef.current = true;
      setCloudSyncStatus('SYNCING');
      const syncTimeLabel = nowTimeLabel();

      if (reason === 'AUTO_RECONNECT') {
        setOfflineSyncNotice({
          type: 'INFO',
          text: 'Koneksi internet normal kembali terdeteksi — Menyinkronkan data & backup lokal offline ke Cloud Firebase secara otomatis...',
        });
      }

      try {
        const uid = user.uid;

        // Read existing IDs in Firestore to distinguish create vs update per security rules
        const [ordSnap, invSnap, txSnap, paySnap, logSnap] = await Promise.all([
          getDocs(query(collection(db, 'orders'), where('ownerId', '==', uid))),
          getDocs(
            query(collection(db, 'inventory'), where('ownerId', '==', uid))
          ),
          getDocs(
            query(collection(db, 'transactions'), where('ownerId', '==', uid))
          ),
          getDocs(
            query(collection(db, 'payables'), where('ownerId', '==', uid))
          ),
          getDocs(
            query(collection(db, 'stockLogs'), where('ownerId', '==', uid))
          ),
        ]);

        const existingOrdMap = new Map<string, PrintOrder>();
        ordSnap.docs.forEach((d) =>
          existingOrdMap.set(d.id, { id: d.id, ...d.data() } as PrintOrder)
        );
        const existingInvIds = new Set(invSnap.docs.map((d) => d.id));
        const existingTxIds = new Set(txSnap.docs.map((d) => d.id));
        const existingPayMap = new Map<string, SupplierPayable>();
        paySnap.docs.forEach((d) =>
          existingPayMap.set(d.id, { id: d.id, ...d.data() } as SupplierPayable)
        );
        const existingLogIds = new Set(logSnap.docs.map((d) => d.id));

        // 1. Sync Inventory
        for (const item of inventory) {
          const cleanPayload = {
            ownerId: uid,
            sku: sanitizeSku(item.sku, 40, 'SKU-001'),
            name: clampString(item.name, 140, 'Bahan Baku'),
            category: item.category,
            unit: item.unit,
            stockQty: Math.max(0, Number(item.stockQty) || 0),
            minStockQty: Math.max(0, Number(item.minStockQty) || 0),
            costPerUnit: Math.max(0, Number(item.costPerUnit) || 0),
            defaultSellPrice: Math.max(0, Number(item.defaultSellPrice) || 0),
            supplierName: clampString(item.supplierName, 120, 'Supplier Umum'),
            location: clampString(item.location, 80, 'Gudang'),
          };
          if (!existingInvIds.has(item.id)) {
            await setDoc(doc(db, 'inventory', item.id), {
              ...cleanPayload,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            const { ownerId: _o, ...updateFields } = cleanPayload;
            await updateDoc(doc(db, 'inventory', item.id), {
              ...updateFields,
              updatedAt: serverTimestamp(),
            });
          }
        }

        // 2. Sync Orders
        for (const ord of orders) {
          const cleanInvoice = sanitizeCode(
            ord.invoiceNumber,
            40,
            `SPK-${Date.now()}`
          );
          const cleanOrdPayload = {
            ownerId: uid,
            invoiceNumber: cleanInvoice,
            orderDate: (ord.orderDate || todayISO()).slice(0, 10),
            deadlineDate: (ord.deadlineDate || todayISO()).slice(0, 10),
            customerName: clampString(ord.customerName, 120, 'Pelanggan Umum'),
            customerPhone: clampString(ord.customerPhone, 30, ''),
            jobTitle: clampString(ord.jobTitle, 160, 'Cetakan Digital'),
            category: ord.category,
            materialId: clampString(ord.materialId, 128, 'MANUAL'),
            materialName: clampString(ord.materialName, 120, 'Bahan Cetak'),
            unitType: ord.unitType,
            widthM: Math.max(0, Number(ord.widthM) || 0),
            heightM: Math.max(0, Number(ord.heightM) || 0),
            qty: Math.max(1, Number(ord.qty) || 1),
            totalAreaOrQty: Math.max(0, Number(ord.totalAreaOrQty) || 0),
            unitPrice: Math.max(0, Number(ord.unitPrice) || 0),
            unitCost: Math.max(0, Number(ord.unitCost) || 0),
            designFee: Math.max(0, Number(ord.designFee) || 0),
            finishingDesc: clampString(ord.finishingDesc, 160, ''),
            finishingFee: Math.max(0, Number(ord.finishingFee) || 0),
            discount: Math.max(0, Number(ord.discount) || 0),
            totalAmount: Math.max(0, Number(ord.totalAmount) || 0),
            totalCogs: Math.max(0, Number(ord.totalCogs) || 0),
            paidAmount: Math.max(0, Number(ord.paidAmount) || 0),
            paymentStatus: ord.paymentStatus,
            paymentMethod: ord.paymentMethod,
            productionStatus: ord.productionStatus,
            notes: clampString(ord.notes, 300, ''),
            cashierName: clampString(
              ord.cashierName || 'Admin Kasir',
              60,
              'Admin Kasir'
            ),
            ...(ord.cartItemsJson
              ? { cartItemsJson: clampString(ord.cartItemsJson, 10000, '') }
              : {}),
          };
          const existingOrd = existingOrdMap.get(ord.id);
          if (!existingOrd) {
            await setDoc(doc(db, 'orders', ord.id), {
              ...cleanOrdPayload,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else if (existingOrd.productionStatus !== 'Dibatalkan') {
            const {
              ownerId: _o,
              invoiceNumber: _inv,
              orderDate: _od,
              ...editableOrdFields
            } = cleanOrdPayload;
            await updateDoc(doc(db, 'orders', ord.id), {
              ...editableOrdFields,
              updatedAt: serverTimestamp(),
            });
          }
        }

        // 3. Sync Transactions
        for (const tx of transactions) {
          const cleanTxPayload = {
            ownerId: uid,
            txDate: (tx.txDate || todayISO()).slice(0, 10),
            referenceNo: clampString(tx.referenceNo, 50, 'KAS-001'),
            type: tx.type,
            pnlGroup: tx.pnlGroup,
            description: clampString(tx.description, 200, 'Transaksi Kas'),
            amount: Math.max(0, Number(tx.amount) || 0),
            paymentMethod: tx.paymentMethod,
            relatedId: clampString(tx.relatedId || '', 128, ''),
          };
          if (!existingTxIds.has(tx.id)) {
            await setDoc(doc(db, 'transactions', tx.id), {
              ...cleanTxPayload,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            const { ownerId: _o, ...editableTxFields } = cleanTxPayload;
            await updateDoc(doc(db, 'transactions', tx.id), {
              ...editableTxFields,
              updatedAt: serverTimestamp(),
            });
          }
        }

        // 4. Sync Payables
        for (const pay of payables) {
          const cleanPayPayload = {
            ownerId: uid,
            supplierName: clampString(pay.supplierName, 120, 'Supplier'),
            supplierPhone: clampString(pay.supplierPhone || '', 30, ''),
            invoiceNo: clampString(pay.invoiceNo, 50, 'FAK-001'),
            txDate: (pay.txDate || todayISO()).slice(0, 10),
            dueDate: (pay.dueDate || todayISO()).slice(0, 10),
            itemSummary: clampString(
              pay.itemSummary,
              200,
              'Pembelian Bahan'
            ),
            totalAmount: Math.max(0, Number(pay.totalAmount) || 0),
            paidAmount: Math.max(0, Number(pay.paidAmount) || 0),
            status: pay.status,
          };
          const existingPay = existingPayMap.get(pay.id);
          if (!existingPay) {
            await setDoc(doc(db, 'payables', pay.id), {
              ...cleanPayPayload,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else if (existingPay.status !== 'Lunas') {
            const { ownerId: _o, ...editablePayFields } = cleanPayPayload;
            await updateDoc(doc(db, 'payables', pay.id), {
              ...editablePayFields,
              updatedAt: serverTimestamp(),
            });
          }
        }

        // 5. Sync StockLogs
        for (const log of stockLogs) {
          if (!existingLogIds.has(log.id)) {
            await setDoc(doc(db, 'stockLogs', log.id), {
              ownerId: uid,
              logDate: (log.logDate || todayISO()).slice(0, 10),
              materialId: clampString(log.materialId, 128, 'MANUAL'),
              materialName: clampString(log.materialName, 140, 'Bahan'),
              mutationType: log.mutationType,
              qtyDelta: Number(log.qtyDelta) || 0,
              resultingStock: Math.max(0, Number(log.resultingStock) || 0),
              unit: clampString(log.unit, 20, 'm2'),
              referenceInfo: clampString(
                log.referenceInfo,
                160,
                'Mutasi Stok'
              ),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }

        // 6. Sync StoreSettings
        await persistSettingsToFirestore(
          {
            ...storeSettings,
            lastActiveTab: activeTab,
            lastSavedLabel: `${syncTimeLabel} (Auto-Sync Cloud)`,
          },
          settingsDocExists
        );

        // Mark all local backups as synced to Cloud Firebase
        markPendingCloudSync(false);
        setOfflineBackupHistory((prev) => {
          const updated = prev.map((rec) => ({
            ...rec,
            syncedToCloud: true,
            syncedAtLabel: syncTimeLabel,
          }));
          try {
            localStorage.setItem(
              LOCAL_OFFLINE_BACKUPS_KEY,
              JSON.stringify(updated)
            );
          } catch {
            // ignore
          }
          return updated;
        });

        setOfflineSyncNotice({
          type: 'SUCCESS',
          text:
            reason === 'AUTO_RECONNECT'
              ? `Koneksi Internet Normal Kembali: Seluruh perubahan & backup lokal offline telah otomatis disimpan ke Cloud Firebase (${syncTimeLabel}).`
              : `Sinkronisasi Berhasil: Seluruh data & backup lokal telah disimpan ke Cloud Firebase (${syncTimeLabel}).`,
        });
      } catch {
        setCloudSyncStatus('OFFLINE_QUEUED');
      } finally {
        isSyncingCloudRef.current = false;
      }
    },
    [
      user,
      inventory,
      orders,
      transactions,
      payables,
      stockLogs,
      storeSettings,
      activeTab,
      settingsDocExists,
      persistSettingsToFirestore,
      markPendingCloudSync,
    ]
  );

  // Monitor Internet Connectivity (Online / Offline Events) & Trigger Auto-Sync When Back Online
  useEffect(() => {
    const handleOffline = () => {
      const now = Date.now();
      setIsOnline(false);
      setOfflineTickNowMs(now);
      setOfflineSinceMs((prev) => {
        const since = prev ?? now;
        try {
          localStorage.setItem(LOCAL_OFFLINE_SINCE_KEY, String(since));
        } catch {
          // ignore
        }
        return since;
      });
      markPendingCloudSync(true);
      setOfflineSyncNotice({
        type: 'WARNING',
        text: 'Koneksi internet tidak terdeteksi (Mode Offline Aktif). Aplikasi otomatis menyimpan perubahan secara lokal dan menjalankan Autobackup Lokal tiap 1 jam, lalu otomatis menyinkronkan ke Cloud Firebase saat internet normal kembali.',
      });
    };

    const handleOnline = () => {
      setIsOnline(true);
      setOfflineSinceMs(null);
      try {
        localStorage.removeItem(LOCAL_OFFLINE_SINCE_KEY);
      } catch {
        // ignore
      }
      if (user) {
        syncLocalStateToFirebaseCloud('AUTO_RECONNECT');
      } else {
        setOfflineSyncNotice({
          type: 'INFO',
          text: 'Koneksi internet kembali normal. Masuk dengan akun Google Cloud jika ingin menyinkronkan backup lokal ke Firebase.',
        });
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [user, markPendingCloudSync, syncLocalStateToFirebaseCloud]);

  // Also trigger Auto-Sync if user signs in while online and there is a pending offline backup
  useEffect(() => {
    if (isAuthReady && user && isOnline && pendingCloudSync && !dataLoading) {
      syncLocalStateToFirebaseCloud('AUTO_RECONNECT');
    }
  }, [
    isAuthReady,
    user,
    isOnline,
    pendingCloudSync,
    dataLoading,
    syncLocalStateToFirebaseCloud,
  ]);

  // Hourly Offline Local Autobackup Timer (Runs every 15s while offline; triggers backup every 1 hour without internet)
  useEffect(() => {
    if (isOnline) return;

    const intervalId = setInterval(() => {
      const now = Date.now();
      setOfflineTickNowMs(now);

      if (!offlineAutoBackupEnabled) return;
      const baseRefTime = lastOfflineAutoBackupMs ?? offlineSinceMs ?? now;
      if (now - baseRefTime >= ONE_HOUR_MS) {
        createOfflineLocalBackupSnapshot('HOURLY_OFFLINE_AUTO');
      }
    }, 15000);

    return () => clearInterval(intervalId);
  }, [
    isOnline,
    offlineAutoBackupEnabled,
    lastOfflineAutoBackupMs,
    offlineSinceMs,
    createOfflineLocalBackupSnapshot,
  ]);

  const offlineElapsedMinutes =
    !isOnline && offlineSinceMs
      ? Math.max(0, Math.floor((offlineTickNowMs - offlineSinceMs) / 60000))
      : 0;

  const minutesUntilNextAutoBackup = (() => {
    if (isOnline || !offlineSinceMs) return 60;
    const baseRef = lastOfflineAutoBackupMs ?? offlineSinceMs;
    const elapsedMs = Math.max(0, offlineTickNowMs - baseRef);
    const remainingMs = Math.max(0, ONE_HOUR_MS - (elapsedMs % ONE_HOUR_MS));
    return Math.max(1, Math.ceil(remainingMs / 60000));
  })();

  const handleToggleOfflineAutoBackup = (enabled: boolean) => {
    setOfflineAutoBackupEnabled(enabled);
    try {
      localStorage.setItem(
        LOCAL_AUTOBACKUP_ENABLED_KEY,
        enabled ? 'true' : 'false'
      );
    } catch {
      // ignore
    }
  };

  // Download Full Offline Backup as .json File to Local Drive
  const handleDownloadOfflineBackupFile = () => {
    createOfflineLocalBackupSnapshot('MANUAL_LOCAL');
    const payload = {
      app: 'CetakPro Digital Printing Ledger',
      exportedAt: new Date().toISOString(),
      timeLabel: nowTimeLabel(),
      storeSettings,
      orders,
      inventory,
      transactions,
      payables,
      stockLogs,
      activeTab,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeSlug = (storeSettings.customSlug || 'cetakpro')
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-');
    a.href = url;
    a.download = `backup-lokal-${safeSlug}-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Import / Restore from Local .json Backup File
  const handleImportOfflineBackupFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(String(event.target?.result || '{}'));
        const snap = parsed.snapshot || parsed;
        if (!Array.isArray(snap.orders) && !Array.isArray(snap.inventory)) {
          setOfflineSyncNotice({
            type: 'WARNING',
            text: 'Format file backup JSON tidak dikenali.',
          });
          return;
        }
        const restoredOrders = Array.isArray(snap.orders) ? snap.orders : orders;
        const restoredInv = Array.isArray(snap.inventory)
          ? snap.inventory
          : inventory;
        const restoredTx = Array.isArray(snap.transactions)
          ? snap.transactions
          : transactions;
        const restoredPay = Array.isArray(snap.payables)
          ? snap.payables
          : payables;
        const restoredLogs = Array.isArray(snap.stockLogs)
          ? snap.stockLogs
          : stockLogs;
        const restoredSettings = snap.storeSettings
          ? { ...storeSettings, ...snap.storeSettings }
          : storeSettings;

        setOrders(restoredOrders);
        setInventory(restoredInv);
        setTransactions(restoredTx);
        setPayables(restoredPay);
        setStockLogs(restoredLogs);
        setStoreSettings(restoredSettings);

        createOfflineLocalBackupSnapshot('IMPORT_FILE', {
          settings: restoredSettings,
          ordersList: restoredOrders,
          inventoryList: restoredInv,
          txList: restoredTx,
          payablesList: restoredPay,
          logsList: restoredLogs,
        });
        markPendingCloudSync(true);

        setOfflineSyncNotice({
          type: 'SUCCESS',
          text: `File backup "${file.name}" berhasil dipulihkan (${restoredOrders.length} SPK, ${restoredInv.length} SKU, ${restoredTx.length} Kas).`,
        });

        if (user && isOnline) {
          setTimeout(() => {
            syncLocalStateToFirebaseCloud('MANUAL_SYNC');
          }, 500);
        }
      } catch {
        setOfflineSyncNotice({
          type: 'WARNING',
          text: 'Gagal membaca file backup lokal (.json). Pastikan file valid.',
        });
      }
    };
    reader.readAsText(file);
  };

  // Restore from a saved OfflineLocalBackupRecord in history
  const handleRestoreFromBackupRecord = (record: OfflineLocalBackupRecord) => {
    const { snapshot } = record;
    setOrders(snapshot.orders || []);
    setInventory(snapshot.inventory || []);
    setTransactions(snapshot.transactions || []);
    setPayables(snapshot.payables || []);
    setStockLogs(snapshot.stockLogs || []);
    if (snapshot.storeSettings) {
      setStoreSettings((prev) => ({
        ...prev,
        ...snapshot.storeSettings,
        lastSavedLabel: `${nowTimeLabel()} (Dipulihkan dari ${record.timeLabel})`,
      }));
    }
    saveLocalSnapshot(
      snapshot.storeSettings || storeSettings,
      snapshot.orders || [],
      snapshot.inventory || [],
      snapshot.transactions || [],
      snapshot.payables || [],
      snapshot.stockLogs || []
    );
    markPendingCloudSync(true);
    setOfflineSyncNotice({
      type: 'SUCCESS',
      text: `Keadaan aplikasi berhasil dipulihkan dari titik backup "${record.triggerLabel}" (${record.timeLabel}).`,
    });
    if (user && isOnline) {
      setTimeout(() => {
        syncLocalStateToFirebaseCloud('MANUAL_SYNC');
      }, 400);
    }
  };

  const handleDeleteBackupRecord = (id: string) => {
    setOfflineBackupHistory((prev) => {
      const next = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem(LOCAL_OFFLINE_BACKUPS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Update Settings Field Handler (triggers Autosave if enabled)
  const handleUpdateSettingsField = <
    K extends keyof Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>
  >(
    field: K,
    value: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>[K]
  ) => {
    pendingLocalEditRef.current = true;
    setStoreSettings((prev) => {
      const next = { ...prev, [field]: value };
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      if (next.autoSaveEnabled) {
        setSaveStatus('SAVING');
        autoSaveTimerRef.current = setTimeout(() => {
          persistSettingsToFirestore(next, settingsDocExists);
        }, 700);
      } else {
        setSaveStatus('UNSAVED');
      }
      return next;
    });
  };

  // Cashier Handlers for Kasir & SPK Menu
  const activeCashierList =
    Array.isArray(storeSettings.cashierList) &&
    storeSettings.cashierList.length > 0
      ? storeSettings.cashierList
      : DEFAULT_STORE_SETTINGS.cashierList || ['Admin Kasir'];

  const activeCashierName =
    storeSettings.activeCashierName || activeCashierList[0] || 'Admin Kasir';

  const handleAddCashierName = (newName: string) => {
    const cleaned = clampString(newName, 60, '');
    if (!cleaned) return;
    const exists = activeCashierList.some(
      (c) => c.toLowerCase() === cleaned.toLowerCase()
    );
    const nextList = exists
      ? activeCashierList
      : [...activeCashierList, cleaned].slice(0, 30);

    pendingLocalEditRef.current = true;
    setStoreSettings((prev) => {
      const next = {
        ...prev,
        cashierList: nextList,
        activeCashierName: cleaned,
      };
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      persistSettingsToFirestore(next, settingsDocExists);
      return next;
    });
  };

  const handleRemoveCashierName = (targetName: string) => {
    if (activeCashierList.length <= 1) return;
    const nextList = activeCashierList.filter((c) => c !== targetName);
    const nextActive =
      activeCashierName === targetName
        ? nextList[0] || 'Admin Kasir'
        : activeCashierName;

    pendingLocalEditRef.current = true;
    setStoreSettings((prev) => {
      const next = {
        ...prev,
        cashierList: nextList,
        activeCashierName: nextActive,
      };
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      persistSettingsToFirestore(next, settingsDocExists);
      return next;
    });
  };

  // Switch Navigation Tab & Autosave Last Active State if Autosave is enabled
  const handleSwitchTab = (nextTab: NavTab) => {
    setActiveTab(nextTab);
    if (storeSettings.autoSaveEnabled) {
      const nextSettings = { ...storeSettings, lastActiveTab: nextTab };
      setStoreSettings(nextSettings);
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = setTimeout(() => {
        persistSettingsToFirestore(nextSettings, settingsDocExists);
      }, 850);
    }
  };

  // Manual Save Button Handler ("Simpan Semua Keadaan")
  const handleManualSaveToFirebase = async () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    const nextSettings = {
      ...storeSettings,
      lastActiveTab: activeTab,
    };
    setStoreSettings(nextSettings);
    await persistSettingsToFirestore(nextSettings, settingsDocExists);
  };

  // Partial Reset Handler
  const handleResetPartialData = async (targets: ResetTargets) => {
    if (!user) {
      if (targets.orders) setOrders([]);
      if (targets.transactions) setTransactions([]);
      if (targets.payables) setPayables([]);
      if (targets.stockLogs) setStockLogs([]);
      if (targets.inventory) setInventory([]);
      await persistSettingsToFirestore(storeSettings, settingsDocExists);
      return;
    }
    try {
      if (targets.orders) {
        for (const o of orders) {
          await deleteDoc(doc(db, 'orders', o.id));
        }
      }
      if (targets.transactions) {
        for (const t of transactions) {
          await deleteDoc(doc(db, 'transactions', t.id));
        }
      }
      if (targets.payables) {
        for (const p of payables) {
          await deleteDoc(doc(db, 'payables', p.id));
        }
      }
      if (targets.stockLogs) {
        for (const l of stockLogs) {
          await deleteDoc(doc(db, 'stockLogs', l.id));
        }
      }
      if (targets.inventory) {
        for (const i of inventory) {
          await deleteDoc(doc(db, 'inventory', i.id));
        }
      }
      await persistSettingsToFirestore(storeSettings, settingsDocExists);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'partialReset');
    }
  };

  // Full Factory Reset Handler
  const handleResetFullData = async () => {
    const resetSettings = {
      ...DEFAULT_STORE_SETTINGS,
      lastSavedLabel: nowTimeLabel(),
    };
    if (!user) {
      setOrders([]);
      setTransactions([]);
      setPayables([]);
      setStockLogs([]);
      setInventory([]);
      setStoreSettings(resetSettings);
      saveLocalSnapshot(resetSettings, [], [], [], [], []);
      return;
    }
    try {
      for (const o of orders) {
        await deleteDoc(doc(db, 'orders', o.id));
      }
      for (const t of transactions) {
        await deleteDoc(doc(db, 'transactions', t.id));
      }
      for (const p of payables) {
        await deleteDoc(doc(db, 'payables', p.id));
      }
      for (const l of stockLogs) {
        await deleteDoc(doc(db, 'stockLogs', l.id));
      }
      for (const i of inventory) {
        await deleteDoc(doc(db, 'inventory', i.id));
      }
      setStoreSettings(resetSettings);
      await persistSettingsToFirestore(resetSettings, settingsDocExists);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'fullReset');
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      const res = await googleSignIn(false);
      if (res?.user) {
        setUser(res.user);
      }
      if (res?.accessToken) {
        setDriveAccessToken(res.accessToken);
      }
      setIsAuthReady(true);
      setIsScreenLocked(false);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Gagal masuk dengan Google.'
      );
    }
  };

  const handleConnectGoogleDriveToken = async (): Promise<string | null> => {
    try {
      const res = await googleSignIn(false);
      if (res?.user) {
        setUser(res.user);
      }
      if (res?.accessToken) {
        setDriveAccessToken(res.accessToken);
        return res.accessToken;
      }
      return null;
    } catch (error) {
      console.error('Gagal menghubungkan Google Drive:', error);
      throw error;
    }
  };

  const handleBuildDriveSyncPayload = useCallback(
    (includeFullLedger: boolean): DriveSettingsSyncPayload => {
      const syncedAtLabel = nowTimeLabel();
      return {
        app: 'CetakPro Digital Printing Ledger',
        schemaVersion: 2,
        syncedAtIso: new Date().toISOString(),
        syncedAtLabel,
        storeSettings: {
          ...storeSettings,
          lastActiveTab: activeTab,
          lastSavedLabel: `${syncedAtLabel} (Google Drive Sync)`,
        },
        preferences: {
          printPaperSize,
          offlineAutoBackupEnabled,
          preferredExternalCameraId: getSavedPreferredExternalCameraId(),
          remotePhoneSendMode: getSavedRemotePhoneSendMode(),
          desktopCameraSessionCode: getOrCreateDesktopCameraSessionCode(),
          googleDriveAutoSyncEnabled: true,
        },
        includesFullLedger: includeFullLedger,
        counts: {
          orders: orders.length,
          inventory: inventory.length,
          transactions: transactions.length,
          payables: payables.length,
          stockLogs: stockLogs.length,
        },
        ...(includeFullLedger
          ? {
              orders,
              inventory,
              transactions,
              payables,
              stockLogs,
            }
          : {}),
      };
    },
    [
      storeSettings,
      activeTab,
      printPaperSize,
      offlineAutoBackupEnabled,
      orders,
      inventory,
      transactions,
      payables,
      stockLogs,
    ]
  );

  const handleApplyDriveSyncedPayload = useCallback(
    async (payload: DriveSettingsSyncPayload, applyFullLedger: boolean) => {
      const incomingSettings = payload.storeSettings;
      const syncStamp = nowTimeLabel();
      const mergedSettings: Omit<
        StoreSettings,
        'ownerId' | 'createdAt' | 'updatedAt'
      > = {
        ...DEFAULT_STORE_SETTINGS,
        ...storeSettings,
        ...incomingSettings,
        cashierList:
          Array.isArray(incomingSettings.cashierList) &&
          incomingSettings.cashierList.length > 0
            ? incomingSettings.cashierList
            : storeSettings.cashierList,
        lastSavedLabel: `${syncStamp} (Disinkronkan dari Google Drive)`,
      };

      setStoreSettings(mergedSettings);

      // Apply customSlug in URL bar if present
      if (mergedSettings.customSlug) {
        try {
          const slug = mergedSettings.customSlug
            .toLowerCase()
            .replace(/[^a-z0-9-_]/g, '-');
          window.history.replaceState({}, '', `?toko=${slug}`);
        } catch {
          // ignore
        }
      }

      // Sync App-Specific Email & Password Auth to localStorage
      if (mergedSettings.appAuthEmail && mergedSettings.appAuthPasswordHash) {
        try {
          localStorage.setItem(
            LOCAL_APP_AUTH_KEY,
            JSON.stringify({
              email: mergedSettings.appAuthEmail,
              phone: mergedSettings.appAuthPhone || '',
              passwordHash: mergedSettings.appAuthPasswordHash,
              verified: Boolean(mergedSettings.appAuthVerified),
              storeName: mergedSettings.storeName,
            })
          );
        } catch {
          // ignore
        }
      }

      // Apply extra preferences (Paper size, Offline Autobackup, Camera preferences)
      if (payload.preferences) {
        if (payload.preferences.printPaperSize) {
          handleChangePaperSize(payload.preferences.printPaperSize);
        }
        if (typeof payload.preferences.offlineAutoBackupEnabled === 'boolean') {
          handleToggleOfflineAutoBackup(
            payload.preferences.offlineAutoBackupEnabled
          );
        }
        if (typeof payload.preferences.preferredExternalCameraId === 'string') {
          savePreferredExternalCameraId(
            payload.preferences.preferredExternalCameraId
          );
        }
        if (
          payload.preferences.remotePhoneSendMode === 'AUTO_SEND' ||
          payload.preferences.remotePhoneSendMode === 'MANUAL_SEND'
        ) {
          saveRemotePhoneSendMode(payload.preferences.remotePhoneSendMode);
        }
        if (payload.preferences.desktopCameraSessionCode) {
          saveDesktopCameraSessionCode(
            payload.preferences.desktopCameraSessionCode
          );
        }
      }

      let nextOrd = orders;
      let nextInv = inventory;
      let nextTx = transactions;
      let nextPay = payables;
      let nextLogs = stockLogs;

      if (applyFullLedger) {
        if (Array.isArray(payload.orders)) {
          nextOrd = payload.orders;
          setOrders(nextOrd);
        }
        if (Array.isArray(payload.inventory)) {
          const upgraded = ensureUniqueInventoryBarcodes(payload.inventory);
          nextInv = upgraded.items;
          setInventory(nextInv);
        }
        if (Array.isArray(payload.transactions)) {
          nextTx = payload.transactions;
          setTransactions(nextTx);
        }
        if (Array.isArray(payload.payables)) {
          nextPay = payload.payables;
          setPayables(nextPay);
        }
        if (Array.isArray(payload.stockLogs)) {
          nextLogs = payload.stockLogs;
          setStockLogs(nextLogs);
        }
      }

      saveLocalSnapshot(
        mergedSettings,
        nextOrd,
        nextInv,
        nextTx,
        nextPay,
        nextLogs
      );
      await persistSettingsToFirestore(mergedSettings, settingsDocExists);
    },
    [
      storeSettings,
      orders,
      inventory,
      transactions,
      payables,
      stockLogs,
      settingsDocExists,
      saveLocalSnapshot,
      persistSettingsToFirestore,
    ]
  );

  // Handle Login with Application-Specific Email & Password
  const handleAppPasswordLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const emailClean = loginEmail.trim().toLowerCase();
    const passClean = loginPassword.trim();

    if (!emailClean || !passClean) {
      setAuthError('Masukkan email dan password khusus aplikasi Anda.');
      return;
    }

    const inputHash = hashAppPassword(passClean);

    // Check against StoreSettings or localStorage
    let storedAuth: StoredAppAuth | null = null;
    try {
      const raw = localStorage.getItem(LOCAL_APP_AUTH_KEY);
      if (raw) {
        storedAuth = JSON.parse(raw) as StoredAppAuth;
      }
    } catch {
      // ignore
    }

    const targetEmail = (
      storeSettings.appAuthEmail ||
      storedAuth?.email ||
      ''
    ).toLowerCase();
    const targetHash =
      storeSettings.appAuthPasswordHash || storedAuth?.passwordHash || '';

    if (!targetEmail || !targetHash) {
      setAuthError(
        'Belum ada Password Khusus Aplikasi yang terdaftar. Silakan klik tab "Buat Password Aplikasi Baru" di sebelahnya untuk membuat password dengan verifikasi Email/WhatsApp.'
      );
      setLoginCardTab('REGISTER_APP');
      setRegEmail(emailClean);
      return;
    }

    if (emailClean !== targetEmail || inputHash !== targetHash) {
      setAuthError(
        'Email atau Password Khusus Aplikasi tidak sesuai. Pastikan Anda menggunakan password khusus aplikasi ini (bukan password asli email Anda).'
      );
      return;
    }

    // Success! Unlock session
    try {
      sessionStorage.setItem('cetakpro_active_app_session', emailClean);
    } catch {
      // ignore
    }
    setAppPasswordSessionEmail(emailClean);
    setIsScreenLocked(false);
    setLoginPassword('');
  };

  // Handle Registration + OTP Verification of New Application-Specific Password on Login Screen
  const handleSendRegisterOtp = () => {
    setAuthError(null);
    const emailClean = regEmail.trim().toLowerCase();
    const phoneClean = regPhone.trim();
    if (!emailClean || !emailClean.includes('@')) {
      setAuthError('Masukkan alamat email yang valid.');
      return;
    }
    if (!phoneClean || phoneClean.length < 6) {
      setAuthError('Masukkan nomor WhatsApp aktif untuk verifikasi.');
      return;
    }
    if (regPassword.trim().length < 4) {
      setAuthError('Buat password khusus aplikasi minimal 4 karakter.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setAuthError('Konfirmasi password khusus aplikasi belum sama.');
      return;
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    setRegOtpSent(code);
    setRegOtpInput(code);
    setLoginInfoBanner(
      regVerifyMethod === 'WHATSAPP'
        ? `Kode OTP Verifikasi WhatsApp (${phoneClean}): ${code} — Silakan konfirmasi kode di bawah untuk mengaktifkan password aplikasi.`
        : `Kode OTP Verifikasi Email (${emailClean}): ${code} — Silakan konfirmasi kode di bawah untuk mengaktifkan password aplikasi.`
    );
  };

  const handleVerifyAndRegisterAppLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!regOtpSent) {
      handleSendRegisterOtp();
      return;
    }
    if (regOtpInput.trim() !== regOtpSent) {
      setAuthError('Kode OTP verifikasi 6 digit tidak sesuai.');
      return;
    }

    const emailClean = clampString(regEmail.toLowerCase(), 120, '');
    const phoneClean = clampString(regPhone, 40, '');
    const hashed = hashAppPassword(regPassword);

    try {
      localStorage.setItem(
        LOCAL_APP_AUTH_KEY,
        JSON.stringify({
          email: emailClean,
          phone: phoneClean,
          passwordHash: hashed,
          verified: true,
          storeName: storeSettings.storeName,
        })
      );
      sessionStorage.setItem('cetakpro_active_app_session', emailClean);
    } catch {
      // ignore
    }

    const nextSettings = {
      ...storeSettings,
      appAuthEmail: emailClean,
      appAuthPhone: phoneClean,
      appAuthPasswordHash: hashed,
      appAuthVerified: true,
    };
    setStoreSettings(nextSettings);
    saveLocalSnapshot(nextSettings);
    if (user) {
      persistSettingsToFirestore(nextSettings, settingsDocExists);
    }

    setRegOtpSent(null);
    setLoginInfoBanner(null);
    setAppPasswordSessionEmail(emailClean);
    setIsScreenLocked(false);
  };

  // Perform actual sign out after warning modal confirmation
  const executeSignOut = async (saveFirst: boolean) => {
    if (saveFirst) {
      setIsSavingBeforeExit(true);
      try {
        await handleManualSaveToFirebase();
      } finally {
        setIsSavingBeforeExit(false);
      }
    }
    setShowExitWarningModal(false);
    try {
      sessionStorage.removeItem('cetakpro_active_app_session');
    } catch {
      // ignore
    }
    setAppPasswordSessionEmail(null);
    setIsScreenLocked(false);
    if (user) {
      await logout();
    }
  };

  // Seed Sample Digital Printing Dataset
  const handleSeedSampleData = async () => {
    setIsSeeding(true);
    try {
      const ownerKey = user ? user.uid : 'app_local_owner';
      const sample = getSampleDataset(ownerKey);

      if (!user || !db) {
        setInventory(sample.inventory as InventoryItem[]);
        setOrders(sample.orders as PrintOrder[]);
        setTransactions(sample.transactions as CashTransaction[]);
        setPayables(sample.payables as SupplierPayable[]);
        setStockLogs(sample.stockLogs as StockMutationLog[]);
        saveLocalSnapshot(
          storeSettings,
          sample.orders as PrintOrder[],
          sample.inventory as InventoryItem[],
          sample.transactions as CashTransaction[],
          sample.payables as SupplierPayable[],
          sample.stockLogs as StockMutationLog[]
        );
        return;
      }

      for (const item of sample.inventory) {
        const { id, ...rest } = item;
        await setDoc(doc(db, 'inventory', id), {
          ...rest,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      for (const ord of sample.orders) {
        const { id, ...rest } = ord;
        await setDoc(doc(db, 'orders', id), {
          ...rest,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      for (const tx of sample.transactions) {
        const { id, ...rest } = tx;
        await setDoc(doc(db, 'transactions', id), {
          ...rest,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      for (const pay of sample.payables) {
        const { id, ...rest } = pay;
        await setDoc(doc(db, 'payables', id), {
          ...rest,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      for (const log of sample.stockLogs) {
        const { id, ...rest } = log;
        await setDoc(doc(db, 'stockLogs', id), {
          ...rest,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      if (storeSettings.autoSaveEnabled) {
        await persistSettingsToFirestore(storeSettings, settingsDocExists);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'seedSampleData');
    } finally {
      setIsSeeding(false);
    }
  };

  // CRUD Handlers with Defensive Payload Sanitization
  const handleCreateOrder = async (
    orderData: Omit<PrintOrder, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
    deductStock: boolean,
    recordCashTx: boolean
  ): Promise<PrintOrder | void> => {
    const orderId = `ord_${Date.now()}`;
    const ownerKey = user ? user.uid : 'app_local_owner';
    const cleanInvoice = sanitizeCode(
      orderData.invoiceNumber,
      40,
      `SPK-${Date.now()}`
    );
    const orderDocPayload = {
      ownerId: ownerKey,
      invoiceNumber: cleanInvoice,
      orderDate: orderData.orderDate.slice(0, 10),
      deadlineDate: orderData.deadlineDate.slice(0, 10),
      customerName: clampString(orderData.customerName, 120, 'Pelanggan Umum'),
      customerPhone: clampString(orderData.customerPhone, 30, ''),
      jobTitle: clampString(orderData.jobTitle, 160, 'Cetakan Digital'),
      category: orderData.category,
      materialId: clampString(orderData.materialId, 128, 'MANUAL'),
      materialName: clampString(orderData.materialName, 120, 'Bahan Cetak'),
      unitType: orderData.unitType,
      widthM: Math.max(0, Number(orderData.widthM) || 0),
      heightM: Math.max(0, Number(orderData.heightM) || 0),
      qty: Math.max(1, Number(orderData.qty) || 1),
      totalAreaOrQty: Math.max(0, Number(orderData.totalAreaOrQty) || 0),
      unitPrice: Math.max(0, Number(orderData.unitPrice) || 0),
      unitCost: Math.max(0, Number(orderData.unitCost) || 0),
      designFee: Math.max(0, Number(orderData.designFee) || 0),
      finishingDesc: clampString(orderData.finishingDesc, 160, ''),
      finishingFee: Math.max(0, Number(orderData.finishingFee) || 0),
      discount: Math.max(0, Number(orderData.discount) || 0),
      totalAmount: Math.max(0, Number(orderData.totalAmount) || 0),
      totalCogs: Math.max(0, Number(orderData.totalCogs) || 0),
      paidAmount: Math.max(0, Number(orderData.paidAmount) || 0),
      paymentStatus: orderData.paymentStatus,
      paymentMethod: orderData.paymentMethod,
      productionStatus: orderData.productionStatus,
      notes: clampString(orderData.notes, 300, ''),
      cashierName: clampString(
        orderData.cashierName || activeCashierName,
        60,
        'Admin Kasir'
      ),
      ...(orderData.cartItemsJson
        ? { cartItemsJson: clampString(orderData.cartItemsJson, 10000, '') }
        : {}),
    };

    if (!db || !user || !isOnline) {
      const created: PrintOrder = { id: orderId, ...orderDocPayload };
      const nextOrders = [created, ...orders];
      let nextInv = [...inventory];
      let nextLogs = [...stockLogs];
      let nextTx = [...transactions];

      if (deductStock) {
        const orderCartItems = extractOrderCartItems(created);
        for (let idx = 0; idx < orderCartItems.length; idx++) {
          const cItem = orderCartItems[idx];
          if (cItem.materialId && cItem.materialId !== 'MANUAL') {
            nextInv = nextInv.map((mat) => {
              if (mat.id !== cItem.materialId) return mat;
              const newStock = Math.max(
                0,
                Number((mat.stockQty - cItem.totalAreaOrQty).toFixed(2))
              );
              const newLog: StockMutationLog = {
                id: `log_${Date.now()}_${idx}`,
                ownerId: ownerKey,
                logDate: orderData.orderDate.slice(0, 10),
                materialId: mat.id,
                materialName: clampString(mat.name, 140, 'Bahan'),
                mutationType: 'Pemakaian Produksi',
                qtyDelta: -Math.abs(cItem.totalAreaOrQty),
                resultingStock: newStock,
                unit: clampString(mat.unit, 20, 'm2'),
                referenceInfo: clampString(
                  `Produksi ${cleanInvoice} (${cItem.jobTitle}) — ${orderDocPayload.customerName} (Kasir: ${orderDocPayload.cashierName})`,
                  160,
                  cleanInvoice
                ),
              };
              nextLogs = [newLog, ...nextLogs];
              return { ...mat, stockQty: newStock };
            });
          }
        }
      }

      if (recordCashTx && orderData.paidAmount > 0) {
        const cashMethod: CashPaymentMethod =
          orderData.paymentMethod === 'Transfer Bank' ||
          orderData.paymentMethod === 'QRIS'
            ? orderData.paymentMethod
            : 'Tunai';
        const paymentDetail = extractOrderPaymentDetail(orderDocPayload);
        const createdTx: CashTransaction = {
          id: `tx_${Date.now()}`,
          ownerId: ownerKey,
          txDate: orderData.orderDate.slice(0, 10),
          referenceNo: clampString(`KAS-${cleanInvoice}`, 50, 'KAS-IN'),
          type: 'Pemasukan',
          pnlGroup:
            orderData.category === 'Jasa Desain & Servis IT'
              ? 'Pendapatan Jasa & Desain'
              : 'Pendapatan Cetak',
          description: clampString(
            `${
              orderData.paymentStatus === 'Lunas' ? 'Pelunasan' : 'Penerimaan DP'
            } ${cleanInvoice} — ${orderDocPayload.customerName} [${paymentDetail.fullLabel}] (Kasir: ${
              orderDocPayload.cashierName
            })`,
            200,
            'Pendapatan Cetak'
          ),
          amount: Math.max(0, Number(orderData.paidAmount) || 0),
          paymentMethod: cashMethod,
          relatedId: orderId,
        };
        nextTx = [createdTx, ...nextTx];
      }

      setOrders(nextOrders);
      setInventory(nextInv);
      setStockLogs(nextLogs);
      setTransactions(nextTx);
      saveLocalSnapshot(
        storeSettings,
        nextOrders,
        nextInv,
        nextTx,
        payables,
        nextLogs
      );
      markPendingCloudSync(true);
      return created;
    }

    try {
      await setDoc(doc(db, 'orders', orderId), {
        ...orderDocPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (deductStock) {
        const orderCartItems = extractOrderCartItems({
          id: orderId,
          ...orderDocPayload,
        });
        const runningStockMap = new Map<string, number>();
        for (let idx = 0; idx < orderCartItems.length; idx++) {
          const cItem = orderCartItems[idx];
          if (cItem.materialId && cItem.materialId !== 'MANUAL') {
            const mat = inventory.find((i) => i.id === cItem.materialId);
            if (mat) {
              const prevStock = runningStockMap.has(mat.id)
                ? runningStockMap.get(mat.id)!
                : mat.stockQty;
              const newStock = Math.max(
                0,
                Number((prevStock - cItem.totalAreaOrQty).toFixed(2))
              );
              runningStockMap.set(mat.id, newStock);
              await updateDoc(doc(db, 'inventory', mat.id), {
                stockQty: newStock,
                costPerUnit: mat.costPerUnit,
                updatedAt: serverTimestamp(),
              });
              const logId = `log_${Date.now()}_${idx}`;
              await setDoc(doc(db, 'stockLogs', logId), {
                ownerId: user.uid,
                logDate: orderData.orderDate.slice(0, 10),
                materialId: mat.id,
                materialName: clampString(mat.name, 140, 'Bahan'),
                mutationType: 'Pemakaian Produksi',
                qtyDelta: -Math.abs(cItem.totalAreaOrQty),
                resultingStock: newStock,
                unit: clampString(mat.unit, 20, 'm2'),
                referenceInfo: clampString(
                  `Produksi ${cleanInvoice} (${cItem.jobTitle}) — ${orderDocPayload.customerName} (Kasir: ${orderDocPayload.cashierName})`,
                  160,
                  cleanInvoice
                ),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
          }
        }
      }

      if (recordCashTx && orderData.paidAmount > 0) {
        const txId = `tx_${Date.now()}`;
        const cashMethod: CashPaymentMethod =
          orderData.paymentMethod === 'Transfer Bank' ||
          orderData.paymentMethod === 'QRIS'
            ? orderData.paymentMethod
            : 'Tunai';
        const paymentDetail = extractOrderPaymentDetail(orderDocPayload);
        await setDoc(doc(db, 'transactions', txId), {
          ownerId: user.uid,
          txDate: orderData.orderDate.slice(0, 10),
          referenceNo: clampString(`KAS-${cleanInvoice}`, 50, 'KAS-IN'),
          type: 'Pemasukan',
          pnlGroup:
            orderData.category === 'Jasa Desain & Servis IT'
              ? 'Pendapatan Jasa & Desain'
              : 'Pendapatan Cetak',
          description: clampString(
            `${
              orderData.paymentStatus === 'Lunas' ? 'Pelunasan' : 'Penerimaan DP'
            } ${cleanInvoice} — ${orderDocPayload.customerName} [${paymentDetail.fullLabel}] (Kasir: ${
              orderDocPayload.cashierName
            })`,
            200,
            'Pendapatan Cetak'
          ),
          amount: Math.max(0, Number(orderData.paidAmount) || 0),
          paymentMethod: cashMethod,
          relatedId: orderId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      return {
        id: orderId,
        ...orderDocPayload,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `orders/${orderId}`);
    }
  };

  const handleUpdateProductionStatus = async (
    order: PrintOrder,
    nextStatus: ProductionStatus
  ) => {
    if (!db || !user || !isOnline) {
      const next = orders.map((o) =>
        o.id === order.id ? { ...o, productionStatus: nextStatus } : o
      );
      setOrders(next);
      saveLocalSnapshot(storeSettings, next);
      markPendingCloudSync(true);
      return;
    }
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        productionStatus: nextStatus,
        notes: order.notes,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const handleSettleOrderPayment = async (
    order: PrintOrder,
    payAmount: number,
    method: CashPaymentMethod,
    bankTransferLabel?: string
  ) => {
    const newPaid = Math.min(order.totalAmount, order.paidAmount + payAmount);
    const newStatus: PaymentStatus =
      newPaid >= order.totalAmount ? 'Lunas' : 'DP / Belum Lunas';
    const existingDetail = extractOrderPaymentDetail(order);
    const updatedNotes =
      method === 'Transfer Bank' && bankTransferLabel
        ? composeOrderNotesWithPayment(existingDetail.cleanNotes, method, bankTransferLabel)
        : order.notes;
    const paymentTagLabel =
      method === 'Transfer Bank' && bankTransferLabel
        ? `Transfer ${bankTransferLabel}`
        : method;

    if (!db || !user || !isOnline) {
      const nextOrders = orders.map((o) =>
        o.id === order.id
          ? {
              ...o,
              paidAmount: newPaid,
              paymentStatus: newStatus,
              paymentMethod: method,
              notes: updatedNotes,
            }
          : o
      );
      const settleTx: CashTransaction = {
        id: `tx_settle_${Date.now()}`,
        ownerId: user ? user.uid : 'app_local_owner',
        txDate: todayISO(),
        referenceNo: clampString(`LUNAS-${order.invoiceNumber}`, 50, 'KAS-IN'),
        type: 'Pemasukan',
        pnlGroup: 'Pendapatan Cetak',
        description: clampString(
          `Pelunasan Piutang ${order.invoiceNumber} — ${order.customerName} [${paymentTagLabel}] (Kasir: ${activeCashierName})`,
          200,
          'Pelunasan Piutang'
        ),
        amount: Math.max(0, Number(payAmount) || 0),
        paymentMethod: method,
        relatedId: order.id,
      };
      const nextTx = [settleTx, ...transactions];
      setOrders(nextOrders);
      setTransactions(nextTx);
      saveLocalSnapshot(storeSettings, nextOrders, inventory, nextTx);
      markPendingCloudSync(true);
      return;
    }
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        paidAmount: newPaid,
        paymentStatus: newStatus,
        paymentMethod: method,
        updatedAt: serverTimestamp(),
      });

      if (updatedNotes !== order.notes) {
        await updateDoc(doc(db, 'orders', order.id), {
          productionStatus: order.productionStatus,
          notes: updatedNotes,
          updatedAt: serverTimestamp(),
        });
      }

      const txId = `tx_settle_${Date.now()}`;
      await setDoc(doc(db, 'transactions', txId), {
        ownerId: user.uid,
        txDate: todayISO(),
        referenceNo: clampString(`LUNAS-${order.invoiceNumber}`, 50, 'KAS-IN'),
        type: 'Pemasukan',
        pnlGroup: 'Pendapatan Cetak',
        description: clampString(
          `Pelunasan Piutang ${order.invoiceNumber} — ${order.customerName} [${paymentTagLabel}] (Kasir: ${activeCashierName})`,
          200,
          'Pelunasan Piutang'
        ),
        amount: Math.max(0, Number(payAmount) || 0),
        paymentMethod: method,
        relatedId: order.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!user || !db) {
      const next = orders.filter((o) => o.id !== orderId);
      setOrders(next);
      saveLocalSnapshot(storeSettings, next);
      return;
    }
    try {
      await deleteDoc(doc(db, 'orders', orderId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `orders/${orderId}`);
    }
  };

  const handleCreateInventoryItem = async (
    itemData: Omit<InventoryItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => {
    const itemId = `mat_${Date.now()}`;
    const rawCandidateSku = (itemData.sku || '').trim().toUpperCase();
    const isDuplicateOrGeneric =
      !rawCandidateSku ||
      /^[A-Z]{2,4}-\d{1,4}$/.test(rawCandidateSku) ||
      inventory.some(
        (existing) => existing.sku.trim().toUpperCase() === rawCandidateSku
      );

    const uniqueSku = isDuplicateOrGeneric
      ? generateNextAtkSku(inventory, itemData.category, itemData.name)
      : rawCandidateSku;

    const payload = {
      ownerId: user ? user.uid : 'app_local_owner',
      sku: sanitizeSku(
        uniqueSku,
        40,
        generateNextAtkSku(inventory, itemData.category, itemData.name)
      ),
      name: clampString(itemData.name, 140, 'Bahan Baku'),
      category: itemData.category,
      unit: itemData.unit,
      stockQty: Math.max(0, Number(itemData.stockQty) || 0),
      minStockQty: Math.max(0, Number(itemData.minStockQty) || 0),
      costPerUnit: Math.max(0, Number(itemData.costPerUnit) || 0),
      defaultSellPrice: Math.max(0, Number(itemData.defaultSellPrice) || 0),
      supplierName: clampString(itemData.supplierName, 120, 'Supplier Umum'),
      location: clampString(itemData.location, 80, 'Gudang'),
    };
    if (!db || !user || !isOnline) {
      const next = [...inventory, { id: itemId, ...payload }];
      setInventory(next);
      saveLocalSnapshot(storeSettings, orders, next);
      markPendingCloudSync(true);
      return;
    }
    try {
      await setDoc(doc(db, 'inventory', itemId), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `inventory/${itemId}`);
    }
  };

  const handleUpdateInventoryItem = async (
    itemId: string,
    itemData: Omit<InventoryItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => {
    const rawCandidateSku = (itemData.sku || '').trim().toUpperCase();
    const isCollidingWithOther =
      !rawCandidateSku ||
      inventory.some(
        (existing) =>
          existing.id !== itemId &&
          existing.sku.trim().toUpperCase() === rawCandidateSku
      );
    const finalSku = isCollidingWithOther
      ? generateNextAtkSku(
          inventory,
          itemData.category,
          itemData.name,
          undefined,
          itemId
        )
      : rawCandidateSku;

    const cleanUpdates = {
      sku: sanitizeSku(finalSku, 40, 'ATK-HVS4-107'),
      name: clampString(itemData.name, 140, 'Bahan Baku'),
      category: itemData.category,
      unit: itemData.unit,
      stockQty: Math.max(0, Number(itemData.stockQty) || 0),
      minStockQty: Math.max(0, Number(itemData.minStockQty) || 0),
      costPerUnit: Math.max(0, Number(itemData.costPerUnit) || 0),
      defaultSellPrice: Math.max(0, Number(itemData.defaultSellPrice) || 0),
      supplierName: clampString(itemData.supplierName, 120, 'Supplier Umum'),
      location: clampString(itemData.location, 80, 'Gudang'),
    };
    if (!db || !user || !isOnline) {
      const next = inventory.map((item) =>
        item.id === itemId ? { ...item, ...cleanUpdates } : item
      );
      setInventory(next);
      saveLocalSnapshot(storeSettings, orders, next);
      markPendingCloudSync(true);
      return;
    }
    try {
      await updateDoc(doc(db, 'inventory', itemId), {
        ...cleanUpdates,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `inventory/${itemId}`);
    }
  };

  const handleRestockItem = async (params: {
    item: InventoryItem;
    addedQty: number;
    newCostPerUnit: number;
    paymentMode: 'CASH' | 'PAYABLE' | 'NONE';
    cashMethod: CashPaymentMethod;
    invoiceNo: string;
    dueDate: string;
  }) => {
    const {
      item,
      addedQty,
      newCostPerUnit,
      paymentMode,
      cashMethod,
      invoiceNo,
      dueDate,
    } = params;
    const updatedStock = Number((item.stockQty + addedQty).toFixed(2));
    const totalPurchaseCost = Math.round(addedQty * newCostPerUnit);

    if (!db || !user || !isOnline) {
      const nextInv = inventory.map((i) =>
        i.id === item.id
          ? { ...i, stockQty: updatedStock, costPerUnit: newCostPerUnit }
          : i
      );
      setInventory(nextInv);
      saveLocalSnapshot(storeSettings, orders, nextInv);
      markPendingCloudSync(true);
      return;
    }

    try {
      await updateDoc(doc(db, 'inventory', item.id), {
        stockQty: updatedStock,
        costPerUnit: Math.max(0, Number(newCostPerUnit) || item.costPerUnit),
        updatedAt: serverTimestamp(),
      });

      const logId = `log_restock_${Date.now()}`;
      await setDoc(doc(db, 'stockLogs', logId), {
        ownerId: user.uid,
        logDate: todayISO(),
        materialId: item.id,
        materialName: clampString(item.name, 140, 'Bahan'),
        mutationType: 'Stok Masuk (Restock)',
        qtyDelta: Math.abs(addedQty),
        resultingStock: updatedStock,
        unit: clampString(item.unit, 20, 'm2'),
        referenceInfo: clampString(
          `Restock Supplier ${item.supplierName} (${invoiceNo})`,
          160,
          'Restock Supplier'
        ),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (paymentMode === 'CASH' && totalPurchaseCost > 0) {
        const txId = `tx_restock_${Date.now()}`;
        await setDoc(doc(db, 'transactions', txId), {
          ownerId: user.uid,
          txDate: todayISO(),
          referenceNo: clampString(invoiceNo, 50, 'KAS-OUT'),
          type: 'Pengeluaran',
          pnlGroup: 'HPP Bahan & Tinta',
          description: clampString(
            `Belanja Restock ${item.name} (${addedQty} ${item.unit}) — ${item.supplierName}`,
            200,
            'Belanja Restock Bahan'
          ),
          amount: totalPurchaseCost,
          paymentMethod: cashMethod,
          relatedId: item.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else if (paymentMode === 'PAYABLE' && totalPurchaseCost > 0) {
        const payId = `pay_${Date.now()}`;
        await setDoc(doc(db, 'payables', payId), {
          ownerId: user.uid,
          supplierName: clampString(item.supplierName, 120, 'Supplier'),
          supplierPhone: '',
          invoiceNo: clampString(invoiceNo, 50, 'FAK-001'),
          txDate: todayISO(),
          dueDate: dueDate.slice(0, 10),
          itemSummary: clampString(
            `Restock ${addedQty} ${item.unit} ${item.name}`,
            200,
            item.name
          ),
          totalAmount: totalPurchaseCost,
          paidAmount: 0,
          status: 'Belum Lunas',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `inventory/${item.id}`);
    }
  };

  const handleAdjustStock = async (params: {
    item: InventoryItem;
    deltaQty: number;
    mutationType: 'Bahan Rusak / Gagal Cetak' | 'Penyesuaian Opname';
    reason: string;
  }) => {
    const { item, deltaQty, mutationType, reason } = params;
    const updatedStock = Math.max(
      0,
      Number((item.stockQty + deltaQty).toFixed(2))
    );
    if (!db || !user || !isOnline) {
      const nextInv = inventory.map((i) =>
        i.id === item.id ? { ...i, stockQty: updatedStock } : i
      );
      setInventory(nextInv);
      saveLocalSnapshot(storeSettings, orders, nextInv);
      markPendingCloudSync(true);
      return;
    }
    try {
      await updateDoc(doc(db, 'inventory', item.id), {
        stockQty: updatedStock,
        costPerUnit: item.costPerUnit,
        updatedAt: serverTimestamp(),
      });

      const logId = `log_adj_${Date.now()}`;
      await setDoc(doc(db, 'stockLogs', logId), {
        ownerId: user.uid,
        logDate: todayISO(),
        materialId: item.id,
        materialName: clampString(item.name, 140, 'Bahan'),
        mutationType,
        qtyDelta: Number(deltaQty),
        resultingStock: updatedStock,
        unit: clampString(item.unit, 20, 'm2'),
        referenceInfo: clampString(reason, 160, 'Penyesuaian Stok'),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `inventory/${item.id}`);
    }
  };

  const handleDeleteInventoryItem = async (itemId: string) => {
    if (!user || !db) {
      const next = inventory.filter((i) => i.id !== itemId);
      setInventory(next);
      saveLocalSnapshot(storeSettings, orders, next);
      return;
    }
    try {
      await deleteDoc(doc(db, 'inventory', itemId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `inventory/${itemId}`);
    }
  };

  const handleCreateTransaction = async (
    txData: Omit<CashTransaction, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => {
    const txId = `tx_${Date.now()}`;
    const payload = {
      ownerId: user ? user.uid : 'app_local_owner',
      txDate: txData.txDate.slice(0, 10),
      referenceNo: clampString(txData.referenceNo, 50, 'KAS-001'),
      type: txData.type,
      pnlGroup: txData.pnlGroup,
      description: clampString(txData.description, 200, 'Transaksi Kas'),
      amount: Math.max(0, Number(txData.amount) || 0),
      paymentMethod: txData.paymentMethod,
      relatedId: clampString(txData.relatedId, 128, ''),
    };
    if (!db || !user || !isOnline) {
      const next = [{ id: txId, ...payload }, ...transactions];
      setTransactions(next);
      saveLocalSnapshot(storeSettings, orders, inventory, next);
      markPendingCloudSync(true);
      return;
    }
    try {
      await setDoc(doc(db, 'transactions', txId), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `transactions/${txId}`);
    }
  };

  const handleDeleteTransaction = async (txId: string) => {
    if (!user || !db) {
      const next = transactions.filter((t) => t.id !== txId);
      setTransactions(next);
      saveLocalSnapshot(storeSettings, orders, inventory, next);
      return;
    }
    try {
      await deleteDoc(doc(db, 'transactions', txId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `transactions/${txId}`);
    }
  };

  const handleCreatePayable = async (
    payData: Omit<SupplierPayable, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => {
    const payId = `pay_${Date.now()}`;
    const payload = {
      ownerId: user ? user.uid : 'app_local_owner',
      supplierName: clampString(payData.supplierName, 120, 'Supplier'),
      supplierPhone: clampString(payData.supplierPhone, 30, ''),
      invoiceNo: clampString(payData.invoiceNo, 50, 'FAK-001'),
      txDate: payData.txDate.slice(0, 10),
      dueDate: payData.dueDate.slice(0, 10),
      itemSummary: clampString(payData.itemSummary, 200, 'Pembelian Bahan'),
      totalAmount: Math.max(0, Number(payData.totalAmount) || 0),
      paidAmount: Math.max(0, Number(payData.paidAmount) || 0),
      status: payData.status,
    };
    if (!db || !user || !isOnline) {
      const next = [...payables, { id: payId, ...payload }];
      setPayables(next);
      saveLocalSnapshot(storeSettings, orders, inventory, transactions, next);
      markPendingCloudSync(true);
      return;
    }
    try {
      await setDoc(doc(db, 'payables', payId), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `payables/${payId}`);
    }
  };

  const handlePaySupplierPayable = async (
    payable: SupplierPayable,
    payAmount: number,
    method: CashPaymentMethod
  ) => {
    const newPaid = Math.min(payable.totalAmount, payable.paidAmount + payAmount);
    const newStatus: 'Belum Lunas' | 'Lunas' =
      newPaid >= payable.totalAmount ? 'Lunas' : 'Belum Lunas';
    if (!db || !user || !isOnline) {
      const next = payables.map((p) =>
        p.id === payable.id ? { ...p, paidAmount: newPaid, status: newStatus } : p
      );
      setPayables(next);
      saveLocalSnapshot(storeSettings, orders, inventory, transactions, next);
      markPendingCloudSync(true);
      return;
    }
    try {
      await updateDoc(doc(db, 'payables', payable.id), {
        paidAmount: newPaid,
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      const txId = `tx_pay_${Date.now()}`;
      await setDoc(doc(db, 'transactions', txId), {
        ownerId: user.uid,
        txDate: todayISO(),
        referenceNo: clampString(`BYR-${payable.invoiceNo}`, 50, 'KAS-OUT'),
        type: 'Pengeluaran',
        pnlGroup: 'HPP Bahan & Tinta',
        description: clampString(
          `Pembayaran Hutang Supplier ${payable.supplierName} (${payable.invoiceNo})`,
          200,
          'Pembayaran Hutang Supplier'
        ),
        amount: Math.max(0, Number(payAmount) || 0),
        paymentMethod: method,
        relatedId: payable.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `payables/${payable.id}`);
    }
  };

  const handleDeletePayable = async (payableId: string) => {
    if (!user || !db) {
      const next = payables.filter((p) => p.id !== payableId);
      setPayables(next);
      saveLocalSnapshot(storeSettings, orders, inventory, transactions, next);
      return;
    }
    try {
      await deleteDoc(doc(db, 'payables', payableId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `payables/${payableId}`);
    }
  };

  // Standalone Remote Phone Camera Scanner Mode when opened via QR / Link (?atkRemoteSession=XXXXXX)
  if (remoteScannerSessionFromUrl) {
    return (
      <AtkRemotePhoneScannerModal
        initialSessionCode={remoteScannerSessionFromUrl}
        initialSendMode={remoteScannerSendModeFromUrl}
        atkItems={inventory}
        onClose={() => {
          setRemoteScannerSessionFromUrl(null);
          try {
            const url = new URL(window.location.href);
            url.searchParams.delete('atkRemoteSession');
            url.searchParams.delete('sendMode');
            window.history.replaceState({}, '', url.toString());
          } catch {
            // Ignore URL history update error
          }
        }}
      />
    );
  }

  // Loading Auth State
  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-xs text-slate-500">
        Memuat sesi sistem pembukuan {storeSettings.storeName || 'CetakPro Ledger'}...
      </div>
    );
  }

  const isAuthenticatedOrUnlocked =
    (Boolean(user) || Boolean(appPasswordSessionEmail)) && !isScreenLocked;

  // Unauthenticated or Locked Landing / Login Screen (Supports Email + Password Khusus Aplikasi + Verifikasi Email/WA & Google Cloud)
  if (!isAuthenticatedOrUnlocked) {
    return (
      <div
        data-theme={storeSettings.themeColor}
        data-color-mode={storeSettings.themeMode || 'light'}
        className="min-h-screen app-theme-root bg-slate-50 flex flex-col justify-between"
      >
        <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            {storeSettings.logoDataUrl ? (
              <img
                src={storeSettings.logoDataUrl}
                alt="Logo Toko"
                className="w-8 h-8 rounded object-contain border border-slate-200 bg-white p-0.5"
              />
            ) : (
              <Printer className="w-5 h-5 text-slate-900" />
            )}
            <span className="text-lg font-bold tracking-tight text-slate-900">
              {storeSettings.storeName || 'CetakPro Ledger'}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() =>
                handleUpdateSettingsField(
                  'themeMode',
                  storeSettings.themeMode === 'dark' ? 'light' : 'dark'
                )
              }
              className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-700 flex items-center gap-1.5"
            >
              {storeSettings.themeMode === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  Mode Terang
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-600" />
                  Mode Gelap
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sinkron Google Cloud
            </button>
          </div>
        </header>

        <main className="max-w-6xl w-full mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Left Column: Value Proposition */}
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Sistem Akuntansi, Kasir SPK & Inventori Usaha Percetakan
              </div>
              <h1
                className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900"
                style={{ textWrap: 'balance' }}
              >
                Pembukuan Lengkap Usaha Digital Printing, Stok Bahan & Laporan Laba Rugi
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Dilengkapi kalkulator harga cetak per meter persegi (m²) dan lembar A3+, pemilihan nama kasir transaksi, cetak Nota & SPK (Thermal 80mm, 100mm, A5/A6 Landscape, 210×100mm), serta keamanan login password khusus aplikasi.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-1">
                <div className="font-bold text-slate-900">
                  01. Kasir Cetak & Multi-Kasir SPK
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Pilih & simpan nama kasir yang bertugas, hitung dimensi P×L×Qty otomatis, dan cetak Nota/SPK ke 5 ukuran kertas printer.
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-1">
                <div className="font-bold text-slate-900">
                  02. Login Password Khusus Aplikasi
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Buat password baru khusus untuk aplikasi ini (bukan password email asli) dengan verifikasi kode OTP via Email / Nomor WhatsApp.
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-1">
                <div className="font-bold text-slate-900">
                  03. Stok Bahan, Kas & Piutang
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Potong otomatis stok bahan roll/lembar, pantau sisa DP pelanggan, hutang jatuh tempo supplier, dan laporan Laba Rugi.
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-1">
                <div className="font-bold text-slate-900">
                  04. Kustomisasi Logo, Link & Tema
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Upload logo toko dari drive lokal, ganti link aplikasi/toko, pilih tema gelap/terang, dan peringatan simpan sebelum keluar.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Login Email & Password Khusus Aplikasi + Verifikasi Email/WA */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-5 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-slate-900" />
                <h2 className="text-sm font-bold text-slate-900">
                  {isScreenLocked
                    ? 'Layar Aplikasi Terkunci — Masukkan Password Aplikasi'
                    : 'Masuk ke Aplikasi Pembukuan Digital Printing'}
                </h2>
              </div>
            </div>

            {/* Tab Switcher on Login Card */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => {
                  setAuthError(null);
                  setLoginCardTab('LOGIN_APP');
                }}
                className={`py-2 px-2.5 rounded-md font-semibold transition-colors ${
                  loginCardTab === 'LOGIN_APP'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Login Email & Password
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthError(null);
                  setLoginCardTab('REGISTER_APP');
                }}
                className={`py-2 px-2.5 rounded-md font-semibold transition-colors ${
                  loginCardTab === 'REGISTER_APP'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Buat Password Aplikasi
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthError(null);
                  setLoginCardTab('GOOGLE_CLOUD');
                }}
                className={`py-2 px-2.5 rounded-md font-semibold transition-colors ${
                  loginCardTab === 'GOOGLE_CLOUD'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Google Cloud Sync
              </button>
            </div>

            {authError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            {loginInfoBanner && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-md text-xs text-amber-950 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>{loginInfoBanner}</span>
              </div>
            )}

            {/* TAB 1: LOGIN EMAIL & PASSWORD KHUSUS APLIKASI */}
            {loginCardTab === 'LOGIN_APP' && (
              <form onSubmit={handleAppPasswordLogin} className="space-y-4">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-slate-600">
                  Masuk menggunakan <strong>Email</strong> dan <strong>Password Khusus Aplikasi</strong> yang telah Anda buat (bukan password asli akun email Anda).
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Alamat Email Terdaftar *
                  </label>
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="kasir@percetakan.com"
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Password Khusus Aplikasi *
                  </label>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Masukkan password khusus aplikasi"
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-slate-900"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  Masuk dengan Password Aplikasi
                </button>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Belum punya password khusus aplikasi?</span>
                  <button
                    type="button"
                    onClick={() => setLoginCardTab('REGISTER_APP')}
                    className="font-semibold text-slate-900 underline"
                  >
                    Buat Password Baru (Verifikasi Email / WA)
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: BUAT PASSWORD BARU KHUSUS APLIKASI (VERIFIKASI EMAIL / NOMOR WHATSAPP) */}
            {loginCardTab === 'REGISTER_APP' && (
              <form onSubmit={handleVerifyAndRegisterAppLogin} className="space-y-3.5">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-slate-600">
                  <strong>Khusus Aplikasi Ini:</strong> Buat password baru khusus untuk membuka aplikasi pembukuan ini (bukan password email Anda), lalu verifikasi melalui <strong>Nomor WhatsApp</strong> atau <strong>Email</strong>.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Alamat Email Login *
                    </label>
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="owner@cetakpro.id"
                      className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Nomor WhatsApp Aktif *
                    </label>
                    <input
                      type="text"
                      required
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="0812-8899-0011"
                      className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Buat Password Baru Aplikasi *
                    </label>
                    <input
                      type="password"
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Minimal 4 karakter"
                      className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Konfirmasi Password Aplikasi *
                    </label>
                    <input
                      type="password"
                      required
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="Ketik ulang password"
                      className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Pilih Jalur Pengiriman Kode Verifikasi (OTP):
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRegVerifyMethod('WHATSAPP')}
                      className={`py-2 px-3 rounded-md border font-semibold flex items-center justify-center gap-1.5 ${
                        regVerifyMethod === 'WHATSAPP'
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Verifikasi via WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegVerifyMethod('EMAIL')}
                      className={`py-2 px-3 rounded-md border font-semibold flex items-center justify-center gap-1.5 ${
                        regVerifyMethod === 'EMAIL'
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Verifikasi via Email
                    </button>
                  </div>
                </div>

                {!regOtpSent ? (
                  <button
                    type="button"
                    onClick={handleSendRegisterOtp}
                    className="w-full py-2.5 px-4 font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors flex items-center justify-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Kirim Kode Verifikasi ({regVerifyMethod === 'WHATSAPP' ? 'WhatsApp' : 'Email'})
                  </button>
                ) : (
                  <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-950">
                        Kode Verifikasi 6 Digit ({regVerifyMethod}):
                      </span>
                      <span className="font-mono font-bold text-sm px-2 py-0.5 bg-white border border-amber-400 rounded text-amber-900">
                        {regOtpSent}
                      </span>
                    </div>
                    <div>
                      <label className="block font-medium text-amber-950 mb-1">
                        Masukkan Kode OTP Verifikasi:
                      </label>
                      <input
                        type="text"
                        value={regOtpInput}
                        onChange={(e) => setRegOtpInput(e.target.value)}
                        className="w-full px-3 py-2 border border-amber-400 rounded-md font-mono text-xs bg-white"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2.5 px-4 font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors"
                    >
                      Verifikasi Kode & Masuk ke Aplikasi
                    </button>
                  </div>
                )}
              </form>
            )}

            {/* TAB 3: LOGIN / SINKRONISASI GOOGLE CLOUD FIRESTORE & GOOGLE DRIVE */}
            {loginCardTab === 'GOOGLE_CLOUD' && (
              <div className="space-y-4">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md text-slate-600 leading-relaxed">
                  Gunakan akun Google Anda untuk menyinkronkan seluruh database pesanan SPK, stok bahan baku, jurnal kas, dan pengaturan toko secara otomatis ke <strong>Cloud Firestore</strong> serta <strong>Google Drive Sync</strong>.
                </div>
                <div className="flex flex-col items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="gsi-material-button w-full !max-w-none"
                  >
                    <div className="gsi-material-button-state" />
                    <div className="gsi-material-button-content-wrapper">
                      <div className="gsi-material-button-icon">
                        <svg
                          version="1.1"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 48 48"
                          xmlnsXlink="http://www.w3.org/1999/xlink"
                          style={{ display: 'block' }}
                        >
                          <path
                            fill="#EA4335"
                            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                          />
                          <path
                            fill="#4285F4"
                            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                          />
                          <path
                            fill="#34A853"
                            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                          />
                          <path fill="none" d="M0 0h48v48H0z" />
                        </svg>
                      </div>
                      <span className="gsi-material-button-contents">
                        Sign in with Google
                      </span>
                      <span style={{ display: 'none' }}>Sign in with Google</span>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

        <footer className="px-6 py-4 border-t border-slate-200 bg-white text-xs text-slate-500 flex justify-between">
          <span>{storeSettings.storeName || 'CetakPro Ledger'} — Sistem Pembukuan Usaha Digital Printing</span>
          <span>Mendukung Login Password Khusus Aplikasi & Cloud Firestore</span>
        </footer>
      </div>
    );
  }

  return (
    <div
      data-theme={storeSettings.themeColor}
      data-color-mode={storeSettings.themeMode || 'light'}
      className="min-h-screen app-theme-root flex flex-col"
    >
      {/* Top Bar with Logo, Navigation, Theme Mode Toggle, Save Status & Warn-Before-Exit */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 py-3 bg-white border-b border-slate-200 gap-3">
        {/* Zone 1: Store Logo (from Local Drive Upload) & Dynamic Store Name */}
        <a
          href="#dashboard"
          onClick={(e) => {
            e.preventDefault();
            handleSwitchTab('DASHBOARD');
          }}
          className="flex items-center gap-2.5 min-w-0 max-w-[260px]"
        >
          {storeSettings.logoDataUrl ? (
            <img
              src={storeSettings.logoDataUrl}
              alt="Logo Toko"
              className="w-8 h-8 rounded object-contain border border-slate-200 bg-white p-0.5 shrink-0"
            />
          ) : (
            <Printer className="w-5 h-5 text-slate-900 shrink-0" />
          )}
          <div className="truncate">
            <div className="text-sm sm:text-base font-bold tracking-tight text-slate-900 truncate">
              {storeSettings.storeName || 'CetakPro Ledger'}
            </div>
            <div className="text-[10px] text-slate-500 truncate">
              Kasir: <span className="font-semibold text-slate-700">{activeCashierName}</span>
            </div>
          </div>
        </a>

        {/* Zone 2: 6 Single-Line Navigation Links */}
        <nav className="flex items-center gap-2 sm:gap-5 text-xs sm:text-sm font-medium text-slate-600 overflow-x-auto">
          <button
            type="button"
            onClick={() => handleSwitchTab('DASHBOARD')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'DASHBOARD'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Ringkasan
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTab('ORDERS')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'ORDERS'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Kasir & SPK
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTab('INVENTORY')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'INVENTORY'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Stok Barang
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTab('CASH')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'CASH'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Kas & Piutang
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTab('PNL')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'PNL'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Laba Rugi
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTab('SETTINGS')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'SETTINGS'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Pengaturan
          </button>
        </nav>

        {/* Zone 3: Online/Offline Badge, Manual Offline Local Save, Cloud Save & Warn-Before-Exit Button */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Indikator Koneksi Internet & Status Autobackup Offline */}
          <div
            title={
              isOnline
                ? pendingCloudSync
                  ? 'Internet Online — Menyiapkan sinkronisasi backup lokal ke Cloud Firebase'
                  : 'Internet Online — Tersinkronisasi dengan Cloud Firebase'
                : `Mode Offline (${offlineElapsedMinutes} mnt tanpa internet) · Autobackup lokal tiap 1 jam aktif (berikutnya dalam ${minutesUntilNextAutoBackup} mnt)`
            }
            className={`hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap ${
              !isOnline
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : cloudSyncStatus === 'SYNCING'
                ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                : pendingCloudSync
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {!isOnline ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>
                  Offline ({offlineElapsedMinutes}m) · Autobackup {minutesUntilNextAutoBackup}m
                </span>
              </>
            ) : cloudSyncStatus === 'SYNCING' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-indigo-700 animate-spin shrink-0" />
                <span>Sinkron Cloud...</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Online · Cloud Aktif</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              handleUpdateSettingsField(
                'themeMode',
                storeSettings.themeMode === 'dark' ? 'light' : 'dark'
              )
            }
            title="Ganti Tema Terang / Gelap"
            className="p-2 text-xs font-medium border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors"
          >
            {storeSettings.themeMode === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-amber-500" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-slate-700" />
            )}
          </button>

          <button
            type="button"
            onClick={() => createOfflineLocalBackupSnapshot('MANUAL_LOCAL')}
            title="Manual Offline Local Save — Simpan seluruh keadaan aplikasi ke memori lokal sekarang"
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 rounded-lg transition-colors whitespace-nowrap"
          >
            <HardDrive className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
            <span className="hidden sm:inline">Simpan Offline</span>
          </button>

          <button
            type="button"
            onClick={handleManualSaveToFirebase}
            disabled={saveStatus === 'SAVING'}
            title="Simpan Semua Keadaan ke Cloud Firebase & Lokal"
            className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saveStatus === 'SAVING'
              ? 'Menyimpan...'
              : saveStatus === 'UNSAVED'
              ? 'Simpan Cloud!'
              : 'Simpan Cloud'}
          </button>

          <button
            type="button"
            onClick={() => setShowExitWarningModal(true)}
            className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors whitespace-nowrap inline-flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            Keluar
          </button>
        </div>
      </header>

      {/* Banner Status Offline / Autobackup 1 Jam / Auto-Sync Cloud Firebase */}
      {(!isOnline || offlineSyncNotice) && (
        <div
          className={`no-print px-4 sm:px-6 py-2.5 border-b text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
            !isOnline || offlineSyncNotice?.type === 'WARNING'
              ? 'bg-amber-50 border-amber-300 text-amber-950'
              : offlineSyncNotice?.type === 'SUCCESS'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : 'bg-indigo-50 border-indigo-200 text-indigo-950'
          }`}
        >
          <div className="flex items-start sm:items-center gap-2">
            {!isOnline ? (
              <WifiOff className="w-4 h-4 text-amber-700 shrink-0 mt-0.5 sm:mt-0" />
            ) : (
              <Clock className="w-4 h-4 text-indigo-700 shrink-0 mt-0.5 sm:mt-0" />
            )}
            <div>
              {offlineSyncNotice ? (
                <span>{offlineSyncNotice.text}</span>
              ) : (
                <span>
                  <strong>Mode Offline Lokal Aktif ({offlineElapsedMinutes} menit tanpa internet):</strong>{' '}
                  Autobackup lokal tiap 1 jam berjalan otomatis (backup berikutnya dalam{' '}
                  <strong>{minutesUntilNextAutoBackup} menit</strong>). Seluruh data akan otomatis disimpan ke Cloud Firebase saat internet normal kembali.
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => createOfflineLocalBackupSnapshot('MANUAL_LOCAL')}
              className="px-2.5 py-1 font-semibold bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 rounded text-[11px]"
            >
              Simpan Offline Sekarang
            </button>
            {isOnline && pendingCloudSync && user && (
              <button
                type="button"
                onClick={() => syncLocalStateToFirebaseCloud('MANUAL_SYNC')}
                className="px-2.5 py-1 font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[11px]"
              >
                Sinkron ke Cloud Sekarang
              </button>
            )}
            {offlineSyncNotice && (
              <button
                type="button"
                onClick={() => setOfflineSyncNotice(null)}
                className="p-1 opacity-70 hover:opacity-100"
                title="Tutup info"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Content Workspace */}
      <main
        className={`flex-1 max-w-[1380px] w-full mx-auto px-4 sm:px-6 py-6 ${
          printOrderTarget ? 'no-print' : ''
        }`}
      >
        {dataLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-24 bg-white border border-slate-200 rounded-lg p-4 animate-pulse"
                />
              ))}
            </div>
            <div className="h-80 bg-white border border-slate-200 rounded-lg animate-pulse" />
          </div>
        ) : (
          <>
            {activeTab === 'DASHBOARD' && (
              <DashboardOverview
                orders={orders}
                inventory={inventory}
                transactions={transactions}
                payables={payables}
                isSeeding={isSeeding}
                onSeedSampleData={handleSeedSampleData}
                onNavigate={(tab) => handleSwitchTab(tab)}
                onOpenPrintModal={(ord, mode) => {
                  setPrintOrderTarget(ord);
                  setPrintMode(mode);
                }}
              />
            )}

            <div className={activeTab === 'ORDERS' ? 'block' : 'hidden'}>
              <OrdersPosView
                orders={orders}
                inventory={inventory}
                storeSettings={storeSettings}
                paperSize={printPaperSize}
                onChangePaperSize={handleChangePaperSize}
                activeCashierName={activeCashierName}
                cashierList={activeCashierList}
                onChangeActiveCashier={(name) =>
                  handleUpdateSettingsField('activeCashierName', name)
                }
                onAddCashierName={handleAddCashierName}
                onRemoveCashierName={handleRemoveCashierName}
                onCreateOrder={handleCreateOrder}
                onCreateInventoryItem={handleCreateInventoryItem}
                onUpdateInventoryItem={handleUpdateInventoryItem}
                onUpdateProductionStatus={handleUpdateProductionStatus}
                onSettleOrderPayment={handleSettleOrderPayment}
                onDeleteOrder={handleDeleteOrder}
                onOpenPrintModal={(ord, mode, size) => {
                  if (size) {
                    handleChangePaperSize(size);
                  }
                  setPrintOrderTarget(ord);
                  setPrintMode(mode);
                }}
              />
            </div>

            {activeTab === 'INVENTORY' && (
              <InventoryView
                inventory={inventory}
                stockLogs={stockLogs}
                onCreateItem={handleCreateInventoryItem}
                onUpdateItem={handleUpdateInventoryItem}
                onRestockItem={handleRestockItem}
                onAdjustStock={handleAdjustStock}
                onDeleteItem={handleDeleteInventoryItem}
              />
            )}

            {activeTab === 'CASH' && (
              <CashAndDebtsView
                transactions={transactions}
                orders={orders}
                payables={payables}
                onCreateTransaction={handleCreateTransaction}
                onDeleteTransaction={handleDeleteTransaction}
                onSettleOrderPayment={handleSettleOrderPayment}
                onCreatePayable={handleCreatePayable}
                onPaySupplierPayable={handlePaySupplierPayable}
                onDeletePayable={handleDeletePayable}
              />
            )}

            {activeTab === 'PNL' && (
              <ProfitLossView orders={orders} transactions={transactions} />
            )}

            {activeTab === 'SETTINGS' && (
              <SettingsView
                settings={storeSettings}
                counts={{
                  orders: orders.length,
                  transactions: transactions.length,
                  payables: payables.length,
                  stockLogs: stockLogs.length,
                  inventory: inventory.length,
                }}
                saveStatus={saveStatus}
                onUpdateSettingsField={handleUpdateSettingsField}
                onManualSaveToFirebase={handleManualSaveToFirebase}
                onResetPartialData={handleResetPartialData}
                onResetFullData={handleResetFullData}
                onLockAppSession={() => setIsScreenLocked(true)}
                onShowWarnBeforeExitModal={() => setShowExitWarningModal(true)}
                isOnline={isOnline}
                offlineElapsedMinutes={offlineElapsedMinutes}
                minutesUntilNextAutoBackup={minutesUntilNextAutoBackup}
                offlineAutoBackupEnabled={offlineAutoBackupEnabled}
                onToggleOfflineAutoBackup={handleToggleOfflineAutoBackup}
                pendingCloudSync={pendingCloudSync}
                cloudSyncStatus={cloudSyncStatus}
                offlineBackupHistory={offlineBackupHistory}
                onManualOfflineLocalSave={(trigger) =>
                  createOfflineLocalBackupSnapshot(trigger || 'MANUAL_LOCAL')
                }
                onDownloadOfflineBackupFile={handleDownloadOfflineBackupFile}
                onImportOfflineBackupFile={handleImportOfflineBackupFile}
                onRestoreFromBackupRecord={handleRestoreFromBackupRecord}
                onDeleteBackupRecord={handleDeleteBackupRecord}
                onSyncLocalToCloudNow={() =>
                  syncLocalStateToFirebaseCloud('MANUAL_SYNC')
                }
                printPaperSize={printPaperSize}
                onChangePaperSize={handleChangePaperSize}
                driveAccessToken={driveAccessToken}
                googleAccountEmail={user?.email}
                onConnectGoogleDriveToken={handleConnectGoogleDriveToken}
                onBuildDriveSyncPayload={handleBuildDriveSyncPayload}
                onApplyDriveSyncedPayload={handleApplyDriveSyncedPayload}
              />
            )}
          </>
        )}
      </main>

      {/* Modal Peringatan Simpan Semua Keadaan Sebelum Keluar */}
      {showExitWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="bg-white border-2 border-amber-500 rounded-lg max-w-md w-full overflow-hidden shadow-2xl text-xs">
            <div className="bg-amber-500 text-slate-950 px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>Peringatan: Simpan Semua Keadaan Sebelum Keluar!</span>
              </div>
              <button
                type="button"
                onClick={() => setShowExitWarningModal(false)}
                className="text-slate-900 hover:text-black"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-md text-amber-950 leading-relaxed">
                Pastikan seluruh perubahan transaksi kasir, SPK, stok bahan, nama kasir aktif, serta pengaturan toko telah disimpan sebelum Anda keluar atau mengunci sesi aplikasi.
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1 text-slate-700">
                <div className="flex justify-between">
                  <span>Kasir Bertugas Saat Ini:</span>
                  <span className="font-bold text-slate-900">{activeCashierName}</span>
                </div>
                <div className="flex justify-between">
                  <span>Status Penyimpanan Terakhir:</span>
                  <span className="font-mono font-semibold text-emerald-700">
                    {storeSettings.lastSavedLabel}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Total Data Aktif:</span>
                  <span className="font-mono font-semibold">
                    {orders.length} SPK · {inventory.length} SKU · {transactions.length} Kas
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  disabled={isSavingBeforeExit}
                  onClick={() => executeSignOut(true)}
                  className="w-full py-2.5 px-4 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {isSavingBeforeExit
                    ? 'Menyimpan Semua Keadaan...'
                    : 'Simpan Semua Keadaan & Keluar Sekarang'}
                </button>

                <button
                  type="button"
                  disabled={isSavingBeforeExit}
                  onClick={async () => {
                    await handleManualSaveToFirebase();
                    setShowExitWarningModal(false);
                  }}
                  className="w-full py-2 px-4 font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Simpan Semua Keadaan Saja (Tetap di Aplikasi)
                </button>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowExitWarningModal(false)}
                    className="px-3 py-1.5 font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => executeSignOut(false)}
                    className="px-3 py-1.5 font-semibold text-rose-600 hover:text-rose-800 underline"
                  >
                    Keluar Tanpa Menyimpan
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cetak Nota / SPK */}
      <PrintModal
        order={printOrderTarget}
        storeSettings={storeSettings}
        mode={printMode}
        paperSize={printPaperSize}
        onClose={() => setPrintOrderTarget(null)}
        onSwitchMode={(m) => setPrintMode(m)}
        onChangePaperSize={handleChangePaperSize}
      />

      <footer className="no-print mt-auto px-6 py-4 border-t border-slate-200 bg-white text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div>
          {storeSettings.storeName} · Kasir Aktif: <strong>{activeCashierName}</strong> · Sinkronisasi:{' '}
          <span className="font-mono">{storeSettings.lastSavedLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          {storeSettings.customStoreUrl && (
            <a
              href={
                storeSettings.customStoreUrl.startsWith('http')
                  ? storeSettings.customStoreUrl
                  : `https://${storeSettings.customStoreUrl}`
              }
              target="_blank"
              rel="noreferrer"
              className="text-slate-600 hover:text-slate-900 underline font-mono"
            >
              {storeSettings.customStoreUrl}
            </a>
          )}
          <button
            type="button"
            onClick={handleSeedSampleData}
            disabled={isSeeding}
            className="text-slate-600 hover:text-slate-900 underline inline-flex items-center gap-1"
          >
            <Database className="w-3 h-3" />
            {isSeeding ? 'Memuat Data Contoh...' : 'Muat Data Contoh Percetakan'}
          </button>
        </div>
      </footer>
    </div>
  );
}
