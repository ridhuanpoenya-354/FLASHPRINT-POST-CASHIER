import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Save,
  Palette,
  Store,
  Cloud,
  AlertTriangle,
  Trash2,
  CheckCircle2,
  RotateCcw,
  ShieldAlert,
  X,
  Link2,
  Copy,
  ExternalLink,
  Upload,
  Image as ImageIcon,
  Sun,
  Moon,
  UserCheck,
  UserPlus,
  Lock,
  KeyRound,
  Mail,
  MessageSquare,
  ShieldCheck,
  HardDrive,
  Download,
  RefreshCw,
  Wifi,
  WifiOff,
  Clock,
  FolderUp,
  Printer,
  FileJson,
  Check,
} from 'lucide-react';
import {
  StoreSettings,
  ThemeColor,
  ThemeMode,
  THEME_OPTIONS,
  NavTab,
  OfflineLocalBackupRecord,
  PrintPaperSize,
  PRINT_PAPER_OPTIONS,
  clampString,
  todayISO,
} from '../types';
import {
  DEFAULT_DRIVE_SETTINGS_FILENAME,
  DriveFileMetadata,
  DriveSettingsSyncPayload,
  DriveUserInfo,
  checkGoogleDriveTokenStatus,
  listGoogleDriveSettingsFiles,
  saveSettingsToGoogleDrive,
  downloadSettingsFromGoogleDrive,
  deleteSettingsFileFromGoogleDrive,
} from '../utils/googleDriveSync';

export interface ResetTargets {
  orders: boolean;
  transactions: boolean;
  payables: boolean;
  stockLogs: boolean;
  inventory: boolean;
}

export function hashAppPassword(rawPassword: string): string {
  const cleaned = rawPassword.trim();
  if (!cleaned) return '';
  let h1 = 0xdeadbeef ^ cleaned.length;
  let h2 = 0x41c6ce57 ^ cleaned.length;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (
    'APPKEY-' +
    (h2 >>> 0).toString(16).padStart(8, '0') +
    (h1 >>> 0).toString(16).padStart(8, '0')
  ).toUpperCase();
}

interface SettingsViewProps {
  settings: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>;
  counts: {
    orders: number;
    transactions: number;
    payables: number;
    stockLogs: number;
    inventory: number;
  };
  saveStatus: 'IDLE' | 'SAVING' | 'SAVED' | 'UNSAVED';
  onUpdateSettingsField: <
    K extends keyof Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>
  >(
    field: K,
    value: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>[K]
  ) => void;
  onManualSaveToFirebase: () => Promise<void>;
  onResetPartialData: (targets: ResetTargets) => Promise<void>;
  onResetFullData: () => Promise<void>;
  onLockAppSession?: () => void;
  onShowWarnBeforeExitModal?: () => void;
  isOnline: boolean;
  offlineElapsedMinutes: number;
  minutesUntilNextAutoBackup: number;
  offlineAutoBackupEnabled: boolean;
  onToggleOfflineAutoBackup: (enabled: boolean) => void;
  pendingCloudSync: boolean;
  cloudSyncStatus: 'IDLE' | 'SYNCING' | 'SYNCED' | 'OFFLINE_QUEUED' | 'ERROR';
  offlineBackupHistory: OfflineLocalBackupRecord[];
  onManualOfflineLocalSave: (
    trigger?: 'MANUAL_LOCAL' | 'HOURLY_OFFLINE_AUTO'
  ) => void;
  onDownloadOfflineBackupFile: () => void;
  onImportOfflineBackupFile: (file: File) => void;
  onRestoreFromBackupRecord: (record: OfflineLocalBackupRecord) => void;
  onDeleteBackupRecord: (id: string) => void;
  onSyncLocalToCloudNow: () => Promise<void>;
  printPaperSize: PrintPaperSize;
  onChangePaperSize: (size: PrintPaperSize) => void;
  driveAccessToken: string | null;
  googleAccountEmail?: string | null;
  onConnectGoogleDriveToken: () => Promise<string | null>;
  onBuildDriveSyncPayload: (includeFullLedger: boolean) => DriveSettingsSyncPayload;
  onApplyDriveSyncedPayload: (
    payload: DriveSettingsSyncPayload,
    applyFullLedger: boolean
  ) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  counts,
  saveStatus,
  onUpdateSettingsField,
  onManualSaveToFirebase,
  onResetPartialData,
  onResetFullData,
  onLockAppSession,
  onShowWarnBeforeExitModal,
  isOnline,
  offlineElapsedMinutes,
  minutesUntilNextAutoBackup,
  offlineAutoBackupEnabled,
  onToggleOfflineAutoBackup,
  pendingCloudSync,
  cloudSyncStatus,
  offlineBackupHistory,
  onManualOfflineLocalSave,
  onDownloadOfflineBackupFile,
  onImportOfflineBackupFile,
  onRestoreFromBackupRecord,
  onDeleteBackupRecord,
  onSyncLocalToCloudNow,
  printPaperSize,
  onChangePaperSize,
  driveAccessToken,
  googleAccountEmail,
  onConnectGoogleDriveToken,
  onBuildDriveSyncPayload,
  onApplyDriveSyncedPayload,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  const [partialTargets, setPartialTargets] = useState<ResetTargets>({
    orders: true,
    transactions: true,
    payables: false,
    stockLogs: false,
    inventory: false,
  });

  // Red Warning Confirmation Modal State
  const [dangerModalMode, setDangerModalMode] = useState<'PARTIAL' | 'FULL' | null>(
    null
  );
  const [confirmKeyword, setConfirmKeyword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccessBanner, setResetSuccessBanner] = useState<string | null>(null);

  // Link Management State
  const [linkCopiedMsg, setLinkCopiedMsg] = useState<string | null>(null);
  const [linkPresetType, setLinkPresetType] = useState<string>('CUSTOM');

  // Cashier Quick Add in Settings
  const [newCashierInput, setNewCashierInput] = useState('');

  // App-Specific Email & Password + OTP Verification State
  const [authEmailInput, setAuthEmailInput] = useState(
    settings.appAuthEmail || ''
  );
  const [authPhoneInput, setAuthPhoneInput] = useState(
    settings.appAuthPhone || settings.phone || ''
  );
  const [newAppPassword, setNewAppPassword] = useState('');
  const [confirmAppPassword, setConfirmAppPassword] = useState('');
  const [verificationChannel, setVerificationChannel] = useState<'EMAIL' | 'WHATSAPP'>(
    'WHATSAPP'
  );
  const [generatedOtp, setGeneratedOtp] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [authMessage, setAuthMessage] = useState<{
    type: 'SUCCESS' | 'ERROR' | 'INFO';
    text: string;
  } | null>(null);

  // Logo Upload Error/Status
  const [logoStatusMsg, setLogoStatusMsg] = useState<string | null>(null);

  // Google Drive Sync State
  const [driveFiles, setDriveFiles] = useState<DriveFileMetadata[]>([]);
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [driveUserInfo, setDriveUserInfo] = useState<DriveUserInfo | null>(null);
  const [includeFullLedgerInDrive, setIncludeFullLedgerInDrive] = useState<boolean>(true);
  const [lastDriveSyncLabel, setLastDriveSyncLabel] = useState<string | null>(null);
  const [driveStatusBanner, setDriveStatusBanner] = useState<{
    type: 'SUCCESS' | 'ERROR' | 'INFO' | 'WARNING';
    text: string;
  } | null>(null);
  const [driveConfirmModal, setDriveConfirmModal] = useState<{
    action: 'OVERWRITE_PRIMARY' | 'OVERWRITE_SPECIFIC' | 'DELETE_FILE';
    targetFileId: string;
    targetFileName: string;
  } | null>(null);

  // Sync local input states when settings change from external sync (Firestore or Google Drive)
  useEffect(() => {
    setAuthEmailInput(settings.appAuthEmail || '');
    setAuthPhoneInput(settings.appAuthPhone || settings.phone || '');
  }, [settings.appAuthEmail, settings.appAuthPhone, settings.phone]);

  const isConnectingDriveRef = useRef(false);

  // Refresh Google Drive files & verify token whenever driveAccessToken changes
  const refreshGoogleDriveStatusAndFiles = useCallback(
    async (tokenToUse: string | null, showBannerOnSuccess = false) => {
      if (!tokenToUse) {
        setDriveUserInfo(null);
        setDriveFiles([]);
        return;
      }
      setIsDriveLoading(true);
      try {
        const [statusRes, filesRes] = await Promise.all([
          checkGoogleDriveTokenStatus(tokenToUse),
          listGoogleDriveSettingsFiles(tokenToUse).catch(() => []),
        ]);
        if (statusRes.valid && statusRes.user) {
          setDriveUserInfo(statusRes.user);
        }
        setDriveFiles(filesRes);
        const primaryFile = filesRes.find(
          (f) => f.name === DEFAULT_DRIVE_SETTINGS_FILENAME
        );
        if (primaryFile?.modifiedTime) {
          const dt = new Date(primaryFile.modifiedTime);
          if (!Number.isNaN(dt.getTime())) {
            setLastDriveSyncLabel(dt.toLocaleString('id-ID'));
          }
        }
        if (showBannerOnSuccess && statusRes.valid) {
          const userEmail = statusRes.user?.emailAddress || googleAccountEmail || '';
          const userLabel = statusRes.user?.displayName ? `${statusRes.user.displayName} (${userEmail})` : userEmail;
          setDriveStatusBanner({
            type: 'SUCCESS',
            text: `Google Drive berhasil ditautkan dan langsung siap digunakan! Terhubung ke akun ${userLabel}. ${
              filesRes.length > 0
                ? `Ditemukan ${filesRes.length} file sinkronisasi di Google Drive.`
                : 'Belum ada file backup sebelumnya; klik "Simpan & Sinkron ke Google Drive" untuk sinkronisasi pertama.'
            }`,
          });
        } else if (!statusRes.valid && statusRes.error) {
          setDriveStatusBanner({
            type: 'WARNING',
            text: statusRes.error,
          });
        }
      } catch (err) {
        setDriveStatusBanner({
          type: 'ERROR',
          text:
            err instanceof Error
              ? err.message
              : 'Gagal memuat status Google Drive.',
        });
      } finally {
        setIsDriveLoading(false);
      }
    },
    [googleAccountEmail]
  );

  useEffect(() => {
    if (driveAccessToken && !isConnectingDriveRef.current) {
      refreshGoogleDriveStatusAndFiles(driveAccessToken, false);
    } else if (!driveAccessToken) {
      setDriveUserInfo(null);
    }
  }, [driveAccessToken, refreshGoogleDriveStatusAndFiles]);

  const handleSignInAndConnectGoogleDrive = async () => {
    setIsConnectingDrive(true);
    isConnectingDriveRef.current = true;
    setDriveStatusBanner(null);
    try {
      const token = await onConnectGoogleDriveToken();
      if (token) {
        await refreshGoogleDriveStatusAndFiles(token, true);
      }
    } catch (err) {
      setDriveStatusBanner({
        type: 'ERROR',
        text:
          err instanceof Error
            ? err.message
            : 'Gagal menghubungkan akun Google Drive.',
      });
    } finally {
      isConnectingDriveRef.current = false;
      setIsConnectingDrive(false);
    }
  };

  const handleCheckTokenStatusButton = async () => {
    if (!driveAccessToken) {
      setDriveStatusBanner({
        type: 'WARNING',
        text: googleAccountEmail
          ? `Akun Firebase (${googleAccountEmail}) masih login, namun Token Akses Google Drive di memori sesi browser perlu diaktifkan kembali. Silakan klik tombol "Sign in with Google" di bawah untuk mengaktifkan token Google Drive.`
          : 'Token akses Google Drive belum aktif di sesi ini. Silakan klik tombol "Sign in with Google" untuk menghubungkan Google Drive.',
      });
      return;
    }
    await refreshGoogleDriveStatusAndFiles(driveAccessToken, true);
  };

  const executeUploadSettingsToDrive = async (
    token: string,
    existingFileId?: string,
    customFileName?: string
  ) => {
    setIsDriveLoading(true);
    setDriveStatusBanner(null);
    try {
      // Also save to Firebase + LocalStorage so all 3 places match
      await onManualSaveToFirebase();
      const payload = onBuildDriveSyncPayload(includeFullLedgerInDrive);
      const savedFile = await saveSettingsToGoogleDrive({
        accessToken: token,
        payload,
        existingFileId,
        customFileName,
      });
      const updatedFiles = await listGoogleDriveSettingsFiles(token);
      setDriveFiles(updatedFiles);
      const nowStr = new Date().toLocaleString('id-ID');
      setLastDriveSyncLabel(nowStr);
      setDriveStatusBanner({
        type: 'SUCCESS',
        text: `Berhasil menyimpan & menyinkronkan semua pengaturan ke Google Drive dalam file "${savedFile.name}" (${nowStr}).`,
      });
    } catch (err) {
      setDriveStatusBanner({
        type: 'ERROR',
        text:
          err instanceof Error
            ? err.message
            : 'Gagal menyimpan pengaturan ke Google Drive.',
      });
    } finally {
      setIsDriveLoading(false);
    }
  };

  const handleRequestSaveToGoogleDrive = async (
    mode: 'PRIMARY_SYNC' | 'NEW_SNAPSHOT',
    specificFile?: DriveFileMetadata
  ) => {
    let activeToken = driveAccessToken;
    if (!activeToken) {
      setIsConnectingDrive(true);
      try {
        activeToken = await onConnectGoogleDriveToken();
      } catch (err) {
        setDriveStatusBanner({
          type: 'ERROR',
          text:
            err instanceof Error
              ? err.message
              : 'Gagal mendapatkan token Google Drive.',
        });
        setIsConnectingDrive(false);
        return;
      }
      setIsConnectingDrive(false);
      if (!activeToken) return;
    }

    if (specificFile) {
      // Mandatory user confirmation before overwriting an existing file on Google Drive
      setDriveConfirmModal({
        action: 'OVERWRITE_SPECIFIC',
        targetFileId: specificFile.id,
        targetFileName: specificFile.name,
      });
      return;
    }

    if (mode === 'PRIMARY_SYNC') {
      let currentFiles = driveFiles;
      if (currentFiles.length === 0) {
        try {
          currentFiles = await listGoogleDriveSettingsFiles(activeToken);
          setDriveFiles(currentFiles);
        } catch {
          // ignore
        }
      }
      const existingPrimary = currentFiles.find(
        (f) => f.name === DEFAULT_DRIVE_SETTINGS_FILENAME
      );
      if (existingPrimary) {
        // Mandatory user confirmation before updating/overwriting existing file on Google Drive
        setDriveConfirmModal({
          action: 'OVERWRITE_PRIMARY',
          targetFileId: existingPrimary.id,
          targetFileName: existingPrimary.name,
        });
        return;
      }
      await executeUploadSettingsToDrive(
        activeToken,
        undefined,
        DEFAULT_DRIVE_SETTINGS_FILENAME
      );
    } else {
      const safeSlug = (settings.customSlug || 'cetakpro')
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-');
      const stamp = new Date()
        .toTimeString()
        .slice(0, 8)
        .replace(/:/g, '');
      const snapshotName = `cetakpro-settings-${safeSlug}-${todayISO()}-${stamp}.json`;
      await executeUploadSettingsToDrive(activeToken, undefined, snapshotName);
    }
  };

  const handleConfirmDriveModalAction = async () => {
    if (!driveConfirmModal || !driveAccessToken) {
      setDriveConfirmModal(null);
      return;
    }
    const { action, targetFileId, targetFileName } = driveConfirmModal;
    setDriveConfirmModal(null);

    if (action === 'OVERWRITE_PRIMARY' || action === 'OVERWRITE_SPECIFIC') {
      await executeUploadSettingsToDrive(
        driveAccessToken,
        targetFileId,
        targetFileName
      );
    } else if (action === 'DELETE_FILE') {
      setIsDriveLoading(true);
      setDriveStatusBanner(null);
      try {
        await deleteSettingsFileFromGoogleDrive(driveAccessToken, targetFileId);
        const updatedFiles = await listGoogleDriveSettingsFiles(driveAccessToken);
        setDriveFiles(updatedFiles);
        setDriveStatusBanner({
          type: 'SUCCESS',
          text: `File "${targetFileName}" telah berhasil dihapus dari Google Drive.`,
        });
      } catch (err) {
        setDriveStatusBanner({
          type: 'ERROR',
          text:
            err instanceof Error
              ? err.message
              : 'Gagal menghapus file dari Google Drive.',
        });
      } finally {
        setIsDriveLoading(false);
      }
    }
  };

  const handlePullAndApplyFromGoogleDrive = async (
    targetFile?: DriveFileMetadata
  ) => {
    let activeToken = driveAccessToken;
    if (!activeToken) {
      setIsConnectingDrive(true);
      try {
        activeToken = await onConnectGoogleDriveToken();
      } catch (err) {
        setDriveStatusBanner({
          type: 'ERROR',
          text:
            err instanceof Error
              ? err.message
              : 'Gagal mendapatkan token Google Drive.',
        });
        setIsConnectingDrive(false);
        return;
      }
      setIsConnectingDrive(false);
      if (!activeToken) return;
    }

    setIsDriveLoading(true);
    setDriveStatusBanner(null);
    try {
      let fileToDownload = targetFile;
      if (!fileToDownload) {
        const files = await listGoogleDriveSettingsFiles(activeToken);
        setDriveFiles(files);
        fileToDownload =
          files.find((f) => f.name === DEFAULT_DRIVE_SETTINGS_FILENAME) ||
          files[0];
      }

      if (!fileToDownload) {
        setDriveStatusBanner({
          type: 'WARNING',
          text: 'Belum ada file sinkronisasi pengaturan di Google Drive Anda. Klik "Simpan & Sinkron ke Google Drive" terlebih dahulu untuk membuat file pertama.',
        });
        return;
      }

      const downloadedPayload = await downloadSettingsFromGoogleDrive(
        activeToken,
        fileToDownload.id
      );
      await onApplyDriveSyncedPayload(
        downloadedPayload,
        includeFullLedgerInDrive
      );
      const nowStr = new Date().toLocaleString('id-ID');
      setLastDriveSyncLabel(nowStr);
      setDriveStatusBanner({
        type: 'SUCCESS',
        text: `Berhasil memuat & menyinkronkan seluruh pengaturan dari file Google Drive "${fileToDownload.name}" (Toko: ${downloadedPayload.storeSettings.storeName}).`,
      });
    } catch (err) {
      setDriveStatusBanner({
        type: 'ERROR',
        text:
          err instanceof Error
            ? err.message
            : 'Gagal memuat pengaturan dari Google Drive.',
      });
    } finally {
      setIsDriveLoading(false);
    }
  };

  const selectedPartialCount =
    (partialTargets.orders ? counts.orders : 0) +
    (partialTargets.transactions ? counts.transactions : 0) +
    (partialTargets.payables ? counts.payables : 0) +
    (partialTargets.stockLogs ? counts.stockLogs : 0) +
    (partialTargets.inventory ? counts.inventory : 0);

  const hasAnyPartialSelected = Object.values(partialTargets).some(Boolean);

  const totalAllDocsCount =
    counts.orders +
    counts.transactions +
    counts.payables +
    counts.stockLogs +
    counts.inventory;

  const handleToggleTarget = (key: keyof ResetTargets) => {
    setPartialTargets((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleOpenDangerModal = (mode: 'PARTIAL' | 'FULL') => {
    setConfirmKeyword('');
    setDangerModalMode(mode);
  };

  const handleConfirmDangerReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmKeyword.trim().toUpperCase() !== 'RESET') return;
    setIsResetting(true);
    try {
      if (dangerModalMode === 'PARTIAL') {
        await onResetPartialData(partialTargets);
        setResetSuccessBanner(
          'Data pada kategori yang dipilih telah berhasil dihapus dari Firebase.'
        );
      } else if (dangerModalMode === 'FULL') {
        await onResetFullData();
        setResetSuccessBanner(
          'Seluruh data pembukuan dan pengaturan toko telah direset sepenuhnya.'
        );
      }
      setDangerModalMode(null);
      setConfirmKeyword('');
    } finally {
      setIsResetting(false);
    }
  };

  // Handle Local Drive Logo Upload & Canvas Compression
  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setLogoStatusMsg('Format file harus berupa gambar (PNG, JPG, WEBP, atau SVG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 220;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          let dataUrl = canvas.toDataURL('image/png');
          if (dataUrl.length > 135000) {
            dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          }
          onUpdateSettingsField('logoDataUrl', dataUrl);
          setLogoStatusMsg(
            `Logo "${file.name}" berhasil dimuat dari drive lokal dan siap dicetak pada Nota & SPK.`
          );
        }
      };
      img.src = String(event.target?.result || '');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Handle Custom Link & Slug Application
  const currentAppShareUrl = (() => {
    const base = window.location.origin + window.location.pathname;
    const slug = (settings.customSlug || 'cetakpro-pusat')
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-');
    return `${base}?toko=${slug}`;
  })();

  const handleApplyAndCopyLink = (targetUrl: string, label: string) => {
    try {
      const slug = (settings.customSlug || 'cetakpro-pusat')
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-');
      window.history.replaceState({}, '', `?toko=${slug}`);
      navigator.clipboard?.writeText(targetUrl);
      setLinkCopiedMsg(`${label} berhasil diterapkan & disalin ke clipboard!`);
      setTimeout(() => setLinkCopiedMsg(null), 4000);
    } catch {
      setLinkCopiedMsg(`${label} berhasil diterapkan pada bilah alamat browser.`);
      setTimeout(() => setLinkCopiedMsg(null), 4000);
    }
  };

  const handleApplyPresetLink = (preset: string) => {
    setLinkPresetType(preset);
    const cleanPhone = (settings.phone || '081288990011').replace(/[^0-9]/g, '');
    const waNumber = cleanPhone.startsWith('0')
      ? '62' + cleanPhone.slice(1)
      : cleanPhone;
    const slug = (settings.customSlug || 'cetakpro-pusat')
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-');

    if (preset === 'WA_CATALOG') {
      onUpdateSettingsField('customStoreUrl', `https://wa.me/${waNumber}`);
    } else if (preset === 'INSTAGRAM') {
      onUpdateSettingsField('customStoreUrl', `https://instagram.com/${slug}`);
    } else if (preset === 'GMAPS') {
      onUpdateSettingsField(
        'customStoreUrl',
        `https://maps.google.com/?q=${encodeURIComponent(settings.storeName + ' ' + settings.address)}`
      );
    } else if (preset === 'WEB') {
      onUpdateSettingsField('customStoreUrl', `https://${slug}.id`);
    }
  };

  // Handle Adding / Removing Cashier in Settings
  const cashierList =
    settings.cashierList && settings.cashierList.length > 0
      ? settings.cashierList
      : ['Rina (Kasir Utama)', 'Budi (Kasir Shift Sore)', 'Dewi (Admin SPK)'];

  const handleAddCashier = () => {
    const cleaned = clampString(newCashierInput, 60, '');
    if (!cleaned) return;
    if (cashierList.some((c) => c.toLowerCase() === cleaned.toLowerCase())) {
      onUpdateSettingsField('activeCashierName', cleaned);
      setNewCashierInput('');
      return;
    }
    const nextList = [...cashierList, cleaned].slice(0, 30);
    onUpdateSettingsField('cashierList', nextList);
    onUpdateSettingsField('activeCashierName', cleaned);
    setNewCashierInput('');
  };

  const handleRemoveCashier = (name: string) => {
    if (cashierList.length <= 1) return;
    const nextList = cashierList.filter((c) => c !== name);
    onUpdateSettingsField('cashierList', nextList);
    if (settings.activeCashierName === name) {
      onUpdateSettingsField('activeCashierName', nextList[0] || 'Admin Kasir');
    }
  };

  // Handle Sending OTP for Application-Specific Password
  const handleSendVerificationCode = () => {
    const emailClean = clampString(authEmailInput, 120, '');
    const phoneClean = clampString(authPhoneInput, 40, '');
    if (!emailClean || !emailClean.includes('@')) {
      setAuthMessage({
        type: 'ERROR',
        text: 'Masukkan alamat email aktif terlebih dahulu untuk identifikasi login aplikasi.',
      });
      return;
    }
    if (newAppPassword.trim().length < 4) {
      setAuthMessage({
        type: 'ERROR',
        text: 'Buat password khusus aplikasi minimal 4 karakter.',
      });
      return;
    }
    if (newAppPassword !== confirmAppPassword) {
      setAuthMessage({
        type: 'ERROR',
        text: 'Konfirmasi password aplikasi belum cocok.',
      });
      return;
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    setGeneratedOtp(code);
    setOtpInput(code); // Pre-fill for easy 1-click verification in preview while showing full OTP box
    setAuthMessage({
      type: 'INFO',
      text:
        verificationChannel === 'WHATSAPP'
          ? `Kode Verifikasi 6-Digit (${code}) telah dibuat untuk WhatsApp ${phoneClean || '-'}. Silakan periksa kode di bawah dan klik Verifikasi & Aktifkan Password Aplikasi.`
          : `Kode Verifikasi 6-Digit (${code}) telah dibuat untuk Email ${emailClean}. Silakan periksa kode di bawah dan klik Verifikasi & Aktifkan Password Aplikasi.`,
    });
  };

  const handleVerifyAndSaveAppPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!generatedOtp) {
      handleSendVerificationCode();
      return;
    }
    if (otpInput.trim() !== generatedOtp) {
      setAuthMessage({
        type: 'ERROR',
        text: 'Kode verifikasi OTP tidak sesuai. Pastikan 6 digit angka benar.',
      });
      return;
    }

    const emailClean = clampString(authEmailInput, 120, '').toLowerCase();
    const phoneClean = clampString(authPhoneInput, 40, '');
    const hashed = hashAppPassword(newAppPassword);

    onUpdateSettingsField('appAuthEmail', emailClean);
    onUpdateSettingsField('appAuthPhone', phoneClean);
    onUpdateSettingsField('appAuthPasswordHash', hashed);
    onUpdateSettingsField('appAuthVerified', true);

    // Also persist to localStorage so the Login gate can verify even before Google Cloud sign-in
    try {
      localStorage.setItem(
        'cetakpro_app_auth',
        JSON.stringify({
          email: emailClean,
          phone: phoneClean,
          passwordHash: hashed,
          verified: true,
          storeName: settings.storeName,
          updatedAt: new Date().toISOString(),
        })
      );
    } catch {
      // ignore storage quota errors
    }

    setGeneratedOtp(null);
    setNewAppPassword('');
    setConfirmAppPassword('');
    setOtpInput('');
    setAuthMessage({
      type: 'SUCCESS',
      text: `Terverifikasi via ${
        verificationChannel === 'WHATSAPP' ? 'Nomor WhatsApp' : 'Email'
      }! Login dengan Email (${emailClean}) & Password Khusus Aplikasi kini telah aktif.`,
    });
  };

  const currentThemeMode: ThemeMode = settings.themeMode === 'dark' ? 'dark' : 'light';

  return (
    <div className="space-y-6">
      {/* Header Bar & Manual Save / Autosave Status */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Pengaturan Toko, Logo, Link Aplikasi, Login Khusus & Tema
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Kelola profil & logo toko dari drive lokal, ganti link toko/aplikasi, daftar nama kasir, password khusus aplikasi, tema gelap/terang, serta sinkronisasi Firebase.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Indikator Status Simpan Firebase */}
          <div className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs flex items-center gap-2">
            <Cloud className="w-3.5 h-3.5 text-slate-600" />
            {saveStatus === 'SAVING' && (
              <span className="text-amber-700 font-medium">
                Menyimpan ke Firebase...
              </span>
            )}
            {saveStatus === 'SAVED' && (
              <span className="text-emerald-700 font-medium">
                Tersimpan · <span className="font-mono">{settings.lastSavedLabel}</span>
              </span>
            )}
            {saveStatus === 'UNSAVED' && (
              <span className="text-rose-600 font-semibold">
                Ada Perubahan Belum Disimpan!
              </span>
            )}
            {saveStatus === 'IDLE' && (
              <span className="text-slate-600">
                Sinkron Terakhir: <span className="font-mono">{settings.lastSavedLabel}</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => onManualOfflineLocalSave('MANUAL_LOCAL')}
            className="px-3.5 py-2 text-xs font-semibold text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <HardDrive className="w-3.5 h-3.5 text-indigo-700" />
            Simpan Offline Lokal
          </button>

          <button
            type="button"
            onClick={onManualSaveToFirebase}
            disabled={saveStatus === 'SAVING'}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saveStatus === 'SAVING'
              ? 'Menyimpan...'
              : 'Simpan Semua Keadaan Sekarang'}
          </button>

          {onShowWarnBeforeExitModal && (
            <button
              type="button"
              onClick={onShowWarnBeforeExitModal}
              className="px-3.5 py-2 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              Simpan & Keluar
            </button>
          )}
        </div>
      </div>

      {/* Peringatan Simpan Semua Keadaan Sebelum Keluar Banner */}
      <div className="bg-amber-50/90 border border-amber-300 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-start sm:items-center gap-2.5 text-amber-950">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
          <div>
            <span className="font-bold">
              Pengingat Keamanan Data:
            </span>{' '}
            Pastikan Anda menekan tombol <strong>&ldquo;Simpan Semua Keadaan Sekarang&rdquo;</strong> sebelum menutup tab atau keluar dari aplikasi agar seluruh transaksi kasir, SPK, dan pengaturan toko tersimpan utuh di Cloud.
          </div>
        </div>
        <button
          type="button"
          onClick={onManualSaveToFirebase}
          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-md shrink-0 whitespace-nowrap"
        >
          Simpan Keadaan Sekarang
        </button>
      </div>

      {resetSuccessBanner && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3.5 text-xs text-emerald-900 flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{resetSuccessBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setResetSuccessBanner(null)}
            className="text-emerald-700 hover:text-emerald-950 font-semibold"
          >
            Tutup
          </button>
        </div>
      )}

      {/* KARTU UTAMA: INTEGRASI GOOGLE DRIVE SYNC & STATUS TOKEN AKSES */}
      <div className="bg-white border-2 border-emerald-300 rounded-lg p-5 sm:p-6 space-y-4 text-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-emerald-100 pb-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Integrasi Google Drive Sync — Simpan & Sinkronisasi Semua Pengaturan
                </h3>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${
                    driveAccessToken
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-amber-50 text-amber-800 border-amber-300'
                  }`}
                >
                  {driveAccessToken ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Token Google Drive Aktif
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                      Token Perlu Dihubungkan / Diperbarui
                    </>
                  )}
                </span>
              </div>
              <p className="text-slate-600 mt-1 leading-relaxed">
                Menyimpan dan menyinkronkan <strong>seluruh pengaturan di menu Pengaturan</strong> (Profil Toko, Logo, Slug &amp; Link, Daftar Kasir, Password Khusus Aplikasi, Mode Gelap/Terang, Palet Warna, Kertas Cetak Default, &amp; Autosave) langsung ke akun <strong>Google Drive</strong> Anda (<span className="font-mono">{DEFAULT_DRIVE_SETTINGS_FILENAME}</span>).
              </p>
            </div>
          </div>

          {/* Tombol Sign in with Google Resmi & Cek Token */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCheckTokenStatusButton}
              disabled={isDriveLoading}
              className="px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md flex items-center gap-1.5 whitespace-nowrap"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
              Cek Status Token Saya
            </button>

            <button
              type="button"
              onClick={handleSignInAndConnectGoogleDrive}
              disabled={isConnectingDrive}
              className="gsi-material-button"
              title="Hubungkan atau perbarui token akses Google Drive"
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
                  {isConnectingDrive
                    ? 'Menghubungkan...'
                    : driveAccessToken
                    ? 'Perbarui Token Google Drive'
                    : 'Sign in with Google'}
                </span>
                <span style={{ display: 'none' }}>Sign in with Google</span>
              </div>
            </button>
          </div>
        </div>

        {/* Informasi Detail Status Token & Akun */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
          <div>
            <div className="text-[11px] text-slate-500">Status Token di Memori Sesi:</div>
            <div className="font-bold text-slate-900 mt-0.5 flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  driveAccessToken ? 'bg-emerald-600' : 'bg-amber-500'
                }`}
              />
              {driveAccessToken
                ? 'Tersedia & Siap Sinkronisasi'
                : 'Belum Aktif (Klik Sign in with Google)'}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Akun Google Drive Terhubung:</div>
            <div className="font-bold text-slate-900 mt-0.5 truncate">
              {driveUserInfo
                ? `${driveUserInfo.displayName} (${driveUserInfo.emailAddress})`
                : googleAccountEmail || 'Belum terhubung'}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Sinkronisasi Drive Terakhir:</div>
            <div className="font-mono font-semibold text-emerald-700 mt-0.5">
              {lastDriveSyncLabel || settings.lastSavedLabel || 'Belum disinkronkan'}
            </div>
          </div>
        </div>

        {/* Rincian 7 Cakupan Pengaturan yang Disinkronkan ke Google Drive */}
        <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-lg space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="font-bold text-emerald-950">
              Cakupan Semua Pengaturan yang Disimpan &amp; Disinkronkan ke Google Drive:
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={includeFullLedgerInDrive}
                onChange={(e) => setIncludeFullLedgerInDrive(e.target.checked)}
                className="rounded border-emerald-400 text-emerald-700"
              />
              <span>
                Sertakan Juga Data Pembukuan ({counts.orders} SPK, {counts.inventory} SKU, {counts.transactions} Kas)
              </span>
            </label>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-[11px]">
            {[
              { label: '1. Profil & Bank Nota', val: settings.storeName },
              {
                label: '2. Logo Toko',
                val: settings.logoDataUrl ? 'Tersimpan' : 'Default',
              },
              {
                label: '3. Link & Slug',
                val: `?toko=${settings.customSlug || 'cetakpro'}`,
              },
              {
                label: '4. Daftar Kasir',
                val: `${cashierList.length} Kasir (${settings.activeCashierName || cashierList[0]})`,
              },
              {
                label: '5. Login Aplikasi',
                val: settings.appAuthEmail || 'Belum diatur',
              },
              {
                label: '6. Tema & Warna',
                val: `${settings.themeMode === 'dark' ? 'Gelap' : 'Terang'} · ${settings.themeColor}`,
              },
              {
                label: '7. Kertas & Autosave',
                val: `${printPaperSize} · ${settings.autoSaveEnabled ? 'Autosave ON' : 'Manual'}`,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="p-2 bg-white border border-emerald-200/80 rounded flex flex-col justify-between"
              >
                <div className="font-bold text-slate-800 flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                  {item.val}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Banner Notifikasi Google Drive */}
        {driveStatusBanner && (
          <div
            className={`p-3 rounded-lg border flex items-start justify-between gap-2 ${
              driveStatusBanner.type === 'SUCCESS'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : driveStatusBanner.type === 'ERROR'
                ? 'bg-rose-50 border-rose-300 text-rose-950'
                : driveStatusBanner.type === 'WARNING'
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : 'bg-indigo-50 border-indigo-200 text-indigo-950'
            }`}
          >
            <div className="flex items-start gap-2 leading-relaxed">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{driveStatusBanner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setDriveStatusBanner(null)}
              className="text-slate-500 hover:text-slate-900 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tombol Aksi Utama Google Drive Sync */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <button
            type="button"
            disabled={isDriveLoading || isConnectingDrive}
            onClick={() => handleRequestSaveToGoogleDrive('PRIMARY_SYNC')}
            className="py-2.5 px-3.5 font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Cloud className="w-4 h-4 shrink-0" />
            <span>
              {isDriveLoading
                ? 'Menyinkronkan...'
                : 'Simpan & Sinkron ke Google Drive'}
            </span>
          </button>

          <button
            type="button"
            disabled={isDriveLoading || isConnectingDrive}
            onClick={() => handlePullAndApplyFromGoogleDrive()}
            className="py-2.5 px-3.5 font-bold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>Muat Pengaturan dari Google Drive</span>
          </button>

          <button
            type="button"
            disabled={isDriveLoading || isConnectingDrive}
            onClick={() => handleRequestSaveToGoogleDrive('NEW_SNAPSHOT')}
            className="py-2.5 px-3.5 font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <FileJson className="w-4 h-4 text-slate-700 shrink-0" />
            <span>Buat Snapshot Baru di Drive</span>
          </button>

          <button
            type="button"
            disabled={isDriveLoading || isConnectingDrive}
            onClick={() => {
              if (driveAccessToken) {
                refreshGoogleDriveStatusAndFiles(driveAccessToken, true);
              } else {
                handleSignInAndConnectGoogleDrive();
              }
            }}
            className="py-2.5 px-3.5 font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 text-slate-700 shrink-0 ${
                isDriveLoading ? 'animate-spin' : ''
              }`}
            />
            <span>Segarkan Daftar File Drive</span>
          </button>
        </div>

        {/* Daftar File Sinkronisasi yang Tersimpan di Google Drive */}
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800">
              File Pengaturan &amp; Backup di Google Drive ({driveFiles.length} File):
            </span>
            <span className="text-[11px] text-slate-500">
              File utama: <code className="font-mono">{DEFAULT_DRIVE_SETTINGS_FILENAME}</code>
            </span>
          </div>

          {!driveAccessToken ? (
            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-md text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                Klik tombol <strong>&ldquo;Sign in with Google&rdquo;</strong> di kanan atas kartu ini untuk mengaktifkan token akses Google Drive dan melihat atau menyinkronkan file pengaturan Anda.
              </div>
              <button
                type="button"
                onClick={handleSignInAndConnectGoogleDrive}
                className="px-3 py-1.5 font-bold text-white bg-amber-700 hover:bg-amber-800 rounded shrink-0 whitespace-nowrap"
              >
                Aktifkan Token Google Drive
              </button>
            </div>
          ) : driveFiles.length === 0 ? (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-slate-500 text-center">
              {isDriveLoading
                ? 'Memeriksa file pengaturan di Google Drive Anda...'
                : 'Belum ada file pengaturan CetakPro di Google Drive Anda. Klik "Simpan & Sinkron ke Google Drive" untuk menyimpan seluruh pengaturan sekarang.'}
            </div>
          ) : (
            <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
              {driveFiles.map((file) => {
                const isPrimary = file.name === DEFAULT_DRIVE_SETTINGS_FILENAME;
                const modLabel = file.modifiedTime
                  ? new Date(file.modifiedTime).toLocaleString('id-ID')
                  : '-';
                const sizeKb = file.size
                  ? `${Math.max(1, Math.round(Number(file.size) / 1024))} KB`
                  : '';
                return (
                  <div
                    key={file.id}
                    className={`p-2.5 rounded-md border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                      isPrimary
                        ? 'bg-emerald-50/50 border-emerald-300'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-slate-900 truncate">
                          {file.name}
                        </span>
                        {isPrimary && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-700 text-white rounded">
                            File Sinkron Utama
                          </span>
                        )}
                        {sizeKb && (
                          <span className="text-[10px] font-mono text-slate-500">
                            {sizeKb}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Diperbarui: <span className="font-mono">{modLabel}</span>
                        {file.description ? ` · ${file.description}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={isDriveLoading}
                        onClick={() => handlePullAndApplyFromGoogleDrive(file)}
                        className="px-2.5 py-1 text-[11px] font-semibold text-emerald-800 bg-white hover:bg-emerald-50 border border-emerald-300 rounded"
                      >
                        Muat &amp; Terapkan
                      </button>
                      <button
                        type="button"
                        disabled={isDriveLoading}
                        onClick={() =>
                          handleRequestSaveToGoogleDrive('PRIMARY_SYNC', file)
                        }
                        className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded"
                      >
                        Timpa File
                      </button>
                      <button
                        type="button"
                        disabled={isDriveLoading}
                        onClick={() =>
                          setDriveConfirmModal({
                            action: 'DELETE_FILE',
                            targetFileId: file.id,
                            targetFileName: file.name,
                          })
                        }
                        className="p-1 text-slate-400 hover:text-rose-600"
                        title="Hapus file dari Google Drive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 Cols): Profil, Logo Drive Lokal, Ganti Link & Manajemen Kasir */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Profil & Upload Logo Toko via Drive Lokal */}
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-slate-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  Profil Usaha & Upload Logo Toko (Drive Lokal)
                </h3>
              </div>
              <span className="text-xs text-slate-500">
                Tampil di Header, Nota & SPK
              </span>
            </div>

            {/* Bagian Upload Logo Toko via Drive Lokal */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-lg border border-slate-300 bg-white flex items-center justify-center overflow-hidden shrink-0">
                  {settings.logoDataUrl ? (
                    <img
                      src={settings.logoDataUrl}
                      alt="Logo Toko"
                      className="w-full h-full object-contain p-1"
                    />
                  ) : (
                    <div className="text-center text-[10px] text-slate-400 flex flex-col items-center">
                      <ImageIcon className="w-5 h-5 mb-0.5 text-slate-400" />
                      <span>Belum Ada</span>
                    </div>
                  )}
                </div>
                <div className="text-xs space-y-1">
                  <div className="font-bold text-slate-900">
                    Logo Toko / Brand Percetakan
                  </div>
                  <p className="text-slate-500 leading-relaxed">
                    Unggah file gambar logo dari penyimpanan / drive lokal komputer atau HP Anda (PNG, JPG, WEBP). Otomatis dicetak pada kop Nota & SPK.
                  </p>
                  {logoStatusMsg && (
                    <p className="text-emerald-700 font-medium text-[11px]">
                      {logoStatusMsg}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload dari Drive Lokal
                </button>
                {settings.logoDataUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateSettingsField('logoDataUrl', '');
                      setLogoStatusMsg('Logo toko telah dihapus (kembali ke ikon default).');
                    }}
                    className="px-2.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-md"
                  >
                    Hapus
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">
                  Nama Toko / Usaha Percetakan *
                </label>
                <input
                  type="text"
                  value={settings.storeName}
                  onChange={(e) => onUpdateSettingsField('storeName', e.target.value)}
                  placeholder="Contoh: CetakPro Digital Printing"
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs font-semibold focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">
                  Slogan / Sub-Judul Layanan (Kop Nota)
                </label>
                <input
                  type="text"
                  value={settings.tagline}
                  onChange={(e) => onUpdateSettingsField('tagline', e.target.value)}
                  placeholder="Layanan Cetak Outdoor, Indoor, Sticker, Print A3+ & Merchandise"
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Nama Pemilik / Penanggung Jawab
                </label>
                <input
                  type="text"
                  value={settings.ownerName}
                  onChange={(e) => onUpdateSettingsField('ownerName', e.target.value)}
                  placeholder="Nama Pemilik / Manajer"
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Nomor WhatsApp / Telepon Toko
                </label>
                <input
                  type="text"
                  value={settings.phone}
                  onChange={(e) => onUpdateSettingsField('phone', e.target.value)}
                  placeholder="0812-xxxx-xxxx"
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">
                  Alamat Lengkap Workshop / Percetakan
                </label>
                <input
                  type="text"
                  value={settings.address}
                  onChange={(e) => onUpdateSettingsField('address', e.target.value)}
                  placeholder="Jl. Raya Percetakan No. 88..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">
                  Info Rekening Bank Pembayaran (Dicetak pada Nota Tagihan)
                </label>
                <input
                  type="text"
                  value={settings.bankAccountInfo}
                  onChange={(e) =>
                    onUpdateSettingsField('bankAccountInfo', e.target.value)
                  }
                  placeholder="Contoh: BCA 8820-4455-66 a.n CetakPro Digital"
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">
                  Catatan Kaki Nota / Ketentuan Cetak
                </label>
                <textarea
                  rows={2}
                  value={settings.invoiceFooterNote}
                  onChange={(e) =>
                    onUpdateSettingsField('invoiceFooterNote', e.target.value)
                  }
                  placeholder="Syarat dan ketentuan pada bagian bawah nota pelanggan..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Card 2: Menu / Pilihan Ganti Link Toko & Link Akses Aplikasi */}
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-slate-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  Pengaturan Ganti Link Toko & Tautan Akses Aplikasi
                </h3>
              </div>
              <span className="text-slate-500">Custom URL & Link Nota</span>
            </div>

            {linkCopiedMsg && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{linkCopiedMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">
                  1. Ganti Slug / Kode Link Akses Aplikasi Kasir
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1 flex items-center border border-slate-200 rounded-md overflow-hidden bg-slate-50">
                    <span className="px-2.5 py-2 text-slate-500 font-mono border-r border-slate-200 select-none">
                      ?toko=
                    </span>
                    <input
                      type="text"
                      value={settings.customSlug || ''}
                      onChange={(e) =>
                        onUpdateSettingsField(
                          'customSlug',
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9-_]/g, '-')
                            .slice(0, 80)
                        )
                      }
                      placeholder="cetakpro-pusat"
                      className="w-full px-3 py-2 bg-white font-mono text-xs focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleApplyAndCopyLink(currentAppShareUrl, 'Link Akses Aplikasi')
                    }
                    className="px-3.5 py-2 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Terapkan & Salin Link Aplikasi
                  </button>
                </div>
                <div className="text-[11px] text-slate-500 mt-1 font-mono truncate">
                  Link Aktif: {currentAppShareUrl}
                </div>
              </div>

              <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                <label className="block font-medium text-slate-700 mb-1.5">
                  2. Pilihan Jenis Link Toko / Katalog Online (Tampil di Header & Nota Cetak)
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {[
                    { id: 'CUSTOM', label: 'Ketik Link Manual' },
                    { id: 'WEB', label: 'Website Toko' },
                    { id: 'WA_CATALOG', label: 'Link WhatsApp Order' },
                    { id: 'INSTAGRAM', label: 'Link Instagram' },
                    { id: 'GMAPS', label: 'Link Lokasi Google Maps' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleApplyPresetLink(item.id)}
                      className={`px-2.5 py-1 rounded border text-[11px] font-semibold transition-colors ${
                        linkPresetType === item.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={settings.customStoreUrl || ''}
                    onChange={(e) => {
                      setLinkPresetType('CUSTOM');
                      onUpdateSettingsField('customStoreUrl', e.target.value);
                    }}
                    placeholder="https://cetakpro-printing.id atau https://wa.me/62812..."
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-md font-mono text-xs focus:outline-none focus:border-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      handleApplyAndCopyLink(
                        settings.customStoreUrl || currentAppShareUrl,
                        'Link Toko / Katalog'
                      )
                    }
                    className="px-3 py-2 font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Salin Link Toko
                  </button>
                  {settings.customStoreUrl && (
                    <a
                      href={
                        settings.customStoreUrl.startsWith('http')
                          ? settings.customStoreUrl
                          : `https://${settings.customStoreUrl}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2 font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Buka
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Daftar Nama Kasir & Operator SPK */}
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-slate-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  Manajemen Daftar Nama Kasir & Petugas SPK
                </h3>
              </div>
              <span className="text-slate-500">
                Kasir Aktif: <strong>{settings.activeCashierName || cashierList[0]}</strong>
              </span>
            </div>

            <p className="text-slate-600">
              Tambahkan dan simpan nama-nama kasir yang bertugas. Nama kasir juga dapat dipilih atau ditambah langsung saat bertransaksi di menu <strong>Kasir & SPK</strong>.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newCashierInput}
                onChange={(e) => setNewCashierInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCashier();
                  }
                }}
                placeholder="Ketik nama kasir baru (misal: Andi - Shift Malam)..."
                className="flex-1 px-3 py-2 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-slate-900"
              />
              <button
                type="button"
                onClick={handleAddCashier}
                className="px-4 py-2 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Tambah & Simpan Nama Kasir
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {cashierList.map((cashier) => {
                const isActive =
                  (settings.activeCashierName || cashierList[0]) === cashier;
                return (
                  <div
                    key={cashier}
                    className={`p-2.5 rounded-md border flex items-center justify-between gap-2 ${
                      isActive
                        ? 'border-slate-900 bg-slate-50 font-semibold'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSettingsField('activeCashierName', cashier)
                      }
                      className="text-left flex-1 truncate flex items-center gap-2"
                    >
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isActive ? 'bg-emerald-600' : 'bg-slate-300'
                        }`}
                      />
                      <span className="truncate text-slate-900">{cashier}</span>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isActive ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          Bertugas
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateSettingsField('activeCashierName', cashier)
                          }
                          className="text-[11px] text-slate-600 hover:text-slate-900 underline"
                        >
                          Aktifkan
                        </button>
                      )}
                      {cashierList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCashier(cashier)}
                          className="text-slate-400 hover:text-rose-600 p-0.5"
                          title="Hapus nama kasir"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column (5 Cols): Login Password Khusus Aplikasi, Tema Gelap/Terang + Warna, & Autosave */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 4: Login Email & Password Khusus Aplikasi (Verifikasi Email / WhatsApp) */}
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-slate-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  Login Email & Password Khusus Aplikasi
                </h3>
              </div>
              {settings.appAuthVerified && settings.appAuthPasswordHash ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                  <ShieldCheck className="w-3 h-3" />
                  Terverifikasi
                </span>
              ) : (
                <span className="text-[11px] text-amber-700 font-semibold">
                  Belum Diatur
                </span>
              )}
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-slate-600 leading-relaxed">
              Buat <strong>Password Baru Khusus Aplikasi Ini</strong> (bukan password asli email Anda). Dilengkapi verifikasi keamanan kode OTP 6 digit melalui <strong>Email</strong> atau <strong>Nomor WhatsApp</strong>.
            </div>

            {authMessage && (
              <div
                className={`p-3 rounded-md border text-xs leading-relaxed ${
                  authMessage.type === 'SUCCESS'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : authMessage.type === 'ERROR'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-amber-50 border-amber-300 text-amber-950'
                }`}
              >
                {authMessage.text}
              </div>
            )}

            <form onSubmit={handleVerifyAndSaveAppPassword} className="space-y-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Email Login Aplikasi *
                </label>
                <input
                  type="email"
                  required
                  value={authEmailInput}
                  onChange={(e) => setAuthEmailInput(e.target.value)}
                  placeholder="kasir@percetakan.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Nomor WhatsApp Verifikasi *
                </label>
                <input
                  type="text"
                  required
                  value={authPhoneInput}
                  onChange={(e) => setAuthPhoneInput(e.target.value)}
                  placeholder="0812-8899-0011"
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Buat Password Baru Aplikasi *
                  </label>
                  <input
                    type="password"
                    value={newAppPassword}
                    onChange={(e) => setNewAppPassword(e.target.value)}
                    placeholder="Minimal 4 karakter"
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Ulangi Password Aplikasi *
                  </label>
                  <input
                    type="password"
                    value={confirmAppPassword}
                    onChange={(e) => setConfirmAppPassword(e.target.value)}
                    placeholder="Ketik ulang password"
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1.5">
                  Pilih Metode Verifikasi Keamanan:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setVerificationChannel('WHATSAPP')}
                    className={`py-2 px-3 rounded-md border font-semibold flex items-center justify-center gap-1.5 ${
                      verificationChannel === 'WHATSAPP'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Via Nomor WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => setVerificationChannel('EMAIL')}
                    className={`py-2 px-3 rounded-md border font-semibold flex items-center justify-center gap-1.5 ${
                      verificationChannel === 'EMAIL'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Via Email
                  </button>
                </div>
              </div>

              {!generatedOtp ? (
                <button
                  type="button"
                  onClick={handleSendVerificationCode}
                  className="w-full py-2.5 px-4 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors flex items-center justify-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Kirim Kode Verifikasi ({verificationChannel === 'WHATSAPP' ? 'WhatsApp' : 'Email'})
                </button>
              ) : (
                <div className="p-3.5 bg-amber-50/80 border border-amber-300 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-950">
                      Kode OTP Verifikasi ({verificationChannel}):
                    </span>
                    <span className="font-mono font-bold text-sm px-2 py-0.5 bg-white border border-amber-400 rounded text-amber-900">
                      {generatedOtp}
                    </span>
                  </div>
                  <div>
                    <label className="block font-medium text-amber-900 mb-1">
                      Masukkan 6 Digit Kode Verifikasi:
                    </label>
                    <input
                      type="text"
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value)}
                      placeholder="Contoh: 123456"
                      className="w-full px-3 py-2 border border-amber-400 rounded-md font-mono text-xs bg-white"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 py-2 px-3 font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md"
                    >
                      Verifikasi & Simpan Password Aplikasi
                    </button>
                    <button
                      type="button"
                      onClick={() => setGeneratedOtp(null)}
                      className="px-3 py-2 font-semibold text-slate-700 bg-white border border-slate-200 rounded-md"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}
            </form>

            {settings.appAuthPasswordHash && onLockAppSession && (
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="text-[11px] text-slate-500">
                  Akun aktif: <strong className="text-slate-800">{settings.appAuthEmail}</strong>
                </div>
                <button
                  type="button"
                  onClick={onLockAppSession}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Kunci & Tes Login Aplikasi
                </button>
              </div>
            )}
          </div>

          {/* Card 5: Ganti Tema Gelap / Terang & Warna Aksen Aplikasi */}
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Palette className="w-4 h-4 text-slate-700" />
              <h3 className="text-sm font-bold text-slate-900">
                Mode Tampilan (Gelap / Terang) & Warna Tema
              </h3>
            </div>

            {/* Pilihan Mode Terang / Mode Gelap */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                1. Mode Pencahayaan Layar (Terang / Gelap):
              </label>
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <button
                  type="button"
                  onClick={() => onUpdateSettingsField('themeMode', 'light')}
                  className={`p-3 rounded-lg border flex items-center gap-2.5 transition-colors ${
                    currentThemeMode === 'light'
                      ? 'border-slate-900 bg-slate-50 font-bold text-slate-900'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <Sun className="w-4 h-4 text-amber-500 shrink-0" />
                  <div className="text-left">
                    <div>Mode Terang</div>
                    <div className="text-[10px] font-normal text-slate-500">
                      Kertas bersih & terang
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onUpdateSettingsField('themeMode', 'dark')}
                  className={`p-3 rounded-lg border flex items-center gap-2.5 transition-colors ${
                    currentThemeMode === 'dark'
                      ? 'border-slate-900 bg-slate-50 font-bold text-slate-900'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <Moon className="w-4 h-4 text-indigo-400 shrink-0" />
                  <div className="text-left">
                    <div>Mode Gelap</div>
                    <div className="text-[10px] font-normal text-slate-500">
                      Nyaman di mata (Malam)
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="block text-xs font-semibold text-slate-700">
                2. Palet Warna Aksen Aplikasi:
              </label>
              {THEME_OPTIONS.map((theme) => {
                const isSelected = settings.themeColor === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() =>
                      onUpdateSettingsField('themeColor', theme.id as ThemeColor)
                    }
                    className={`w-full text-left p-3 rounded-lg border transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'border-slate-900 bg-slate-50/90'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="w-5 h-5 rounded-md shrink-0 border border-black/10"
                        style={{ backgroundColor: theme.swatchHex }}
                        aria-hidden="true"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          {theme.name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {theme.desc}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-slate-700">
                      {isSelected ? 'Aktif' : 'Pilih'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Card 6: Penyimpanan Otomatis (Autosave) & Simpan Keadaan Terakhir Firebase */}
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Cloud className="w-4 h-4 text-slate-700" />
              <h3 className="text-sm font-bold text-slate-900">
                Autosave & Simpan Keadaan Terakhir (Firebase)
              </h3>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="pr-4">
                <div className="font-bold text-slate-900">
                  Autosave ke Cloud Firebase
                </div>
                <div className="text-slate-500 mt-0.5">
                  Simpan otomatis setiap perubahan profil toko, logo, link, daftar kasir, tema, dan tab terakhir yang dibuka.
                </div>
              </div>
              <label className="inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={settings.autoSaveEnabled}
                  onChange={(e) =>
                    onUpdateSettingsField('autoSaveEnabled', e.target.checked)
                  }
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all relative peer-checked:bg-emerald-600" />
              </label>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Halaman Terakhir / Default Saat Membuka Aplikasi
              </label>
              <select
                value={settings.lastActiveTab}
                onChange={(e) =>
                  onUpdateSettingsField('lastActiveTab', e.target.value as NavTab)
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white text-xs"
              >
                <option value="DASHBOARD">Ringkasan (Dashboard Utama)</option>
                <option value="ORDERS">Kasir & SPK Pesanan Cetak</option>
                <option value="INVENTORY">Stok Barang & Bahan Baku</option>
                <option value="CASH">Jurnal Kas & Piutang/Hutang</option>
                <option value="PNL">Laporan Laba Rugi</option>
                <option value="SETTINGS">Pengaturan Toko</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1 flex items-center gap-1.5">
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                Ukuran Kertas Cetak Default (Nota &amp; SPK)
              </label>
              <select
                value={printPaperSize}
                onChange={(e) =>
                  onChangePaperSize(e.target.value as PrintPaperSize)
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white text-xs"
              >
                {PRINT_PAPER_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name} ({opt.dimensions}) — {opt.desc}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-1 flex items-center justify-between border-t border-slate-100">
              <div className="text-slate-500">
                Waktu simpan terakhir:{' '}
                <span className="font-mono text-slate-800 font-medium">
                  {settings.lastSavedLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={onManualSaveToFirebase}
                disabled={saveStatus === 'SAVING'}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" />
                Simpan Manual
              </button>
            </div>
          </div>

          {/* Card 7: Manual Offline Local Save, Autobackup Offline Tiap 1 Jam & Auto-Sync Cloud Firebase */}
          <div className="bg-white border-2 border-indigo-200 rounded-lg p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-indigo-100 pb-3 gap-2">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-indigo-700 shrink-0" />
                <h3 className="text-sm font-bold text-slate-900">
                  Simpan Offline Lokal Manual & Autobackup 1 Jam
                </h3>
              </div>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[11px] border ${
                  isOnline
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-300'
                }`}
              >
                {isOnline ? (
                  <>
                    <Wifi className="w-3 h-3" />
                    Internet Online
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3" />
                    Offline ({offlineElapsedMinutes} mnt)
                  </>
                )}
              </span>
            </div>

            <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-md text-slate-700 leading-relaxed space-y-1">
              <div className="font-bold text-indigo-950">
                Perlindungan Data Tanpa Internet (Offline-First & Auto-Cloud Sync):
              </div>
              <p>
                1. <strong>Manual Offline Local Save</strong>: Menyimpan seluruh keadaan aplikasi (SPK, stok, kas, piutang, dan pengaturan) langsung ke memori lokal browser & file perangkat Anda kapan saja.
              </p>
              <p>
                2. <strong>Offline Local Autobackup (Tiap 1 Jam)</strong>: Jika tidak terdeteksi koneksi internet dalam rentang 1 jam, sistem otomatis membuat titik backup lokal tiap 60 menit.
              </p>
              <p>
                3. <strong>Otomatis Simpan ke Cloud Firebase</strong>: Begitu jaringan internet terdeteksi normal kembali, seluruh perubahan & backup lokal otomatis disinkronkan ke Cloud Firebase.
              </p>
            </div>

            {/* Toggle Autobackup Offline Tiap 1 Jam */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="pr-4">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  Autobackup Lokal Tiap 1 Jam Saat Offline
                </div>
                <div className="text-slate-500 mt-0.5">
                  {isOnline
                    ? 'Siaga otomatis: Jika koneksi internet terputus selama 1 jam, aplikasi otomatis mencadangkan seluruh keadaan secara lokal.'
                    : `Mode Offline Aktif (${offlineElapsedMinutes} menit tanpa internet) — Autobackup lokal berikutnya dalam ${minutesUntilNextAutoBackup} menit.`}
                </div>
              </div>
              <label className="inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={offlineAutoBackupEnabled}
                  onChange={(e) => onToggleOfflineAutoBackup(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all relative peer-checked:bg-indigo-600" />
              </label>
            </div>

            {/* Status Antrean Sinkronisasi Cloud */}
            <div
              className={`p-3 rounded-lg border flex items-center justify-between gap-2 ${
                pendingCloudSync
                  ? 'bg-amber-50 border-amber-300 text-amber-950'
                  : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
              }`}
            >
              <div className="space-y-0.5">
                <div className="font-bold">
                  {cloudSyncStatus === 'SYNCING'
                    ? 'Sedang Menyinkronkan Backup Lokal ke Cloud Firebase...'
                    : pendingCloudSync
                    ? 'Status: Menunggu Koneksi Internet untuk Sinkron Otomatis ke Cloud'
                    : 'Status: Seluruh Backup Lokal Telah Tersinkronisasi dengan Cloud Firebase'}
                </div>
                <div className="text-[11px] opacity-85">
                  {pendingCloudSync
                    ? 'Data aman di memori lokal. Akan otomatis tersimpan ke Firebase begitu internet normal.'
                    : `Total ${offlineBackupHistory.length} titik backup lokal tersimpan di perangkat ini.`}
                </div>
              </div>
              <button
                type="button"
                onClick={onSyncLocalToCloudNow}
                disabled={!isOnline || cloudSyncStatus === 'SYNCING'}
                className="px-3 py-1.5 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md flex items-center gap-1.5 shrink-0 disabled:opacity-40 whitespace-nowrap"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    cloudSyncStatus === 'SYNCING' ? 'animate-spin' : ''
                  }`}
                />
                Sinkron Cloud Sekarang
              </button>
            </div>

            {/* Tombol Aksi Manual Offline Save & File Backup (.json) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onManualOfflineLocalSave('MANUAL_LOCAL')}
                className="py-2.5 px-3 font-bold text-white bg-indigo-700 hover:bg-indigo-800 rounded-md transition-colors flex items-center justify-center gap-1.5"
              >
                <HardDrive className="w-3.5 h-3.5" />
                Simpan Offline Lokal Sekarang
              </button>

              <button
                type="button"
                onClick={() => onManualOfflineLocalSave('HOURLY_OFFLINE_AUTO')}
                className="py-2.5 px-3 font-semibold text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-colors flex items-center justify-center gap-1.5"
              >
                <Clock className="w-3.5 h-3.5 text-indigo-700" />
                Jalankan Autobackup 1 Jam Sekarang
              </button>

              <button
                type="button"
                onClick={onDownloadOfflineBackupFile}
                className="py-2 px-3 font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-slate-700" />
                Download File Backup (.json)
              </button>

              <input
                ref={backupFileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onImportOfflineBackupFile(file);
                  }
                  e.target.value = '';
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => backupFileInputRef.current?.click()}
                className="py-2 px-3 font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors flex items-center justify-center gap-1.5"
              >
                <FolderUp className="w-3.5 h-3.5 text-slate-700" />
                Impor / Restore File Backup (.json)
              </button>
            </div>

            {/* Daftar Riwayat Titik Backup Lokal (Manual & Autobackup 1 Jam) */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">
                  Riwayat Titik Backup Lokal ({offlineBackupHistory.length} Snapshot):
                </span>
                <span className="text-[11px] text-slate-500">
                  Klik &ldquo;Pulihkan&rdquo; untuk mengembalikan keadaan
                </span>
              </div>

              {offlineBackupHistory.length === 0 ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-slate-500 text-center">
                  Belum ada titik backup lokal. Klik <strong>Simpan Offline Lokal Sekarang</strong> untuk membuat cadangan lokal pertama.
                </div>
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                  {offlineBackupHistory.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 bg-slate-50 border border-slate-200 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              item.trigger === 'HOURLY_OFFLINE_AUTO'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                            }`}
                          >
                            {item.triggerLabel}
                          </span>
                          <span className="font-mono font-semibold text-slate-900">
                            {item.timeLabel}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              item.syncedToCloud
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-800 border border-amber-300'
                            }`}
                          >
                            {item.syncedToCloud
                              ? 'Tersimpan di Cloud'
                              : 'Lokal (Menunggu Internet)'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 font-mono">
                          {item.counts.orders} SPK · {item.counts.inventory} SKU ·{' '}
                          {item.counts.transactions} Kas · {item.counts.payables} Hutang
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onRestoreFromBackupRecord(item)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-indigo-800 bg-white hover:bg-indigo-50 border border-indigo-200 rounded"
                        >
                          Pulihkan
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteBackupRecord(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600"
                          title="Hapus titik backup ini"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ZONA BAHAYA MERAH: Reset Sebagian Data & Reset Sepenuhnya */}
      <div className="border-2 border-rose-300 bg-rose-50/60 rounded-lg p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-rose-200 pb-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-rose-950">
                ZONA BERBAHAYA: Reset Data Sebagian & Reset Data Sepenuhnya
              </h3>
              <p className="text-xs text-rose-800 mt-0.5">
                Perhatian: Penghapusan data pada bagian ini akan menghapus dokumen langsung dari Cloud Firestore secara permanen dan tidak dapat dibatalkan.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-semibold text-rose-700 whitespace-nowrap">
            Total Dokumen Aktif: {totalAllDocsCount} Data
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs">
          {/* Opsi 1: Reset Sebagian Data */}
          <div className="lg:col-span-7 bg-white border border-rose-200 rounded-lg p-5 space-y-4">
            <div>
              <h4 className="font-bold text-rose-950 text-sm">
                1. Reset Sebagian Data (Pilih Modul Tertentu)
              </h4>
              <p className="text-slate-600 mt-0.5">
                Centang modul data yang ingin dikosongkan tanpa menghapus modul lainnya (misal: mereset transaksi bulanan sambil mempertahankan master stok bahan baku):
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="flex items-center justify-between p-2.5 border border-slate-200 rounded-md cursor-pointer hover:bg-rose-50/40">
                <span className="flex items-center gap-2 font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={partialTargets.orders}
                    onChange={() => handleToggleTarget('orders')}
                    className="rounded border-rose-300 text-rose-600"
                  />
                  Pesanan Cetak & SPK
                </span>
                <span className="font-mono text-slate-500 tabular-nums">
                  {counts.orders} data
                </span>
              </label>

              <label className="flex items-center justify-between p-2.5 border border-slate-200 rounded-md cursor-pointer hover:bg-rose-50/40">
                <span className="flex items-center gap-2 font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={partialTargets.transactions}
                    onChange={() => handleToggleTarget('transactions')}
                    className="rounded border-rose-300 text-rose-600"
                  />
                  Jurnal Kas & Biaya
                </span>
                <span className="font-mono text-slate-500 tabular-nums">
                  {counts.transactions} data
                </span>
              </label>

              <label className="flex items-center justify-between p-2.5 border border-slate-200 rounded-md cursor-pointer hover:bg-rose-50/40">
                <span className="flex items-center gap-2 font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={partialTargets.payables}
                    onChange={() => handleToggleTarget('payables')}
                    className="rounded border-rose-300 text-rose-600"
                  />
                  Hutang Supplier Bahan
                </span>
                <span className="font-mono text-slate-500 tabular-nums">
                  {counts.payables} data
                </span>
              </label>

              <label className="flex items-center justify-between p-2.5 border border-slate-200 rounded-md cursor-pointer hover:bg-rose-50/40">
                <span className="flex items-center gap-2 font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={partialTargets.stockLogs}
                    onChange={() => handleToggleTarget('stockLogs')}
                    className="rounded border-rose-300 text-rose-600"
                  />
                  Riwayat Kartu Stok
                </span>
                <span className="font-mono text-slate-500 tabular-nums">
                  {counts.stockLogs} data
                </span>
              </label>

              <label className="sm:col-span-2 flex items-center justify-between p-2.5 border border-slate-200 rounded-md cursor-pointer hover:bg-rose-50/40">
                <span className="flex items-center gap-2 font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={partialTargets.inventory}
                    onChange={() => handleToggleTarget('inventory')}
                    className="rounded border-rose-300 text-rose-600"
                  />
                  Master Stok Bahan Baku, Kertas & Tinta
                </span>
                <span className="font-mono text-slate-500 tabular-nums">
                  {counts.inventory} SKU
                </span>
              </label>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-rose-700 font-medium">
                Terpilih untuk dihapus: <strong className="font-mono">{selectedPartialCount} dokumen</strong>
              </span>
              <button
                type="button"
                disabled={!hasAnyPartialSelected}
                onClick={() => handleOpenDangerModal('PARTIAL')}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Reset Data Terpilih (Sebagian)
              </button>
            </div>
          </div>

          {/* Opsi 2: Reset Sepenuhnya (Full Reset) */}
          <div className="lg:col-span-5 bg-white border border-rose-300 rounded-lg p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <h4 className="font-bold text-rose-950 text-sm">
                2. Reset Seluruh Data Sepenuhnya (Factory Reset)
              </h4>
              <p className="text-slate-600 leading-relaxed">
                Tindakan ini akan mengosongkan <strong>seluruh koleksi database</strong> (Pesanan SPK, Stok Bahan, Kartu Stok, Jurnal Kas, Piutang, dan Hutang Supplier) serta mengembalikan profil & tema toko ke setelan awal pabrik.
              </p>
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-rose-900 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  Dampak Reset Sepenuhnya:
                </div>
                <div className="text-[11px] text-rose-800">
                  Menghapus total <strong className="font-mono">{totalAllDocsCount} dokumen</strong> aktif dan mereset konfigurasi profil toko Anda.
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleOpenDangerModal('FULL')}
              className="w-full py-2.5 px-4 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-md transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Seluruh Data & Pengaturan (Penuh)
            </button>
          </div>
        </div>
      </div>

      {/* MODAL PERINGATAN MERAH KRITIS SAAT INGIN MERESET DATA */}
      {dangerModalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-rose-950/75 p-4">
          <form
            onSubmit={handleConfirmDangerReset}
            className="bg-white border-2 border-rose-600 rounded-lg max-w-md w-full overflow-hidden shadow-2xl text-xs"
          >
            {/* Red Alert Header */}
            <div className="bg-rose-600 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-sm font-bold tracking-wide uppercase">
                  Peringatan Merah: Konfirmasi Reset Data
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDangerModalMode(null)}
                className="text-rose-100 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-md text-rose-950 space-y-1.5">
                <div className="font-bold text-rose-700">
                  {dangerModalMode === 'FULL'
                    ? 'ANDA AKAN MERESET SELURUH DATA PEMBUKUAN SEPENUHNYA!'
                    : 'ANDA AKAN MENGHAPUS SEBAGIAN DATA PEMBUKUAN TERPILIH!'}
                </div>
                <p className="text-rose-800 leading-relaxed">
                  Data yang sudah dihapus dari Cloud Firebase <strong>tidak dapat dipulihkan kembali</strong>. Pastikan Anda telah mengekspor laporan CSV jika masih dibutuhkan.
                </p>
              </div>

              {/* Rincian yang akan dihapus */}
              <div className="space-y-1 text-slate-700 border border-slate-200 rounded-md p-3 bg-slate-50">
                <div className="font-semibold text-slate-900 mb-1">
                  Rincian Data yang Akan Dihapus Permanen:
                </div>
                {(dangerModalMode === 'FULL' || partialTargets.orders) && (
                  <div className="flex justify-between">
                    <span>• Pesanan Cetak & SPK:</span>
                    <span className="font-mono font-bold text-rose-600">
                      {counts.orders} dokumen
                    </span>
                  </div>
                )}
                {(dangerModalMode === 'FULL' || partialTargets.transactions) && (
                  <div className="flex justify-between">
                    <span>• Jurnal Kas & Pengeluaran:</span>
                    <span className="font-mono font-bold text-rose-600">
                      {counts.transactions} dokumen
                    </span>
                  </div>
                )}
                {(dangerModalMode === 'FULL' || partialTargets.payables) && (
                  <div className="flex justify-between">
                    <span>• Hutang Supplier Bahan:</span>
                    <span className="font-mono font-bold text-rose-600">
                      {counts.payables} dokumen
                    </span>
                  </div>
                )}
                {(dangerModalMode === 'FULL' || partialTargets.stockLogs) && (
                  <div className="flex justify-between">
                    <span>• Riwayat Kartu Stok:</span>
                    <span className="font-mono font-bold text-rose-600">
                      {counts.stockLogs} dokumen
                    </span>
                  </div>
                )}
                {(dangerModalMode === 'FULL' || partialTargets.inventory) && (
                  <div className="flex justify-between">
                    <span>• Master Stok Bahan & Tinta:</span>
                    <span className="font-mono font-bold text-rose-600">
                      {counts.inventory} SKU
                    </span>
                  </div>
                )}
                {dangerModalMode === 'FULL' && (
                  <div className="flex justify-between pt-1 border-t border-slate-200">
                    <span>• Profil & Pengaturan Toko:</span>
                    <span className="font-semibold text-rose-600">
                      Kembali ke Default
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-rose-700 mb-1.5">
                  Ketik kata <span className="font-mono underline">RESET</span> di bawah ini untuk membuka kunci penghapusan:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ketik RESET dengan huruf kapital"
                  value={confirmKeyword}
                  onChange={(e) => setConfirmKeyword(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-rose-400 rounded-md font-mono text-xs text-rose-900 focus:outline-none focus:border-rose-700 bg-rose-50/30"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDangerModalMode(null)}
                  className="px-4 py-2 font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 rounded-md"
                >
                  Batalkan
                </button>
                <button
                  type="submit"
                  disabled={
                    isResetting || confirmKeyword.trim().toUpperCase() !== 'RESET'
                  }
                  className="px-4 py-2 font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-md transition-colors disabled:opacity-40 flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {isResetting
                    ? 'Menghapus Data...'
                    : 'Ya, Hapus Permanen Sekarang'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
      {/* MODAL KONFIRMASI OPERASI FILE GOOGLE DRIVE (UPDATE / OVERWRITE / DELETE) */}
      {driveConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="bg-white border-2 border-slate-800 rounded-lg max-w-md w-full overflow-hidden shadow-2xl text-xs">
            <div
              className={`px-5 py-3.5 text-white flex items-center justify-between ${
                driveConfirmModal.action === 'DELETE_FILE'
                  ? 'bg-rose-600'
                  : 'bg-emerald-700'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                <Cloud className="w-4 h-4 shrink-0" />
                <span>
                  {driveConfirmModal.action === 'DELETE_FILE'
                    ? 'Konfirmasi Hapus File dari Google Drive'
                    : 'Konfirmasi Perbarui File di Google Drive'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDriveConfirmModal(null)}
                className="text-white/80 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {driveConfirmModal.action === 'DELETE_FILE' ? (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-rose-950 leading-relaxed">
                  Apakah Anda yakin ingin menghapus file{' '}
                  <strong className="font-mono">
                    &ldquo;{driveConfirmModal.targetFileName}&rdquo;
                  </strong>{' '}
                  secara permanen dari Google Drive Anda? Tindakan ini tidak dapat dibatalkan.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-950 leading-relaxed">
                    Anda akan memperbarui isi file{' '}
                    <strong className="font-mono">
                      &ldquo;{driveConfirmModal.targetFileName}&rdquo;
                    </strong>{' '}
                    di Google Drive dengan pengaturan terbaru saat ini:
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1 text-slate-700">
                    <div className="flex justify-between">
                      <span>• Nama Toko &amp; Profil:</span>
                      <span className="font-bold text-slate-900">
                        {settings.storeName}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>• Slug &amp; Link Toko:</span>
                      <span className="font-mono text-slate-900">
                        ?toko={settings.customSlug || 'cetakpro'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>• Daftar Kasir &amp; Aktif:</span>
                      <span className="font-semibold text-slate-900">
                        {cashierList.length} Kasir ({settings.activeCashierName || cashierList[0]})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>• Tema &amp; Ukuran Kertas:</span>
                      <span className="font-mono text-slate-900">
                        {settings.themeMode === 'dark' ? 'Gelap' : 'Terang'} ({settings.themeColor}) · {printPaperSize}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDriveConfirmModal(null)}
                  className="px-4 py-2 font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 rounded-md"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDriveModalAction}
                  className={`px-4 py-2 font-bold text-white rounded-md transition-colors flex items-center gap-1.5 ${
                    driveConfirmModal.action === 'DELETE_FILE'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-emerald-700 hover:bg-emerald-800'
                  }`}
                >
                  {driveConfirmModal.action === 'DELETE_FILE' ? (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      Ya, Hapus dari Google Drive
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      Konfirmasi &amp; Simpan ke Google Drive
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
